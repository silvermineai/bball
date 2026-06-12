"""HTML parsers for NCAA team schedules, play-by-play, and shot charts."""

from __future__ import annotations

import ast
import re
from datetime import datetime
from typing import Iterable

from bs4 import BeautifulSoup

from .schemas import GameSummary, ParsedGame, PlayerGameStat, PlayAction, ScheduleGame, Shot, TeamRef, TeamSchedulePage

TEAM_RE = re.compile(r"/teams/(\d+)")
CONTEST_RE = re.compile(r"/contests/(\d+)/")
PLAYER_RE = re.compile(r"/players/(\d+)")
HISTORY_ORG_RE = re.compile(r"/teams/history/[A-Z]+/(\d+)")
SCORE_RE = re.compile(r"(\d+)-(\d+)")
SHOT_RE = re.compile(r"addShot\((.*?)\);", re.DOTALL)
PLAYER_CLASS_RE = re.compile(r"player_(\d+)")
TEAM_CLASS_RE = re.compile(r"team_(\d+)")
PERIOD_CLASS_RE = re.compile(r"period_(\d+)")
SHOT_DESC_RE = re.compile(
    r"(?P<period>\w+)\s+(?P<clock>\d{1,2}:\d{2}:\d{2})\s+:\s+(?P<result>made|missed)\s+by\s+(?P<player>.+?)\((?P<team>.+?)\)\s+(?P<score>\d+-\d+)"
)
SHOT_ACTION_TYPES = {"2pt", "3pt"}


def parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def clean_text(value: str) -> str:
    unescaped = value.replace("\\n", " ").replace("\\'", "'").replace('\\"', '"')
    return re.sub(r"\s+", " ", unescaped).strip()


def extract_team_id(href: str | None) -> int | None:
    if not href:
        return None
    match = TEAM_RE.search(href)
    return int(match.group(1)) if match else None


def extract_contest_id(href: str | None) -> int | None:
    if not href:
        return None
    match = CONTEST_RE.search(href)
    return int(match.group(1)) if match else None


def extract_player_id(href: str | None) -> int | None:
    if not href:
        return None
    match = PLAYER_RE.search(href)
    return int(match.group(1)) if match else None


def parse_team_schedule_page(
    html: str,
    team_id: int,
    sport_code: str = "MBB",
    division: str = "1",
    sport_label: str = "Men's Basketball",
) -> TeamSchedulePage:
    soup = BeautifulSoup(html, "lxml")
    body_text = soup.get_text("\n", strip=True)
    team = TeamRef(
        ncaa_team_id=team_id,
        name=_parse_page_team_name(soup, body_text, team_id, sport_label),
        org_id=_parse_org_id(soup),
        season_label=_parse_selected_season(body_text),
        sport_code=sport_code,
        division=division,
        record=_parse_team_record(soup, team_id, sport_label) or _parse_record(body_text),
    )

    games: list[ScheduleGame] = []
    discovered: dict[int, TeamRef] = {team.ncaa_team_id: team}
    schedule_table = _find_schedule_table(soup)
    if schedule_table:
        for row in schedule_table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 4 or cells[0].name == "th":
                continue
            contest_link = cells[2].find("a", href=CONTEST_RE)
            opponent_link = cells[1].find("a", href=TEAM_RE)
            contest_id = extract_contest_id(contest_link.get("href") if contest_link else None)
            opponent_id = extract_team_id(opponent_link.get("href") if opponent_link else None)
            if not contest_id or not opponent_id:
                continue

            opponent_text = clean_text(opponent_link.get_text(" ", strip=True))
            opponent = TeamRef(ncaa_team_id=opponent_id, name=opponent_text, sport_code=sport_code, division=division)
            discovered[opponent_id] = opponent

            date_match = re.search(r"\d{2}/\d{2}/\d{4}", cells[0].get_text(" ", strip=True))
            if not date_match:
                continue
            opponent_cell_text = cells[1].get_text("\n", strip=True)
            games.append(
                ScheduleGame(
                    contest_id=contest_id,
                    date=datetime.strptime(date_match.group(0), "%m/%d/%Y").date(),
                    opponent=opponent,
                    result=clean_text(cells[2].get_text(" ", strip=True)) or None,
                    attendance=parse_int(cells[3].get_text(strip=True)),
                    neutral_site=_extract_neutral_site(opponent_cell_text),
                    is_away=opponent_cell_text.strip().startswith("@"),
                    source_team_id=team_id,
                )
            )

    return TeamSchedulePage(team=team, games=games, discovered_teams=list(discovered.values()))


