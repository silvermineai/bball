"""Typed records produced by the NCAA stats scrapers."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SportCode(StrEnum):
    MENS_BASKETBALL = "MBB"
    WOMENS_BASKETBALL = "WBB"
    BASEBALL = "MBA"
    SOFTBALL = "WSB"
    FOOTBALL = "MFB"
    MENS_SOCCER = "MSO"
    WOMENS_SOCCER = "WSO"


class Division(StrEnum):
    D1 = "1"
    D2 = "2"
    D3 = "3"


class ScrapeStatus(StrEnum):
    PENDING = "pending"
    FETCHED = "fetched"
    PARSED = "parsed"
    FAILED = "failed"


class TeamRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ncaa_team_id: int
    name: str
    org_id: int | None = None
    sport_code: SportCode = SportCode.MENS_BASKETBALL
    division: Division = Division.D1
    season_label: str | None = None
    record: str | None = None


class ScheduleGame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contest_id: int
    date: date
    opponent: TeamRef
    result: str | None = None
    attendance: int | None = None
    neutral_site: str | None = None
    is_away: bool = False
    source_team_id: int


class TeamSchedulePage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team: TeamRef
    games: list[ScheduleGame] = Field(default_factory=list)
    discovered_teams: list[TeamRef] = Field(default_factory=list)


class GameSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contest_id: int
    starts_at: datetime | None = None
    venue: str | None = None
    attendance: int | None = None
    away_team: TeamRef
    home_team: TeamRef
    away_score: int | None = None
    home_score: int | None = None
    period_scores: dict[str, list[int]] = Field(default_factory=dict)


class PlayAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contest_id: int
    sequence: int
    period: int
    clock: str
    team_org_id: int | None = None
    team_name: str | None = None
    player_internal_id: int | None = None
    ncaa_player_id: int | None = None
    player_name: str | None = None
    event_type: str
    description: str
    home_score: int | None = None
    away_score: int | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class Shot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contest_id: int
    play_id: int
    sequence: int | None = None
    period: int | None = None
    clock: str | None = None
    team_org_id: int
    player_internal_id: int | None = None
    ncaa_player_id: int | None = None
    player_name: str | None = None
    x: float
    y: float
    made: bool
    is_three: bool | None = None
    shot_value: int | None = None
    description: str
    classes: str


class PlayerGameStat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contest_id: int
    team_org_id: int | None = None
    team_name: str | None = None
    ncaa_player_id: int
    player_internal_id: int | None = None
    sport_code: str = "MBB"
    stat_group: str = "box"
    table_index: int | None = None
    row_index: int | None = None
    name: str
    jersey_number: str | None = None
    position: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)
    minutes: str | None = None
    fgm: int | None = None
    fga: int | None = None
    fg_pct: float | None = None
    three_fgm: int | None = None
    three_fga: int | None = None
    ftm: int | None = None
    fta: int | None = None
    points: int | None = None
    offensive_rebounds: int | None = None
    defensive_rebounds: int | None = None
    total_rebounds: int | None = None
    assists: int | None = None
    turnovers: int | None = None
    steals: int | None = None
    blocks: int | None = None
    fouls: int | None = None
    disqualifications: int | None = None
    technical_fouls: int | None = None
    bench_points: int | None = None


class ParsedGame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: GameSummary
    actions: list[PlayAction] = Field(default_factory=list)
    shots: list[Shot] = Field(default_factory=list)
    player_stats: list[PlayerGameStat] = Field(default_factory=list)
