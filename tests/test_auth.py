"""Authentication and role-gating tests."""
from __future__ import annotations

from tests.conftest import TEST_PASSWORD, auth_headers


def test_customer_registration_and_login(client, db_session_factory):
    from backend.models import Role, User

    r = client.post(
        "/api/auth/register/customer",
        json={
            "full_name": "New Customer",
            "email": "newcust@test.dev",
            "password": TEST_PASSWORD,
            "mobile_number": "9990001111",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "customer"
    assert r.json()["access_token"]

    # Login works
    login = client.post(
        "/api/auth/login", json={"email": "newcust@test.dev", "password": TEST_PASSWORD}
    )
    assert login.status_code == 200

    # Wrong password fails
    bad = client.post(
        "/api/auth/login", json={"email": "newcust@test.dev", "password": "wrongpass"}
    )
    assert bad.status_code == 401


def test_password_is_hashed(client, db_session_factory):
    import backend.models as m

    client.post(
        "/api/auth/register/customer",
        json={"full_name": "Hash Test", "email": "hash@test.dev", "password": TEST_PASSWORD},
    )
    session = db_session_factory()
    user = session.query(m.User).filter(m.User.email == "hash@test.dev").first()
    assert user.password_hash.startswith("$2b$")
    assert TEST_PASSWORD not in user.password_hash
    session.close()


def test_role_isolation(client, demo_people):
    # A customer must not act as a provider.
    c1_email, c1_headers = demo_people["customer1"]
    r = client.get("/api/providers/me", headers=c1_headers)
    assert r.status_code == 403

    # A provider must not access customer-only endpoints.
    p1_email, p1_headers = demo_people["provider1"]
    r = client.get("/api/customers/me", headers=p1_headers)
    assert r.status_code == 403


def test_unauthenticated_denied(client):
    r = client.get("/api/customers/me")
    assert r.status_code == 401


def test_duplicate_email_rejected(client):
    res = client.post(
        "/api/auth/register/customer",
        json={"full_name": "Dup", "email": "dup@test.dev", "password": TEST_PASSWORD},
    )
    assert res.status_code in (200, 201)
    res2 = client.post(
        "/api/auth/register/customer",
        json={"full_name": "Dup2", "email": "dup@test.dev", "password": TEST_PASSWORD},
    )
    assert res2.status_code == 400