def parse_game_summary(html: str, contest_id: int, sport_code: str = "MBB", division: str = "1") -> GameSummary:
    soup = BeautifulSoup(html, "lxml")
    links = soup.find_all("a", href=TEAM_RE)
    team_links = []
    seen = set()
    for link in links:
        team_id = extract_team_id(link.get("href"))
        name = clean_text(link.get_text(" ", strip=True))
        if team_id and name and team_id not in seen:
            seen.add(team_id)
            team_links.append((team_id, name))
    if len(team_links) < 2:
        raise ValueError(f"Could not find both teams for contest {contest_id}")

    scoreboard = _find_scoreboard_table(soup)
    period_scores: dict[str, list[int]] = {}
    away_score = home_score = None
    starts_at = None
    venue = None
    attendance = None
    if scoreboard:
        rows = scoreboard.find_all("tr")
        score_index = None
        for row in rows:
            cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["td", "th"])]
            if cells and cells[0] == "":
                if "R" in cells:
                    score_index = cells.index("R") - 1
                elif "S" in cells:
                    score_index = cells.index("S") - 1
                continue
            if len(cells) >= 4 and cells[-1].isdigit() and cells[0]:
                period_scores[cells[0]] = [int(value) for value in cells[1:] if value.isdigit()]
        if len(period_scores) >= 2:
            scores = list(period_scores.values())
            resolved_score_index = score_index if score_index is not None and score_index >= 0 else -1
            away_score = scores[0][resolved_score_index] if abs(resolved_score_index) <= len(scores[0]) else scores[0][-1]
            home_score = scores[1][resolved_score_index] if abs(resolved_score_index) <= len(scores[1]) else scores[1][-1]
        details = scoreboard.get_text("\n", strip=True).splitlines()
        for idx, line in enumerate(details):
            if re.match(r"\d{2}/\d{2}/\d{4}", line):
                starts_at = _parse_game_datetime(line)
                for detail in details[idx + 1 :]:
                    cleaned = clean_text(detail)
                    if cleaned and not cleaned.startswith("Attendance:"):
                        venue = cleaned
                        break
            if line.startswith("Attendance:"):
                attendance = parse_int(line.split(":", 1)[1])

    org_ids = _parse_box_team_org_ids(soup)
    away_team = TeamRef(
        ncaa_team_id=team_links[0][0],
        name=team_links[0][1],
        org_id=org_ids[0] if org_ids else None,
        sport_code=sport_code,
        division=division,
    )
    home_team = TeamRef(
        ncaa_team_id=team_links[1][0],
        name=team_links[1][1],
        org_id=org_ids[1] if len(org_ids) > 1 else None,
        sport_code=sport_code,
        division=division,
    )
    return GameSummary(
        contest_id=contest_id,
        starts_at=starts_at,
        venue=venue,
        attendance=attendance,
        away_team=away_team,
        home_team=home_team,
        away_score=away_score,
        home_score=home_score,
        period_scores=period_scores,
    )


