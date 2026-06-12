"""ESPN public API scraper for men's college basketball.

Pulls real, public data from ESPN's JSON APIs:
  - site.api.espn.com  (teams, scoreboard, rankings, news, rosters)
  - sports.core.api.espn.com  (team season statistics, leaders, groups)
  - site.web.api.espn.com  (conference standings)

Everything lands in the project SQLite database (data/ncaa_mbb.sqlite3)
in espn_* tables, which the analytics engine reads to build the static
JSON artifacts served by the frontend.

Usage:
  python -m ncaa_scraper.espn --teams --games --rankings --news
  python -m ncaa_scraper.espn --rosters --team-stats --leaders --standings
  python -m ncaa_scraper.espn --all
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Optional

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "data" / "ncaa_mbb.sqlite3"

SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball"
CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball"
WEB = "https://site.web.api.espn.com/apis/v2/sports/basketball/mens-college-basketball"

SEASON = 2026  # ESPN season year for the 2025-26 season
SEASON_START = date(2025, 11, 3)
SEASON_END = date(2026, 4, 6)
REQUEST_DELAY = 0.12

session = requests.Session()
session.headers.update({"User-Agent": "bball-silvermine-research/1.0 (public data; contact service@silvermineai.com)"})


def get_json(url: str, params: Optional[dict] = None, retries: int = 3) -> Optional[dict]:
    for attempt in range(retries):
        try:
            resp = session.get(url, params=params, timeout=30)
            if resp.status_code == 200:
                time.sleep(REQUEST_DELAY)
                return resp.json()
            if resp.status_code in (404, 400):
                return None
            time.sleep(1.5 * (attempt + 1))
        except requests.RequestException:
            time.sleep(1.5 * (attempt + 1))
    return None


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS espn_teams (
  id INTEGER PRIMARY KEY,
  slug TEXT, abbreviation TEXT, display_name TEXT, short_name TEXT,
  nickname TEXT, location TEXT, color TEXT, alt_color TEXT, logo TEXT,
  conference_id INTEGER, conference_name TEXT, conference_short TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS espn_games (
  id INTEGER PRIMARY KEY,
  season INTEGER, game_date TEXT, name TEXT, short_name TEXT,
  venue TEXT, city TEXT, state TEXT, attendance INTEGER,
  neutral_site INTEGER, conference_game INTEGER, status TEXT, completed INTEGER,
  home_id INTEGER, home_score INTEGER, away_id INTEGER, away_score INTEGER,
  home_winner INTEGER, broadcast TEXT, notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_espn_games_home ON espn_games(home_id);
CREATE INDEX IF NOT EXISTS ix_espn_games_away ON espn_games(away_id);
CREATE INDEX IF NOT EXISTS ix_espn_games_date ON espn_games(game_date);
CREATE TABLE IF NOT EXISTS espn_rankings (
  poll TEXT, season INTEGER, week INTEGER, team_id INTEGER, rank INTEGER,
  points REAL, first_place_votes INTEGER, trend TEXT, record TEXT,
  PRIMARY KEY (poll, season, week, team_id)
);
CREATE TABLE IF NOT EXISTS espn_athletes (
  id INTEGER PRIMARY KEY,
  team_id INTEGER, full_name TEXT, jersey TEXT, position TEXT,
  height TEXT, weight REAL, class_year TEXT,
  hometown_city TEXT, hometown_state TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_espn_athletes_team ON espn_athletes(team_id);
CREATE TABLE IF NOT EXISTS espn_team_stats (
  team_id INTEGER, season INTEGER, category TEXT, name TEXT,
  value REAL, display TEXT, per_game REAL,
  PRIMARY KEY (team_id, season, category, name)
);
CREATE TABLE IF NOT EXISTS espn_leaders (
  team_id INTEGER, season INTEGER, category TEXT, athlete_id INTEGER,
  value REAL, display TEXT,
  PRIMARY KEY (team_id, season, category, athlete_id)
);
CREATE TABLE IF NOT EXISTS espn_standings (
  season INTEGER, conference_id INTEGER, conference_name TEXT, team_id INTEGER,
  conf_wins INTEGER, conf_losses INTEGER, overall_wins INTEGER, overall_losses INTEGER,
  home_record TEXT, away_record TEXT, streak TEXT, vs_ap_record TEXT, playoff_seed INTEGER,
  PRIMARY KEY (season, team_id)
);
CREATE TABLE IF NOT EXISTS espn_news (
  id TEXT PRIMARY KEY,
  headline TEXT, description TEXT, published TEXT, story_type TEXT,
  premium INTEGER, link TEXT, image TEXT, categories TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


# ---------------------------------------------------------------- teams

def scrape_teams(conn: sqlite3.Connection) -> int:
    data = get_json(f"{SITE}/teams", {"limit": 500})
    if not data:
        print("teams: request failed", file=sys.stderr)
        return 0
    rows = []
    for wrapper in data["sports"][0]["leagues"][0]["teams"]:
        t = wrapper["team"]
        logos = t.get("logos") or []
        rows.append((
            int(t["id"]), t.get("slug"), t.get("abbreviation"), t.get("displayName"),
            t.get("shortDisplayName"), t.get("nickname"), t.get("location"),
            t.get("color"), t.get("alternateColor"),
            logos[0]["href"] if logos else None,
        ))
    conn.executemany(
        """INSERT INTO espn_teams (id, slug, abbreviation, display_name, short_name, nickname,
           location, color, alt_color, logo) VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, abbreviation=excluded.abbreviation,
           display_name=excluded.display_name, short_name=excluded.short_name,
           nickname=excluded.nickname, location=excluded.location, color=excluded.color,
           alt_color=excluded.alt_color, logo=excluded.logo, updated_at=CURRENT_TIMESTAMP""",
        rows,
    )
    conn.commit()
    print(f"teams: upserted {len(rows)}")
    return len(rows)


# ---------------------------------------------------------------- games

def iter_season_days(start: date, end: date) -> Iterable[date]:
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def scrape_games(conn: sqlite3.Connection, start: date = SEASON_START, end: date = SEASON_END) -> int:
    total = 0
    for day in iter_season_days(start, end):
        stamp = day.strftime("%Y%m%d")
        data = get_json(f"{SITE}/scoreboard", {"dates": stamp, "groups": 50, "limit": 400})
        events = (data or {}).get("events", [])
        rows = []
        for e in events:
            comp = e["competitions"][0]
            venue = comp.get("venue") or {}
            address = venue.get("address") or {}
            status = e.get("status", {}).get("type", {})
            home = away = None
            for c in comp.get("competitors", []):
                if c.get("homeAway") == "home":
                    home = c
                elif c.get("homeAway") == "away":
                    away = c
            if not home or not away:
                continue
            broadcasts = comp.get("broadcasts") or []
            names = broadcasts[0].get("names") if broadcasts else None
            notes = comp.get("notes") or []
            rows.append((
                int(e["id"]), SEASON, e.get("date"), e.get("name"), e.get("shortName"),
                venue.get("fullName"), address.get("city"), address.get("state"),
                comp.get("attendance"),
                1 if comp.get("neutralSite") else 0,
                1 if comp.get("conferenceCompetition") else 0,
                status.get("name"), 1 if status.get("completed") else 0,
                int(home["team"]["id"]), int(home["score"]) if home.get("score") not in (None, "") else None,
                int(away["team"]["id"]), int(away["score"]) if away.get("score") not in (None, "") else None,
                1 if home.get("winner") else 0,
                ",".join(names) if names else None,
                notes[0].get("headline") if notes else None,
            ))
        if rows:
            conn.executemany(
                """INSERT INTO espn_games (id, season, game_date, name, short_name, venue, city, state,
                   attendance, neutral_site, conference_game, status, completed, home_id, home_score,
                   away_id, away_score, home_winner, broadcast, notes)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET status=excluded.status, completed=excluded.completed,
                   home_score=excluded.home_score, away_score=excluded.away_score,
                   home_winner=excluded.home_winner, attendance=excluded.attendance,
                   updated_at=CURRENT_TIMESTAMP""",
                rows,
            )
            conn.commit()
        total += len(rows)
        print(f"games {day}: {len(rows)} (total {total})", flush=True)
    return total


# ---------------------------------------------------------------- rankings

def scrape_rankings(conn: sqlite3.Connection) -> int:
    data = get_json(f"{SITE}/rankings")
    if not data:
        print("rankings: request failed", file=sys.stderr)
        return 0
    count = 0
    for poll in data.get("rankings", []):
        poll_name = poll.get("name")
        week = (poll.get("occurrence") or {}).get("value") or 0
        for entry in poll.get("ranks", []):
            team = entry.get("team") or {}
            conn.execute(
                """INSERT OR REPLACE INTO espn_rankings
                   (poll, season, week, team_id, rank, points, first_place_votes, trend, record)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    poll_name, SEASON, week, int(team.get("id", 0)),
                    entry.get("current"), entry.get("points"),
                    entry.get("firstPlaceVotes"), entry.get("trend"),
                    entry.get("recordSummary"),
                ),
            )
            count += 1
    conn.commit()
    print(f"rankings: {count} entries")
    return count


