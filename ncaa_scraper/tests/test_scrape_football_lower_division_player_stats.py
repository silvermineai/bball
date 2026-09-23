"""Pure contract tests for the ESPN lower-division player capture helpers."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/scrape-football-lower-division-player-stats.py"
SPEC = importlib.util.spec_from_file_location("scrape_football_lower", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_team_total_ids_are_not_player_identities() -> None:
    assert MODULE.is_rankable_athlete_id("5308774")
    assert not MODULE.is_rankable_athlete_id("-12291")
    assert not MODULE.is_rankable_athlete_id("Team")
    assert not MODULE.is_rankable_athlete_id("0")


def test_provider_values_are_padded_without_inventing_values() -> None:
    assert MODULE.align_provider_values(
        ["completions/passingAttempts", "passingYards", "adjQBR"],
        ["12/30", "76"],
    ) == ["12/30", "76", ""]
    assert MODULE.align_provider_values(["yards"], ["12", "unkeyed"]) == ["12"]
    assert MODULE.align_provider_values(["yards"], [None]) == [""]


def test_all_discovery_and_capture_responses_get_typed_receipts() -> None:
    results = [
        ({"events": []}, "https://example.test/scoreboard", "a" * 64),
        ({"team": {}}, "https://example.test/teams/1", "b" * 64),
    ]
    receipts = MODULE.typed_receipts(results, "team", "2026-09-22T00:00:00Z")
    assert receipts == [
        {"kind": "team", "url": "https://example.test/scoreboard", "fetched_at": "2026-09-22T00:00:00Z", "sha256": "a" * 64},
        {"kind": "team", "url": "https://example.test/teams/1", "fetched_at": "2026-09-22T00:00:00Z", "sha256": "b" * 64},
    ]


def test_robots_policy_requires_permission_for_the_exact_api_origin() -> None:
    body = "User-agent: *\nAllow: /apis/site/v2/\nCrawl-delay: 2\n"
    result = MODULE.validate_robots(
        body,
        "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=1",
    )
    assert result["crawl_delay_seconds"] == 2


def test_robots_policy_fails_closed_when_endpoint_is_disallowed() -> None:
    body = "User-agent: *\nDisallow: /\n"
    try:
        MODULE.validate_robots(
            body,
            "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=1",
        )
    except RuntimeError as exc:
        assert "no page requested" in str(exc)
    else:
        raise AssertionError("disallowed API request must fail closed")


class _Response:
    def __init__(self, url: str, body: bytes):
        self._url = url
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def geturl(self):
        return self._url

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]


def test_robots_policy_rejects_redirected_policy_origin() -> None:
    requested = MODULE.API + "/robots.txt"
    redirected = "https://www.espn.com/robots.txt"
    response = _Response(redirected, b"User-agent: *\nAllow: /\n")
    with patch.object(MODULE.urllib.request, "urlopen", return_value=response):
        try:
            MODULE.verify_robots(MODULE.API)
        except RuntimeError as exc:
            assert "redirected" in str(exc)
        else:
            raise AssertionError("redirected robots policy must fail closed")


def test_source_helpers_reject_other_origins_before_network_access() -> None:
    for helper in (MODULE.verify_robots, MODULE.get_json):
        try:
            helper("https://www.espn.com/college-football")
        except RuntimeError as exc:
            assert "football API origin" in str(exc)
        else:
            raise AssertionError("source helper must reject a non-API origin")
    assert not MODULE.is_api_url(MODULE.API + "-mirror/summary?event=1")
    assert MODULE.is_api_url(MODULE.API + "/summary?event=1")


def test_source_response_rejects_redirect_and_hashes_bounded_exact_body() -> None:
    requested = MODULE.API + "/summary?event=1"
    with patch.object(
        MODULE.urllib.request,
        "urlopen",
        return_value=_Response(requested, json.dumps({"ok": True}).encode()),
    ):
        payload, url, sha256 = MODULE.get_json(requested, attempts=1)
    assert payload == {"ok": True}
    assert url == requested
    assert sha256 == MODULE.hashlib.sha256(json.dumps({"ok": True}).encode()).hexdigest()

    with patch.object(
        MODULE.urllib.request,
        "urlopen",
        return_value=_Response("https://redirected.example/summary?event=1", b"{}"),
    ):
        try:
            MODULE.get_json(requested, attempts=1)
        except RuntimeError as exc:
            assert "redirected" in str(exc)
        else:
            raise AssertionError("redirected source response must fail closed")


def test_source_response_has_a_bounded_body() -> None:
    requested = MODULE.API + "/summary?event=1"
    oversized = b"{" + b"x" * MODULE.MAX_RESPONSE_BYTES + b"}"
    with patch.object(
        MODULE.urllib.request,
        "urlopen",
        return_value=_Response(requested, oversized),
    ):
        try:
            MODULE.get_json(requested, attempts=1)
        except RuntimeError as exc:
            assert "16 MB bound" in str(exc)
        else:
            raise AssertionError("oversized source response must fail closed")


def test_default_window_tracks_the_current_college_season() -> None:
    assert MODULE.default_season_window(MODULE.dt.date(2026, 9, 22)) == (
        MODULE.dt.date(2026, 8, 20),
        MODULE.dt.date(2026, 9, 22),
    )
    assert MODULE.default_season_window(MODULE.dt.date(2027, 2, 1)) == (
        MODULE.dt.date(2026, 8, 20),
        MODULE.dt.date(2027, 2, 1),
    )
