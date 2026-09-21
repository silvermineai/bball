"""Contracts for the public NCAA women's DII/DIII basketball schedule API.

The NCAA scoreboard page supplies a persisted-query API whose request carries
the sport and division explicitly.  The API does not return a stable numeric
team identifier in its schedule response, so this module keeps the publisher's
team slug and contest ID and never joins these rows to the ESPN editions.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode


API_URL = "https://sdataprod.ncaa.com"
SCOREBOARD_URL = "https://www.ncaa.com/scoreboard/basketball-women/{division}"
SPORT_CODE = "WBB"
GENDER = "women"
SCHEDULE_META = "NCAA_schedules_games_web"
SCHEDULE_HASH = "c653d0ac163b47bed513cd94aab887828c4ec7f4f9f698ea2bdcc574064e8d80"
CONTEST_META = "GetContests_web"
CONTEST_HASH = "4bcb5e6432fa9da365c0c19af01b1f9015cc7eb5c21e7af2dba308784a166df7"


def query_url(meta: str, query_hash: str, variables: dict[str, Any]) -> str:
    """Build a persisted-query URL without allowing scope to be implicit."""
    if variables.get("sportCode") != SPORT_CODE:
        raise ValueError("women's lower schedule queries must carry sportCode=WBB")
    division = variables.get("division")
    if division not in (2, 3):
        raise ValueError("women's lower schedule queries must carry division=2 or 3")
    return f"{API_URL}?{urlencode({'meta': meta, 'extensions': json.dumps({'persistedQuery': {'version': 1, 'sha256Hash': query_hash}}, separators=(',', ':')), 'variables': json.dumps(variables, separators=(',', ':'))})}"


def schedule_query_url(season_year: int, division: int, month: int) -> str:
    if month not in range(1, 13):
        raise ValueError("month must be between 1 and 12")
    return query_url(SCHEDULE_META, SCHEDULE_HASH, {
        "sportCode": SPORT_CODE,
        "seasonYear": int(season_year),
        "division": int(division),
        "month": month,
    })


def contest_query_url(season_year: int, division: int, contest_date: str) -> str:
    if not contest_date or len(contest_date) != 10:
        raise ValueError("contest_date must be formatted MM/DD/YYYY")
    return query_url(CONTEST_META, CONTEST_HASH, {
        "sportCode": SPORT_CODE,
        "division": int(division),
        "seasonYear": int(season_year),
        "contestDate": contest_date,
    })


def parse_schedule_calendar(payload: dict[str, Any], division: int) -> list[dict[str, Any]]:
    """Parse the date/count index while retaining the requested division."""
    if division not in (2, 3):
        raise ValueError("division must be 2 or 3")
    games = (((payload.get("data") or {}).get("schedules") or {}).get("games"))
    if games is None:
        return []
    if not isinstance(games, list):
        raise ValueError("NCAA schedule response has an invalid games collection")
    result = []
    for row in games:
        if not isinstance(row, dict) or not isinstance(row.get("contestDate"), str):
            raise ValueError("NCAA schedule response has an invalid contest date")
        count = row.get("count")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise ValueError("NCAA schedule response has an invalid contest count")
        result.append({"sport": "basketball", "gender": GENDER, "division": division, "contest_date": row["contestDate"], "count": count})
    return result


def parse_contests(payload: dict[str, Any], division: int, season_year: int, requested_date: str) -> list[dict[str, Any]]:
    """Normalize contest rows from one exact division/date query.

    The ``division`` value is carried from the validated request, never
    inferred from names, conferences, or a non-Division-I flag.
    """
    if division not in (2, 3):
        raise ValueError("division must be 2 or 3")
    contests = (payload.get("data") or {}).get("contests")
    if contests is None:
        return []
    if not isinstance(contests, list):
        raise ValueError("NCAA contest response has an invalid contests collection")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for contest in contests:
        if not isinstance(contest, dict):
            raise ValueError("NCAA contest response contains a malformed contest")
        contest_id = contest.get("contestId")
        if isinstance(contest_id, bool) or not isinstance(contest_id, int) or contest_id <= 0:
            raise ValueError("NCAA contest is missing a stable contestId")
        key = str(contest_id)
        if key in seen:
            raise ValueError(f"duplicate NCAA contestId={key}")
        seen.add(key)
        if contest.get("sportUrl") != "basketball-women":
            raise ValueError("NCAA contest is outside women's basketball scope")
        teams = contest.get("teams")
        if not isinstance(teams, list) or len(teams) != 2:
            raise ValueError(f"NCAA contestId={key} does not have exactly two teams")
        normalized_teams = []
        for team in teams:
            if not isinstance(team, dict) or not team.get("seoname") or not team.get("nameShort"):
                raise ValueError(f"NCAA contestId={key} has incomplete team identity")
            normalized_teams.append({
                "home": bool(team.get("isHome")),
                "slug": str(team["seoname"]),
                "name": str(team["nameShort"]),
                "conference": team.get("conferenceSeo"),
                "score": team.get("score"),
                "winner": team.get("isWinner"),
            })
        result.append({
            "sport": "basketball",
            "gender": GENDER,
            "division": division,
            "season_year": int(season_year),
            "contest_id": contest_id,
            "source_path": contest.get("url"),
            "contest_date": contest.get("startDate") or requested_date,
            "start_time": contest.get("startTime"),
            "start_time_epoch": contest.get("startTimeEpoch"),
            "state": contest.get("gameState"),
            "status": contest.get("statusCodeDisplay"),
            "teams": normalized_teams,
        })
    return result

