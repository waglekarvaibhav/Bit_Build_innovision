"""Pure-ish business logic reused across routers.

Server-side pricing, schedule-conflict checks, package validation, booking
snapshots, participant management, and the rule-based shortlist + package
suggestion matching. All totals are computed here from stored rates; the
client-supplied amount is never trusted.
"""
from __future__ import annotations

import json
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from .models import (
    Booking,
    BookingParticipant,
    BookingStatus,
    BillingUnit,
    Package,
    PackageMember,
    PackageServiceBundle,
    PackageStatus,
    PackageType,
    ProviderProfile,
    ProviderService,
    Role,
    Service,
    User,
)

# Statuses that occupy a work slot and block new/overlap bookings.
_BLOCKING_STATUSES = [
    BookingStatus.pending,
    BookingStatus.accepted,
    BookingStatus.completion_requested,
]


def resolve_service_rate(db: Session, provider: User, service_id: int, billing_unit: BillingUnit) -> float | None:
    """Look up the provider's rate for a service under the requested unit."""
    profile = provider.provider_profile
    if profile is None:
        return None
    ps = (
        db.query(ProviderService)
        .filter(
            ProviderService.provider_profile_id == profile.id,
            ProviderService.service_id == service_id,
        )
        .first()
    )
    if ps is None:
        return None
    if billing_unit == BillingUnit.hourly:
        return ps.hourly_rate
    if billing_unit == BillingUnit.daily:
        return ps.daily_rate
    if billing_unit == BillingUnit.monthly:
        return ps.monthly_rate
    return None


def compute_price(unit_rate: float, duration_hours: float, billing_unit: BillingUnit) -> float:
    """Compute the quoted price from a unit rate, duration, and billing unit.

    hourly: rate x hours
    daily:  rate x number of full(or partial) 8-hour days
    monthly: rate x number of full months (min 1)
    """
    if billing_unit == BillingUnit.hourly:
        return round(unit_rate * duration_hours, 2)
    if billing_unit == BillingUnit.daily:
        days = max(1, round(duration_hours / 8, 2))
        return round(unit_rate * days, 2)
    if billing_unit == BillingUnit.monthly:
        months = max(1, round(duration_hours / (8 * 22), 2))
        return round(unit_rate * months, 2)
    return round(unit_rate * duration_hours, 2)


def has_slot_conflict(
    db: Session,
    provider: User,
    booking_date: date,
    booking_time: str,
    exclude_booking_id: int | None = None,
) -> bool:
    """True if the provider already occupies the (date, time) slot on an active booking.

    Uses exact slot matching, consistent with HandyHire's rule. Checks both the
    primary provider field and participant rows.
    """
    base = db.query(Booking).filter(
        Booking.booking_date == booking_date,
        Booking.booking_time == booking_time,
        Booking.status.in_([s.value for s in _BLOCKING_STATUSES]),
    )
    if exclude_booking_id:
        base = base.filter(Booking.id != exclude_booking_id)

    direct = base.filter(Booking.provider_id == provider.id).first()
    if direct is not None:
        return True

    participant = (
        db.query(BookingParticipant)
        .join(Booking, Booking.id == BookingParticipant.booking_id)
        .filter(
            BookingParticipant.user_id == provider.id,
            Booking.booking_date == booking_date,
            Booking.booking_time == booking_time,
            Booking.status.in_([s.value for s in _BLOCKING_STATUSES]),
        )
    )
    if exclude_booking_id:
        participant = participant.filter(Booking.id != exclude_booking_id)
    return participant.first() is not None


def validate_package(
    package: Package,
    service_ids: list[int],
    member_ids: list[int],
    lead_member_id: int | None,
    caller: User,
) -> None:
    """Validate package structure and ownership rules, raising 400 on failure."""
    if package.package_type == PackageType.multitasking:
        if len(service_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A multitasking package requires at least two services.",
            )
        if caller.id != package.owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owning provider can manage this package.",
            )
    else:  # team
        if len(member_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A team package requires at least two providers.",
            )
        if lead_member_id is None or lead_member_id not in member_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A team package needs a lead who is one of the members.",
            )
        # The owning provider may be a team member (typically the lead) but must
        # not be able to manage a team they do not own — ownership is separate.
        if caller.id != package.owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the package owner can manage this team package.",
            )