def parse_play_by_play(html: str, contest_id: int, summary: GameSummary) -> list[PlayAction]:
    soup = BeautifulSoup(html, "lxml")
    team_names = [summary.away_team.name.split()[0], summary.home_team.name.split()[0]]
    team_org_ids = [summary.away_team.org_id, summary.home_team.org_id]
    plays: list[PlayAction] = []
    sequence = 0
    for period, table in enumerate(_find_pbp_tables(soup), start=1):
        rows = table.find_all("tr")
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            values = [clean_text(cell.get_text(" ", strip=True)) for cell in cells]
            clock = values[0]

            away_action, score, home_action = _normalize_pbp_cells(values)
            if not re.match(r"\d{1,2}:\d{2}:\d{2}", clock):
                if len(values) >= 3 and values[1].count("-") == 1:
                    away_action, score, home_action = values[0], values[1], values[2]
                    clock = ""
                else:
                    continue
            for side_idx, description in enumerate((away_action, home_action)):
                if not description:
                    continue
                sequence += 1
                away_score, home_score = _parse_score(score)
                player, event_type = _split_action(description)
                plays.append(
                    PlayAction(
                        contest_id=contest_id,
                        sequence=sequence,
                        period=period,
                        clock=clock,
                        team_org_id=team_org_ids[side_idx],
                        team_name=team_names[side_idx],
                        player_name=player,
                        event_type=event_type,
                        description=description,
                        away_score=away_score,
                        home_score=home_score,
                        raw={"cells": values},
                    )
                )
    return plays


def parse_football_drives(html: str, contest_id: int, summary: GameSummary) -> list[PlayAction]:
    soup = BeautifulSoup(html, "lxml")
    team_org_by_name = {
        summary.away_team.name.split()[0].lower(): summary.away_team.org_id,
        summary.home_team.name.split()[0].lower(): summary.home_team.org_id,
    }
    plays: list[PlayAction] = []
    sequence = 0
    for table in soup.find_all("table"):
        headers = _table_headers(table)
        normalized_headers = [_normalize_header(header) for header in headers]
        if "drive" not in normalized_headers or "team" not in normalized_headers or "plays" not in normalized_headers:
            continue
        for row in table.find_all("tr"):
            cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.find_all("td")]
            if len(cells) < len(headers):
                continue
            by_header = {normalized_headers[idx]: cells[idx] for idx in range(min(len(normalized_headers), len(cells)))}
            if not by_header.get("drive", "").isdigit():
                continue
            team_name = by_header.get("team") or None
            team_org_id = team_org_by_name.get((team_name or "").split()[0].lower())
            sequence += 1
            away_score = parse_int(by_header.get(_normalize_header(summary.away_team.name.split()[0])))
            home_score = parse_int(by_header.get(_normalize_header(summary.home_team.name.split()[0])))
            description = (
                f"Drive {by_header.get('drive')}: {team_name} started at {by_header.get('ballon')} "
                f"after {by_header.get('starthow')} and ended with {by_header.get('endhow')} at {by_header.get('endon')} "
                f"({by_header.get('plays')} plays, {by_header.get('yards')} yards, {by_header.get('timeofpossession')})."
            )
            plays.append(
                PlayAction(
                    contest_id=contest_id,
                    sequence=sequence,
                    period=parse_int(by_header.get("quarter")) or sequence,
                    clock=by_header.get("clock") or "",
                    team_org_id=team_org_id,
                    team_name=team_name,
                    event_type="drive",
                    description=description,
                    away_score=away_score,
                    home_score=home_score,
                    raw=by_header,
                )
            )
    return plays


