"""Create bookable demo provider profiles without touching existing marketplace data.

This seed is intentionally provider-only and idempotent:
- preserves existing customers, bookings, reviews, packages and catalogue rows
- skips demo providers that already exist
- reuses existing services by exact name and creates only missing service rows
- works on SQLite by default
- requires --allow-external before writing to PostgreSQL/Neon

Local SQLite:
    python -m backend.seed_demo_providers

Connected Neon/PostgreSQL:
    python -m backend.seed_demo_providers --allow-external

All demo provider accounts use password: DemoPass123!
"""
from __future__ import annotations

import sys

from .config import settings, load_dotenv_manual

DEMO_PASSWORD = "DemoPass123!"


PROVIDERS = [
    {
        "name": "Priya Kamat",
        "email": "priya.provider@crewneat.demo",
        "mobile": "9876501001",
        "profession": "Professional Home Cleaner",
        "locality": "Panaji",
        "bio": "Home cleaning specialist focused on deep cleaning, move-in cleaning and recurring home care.",
        "experience": 5,
        "services": {
            "Deep Cleaning": (450.0, 3200.0, None),
            "Home Cleaning": (320.0, 2400.0, None),
            "Routine Maintenance": (350.0, None, 6500.0),
        },
    },
    {
        "name": "Rohan Naik",
        "email": "rohan.provider@crewneat.demo",
        "mobile": "9876501002",
        "profession": "Electrician & Appliance Technician",
        "locality": "Margao",
        "bio": "Experienced electrician for home wiring, appliance troubleshooting and installation work.",
        "experience": 8,
        "services": {
            "Electrical Wiring": (550.0, 3800.0, None),
            "Appliance Repair": (500.0, None, None),
            "Home Installation": (450.0, None, None),
        },
    },
    {
        "name": "Anjali Dessai",
        "email": "anjali.provider@crewneat.demo",
        "mobile": "9876501003",
        "profession": "Plumber & Bathroom Fitting Specialist",
        "locality": "Ponda",
        "bio": "Plumbing professional for leaks, fittings, bathroom fixtures and preventive maintenance.",
        "experience": 7,
        "services": {
            "Plumbing": (480.0, 3400.0, None),
            "Routine Maintenance": (350.0, None, None),
            "Home Installation": (420.0, None, None),
        },
    },
    {
        "name": "Sameer Sawant",
        "email": "sameer.provider@crewneat.demo",
        "mobile": "9876501004",
        "profession": "Handyman & Furniture Assembler",
        "locality": "Mapusa",
        "bio": "Multi-skilled handyman for furniture assembly, small repairs, installations and paint touch-ups.",
        "experience": 6,
        "services": {
            "Furniture Assembly": (380.0, 2800.0, None),
            "Painting & Touch-up": (360.0, 2600.0, None),
            "Home Installation": (400.0, None, None),
        },
    },
    {
        "name": "Neha Gawas",
        "email": "neha.provider@crewneat.demo",
        "mobile": "9876501005",
        "profession": "Gardener & Outdoor Care Professional",
        "locality": "Vasco da Gama",
        "bio": "Gardening professional offering lawn care, pruning and routine outdoor maintenance.",
        "experience": 4,
        "services": {
            "Gardening & Lawn Care": (380.0, 2700.0, None),
            "Mowing": (320.0, None, None),
            "Pruning": (300.0, None, None),
        },
    },
    {
        "name": "Aman Verlekar",
        "email": "aman.provider@crewneat.demo",
        "mobile": "9876501006",
        "profession": "Mover, Packer & Home Setup Professional",
        "locality": "Panaji",
        "bio": "Reliable moving and packing professional for household relocation, unpacking and move-in setup.",
        "experience": 5,
        "services": {
            "Moving & Packing": (500.0, 3900.0, None),
            "Home Cleaning": (300.0, None, None),
            "Furniture Assembly": (350.0, None, None),
        },
    },
]


CATEGORY_BY_SERVICE = {
    "Home Cleaning": "Home & Interior",
    "Deep Cleaning": "Home & Interior",
    "Painting & Touch-up": "Home & Interior",
    "Moving & Packing": "Home & Interior",
    "Electrical Wiring": "Electrical & Repair",
    "Appliance Repair": "Electrical & Repair",
    "Plumbing": "Electrical & Repair",
    "Gardening & Lawn Care": "Gardening & Outdoor",
    "Mowing": "Gardening & Outdoor",
    "Pruning": "Gardening & Outdoor",
    "Furniture Assembly": "Assembly & Install",
    "Home Installation": "Assembly & Install",
    "Routine Maintenance": "Maintenance Plans",
}

