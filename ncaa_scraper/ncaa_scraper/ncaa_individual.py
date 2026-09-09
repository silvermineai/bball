"""Individual player season stats + team directory across D1/D2/D3.

Scrapes stats.ncaa.org national ranking pages (final statistics period) for
men's basketball. Each individual stat page lists EVERY qualifying player
with class, height, position, and counting stats — merged by player id this
yields a season stat line for ~1,500 players per division.

Also captures the per-division team directory (id, name, conference, record)
from the team Scoring Offense page.

Tables written to data/ncaa_mbb.sqlite3:
  ncaa_players(player_id PK, division, name, team_name, team_ncaa_id,
               conference, class_year, height, position, games, ...stats)
  ncaa_team_directory(team_ncaa_id PK, division, name, conference, record,
                      wins, losses, ppg)

Run:  python -m ncaa_scraper.ncaa_individual --divisions 1 2 3
"""

from __future__ import annotations

import argparse
import ast
import html as htmllib
import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from .fetcher import ScraplingNCAAFetcher

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "data" / "ncaa_mbb.sqlite3"
PUBLIC_PATH = REPO_ROOT / "frontend" / "public" / "data" / "basketball" / "ncaa-individual.json"
SQL_PATH = REPO_ROOT / ".local" / "ncaa-individual.sql"

YEAR = "2026.0"
SPORT = "MBB"

# Individual stat pages: stat_seq -> slug. The final-statistics navigation
# currently publishes assists-per-game at 140.0. Keep the older sequence as a
# fallback because NCAA has changed stat identifiers between editions.
INDIVIDUAL_STATS = {
    "136.0": "ppg",       # Points Per Game (also G, FGM, 3FG, FT, PTS)
    "137.0": "rpg",       # Rebounds Per Game (also REB)
    "140.0": "apg",       # Assists Per Game (also AST)
    "139.0": "spg",       # Steals Per Game
    "138.0": "bpg",       # Blocks Per Game
    "141.0": "fg_pct",    # FG% (also FGM/FGA)
    "143.0": "three_pct", # 3P% (also 3FG/3FGA)
    "142.0": "ft_pct",    # FT%
    "144.0": "threes_pg", # Three Pointers Per Game
    "628.0": "mpg",       # Minutes Per Game
    "473.0": "ast_to",    # Assist/Turnover Ratio
    "556.0": "dbl_dbl",   # Double doubles
}
STAT_FALLBACKS = {"apg": ("216.0",)}

TEAM_SCORING_STAT = "145.0"  # team Scoring Offense: G, W-L, PTS, PPG

