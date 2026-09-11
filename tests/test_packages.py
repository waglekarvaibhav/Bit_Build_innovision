"""Multitasking + team package bookings: structure, pricing, membership, snapshots."""
from __future__ import annotations


def _create_multitasking(client, headers, owner_uid, svc_ids, hourly=320.0):
    return client.post(
        "/api/providers/me/packages",
        json={
            "name": "Move-In Care",
            "description": "Deep clean, assembly and painting from one provider.",
            "package_type": "multitasking",
            "hourly_rate": hourly,
            "status": "published",
            "locality": "Margao",
            "service_ids": svc_ids,
        },
        headers=headers,
    )


def test_multitasking_package_creation_and_price(client, demo_people):
    _, p1 = demo_people["provider1"]
    svc = demo_people["services"]
    r = _create_multitasking(client, p1, None, [svc["s1"], svc["s2"]], hourly=320.0)
    assert r.status_code == 201, r.text
    assert r.json()["service_count"] == 2
    assert r.json()["package_type"] == "multitasking"
    assert r.json()["member_count"] == 0

    pkg_id = r.json()["id"]

    # Customer books it; server computes 320 * 2 = 640.
    _, c1 = demo_people["customer1"]
    book = client.post(
        "/api/customers/bookings",
        json={
            "package_id": pkg_id,
            "item_description": "Prepare my new home.",
            "address": "5 Rose Lane, Margao",
            "booking_date": "2026-12-01",
            "booking_time": "09:00",
            "duration_hours": 2,
        },
        headers=c1,
    )
    assert book.status_code == 201, book.text
    b = book.json()
    assert b["quoted_price"] == 640.0
    assert b["package_type_snapshot"] == "multitasking"
    # Snapshot retains services at booking time
    assert set(b["package_services_snapshot"]) == {"Service A", "Service B"}
    assert b["package_lead_name"] == "Arjun Provider"


def test_multitasking_requires_two_services(client, demo_people):
    _, p1 = demo_people["provider1"]
    svc = demo_people["services"]
    r = _create_multitasking(client, p1, None, [svc["s1"]])
    assert r.status_code == 400


def test_multitasking_snapshot_unchanged_after_archive(client, demo_people):
    _, p1 = demo_people["provider1"]
    _, c1 = demo_people["customer1"]
    svc = demo_people["services"]
    pkg = _create_multitasking(client, p1, None, [svc["s1"], svc["s2"]], hourly=320.0).json()
    book = client.post(
        "/api/customers/bookings",
        json={
            "package_id": pkg["id"],
            "item_description": "Home prep",
            "address": "5 Rose Lane, Margao",
            "booking_date": "2026-12-01",
            "booking_time": "09:00",
            "duration_hours": 2,
        },
        headers=c1,
    ).json()
    # Archive package
    arch = client.post(f"/api/providers/me/packages/{pkg['id']}/archive", headers=p1)
    assert arch.status_code == 200
    assert arch.json()["status"] == "archived"
    # Existing booking unchanged
    detail = client.get(f"/api/bookings/{book['id']}", headers=c1).json()
    assert detail["quoted_price"] == 640.0
    assert detail["package_name_snapshot"] == "Move-In Care"
    assert detail["status"] == "pending"
    # Can still complete lifecycle
    assert client.put(f"/api/bookings/{book['id']}/accept", headers=p1).status_code == 200


def test_booking_archived_package_not_allowed(client, demo_people):
    _, p1 = demo_people["provider1"]
    _, c1 = demo_people["customer1"]
    svc = demo_people["services"]
    pkg = _create_multitasking(client, p1, None, [svc["s1"], svc["s2"]]).json()
    client.post(f"/api/providers/me/packages/{pkg['id']}/archive", headers=p1)
    r = client.post(
        "/api/customers/bookings",
        json={"package_id": pkg["id"], "item_description": "Home service request", "address": "y-address", "booking_date": "2026-12-05", "booking_time": "10:00", "duration_hours": 1},
        headers=c1,
    )
    assert r.status_code == 404


