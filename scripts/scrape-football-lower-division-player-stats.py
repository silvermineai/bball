#!/usr/bin/env python3
"""Capture ESPN's public D2/D3 football game boxes into a receipt-backed JSON release.

The ESPN group-35 schedule is a combined discovery feed. A row enters this
release only after the exact ESPN team record labels its group as Division II
(57) or Division III (58), and the game summary supplies a stable athlete and
team ID. Names, conferences, and schedule membership never classify a player.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import time
import urllib.request
import urllib.parse
from urllib.robotparser import RobotFileParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API = "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football"
UA = "SilvermineResearch/1.0 (+https://bball.silvermine.dev)"
MAX_ROBOTS_BYTES = 512 * 1024
MAX_RESPONSE_BYTES = 16 * 1024 * 1024


def validate_robots(body: str, url: str, user_agent: str = UA) -> dict[str, object]:
    """Validate the publisher policy before a scoreboard or box request.

    ESPN's API host is separate from ``www.espn.com``.  A successful request
    to one host cannot establish permission for the other, so the exact API
    origin's robots response is required.  Parsing is kept separate from the
    network call so the fail-closed rule is covered without live requests in
    tests.
    """

    parser = RobotFileParser()
    parser.parse(body.splitlines())
    if not parser.can_fetch(user_agent, url):
        raise RuntimeError("ESPN robots.txt disallows this request; no page requested")
    delay = parser.crawl_delay(user_agent) or parser.crawl_delay("*")
    return {"crawl_delay_seconds": delay}


def verify_robots(url: str = API, user_agent: str = UA) -> dict[str, object]:
    """Require a readable, permissive robots file for the exact API origin."""

    parsed = urllib.parse.urlsplit(url)
    api_parts = urllib.parse.urlsplit(API)
    if (
        parsed.scheme != "https"
        or parsed.netloc != api_parts.netloc
        or not parsed.path.startswith(api_parts.path)
        or parsed.username
        or parsed.password
    ):
        raise RuntimeError("ESPN API URL must use the HTTPS football API origin before robots verification")
    robots_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/robots.txt", "", ""))
    request = urllib.request.Request(robots_url, headers={"User-Agent": user_agent, "Accept": "text/plain"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            # urllib follows redirects by default. A redirect can move the
            # policy check to another host, so require the exact origin and
            # bound the policy body before parsing it.
            final_url = response.geturl()
            if final_url != robots_url:
                raise RuntimeError("ESPN robots policy redirected; no page requested")
            body_bytes = response.read(MAX_ROBOTS_BYTES + 1)
            if len(body_bytes) > MAX_ROBOTS_BYTES:
                raise RuntimeError("ESPN robots policy exceeds the 512 KB bound")
            body = body_bytes.decode("utf-8", "replace")
    except Exception as exc:  # pragma: no cover - network behavior varies
        if isinstance(exc, RuntimeError) and str(exc).startswith("ESPN robots policy"):
            raise
        raise RuntimeError("Cannot verify ESPN robots policy; no page requested") from exc
    policy = validate_robots(body, url, user_agent)
    # Keep the digest over the exact bytes received; decoding is only for
    # RobotFileParser and must not change the receipt identity.
    policy.update({"robots_url": robots_url, "robots_sha256": hashlib.sha256(body_bytes).hexdigest()})
    return policy


def is_rankable_athlete_id(value: object) -> bool:
    """Reject ESPN's synthetic negative-ID team rows from player intake."""

    return bool(re.fullmatch(r"[1-9][0-9]*", str(value or "").strip()))


def align_provider_values(keys: list[object], values: list[object]) -> list[str]:
    """Keep provider values aligned to keys when a trailing field is omitted.

    ESPN occasionally omits a trailing value (for example adjusted QBR in a
    passing box). Padding with an empty string preserves that field as
    unavailable and prevents any later value from shifting columns. Unkeyed
    values are discarded because they cannot be safely labeled.
    """

    aligned = ["" if value is None else str(value) for value in values[: len(keys)]]
    return aligned + [""] * (len(keys) - len(aligned))


