"""CrewNest data model.

Distinct from HandyHire but preserves its product concept and business rules:
single-table users with role (customer / provider), individual bookings,
multitasking packages (one provider, 2+ services, package hourly rate),
and team packages (2+ providers, team hourly rate, lead). Server-side pricing
(rate x hours), schedule-conflict checks, and a booking-time snapshot keep
agreements immutable after a package is edited or archived.
"""
from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(str, enum.Enum):
    customer = "customer"
    provider = "provider"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    completion_requested = "completion_requested"
    completed = "completed"
    rejected = "rejected"
    cancelled = "cancelled"


class PackageType(str, enum.Enum):
    multitasking = "multitasking"
    team = "team"


class PackageStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class PhotoType(str, enum.Enum):
    before = "before"
    after = "after"


class BillingUnit(str, enum.Enum):
    hourly = "hourly"
    daily = "daily"
    monthly = "monthly"


def _utcnow() -> datetime:
    return datetime.utcnow()


# Standard set of Goan localities offered for editable selection.
GOA_LOCALITIES = [
    "Margao",
    "Panaji",
    "Ponda",
    "Vasco da Gama",
    "Mapusa",
    "Bicholim",
    "Curchorem",
    "Sanguem",
    "Quepem",
    "Canacona",
    "Salcete",
    "Bardez",
    "Tiswadi",
    "Mormugao",
]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    mobile_number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    provider_profile: Mapped["ProviderProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    customer_bookings: Mapped[list["Booking"]] = relationship(
        back_populates="customer", foreign_keys="Booking.customer_id"
    )
    provider_bookings: Mapped[list["Booking"]] = relationship(
        back_populates="provider", foreign_keys="Booking.provider_id"
    )
    owned_packages: Mapped[list["Package"]] = relationship(back_populates="owner")
    team_package_membership: Mapped[list["PackageMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    booking_participations: Mapped[list["BookingParticipant"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reviews_written: Mapped[list["Review"]] = relationship(
        back_populates="customer", foreign_keys="Review.customer_id"
    )
    reviews_received: Mapped[list["Review"]] = relationship(
        back_populates="provider", foreign_keys="Review.provider_id"
    )


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    profession: Mapped[str] = mapped_column(String(120), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    locality: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    experience_years: Mapped[int | None] = mapped_column(Integer)
    available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    profile_image: Mapped[str | None] = mapped_column(String(500))

    user: Mapped["User"] = relationship(back_populates="provider_profile")
    services: Mapped[list["ProviderService"]] = relationship(
        back_populates="provider_profile", cascade="all, delete-orphan"
    )


class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    services: Mapped[list["Service"]] = relationship(back_populates="category")


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("service_categories.id"))

    category: Mapped["ServiceCategory | None"] = relationship(back_populates="services")


class ProviderService(Base):
    """A supported service + billing units + rates offered by one provider.

    A provider can set an hourly, daily, and/or monthly rate for each service.
    """
    __tablename__ = "provider_services"
    __table_args__ = (
        UniqueConstraint("provider_profile_id", "service_id", name="uq_provider_service"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_profile_id: Mapped[int] = mapped_column(
        ForeignKey("provider_profiles.id"), nullable=False
    )
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)
    hourly_rate: Mapped[float | None] = mapped_column(Float)
    daily_rate: Mapped[float | None] = mapped_column(Float)
    monthly_rate: Mapped[float | None] = mapped_column(Float)

    provider_profile: Mapped["ProviderProfile"] = relationship(back_populates="services")
    service: Mapped["Service"] = relationship()


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    package_type: Mapped[PackageType] = mapped_column(Enum(PackageType), nullable=False)
    hourly_rate: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[PackageStatus] = mapped_column(
        Enum(PackageStatus), default=PackageStatus.published, nullable=False
    )
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    owner: Mapped["User"] = relationship(back_populates="owned_packages")
    services: Mapped[list["PackageServiceBundle"]] = relationship(
        back_populates="package", cascade="all, delete-orphan"
    )
    members: Mapped[list["PackageMember"]] = relationship(
        back_populates="package", cascade="all, delete-orphan"
    )

    @property
    def service_count(self) -> int:
        return len(self.services)

    @property
    def member_count(self) -> int:
        return len(self.members)

    @property
    def lead(self) -> "PackageMember | None":
        for m in self.members:
            if m.is_lead:
                return m
        return None


class PackageServiceBundle(Base):
    __tablename__ = "package_service_bundles"
    __table_args__ = (
        UniqueConstraint("package_id", "service_id", name="uq_package_service"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), nullable=False)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)

    package: Mapped["Package"] = relationship(back_populates="services")
    service: Mapped["Service"] = relationship()
    service_name: Mapped[str | None] = mapped_column(String(160))


class PackageMember(Base):
    __tablename__ = "package_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role: Mapped[str | None] = mapped_column(String(160))

    package: Mapped["Package"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="team_package_membership")

    @property
    def member_name(self) -> str:
        return self.user.full_name if self.user else "Unknown"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    package_id: Mapped[int | None] = mapped_column(ForeignKey("packages.id"))
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id"))

    # Work agreement
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    booking_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM
    duration_hours: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    billing_unit: Mapped[BillingUnit] = mapped_column(
        Enum(BillingUnit), default=BillingUnit.hourly, nullable=False
    )
    quoted_price: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus), default=BookingStatus.pending, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Booking-time snapshot (recorded at creation so later package edits don't
    # change an existing agreement)
    package_name_snapshot: Mapped[str | None] = mapped_column(String(160))
    package_type_snapshot: Mapped[PackageType | None] = mapped_column(
        Enum(PackageType)
    )
    package_lead_snapshot: Mapped[int | None] = mapped_column(Integer)
    package_members_snapshot: Mapped[Text | None] = mapped_column(Text)  # JSON list
    package_services_snapshot: Mapped[Text | None] = mapped_column(Text)  # JSON list

    customer: Mapped["User"] = relationship(
        back_populates="customer_bookings", foreign_keys=[customer_id]
    )
    provider: Mapped["User"] = relationship(
        back_populates="provider_bookings", foreign_keys=[provider_id]
    )
    package: Mapped["Package | None"] = relationship()
    service: Mapped["Service | None"] = relationship()
    participants: Mapped[list["BookingParticipant"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    photos: Mapped[list["BookingPhoto"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    review: Mapped["Review | None"] = relationship(
        back_populates="booking", uselist=False
    )


class BookingParticipant(Base):
    """A provider participating in a booking.

    For an individual booking this is the single assigned provider. For a team
    package booking it lists every member. Leads act on the booking; non-lead
    members can view it in their activity.
    """
    __tablename__ = "booking_participants"
    __table_args__ = (
        UniqueConstraint("booking_id", "user_id", name="uq_booking_participant"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role: Mapped[str | None] = mapped_column(String(160))

    booking: Mapped["Booking"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship(back_populates="booking_participations")


class BookingPhoto(Base):
    __tablename__ = "booking_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    photo_type: Mapped[PhotoType] = mapped_column(Enum(PhotoType), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    booking: Mapped["Booking"] = relationship(back_populates="photos")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating"),
        UniqueConstraint("booking_id", name="uq_review_booking"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    booking: Mapped["Booking"] = relationship(back_populates="review")
    customer: Mapped["User"] = relationship(back_populates="reviews_written", foreign_keys=[customer_id])
    provider: Mapped["User"] = relationship(back_populates="reviews_received", foreign_keys=[provider_id])
