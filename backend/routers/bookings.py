"""Booking creation and the full lifecycle.

States: pending -> accepted -> completion_requested -> completed.
Provider rejection -> rejected. Customer rejection of a completion request
returns the booking to accepted. Customer may cancel their own pending request.

Server-side price calculation, participant checks, schedule-conflict validation,
and authorization are enforced here for every transition.
"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_role
from ..models import (
    Booking,
    BookingParticipant,
    BookingStatus,
    BillingUnit,
    Package,
    PackageStatus,
    PackageType,
    Role,
    User,
)
from ..schemas import (
    BookingContactOut,
    BookingCreateIn,
    ReviewIn,
)
from ..services import (
    apply_package_snapshot,
    can_transition,
    compute_price,
    create_booking_participants,
    has_slot_conflict,
    is_package_lead,
    is_participant,
    resolve_service_rate,
)

router = APIRouter(prefix="/api", tags=["bookings"])


def _serialize_booking(db: Session, b: Booking) -> dict:
    members = []
    if b.package_members_snapshot:
        members = json.loads(b.package_members_snapshot)
    services = []
    if b.package_services_snapshot:
        services = json.loads(b.package_services_snapshot)
    lead_id = b.package_lead_snapshot
    lead_name = None
    if lead_id is not None:
        lead = db.get(User, lead_id)
        lead_name = lead.full_name if lead else None
    return {
        "id": b.id,
        "customer_id": b.customer_id,
        "customer_name": b.customer.full_name,
        "provider_id": b.provider_id,
        "provider_name": b.provider.full_name,
        "package_id": b.package_id,
        "service_id": b.service_id,
        "service_name": b.service.name if b.service else None,
        "item_description": b.item_description,
        "address": b.address,
        "booking_date": b.booking_date.isoformat(),
        "booking_time": b.booking_time,
        "duration_hours": b.duration_hours,
        "billing_unit": b.billing_unit.value,
        "quoted_price": b.quoted_price,
        "status": b.status.value,
        "created_at": b.created_at.isoformat(),
        "package_name_snapshot": b.package_name_snapshot,
        "package_type_snapshot": b.package_type_snapshot.value if b.package_type_snapshot else None,
        "package_lead_snapshot": lead_id,
        "package_lead_name": lead_name,
        "package_members_snapshot": members,
        "package_services_snapshot": services,
        "current_user_role": {
            "lead": is_package_lead(b, b.provider_id),
        },
    }


@router.post("/customers/bookings", response_model=dict, status_code=201)
def create_booking(
    payload: BookingCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.customer)),
):
    if payload.provider_id is None and payload.package_id is None:
        raise HTTPException(
            status_code=400, detail="Specify either a provider or a package to book"
        )

    booking = Booking(
        customer_id=user.id,
        item_description=payload.item_description,
        address=payload.address,
        booking_date=payload.booking_date,
        booking_time=payload.booking_time,
        duration_hours=payload.duration_hours,
        billing_unit=payload.billing_unit,
    )

    package = None
    if payload.package_id is not None:
        package = db.get(Package, payload.package_id)
        if package is None:
            raise HTTPException(status_code=404, detail="Package not found")
        if package.status == PackageStatus.archived:
            raise HTTPException(
                status_code=404,
                detail="Package is not currently available for booking",
            )
        if package.status == PackageStatus.draft:
            raise HTTPException(
                status_code=400, detail="Package is not published and cannot be booked"
            )
        if package.owner_id == user.id:
            raise HTTPException(status_code=400, detail="You cannot book your own package")

        booking.provider_id = package.owner_id
        booking.quoted_price = compute_price(
            package.hourly_rate, payload.duration_hours, payload.billing_unit
        )
        apply_package_snapshot(db, booking, package)

        participants = [package.owner_id]
        for pm in package.members:
            participants.append(pm.user_id)
        # Conflict check for every participating provider.
        for pid in set(participants):
            provider = db.get(User, pid)
            if has_slot_conflict(db, provider, payload.booking_date, payload.booking_time):
                raise HTTPException(
                    status_code=409,
                    detail="Requested time slot is already booked for a package provider",
                )
    else:
        provider = db.get(User, payload.provider_id)
        if provider is None or provider.role != Role.provider or provider.provider_profile is None:
            raise HTTPException(status_code=404, detail="Provider not found")
        if provider.id == user.id:
            raise HTTPException(status_code=400, detail="You cannot book yourself")
        if not provider.provider_profile.available:
            raise HTTPException(status_code=400, detail="Provider is not accepting bookings")
        if has_slot_conflict(db, provider, payload.booking_date, payload.booking_time):
            raise HTTPException(
                status_code=409, detail="Provider is already booked at that time"
            )

        booking.provider_id = provider.id
        if payload.service_id is not None:
            rate = resolve_service_rate(
                db, provider, payload.service_id, payload.billing_unit
            )
            if rate is None:
                raise HTTPException(
                    status_code=400,
                    detail="Provider does not offer that service or billing unit",
                )
            booking.service_id = payload.service_id
        else:
            rate = None
            for ps in provider.provider_profile.services:
                if payload.billing_unit == BillingUnit.hourly and ps.hourly_rate:
                    rate = ps.hourly_rate
                    booking.service_id = ps.service_id
                    break
                if payload.billing_unit == BillingUnit.daily and ps.daily_rate:
                    rate = ps.daily_rate
                    booking.service_id = ps.service_id
                    break
                if payload.billing_unit == BillingUnit.monthly and ps.monthly_rate:
                    rate = ps.monthly_rate
                    booking.service_id = ps.service_id
                    break
            if rate is None:
                raise HTTPException(
                    status_code=400,
                    detail="Provider does not support the selected billing unit",
                )
        booking.quoted_price = compute_price(rate, payload.duration_hours, payload.billing_unit)

    db.add(booking)
    db.flush()
    create_booking_participants(db, booking, package, db.get(User, booking.provider_id))
    db.commit()
    db.refresh(booking)
    return _serialize_booking(db, booking)


@router.get("/customers/bookings")
def customer_bookings(db: Session = Depends(get_db), user: User = Depends(require_role(Role.customer))):
    rows = db.query(Booking).filter(Booking.customer_id == user.id).order_by(Booking.created_at.desc()).all()
    return {"bookings": [_serialize_booking(db, b) for b in rows]}


@router.get("/providers/bookings")
def provider_bookings(db: Session = Depends(get_db), user: User = Depends(require_role(Role.provider))):
    participant_ids = {
        row.booking_id
        for row in db.query(BookingParticipant).filter(BookingParticipant.user_id == user.id).all()
    }
    rows = (
        db.query(Booking)
        .filter((Booking.provider_id == user.id) | (Booking.id.in_(participant_ids)))
        .order_by(Booking.created_at.desc())
        .all()
    )
    return {"bookings": [_serialize_booking(db, b) for b in rows]}


def _get_booking_or_404(db: Session, booking_id: int) -> Booking:
    b = db.get(Booking, booking_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


def _authorize(db: Session, booking: Booking, user: User, want_lead: bool = False) -> None:
    if booking.customer_id == user.id:
        return
    if is_participant(booking, user.id):
        if want_lead and not is_package_lead(booking, user.id):
            raise HTTPException(
                status_code=403, detail="Only the package lead can perform this action"
            )
        return
    raise HTTPException(status_code=403, detail="Not authorized for this booking")


@router.get("/bookings/{booking_id}")
def booking_detail(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    b = _get_booking_or_404(db, booking_id)
    _authorize(db, b, user, want_lead=False)
    return _serialize_booking(db, b)


@router.get("/bookings/{booking_id}/contact", response_model=BookingContactOut)
def booking_contact(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    b = _get_booking_or_404(db, booking_id)
    _authorize(db, b, user, want_lead=False)
    if b.customer_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Contact details are shared with the booking customer only",
        )
    lead_phone = None
    if b.package_lead_snapshot is not None:
        lead = db.get(User, b.package_lead_snapshot)
        lead_phone = lead.mobile_number if lead else None
    return BookingContactOut(
        provider_phone=b.provider.mobile_number,
        lead_phone=lead_phone,
        address=b.address,
        locality=b.provider.provider_profile.locality if b.provider.provider_profile else None,
    )


# -------- Provider-side transitions --------

@router.put("/bookings/{booking_id}/accept")
def accept_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    b = _get_booking_or_404(db, booking_id)
    _authorize(db, b, user, want_lead=True)
    if b.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending bookings can be accepted")
    if not can_transition(b.status, BookingStatus.accepted):
        raise HTTPException(status_code=409, detail="Invalid status transition")
    # Recheck availability + conflicts transaction-safely before accepting.
    participants = [p.user_id for p in b.participants] or [b.provider_id]
    for pid in participants:
        prov = db.get(User, pid)
        if not prov.provider_profile or not prov.provider_profile.available:
            raise HTTPException(
                status_code=409, detail="A participant is not currently available"
            )
        if has_slot_conflict(db, prov, b.booking_date, b.booking_time, exclude_booking_id=b.id):
            raise HTTPException(
                status_code=409, detail="A participant now has a scheduling conflict"
            )
    b.status = BookingStatus.accepted
    b.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return _serialize_booking(db, b)


@router.put("/bookings/{booking_id}/reject")
def reject_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    b = _get_booking_or_404(db, booking_id)
    _authorize(db, b, user, want_lead=True)
    if b.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending bookings can be rejected")
    b.status = BookingStatus.rejected
    b.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return _serialize_booking(db, b)


@router.put("/bookings/{booking_id}/request-completion")
def request_completion(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    b = _get_booking_or_404(db, booking_id)
    _authorize(db, b, user, want_lead=True)
    if b.status != BookingStatus.accepted:
        raise HTTPException(status_code=400, detail="Only accepted bookings can request completion")
    b.status = BookingStatus.completion_requested
    b.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return _serialize_booking(db, b)


# -------- Customer-side completion --------

@router.put("/bookings/{booking_id}/confirm-completion")
def confirm_completion(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.customer)),
):
    b = _get_booking_or_404(db, booking_id)
    if b.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the booking customer can confirm completion")
    if b.status != BookingStatus.completion_requested:
        raise HTTPException(status_code=400, detail="Only completion-requested bookings can be confirmed")
    b.status = BookingStatus.completed
    b.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return _serialize_booking(db, b)


@router.put("/bookings/{booking_id}/reject-completion")
def reject_completion(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.customer)),
):
    b = _get_booking_or_404(db, booking_id)
    if b.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the booking customer can reject completion")
    if b.status != BookingStatus.completion_requested:
        raise HTTPException(status_code=400, detail="Only completion-requested bookings can be rejected")
    b.status = BookingStatus.accepted
    b.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return _serialize_booking(db, b)


@router.put("/bookings/{booking_id}/cancel")
def cancel_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Customer cancels their own pending request."""
    b = _get_booking_or_404(db, booking_id)
    if b.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the requesting customer can cancel")
    if b.status != BookingStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled")
    b.status = BookingStatus.cancelled
    b.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(b)
    return _serialize_booking(db, b)