SCHEMA = """
CREATE TABLE IF NOT EXISTS ncaa_players (
  player_id INTEGER PRIMARY KEY,
  division INTEGER,
  name TEXT, team_name TEXT, team_ncaa_id INTEGER, conference TEXT,
  class_year TEXT, height TEXT, position TEXT, games INTEGER,
  ppg REAL, rpg REAL, apg REAL, spg REAL, bpg REAL,
  fg_pct REAL, three_pct REAL, ft_pct REAL, threes_pg REAL,
  mpg REAL, ast_to REAL, dbl_dbl REAL,
  pts INTEGER, reb INTEGER, ast INTEGER, fgm INTEGER, fga INTEGER,
  three_fgm INTEGER, three_fga INTEGER, ftm INTEGER,
  ppg_rank INTEGER, rpg_rank INTEGER, apg_rank INTEGER,
  spg_rank INTEGER, bpg_rank INTEGER, fg_pct_rank INTEGER,
  three_pct_rank INTEGER, ft_pct_rank INTEGER, threes_pg_rank INTEGER,
  mpg_rank INTEGER, ast_to_rank INTEGER, dbl_dbl_rank INTEGER,
  source_stats_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ncaa_players_division ON ncaa_players(division);
CREATE TABLE IF NOT EXISTS ncaa_team_directory (
  team_ncaa_id INTEGER PRIMARY KEY,
  division INTEGER, name TEXT, conference TEXT,
  games INTEGER, wins INTEGER, losses INTEGER, ppg REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")


def clean(cell: str) -> str:
    return htmllib.unescape(TAG_RE.sub("", cell)).replace("\\n", " ").replace("\\t", " ").strip()


def to_num(text: str):
    text = text.replace("\\n", " ").replace("\\t", " ").replace("\\r", " ")
    text = text.replace(",", "").strip()
    if not text or text == "-":
        return None
    # NCAA minutes are rendered as MM:SS on the minutes-per-game table.
    if re.fullmatch(r"\d+:\d{2}", text):
        minutes, seconds = text.split(":")
        return int(minutes) + int(seconds) / 60
    try:
        return float(text) if "." in text else int(text)
    except ValueError:
        return None


def decode_html(value: str) -> str:
    """Decode cached Scrapling byte reprs without changing live fetch policy.

    Older cached responses were written as ``repr(bytes)`` (for example
    ``b'<html>\\n...'``).  Newer responses may be plain text.  Supporting both
    formats keeps the parser deterministic and lets us reprocess an existing
    cache without making another request to a source whose robots policy has
    changed.
    """
    text = value
    if text.startswith(("b'", 'b"')):
        try:
            decoded = ast.literal_eval(text)
            if isinstance(decoded, bytes):
                return decoded.decode("utf-8", errors="replace")
        except (SyntaxError, ValueError):
            pass
    return text.replace("\\n", "\n").replace("\\t", "\t").replace("\\r", "\r").replace("\\'", "'")


def team_key(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", value or "").casefold()
    return "".join(ch for ch in normalized if ch.isalnum())


def final_period(fetcher: ScraplingNCAAFetcher, division: str) -> str | None:
    html = decode_html(fetcher.fetch(
        f"/rankings/change_sport_year_div?academic_year={YEAR}&division={division}&sport_code={SPORT}",
        cache_key=f"rk_change_{SPORT}_{division}",
    ))
    m = re.search(r'<option value="([\d.]+)"[^>]*>[^<]*Final Statistics</option>', html)
    return m.group(1) if m else None


def parse_table(html: str):
    """Yield (headers, row_html, cells) for the ranking table."""
    headers = [clean(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", html, re.DOTALL)]
    body = re.search(r"<tbody>(.*?)</tbody>", html, re.DOTALL)
    if not body:
        return headers, []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", body.group(1), re.DOTALL)
    return headers, rows


def invalid_ranking_page(html: str) -> bool:
    """Identify the short error body returned for an obsolete stat sequence."""
    return bool(re.search(r"invalid ranking period", decode_html(html), re.I))


def _json_number(value):
    if isinstance(value, bool) or value is None:
        return None
    return value if isinstance(value, (int, float)) else None


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Create the schema and upgrade an older local snapshot cache in place."""
    conn.executescript(SCHEMA)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(ncaa_players)")}
    if "source_stats_json" not in columns:
        conn.execute("ALTER TABLE ncaa_players ADD COLUMN source_stats_json TEXT")
    rank_columns = (
        "spg_rank", "bpg_rank", "fg_pct_rank", "three_pct_rank", "ft_pct_rank",
        "threes_pg_rank", "mpg_rank", "ast_to_rank", "dbl_dbl_rank",
    )
    for column in rank_columns:
        if column not in columns:
            conn.execute(f"ALTER TABLE ncaa_players ADD COLUMN {column} INTEGER")
    conn.commit()