CATEGORY_DESCRIPTIONS = {
    "Home & Interior": "Cleaning, moving, painting and interior home services.",
    "Electrical & Repair": "Electrical, appliance and plumbing repair services.",
    "Gardening & Outdoor": "Gardening, lawn and outdoor upkeep services.",
    "Assembly & Install": "Furniture assembly and home installation services.",
    "Maintenance Plans": "Routine and recurring home maintenance services.",
}


def main() -> None:
    load_dotenv_manual()
    url = settings.sqlalchemy_database_url
    is_sqlite = url.startswith("sqlite")
    allow_external = "--allow-external" in sys.argv

    if not is_sqlite and not allow_external:
        print("Refusing to modify an external database without --allow-external.")
        print("If this is the intentional CrewNest Neon demo database, run:")
        print("  python -m backend.seed_demo_providers --allow-external")
        sys.exit(1)

    from .database import Base, SessionLocal, engine
    from . import models  # noqa: F401
    from .models import ProviderProfile, ProviderService, Role, Service, ServiceCategory, User
    from .security import hash_password

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    created = 0
    skipped = 0
    attached_services = 0

    try:
        # Build/reuse the small amount of catalogue data required by these demo providers.
        categories: dict[str, ServiceCategory] = {}
        for category_name in sorted(set(CATEGORY_BY_SERVICE.values())):
            category = db.query(ServiceCategory).filter(ServiceCategory.name == category_name).first()
            if category is None:
                category = ServiceCategory(
                    name=category_name,
                    description=CATEGORY_DESCRIPTIONS.get(category_name),
                )
                db.add(category)
                db.flush()
            categories[category_name] = category

        needed_service_names = sorted({name for p in PROVIDERS for name in p["services"]})
        services: dict[str, Service] = {}
        for service_name in needed_service_names:
            service = db.query(Service).filter(Service.name == service_name).first()
            if service is None:
                category_name = CATEGORY_BY_SERVICE[service_name]
                service = Service(
                    name=service_name,
                    category_id=categories[category_name].id,
                )
                db.add(service)
                db.flush()
            services[service_name] = service

        for spec in PROVIDERS:
            user = db.query(User).filter(User.email == spec["email"]).first()

            if user is None:
                mobile = spec["mobile"]
                if db.query(User).filter(User.mobile_number == mobile).first():
                    mobile = None
                user = User(
                    full_name=spec["name"],
                    email=spec["email"],
                    mobile_number=mobile,
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=Role.provider,
                )
                db.add(user)
                db.flush()
                created += 1
            elif user.role != Role.provider:
                print(f"Skipping {spec['email']}: email belongs to a non-provider account.")
                skipped += 1
                continue
            else:
                skipped += 1

            profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
            if profile is None:
                profile = ProviderProfile(
                    user_id=user.id,
                    profession=spec["profession"],
                    locality=spec["locality"],
                    bio=spec["bio"],
                    experience_years=spec["experience"],
                    available=True,
                )
                db.add(profile)
                db.flush()
            else:
                # Keep demo records useful if the script is run after an interrupted seed.
                profile.profession = spec["profession"]
                profile.locality = spec["locality"]
                profile.bio = spec["bio"]
                profile.experience_years = spec["experience"]
                profile.available = True

            existing_service_ids = {
                row.service_id
                for row in db.query(ProviderService)
                .filter(ProviderService.provider_profile_id == profile.id)
                .all()
            }
            for service_name, rates in spec["services"].items():
                service = services[service_name]
                if service.id in existing_service_ids:
                    continue
                db.add(
                    ProviderService(
                        provider_profile_id=profile.id,
                        service_id=service.id,
                        hourly_rate=rates[0],
                        daily_rate=rates[1],
                        monthly_rate=rates[2],
                    )
                )
                attached_services += 1

        db.commit()

        print("Demo provider seed complete.")
        print(f"Created provider accounts: {created}")
        print(f"Existing provider accounts reused/skipped: {skipped}")
        print(f"Provider-service links added: {attached_services}")
        print("Password for every demo provider:", DEMO_PASSWORD)
        print("Demo provider logins:")
        for spec in PROVIDERS:
            print(f"  {spec['name']:<18} {spec['email']}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