# ---------------------------------------------------------------- rosters

def scrape_rosters(conn: sqlite3.Connection, team_ids: list[int]) -> int:
    total = 0
    for i, team_id in enumerate(team_ids):
        data = get_json(f"{SITE}/teams/{team_id}/roster")
        athletes = (data or {}).get("athletes", [])
        rows = []
        for a in athletes:
            birthplace = a.get("birthPlace") or {}
            rows.append((
                int(a["id"]), team_id, a.get("fullName"), a.get("jersey"),
                (a.get("position") or {}).get("abbreviation"),
                a.get("displayHeight"), a.get("weight"),
                (a.get("experience") or {}).get("displayValue"),
                birthplace.get("city"), birthplace.get("state"),
            ))
        if rows:
            conn.executemany(
                """INSERT INTO espn_athletes (id, team_id, full_name, jersey, position, height,
                   weight, class_year, hometown_city, hometown_state)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id, full_name=excluded.full_name,
                   jersey=excluded.jersey, position=excluded.position, height=excluded.height,
                   weight=excluded.weight, class_year=excluded.class_year,
                   hometown_city=excluded.hometown_city, hometown_state=excluded.hometown_state,
                   updated_at=CURRENT_TIMESTAMP""",
                rows,
            )
            conn.commit()
        total += len(rows)
        if (i + 1) % 25 == 0:
            print(f"rosters: {i + 1}/{len(team_ids)} teams ({total} athletes)", flush=True)
    print(f"rosters: done, {total} athletes")
    return total


