"""Build a retrospective football model-versus-market benchmark.

The archived SportsDataverse lines are historical reference rows. They do not
carry a verified pregame capture clock, so this artifact is descriptive and
never enters the prospective scorecard.
"""

from __future__ import annotations

import hashlib
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / ".local" / "football.sqlite3"
OUT = ROOT / "frontend" / "public" / "data" / "football" / "market-benchmark.json"


def mae(values: list[float]) -> float | None:
    return round(sum(abs(value) for value in values) / len(values), 4) if values else None


def rmse(values: list[float]) -> float | None:
    return round(math.sqrt(sum(value * value for value in values) / len(values)), 4) if values else None


def accuracy(values: list[bool]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def main() -> None:
    evaluation = json.loads((ROOT / "frontend/public/data/football/evaluation/games.json").read_text())
    games = evaluation["games"]
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    market_rows: dict[str, sqlite3.Row] = {}
    for row in conn.execute("SELECT game_id,observed_at,source,home_spread,total,is_pregame FROM football_markets"):
        prior = market_rows.get(row["game_id"])
        if prior is None or (row["observed_at"] or "") > (prior["observed_at"] or ""):
            market_rows[row["game_id"]] = row
    conn.close()

    rows: list[dict[str, object]] = []
    for game in games:
        market = market_rows.get(game["id"])
        if market is None:
            continue
        prediction = game["preseason"]
        actual_margin = game["home_score"] - game["away_score"]
        actual_total = game["home_score"] + game["away_score"]
        home_spread = float(market["home_spread"]) if market["home_spread"] is not None else None
        archived_margin = -home_spread if home_spread is not None else None
        archived_total = float(market["total"]) if market["total"] is not None else None
        rows.append({
            "game_id": game["id"], "season": game["season"], "starts_at": game["starts_at"],
            "home_id": game["home_id"], "away_id": game["away_id"],
            "home_name": game["home_name"], "away_name": game["away_name"],
            "home_score": game["home_score"], "away_score": game["away_score"],
            "actual_margin": actual_margin, "actual_total": actual_total,
            "model_margin": round(float(prediction["home_margin"]), 4),
            "model_total": round(float(prediction["total"]), 4),
            "model_home_win_probability": round(float(prediction["home_win_probability"]), 4),
            "archived_home_spread": home_spread,
            "archived_margin": round(archived_margin, 4) if archived_margin is not None else None,
            "archived_total": archived_total,
            "model_margin_edge": round(float(prediction["home_margin"]) + home_spread, 4) if home_spread is not None else None,
            "model_pick_correct": (float(prediction["home_margin"]) > 0) == (actual_margin > 0) if actual_margin else None,
            "market_pick_correct": (archived_margin > 0) == (actual_margin > 0) if archived_margin is not None and actual_margin else None,
            "observed_at": market["observed_at"], "source": market["source"],
            "is_pregame": bool(market["is_pregame"]),
        })

    model_margin_errors = [row["model_margin"] - row["actual_margin"] for row in rows]
    market_margin_errors = [row["archived_margin"] - row["actual_margin"] for row in rows if row["archived_margin"] is not None]
    model_total_errors = [row["model_total"] - row["actual_total"] for row in rows]
    market_total_errors = [row["archived_total"] - row["actual_total"] for row in rows if row["archived_total"] is not None]
    model_picks = [row["model_pick_correct"] for row in rows if row["model_pick_correct"] is not None]
    market_picks = [row["market_pick_correct"] for row in rows if row["market_pick_correct"] is not None]
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
    payload = {
        "edition": hashlib.sha256(canonical).hexdigest(),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "season": 2025, "evaluation_experiment_id": evaluation.get("experiment_id"),
        "coverage": {"evaluation_games": len(games), "market_games": len(rows), "pregame_market_games": sum(1 for row in rows if row["is_pregame"]), "market_source": "SportsDataverse archive"},
        "metrics": {
            "model": {"margin_mae": mae(model_margin_errors), "margin_rmse": rmse(model_margin_errors), "total_mae": mae(model_total_errors), "winner_accuracy": accuracy(model_picks)},
            "archived_line": {"margin_mae": mae(market_margin_errors), "margin_rmse": rmse(market_margin_errors), "total_mae": mae(market_total_errors), "winner_accuracy": accuracy(market_picks)},
        },
        "methodology": "Model uses the fixed preseason holdout prediction; archived margin is the negative home spread. Archived observations are historical reference rows and have no verified pregame capture timing, so this benchmark is descriptive and excluded from prospective evaluation.",
        "rows": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"output": str(OUT), "coverage": payload["coverage"], "metrics": payload["metrics"]}, indent=2))


if __name__ == "__main__":
    main()
