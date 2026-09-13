"""Live end-to-end verification for CrewNest running against Neon.

This script talks to the running FastAPI server over HTTP, so it exercises:
frontend-serving process -> API routes -> auth -> SQLAlchemy -> configured DB.
It does NOT reset or delete the database. It creates clearly marked test
bookings using the seeded demo accounts; package test bookings are cancelled or
rejected when possible. One completed individual booking + review remains as an
audit trail of the successful lifecycle.

Run while the app is running on port 8001:
    python tests/verify_neon_e2e.py
"""
from __future__ import annotations

import datetime as dt
import sys
import time
from typing import Any

import httpx

BASE = "http://127.0.0.1:8001"
PASSWORD = "DemoPass123!"
TIMEOUT = 15.0
RESULTS: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'} - {name}" + (f" - {detail}" if detail else ""))


def expect_status(name: str, response: httpx.Response, expected: int) -> bool:
    ok = response.status_code == expected
    detail = f"HTTP {response.status_code}"
    if not ok:
        try:
            detail += f" {response.json()}"
        except Exception:
            detail += f" {response.text[:300]}"
    record(name, ok, detail)
    return ok


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(email: str) -> tuple[str | None, dict[str, Any] | None]:
    r = httpx.post(
        BASE + "/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        record(f"Login {email}", False, f"HTTP {r.status_code}: {r.text[:200]}")
        return None, None
    data = r.json()
    record(f"Login {email}", bool(data.get("access_token")), data.get("role", ""))
    return data.get("access_token"), data


def unique_slot(offset_days: int) -> tuple[str, str]:
    # Spread re-runs across a wide future range and vary the minute.
    stamp = time.time_ns()
    extra_days = stamp % 1200
    date = dt.date.today() + dt.timedelta(days=offset_days + int(extra_days))
    minute = int((stamp // 1000) % 60)
    hour = 10 + int((stamp // 100000) % 8)
    return date.isoformat(), f"{hour:02d}:{minute:02d}"


def main() -> int:
    print("CrewNest live Neon E2E verification")
    print("Target:", BASE)
    print("This does not reset or wipe the database.\n")

    # 1) Server + SPA shell
    try:
        health = httpx.get(BASE + "/health", timeout=TIMEOUT)
    except Exception as exc:
        record("Server reachable", False, repr(exc))
        return finish()
    expect_status("Health endpoint", health, 200)
    if health.status_code == 200:
        record("Health payload", health.json().get("status") == "ok", str(health.json()))

    home = httpx.get(BASE + "/home", timeout=TIMEOUT)
    record("SPA /home served", home.status_code == 200 and "CrewNest" in home.text, f"HTTP {home.status_code}")
    provider_home = httpx.get(BASE + "/provider-home", timeout=TIMEOUT)
    record("SPA /provider-home served", provider_home.status_code == 200 and "CrewNest" in provider_home.text, f"HTTP {provider_home.status_code}")

    # 2) Seeded marketplace catalogue
    cats_r = httpx.get(BASE + "/api/service-categories", timeout=TIMEOUT)
    providers_r = httpx.get(BASE + "/api/providers", timeout=TIMEOUT)
    packages_r = httpx.get(BASE + "/api/packages", timeout=TIMEOUT)
    if not expect_status("Service categories endpoint", cats_r, 200):
        return finish()
    if not expect_status("Providers endpoint", providers_r, 200):
        return finish()
    if not expect_status("Packages endpoint", packages_r, 200):
        return finish()

    categories = cats_r.json()
    providers = providers_r.json()
    packages = packages_r.json()
    provider_names = {p.get("full_name") for p in providers}
    record("Seeded categories available", len(categories) >= 5, f"count={len(categories)}")
    record("Seeded providers available", all(n in provider_names for n in ["Arjun Naik", "Priya Kamat", "Rohit Phadte", "Vikas Sawant"]), f"count={len(providers)}")

    multi = next((p for p in packages if p.get("name") == "Complete Move-In Care" and p.get("package_type") == "multitasking"), None)
    team = next((p for p in packages if p.get("name") == "Full Home Makeover" and p.get("package_type") == "team"), None)
    record("Multitasking package available", multi is not None)
    record("Team package available", team is not None)
    if team:
        record("Team package has 3 members", team.get("member_count") == 3, f"member_count={team.get('member_count')}")
        record("Team lead is Priya Kamat", (team.get("lead") or {}).get("name") == "Priya Kamat", str(team.get("lead")))

    # 3) Auth for both roles + cross-account customer
    customer_token, customer = login("aarav@crewneat.demo")
    nisha_token, _ = login("nisha@crewneat.demo")
    arjun_token, arjun_login = login("arjun@crewneat.demo")
    priya_token, _ = login("priya@crewneat.demo")
    rohit_token, _ = login("rohit@crewneat.demo")
    if not all([customer_token, nisha_token, arjun_token, priya_token, rohit_token]):
        return finish()

    me_customer = httpx.get(BASE + "/api/auth/me", headers=auth(customer_token), timeout=TIMEOUT)
    me_provider = httpx.get(BASE + "/api/auth/me", headers=auth(arjun_token), timeout=TIMEOUT)
    record("Customer token resolves correctly", me_customer.status_code == 200 and me_customer.json().get("role") == "customer", f"HTTP {me_customer.status_code}")
    record("Provider token resolves correctly", me_provider.status_code == 200 and me_provider.json().get("role") == "provider", f"HTTP {me_provider.status_code}")

    # Locate Arjun and an offered hourly service.
    arjun = next((p for p in providers if p.get("full_name") == "Arjun Naik"), None)
    if not arjun or not arjun.get("services"):
        record("Arjun has bookable services", False)
        return finish()
    arjun_service = next((s for s in arjun["services"] if s.get("hourly_rate") is not None), None)
    if not arjun_service:
        record("Arjun has hourly service", False)
        return finish()
    record("Arjun has hourly service", True, arjun_service.get("service_name", ""))

    # 4) Full individual booking lifecycle: customer -> provider -> customer -> review.
    date1, time1 = unique_slot(400)
    create_payload = {
        "service_id": arjun_service["service_id"],
        "provider_id": arjun["user_id"],
        "item_description": "E2E Neon verification booking - individual service",
        "address": "E2E Test Address, Margao",
        "booking_date": date1,
        "booking_time": time1,
        "duration_hours": 2,
        "billing_unit": "hourly",
    }
    created = httpx.post(BASE + "/api/customers/bookings", json=create_payload, headers=auth(customer_token), timeout=TIMEOUT)
    if not expect_status("Create individual booking", created, 201):
        return finish()
    booking = created.json()
    bid = booking["id"]
    expected_price = float(arjun_service["hourly_rate"]) * 2
    record("Server-side individual price correct", float(booking.get("quoted_price", -1)) == expected_price, f"quoted={booking.get('quoted_price')} expected={expected_price}")
    record("New booking starts pending", booking.get("status") == "pending", str(booking.get("status")))

    customer_list = httpx.get(BASE + "/api/customers/bookings", headers=auth(customer_token), timeout=TIMEOUT)
    record("Customer activity contains booking", customer_list.status_code == 200 and any(b.get("id") == bid for b in customer_list.json().get("bookings", [])), f"booking_id={bid}")
    provider_list = httpx.get(BASE + "/api/providers/bookings", headers=auth(arjun_token), timeout=TIMEOUT)
    record("Provider requests contain booking", provider_list.status_code == 200 and any(b.get("id") == bid for b in provider_list.json().get("bookings", [])), f"booking_id={bid}")

    # Cross-account access must be denied.
    cross = httpx.get(BASE + f"/api/bookings/{bid}", headers=auth(nisha_token), timeout=TIMEOUT)
    record("Cross-account booking access denied", cross.status_code == 403, f"HTTP {cross.status_code}")

    contact = httpx.get(BASE + f"/api/bookings/{bid}/contact", headers=auth(customer_token), timeout=TIMEOUT)
    record("Booking contact endpoint works for customer", contact.status_code == 200, f"HTTP {contact.status_code}")
    cross_contact = httpx.get(BASE + f"/api/bookings/{bid}/contact", headers=auth(nisha_token), timeout=TIMEOUT)
    record("Cross-account contact denied", cross_contact.status_code == 403, f"HTTP {cross_contact.status_code}")

    accepted = httpx.put(BASE + f"/api/bookings/{bid}/accept", headers=auth(arjun_token), timeout=TIMEOUT)
    record("Provider accepts booking", accepted.status_code == 200 and accepted.json().get("status") == "accepted", f"HTTP {accepted.status_code}")
    completion = httpx.put(BASE + f"/api/bookings/{bid}/request-completion", headers=auth(arjun_token), timeout=TIMEOUT)
    record("Provider requests completion", completion.status_code == 200 and completion.json().get("status") == "completion_requested", f"HTTP {completion.status_code}")
    confirmed = httpx.put(BASE + f"/api/bookings/{bid}/confirm-completion", headers=auth(customer_token), timeout=TIMEOUT)
    record("Customer confirms completion", confirmed.status_code == 200 and confirmed.json().get("status") == "completed", f"HTTP {confirmed.status_code}")

    review = httpx.post(
        BASE + f"/api/bookings/{bid}/reviews",
        json={"rating": 5, "comment": "Automated Neon E2E verification passed."},
        headers=auth(customer_token),
        timeout=TIMEOUT,
    )
    record("Customer can review completed booking", review.status_code == 201 and review.json().get("booking_id") == bid, f"HTTP {review.status_code}")
    reviews = httpx.get(BASE + f"/api/providers/{arjun['user_id']}/reviews", timeout=TIMEOUT)
    record("Review persists in Neon-backed API", reviews.status_code == 200 and any(r.get("booking_id") == bid for r in reviews.json()), f"HTTP {reviews.status_code}")

    # 5) Multitasking package snapshot + pricing. Cancel after verification.
    if multi:
        date2, time2 = unique_slot(700)
        multi_create = httpx.post(
            BASE + "/api/customers/bookings",
            json={
                "package_id": multi["id"],
                "item_description": "E2E Neon verification - multitasking package",
                "address": "E2E Package Address, Margao",
                "booking_date": date2,
                "booking_time": time2,
                "duration_hours": 2,
                "billing_unit": "hourly",
            },
            headers=auth(customer_token),
            timeout=TIMEOUT,
        )
        if expect_status("Create multitasking package booking", multi_create, 201):
            mb = multi_create.json()
            expected = float(multi["hourly_rate"]) * 2
            record("Multitasking snapshot type correct", mb.get("package_type_snapshot") == "multitasking", str(mb.get("package_type_snapshot")))
            record("Multitasking services snapshotted", len(mb.get("package_services_snapshot") or []) == multi.get("service_count"), f"snapshot={len(mb.get('package_services_snapshot') or [])} catalogue={multi.get('service_count')}")
            record("Multitasking package price correct", float(mb.get("quoted_price", -1)) == expected, f"quoted={mb.get('quoted_price')} expected={expected}")
            cancel = httpx.put(BASE + f"/api/bookings/{mb['id']}/cancel", headers=auth(customer_token), timeout=TIMEOUT)
            record("Multitasking test booking cleaned up as cancelled", cancel.status_code == 200 and cancel.json().get("status") == "cancelled", f"HTTP {cancel.status_code}")

    # 6) Team package: all members see it, only lead may act.
    if team:
        date3, time3 = unique_slot(1000)
        team_create = httpx.post(
            BASE + "/api/customers/bookings",
            json={
                "package_id": team["id"],
                "item_description": "E2E Neon verification - team package",
                "address": "E2E Team Address, Panaji",
                "booking_date": date3,
                "booking_time": time3,
                "duration_hours": 3,
                "billing_unit": "hourly",
            },
            headers=auth(customer_token),
            timeout=TIMEOUT,
        )
        if expect_status("Create team package booking", team_create, 201):
            tb = team_create.json()
            tbid = tb["id"]
            expected = float(team["hourly_rate"]) * 3
            record("Team package snapshot type correct", tb.get("package_type_snapshot") == "team", str(tb.get("package_type_snapshot")))
            record("Team members snapshotted", len(tb.get("package_members_snapshot") or []) == team.get("member_count"), f"snapshot={len(tb.get('package_members_snapshot') or [])} catalogue={team.get('member_count')}")
            record("Team package price correct", float(tb.get("quoted_price", -1)) == expected, f"quoted={tb.get('quoted_price')} expected={expected}")

            lead_jobs = httpx.get(BASE + "/api/providers/bookings", headers=auth(priya_token), timeout=TIMEOUT)
            member_jobs = httpx.get(BASE + "/api/providers/bookings", headers=auth(rohit_token), timeout=TIMEOUT)
            record("Team lead sees team booking", lead_jobs.status_code == 200 and any(b.get("id") == tbid for b in lead_jobs.json().get("bookings", [])), f"booking_id={tbid}")
            record("Team member sees team booking", member_jobs.status_code == 200 and any(b.get("id") == tbid for b in member_jobs.json().get("bookings", [])), f"booking_id={tbid}")

            member_action = httpx.put(BASE + f"/api/bookings/{tbid}/accept", headers=auth(rohit_token), timeout=TIMEOUT)
            record("Non-lead team member cannot accept", member_action.status_code == 403, f"HTTP {member_action.status_code}")
            lead_reject = httpx.put(BASE + f"/api/bookings/{tbid}/reject", headers=auth(priya_token), timeout=TIMEOUT)
            record("Team lead can act on request", lead_reject.status_code == 200 and lead_reject.json().get("status") == "rejected", f"HTTP {lead_reject.status_code}")

    return finish()


def finish() -> int:
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    failed = [(name, detail) for name, ok, detail in RESULTS if not ok]
    print("\n" + "=" * 64)
    print(f"E2E RESULT: {passed}/{total} checks passed")
    if failed:
        print("Failures:")
        for name, detail in failed:
            print(f"  - {name}: {detail}")
        print("STATUS: FAILED")
        return 1
    print("STATUS: PASSED")
    print("CrewNest customer/provider booking flow is working end-to-end against the configured database.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
