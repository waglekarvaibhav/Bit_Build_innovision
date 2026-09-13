from sqlalchemy import event


def _query_count(engine, client, path):
    count = 0

    def before_cursor_execute(*_args):
        nonlocal count
        count += 1

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        response = client.get(path)
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)
    assert response.status_code == 200, response.text
    return count


def test_catalogue_page_reads_use_bounded_queries(client, demo_people, db_engine):
    provider_headers = demo_people["provider1"][1]
    service_ids = list(demo_people["services"].values())
    created = client.post(
        "/api/providers/me/packages",
        headers=provider_headers,
        json={
            "name": "Fast package",
            "description": "Used to verify bounded catalogue queries",
            "package_type": "multitasking",
            "hourly_rate": 500,
            "status": "published",
            "locality": "Margao",
            "service_ids": service_ids[:2],
            "member_ids": [],
            "lead_member_id": None,
        },
    )
    assert created.status_code == 201, created.text

    assert _query_count(db_engine, client, "/api/service-categories") <= 2
    assert _query_count(db_engine, client, "/api/services") <= 1
    assert _query_count(db_engine, client, "/api/providers") <= 3
    assert _query_count(db_engine, client, "/api/packages") <= 3
    assert _query_count(db_engine, client, f"/api/shortlist?service_id={service_ids[0]}") <= 3
    assert _query_count(db_engine, client, f"/api/guides/suggest?service_ids={service_ids[0]}") <= 3
