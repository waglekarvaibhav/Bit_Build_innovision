"""Pydantic schemas for CrewNest API."""
from __future__ import annotations

import enum
from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import BillingUnit, BookingStatus, PackageStatus, PackageType, Role


# ---------- Auth ----------
class RegisterCustomerIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    mobile_number: str | None = None


class RegisterProviderIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    mobile_number: str | None = None
    profession: str = Field(min_length=2, max_length=120)
    locality: str = Field(min_length=2, max_length=120)
    bio: str | None = None
    experience_years: int | None = Field(default=None, ge=0, le=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: Role
    full_name: str


class AvailabilityCheck(BaseModel):
    email: str
    email_available: bool
    mobile_number: str | None = None
    mobile_available: bool | None = None


# ---------- Users / profile ----------
class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    mobile_number: str | None
    role: Role
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileUpdateIn(BaseModel):
    full_name: str | None = None
    mobile_number: str | None = None


class ProviderProfileUpdateIn(BaseModel):
    profession: str | None = None
    bio: str | None = None
    locality: str | None = None
    experience_years: int | None = Field(default=None, ge=0, le=80)
    available: bool | None = None
    profile_image: str | None = None


# ---------- Services ----------
class ServiceIn(BaseModel):
    service_id: int
    hourly_rate: float | None = Field(default=None, ge=0)
    daily_rate: float | None = Field(default=None, ge=0)
    monthly_rate: float | None = Field(default=None, ge=0)


class ProviderServiceOut(BaseModel):
    id: int
    service_id: int
    service_name: str
    hourly_rate: float | None
    daily_rate: float | None
    monthly_rate: float | None

    model_config = {"from_attributes": True}


# ---------- Packages ----------
class PackageCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=2, max_length=3000)
    package_type: PackageType
    hourly_rate: float = Field(gt=0)
    status: PackageStatus = PackageStatus.published
    locality: str = Field(min_length=2, max_length=120)
    service_ids: list[int] = Field(min_length=1)
    member_ids: list[int] = []
    lead_member_id: int | None = None


class PackageUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None
    hourly_rate: float | None = Field(default=None, gt=0)
    status: PackageStatus | None = None
    locality: str | None = None
    service_ids: list[int] | None = None
    member_ids: list[int] | None = None
    lead_member_id: int | None = None


# ---------- Bookings ----------
class BookingCreateIn(BaseModel):
    service_id: int | None = None
    provider_id: int | None = None
    package_id: int | None = None
    item_description: str = Field(min_length=3, max_length=3000)
    address: str = Field(min_length=3, max_length=1000)
    booking_date: date
    booking_time: str
    duration_hours: float = Field(default=1, ge=0.5, le=8760)
    billing_unit: BillingUnit = BillingUnit.hourly

    @field_validator("booking_time")
    @classmethod
    def validate_time(cls, v: str) -> str:
        try:
            _, _ = (int(p) for p in v.split(":"))
        except (ValueError, AttributeError):
            raise ValueError("booking_time must be HH:MM")
        return v


class BookingStatusUpdateIn(BaseModel):
    status: BookingStatus


class CompletionRequestIn(BaseModel):
    note: str | None = None


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


# ---------- Contact / navigation tokens (client-side only, no stored secret) ----------
class BookingContactOut(BaseModel):
    provider_phone: str | None
    lead_phone: str | None
    address: str
    locality: str | None = None
