"""CLI for the SQLite-backed NCAA stats scraper."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .ingest import DEFAULT_DIVISION, DEFAULT_ORG_ID, DEFAULT_SEASON_LABEL, UCONN_2025_26_TEAM_ID, NCAAIngestor
from .models import Game, Team, create_session
from .parsers import parse_game, parse_team_schedule_page
from .sports import DEFAULT_SPORT_CODE, DEFAULT_SPORT_CODES, SPORTS


def main() -> None:
    parser = argparse.ArgumentParser(description="SQLite NCAA men's basketball scraper")
    parser.add_argument("--db", default="sqlite:///ncaa_mbb.sqlite3", help="SQLAlchemy database URL")
    parser.add_argument("--season", default=DEFAULT_SEASON_LABEL)
    parser.add_argument("--sport", choices=sorted(SPORTS), default=DEFAULT_SPORT_CODE)
    parser.add_argument("--division", choices=["1", "2", "3"], default=DEFAULT_DIVISION)
    sub = parser.add_subparsers(dest="command", required=True)

    seed = sub.add_parser("seed-team", help="Discover teams and games from one team's schedule graph")
    seed.add_argument("--team-id", type=int, default=UCONN_2025_26_TEAM_ID)
    seed.add_argument("--max-teams", type=int)

    game = sub.add_parser("scrape-game", help="Scrape one contest box score and play-by-play")
    game.add_argument("contest_id", type=int)

    pending = sub.add_parser("scrape-pending", help="Scrape pending games already in SQLite")
    pending.add_argument("--limit", type=int)

    backfill = sub.add_parser("backfill", help="Seed from a team and scrape pending games with progress logs")
    backfill.add_argument("--team-id", type=int, default=UCONN_2025_26_TEAM_ID)
    backfill.add_argument("--max-teams", type=int, default=1)
    backfill.add_argument("--limit", type=int, default=25)

    multi = sub.add_parser("sample-sports", help="Scrape a small sample across configured NCAA sports")
    multi.add_argument("--sports", nargs="+", default=list(DEFAULT_SPORT_CODES))
    multi.add_argument("--org-id", type=int, default=DEFAULT_ORG_ID)
    multi.add_argument("--max-teams", type=int, default=1)
    multi.add_argument("--limit", type=int, default=2)

    inspect = sub.add_parser("inspect-cache", help="Parse cached UConn sample pages without network")
    inspect.add_argument("--cache-dir", default=str(Path(__file__).resolve().parent / "cache"))

    args = parser.parse_args()

    if args.command == "inspect-cache":
        cache_dir = Path(args.cache_dir)
        team_html = (cache_dir / "team_609549_schedule.html").read_text(encoding="utf-8")
        box_html = (cache_dir / "game_6422772_box.html").read_text(encoding="utf-8")
        pbp_html = (cache_dir / "game_6422772_pbp.html").read_text(encoding="utf-8")
        team_page = parse_team_schedule_page(team_html, UCONN_2025_26_TEAM_ID)
        parsed_game = parse_game(box_html, pbp_html, 6422772)
        print(
            json.dumps(
                {
                    "team": team_page.team.model_dump(mode="json"),
                    "schedule_games": len(team_page.games),
                    "discovered_teams": len(team_page.discovered_teams),
                    "game": parsed_game.summary.model_dump(mode="json"),
                    "actions": len(parsed_game.actions),
                    "shots": len(parsed_game.shots),
                },
                indent=2,
            )
        )
        return

    session = create_session(args.db)
    ingestor = NCAAIngestor(session=session, season_label=args.season, division=args.division, sport_code=args.sport)
    if args.command == "seed-team":
        games = ingestor.seed_season_from_team(args.team_id, args.max_teams)
        team_count = session.query(Team).count()
        game_count = session.query(Game).count()
        print(f"Stored {team_count} teams and {game_count} unique games ({games} team-game rows seen).")
    elif args.command == "scrape-game":
        parsed = ingestor.scrape_game(args.contest_id)
        print(f"Scraped contest {args.contest_id}: {len(parsed.actions)} actions, {len(parsed.shots)} shots.")
    elif args.command == "scrape-pending":
        count = ingestor.scrape_pending_games(args.limit)
        print(f"Scraped {count} pending games.")
    elif args.command == "backfill":
        print(
            f"[backfill] seed start team_id={args.team_id} max_teams={args.max_teams} season={args.season} division={args.division}",
            flush=True,
        )
        games_seen = ingestor.seed_season_from_team(args.team_id, args.max_teams)
        team_count = session.query(Team).count()
        game_count = session.query(Game).count()
        print(
            f"[backfill] seed complete teams={team_count} games={game_count} team_game_rows_seen={games_seen}",
            flush=True,
        )

        query = (
            session.query(Game)
            .filter(Game.scrape_status.in_(("pending", "failed")))
            .order_by(Game.game_date, Game.contest_id)
        )
        if args.limit is not None:
            query = query.limit(args.limit)
        pending_games = query.all()
        print(f"[backfill] scrape start pending={len(pending_games)} limit={args.limit}", flush=True)
        scraped = 0
        for idx, game in enumerate(pending_games, start=1):
            print(f"[backfill] game {idx}/{len(pending_games)} contest_id={game.contest_id} start", flush=True)
            try:
                parsed = ingestor.scrape_game(game.contest_id)
            except Exception as exc:
                game.scrape_status = "failed"
                session.commit()
                print(f"[backfill] game {idx}/{len(pending_games)} contest_id={game.contest_id} failed error={exc}", flush=True)
                continue
            scraped += 1
            print(
                f"[backfill] game {idx}/{len(pending_games)} contest_id={game.contest_id} parsed actions={len(parsed.actions)} shots={len(parsed.shots)} player_stats={len(parsed.player_stats)}",
                flush=True,
            )
        print(f"[backfill] complete scraped={scraped} failed={len(pending_games) - scraped}", flush=True)
    elif args.command == "sample-sports":
        total_scraped = 0
        for sport_code in args.sports:
            sport_ingestor = NCAAIngestor(
                session=session,
                season_label=args.season,
                division=args.division,
                sport_code=sport_code,
            )
            print(f"[sample-sports] sport={sport_code} resolve org_id={args.org_id}", flush=True)
            try:
                team_id = sport_ingestor.resolve_current_team_id(args.org_id)
            except Exception as exc:
                print(f"[sample-sports] sport={sport_code} resolve failed error={exc}", flush=True)
                continue
            print(f"[sample-sports] sport={sport_code} seed team_id={team_id}", flush=True)
            try:
                sport_ingestor.seed_season_from_team(team_id, args.max_teams)
            except Exception as exc:
                print(f"[sample-sports] sport={sport_code} seed failed error={exc}", flush=True)
                continue
            pending_games = (
                session.query(Game)
                .join(Team, (Team.ncaa_team_id == Game.home_team_id) | (Team.ncaa_team_id == Game.away_team_id))
                .filter(Team.sport_code == sport_code)
                .filter(Game.scrape_status.in_(("pending", "failed")))
                .order_by(Game.game_date.desc(), Game.contest_id.desc())
                .limit(args.limit)
                .all()
            )
            print(f"[sample-sports] sport={sport_code} pending={len(pending_games)}", flush=True)
            for game in pending_games:
                try:
                    parsed = sport_ingestor.scrape_game(game.contest_id)
                    total_scraped += 1
                    print(
                        f"[sample-sports] sport={sport_code} contest_id={game.contest_id} actions={len(parsed.actions)} shots={len(parsed.shots)} player_stats={len(parsed.player_stats)}",
                        flush=True,
                    )
                except Exception as exc:
                    game.scrape_status = "failed"
                    session.commit()
                    print(f"[sample-sports] sport={sport_code} contest_id={game.contest_id} failed error={exc}", flush=True)
        print(f"[sample-sports] complete scraped={total_scraped}", flush=True)


if __name__ == "__main__":
    main()