def parse_shots(html: str, contest_id: int) -> list[Shot]:
    coordinate_shots = _parse_shot_circles(html, contest_id)
    if coordinate_shots:
        return coordinate_shots

    shots: list[Shot] = []
    for match in SHOT_RE.findall(html):
        if "{" in match or "stroke_color" in match:
            continue
        params = _parse_js_call_args(match)
        if len(params) < 8:
            continue
        x, y, team_org_id, made, play_id, description, classes, _highlight = params[:8]
        class_text = str(classes)
        desc = str(description)
        desc_match = SHOT_DESC_RE.search(desc)
        period = _period_to_int(desc_match.group("period")) if desc_match else _class_int(PERIOD_CLASS_RE, class_text)
        clock = desc_match.group("clock") if desc_match else None
        player_name = desc_match.group("player").strip() if desc_match else None
        player_internal_id = _class_int(PLAYER_CLASS_RE, class_text)
        is_three = "3pt" in desc.lower()
        shots.append(
            Shot(
                contest_id=contest_id,
                play_id=int(play_id),
                sequence=_extract_sequence_comment(match),
                period=period,
                clock=clock,
                team_org_id=int(team_org_id),
                player_internal_id=player_internal_id,
                ncaa_player_id=None,
                player_name=player_name,
                x=float(x),
                y=float(y),
                made=bool(made),
                is_three=is_three,
                shot_value=3 if is_three else 2,
                description=desc,
                classes=class_text,
            )
        )
    return shots


def _parse_shot_circles(html: str, contest_id: int) -> list[Shot]:
    """Parse rendered NCAA shot chart SVG circles.

    NCAA renders raw coordinates into SVG circles with cx/cy in a 940x500 viewbox.
    This is the preferred source because it keys off coordinate-bearing HTML, not
    a specific JavaScript helper name.
    """
    soup = BeautifulSoup(html, "lxml")
    shots: list[Shot] = []
    for circle in soup.find_all("circle", id=re.compile(r"^play_\d+$")):
        classes = circle.get("class") or []
        if isinstance(classes, str):
            class_text = classes
        else:
            class_text = " ".join(classes)
        if "shot" not in class_text:
            continue

        play_id = int(str(circle["id"]).replace("play_", ""))
        title = circle.find("title")
        description = clean_text(title.get_text(" ", strip=True)) if title else ""
        desc_match = SHOT_DESC_RE.search(description)
        period = _period_to_int(desc_match.group("period")) if desc_match else _class_int(PERIOD_CLASS_RE, class_text)
        player_name = desc_match.group("player").strip() if desc_match else None
        team_org_id = _class_int(TEAM_CLASS_RE, class_text)
        if team_org_id is None:
            continue
        made = "made" in class_text.split()
        is_three = "3pt" in description.lower()
        shots.append(
            Shot(
                contest_id=contest_id,
                play_id=play_id,
                sequence=None,
                period=period,
                clock=desc_match.group("clock") if desc_match else None,
                team_org_id=team_org_id,
                player_internal_id=_class_int(PLAYER_CLASS_RE, class_text),
                ncaa_player_id=None,
                player_name=player_name,
                x=round(float(circle["cx"]) / 940 * 100, 4),
                y=round(float(circle["cy"]) / 500 * 100, 4),
                made=made,
                is_three=is_three,
                shot_value=3 if is_three else 2,
                description=description,
                classes=class_text,
            )
        )
    return shots