# -------- Reviews --------

@router.post("/bookings/{booking_id}/reviews", status_code=201)
def leave_review(
    booking_id: int,
    payload: ReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.customer)),
):
    from ..models import Review

    b = _get_booking_or_404(db, booking_id)
    if b.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the booking customer can review")
    if b.status != BookingStatus.completed:
        raise HTTPException(status_code=400, detail="Only completed bookings can be reviewed")
    existing = db.query(Review).filter(Review.booking_id == b.id).first()
    if existing is not None:
        raise HTTPException(status_code=400, detail="This booking has already been reviewed")
    review = Review(
        booking_id=b.id,
        customer_id=user.id,
        provider_id=b.provider_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return {
        "id": review.id,
        "booking_id": review.booking_id,
        "provider_id": review.provider_id,
        "rating": review.rating,
        "comment": review.comment,
        "created_at": review.created_at.isoformat(),
    }


@router.get("/providers/{provider_id}/reviews")
def provider_reviews(provider_id: int, db: Session = Depends(get_db)):
    from ..models import Review

    rows = (
        db.query(Review)
        .filter(Review.provider_id == provider_id)
        .order_by(Review.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "booking_id": r.booking_id,
            "rating": r.rating,
            "comment": r.comment,
            "created_at": r.created_at.isoformat(),
            "customer_name": r.customer.full_name,
        }
        for r in rows
    ]