# ---------------------------------------------------------------- team stats

def scrape_team_stats(conn: sqlite3.Connection, team_ids: list[int]) -> int:
    total = 0
    for i, team_id in enumerate(team_ids):
        data = get_json(f"{CORE}/seasons/{SEASON}/types/2/teams/{team_id}/statistics")
        cats = ((data or {}).get("splits") or {}).get("categories", [])
        rows = []
        for cat in cats:
            for s in cat.get("stats", []):
                rows.append((
                    team_id, SEASON, cat.get("name"), s.get("name"),
                    s.get("value"), s.get("displayValue"), s.get("perGameValue"),
                ))
        if rows:
            conn.executemany(
                """INSERT OR REPLACE INTO espn_team_stats
                   (team_id, season, category, name, value, display, per_game)
                   VALUES (?,?,?,?,?,?,?)""",
                rows,
            )
            conn.commit()
        total += len(rows)
        if (i + 1) % 25 == 0:
            print(f"team-stats: {i + 1}/{len(team_ids)} teams", flush=True)
    print(f"team-stats: done, {total} stat rows")
    return total


# ---------------------------------------------------------------- leaders

def scrape_leaders(conn: sqlite3.Connection, team_ids: list[int]) -> int:
    total = 0
    for i, team_id in enumerate(team_ids):
        data = get_json(f"{CORE}/seasons/{SEASON}/types/2/teams/{team_id}/leaders")
        cats = (data or {}).get("categories", [])
        rows = []
        for cat in cats:
            for leader in cat.get("leaders", [])[:3]:
                ref = (leader.get("athlete") or {}).get("$ref", "")
                athlete_id = ref.rstrip("/").split("/")[-1].split("?")[0]
                if not athlete_id.isdigit():
                    continue
                rows.append((
                    team_id, SEASON, cat.get("name"), int(athlete_id),
                    leader.get("value"), leader.get("displayValue"),
                ))
        if rows:
            conn.executemany(
                """INSERT OR REPLACE INTO espn_leaders
                   (team_id, season, category, athlete_id, value, display)
                   VALUES (?,?,?,?,?,?)""",
                rows,
            )
            conn.commit()
        total += len(rows)
        if (i + 1) % 25 == 0:
            print(f"leaders: {i + 1}/{len(team_ids)} teams", flush=True)
    print(f"leaders: done, {total} rows")
    return total


# ---------------------------------------------------------------- standings