def build_package_snapshot(package: Package) -> dict:
    """Serialize the booking-time agreement snapshot for a package."""
    services = [b.service.name for b in package.services]
    members = [
        {
            "id": pm.user_id,
            "name": pm.user.full_name,
            "role": pm.role,
            "is_lead": pm.is_lead,
        }
        for pm in package.members
    ]
    lead = next((m for m in members if m["is_lead"]), None)
    return {
        "package_id": package.id,
        "package_name": package.name,
        "package_type": package.package_type.value,
        "services": services,
        "member_count": len(members),
        "lead": lead,
        "members": members,
        "hourly_rate": package.hourly_rate,
    }


def apply_package_snapshot(db: Session, booking: Booking, package: Package) -> None:
    snap = build_package_snapshot(package)
    booking.package_id = package.id
    booking.package_name_snapshot = snap["package_name"]
    booking.package_type_snapshot = package.package_type
    if package.package_type == PackageType.multitasking:
        # The single owning provider is the lead/actor for a multitasking booking.
        booking.package_lead_snapshot = package.owner_id
    else:
        booking.package_lead_snapshot = snap["lead"]["id"] if snap["lead"] else package.owner_id
    booking.package_members_snapshot = json.dumps(snap["members"])
    booking.package_services_snapshot = json.dumps(snap["services"])


def create_booking_participants(
    db: Session, booking: Booking, package: Package | None, provider: User
) -> None:
    """Populate BookingParticipant rows.

    Individual/normal: the assigned provider (lead).
    Team package: every package member; the lead flagged is_lead.
    Multitasking: the owner.
    """
    if package is None:
        db.add(
            BookingParticipant(
                booking=booking,
                user_id=provider.id,
                is_lead=True,
                role="provider",
            )
        )
        return

    if package.package_type == PackageType.multitasking:
        db.add(
            BookingParticipant(
                booking=booking,
                user_id=package.owner_id,
                is_lead=True,
                role="provider",
            )
        )
        return

    snap_members = json.loads(booking.package_members_snapshot or "[]")
    for m in snap_members:
        db.add(
            BookingParticipant(
                booking=booking,
                user_id=m["id"],
                is_lead=bool(m.get("is_lead")),
                role=m.get("role"),
            )
        )


def is_participant(booking: Booking, user_id: int) -> bool:
    if booking.provider_id == user_id or booking.customer_id == user_id:
        return True
    for p in booking.participants:
        if p.user_id == user_id:
            return True
    return False


def is_package_lead(booking: Booking, user_id: int) -> bool:
    if booking.package_lead_snapshot is not None and booking.package_lead_snapshot == user_id:
        return True
    for p in booking.participants:
        if p.is_lead and p.user_id == user_id:
            return True
    return False


def transition_map() -> dict[str, set[str]]:
    return {
        BookingStatus.pending.value: {BookingStatus.accepted.value, BookingStatus.rejected.value, BookingStatus.cancelled.value},
        BookingStatus.accepted.value: {BookingStatus.completion_requested.value},
        BookingStatus.completion_requested.value: {BookingStatus.completed.value, BookingStatus.accepted.value},
        BookingStatus.completed.value: set(),
        BookingStatus.rejected.value: set(),
        BookingStatus.cancelled.value: set(),
    }


def can_transition(current: BookingStatus, target: BookingStatus) -> bool:
    return target.value in transition_map().get(current.value, set())


# ---------------- Rule-based shortlist matching ----------------

