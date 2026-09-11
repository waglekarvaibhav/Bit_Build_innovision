"""Seed a small, clearly labeled fictitious demo dataset.

Creates 2 customers, 6 providers, 5 service categories, examples of both package
types, plus a few bookings and reviews so the dashboards and shortlist have real
data to show. All contact placeholders are safe (9990000000-series numbers).

Refuses to run against a non-development (non-SQLite) database and aborts if the
db already contains seed users, so it cannot clobber real or external data.
Run:  python -m backend.seed_demo
Force re-seed on a wiped db:  python -m backend.reset_db --yes  &&  python -m backend.seed_demo
"""
from __future__ import annotations

import sys
import uuid

from .config import settings, load_dotenv_manual

DEMO_PASSWORD = "DemoPass123!"


_phone_counter = [0]


def _placeholder_phone() -> str:
    # Deterministic unique safe Indian-mobile placeholder sequence (9xxxxxxxxx).
    _phone_counter[0] += 1
    n = _phone_counter[0]
    digits = f"{n:09d}"
    return "9" + "".join(str(int(d) + (i % 3)) for i, d in enumerate(digits))


def main() -> None:
    load_dotenv_manual()

    url = settings.sqlalchemy_database_url
    if not url.startswith("sqlite"):
        print("Refusing to seed: a development SQLite database is required.")
        sys.exit(1)

    from .database import Base, SessionLocal, engine
    from . import models  # noqa: F401
    from .models import (
        BillingUnit,
        Booking,
        BookingParticipant,
        BookingStatus,
        Package,
        PackageMember,
        PackageServiceBundle,
        PackageType,
        ProviderProfile,
        ProviderService,
        Review,
        Role,
        Service,
        ServiceCategory,
        User,
    )
    from .security import hash_password

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if db.query(User).filter(User.email.like("%@crewneat.demo")).first():
            print("Demo data already present. Refusing to re-seed without a reset.")
            return

        # ---- Service categories & services ----
        cat_specs = [
            ("Home & Interior", "Cleaning, moving, repairs and interior upkeep.", ["Home Cleaning", "Moving & Packing", "Painting & Touch-up"]),
            ("Electrical & Repair", "Electrical fixtures, appliance and general repair.", ["Electrical Wiring", "Appliance Repair", "Plumbing"]),
            ("Gardening & Outdoor", "Gardening, lawns and outdoor maintenance.", ["Gardening & Lawn Care", "Mowing", "Pruning"]),
            ("Assembly & Install", "Furniture assembly and small installations.", ["Furniture Assembly", "Home Installation"]),
            ("Maintenance Plans", "Routine and periodic home maintenance.", ["Routine Maintenance", "Deep Cleaning"]),
        ]
        categories = {}
        for name, desc, svc_names in cat_specs:
            cat = ServiceCategory(name=name, description=desc)
            db.add(cat)
            db.flush()
            categories[name] = cat
            cat.services = [Service(name=sn, category_id=cat.id) for sn in svc_names]
        db.flush()

        svc_by_name = {}
        for svc in db.query(Service).all():
            svc_by_name[svc.name] = svc

        # ---- Providers (6) ----
        providers = [
            {
                "name": "Arjun Naik",
                "email": "arjun@crewneat.demo",
                "profession": "Handyman & Home Repair",
                "locality": "Margao",
                "bio": "General handyman with 6 years of experience across repairs, assembly and painting.",
                "exp": 6,
                "services": {"Home Cleaning": (250, None, None), "Furniture Assembly": (300, None, None), "Painting & Touch-up": (280, None, None)},
            },
            {
                "name": "Priya Kamat",
                "email": "priya@crewneat.demo",
                "profession": "Deep Cleaner",
                "locality": "Panaji",
                "bio": "Specialist in deep cleaning and routine maintenance for homes and offices.",
                "exp": 4,
                "services": {"Deep Cleaning": (400, 3000, None), "Home Cleaning": (300, None, None), "Routine Maintenance": (350, None, None)},
            },
            {
                "name": "Rohit Phadte",
                "email": "rohit@crewneat.demo",
                "profession": "Electrician",
                "locality": "Ponda",
                "bio": "Licensed electrician handling wiring, appliance installation and small repairs.",
                "exp": 8,
                "services": {"Electrical Wiring": (500, None, None), "Appliance Repair": (450, None, None), "Home Installation": (400, None, None)},
            },
            {
                "name": "Sneha Gaitonde",
                "email": "sneha@crewneat.demo",
                "profession": "Gardener",
                "locality": "Vasco da Gama",
                "bio": "Gardening and lawn care specialist with experience in tropical plant upkeep.",
                "exp": 5,
                "services": {"Gardening & Lawn Care": (350, None, None), "Mowing": (300, None, None), "Pruning": (280, None, None)},
            },
            {
                "name": "Vikas Sawant",
                "email": "vikas@crewneat.demo",
                "profession": "Plumber",
                "locality": "Margao",
                "bio": "Plumber focusing on installations, tap repairs and bathroom fittings.",
                "exp": 7,
                "services": {"Plumbing": (400, None, None), "Appliance Repair": (380, None, None), "Routine Maintenance": (300, None, None)},
            },
            {
                "name": "Meera Dessai",
                "email": "meera@crewneat.demo",
                "profession": "Mover & Packer",
                "locality": "Panaji",
                "bio": "Reliable moving and packing services for households across Goa.",
                "exp": 3,
                "services": {"Moving & Packing": (450, 3500, None), "Home Cleaning": (250, None, None)},
            },
        ]

        provider_users = {}
        for spec in providers:
            u = User(
                full_name=spec["name"],
                email=spec["email"],
                mobile_number=_placeholder_phone(),
                password_hash=hash_password(DEMO_PASSWORD),
                role=Role.provider,
            )
            db.add(u)
            db.flush()
            prof = ProviderProfile(
                user_id=u.id,
                profession=spec["profession"],
                locality=spec["locality"],
                bio=spec["bio"],
                experience_years=spec["exp"],
                available=True,
            )
            db.add(prof)
            db.flush()
            for svc_name, rates in spec["services"].items():
                svc = svc_by_name[svc_name]
                db.add(
                    ProviderService(
                        provider_profile_id=prof.id,
                        service_id=svc.id,
                        hourly_rate=rates[0],
                        daily_rate=rates[1],
                        monthly_rate=rates[2],
                    )
                )
            provider_users[spec["email"]] = u
        db.flush()

        # ---- Customers (2) ----
        customer_specs = [
            ("Aarav Desai", "aarav@crewneat.demo"),
            ("Nisha Correia", "nisha@crewneat.demo"),
        ]
        customers = {}
        for name, email in customer_specs:
            c = User(
                full_name=name,
                email=email,
                mobile_number=_placeholder_phone(),
                password_hash=hash_password(DEMO_PASSWORD),
                role=Role.customer,
            )
            db.add(c)
            db.flush()
            customers[email] = c

        # ---- Packages: one multitasking, one team ----
        multitasking = Package(
            name="Complete Move-In Care",
            description="Bundle a deep clean, furniture assembly, and painting touch-ups from one handyman at a single hourly rate. One provider handles the whole job.",
            package_type=PackageType.multitasking,
            hourly_rate=320.0,
            status="published",
            owner_id=provider_users["arjun@crewneat.demo"].id,
            locality="Margao",
        )
        db.add(multitasking)
        db.flush()
        for sname in ("Home Cleaning", "Furniture Assembly", "Painting & Touch-up"):
            db.add(PackageServiceBundle(package_id=multitasking.id, service_id=svc_by_name[sname].id))
        db.flush()

        team = Package(
            name="Full Home Makeover",
            description="Move-in deep clean plus electrical and plumbing refreshes, handled together by a small specialist team. One combined hourly rate for the whole team.",
            package_type=PackageType.team,
            hourly_rate=1250.0,
            status="published",
            owner_id=provider_users["priya@crewneat.demo"].id,
            locality="Panaji",
        )
        db.add(team)
        db.flush()
        for sname in ("Deep Cleaning", "Electrical Wiring", "Plumbing"):
            db.add(PackageServiceBundle(package_id=team.id, service_id=svc_by_name[sname].id))
        team_members = [
            (provider_users["priya@crewneat.demo"].id, True, "Lead Cleaner"),
            (provider_users["rohit@crewneat.demo"].id, False, "Electrician"),
            (provider_users["vikas@crewneat.demo"].id, False, "Plumber"),
        ]
        for uid, is_lead, role in team_members:
            db.add(
                PackageMember(
                    package_id=team.id,
                    user_id=uid,
                    is_lead=is_lead,
                    role=role,
                )
            )
        db.flush()

        # ---- A completed booking + review for realistic rating data ----
        completed = Booking(
            customer_id=customers["aarav@crewneat.demo"].id,
            provider_id=provider_users["priya@crewneat.demo"].id,
            service_id=svc_by_name["Deep Cleaning"].id,
            item_description="One-time deep clean of a 2BHK apartment before moving in.",
            address="Flat 401, Sunview Residency, Panaji",
            booking_date=__import__("datetime").date(2026, 9, 5),
            booking_time="09:00",
            duration_hours=4,
            billing_unit=BillingUnit.hourly,
            quoted_price=1600.0,
            status=BookingStatus.completed,
        )
        db.add(completed)
        db.flush()
        db.add(BookingParticipant(booking_id=completed.id, user_id=provider_users["priya@crewneat.demo"].id, is_lead=True, role="provider"))
        db.add(
            Review(
                booking_id=completed.id,
                customer_id=customers["aarav@crewneat.demo"].id,
                provider_id=provider_users["priya@crewneat.demo"].id,
                rating=5,
                comment="Priya did a brilliant job — the apartment looked spotless.",
            )
        )
        db.flush()

        db.commit()
        print("Seeded CrewNest demo data.")
        print("Accounts (all passwords):", DEMO_PASSWORD)
        print("  Customers : aarav@crewneat.demo, nisha@crewneat.demo")
        print("  Providers : arjun@crewneat.demo, priya@crewneat.demo, rohit@crewneat.demo,")
        print("              sneha@crewneat.demo, vikas@crewneat.demo, meera@crewneat.demo")
        print("Package: 'Complete Move-In Care' (multitasking), 'Full Home Makeover' (team)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
