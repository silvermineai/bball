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
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API = "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football"
UA = "SilvermineResearch/1.0 (+https://bball.silvermine.dev)"


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
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
            return json.loads(body), url, hashlib.sha256(body).hexdigest()
        except Exception as exc:  # pragma: no cover - network behavior varies
            last = exc
            if attempt + 1 < attempts:
                time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"ESPN request failed: {url}: {last}")


def dates_between(start: dt.date, end: dt.date):
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


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
    receipts: list[dict[str, str]] = []
    fetched_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    for (payload, url, digest), (event_id, event) in zip(summary_results, sorted(valid_events.items())):
        receipts.append({"url": url, "fetched_at": fetched_at, "sha256": digest})
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
    return {
        "schema_version": 1,
        "sport": "football",
        "gender": "men",
        "season": start.year,
        "generated_at": fetched_at,
        "scope": "ESPN group-35 events classified by exact ESPN team group IDs 57 (D2) and 58 (D3)",
        "source_policy": "Only rows with stable ESPN athlete/team IDs and an exact source team group enter the release; missing categories remain missing.",
        "source": {"publisher": "ESPN", "scoreboard_url": f"{API}/scoreboard?dates={{yyyymmdd}}&groups=35", "summary_url_template": f"{API}/summary?event={{event_id}}", "team_url_template": f"{API}/teams/{{team_id}}", "receipt_count": len(receipts), "receipt_sha256": digest},
        "coverage": {"events_discovered": len(events), "events_with_d2_d3_team": len(valid_events), "games": len(games), "player_rows": len(rows), "players": len({row["athlete_id"] for row in rows}), "teams": len({row["team_id"] for row in rows}), "rows_by_division": {"d2": sum(row["division"] == "d2" for row in rows), "d3": sum(row["division"] == "d3" for row in rows)}, "players_by_division": {"d2": len({row["athlete_id"] for row in rows if row["division"] == "d2"}), "d3": len({row["athlete_id"] for row in rows if row["division"] == "d3"})}},
        "receipts": receipts,
        "games": games,
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-08-20")
    parser.add_argument("--end", default=dt.date.today().isoformat())
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--output", type=Path, default=ROOT / "frontend/public/data/football/lower-division-player-stats-2026.json")
    args = parser.parse_args()
    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)
    if end < start or args.workers < 1 or args.workers > 16:
        raise SystemExit("invalid date range or worker count")
    payload = capture(start, end, args.workers)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(payload["coverage"], sort_keys=True))


if __name__ == "__main__":
    main()
