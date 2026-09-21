import importlib.util
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ncaa_scraper.womens_lower_schedule import (
    contest_query_url,
    parse_contests,
    parse_schedule_calendar,
    schedule_query_url,
)


def test_query_contract_carries_exact_womens_division():
    url = schedule_query_url(2025, 2, 3)
    assert "sdataprod.ncaa.com" in url
    variables = json.loads(parse_qs(urlparse(url).query)["variables"][0])
    assert variables == {"sportCode": "WBB", "seasonYear": 2025, "division": 2, "month": 3}
    contest = contest_query_url(2025, 3, "03/04/2026")
    contest_variables = json.loads(parse_qs(urlparse(contest).query)["variables"][0])
    assert contest_variables["sportCode"] == "WBB"
    assert contest_variables["division"] == 3
    assert contest_variables["contestDate"] == "03/04/2026"


def test_calendar_and_contests_preserve_explicit_division():
    calendar = parse_schedule_calendar({"data": {"schedules": {"games": [{"count": 1, "contestDate": "03/04/2026"}]}}}, 2)
    assert calendar == [{"sport": "basketball", "gender": "women", "division": 2, "contest_date": "03/04/2026", "count": 1}]
    payload = {"data": {"contests": [{
        "contestId": 123,
        "url": "/game/123",
        "sportUrl": "basketball-women",
        "startDate": "03/04/2026",
        "startTime": "11:00",
        "startTimeEpoch": 1772640000,
        "gameState": "F",
        "statusCodeDisplay": "final",
        "teams": [
            {"isHome": True, "seoname": "alpha", "nameShort": "Alpha", "conferenceSeo": "conf", "score": 68, "isWinner": True},
            {"isHome": False, "seoname": "beta", "nameShort": "Beta", "conferenceSeo": "conf", "score": 63, "isWinner": False},
        ],
    }]}}
    rows = parse_contests(payload, 2, 2025, "03/04/2026")
    assert rows[0]["division"] == 2
    assert rows[0]["gender"] == "women"
    assert rows[0]["contest_id"] == 123
    assert [team["slug"] for team in rows[0]["teams"]] == ["alpha", "beta"]


def test_scope_or_identity_fail_closed():
    try:
        schedule_query_url(2025, 1, 3)
    except ValueError as exc:
        assert "division=2 or 3" in str(exc)
    else:
        raise AssertionError("D1 must not pass the lower-division query contract")
    try:
        parse_contests({"data": {"contests": [{"contestId": 1, "sportUrl": "football", "teams": []}]}}, 3, 2025, "03/04/2026")
    except ValueError as exc:
        assert "outside women's basketball" in str(exc)
    else:
        raise AssertionError("out-of-scope sport must be rejected")


def test_empty_current_schedule_is_distinct_from_unscoped_rows():
    assert parse_schedule_calendar({"data": {"schedules": None}}, 3) == []
