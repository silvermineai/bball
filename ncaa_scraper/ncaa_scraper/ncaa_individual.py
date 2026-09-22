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
import os
import re
import sqlite3
import tempfile
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

# Typed totals carried alongside the ranking measure on each publisher page.
# Retaining these cells matters most outside Division I, where an attributed
# player-box supplement is not available. The complete source row remains in
# ``source_stats_json``; this mapping only promotes known columns so they can
# be queried without parsing display strings downstream.
SOURCE_TOTAL_FIELDS = {
    "ppg": ((6, "fgm"), (7, "three_fgm"), (8, "ftm"), (9, "pts")),
    "rpg": ((6, "reb"),),
    "apg": ((6, "ast"),),
    "spg": ((6, "stl"),),
    "bpg": ((6, "blk"),),
    "fg_pct": ((6, "fgm"), (7, "fga")),
    "three_pct": ((6, "three_fgm"), (7, "three_fga")),
    "ft_pct": ((6, "ftm"), (7, "fta")),
    "threes_pg": ((6, "three_fgm"),),
    "mpg": ((6, "mins"),),
    "ast_to": ((6, "ast"), (7, "tov")),
}

PLAYER_STAT_FIELDS = (
    "ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct",
    "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "ast", "stl",
    "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta",
    "mins",
)

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
  fta INTEGER, stl INTEGER, blk INTEGER, tov INTEGER, mins REAL,
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


def source_totals(slug: str, cells: list[str]) -> dict[str, int | float | None]:
    """Promote known counting columns from a retained publisher row."""
    return {
        field: to_num(cells[index])
        for index, field in SOURCE_TOTAL_FIELDS.get(slug, ())
        if index < len(cells)
    }


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


CLASS_SUFFIX_RE = re.compile(
    r",\s*(?:Fr|So|Jr|Sr|R-?Fr|R-?So|R-?Jr|R-?Sr|Grad|Gr)\.?\s*$",
    re.IGNORECASE,
)


def parse_player_identity(label: str, team_names: dict[str, str] | None = None) -> tuple[str, str | None, str | None]:
    """Split the NCAA display label into player, canonical team and conference.

    Most ranking rows are ``Player, Team (Conference)``.  A source-side name
    suffix occasionally adds a class marker before the team (for example
    ``Darin Smith, Jr., Central Conn. St. (NEC)``).  Splitting at the first
    comma therefore mislabels the team and prevents the player from joining to
    the NCAA team directory.  Resolve the longest suffix against the
    division's own directory, then remove only the optional class marker.
    """
    text = str(label or "").strip()
    conference = None
    match = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", text)
    if match:
        text, conference = match.group(1).strip(), match.group(2).strip() or None

    parts = [part.strip() for part in text.split(",") if part.strip()]
    player = text
    team = None
    aliases = team_names or {}
    # The first matching suffix is the longest because we iterate from the
    # earliest separator.  This preserves schools whose names contain commas.
    for index in range(1, len(parts)):
        candidate = ", ".join(parts[index:])
        canonical = aliases.get(team_key(candidate))
        if canonical:
            player = ", ".join(parts[:index])
            team = canonical
            break
    if team is None and len(parts) > 1:
        # Retain a useful fallback for a source label whose team is missing
        # from the directory; callers can expose the unresolved identity.
        team = parts[-1]
        player = ", ".join(parts[:-1])
    player = CLASS_SUFFIX_RE.sub("", player).strip(" ,")
    return player, team, conference


def final_period(fetcher: ScraplingNCAAFetcher, division: str) -> str | None:
    html = decode_html(fetcher.fetch(
        f"/rankings/change_sport_year_div?academic_year={YEAR}&division={division}&sport_code={SPORT}",
        cache_key=f"rk_change_{SPORT}_{division}",
    ))
    # The change page can retain several historical periods whose labels all
    # contain “Final Statistics”.  Prefer the option the publisher marked as
    # selected; falling back to the first matching option keeps older cached
    # pages (which did not include the selected attribute) deterministic.
    options = re.findall(r"<option\b([^>]*)>(.*?)</option>", html, re.DOTALL | re.IGNORECASE)
    matching: list[tuple[str, bool]] = []
    for attrs, label in options:
        value = re.search(r'\bvalue=["\']([\d.]+)["\']', attrs, re.IGNORECASE)
        if not value or not re.search(r"Final Statistics", htmllib.unescape(TAG_RE.sub("", label)), re.IGNORECASE):
            continue
        selected = bool(re.search(r"\bselected(?:\s*=|\s|$)", attrs, re.IGNORECASE))
        matching.append((value.group(1), selected))
    for value, selected in matching:
        if selected:
            return value
    return matching[0][0] if matching else None


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