def export_release(conn: sqlite3.Connection) -> dict:
    """Create a compact, public derivative of the NCAA national snapshots."""
    team_ids = {
        (int(division), team_key(name)): int(team_id)
        for team_id, division, name in conn.execute(
            "SELECT team_ncaa_id,division,name FROM ncaa_team_directory WHERE team_ncaa_id IS NOT NULL"
        )
    }
    columns = [row[1] for row in conn.execute("PRAGMA table_info(ncaa_players)")]
    players = []
    for row in conn.execute("SELECT * FROM ncaa_players ORDER BY division, ppg_rank IS NULL, ppg_rank, name, player_id"):
        item = dict(zip(columns, row))
        item.pop("updated_at", None)
        raw_source_stats = item.pop("source_stats_json", None)
        if raw_source_stats:
            try:
                source_stats = json.loads(raw_source_stats)
            except (TypeError, ValueError):
                source_stats = None
            if isinstance(source_stats, dict) and source_stats:
                item["source_stats"] = source_stats
                # Older local snapshots retained each publisher rank only in
                # source_stats_json. Promote those ranks into typed columns
                # during export so a rebuild does not need another fetch.
                for slug in INDIVIDUAL_STATS.values():
                    key = f"{slug}_rank"
                    if item.get(key) is None:
                        source_rank = source_stats.get(slug, {}).get("rank")
                        if isinstance(source_rank, (int, float)) and source_rank == int(source_rank):
                            item[key] = int(source_rank)
        item["team_ncaa_id"] = item.get("team_ncaa_id") or team_ids.get((item["division"], team_key(item.get("team_name"))))
        item = {k: _json_number(v) if isinstance(v, (int, float)) and k not in {"player_id", "division", "games", "pts", "reb", "ast", "fgm", "fga", "three_fgm", "three_fga", "ftm", "ppg_rank", "rpg_rank", "apg_rank"} else v for k, v in item.items()}
        players.append(item)
    coverage = {}
    for division in (1, 2, 3):
        rows = [p for p in players if p["division"] == division]
        coverage[str(division)] = {
            "players": len(rows),
            "ppg": sum(p.get("ppg") is not None for p in rows),
            "rpg": sum(p.get("rpg") is not None for p in rows),
            "apg": sum(p.get("apg") is not None for p in rows),
            "mpg": sum(p.get("mpg") is not None for p in rows),
        }
    updated = [p[0] for p in conn.execute("SELECT updated_at FROM ncaa_players WHERE updated_at IS NOT NULL")]
    generated = max(updated) if updated else None
    if generated:
        parsed = datetime.fromisoformat(generated.replace("Z", "+00:00"))
        # SQLite CURRENT_TIMESTAMP is UTC but stores a naive value. Treat it
        # as UTC explicitly; otherwise astimezone() interprets it as local
        # time and makes a fresh release appear hours in the future.
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        generated = parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": 2,
        "season": 2026,
        "generated_at": generated,
        "attribution": {
            "publisher": "NCAA Statistics",
            "source": "https://stats.ncaa.org/rankings/national_ranking",
            "method": "Cached final national-ranking snapshots fetched with robots.txt checks; normalized measures and complete retained source rows are a public derivative, not a page mirror.",
        },
        "coverage": {"players": len(players), "divisions": coverage},
        "players": players,
    }


def quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def export_sql(conn: sqlite3.Connection, release: dict) -> str:
    """Export idempotent D1 rows while retaining the complete source payload."""
    lines = [
        "CREATE TABLE IF NOT EXISTS ncaa_individual_players (season INTEGER NOT NULL, division INTEGER NOT NULL, player_id TEXT NOT NULL, name TEXT NOT NULL, team_name TEXT, ppg REAL, rpg REAL, apg REAL, mpg REAL, ppg_rank INTEGER, payload_json TEXT NOT NULL, PRIMARY KEY(season, division, player_id));",
        "CREATE INDEX IF NOT EXISTS ncaa_individual_division ON ncaa_individual_players(season, division, ppg_rank);",
        "DELETE FROM ncaa_individual_players WHERE season=2026;",
    ]
    for player in release["players"]:
        lines.append(
            "INSERT OR REPLACE INTO ncaa_individual_players (season,division,player_id,name,team_name,ppg,rpg,apg,mpg,ppg_rank,payload_json) VALUES ("
            + ",".join(map(quote, [2026, player["division"], player["player_id"], player["name"], player.get("team_name"), player.get("ppg"), player.get("rpg"), player.get("apg"), player.get("mpg"), player.get("ppg_rank"), json.dumps(player, ensure_ascii=False, separators=(",", ":"))]))
            + ");"
        )
    return "\n".join(lines) + "\n"


