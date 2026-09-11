"""Pytest fixtures: isolated in-memory SQLite + TestClient."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.config import settings
from backend.database import Base, get_db
from backend.main import app
from backend.models import (
    ProviderProfile,
    ProviderService,
    Role,
    Service,
    ServiceCategory,
    User,
)
from backend.security import hash_password

TEST_PASSWORD = "TestPassword1!"

# Force test-time settings to a clean in-memory SQLite.
settings.secret_key = "test-secret-not-for-production"


@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def db_session_factory(db_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=db_engine)


@pytest.fixture()
def client(db_session_factory):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _register(client, role, full_name, email, extra=None):
    path = "/api/auth/register/customer" if role == "customer" else "/api/auth/register/provider"
    payload = {
        "full_name": full_name,
        "email": email,
        "password": TEST_PASSWORD,
        "mobile_number": None,
    }
    if role == "provider":
        payload.update(
            {
                "profession": "Handyman",
                "locality": "Margao",
                "bio": "Demo professional",
                "experience_years": 5,
            }
        )
    if extra:
        payload.update(extra)
    return client.post(path, json=payload)


def auth_headers(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def seed_catalog(db_session_factory):
    """Create services in the DB and return a mapping name -> service_id."""

    def _make(name="Handyman"):
        session = db_session_factory()
        cat = ServiceCategory(name=name + " Category", description="test")
        session.add(cat)
        session.flush()
        services = {
            "s1": Service(name="Service A", category_id=cat.id),
            "s2": Service(name="Service B", category_id=cat.id),
            "s3": Service(name="Service C", category_id=cat.id),
        }
        for s in services.values():
            session.add(s)
        session.commit()
        ids = {k: s.id for k, s in services.items()}
        session.close()
        return ids

    return _make


@pytest.fixture()
def demo_people(client, db_session_factory, seed_catalog):
    """Register 2 customers and 2 providers, link services + rates, return handles."""
    svc_ids = seed_catalog()

    for role, name, email in [
        ("customer", "Customer One", "cust1@test.dev"),
        ("customer", "Customer Two", "cust2@test.dev"),
        ("provider", "Arjun Provider", "prov1@test.dev"),
        ("provider", "Rohit Provider", "prov2@test.dev"),
    ]:
        r = _register(client, role, name, email)
        assert r.status_code in (200, 201), r.text
        if role == "provider":
            session = db_session_factory()
            user = session.query(User).filter(User.email == email).first()
            prof = session.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
            for key, rate in [("s1", 300.0), ("s2", 250.0), ("s3", 200.0)]:
                session.add(
                    ProviderService(
                        provider_profile_id=prof.id,
                        service_id=svc_ids[key],
                        hourly_rate=rate,
                    )
                )
            session.commit()
            session.close()

    ids = {}
    session = db_session_factory()
    for email in [
        "cust1@test.dev",
        "cust2@test.dev",
        "prov1@test.dev",
        "prov2@test.dev",
    ]:
        ids[email] = session.query(User).filter(User.email == email).first().id
    session.close()

    return {
        "customer1": ("cust1@test.dev", auth_headers(client, "cust1@test.dev")),
        "customer2": ("cust2@test.dev", auth_headers(client, "cust2@test.dev")),
        "provider1": ("prov1@test.dev", auth_headers(client, "prov1@test.dev")),
        "provider2": ("prov2@test.dev", auth_headers(client, "prov2@test.dev")),
        "services": svc_ids,
        "user_ids": ids,
    }
