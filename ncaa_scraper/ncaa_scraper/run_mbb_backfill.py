"""Scrape pending MBB games (box + pbp + shots), MBB-scoped, with progress logs.

Unlike the generic `ncaa_db backfill`, this filters to men's basketball games
only (the seed graph can contain other sports from sample runs).

Run:  python -m ncaa_scraper.run_mbb_backfill --limit 200
"""

from __future__ import annotations

import argparse

from sqlalchemy import or_

from .ingest import NCAAIngestor
from .models import Game, Team, create_session


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="sqlite:///data/ncaa_mbb.sqlite3")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--division", default="1")
    args = parser.parse_args()

    session = create_session(args.db)
    ingestor = NCAAIngestor(session=session, division=args.division)

    mbb_team_ids = {t.ncaa_team_id for t in session.query(Team).filter(Team.sport_code == "MBB")}
    pending = (
        session.query(Game)
        .filter(Game.scrape_status.in_(("pending", "failed")))
        .filter(Game.game_date >= "2025-11-01")
        .filter(or_(Game.home_team_id.in_(mbb_team_ids), Game.away_team_id.in_(mbb_team_ids)))
        .order_by(Game.game_date, Game.contest_id)
        .limit(args.limit)
        .all()
    )
    print(f"[mbb-backfill] pending MBB games: {len(pending)}", flush=True)
    ok = fail = 0
    for i, game in enumerate(pending, 1):
        try:
            parsed = ingestor.scrape_game(game.contest_id)
            ok += 1
            print(
                f"[mbb-backfill] {i}/{len(pending)} contest={game.contest_id} actions={len(parsed.actions)} shots={len(parsed.shots)}",
                flush=True,
            )
        except Exception as exc:
            fail += 1
            game.scrape_status = "failed"
            session.commit()
            print(f"[mbb-backfill] {i}/{len(pending)} contest={game.contest_id} FAILED {exc}", flush=True)
    print(f"[mbb-backfill] done ok={ok} fail={fail}", flush=True)


if __name__ == "__main__":
    main()