def parse_individual_stats(html: str, contest_id: int, summary: GameSummary) -> list[PlayerGameStat]:
    soup = BeautifulSoup(html, "lxml")
    team_refs = [summary.away_team, summary.home_team]
    stats: list[PlayerGameStat] = []
    stat_tables = [
        table
        for table in soup.find_all("table")
        if table.find("a", href=PLAYER_RE) and _table_headers(table)[:3] == ["#", "Name", "P"]
    ]

    for table_idx, table in enumerate(stat_tables):
        team = team_refs[table_idx % 2] if team_refs else None
        headers = _table_headers(table)
        stat_group = _stat_group_for_table(str(summary.away_team.sport_code), headers, table_idx)
        body_rows = table.find_all("tr", id=re.compile(r"^game_player_\d+_")) or table.find_all("tr")
        for row_idx, row in enumerate(body_rows):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            player_link = row.find("a", href=PLAYER_RE)
            ncaa_player_id = extract_player_id(player_link.get("href") if player_link else None)
            if not player_link or not ncaa_player_id:
                continue
            values = [_cell_value(cell) for cell in cells]
            by_header = {headers[idx]: values[idx] for idx in range(min(len(headers), len(values)))}
            raw_stats = {
                _stat_key(header): _coerce_stat_value(value)
                for header, value in by_header.items()
                if header not in {"#", "Name", "P"} and value not in {"", None}
            }
            stats.append(
                PlayerGameStat(
                    contest_id=contest_id,
                    team_org_id=team.org_id if team else None,
                    team_name=team.name if team else None,
                    ncaa_player_id=ncaa_player_id,
                    player_internal_id=_class_int(re.compile(r"game_player_(\d+)_"), row.get("id", "")),
                    sport_code=str(team.sport_code if team else summary.away_team.sport_code),
                    stat_group=stat_group,
                    table_index=table_idx,
                    row_index=row_idx,
                    name=clean_text(player_link.get_text(" ", strip=True)),
                    jersey_number=by_header.get("#") or None,
                    position=by_header.get("P") or None,
                    stats=raw_stats,
                    minutes=by_header.get("MP") or None,
                    fgm=parse_int(by_header.get("FGM")),
                    fga=parse_int(by_header.get("FGA")),
                    fg_pct=_parse_float(by_header.get("FG%")),
                    three_fgm=parse_int(by_header.get("3FG")),
                    three_fga=parse_int(by_header.get("3FGA")),
                    ftm=parse_int(by_header.get("FT")),
                    fta=parse_int(by_header.get("FTA")),
                    points=parse_int(by_header.get("PTS")),
                    offensive_rebounds=parse_int(by_header.get("ORebs")),
                    defensive_rebounds=parse_int(by_header.get("DRebs")),
                    total_rebounds=parse_int(by_header.get("TotReb")),
                    assists=parse_int(by_header.get("AST")),
                    turnovers=parse_int(by_header.get("TO")),
                    steals=parse_int(by_header.get("STL")),
                    blocks=parse_int(by_header.get("BLK")),
                    fouls=parse_int(by_header.get("Fouls")),
                    disqualifications=parse_int(by_header.get("DQ")),
                    technical_fouls=parse_int(by_header.get("TechFouls")),
                    bench_points=parse_int(by_header.get("Bench")),
                )
            )
    return stats


def _stat_group_for_table(sport_code: str, headers: list[str], table_idx: int) -> str:
    header_keys = {_stat_key(header) for header in headers}
    if sport_code in {"MBB", "WBB"}:
        return "box"
    if sport_code in {"MBA", "WSB"}:
        if {"ip", "er", "bf"} & header_keys:
            return "pitching"
        if {"po", "tc", "fldpct"} & header_keys:
            return "fielding"
        return "batting"
    if sport_code == "MFB":
        if "rushattempts" in header_keys:
            return "rushing"
        if "passattempts" in header_keys:
            return "passing"
        if "receivingyards" in header_keys:
            return "receiving"
        if "sacks" in header_keys:
            return "sacks"
        if {"solotack", "assttack", "tackles"} & header_keys:
            return "tackling"
        if {"pbu", "intyds", "pdef"} & header_keys:
            return "pass_defense"
        if {"fgm", "fgblocksallowed"} & header_keys:
            return "field_goals"
        if "puntret" in header_keys:
            return "punt_returns"
        if "koret" in header_keys:
            return "kick_returns"
        if "yds" in header_keys and "plays" in header_keys:
            return "total_offense"
        return f"football_{table_idx // 2 + 1}"
    if sport_code in {"MSO", "WSO"}:
        if {"ga", "saves", "gaa"} & header_keys:
            return "goalkeeping"
        return "field"
    return f"table_{table_idx // 2 + 1}"


