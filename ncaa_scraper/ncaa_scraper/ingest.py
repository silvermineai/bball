"""Database ingestion workflows for NCAA stats sports."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
import re

from sqlalchemy.orm import Session

from .fetcher import ScraplingNCAAFetcher
from .internal_ids import internal_id, sport_id
from .models import Game, Player, PlayerGameStat, PlayByPlayAction, Season, Shot, Team, TeamGame
from .parsers import parse_football_drives, parse_game, parse_team_schedule_page
from .schemas import ParsedGame, TeamRef, TeamSchedulePage
from .sports import DEFAULT_SPORT_CODE, sport_config


DEFAULT_SEASON_LABEL = "2025-26"
DEFAULT_DIVISION = "1"
UCONN_2025_26_TEAM_ID = 609549
DEFAULT_ORG_ID = 164


class NCAAIngestor:
    def __init__(
        self,
        session: Session,
        fetcher: ScraplingNCAAFetcher | None = None,
        season_label: str = DEFAULT_SEASON_LABEL,
        division: str = DEFAULT_DIVISION,
        sport_code: str = DEFAULT_SPORT_CODE,
    ) -> None:
        self.session = session
        self.fetcher = fetcher or ScraplingNCAAFetcher()
        self.season_label = season_label
        self.division = division
        self.sport = sport_config(sport_code)
        self.sport_code = self.sport.code

    def seed_season_from_team(self, team_id: int = UCONN_2025_26_TEAM_ID, max_teams: int | None = None) -> int:
        """Crawl schedules outward from one team and store unique teams/games."""
        self._upsert_season()
        queue = [team_id]
        seen: set[int] = set()
        total_games = 0

        while queue:
            current_id = queue.pop(0)
            if current_id in seen:
                continue
            if max_teams is not None and len(seen) >= max_teams:
                break
            seen.add(current_id)
            page = self.scrape_team_schedule(current_id)
            total_games += len(page.games)
            for team in page.discovered_teams:
                if team.ncaa_team_id not in seen and team.ncaa_team_id not in queue:
                    queue.append(team.ncaa_team_id)

        self.session.commit()
        return total_games

    def scrape_team_schedule(self, team_id: int) -> TeamSchedulePage:
        html = self.fetcher.fetch(f"/teams/{team_id}", cache_key=f"{self.sport_code}_team_{team_id}_schedule")
        page = parse_team_schedule_page(html, team_id, self.sport_code, self.division, self.sport.label)
        self._upsert_team(page.team)
        for discovered in page.discovered_teams:
            self._upsert_team(discovered)
        for scheduled in page.games:
            self._upsert_team(scheduled.opponent)
            self._upsert_schedule_game(scheduled, page.team)
        self.session.flush()
        return page

    def scrape_game(self, contest_id: int) -> ParsedGame:
        box = self.fetcher.fetch(f"/contests/{contest_id}/box_score", cache_key=f"{self.sport_code}_game_{contest_id}_box")
        pbp = self.fetcher.fetch(f"/contests/{contest_id}/play_by_play", cache_key=f"{self.sport_code}_game_{contest_id}_pbp")
        try:
            individual = self.fetcher.fetch(
                f"/contests/{contest_id}/individual_stats", cache_key=f"{self.sport_code}_game_{contest_id}_individual_stats"
            )
        except Exception:
            individual = None
        parsed = parse_game(box, pbp, contest_id, individual, self.sport_code, self.division)
        if self.sport_code == "MFB" and not parsed.actions:
            drives = self.fetcher.fetch(f"/contests/{contest_id}/drives", cache_key=f"{self.sport_code}_game_{contest_id}_drives")
            parsed.actions.extend(parse_football_drives(drives, contest_id, parsed.summary))
        self._upsert_parsed_game(parsed)
        self.session.commit()
        return parsed

    def resolve_current_team_id(self, org_id: int = DEFAULT_ORG_ID) -> int:
        html = self.fetcher.fetch(
            f"/teams/history/{self.sport_code}/{org_id}",
            cache_key=f"{self.sport_code}_history_{org_id}",
        )
        pattern = re.compile(rf"/teams/(\d+)[^>]*>\s*{re.escape(self.season_label)}\s*<")
        match = pattern.search(html)
        if match:
            return int(match.group(1))
        fallback = re.search(r"/teams/(\d+)", html)
        if not fallback:
            raise ValueError(f"Could not resolve current team id for sport={self.sport_code} org_id={org_id}")
        return int(fallback.group(1))

    def scrape_pending_games(self, limit: int | None = None) -> int:
        query = self.session.query(Game).filter(Game.scrape_status.in_(("pending", "failed"))).order_by(Game.game_date)
        if limit is not None:
            query = query.limit(limit)
        count = 0
        for game in query.all():
            try:
                self.scrape_game(game.contest_id)
                count += 1
            except Exception:
                game.scrape_status = "failed"
                self.session.commit()
                raise
        return count

    def _upsert_season(self) -> None:
        season = self.session.get(Season, _season_id(self.season_label, self.division, self.sport_code))
        if not season:
            self.session.add(
                Season(
                    id=_season_id(self.season_label, self.division, self.sport_code),
                    internal_id=sport_id(self.sport_code),
                    label=_season_storage_label(self.season_label, self.division, self.sport_code),
                    sport_code=self.sport_code,
                    division=self.division,
                )
            )
        else:
            season.internal_id = sport_id(self.sport_code)
            season.sport_code = self.sport_code
            season.division = self.division

    def _upsert_team(self, team_ref: TeamRef) -> Team:
        team = self.session.get(Team, team_ref.ncaa_team_id)
        if not team:
            team = Team(ncaa_team_id=team_ref.ncaa_team_id, internal_id=internal_id("t", team_ref.ncaa_team_id), name=team_ref.name)
            self.session.add(team)
        team.internal_id = team.internal_id or internal_id("t", team_ref.ncaa_team_id)
        team.name = team_ref.name or team.name
        team.org_id = team_ref.org_id or team.org_id
        team.season_label = team_ref.season_label or team.season_label or self.season_label
        team.sport_code = str(team_ref.sport_code)
        team.division = self.division or str(team_ref.division)
        team.record = team_ref.record or team.record
        return team

    def _upsert_schedule_game(self, scheduled, source_team: TeamRef) -> Game:
        game = self.session.get(Game, scheduled.contest_id)
        if not game:
            game = Game(contest_id=scheduled.contest_id, internal_id=internal_id("c", scheduled.contest_id), season_label=self.season_label)
            self.session.add(game)
        game.internal_id = game.internal_id or internal_id("c", scheduled.contest_id)
        game.game_date = datetime.combine(scheduled.date, datetime.min.time())
        game.attendance = scheduled.attendance or game.attendance
        game.scrape_status = game.scrape_status or "pending"
        if scheduled.is_away:
            game.away_team_id = source_team.ncaa_team_id
            game.home_team_id = scheduled.opponent.ncaa_team_id
        elif scheduled.neutral_site:
            game.away_team_id = scheduled.opponent.ncaa_team_id
            game.home_team_id = source_team.ncaa_team_id
            game.venue = scheduled.neutral_site
        else:
            game.home_team_id = source_team.ncaa_team_id
            game.away_team_id = scheduled.opponent.ncaa_team_id

        team_game = (
            self.session.query(TeamGame)
            .filter_by(contest_id=scheduled.contest_id, ncaa_team_id=source_team.ncaa_team_id)
            .one_or_none()
        )
        if not team_game:
            team_game = TeamGame(contest_id=scheduled.contest_id, ncaa_team_id=source_team.ncaa_team_id)
            self.session.add(team_game)
        team_game.opponent_team_id = scheduled.opponent.ncaa_team_id
        team_game.game_date = game.game_date
        team_game.result = scheduled.result
        team_game.attendance = scheduled.attendance
        team_game.is_away = scheduled.is_away
        team_game.neutral_site = scheduled.neutral_site
        return game

    def _upsert_parsed_game(self, parsed: ParsedGame) -> None:
        summary = parsed.summary
        self._upsert_team(summary.away_team)
        self._upsert_team(summary.home_team)
        game = self.session.get(Game, summary.contest_id) or Game(
            contest_id=summary.contest_id, internal_id=internal_id("c", summary.contest_id), season_label=self.season_label
        )
        self.session.add(game)
        game.internal_id = game.internal_id or internal_id("c", summary.contest_id)
        game.game_date = summary.starts_at or game.game_date
        game.venue = summary.venue or game.venue
        game.attendance = summary.attendance or game.attendance
        game.away_team_id = summary.away_team.ncaa_team_id
        game.home_team_id = summary.home_team.ncaa_team_id
        game.away_org_id = summary.away_team.org_id
        game.home_org_id = summary.home_team.org_id
        game.away_score = summary.away_score
        game.home_score = summary.home_score
        game.scrape_status = "parsed"
        game.last_scraped_at = datetime.utcnow()

        self.session.query(PlayByPlayAction).filter_by(contest_id=summary.contest_id).delete()
        self.session.query(PlayerGameStat).filter_by(contest_id=summary.contest_id).delete()
        for stat in parsed.player_stats:
            if stat.player_internal_id is not None:
                player = self.session.get(Player, stat.player_internal_id)
                if not player:
                    player = Player(
                        player_internal_id=stat.player_internal_id,
                        internal_id=internal_id("p", stat.ncaa_player_id),
                        name=stat.name,
                    )
                    self.session.add(player)
                player.internal_id = player.internal_id or internal_id("p", stat.ncaa_player_id)
                player.name = stat.name
                player.ncaa_player_id = stat.ncaa_player_id

            self.session.add(
                PlayerGameStat(
                    contest_id=stat.contest_id,
                    team_org_id=stat.team_org_id,
                    team_name=stat.team_name,
                    player_internal_id=stat.player_internal_id,
                    ncaa_player_id=stat.ncaa_player_id,
                    player_name=stat.name,
                    sport_code=stat.sport_code,
                    stat_group=stat.stat_group,
                    table_index=stat.table_index,
                    row_index=stat.row_index,
                    jersey_number=stat.jersey_number,
                    position=stat.position,
                    stats_json=json.dumps(stat.stats, sort_keys=True),
                    minutes=stat.minutes,
                    fgm=stat.fgm,
                    fga=stat.fga,
                    fg_pct=stat.fg_pct,
                    three_fgm=stat.three_fgm,
                    three_fga=stat.three_fga,
                    ftm=stat.ftm,
                    fta=stat.fta,
                    points=stat.points,
                    offensive_rebounds=stat.offensive_rebounds,
                    defensive_rebounds=stat.defensive_rebounds,
                    total_rebounds=stat.total_rebounds,
                    assists=stat.assists,
                    turnovers=stat.turnovers,
                    steals=stat.steals,
                    blocks=stat.blocks,
                    fouls=stat.fouls,
                    disqualifications=stat.disqualifications,
                    technical_fouls=stat.technical_fouls,
                    bench_points=stat.bench_points,
                )
            )

        for action in parsed.actions:
            self.session.add(
                PlayByPlayAction(
                    contest_id=action.contest_id,
                    sequence=action.sequence,
                    period=action.period,
                    clock=action.clock,
                    team_org_id=action.team_org_id,
                    team_name=action.team_name,
                    player_internal_id=action.player_internal_id,
                    ncaa_player_id=action.ncaa_player_id,
                    player_name=action.player_name,
                    event_type=action.event_type,
                    description=action.description,
                    home_score=action.home_score,
                    away_score=action.away_score,
                )
            )

        for shot in parsed.shots:
            model = self.session.get(Shot, shot.play_id) or Shot(play_id=shot.play_id, contest_id=shot.contest_id)
            self.session.add(model)
            model.contest_id = shot.contest_id
            model.sequence = shot.sequence
            model.period = shot.period
            model.clock = shot.clock
            model.team_org_id = shot.team_org_id
            model.player_internal_id = shot.player_internal_id
            model.ncaa_player_id = shot.ncaa_player_id
            model.player_name = shot.player_name
            model.x = shot.x
            model.y = shot.y
            model.made = shot.made
            model.is_three = shot.is_three
            model.shot_value = shot.shot_value
            model.description = shot.description
            model.classes = shot.classes


def _season_id(label: str, division: str = DEFAULT_DIVISION, sport_code: str = DEFAULT_SPORT_CODE) -> int:
    base = int(label.split("-", 1)[0])
    sport_offset = sum(ord(ch) for ch in sport_code.upper()) % 1000
    return base * 10000 + sport_offset * 10 + int(division)


def _season_storage_label(label: str, division: str = DEFAULT_DIVISION, sport_code: str = DEFAULT_SPORT_CODE) -> str:
    return f"{sport_code}-{label}" if division == "1" else f"{sport_code}-{label}-D{division}"
