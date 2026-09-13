"""Public catalogue: service categories, providers, packages, localities.

Contact details and profile images are intentionally excluded from public
listings; phone numbers are only surfaced to authorized booking participants.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import (
    BillingUnit,
    GOA_LOCALITIES,
    Package,
    PackageMember,
    PackageServiceBundle,
    PackageStatus,
    PackageType,
    ProviderProfile,
    ProviderService,
    Review,
    Service,
    ServiceCategory,
    User,
)
from ..schemas import BillingUnit as BillingUnitEnum
from ..services import rank_providers_for_shortlist, suggest_packages_for_goal

router = APIRouter(prefix="/api", tags=["catalogue"])


def _profile_rating(db: Session, user_id: int):
    avg, count = (
        db.query(func.coalesce(func.avg(Review.rating), 0), func.count(Review.id))
        .filter(Review.provider_id == user_id)
        .first()
    )
    return float(avg or 0), int(count or 0)


def _public_provider(
    db: Session,
    prof: ProviderProfile,
    include_rates: bool = True,
    rating: tuple[float, int] | None = None,
) -> dict:
    user = prof.user
    avg, count = rating if rating is not None else _profile_rating(db, user.id)
    avg, count = float(avg or 0), int(count or 0)
    services = []
    for ps in prof.services:
        services.append(
            {
                "service_id": ps.service_id,
                "service_name": ps.service.name,
                "hourly_rate": ps.hourly_rate,
                "daily_rate": ps.daily_rate,
                "monthly_rate": ps.monthly_rate,
            }
        )
    return {
        "profile_id": prof.id,
        "user_id": user.id,
        "full_name": user.full_name,
        "profession": prof.profession,
        "bio": prof.bio,
        "locality": prof.locality,
        "experience_years": prof.experience_years,
        "available": prof.available,
        "rating": avg if count else None,
        "review_count": count,
        "services": services,
    }


@router.get("/localities")
def get_localities():
    return {"localities": GOA_LOCALITIES}


@router.get("/service-categories")
def get_service_categories(db: Session = Depends(get_db)):
    cats = (
        db.query(ServiceCategory)
        .options(selectinload(ServiceCategory.services))
        .order_by(ServiceCategory.name)
        .all()
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "services": [
                {"id": s.id, "name": s.name, "description": s.description}
                for s in sorted(c.services, key=lambda x: x.name)
            ],
        }
        for c in cats
    ]


@router.get("/services")
def list_services(db: Session = Depends(get_db)):
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "category_id": s.category_id,
            "category": s.category.name if s.category else None,
        }
        for s in (
            db.query(Service)
            .options(joinedload(Service.category))
            .order_by(Service.name)
            .all()
        )
    ]


@router.get("/providers")
def list_providers(
    db: Session = Depends(get_db),
    service_id: int | None = None,
    locality: str | None = None,
    available: bool | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_rating: float | None = None,
    sort: str = Query("rating", pattern="^(rating|price_asc|price_desc|name)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    q = db.query(ProviderProfile).options(
        joinedload(ProviderProfile.user),
        selectinload(ProviderProfile.services).joinedload(ProviderService.service),
    )
    if service_id is not None:
        q = q.join(ProviderService).filter(ProviderService.service_id == service_id)
    if locality:
        q = q.filter(ProviderProfile.locality.ilike(f"%{locality}%"))
    if available is not None:
        q = q.filter(ProviderProfile.available.is_(available))

    profiles = q.order_by(ProviderProfile.id).all()
    provider_ids = [prof.user_id for prof in profiles]
    rating_rows = (
        db.query(Review.provider_id, func.avg(Review.rating), func.count(Review.id))
        .filter(Review.provider_id.in_(provider_ids))
        .group_by(Review.provider_id)
        .all()
        if provider_ids
        else []
    )
    ratings = {provider_id: (avg, count) for provider_id, avg, count in rating_rows}

    rows = []
    for prof in profiles:
        row = _public_provider(db, prof, rating=ratings.get(prof.user_id, (0, 0)))
        if min_price is not None or max_price is not None:
            rates = [ps.hourly_rate for ps in prof.services if ps.hourly_rate is not None]
            if not rates:
                continue
            low = min(rates)
            if min_price is not None and low < min_price:
                continue
            if max_price is not None and low > max_price:
                continue
        if min_rating is not None:
            if row["review_count"] == 0:
                continue
            if row["rating"] < min_rating:
                continue
        rows.append(row)

    if sort == "price_asc":
        rows.sort(key=lambda r: r["services"][0]["hourly_rate"] if r["services"] and r["services"][0]["hourly_rate"] is not None else float("inf"))
    elif sort == "price_desc":
        rows.sort(key=lambda r: -(r["services"][0]["hourly_rate"] if r["services"] and r["services"][0]["hourly_rate"] is not None else float("inf")))
    elif sort == "name":
        rows.sort(key=lambda r: r["full_name"].lower())
    else:
        rows.sort(key=lambda r: -(r["rating"] if r["rating"] is not None else 0))

    return rows[offset : offset + limit]


@router.get("/providers/{provider_id}")
def get_provider(provider_id: int, db: Session = Depends(get_db)):
    # Public links use User.id (the same provider_id used by bookings/reviews).
    # ProviderProfile.id is an internal row id and is not guaranteed to match it.
    prof = (
        db.query(ProviderProfile)
        .options(
            joinedload(ProviderProfile.user),
            selectinload(ProviderProfile.services).joinedload(ProviderService.service),
        )
        .filter(ProviderProfile.user_id == provider_id)
        .first()
    )
    if prof is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return _public_provider(db, prof)


@router.get("/packages")
def list_packages(
    db: Session = Depends(get_db),
    package_type: PackageType | None = None,
    locality: str | None = None,
    include_archived: bool = False,
    limit: int = Query(100, ge=1, le=500),
):
    q = db.query(Package).options(*_package_load_options())
    if not include_archived:
        # Public/customer discovery must only expose packages that can actually
        # be booked. Drafts remain available through provider-management APIs.
        q = q.filter(Package.status == PackageStatus.published)
    if package_type is not None:
        q = q.filter(Package.package_type == package_type)
    if locality:
        q = q.filter(Package.locality.ilike(f"%{locality}%"))
    packages = q.order_by(Package.created_at.desc()).all()
    return [_package_dict(p) for p in packages][:limit]


@router.get("/packages/{package_id}")
def get_package(package_id: int, db: Session = Depends(get_db)):
    pkg = (
        db.query(Package)
        .options(*_package_load_options())
        .filter(Package.id == package_id)
        .first()
    )
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return _package_dict(pkg)


def _package_load_options():
    return (
        joinedload(Package.owner),
        selectinload(Package.services).joinedload(PackageServiceBundle.service),
        selectinload(Package.members).joinedload(PackageMember.user),
    )


def _package_dict(pkg: Package) -> dict:
    services = [b.service.name for b in pkg.services]
    lead = pkg.lead
    members = [
        {"user_id": pm.user_id, "name": pm.user.full_name, "role": pm.role, "is_lead": pm.is_lead}
        for pm in pkg.members
    ]
    return {
        "id": pkg.id,
        "name": pkg.name,
        "description": pkg.description,
        "package_type": pkg.package_type.value,
        "hourly_rate": pkg.hourly_rate,
        "status": pkg.status.value,
        "owner_id": pkg.owner_id,
        "owner_name": pkg.owner.full_name,
        "locality": pkg.locality,
        "services": services,
        "service_count": len(services),
        "member_count": len(members),
        "lead": {"user_id": lead.user_id, "name": lead.user.full_name} if lead else None,
        "members": members,
    }


@router.get("/shortlist")
def shortlist(
    service_id: int | None = None,
    locality: str | None = None,
    booking_date: str | None = None,
    booking_time: str | None = None,
    max_budget: float | None = None,
    billing_unit: str | None = None,
    db: Session = Depends(get_db),
):
    from datetime import date as _date

    parsed_date = None
    if booking_date:
        try:
            parsed_date = _date.fromisoformat(booking_date)
        except ValueError:
            pass
    bu = BillingUnit(billing_unit) if billing_unit in {e.value for e in BillingUnit} else BillingUnit.hourly
    rows = rank_providers_for_shortlist(
        db,
        service_id=service_id,
        locality=locality,
        booking_date=parsed_date,
        booking_time=booking_time,
        max_budget=max_budget,
        billing_unit=bu,
    )
    return rows


@router.get("/guides/suggest")
def suggest_packages(
    service_ids: str = "",
    locality: str | None = None,
    db: Session = Depends(get_db),
):
    """Guided job brief: suggest matching published packages for a goal."""
    ids = []
    for part in service_ids.split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    packages = suggest_packages_for_goal(db, ids, locality)
    return {
        "requested_service_ids": ids,
        "requested_locality": locality,
        "packages": packages,
    }