def _stat_key(value: str) -> str:
    aliases = {
        "totreb": "total_rebounds",
        "fg%": "fg_pct",
        "3fg": "three_fgm",
        "3fga": "three_fga",
        "ft": "ftm",
        "orebs": "offensive_rebounds",
        "drebs": "defensive_rebounds",
        "techfouls": "technical_fouls",
        "goalieminplyd": "goalie_minutes",
        "yds/rush": "yards_per_rush",
    }
    normalized = re.sub(r"[^a-z0-9%/]+", "", value.lower())
    return aliases.get(normalized, normalized)


def _coerce_stat_value(value: str) -> int | float | str:
    cleaned = clean_text(value)
    if not cleaned:
        return ""
    if re.fullmatch(r"-?\d+", cleaned):
        return int(cleaned)
    if re.fullmatch(r"-?\d+\.\d+", cleaned):
        return float(cleaned)
    return cleaned


def attach_player_ids(
    actions: list[PlayAction], shots: list[Shot], player_stats: list[PlayerGameStat]
) -> tuple[list[PlayAction], list[Shot]]:
    by_internal = {
        stat.player_internal_id: stat
        for stat in player_stats
        if stat.player_internal_id is not None
    }
    by_team_name = {
        (stat.team_org_id, _normalize_player_name(stat.name)): stat
        for stat in player_stats
        if stat.team_org_id is not None
    }

    for shot in shots:
        stat = None
        if shot.player_internal_id is not None:
            stat = by_internal.get(shot.player_internal_id)
        if stat is None and shot.player_name:
            stat = by_team_name.get((shot.team_org_id, _normalize_player_name(shot.player_name)))
        if stat:
            shot.ncaa_player_id = stat.ncaa_player_id
            shot.player_internal_id = shot.player_internal_id or stat.player_internal_id
            shot.player_name = shot.player_name or stat.name

    for action in actions:
        if not action.player_name or action.team_org_id is None:
            continue
        stat = by_team_name.get((action.team_org_id, _normalize_player_name(action.player_name)))
        if stat:
            action.ncaa_player_id = stat.ncaa_player_id
            action.player_internal_id = stat.player_internal_id
            action.player_name = stat.name

    return actions, shots


def attach_shot_types(actions: list[PlayAction], shots: list[Shot]) -> list[Shot]:
    """Use play-by-play shot events to correct shot-chart point values.

    The NCAA shot-chart coordinate payload usually has the shooter, clock, and
    result, but often omits "3pt" in the description. The play-by-play row at
    the same period/clock/team/player carries the authoritative 2pt/3pt tag.
    """
    by_shot_key: dict[tuple[int, str, int, str, bool], PlayAction] = {}
    by_player_id_key: dict[tuple[int, str, int, int, bool], PlayAction] = {}

    for action in actions:
        if action.event_type not in SHOT_ACTION_TYPES or action.team_org_id is None or not action.player_name:
            continue
        made = _is_made_action(action.description)
        if made is None:
            continue
        by_shot_key[
            (
                action.period,
                action.clock,
                action.team_org_id,
                _normalize_player_name(action.player_name),
                made,
            )
        ] = action
        if action.ncaa_player_id is not None:
            by_player_id_key[(action.period, action.clock, action.team_org_id, action.ncaa_player_id, made)] = action

    for shot in shots:
        action = None
        if shot.period is None or shot.clock is None:
            continue
        if shot.ncaa_player_id is not None:
            action = by_player_id_key.get((shot.period, shot.clock, shot.team_org_id, shot.ncaa_player_id, shot.made))
        if action is None and shot.player_name:
            action = by_shot_key.get(
                (shot.period, shot.clock, shot.team_org_id, _normalize_player_name(shot.player_name), shot.made)
            )
        if action is None:
            continue

        if action.event_type == "3pt":
            shot.is_three = True
            shot.shot_value = 3
        elif action.event_type == "2pt":
            shot.is_three = False
            shot.shot_value = 2

    return shots


