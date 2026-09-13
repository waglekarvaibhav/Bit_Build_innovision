"""Tests for the rule-based shortlist, catalogue safety, and guided package suggestions."""
from __future__ import annotations


def test_shortlist_filters_and_ranks(client, demo_people):
    # Providers offer s1,s2,s3 at 300/250/200 hourly. Both work Margao.
    _, c1 = demo_people["customer1"]
    svc = demo_people["services"]

    resp = client.get(
        "/api/shortlist",
        params={
            "service_id": svc["s1"],
            "locality": "Margao",
            "booking_date": "2026-12-01",
            "booking_time": "09:00",
        },
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 2
    # Both providers offer s1 and work Margao with free slots -> both present.
    reasons_any = any(
        "Offers your selected service" in r["reasons"] for r in rows
    )
    assert reasons_any
    # Deterministic order: equal score; tie-break by rating then name.
    # Both have no reviews -> rating neutral. Sorted by name A-Z.
    names = [r["full_name"] for r in rows]
    assert names == sorted(names)


def test_shortlist_respects_budget(client, demo_people):
    svc = demo_people["services"]
    # s1 = 300/hr, so a budget of 280 excludes everyone on s1.
    resp = client.get("/api/shortlist", params={"service_id": svc["s1"], "max_budget": 280})
    rows = resp.json()
    # Both providers charge >=300 for s1; none show "Within your budget",
    # but providers still appear (soft rule) — missing budget is not fatal.
    assert all("Within your budget" not in r["reasons"] for r in rows)


def test_public_provider_detail_uses_provider_user_id(client, demo_people):
    provider_id = demo_people["user_ids"]["prov1@test.dev"]
    resp = client.get(f"/api/providers/{provider_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["user_id"] == provider_id
    assert resp.json()["full_name"] == "Arjun Provider"


def test_public_package_list_hides_drafts(client, demo_people):
    _, p1 = demo_people["provider1"]
    svc = demo_people["services"]

    created = client.post(
        "/api/providers/me/packages",
        json={
            "name": "Private Draft Offer",
            "description": "Still being prepared by the provider.",
            "package_type": "multitasking",
            "hourly_rate": 275.0,
            "status": "draft",
            "locality": "Margao",
            "service_ids": [svc["s1"], svc["s2"]],
        },
        headers=p1,
    )
    assert created.status_code in (200, 201), created.text

    public = client.get("/api/packages")
    assert public.status_code == 200, public.text
    assert all(p["name"] != "Private Draft Offer" for p in public.json())

    owned = client.get("/api/providers/me/packages", headers=p1)
    assert owned.status_code == 200, owned.text
    assert any(p["name"] == "Private Draft Offer" for p in owned.json()["packages"])


def test_provider_booking_list_does_not_leak_booking_id_collision(client, demo_people):
    _, customer = demo_people["customer1"]
    _, provider1 = demo_people["provider1"]
    provider2_id = demo_people["user_ids"]["prov2@test.dev"]
    svc = demo_people["services"]

    # Provider 1 has user id 3 in this fixture. Create three bookings belonging
    # only to provider 2; the old implementation accidentally treated user id
    # 3 as booking id 3 and leaked the third booking into provider 1's list.
    for hour in (9, 10, 11):
        r = client.post(
            "/api/customers/bookings",
            json={
                "service_id": svc["s1"],
                "provider_id": provider2_id,
                "item_description": f"Provider two job at {hour}",
                "address": "Test address, Margao",
                "booking_date": "2027-02-01",
                "booking_time": f"{hour:02d}:00",
                "duration_hours": 1,
                "billing_unit": "hourly",
            },
            headers=customer,
        )
        assert r.status_code == 201, r.text

    listing = client.get("/api/providers/bookings", headers=provider1)
    assert listing.status_code == 200, listing.text
    assert listing.json()["bookings"] == []


def test_package_suggestions_require_real_data(client, demo_people):
    _, c1 = demo_people["customer1"]
    _, p1 = demo_people["provider1"]
    svc = demo_people["services"]

    # Create a published multitasking package matching services s1+s2.
    client.post(
        "/api/providers/me/packages",
        json={
            "name": "Suggest Me",
            "description": "A matching package.",
            "package_type": "multitasking",
            "hourly_rate": 300.0,
            "status": "published",
            "locality": "Margao",
            "service_ids": [svc["s1"], svc["s2"]],
        },
        headers=p1,
    )

    # No service_ids -> empty.
    r0 = client.get("/api/guides/suggest", params={})
    assert r0.status_code == 200
    assert r0.json()["packages"] == []

    # Matching both services returns the real package with quoted total semantics.
    r = client.get("/api/guides/suggest", params={"service_ids": f"{svc['s1']},{svc['s2']}", "locality": "Margao"})
    assert r.status_code == 200, r.text
    packages = r.json()["packages"]
    assert any(p["name"] == "Suggest Me" for p in packages)
    found = next(p for p in packages if p["name"] == "Suggest Me")
    assert found["hourly_rate"] == 300.0
    assert found["package_type"] == "multitasking"
    assert set(found["services"]) == {"Service A", "Service B"}
    # No invented discounts or savings fields.
    assert "discount" not in found
    assert "savings" not in found