def get_json(url: str, attempts: int = 3) -> tuple[dict[str, Any], str, str]:
    parsed = urllib.parse.urlsplit(url)
    api_parts = urllib.parse.urlsplit(API)
    if (
        parsed.scheme != "https"
        or parsed.netloc != api_parts.netloc
        or not parsed.path.startswith(api_parts.path)
        or parsed.username
        or parsed.password
    ):
        raise RuntimeError("ESPN source URL must use the HTTPS football API origin")
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                # A successful HTTP response may still be a redirect target or
                # an unexpectedly large document. Retain only the exact
                # requested URL and a bounded body for the receipt digest.
                if response.geturl() != url:
                    raise RuntimeError("ESPN source response redirected; no row accepted")
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise RuntimeError("ESPN source response exceeds the 16 MB bound")
            return json.loads(body), url, hashlib.sha256(body).hexdigest()
        except Exception as exc:  # pragma: no cover - network behavior varies
            last = exc
            if attempt + 1 < attempts:
                time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"ESPN request failed: {url}: {last}")


def typed_receipts(
    results: list[tuple[dict[str, Any], str, str]],
    kind: str,
    fetched_at: str,
) -> list[dict[str, str]]:
    """Turn every response used by a capture into an auditable receipt.

    Discovery and classification responses are evidence too.  Keeping their
    URL and digest beside summary receipts prevents a later consumer from
    verifying the player rows while losing the exact scoreboard or team
    release that put an event in scope.
    """

    return [
        {
            "kind": kind,
            "url": url,
            "fetched_at": fetched_at,
            "sha256": digest,
        }
        for _, url, digest in results
    ]


def dates_between(start: dt.date, end: dt.date):
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


def default_season_window(today: dt.date) -> tuple[dt.date, dt.date]:
    """Return the current college-football season's capture window."""

    season = today.year if today.month >= 7 else today.year - 1
    return dt.date(season, 8, 20), today


def classify_team(team: dict[str, Any]) -> str | None:
    groups = team.get("groups") or {}
    group_id = str(groups.get("id") or "")
    parent_id = str((groups.get("parent") or {}).get("id") or "")
    if group_id == "57" or parent_id == "57":
        return "d2"
    if group_id == "58" or parent_id == "58":
        return "d3"
    return None


