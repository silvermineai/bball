"""SQLAlchemy models for NCAA men's D1 basketball scraping."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    internal_id: Mapped[str | None] = mapped_column(String(16), index=True)
    label: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    sport_code: Mapped[str] = mapped_column(String(8), default="MBB", nullable=False)
    division: Mapped[str] = mapped_column(String(8), default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Team(Base):
    __tablename__ = "teams"

    ncaa_team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    internal_id: Mapped[str | None] = mapped_column(String(16), index=True)
    org_id: Mapped[int | None] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    season_label: Mapped[str | None] = mapped_column(String(16), index=True)
    sport_code: Mapped[str] = mapped_column(String(8), default="MBB", nullable=False)
    division: Mapped[str] = mapped_column(String(8), default="1", nullable=False)
    record: Mapped[str | None] = mapped_column(String(32))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Game(Base):
    __tablename__ = "games"

    contest_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    internal_id: Mapped[str | None] = mapped_column(String(16), index=True)
    season_label: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    game_date: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    venue: Mapped[str | None] = mapped_column(String(240))
    attendance: Mapped[int | None] = mapped_column(Integer)
    away_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.ncaa_team_id"), index=True)
    home_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.ncaa_team_id"), index=True)
    away_org_id: Mapped[int | None] = mapped_column(Integer, index=True)
    home_org_id: Mapped[int | None] = mapped_column(Integer, index=True)
    away_score: Mapped[int | None] = mapped_column(Integer)
    home_score: Mapped[int | None] = mapped_column(Integer)
    scrape_status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TeamGame(Base):
    __tablename__ = "team_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("games.contest_id"), nullable=False, index=True)
    ncaa_team_id: Mapped[int] = mapped_column(ForeignKey("teams.ncaa_team_id"), nullable=False, index=True)
    opponent_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.ncaa_team_id"))
    game_date: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    result: Mapped[str | None] = mapped_column(String(32))
    attendance: Mapped[int | None] = mapped_column(Integer)
    is_away: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    neutral_site: Mapped[str | None] = mapped_column(String(160))

    __table_args__ = (UniqueConstraint("contest_id", "ncaa_team_id", name="uq_team_game"),)


class Player(Base):
    __tablename__ = "players"

    player_internal_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    internal_id: Mapped[str | None] = mapped_column(String(16), index=True)
    ncaa_player_id: Mapped[int | None] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)


class PlayerGameStat(Base):
    __tablename__ = "player_game_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("games.contest_id"), nullable=False, index=True)
    team_org_id: Mapped[int | None] = mapped_column(Integer, index=True)
    team_name: Mapped[str | None] = mapped_column(String(160))
    player_internal_id: Mapped[int | None] = mapped_column(Integer, index=True)
    ncaa_player_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    player_name: Mapped[str] = mapped_column(String(160), nullable=False)
    sport_code: Mapped[str] = mapped_column(String(8), default="MBB", nullable=False)
    stat_group: Mapped[str] = mapped_column(String(64), default="box", nullable=False)
    table_index: Mapped[int | None] = mapped_column(Integer)
    row_index: Mapped[int | None] = mapped_column(Integer)
    jersey_number: Mapped[str | None] = mapped_column(String(12))
    position: Mapped[str | None] = mapped_column(String(12))
    stats_json: Mapped[str | None] = mapped_column(Text)
    minutes: Mapped[str | None] = mapped_column(String(16))
    fgm: Mapped[int | None] = mapped_column(Integer)
    fga: Mapped[int | None] = mapped_column(Integer)
    fg_pct: Mapped[float | None] = mapped_column(Float)
    three_fgm: Mapped[int | None] = mapped_column(Integer)
    three_fga: Mapped[int | None] = mapped_column(Integer)
    ftm: Mapped[int | None] = mapped_column(Integer)
    fta: Mapped[int | None] = mapped_column(Integer)
    points: Mapped[int | None] = mapped_column(Integer)
    offensive_rebounds: Mapped[int | None] = mapped_column(Integer)
    defensive_rebounds: Mapped[int | None] = mapped_column(Integer)
    total_rebounds: Mapped[int | None] = mapped_column(Integer)
    assists: Mapped[int | None] = mapped_column(Integer)
    turnovers: Mapped[int | None] = mapped_column(Integer)
    steals: Mapped[int | None] = mapped_column(Integer)
    blocks: Mapped[int | None] = mapped_column(Integer)
    fouls: Mapped[int | None] = mapped_column(Integer)
    disqualifications: Mapped[int | None] = mapped_column(Integer)
    technical_fouls: Mapped[int | None] = mapped_column(Integer)
    bench_points: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        UniqueConstraint("contest_id", "ncaa_player_id", "stat_group", "team_org_id", name="uq_player_game_stat"),
    )


class PlayByPlayAction(Base):
    __tablename__ = "play_by_play_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("games.contest_id"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    clock: Mapped[str] = mapped_column(String(16), nullable=False)
    team_org_id: Mapped[int | None] = mapped_column(Integer, index=True)
    team_name: Mapped[str | None] = mapped_column(String(160))
    player_internal_id: Mapped[int | None] = mapped_column(Integer, index=True)
    ncaa_player_id: Mapped[int | None] = mapped_column(Integer, index=True)
    player_name: Mapped[str | None] = mapped_column(String(160))
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (UniqueConstraint("contest_id", "sequence", name="uq_play_sequence"),)


class Shot(Base):
    __tablename__ = "shots"

    play_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("games.contest_id"), nullable=False, index=True)
    sequence: Mapped[int | None] = mapped_column(Integer)
    period: Mapped[int | None] = mapped_column(Integer, index=True)
    clock: Mapped[str | None] = mapped_column(String(16))
    team_org_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    player_internal_id: Mapped[int | None] = mapped_column(Integer, index=True)
    ncaa_player_id: Mapped[int | None] = mapped_column(Integer, index=True)
    player_name: Mapped[str | None] = mapped_column(String(160))
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    made: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_three: Mapped[bool | None] = mapped_column(Boolean)
    shot_value: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    classes: Mapped[str] = mapped_column(String(240), nullable=False)


class ScrapeLog(Base):
    __tablename__ = "scrape_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    cache_key: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    status_code: Mapped[int | None] = mapped_column(Integer)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    error: Mapped[str | None] = mapped_column(Text)


def make_engine(database_url: str = "sqlite:///ncaa_mbb.sqlite3"):
    return create_engine(database_url, future=True)


def create_session(database_url: str = "sqlite:///ncaa_mbb.sqlite3") -> Session:
    engine = make_engine(database_url)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)()