def discover_stat_sequences(html: str, label: str) -> tuple[str, ...]:
    """Read the publisher's current stat-sequence links from a ranking page.

    NCAA has reused different ``stat_seq`` values for the same measure over
    time.  A hard-coded fallback can therefore leave a division with an empty
    field even while the source page advertises a valid link.  Only exact
    links whose visible label matches the requested measure are accepted; the
    caller still validates the response and keeps the bounded fallback list.
    """
    decoded = decode_html(html)
    wanted = re.sub(r"\s+", " ", label).strip().casefold()
    found: list[str] = []
    for attrs, body in re.findall(r"<a\b([^>]*)>(.*?)</a>", decoded, re.DOTALL | re.IGNORECASE):
        text = re.sub(r"\s+", " ", htmllib.unescape(TAG_RE.sub("", body))).strip().casefold()
        if text != wanted:
            continue
        href = re.search(r"(?:stat_seq|statSeq)=([0-9]+(?:\.[0-9]+)?)", htmllib.unescape(attrs), re.IGNORECASE)
        if href and href.group(1) not in found:
            found.append(href.group(1))
    return tuple(found)


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
    value_columns = {
        "fta": "INTEGER",
        "stl": "INTEGER",
        "blk": "INTEGER",
        "tov": "INTEGER",
        "mins": "REAL",
    }
    for column, kind in value_columns.items():
        if column not in columns:
            conn.execute(f"ALTER TABLE ncaa_players ADD COLUMN {column} {kind}")
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
                # Promote totals from retained source rows as well as during a
                # live/cache parse. This upgrades an older SQLite snapshot
                # without another request and makes the source page, rather
                # than a later derived fill, authoritative when both exist.
                for slug, evidence in source_stats.items():
                    if not isinstance(evidence, dict) or not isinstance(evidence.get("cells"), list):
                        continue
                    for field, value in source_totals(slug, evidence["cells"]).items():
                        if value is not None:
                            item[field] = value
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
    teams = []
    for row in conn.execute(
        "SELECT team_ncaa_id,division,name,conference,games,wins,losses,ppg FROM ncaa_team_directory ORDER BY division,name,team_ncaa_id"
    ):
        team_id, division, name, conference, games, wins, losses, ppg = row
        if team_id is None or division not in (1, 2, 3) or not name:
            continue
        teams.append({
            "team_ncaa_id": int(team_id),
            "division": int(division),
            "name": name,
            "conference": conference,
            "games": games,
            "wins": wins,
            "losses": losses,
            "ppg": ppg,
        })
    coverage = {}
    for division in (1, 2, 3):
        rows = [p for p in players if p["division"] == division]
        source_coverage = {}
        for slug in INDIVIDUAL_STATS.values():
            evidence = [
                p.get("source_stats", {}).get(slug)
                for p in rows
                if isinstance(p.get("source_stats"), dict)
            ]
            ranks = [
                item.get("rank")
                for item in evidence
                if isinstance(item, dict)
                and isinstance(item.get("rank"), (int, float))
                and not isinstance(item.get("rank"), bool)
            ]
            source_coverage[slug] = {
                "rows": sum(isinstance(item, dict) for item in evidence),
                "max_rank": max((int(rank) for rank in ranks), default=None),
                "coverage_kind": "qualified_leaderboard",
            }
        coverage[str(division)] = {
            "players": len(rows),
            "team_ncaa_id": sum(p.get("team_ncaa_id") is not None for p in rows),
            "identity_kind": "publisher_player_identity_rows",
            "source_coverage": source_coverage,
            **{
                field: sum(p.get(field) is not None for p in rows)
                for field in PLAYER_STAT_FIELDS
            },
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
        "coverage": {"players": len(players), "teams": len(teams), "divisions": coverage},
        "players": players,
        "teams": teams,
    }


def quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def atomic_write(path: Path, content: str) -> None:
    """Replace a publication file only after its complete bytes are written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


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


def release_is_degraded(previous: dict, candidate: dict) -> bool:
    """Keep a stronger same-season snapshot when a source refresh is sparse.

    NCAA ranking pages can return a short body when a ranking period or stat
    endpoint is unavailable.  The scraper intentionally continues so other
    divisions and measures can be cached, but publishing that partial merge
    would erase a usable public leaderboard. Compare stable coverage counters
    for every division and use conservative floors so a transiently short
    response cannot replace the last good release.
    """
    if previous.get("season") != candidate.get("season"):
        return False
    # Compare publisher-row coverage, not the post-enrichment value matrix.
    # Otherwise an exact-ID box supplement makes the previous release appear
    # more complete than every future ranking snapshot and permanently blocks
    # refreshed source rows from publication. Apply the same guard to every
    # division: a transient D2/D3 page failure must not erase the last
    # source-native lower-division release while D1 remains healthy.
    def direct_division_coverage(release: dict, division: str) -> dict | None:
        players = release.get("players")
        if isinstance(players, list):
            rows = [
                row for row in players
                if isinstance(row, dict) and str(row.get("division")) == division
            ]
            if rows:
                source_rows = [
                    row for row in rows
                    if isinstance(row.get("source_stats"), dict)
                ]
                # A release may have been generated by an older exporter that
                # omitted source_stats. In that case the retained coverage
                # manifest below is the only available evidence.
                if source_rows:
                    return {
                        "players": len(rows),
                        **{
                            slug: sum(
                                isinstance(row.get("source_stats", {}).get(slug), dict)
                                for row in source_rows
                            )
                            for slug in ("ppg", "rpg", "mpg")
                        },
                    }
        divisions = release.get("coverage", {}).get("divisions", {})
        value = divisions.get(division) if isinstance(divisions, dict) else None
        return value if isinstance(value, dict) else None

    for division in ("1", "2", "3"):
        previous_division = direct_division_coverage(previous, division)
        # Do not require a division that the prior snapshot did not contain;
        # this allows a first successful lower-division capture to publish.
        if not isinstance(previous_division, dict):
            continue
        if not any(
            isinstance(previous_division.get(field), (int, float))
            and not isinstance(previous_division.get(field), bool)
            and previous_division[field] > 0
            for field in ("players", "ppg", "rpg", "mpg")
        ):
            continue
        candidate_division = direct_division_coverage(candidate, division)
        if not isinstance(candidate_division, dict):
            return True
        # A release with no players or no points-per-game rows is never a
        # viable replacement. For the remaining counters, tolerate ordinary
        # qualification changes while rejecting an endpoint that collapsed.
        for field, floor in (("players", 0.8), ("ppg", 0.8), ("rpg", 0.5), ("mpg", 0.5)):
            old = previous_division.get(field)
            new = candidate_division.get(field)
            if isinstance(old, (int, float)) and not isinstance(old, bool) and old > 0:
                if not isinstance(new, (int, float)) or isinstance(new, bool) or new < old * floor:
                    return True
    return False


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
    # The team-scoring page carries the source's current navigation links.
    # Keep those exact sequences available for measures whose identifiers have
    # changed between NCAA editions (especially assists per game).
    discovered_sequences = {"apg": discover_stat_sequences(html, "Assists Per Game")}
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

    # National ranking rows only expose a school label, while the directory
    # carries the stable NCAA team ID. Resolve labels within the same division
    # so downstream team joins never depend on a cross-provider name match.
    # Ambiguous normalized labels are omitted and remain explicitly
    # unresolved in the public coverage counts.
    team_rows = conn.execute(
        "SELECT team_ncaa_id,name FROM ncaa_team_directory WHERE division=? AND team_ncaa_id IS NOT NULL",
        (div_int,),
    ).fetchall()
    team_names: dict[str, str] = {}
    for _team_id, name in team_rows:
        key = team_key(name)
        if not key:
            continue
        if key in team_names and team_names[key] != name:
            team_names.pop(key, None)
            continue
        team_names[key] = str(name)
    team_ids = {
        team_key(name): int(team_id)
        for team_id, name in team_rows
        if team_key(name) in team_names
    }

    # ---- individual stats
    for stat_seq, slug in INDIVIDUAL_STATS.items():
        sequences = list(discovered_sequences.get(slug, ()))
        sequences.extend([stat_seq, *STAT_FALLBACKS.get(slug, ())])
        # Preserve order while avoiding duplicate requests when the source
        # advertises the same sequence as the configured current value.
        sequences = list(dict.fromkeys(sequences))
        html = None
        last_error: Exception | None = None
        for candidate_sequence in sequences:
            url = f"/rankings/national_ranking?academic_year={YEAR}&division={division}&ranking_period={period}&sport_code={SPORT}&stat_seq={candidate_sequence}"
            try:
                # Include the sequence in the APG cache key so its old invalid
                # response cannot mask a corrected URL. Preserve established
                # keys for every other measure so an offline refresh reuses them.
                cache_key = (
                    f"rk_{SPORT}_d{div_int}_{slug}_{candidate_sequence.replace('.', '_')}"
                    if slug == "apg"
                    else f"rk_{SPORT}_d{div_int}_{slug}"
                )
                candidate_html = fetcher.fetch(url, cache_key=cache_key)
                if invalid_ranking_page(candidate_html):
                    raise ValueError("Invalid ranking period")
                html = candidate_html
                break
            except Exception as exc:
                last_error = exc
        if html is None:
            print(f"[individual] d{div_int} {slug}: fetch failed {last_error}", flush=True)
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
            pname, tname, conf = parse_player_identity(cells[1], team_names)
            team_ncaa_id = team_ids.get(team_key(tname)) if tname else None
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
                   name=COALESCE(excluded.name, ncaa_players.name),
                   team_name=COALESCE(excluded.team_name, ncaa_players.team_name),
                   conference=COALESCE(excluded.conference, ncaa_players.conference),
                   class_year=COALESCE(excluded.class_year, ncaa_players.class_year),
                   games=COALESCE(excluded.games, ncaa_players.games),
                   team_ncaa_id=COALESCE(excluded.team_ncaa_id, ncaa_players.team_ncaa_id),
                   source_stats_json=excluded.source_stats_json,
                   updated_at=CURRENT_TIMESTAMP""",
                (
                    pid, div_int, pname, tname,
                    team_ncaa_id or (int(team_link.group(1)) if team_link else None),
                    conf, cells[2] or None, cells[3] or None, cells[4] or None, games,
                    json.dumps(source_stats, ensure_ascii=False, separators=(",", ":")),
                ),
            )
            conn.execute(f"UPDATE ncaa_players SET {slug}=? WHERE player_id=?", (value, pid))
            if rank is not None:
                conn.execute(f"UPDATE ncaa_players SET {slug}_rank=? WHERE player_id=?", (int(rank), pid))

            totals = source_totals(slug, cells)
            if totals:
                assignments = ",".join(f"{column}=?" for column in totals)
                conn.execute(
                    f"UPDATE ncaa_players SET {assignments} WHERE player_id=?",
                    (*totals.values(), pid),
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
    previous = None
    if PUBLIC_PATH.exists():
        try:
            decoded = json.loads(PUBLIC_PATH.read_text())
            if isinstance(decoded, dict):
                previous = decoded
        except (OSError, UnicodeError, json.JSONDecodeError):
            previous = None
    if previous is not None and release_is_degraded(previous, release):
        print(
            "[individual] source snapshot is sparse; preserving the existing public release",
            flush=True,
        )
    else:
        atomic_write(PUBLIC_PATH, json.dumps(release, ensure_ascii=False, separators=(",", ":")) + "\n")
        atomic_write(SQL_PATH, export_sql(conn, release))
        print(f"[individual] published {len(release['players']):,} players to {PUBLIC_PATH}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