def parse_game(
    box_score_html: str,
    play_by_play_html: str,
    contest_id: int,
    individual_stats_html: str | None = None,
    sport_code: str = "MBB",
    division: str = "1",
) -> ParsedGame:
    summary = parse_game_summary(box_score_html, contest_id, sport_code, division)
    actions = parse_play_by_play(play_by_play_html, contest_id, summary)
    shots = parse_shots(box_score_html, contest_id)
    player_stats = parse_individual_stats(individual_stats_html, contest_id, summary) if individual_stats_html else []
    if player_stats:
        actions, shots = attach_player_ids(actions, shots, player_stats)
    shots = attach_shot_types(actions, shots)
    return ParsedGame(
        summary=summary,
        actions=actions,
        shots=shots,
        player_stats=player_stats,
    )


def _find_schedule_table(soup: BeautifulSoup):
    for table in soup.find_all("table"):
        headers = [clean_text(th.get_text(" ", strip=True)).lower() for th in table.find_all("th")]
        if {"date", "opponent", "result", "attendance"}.issubset(set(headers)):
            return table
    return None


def _find_scoreboard_table(soup: BeautifulSoup):
    for table in soup.find_all("table"):
        text = table.get_text("\n", strip=True)
        if "Attendance:" in text and "Box Score" in text:
            nested = table.find_all("table")
            return nested[0] if nested else table
    return soup.find("table")


def _find_pbp_tables(soup: BeautifulSoup) -> Iterable:
    for table in soup.find_all("table", class_="table"):
        header = clean_text(table.find("tr").get_text(" ", strip=True)) if table.find("tr") else ""
        if "Score" in header and ("Time" in header or len(table.find_all("tr")) > 2):
            yield table


def _parse_page_team_name(soup: BeautifulSoup, body_text: str, team_id: int, sport_label: str = "Men's Basketball") -> str:
    sport_link = _find_current_sport_link(soup, team_id, sport_label)
    if sport_link:
        record = _parse_team_record(soup, team_id, sport_label)
        if record:
            for body_match in re.finditer(rf"([A-Z][^\n]+?)\s+\({re.escape(record)}\)", body_text):
                candidate = clean_text(body_match.group(1))
                if sport_label not in candidate:
                    return candidate
        match = re.search(rf"{re.escape(sport_label)} \((?P<record>[^)]+)\)", clean_text(sport_link.get_text(" ", strip=True)))
        alt = sport_link.find("img")
        if alt and alt.get("alt"):
            return clean_text(str(alt["alt"]))
        if match:
            prefix = clean_text(sport_link.get_text(" ", strip=True)).split(sport_label, 1)[0]
            if prefix and not prefix.startswith("20"):
                return prefix
    for link in soup.find_all("a", href=f"/teams/{team_id}"):
        text = clean_text(link.get_text(" ", strip=True))
        if text and not re.match(r"\d{4}-\d{2}", text) and text not in {"Schedule/Results"}:
            return text
    match = re.search(r"([A-Z][^\n]+?)\s+\(\d+-\d+\)", body_text)
    return clean_text(match.group(1)) if match else f"NCAA Team {team_id}"


def _parse_org_id(soup: BeautifulSoup) -> int | None:
    history = soup.find("a", href=HISTORY_ORG_RE)
    if not history:
        return None
    match = HISTORY_ORG_RE.search(history.get("href", ""))
    return int(match.group(1)) if match else None


def _parse_box_team_org_ids(soup: BeautifulSoup) -> list[int]:
    script_text = "\n".join(script.get_text() for script in soup.find_all("script"))
    values = re.findall(r"team_colors\[(\d+)\]", script_text)
    return [int(value) for value in values[:2]]


def _parse_selected_season(body_text: str) -> str | None:
    match = re.search(r"\b(20\d{2}-\d{2})\b", body_text)
    return match.group(1) if match else None