def scrape_division(fetcher: ScraplingNCAAFetcher, conn: sqlite3.Connection, division: str) -> None:
    div_int = int(float(division))
    period = final_period(fetcher, division)
    if not period:
        print(f"[individual] d{div_int}: no final period found", flush=True)
        return
    print(f"[individual] d{div_int}: final period {period}", flush=True)

    # ---- team directory from team scoring offense
    url = f"/rankings/national_ranking?academic_year={YEAR}&division={division}&ranking_period={period}&sport_code={SPORT}&stat_seq={TEAM_SCORING_STAT}"
    html = decode_html(fetcher.fetch(url, cache_key=f"rk_{SPORT}_d{div_int}_teamscoring"))
    headers, rows = parse_table(html)
    count = 0
    for row in rows:
        cells = [clean(c) for c in CELL_RE.findall(row)]
        if len(cells) < 6:
            continue
        team_link = re.search(r'href="/teams/(\d+)"', row)
        m = re.match(r"(.*?)\s*\(([^)]*)\)\s*$", cells[1])
        name, conf = (m.group(1), m.group(2)) if m else (cells[1], None)
        wl = re.match(r"(\d+)-(\d+)", cells[3] or "")
        conn.execute(
            """INSERT INTO ncaa_team_directory (team_ncaa_id, division, name, conference, games, wins, losses, ppg)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(team_ncaa_id) DO UPDATE SET division=excluded.division, name=excluded.name,
               conference=excluded.conference, games=excluded.games, wins=excluded.wins,
               losses=excluded.losses, ppg=excluded.ppg, updated_at=CURRENT_TIMESTAMP""",
            (
                int(team_link.group(1)) if team_link else None,
                div_int, name, conf, to_num(cells[2]),
                int(wl.group(1)) if wl else None, int(wl.group(2)) if wl else None,
                to_num(cells[-1]),
            ),
        )
        count += 1
    conn.commit()
    print(f"[individual] d{div_int}: team directory {count} teams", flush=True)

    # ---- individual stats
    for stat_seq, slug in INDIVIDUAL_STATS.items():
        url = f"/rankings/national_ranking?academic_year={YEAR}&division={division}&ranking_period={period}&sport_code={SPORT}&stat_seq={stat_seq}"
        try:
            # Include the sequence in the APG cache key so its old invalid
            # response cannot mask the corrected URL. Preserve established
            # keys for every other measure so an offline refresh reuses them.
            cache_key = (
                f"rk_{SPORT}_d{div_int}_{slug}_{stat_seq.replace('.', '_')}"
                if slug == "apg"
                else f"rk_{SPORT}_d{div_int}_{slug}"
            )
            html = fetcher.fetch(url, cache_key=cache_key)
            if invalid_ranking_page(html):
                raise ValueError("Invalid ranking period")
        except Exception as exc:
            html = None
            for fallback in STAT_FALLBACKS.get(slug, ()):
                fallback_url = f"/rankings/national_ranking?academic_year={YEAR}&division={division}&ranking_period={period}&sport_code={SPORT}&stat_seq={fallback}"
                try:
                    candidate = fetcher.fetch(fallback_url, cache_key=f"rk_{SPORT}_d{div_int}_{slug}_{fallback.replace('.', '_')}")
                    if not invalid_ranking_page(candidate):
                        html = candidate
                        break
                except Exception:
                    pass
            if html is None:
                print(f"[individual] d{div_int} {slug}: fetch failed {exc}", flush=True)
                continue
        html = decode_html(html)
        headers, rows = parse_table(html)
        # header indices: first 6 are Rank, Player, Cl, Ht, Pos, G
        added = 0
        for row in rows:
            raw_cells = CELL_RE.findall(row)
            cells = [clean(c) for c in raw_cells]
            if len(cells) < 7:
                continue
            player_link = re.search(r'href="/players/(\d+)"', row)
            team_link = re.search(r'href="/teams/(\d+)"', row)
            if not player_link:
                continue
            pid = int(player_link.group(1))
            pm = re.match(r"(.*?),\s*(.*?)\s*\(([^)]*)\)\s*$", cells[1])
            pname, tname, conf = (pm.group(1), pm.group(2), pm.group(3)) if pm else (cells[1], None, None)
            rank = to_num(cells[0])
            value = to_num(cells[-1])
            games = to_num(cells[5])

            # Keep the complete publisher row for audit/export. The normalized
            # columns below power the leaderboard, while this payload retains
            # unfamiliar or newly added fields without guessing their meaning.
            existing = conn.execute(
                "SELECT source_stats_json FROM ncaa_players WHERE player_id=?",
                (pid,),
            ).fetchone()
            source_stats = {}
            if existing and existing[0]:
                try:
                    decoded = json.loads(existing[0])
                    if isinstance(decoded, dict):
                        source_stats.update(decoded)
                except (TypeError, ValueError):
                    pass
            source_stats[slug] = {
                "headers": headers,
                "cells": cells,
                "rank": rank,
                "value": value,
            }

            conn.execute(
                """INSERT INTO ncaa_players (player_id, division, name, team_name, team_ncaa_id, conference,
                   class_year, height, position, games, source_stats_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(player_id) DO UPDATE SET division=excluded.division,
                   class_year=COALESCE(excluded.class_year, ncaa_players.class_year),
                   games=COALESCE(excluded.games, ncaa_players.games),
                   team_ncaa_id=COALESCE(excluded.team_ncaa_id, ncaa_players.team_ncaa_id),
                   source_stats_json=excluded.source_stats_json,
                   updated_at=CURRENT_TIMESTAMP""",
                (
                    pid, div_int, pname, tname,
                    int(team_link.group(1)) if team_link else None,
                    conf, cells[2] or None, cells[3] or None, cells[4] or None, games,
                    json.dumps(source_stats, ensure_ascii=False, separators=(",", ":")),
                ),
            )
            conn.execute(f"UPDATE ncaa_players SET {slug}=? WHERE player_id=?", (value, pid))
            if rank is not None:
                conn.execute(f"UPDATE ncaa_players SET {slug}_rank=? WHERE player_id=?", (int(rank), pid))

            # counting stats from the PPG page (FGM, 3FG, FT, PTS) and others
            if slug == "ppg" and len(cells) >= 11:
                conn.execute(
                    "UPDATE ncaa_players SET fgm=?, three_fgm=?, ftm=?, pts=? WHERE player_id=?",
                    (to_num(cells[6]), to_num(cells[7]), to_num(cells[8]), to_num(cells[9]), pid),
                )
            elif slug == "rpg" and len(cells) >= 8:
                conn.execute("UPDATE ncaa_players SET reb=? WHERE player_id=?", (to_num(cells[6]), pid))
            elif slug == "apg" and len(cells) >= 8:
                conn.execute("UPDATE ncaa_players SET ast=? WHERE player_id=?", (to_num(cells[6]), pid))
            elif slug == "fg_pct" and len(cells) >= 9:
                conn.execute("UPDATE ncaa_players SET fgm=?, fga=? WHERE player_id=?", (to_num(cells[6]), to_num(cells[7]), pid))
            elif slug == "three_pct" and len(cells) >= 9:
                conn.execute(
                    "UPDATE ncaa_players SET three_fgm=?, three_fga=? WHERE player_id=?",
                    (to_num(cells[6]), to_num(cells[7]), pid),
                )
            added += 1
        conn.commit()
        print(f"[individual] d{div_int} {slug}: {added} players", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--divisions", nargs="+", default=["1", "2", "3"])
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    ensure_schema(conn)
    fetcher = ScraplingNCAAFetcher()
    for division in args.divisions:
        div = division if "." in division else f"{division}.0"
        scrape_division(fetcher, conn, div)
    release = export_release(conn)
    PUBLIC_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_PATH.write_text(json.dumps(release, ensure_ascii=False, separators=(",", ":")) + "\n")
    SQL_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQL_PATH.write_text(export_sql(conn, release))
    print(f"[individual] published {len(release['players']):,} players to {PUBLIC_PATH}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
