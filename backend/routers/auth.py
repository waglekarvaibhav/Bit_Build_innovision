"""Authentication: register (customer/provider), login, availability check."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_role
from ..models import ProviderProfile, Role, User
from ..schemas import (
    AvailabilityCheck,
    LoginIn,
    RegisterCustomerIn,
    RegisterProviderIn,
    TokenResponse,
)
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _email_available(db: Session, email: str) -> bool:
    return db.query(User).filter(User.email.ilike(email)).first() is None


def _mobile_available(db: Session, mobile: str | None) -> bool:
    if not mobile:
        return True
    return db.query(User).filter(User.mobile_number == mobile).first() is None


def _token_for(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        user_id=user.id,
        role=user.role,
        full_name=user.full_name,
    )


@router.get("/register/availability", response_model=AvailabilityCheck)
def check_availability(email: str, mobile_number: str | None = None, db: Session = Depends(get_db)):
    return AvailabilityCheck(
        email=email,
        email_available=_email_available(db, email),
        mobile_number=mobile_number,
        mobile_available=_mobile_available(db, mobile_number),
    )


@router.post("/register/customer", response_model=TokenResponse, status_code=201)
def register_customer(payload: RegisterCustomerIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not _email_available(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if not _mobile_available(db, payload.mobile_number):
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        mobile_number=payload.mobile_number,
        password_hash=hash_password(payload.password),
        role=Role.customer,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_for(user)


@router.post("/register/provider", response_model=TokenResponse, status_code=201)
def register_provider(payload: RegisterProviderIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not _email_available(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if not _mobile_available(db, payload.mobile_number):
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        mobile_number=payload.mobile_number,
        password_hash=hash_password(payload.password),
        role=Role.provider,
    )
    db.add(user)
    db.flush()
    db.add(
        ProviderProfile(
            user_id=user.id,
            profession=payload.profession.strip(),
            locality=payload.locality.strip(),
            bio=payload.bio,
            experience_years=payload.experience_years,
        )
    )
    db.commit()
    db.refresh(user)
    return _token_for(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(or_(User.email.ilike(email), User.mobile_number == email)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    return _token_for(user)


@router.get("/me", response_model=dict)
def me(user: User = Depends(require_role(Role.customer, Role.provider))):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "mobile_number": user.mobile_number,
        "role": user.role.value,
    }