def capture(start: dt.date, end: dt.date, workers: int) -> dict[str, Any]:
    robots = verify_robots()
    day_urls = [f"{API}/scoreboard?dates={day:%Y%m%d}&groups=35" for day in dates_between(start, end)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        day_results = list(pool.map(get_json, day_urls))
    events = {str(event["id"]): event for payload, _, _ in day_results for event in payload.get("events", []) if event.get("id")}
    team_ids = {str(competitor.get("id")) for event in events.values() for competitor in event.get("competitions", [{}])[0].get("competitors", []) if competitor.get("id")}
    team_urls = [f"{API}/teams/{team_id}" for team_id in sorted(team_ids)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        team_results = list(pool.map(get_json, team_urls))
    teams = {str(payload.get("team", {}).get("id")): payload.get("team", {}) for payload, _, _ in team_results}
    team_divisions = {team_id: classify_team(team) for team_id, team in teams.items()}
    valid_events = {
        event_id: event for event_id, event in events.items()
        if any(team_divisions.get(str(competitor.get("id"))) for competitor in event.get("competitions", [{}])[0].get("competitors", []))
    }
    summary_urls = [f"{API}/summary?event={event_id}" for event_id in sorted(valid_events)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        summary_results = list(pool.map(get_json, summary_urls))
    rows: list[dict[str, Any]] = []
    games: list[dict[str, Any]] = []
    fetched_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    receipts = (
        typed_receipts(day_results, "scoreboard", fetched_at)
        + typed_receipts(team_results, "team", fetched_at)
        + typed_receipts(summary_results, "summary", fetched_at)
    )
    for (payload, url, digest), (event_id, event) in zip(summary_results, sorted(valid_events.items())):
        competition = event.get("competitions", [{}])[0]
        competitors = competition.get("competitors", [])
        games.append({
            "game_id": event_id,
            "date": event.get("date"),
            "name": event.get("name"),
            "status": (competition.get("status") or {}).get("type", {}).get("name"),
            "home_team_id": next((str(item["id"]) for item in competitors if item.get("homeAway") == "home"), None),
            "away_team_id": next((str(item["id"]) for item in competitors if item.get("homeAway") == "away"), None),
        })
        for team_block in (payload.get("boxscore") or {}).get("players", []):
            team = team_block.get("team") or {}
            team_id = str(team.get("id") or "")
            division = team_divisions.get(team_id)
            if division not in {"d2", "d3"}:
                continue
            for statistic in team_block.get("statistics", []):
                keys = statistic.get("keys") or []
                for athlete_row in statistic.get("athletes", []):
                    athlete = athlete_row.get("athlete") or {}
                    values = athlete_row.get("stats") or []
                    if not athlete.get("id") or not athlete.get("displayName") or not values:
                        continue
                    if not is_rankable_athlete_id(athlete.get("id")):
                        continue
                    aligned_values = align_provider_values(keys, values)
                    rows.append({
                        "season": start.year,
                        "division": division,
                        "game_id": event_id,
                        "date": event.get("date"),
                        "team_id": team_id,
                        "team": team.get("displayName"),
                        "athlete_id": str(athlete["id"]),
                        "athlete": athlete["displayName"],
                        "position": athlete.get("position"),
                        "category": statistic.get("name"),
                        "keys": keys,
                        "stats": aligned_values,
                    })
    digest = hashlib.sha256("".join(sorted(item["sha256"] for item in receipts)).encode()).hexdigest()
    receipt_counts = {
        kind: sum(item["kind"] == kind for item in receipts)
        for kind in ("scoreboard", "team", "summary")
    }
    return {
        "schema_version": 1,
        "sport": "football",
        "gender": "men",
        "season": start.year,
        "generated_at": fetched_at,
        "scope": "ESPN group-35 events classified by exact ESPN team group IDs 57 (D2) and 58 (D3)",
        "source_policy": "Only rows with stable ESPN athlete/team IDs and an exact source team group enter the release; missing categories remain missing.",
        "source": {"publisher": "ESPN", "scoreboard_url": f"{API}/scoreboard?dates={{yyyymmdd}}&groups=35", "summary_url_template": f"{API}/summary?event={{event_id}}", "team_url_template": f"{API}/teams/{{team_id}}", "receipt_count": len(receipts), "receipt_counts": receipt_counts, "receipt_sha256": digest, **robots},
        "coverage": {"events_discovered": len(events), "events_with_d2_d3_team": len(valid_events), "games": len(games), "player_rows": len(rows), "players": len({row["athlete_id"] for row in rows}), "teams": len({row["team_id"] for row in rows}), "rows_by_division": {"d2": sum(row["division"] == "d2" for row in rows), "d3": sum(row["division"] == "d3" for row in rows)}, "players_by_division": {"d2": len({row["athlete_id"] for row in rows if row["division"] == "d2"}), "d3": len({row["athlete_id"] for row in rows if row["division"] == "d3"})}, "receipt_counts": receipt_counts},
        "receipts": receipts,
        "games": games,
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    default_start, default_end = default_season_window(dt.date.today())
    start = dt.date.fromisoformat(args.start) if args.start else default_start
    end = dt.date.fromisoformat(args.end) if args.end else default_end
    if end < start or args.workers < 1 or args.workers > 16:
        raise SystemExit("invalid date range or worker count")
    payload = capture(start, end, args.workers)
    output = args.output or ROOT / f"frontend/public/data/football/lower-division-player-stats-{start.year}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(payload["coverage"], sort_keys=True))


if __name__ == "__main__":
    main()