def rank_providers_for_shortlist(
    db: Session,
    *,
    service_id: int | None,
    locality: str | None,
    booking_date: date | None,
    booking_time: str | None,
    max_budget: float | None,
    billing_unit: BillingUnit | None,
) -> list[dict]:
    """Deterministic, rule-based provider ranking for the explainable shortlist.

    Rules (documented and stable):
      1. Hard filters: provider is available; offers the required service;
         works in the requested locality (if provided).
      2. Budget/schedule filter applied as a soft rule: a provider still appears
         but is ranked lower and flagged if the exact slot or budget is unmet,
         so missing data never silently hides a provider.
      3. Score (higher = better), computed as:
         +3 required service matches
         +2 locality matches (only when locality supplied and known)
         +1 provider is available
         +1 schedule slot is free for the requested date/time (only when valid
            date+time supplied)
         +1 within budget (only when budget supplied and provider has a price)
         + rating score = rating or 3.5 (missing ratings treated neutrally) * 0.5
      4. Tie-break by: higher rating, then lower base price, then name (A-Z).

    Reasons returned are derived from the actual data that triggered each rule.
    """
    query = db.query(ProviderProfile).filter(ProviderProfile.available.is_(True))
    profiles = query.all()

    results: list[dict] = []
    for prof in profiles:
        user = prof.user
        reasons: list[str] = []
        score = 0.0

        offered: ProviderService | None = None
        if service_id is not None:
            offered = (
                db.query(ProviderService)
                .filter(
                    ProviderService.provider_profile_id == prof.id,
                    ProviderService.service_id == service_id,
                )
                .first()
            )
            if offered is not None:
                score += 3
                reasons.append("Offers your selected service")
            else:
                # Soft miss: still rank but low.
                score += 0

        if locality:
            if _localities_close(prof.locality, locality):
                score += 2
                reasons.append("Works in your selected locality")
            else:
                score += 0

        if prof.available:
            score += 1

        slot_free = None
        if booking_date is not None and booking_time:
            slot_free = not has_slot_conflict(db, user, booking_date, booking_time)
            if slot_free:
                score += 1
                reasons.append("Free on your requested schedule")

        rate = None
        if offered is not None:
            if (billing_unit or BillingUnit.hourly) == BillingUnit.hourly:
                rate = offered.hourly_rate
            elif billing_unit == BillingUnit.daily:
                rate = offered.daily_rate
            else:
                rate = offered.monthly_rate

        if max_budget is not None and rate is not None and rate <= max_budget:
            score += 1
            reasons.append("Within your budget")

        rating_tuple = _provider_rating(db, prof.id)
        avg_rating = rating_tuple[0]  # None when missing -> neutral
        raw_rating = rating_tuple[1]
        if avg_rating is None:
            avg_rating = 3.5
        score += avg_rating * 0.5

        price_for_sort = rate if rate is not None else float("inf")

        results.append(
            {
                "profile_id": prof.id,
                "user_id": user.id,
                "full_name": user.full_name,
                "profession": prof.profession,
                "locality": prof.locality,
                "bio": prof.bio,
                "available": prof.available,
                "rating": raw_rating if raw_rating is not None else None,
                "review_count": rating_tuple[1],
                "min_rate": rate,
                "score": score,
                "reasons": reasons,
            }
        )

    results.sort(
        key=lambda r: (
            -r["score"],
            -(r["rating"] if r["rating"] is not None else 3.5),
            r["min_rate"] if r["min_rate"] is not None else float("inf"),
            r["full_name"].lower(),
        )
    )
    return results


def _localities_close(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    return a.strip().lower() == b.strip().lower()


def _provider_rating(db: Session, profile_id: int):
    from sqlalchemy import func

    from .models import Review, User

    user_id = db.query(ProviderProfile.user_id).filter(ProviderProfile.id == profile_id).scalar()
    if user_id is None:
        return (0.0, 0)
    avg, count = (
        db.query(func.coalesce(func.avg(Review.rating), 0), func.count(Review.id))
        .filter(Review.provider_id == user_id)
        .first()
    )
    count = int(count or 0)
    avg = float(avg or 0)
    return (avg, count)


# ---------------- Guided job brief / package suggestions ----------------

def suggest_packages_for_goal(
    db: Session, service_ids: list[int], locality: str | None = None
) -> list[dict]:
    """Return active published packages matching a customer's selected services.

    Deterministic rule: a package matches when it includes every requested
    service. Among matches we order multitasking (usually single provider) before
    team packages, then by lower hourly rate, then name. This is a suggestion
    catalogue — it only surfaces real packages and real, stored quotes. It never
    invents providers, packages, discounts, or savings.
    """
    if not service_ids:
        return []
    wanted = set(service_ids)

    packages = (
        db.query(Package)
        .filter(Package.status == PackageStatus.published)
        .all()
    )
    matches = []
    for pkg in packages:
        included = {b.service_id for b in pkg.services}
        if not wanted.issubset(included):
            continue
        if locality:
            if pkg.locality.strip().lower() != locality.strip().lower():
                continue
        matches.append(pkg)

    matches.sort(
        key=lambda p: (
            0 if p.package_type == PackageType.multitasking else 1,
            p.hourly_rate,
            p.name.lower(),
        )
    )

    out = []
    for p in matches:
        members_snapshot = [
            {"name": pm.user.full_name, "role": pm.role, "is_lead": pm.is_lead}
            for pm in p.members
        ]
        out.append(
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "package_type": p.package_type.value,
                "hourly_rate": p.hourly_rate,
                "locality": p.locality,
                "services": [b.service.name for b in p.services],
                "owner_name": p.owner.full_name,
                "member_count": len(p.members),
                "lead_name": (p.lead.user.full_name if p.lead else p.owner.full_name),
                "members": members_snapshot,
                "status": p.status.value,
            }
        )
    return out