def scrape_standings(conn: sqlite3.Connection) -> int:
    groups = get_json(f"{CORE}/seasons/{SEASON}/types/2/groups/50/children", {"limit": 60})
    if not groups:
        print("standings: groups request failed", file=sys.stderr)
        return 0
    total = 0
    for item in groups.get("items", []):
        ref = item.get("$ref", "")
        group_id = ref.rstrip("/").split("/")[-1].split("?")[0]
        if not group_id.isdigit():
            continue
        detail = get_json(f"{WEB}/standings", {"season": SEASON, "group": group_id})
        if not detail:
            continue
        conf_name = detail.get("name")
        entries = ((detail.get("children") or [{}])[0].get("standings") or detail.get("standings") or {}).get("entries", [])
        for entry in entries:
            team = entry.get("team") or {}
            by_type = {s.get("type"): s for s in entry.get("stats", [])}

            def ival(typ: str) -> Optional[int]:
                s = by_type.get(typ)
                return int(s["value"]) if s and s.get("value") is not None else None

            def summary(typ: str) -> Optional[str]:
                s = by_type.get(typ)
                return s.get("summary") or s.get("displayValue") if s else None

            conn.execute(
                """INSERT OR REPLACE INTO espn_standings
                   (season, conference_id, conference_name, team_id, conf_wins, conf_losses,
                    overall_wins, overall_losses, home_record, away_record, streak,
                    vs_ap_record, playoff_seed)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    SEASON, int(group_id), conf_name, int(team.get("id", 0)),
                    ival("vsconf_wins"), ival("vsconf_losses"),
                    ival("wins"), ival("losses"),
                    summary("home"), summary("road"), summary("streak"),
                    summary("vsaprankedteams"), ival("playoffseed"),
                ),
            )
            # also map conference onto the team row
            conn.execute(
                "UPDATE espn_teams SET conference_id=?, conference_name=? WHERE id=?",
                (int(group_id), conf_name, int(team.get("id", 0))),
            )
            total += 1
        conn.commit()
        print(f"standings: {conf_name}: {len(entries)} teams", flush=True)
    print(f"standings: done, {total} rows")
    return total


# ---------------------------------------------------------------- news

def scrape_news(conn: sqlite3.Connection, limit: int = 50) -> int:
    data = get_json(f"{SITE}/news", {"limit": limit})
    if not data:
        print("news: request failed", file=sys.stderr)
        return 0
    count = 0
    for a in data.get("articles", []):
        links = a.get("links") or {}
        web = (links.get("web") or {}).get("href")
        images = a.get("images") or []
        cats = [c.get("description") for c in (a.get("categories") or []) if c.get("description")]
        conn.execute(
            """INSERT OR REPLACE INTO espn_news
               (id, headline, description, published, story_type, premium, link, image, categories)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                str(a.get("dataSourceIdentifier") or a.get("id") or web),
                a.get("headline"), a.get("description"), a.get("published"),
                a.get("type"), 1 if a.get("premium") else 0, web,
                images[0].get("url") if images else None,
                json.dumps(cats),
            ),
        )
        count += 1
    conn.commit()
    print(f"news: {count} articles")
    return count


# ---------------------------------------------------------------- main

def main() -> None:
    parser = argparse.ArgumentParser(description="ESPN MBB public data scraper")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--teams", action="store_true")
    parser.add_argument("--games", action="store_true")
    parser.add_argument("--rankings", action="store_true")
    parser.add_argument("--rosters", action="store_true")
    parser.add_argument("--team-stats", action="store_true")
    parser.add_argument("--leaders", action="store_true")
    parser.add_argument("--standings", action="store_true")
    parser.add_argument("--news", action="store_true")
    parser.add_argument("--start", type=str, help="games start date YYYY-MM-DD")
    parser.add_argument("--end", type=str, help="games end date YYYY-MM-DD")
    args = parser.parse_args()

    conn = connect()
    ensure_schema(conn)

    if args.all or args.teams:
        scrape_teams(conn)
    if args.all or args.standings:
        scrape_standings(conn)
    if args.all or args.games:
        start = datetime.strptime(args.start, "%Y-%m-%d").date() if args.start else SEASON_START
        end = datetime.strptime(args.end, "%Y-%m-%d").date() if args.end else SEASON_END
        scrape_games(conn, start, end)
    if args.all or args.rankings:
        scrape_rankings(conn)
    team_ids = [r[0] for r in conn.execute("SELECT id FROM espn_teams ORDER BY id")]
    if args.all or args.rosters:
        scrape_rosters(conn, team_ids)
    if args.all or args.team_stats:
        scrape_team_stats(conn, team_ids)
    if args.all or args.leaders:
        scrape_leaders(conn, team_ids)
    if args.all or args.news:
        scrape_news(conn)
    conn.close()


if __name__ == "__main__":
    main()
