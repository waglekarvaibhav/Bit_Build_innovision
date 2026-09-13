"""Regression tests for demo-critical hardening fixes."""
from __future__ import annotations

from datetime import date, timedelta


def _future(days: int = 30) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def _book_individual(client, headers, provider_id, service_id):
    return client.post(
        "/api/customers/bookings",
        json={
            "service_id": service_id,
            "provider_id": provider_id,
            "item_description": "Fix and document the job.",
            "address": "12 Sunview, Margao",
            "booking_date": _future(),
            "booking_time": "10:00",
            "duration_hours": 2,
            "billing_unit": "hourly",
        },
        headers=headers,
    )


def test_uploaded_photo_returns_served_upload_url(client, demo_people):
    _, customer = demo_people["customer1"]
    _, other_customer = demo_people["customer2"]
    provider_id = demo_people["user_ids"]["prov1@test.dev"]
    service_id = demo_people["services"]["s1"]

    booking = _book_individual(client, customer, provider_id, service_id)
    assert booking.status_code == 201, booking.text
    booking_id = booking.json()["id"]

    image_bytes = b"\x89PNG\r\n\x1a\ncrewnest-demo-image"
    upload = client.post(
        f"/api/bookings/{booking_id}/photos",
        data={"photo_type": "before"},
        files={"file": ("before.png", image_bytes, "image/png")},
        headers=customer,
    )
    assert upload.status_code == 201, upload.text
    url = upload.json()["url"]
    assert url.startswith("/uploads/booking-photos/")

    served = client.get(url)
    assert served.status_code == 200
    assert served.content == image_bytes

    listing = client.get(f"/api/bookings/{booking_id}/photos", headers=customer)
    assert listing.status_code == 200
    assert listing.json()[0]["url"] == url

    denied = client.get(f"/api/bookings/{booking_id}/photos", headers=other_customer)
    assert denied.status_code == 403


def test_package_booking_is_hourly_only(client, demo_people):
    _, provider = demo_people["provider1"]
    _, customer = demo_people["customer1"]
    services = demo_people["services"]

    created = client.post(
        "/api/providers/me/packages",
        json={
            "name": "Hourly Demo Package",
            "description": "Two services at one published hourly package rate.",
            "package_type": "multitasking",
            "hourly_rate": 500.0,
            "status": "published",
            "locality": "Margao",
            "service_ids": [services["s1"], services["s2"]],
        },
        headers=provider,
    )
    assert created.status_code == 201, created.text
    package_id = created.json()["id"]

    payload = {
        "package_id": package_id,
        "item_description": "Prepare the house.",
        "address": "5 Rose Lane, Margao",
        "booking_date": _future(40),
        "booking_time": "11:00",
        "duration_hours": 2,
        "billing_unit": "daily",
    }
    rejected = client.post("/api/customers/bookings", json=payload, headers=customer)
    assert rejected.status_code == 422

    payload["billing_unit"] = "hourly"
    accepted = client.post("/api/customers/bookings", json=payload, headers=customer)
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["quoted_price"] == 1000.0


def test_booking_request_rejects_ambiguous_target_invalid_time_and_past_date(client, demo_people):
    _, customer = demo_people["customer1"]
    provider_id = demo_people["user_ids"]["prov1@test.dev"]
    service_id = demo_people["services"]["s1"]

    base = {
        "service_id": service_id,
        "provider_id": provider_id,
        "item_description": "Repair the fixture.",
        "address": "Ponda, Goa",
        "booking_date": _future(),
        "booking_time": "10:00",
        "duration_hours": 1,
        "billing_unit": "hourly",
    }

    ambiguous = dict(base)
    ambiguous["package_id"] = 999
    assert client.post("/api/customers/bookings", json=ambiguous, headers=customer).status_code == 422

    bad_time = dict(base)
    bad_time["booking_time"] = "27:99"
    assert client.post("/api/customers/bookings", json=bad_time, headers=customer).status_code == 422

    past = dict(base)
    past["booking_date"] = (date.today() - timedelta(days=1)).isoformat()
    assert client.post("/api/customers/bookings", json=past, headers=customer).status_code == 422