def test_team_package_full_workflow(client, demo_people):
    _, p1 = demo_people["provider1"]  # owner/lead
    p1_uid = demo_people["user_ids"]["prov1@test.dev"]
    _, p2 = demo_people["provider2"]
    p2_uid = demo_people["user_ids"]["prov2@test.dev"]
    svc = demo_people["services"]

    # Create team package with 2 members, lead=provider1.
    create = client.post(
        "/api/providers/me/packages",
        json={
            "name": "Full Makeover",
            "description": "Deep clean and electrical refresh by a small team.",
            "package_type": "team",
            "hourly_rate": 1250.0,
            "status": "published",
            "locality": "Margao",
            "service_ids": [svc["s1"], svc["s2"], svc["s3"]],
            "member_ids": [p2_uid, p1_uid],
            "lead_member_id": p1_uid,
        },
        headers=p1,
    )
    assert create.status_code == 201, create.text
    pkg = create.json()
    assert pkg["member_count"] == 2
    assert pkg["lead"]["user_id"] == p1_uid

    # Customer books the team package.
    _, c1 = demo_people["customer1"]
    book = client.post(
        "/api/customers/bookings",
        json={
            "package_id": pkg["id"],
            "item_description": "Full home makeover.",
            "address": "22 Sea Breeze, Margao",
            "booking_date": "2026-12-10",
            "booking_time": "09:00",
            "duration_hours": 3,
        },
        headers=c1,
    )
    assert book.status_code == 201, book.text
    b = book.json()
    # Team hourly rate 1250 * 3 = 3750. NOT multiplied again by member count.
    assert b["quoted_price"] == 3750.0
    assert b["package_type_snapshot"] == "team"
    assert b["package_lead_name"] == "Arjun Provider"
    assert len(b["package_members_snapshot"]) == 2

    # Lead accepts; member2 can view but cannot accept as lead.
    lead = b
    bid = b["id"]
    non_lead_accept = client.put(f"/api/bookings/{bid}/accept", headers=p2)
    assert non_lead_accept.status_code == 403

    # Member can view the booking in their activity.
    member_view = client.get("/api/providers/bookings", headers=p2)
    assert member_view.status_code == 200
    assert any(x["id"] == bid for x in member_view.json()["bookings"])

    # Lead accepts and requests completion.
    assert client.put(f"/api/bookings/{bid}/accept", headers=p1).status_code == 200
    assert client.put(f"/api/bookings/{bid}/request-completion", headers=p1).status_code == 200

    # Non-lead member cannot request completion.
    assert client.put(f"/api/bookings/{bid}/request-completion", headers=p2).status_code == 403

    # Customer confirms completion.
    confirm = client.put(f"/api/bookings/{bid}/confirm-completion", headers=c1)
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "completed"


def test_team_package_snapshot_unchanged_after_edit(client, demo_people):
    _, p1 = demo_people["provider1"]
    _, p2 = demo_people["provider2"]
    _, c1 = demo_people["customer1"]
    p1_uid = demo_people["user_ids"]["prov1@test.dev"]
    p2_uid = demo_people["user_ids"]["prov2@test.dev"]
    svc = demo_people["services"]

    pkg = client.post(
        "/api/providers/me/packages",
        json={
            "name": "Team Fix",
            "description": "Team of two.",
            "package_type": "team",
            "hourly_rate": 1000.0,
            "status": "published",
            "locality": "Margao",
            "service_ids": [svc["s1"], svc["s2"]],
            "member_ids": [p1_uid, p2_uid],
            "lead_member_id": p1_uid,
        },
        headers=p1,
    ).json()

    book = client.post(
        "/api/customers/bookings",
        json={"package_id": pkg["id"], "item_description": "Home service request", "address": "some address", "booking_date": "2026-12-20", "booking_time": "11:00", "duration_hours": 2},
        headers=c1,
    ).json()
    original_members = book["package_members_snapshot"]

    # Edit the package: change rate and members.
    edit = client.put(
        f"/api/providers/me/packages/{pkg['id']}",
        json={"hourly_rate": 2000.0, "member_ids": [p2_uid], "lead_member_id": p2_uid},
        headers=p1,
    )
    assert edit.status_code == 200, edit.text

    # Existing booking keeps original agreement.
    detail = client.get(f"/api/bookings/{book['id']}", headers=c1).json()
    assert detail["quoted_price"] == 2000.0 * 1  # unchanged original 1000*2=2000
    assert detail["quoted_price"] == 2000.0
    assert detail["package_members_snapshot"] == original_members


def test_team_requires_two_or_more_members(client, demo_people):
    _, p1 = demo_people["provider1"]
    p1_uid = demo_people["user_ids"]["prov1@test.dev"]
    p2_uid = demo_people["user_ids"]["prov2@test.dev"]
    svc = demo_people["services"]
    r = client.post(
        "/api/providers/me/packages",
        json={
            "name": "Bad Team",
            "description": "Bad team description",
            "package_type": "team",
            "hourly_rate": 100.0,
            "status": "published",
            "locality": "Margao",
            "service_ids": [svc["s1"], svc["s2"]],
            "member_ids": [p1_uid],
            "lead_member_id": p1_uid,
        },
        headers=p1,
    )
    assert r.status_code == 400


def test_only_owner_manages_package(client, demo_people):
    _, p1 = demo_people["provider1"]
    _, p2 = demo_people["provider2"]
    svc = demo_people["services"]
    pkg = client.post(
        "/api/providers/me/packages",
        json={
            "name": "Owner Pkg",
            "description": "Owner package description",
            "package_type": "multitasking",
            "hourly_rate": 100.0,
            "status": "published",
            "locality": "Margao",
            "service_ids": [svc["s1"], svc["s2"]],
        },
        headers=p1,
    ).json()
    # Provider2 cannot edit this package.
    r = client.put(
        f"/api/providers/me/packages/{pkg['id']}",
        json={"hourly_rate": 999.0},
        headers=p2,
    )
    assert r.status_code == 403
