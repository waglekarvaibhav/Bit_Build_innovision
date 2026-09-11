"""Customer and provider profile management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_role
from ..models import (
    ProviderProfile,
    ProviderService,
    Role,
    Service,
    User,
)
from ..schemas import (
    ProviderProfileUpdateIn,
    ProviderServiceOut,
    ProfileUpdateIn,
    ServiceIn,
    UserOut,
)

router = APIRouter(prefix="/api", tags=["profile"])


def _user_public(u: User) -> dict:
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "mobile_number": u.mobile_number,
        "role": u.role.value,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/customers/me", response_model=dict)
def customer_profile(user: User = Depends(require_role(Role.customer))):
    return _user_public(user)


@router.put("/customers/me")
def update_customer_profile(
    payload: ProfileUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.customer)),
):
    if payload.full_name:
        user.full_name = payload.full_name.strip()
    if payload.mobile_number is not None:
        dup = db.query(User).filter(User.mobile_number == payload.mobile_number, User.id != user.id).first()
        if dup:
            raise HTTPException(status_code=400, detail="Mobile number already in use")
        user.mobile_number = payload.mobile_number or None
    db.commit()
    db.refresh(user)
    return _user_public(user)


@router.get("/providers/me", response_model=dict)
def get_provider_profile(db: Session = Depends(get_db), user: User = Depends(require_role(Role.provider))):
    return _provider_profile_dict(db, user)


def _provider_profile_dict(db: Session, user: User) -> dict:
    prof = user.provider_profile
    if prof is None:
        raise HTTPException(status_code=404, detail="Provider profile not found")
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
        "user": _user_public(user),
        "profile": {
            "profile_id": prof.id,
            "profession": prof.profession,
            "bio": prof.bio,
            "locality": prof.locality,
            "experience_years": prof.experience_years,
            "available": prof.available,
            "profile_image": prof.profile_image,
        },
        "services": services,
    }


@router.put("/providers/me")
def update_provider_profile(
    payload: ProviderProfileUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    prof = user.provider_profile
    if prof is None:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(prof, field, value)
    db.commit()
    db.refresh(prof)
    return _provider_profile_dict(db, user)


@router.post("/providers/me/services", status_code=201)
def add_provider_service(
    payload: ServiceIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    prof = user.provider_profile
    svc = db.get(Service, payload.service_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    existing = db.query(ProviderService).filter(
        ProviderService.provider_profile_id == prof.id,
        ProviderService.service_id == payload.service_id,
    ).first()
    if existing:
        for field in ("hourly_rate", "daily_rate", "monthly_rate"):
            val = getattr(payload, field)
            if val is not None:
                setattr(existing, field, val)
        db.commit()
        return _ps_out(existing, payload.service_id)
    ps = ProviderService(
        provider_profile_id=prof.id,
        service_id=payload.service_id,
        hourly_rate=payload.hourly_rate,
        daily_rate=payload.daily_rate,
        monthly_rate=payload.monthly_rate,
    )
    db.add(ps)
    db.commit()
    return _ps_out(ps, payload.service_id)


def _ps_out(ps: ProviderService, service_id: int):
    from ..models import Service
    svc = Service
    return {
        "id": ps.id,
        "service_id": service_id,
        "service_name": ps.service.name,
        "hourly_rate": ps.hourly_rate,
        "daily_rate": ps.daily_rate,
        "monthly_rate": ps.monthly_rate,
    }


@router.delete("/providers/me/services/{provider_service_id}", status_code=204)
def delete_provider_service(
    provider_service_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    ps = db.get(ProviderService, provider_service_id)
    if ps is None or ps.provider_profile.user_id != user.id:
        raise HTTPException(status_code=404, detail="Provider service not found")
    db.delete(ps)
    db.commit()
    return None