def _parse_record(body_text: str) -> str | None:
    match = re.search(r"\((\d+-\d+)\)", body_text)
    return match.group(1) if match else None


def _parse_team_record(soup: BeautifulSoup, team_id: int, sport_label: str = "Men's Basketball") -> str | None:
    sport_link = _find_current_sport_link(soup, team_id, sport_label)
    if not sport_link:
        return None
    match = re.search(rf"{re.escape(sport_label)} \((?P<record>\d+-\d+(?:-\d+)?)\)", clean_text(sport_link.get_text(" ", strip=True)))
    return match.group("record") if match else None


def _find_current_sport_link(soup: BeautifulSoup, team_id: int, sport_label: str = "Men's Basketball"):
    candidates = []
    for link in soup.find_all("a", href=f"/teams/{team_id}"):
        text = clean_text(link.get_text(" ", strip=True))
        if sport_label in text:
            candidates.append(link)
    return candidates[0] if candidates else None


def _extract_neutral_site(text: str) -> str | None:
    lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
    for line in lines:
        if line.startswith("@") and "," in line:
            return line[1:].split("(", 1)[0].strip()
    return None


def _parse_game_datetime(value: str) -> datetime | None:
    for fmt in ("%m/%d/%Y %I:%M %p", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _normalize_pbp_cells(values: list[str]) -> tuple[str, str, str]:
    if len(values) >= 4:
        return values[1], values[2], values[3]
    if len(values) == 2:
        return values[1], "", ""
    if len(values) == 3 and SCORE_RE.match(values[1]):
        return "", values[1], values[2]
    if len(values) == 3:
        return values[1], values[2], ""
    return "", "", ""


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower()).replace("number", "")


def _parse_score(score: str) -> tuple[int | None, int | None]:
    match = SCORE_RE.search(score or "")
    if not match:
        return None, None
    return int(match.group(1)), int(match.group(2))


def _parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", "")
    if not cleaned or cleaned == "-":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _table_headers(table) -> list[str]:
    headers = []
    for th in table.find_all("th"):
        headers.append(clean_text(th.get_text("", strip=True)).replace(" ", ""))
    return headers


def _cell_value(cell) -> str:
    if cell.has_attr("data-order") and cell["data-order"] != "-":
        return clean_text(str(cell["data-order"]))
    return clean_text(cell.get_text(" ", strip=True))


def _normalize_player_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _split_action(description: str) -> tuple[str | None, str]:
    if "," not in description:
        return None, description.lower().replace(" ", "_")
    player, rest = [part.strip() for part in description.split(",", 1)]
    event_type = rest.split(" ", 1)[0].split(";", 1)[0].lower()
    return player or None, event_type or "unknown"


def _is_made_action(description: str) -> bool | None:
    lower = description.lower()
    if re.search(r"\bmade\b", lower):
        return True
    if re.search(r"\bmissed\b", lower):
        return False
    return None


def _parse_js_call_args(args: str) -> list[object]:
    normalized = args.replace("\\'", "'").replace('\\"', '"')
    normalized = re.sub(r"\btrue\b", "True", normalized)
    normalized = re.sub(r"\bfalse\b", "False", normalized)
    normalized = re.sub(r"\bnull\b", "None", normalized)
    return list(ast.literal_eval(f"({normalized})"))


def _period_to_int(value: str) -> int | None:
    lower = value.lower()
    if lower.startswith("1"):
        return 1
    if lower.startswith("2"):
        return 2
    match = re.search(r"\d+", lower)
    return int(match.group()) if match else None


def _class_int(pattern: re.Pattern[str], value: str) -> int | None:
    match = pattern.search(value)
    return int(match.group(1)) if match else None


def _extract_sequence_comment(value: str) -> int | None:
    match = re.search(r"//\s*\d+,\s*(\d+)", value)
    return int(match.group(1)) if match else None
