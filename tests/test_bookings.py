"""Individual booking lifecycle: pricing, transitions, ownership, conflicts."""
from __future__ import annotations


def _book(client, headers, provider_id, service_id, extra=None):
    payload = {
        "service_id": service_id,
        "provider_id": provider_id,
        "item_description": "Fix the leaking tap and repaint the wall.",
        "address": "12 Sunview, Margao",
        "booking_date": "2026-10-01",
        "booking_time": "10:00",
        "duration_hours": 3,
        "billing_unit": "hourly",
    }
    if extra:
        payload.update(extra)
    return client.post("/api/customers/bookings", json=payload, headers=headers)


def test_individual_booking_price_server_side(client, demo_people):
    _, c1 = demo_people["customer1"]
    svc = demo_people["services"]["s1"]  # 300/hr
    pid = demo_people["user_ids"]["prov1@test.dev"]
    r = _book(client, c1, pid, svc, extra={"duration_hours": 3})
    assert r.status_code == 201, r.text
    b = r.json()
    # Client never sends an amount; server computes 300 * 3 = 900.
    assert b["quoted_price"] == 900.0
    assert b["status"] == "pending"
    assert b["provider_name"] == "Arjun Provider"


def test_pending_accept_request_completion_confirm_review(client, demo_people):
    c1 = demo_people["customer1"]
    p1 = demo_people["provider1"]
    svc = demo_people["services"]["s1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]
    cid = demo_people["user_ids"]["cust1@test.dev"]

    r = _book(client, c1[1], pid, svc, extra={"duration_hours": 1})
    assert r.status_code == 201
    bid = r.json()["id"]

    # Provider accepts
    acc = client.put(f"/api/bookings/{bid}/accept", headers=p1[1])
    assert acc.status_code == 200, acc.text
    assert acc.json()["status"] == "accepted"

    # Provider requests completion
    comp = client.put(f"/api/bookings/{bid}/request-completion", headers=p1[1])
    assert comp.status_code == 200
    assert comp.json()["status"] == "completion_requested"

    # Customer confirms
    confirm = client.put(f"/api/bookings/{bid}/confirm-completion", headers=c1[1])
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "completed"

    # Customer reviews (only completed bookings)
    rev = client.post(
        f"/api/bookings/{bid}/reviews",
        json={"rating": 5, "comment": "Great work"},
        headers=c1[1],
    )
    assert rev.status_code == 201, rev.text
    # Cannot review twice
    rev2 = client.post(
        f"/api/bookings/{bid}/reviews", json={"rating": 3, "comment": "again"}, headers=c1[1]
    )
    assert rev2.status_code == 400


def test_customer_rejects_completion_returns_to_accepted(client, demo_people):
    c1 = demo_people["customer1"]
    p1 = demo_people["provider1"]
    svc = demo_people["services"]["s1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]

    r = _book(client, c1[1], pid, svc)
    bid = r.json()["id"]
    client.put(f"/api/bookings/{bid}/accept", headers=p1[1])
    client.put(f"/api/bookings/{bid}/request-completion", headers=p1[1])
    resp = client.put(f"/api/bookings/{bid}/reject-completion", headers=c1[1])
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"


def test_provider_rejection_sets_rejected(client, demo_people):
    c1 = demo_people["customer1"]
    p1 = demo_people["provider1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]
    r = _book(client, c1[1], pid, demo_people["services"]["s1"])
    bid = r.json()["id"]
    resp = client.put(f"/api/bookings/{bid}/reject", headers=p1[1])
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_customer_cancels_pending(client, demo_people):
    c1 = demo_people["customer1"]
    p1 = demo_people["provider1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]
    r = _book(client, c1[1], pid, demo_people["services"]["s1"])
    bid = r.json()["id"]
    resp = client.put(f"/api/bookings/{bid}/cancel", headers=c1[1])
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_unauthorized_cross_account_blocked(client, demo_people):
    c1 = demo_people["customer1"]
    c2 = demo_people["customer2"]
    p1 = demo_people["provider1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]

    r = _book(client, c1[1], pid, demo_people["services"]["s1"])
    bid = r.json()["id"]

    # Other customer cannot view detail, cannot confirm completion.
    detail = client.get(f"/api/bookings/{bid}", headers=c2[1])
    assert detail.status_code == 403

    client.put(f"/api/bookings/{bid}/accept", headers=p1[1])
    client.put(f"/api/bookings/{bid}/request-completion", headers=p1[1])
    confirm = client.put(f"/api/bookings/{bid}/confirm-completion", headers=c2[1])
    assert confirm.status_code == 403


def test_provider_cannot_accept_others_booking(client, demo_people):
    c1 = demo_people["customer1"]
    p2 = demo_people["provider2"]
    pid1 = demo_people["user_ids"]["prov1@test.dev"]

    r = _book(client, c1[1], pid1, demo_people["services"]["s1"])
    bid = r.json()["id"]
    resp = client.put(f"/api/bookings/{bid}/accept", headers=p2[1])
    assert resp.status_code == 403


def test_double_submit_rejected(client, demo_people):
    c1 = demo_people["customer1"]
    p1 = demo_people["provider1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]
    r = _book(client, c1[1], pid, demo_people["services"]["s1"])
    bid = r.json()["id"]
    # Accept twice
    client.put(f"/api/bookings/{bid}/accept", headers=p1[1])
    resp = client.put(f"/api/bookings/{bid}/accept", headers=p1[1])
    assert resp.status_code in (400, 409)


def test_slot_conflict_rejected(client, db_session_factory, demo_people):
    c1 = demo_people["customer1"]
    p1 = demo_people["provider1"]
    pid = demo_people["user_ids"]["prov1@test.dev"]

    r = _book(client, c1[1], pid, demo_people["services"]["s1"], extra={"booking_date": "2026-11-01", "booking_time": "14:00"})
    assert r.status_code == 201
    # Same provider same slot => 409
    r2 = _book(client, c1[1], pid, demo_people["services"]["s2"], extra={"booking_date": "2026-11-01", "booking_time": "14:00"})
    assert r2.status_code == 409


def test_book_unavailable_provider_rejected(client, db_session_factory, demo_people):
    from backend.models import ProviderProfile, User

    c1 = demo_people["customer1"]
    session = db_session_factory()
    user = session.query(User).filter(User.email == "prov1@test.dev").first()
    prof = session.query(ProviderProfile).filter(ProviderProfile.user_id == user.id).first()
    prof.available = False
    session.commit()
    session.close()

    pid = demo_people["user_ids"]["prov1@test.dev"]
    r = _book(client, c1[1], pid, demo_people["services"]["s1"])
    assert r.status_code == 400
