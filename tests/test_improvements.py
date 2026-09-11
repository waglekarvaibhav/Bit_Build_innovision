"""Tests for the rule-based shortlist and guided package suggestions."""
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
