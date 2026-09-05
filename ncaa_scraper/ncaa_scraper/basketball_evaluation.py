"""Reproducible weekly basketball experiment, separate from live forecasts.

Every weekly fit uses only games starting before its Monday cutoff minus 24h.
Source revisions are not historically versioned: this remains retrospective.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import math
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .basketball import DB, OUT, load_games
from .basketball_model import (
    apply_calibration,
    calibrate,
    calibrate_predictions,
    fit,
    forecast,
    raw_predict,
)
from .football_sources import ROOT, utcnow

SETTINGS = {
    "version": "basketball-weekly-experiment-v1",
    "calibration_season": 2025,
    "evaluation_season": 2026,
    "refit": "Monday 00:00 UTC",
    "start_buffer_hours": 24,
    "field": "Frozen from previous-season fit; ten games in its latest season",
    "efficiency_penalty": 12,
    "tempo_penalty": 8,
    "season_weight": 0.6,
    "bootstrap_replicates": 5000,
    "bootstrap_seed": 2701,
}
DIRECTORY = OUT / "evaluation"
FILES = ("summary.json", "games.json", "calibration-games.json", "fits.json")


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def timestamp(value):
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("Evaluation timestamps require a time zone")
    return date.astimezone(timezone.utc)


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


def week_start(value):
    date = timestamp(value)
    return date.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
        days=date.weekday()
    )


def training_before(games, season, cutoff):
    return [
        g
        for g in games
        if g["completed"]
        and g["season"] <= season
        and timestamp(g["starts_at"]) < cutoff
    ]


def rolling_predictions(games, season):
    target = sorted(
        [g for g in games if g["season"] == season and g["completed"]],
        key=lambda g: (timestamp(g["starts_at"]), g["id"]),
    )
    if not target:
        raise ValueError("No evaluation season games")
    first_cutoff = week_start(target[0]["starts_at"]) - timedelta(hours=24)
    prior = [
        g for g in training_before(games, season, first_cutoff) if g["season"] < season
    ]
    base = fit(prior)
    field = base["teams"]
    weeks = defaultdict(list)
    for game in target:
        weeks[week_start(game["starts_at"])].append(game)
    predictions, fits = [], []
    for week, scheduled in sorted(weeks.items()):
        cutoff = week - timedelta(hours=SETTINGS["start_buffer_hours"])
        training = training_before(games, season, cutoff)
        training = [
            g for g in training if g["home_id"] in field and g["away_id"] in field
        ]
        model = fit(training, teams=field)
        record = {
            "season": season,
            "week_start": iso(week),
            "training_before": iso(cutoff),
            "training_ids": sorted(g["id"] for g in training),
            "training_sha256": digest(training),
            "model": model,
        }
        record["id"] = digest(record)
        fits.append(record)
        for game in scheduled:
            prediction = raw_predict(model, game)
            if prediction is not None:
                predictions.append((game, prediction, record["id"], iso(cutoff)))
        print(
            f"Weekly evaluation {season} {iso(week)[:10]}: {len(training)} training games",
            flush=True,
        )
    return base, predictions, fits


def metrics(rows, method):
    if not rows:
        return {
            "games": 0,
            **{
                key: None
                for key in (
                    "margin_mae",
                    "margin_rmse",
                    "total_mae",
                    "winner_accuracy",
                    "brier",
                    "log_loss",
                    "interval_coverage",
                    "margin_bias",
                )
            },
        }
    errors, total_errors, probabilities, outcomes, covered = [], [], [], [], []
    for row in rows:
        p = row[method]
        margin = row["home_score"] - row["away_score"]
        errors.append(p["home_margin"] - margin)
        total_errors.append(abs(p["total"] - row["home_score"] - row["away_score"]))
        probabilities.append(min(1 - 1e-6, max(1e-6, p["home_win_probability"])))
        outcomes.append(float(row["home_score"] > row["away_score"]))
        covered.append(p["margin_low"] <= margin <= p["margin_high"])
    errors, probabilities, outcomes = map(np.asarray, (errors, probabilities, outcomes))
    return {
        "games": len(rows),
        "margin_mae": float(np.abs(errors).mean()),
        "margin_rmse": float(np.sqrt((errors**2).mean())),
        "total_mae": float(np.mean(total_errors)),
        "margin_bias": float(errors.mean()),
        "winner_accuracy": float(np.mean((probabilities >= 0.5) == outcomes)),
        "brier": float(np.mean((probabilities - outcomes) ** 2)),
        "log_loss": float(
            -np.mean(
                outcomes * np.log(probabilities)
                + (1 - outcomes) * np.log(1 - probabilities)
            )
        ),
        "interval_coverage": float(np.mean(covered)),
    }


def paired_difference(rows, replicates=5000):
    weeks = defaultdict(list)
    for row in rows:
        actual = row["home_score"] - row["away_score"]
        delta = abs(row["weekly"]["home_margin"] - actual) - abs(
            row["preseason"]["home_margin"] - actual
        )
        weeks[iso(week_start(row["starts_at"]))].append(delta)
    if not weeks:
        return {"difference": None, "low": None, "high": None, "weeks": 0}
    blocks = list(weeks.values())
    sums = np.array([sum(block) for block in blocks])
    counts = np.array([len(block) for block in blocks])
    difference = float(sums.sum() / counts.sum())
    if len(blocks) < 2:
        return {
            "difference": difference,
            "low": None,
            "high": None,
            "weeks": len(blocks),
        }
    rng = np.random.default_rng(SETTINGS["bootstrap_seed"])
    samples = rng.integers(0, len(blocks), size=(replicates, len(blocks)))
    draws = sums[samples].sum(axis=1) / counts[samples].sum(axis=1)
    low, high = np.quantile(draws, [0.025, 0.975])
    return {
        "difference": difference,
        "low": float(low),
        "high": float(high),
        "weeks": len(blocks),
    }


def game_record(game, preseason, weekly, fit_id, cutoff):
    return {
        **{
            key: game[key]
            for key in (
                "id",
                "season",
                "starts_at",
                "home_id",
                "away_id",
                "home_name",
                "away_name",
                "home_score",
                "away_score",
                "neutral",
                "periods",
            )
        },
        "preseason": preseason,
        "weekly": weekly,
        "weekly_fit_id": fit_id,
        "training_before": cutoff,
    }


def verify_sources(conn, overview):
    sources = [
        s
        for s in overview["sources"]
        if s["dataset"] in ("schedule", "team_box") and s["season"] <= 2026
    ]
    if {(s["dataset"], s["season"]) for s in sources} != {
        (dataset, year)
        for dataset in ("schedule", "team_box")
        for year in (2024, 2025, 2026)
    }:
        raise ValueError("Expected all six schedule/team-box receipts")
    for source in sources:
        current = conn.execute(
            "SELECT receipt_json FROM bb_sources WHERE dataset=? AND season=?",
            (source["dataset"], source["season"]),
        ).fetchone()
        if not current or json.loads(current[0])["sha256"] != source["sha256"]:
            raise ValueError("Source warehouse differs from published model edition")
    return sources


def build(conn, overview, output=DIRECTORY):
    sources = verify_sources(conn, overview)
    schedules, _, valid = load_games(conn)
    valid = [g for g in valid if g["season"] in (2024, 2025, 2026)]
    if len({g["id"] for g in valid}) != len(valid):
        raise ValueError("Repeated game identity")
    implementation = {
        name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
        for name in ("basketball_evaluation.py", "basketball_model.py")
    }
    signature = digest(
        {
            "settings": SETTINGS,
            "sources": sources,
            "games": valid,
            "production_model": overview["model"]["id"],
            "implementation": implementation,
        }
    )
    manifest_path = output / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("signature") == signature and all(
            (output / name).exists()
            and hashlib.sha256((output / name).read_bytes()).hexdigest()
            == manifest["files"].get(name)
            for name in FILES
        ):
            print("Verified evaluation artifacts are current", flush=True)
            return json.loads((output / "summary.json").read_text())

    initial, calibration_pairs, calibration_fits = rolling_predictions(valid, 2025)
    calibration = calibrate_predictions([(g, p) for g, p, _, _ in calibration_pairs])
    prior_calibration = calibrate([g for g in valid if g["season"] == 2025], initial)
    baseline, test_pairs, test_fits = rolling_predictions(valid, 2026)
    baseline["calibration"] = prior_calibration
    rows = [
        game_record(
            g, forecast(baseline, g), apply_calibration(p, calibration), fit_id, cutoff
        )
        for g, p, fit_id, cutoff in test_pairs
    ]
    if any(row["preseason"] is None for row in rows):
        raise ValueError("The two methods must use exactly the same game field")
    summary_metrics = {
        method: metrics(rows, method) for method in ("preseason", "weekly")
    }
    # Pin this experiment to the existing published evaluation, not a quietly
    # changed baseline. Coverage uses unrounded half-width in the original model.
    expected = overview["model"]["evaluation"]
    for key in (
        "games",
        "margin_mae",
        "margin_rmse",
        "total_mae",
        "winner_accuracy",
        "brier",
        "log_loss",
    ):
        if not math.isclose(
            summary_metrics["preseason"][key],
            expected[key],
            rel_tol=1e-10,
            abs_tol=1e-10,
        ):
            raise ValueError(f"Published baseline parity failed: {key}")
    target = [g for g in valid if g["season"] == 2026]
    scored_ids = {g["id"] for g in rows}
    calibration_rows = [
        {
            "game": g,
            "raw_prediction": p,
            "weekly_fit_id": fit_id,
            "training_before": cutoff,
        }
        for g, p, fit_id, cutoff in calibration_pairs
    ]
    summary = {
        "id": signature,
        "generated_at": utcnow(),
        "settings": SETTINGS,
        "production_model_id": overview["model"]["id"],
        "source_edition": overview["generated_at"],
        "sources": sources,
        "implementation_sha256": implementation,
        "metrics": summary_metrics,
        "calibration": {"preseason": prior_calibration, "weekly": calibration},
        "paired_mae_difference": paired_difference(
            rows, SETTINGS["bootstrap_replicates"]
        ),
        "baseline_margin_mae": expected["baseline_margin_mae"],
        "coverage": {
            "completed_schedule_games": sum(
                g["completed"] and g["season"] == 2026 for g in schedules
            ),
            "paired_box_games": len(target),
            "compared_games": len(rows),
            "outside_field": len(target) - len(rows),
            "calibration_games": len(calibration_pairs),
            "calibration_weeks": len(calibration_fits),
            "test_weeks": len(test_fits),
        },
        "excluded_games": [
            {
                "id": g["id"],
                "home_name": g["home_name"],
                "away_name": g["away_name"],
                "reason": "At least one program outside the frozen preseason field",
            }
            for g in target
            if g["id"] not in scored_ids
        ],
        "limitations": [
            "Retrospective replay using current source releases; historical revisions and availability timestamps are not reconstructed.",
            "Weekly fits include only completed records with starts before Monday 00:00 UTC minus 24 hours; exact historical final-publication times are unavailable.",
            "2024–25 rolling predictions calibrate the challenger; those calibration results are not independent test performance.",
            "2025–26 games enter later weekly fits only after the cutoff buffer. No game enters its own prediction or any earlier week's fit.",
            "The preseason team's field is frozen before each season. New programs outside it are excluded from both methods.",
            "No roster, availability, injury, recruiting or bookmaker inputs. This experiment does not replace live preseason forecasts or enter the prospective ledger.",
            "The week-block bootstrap describes sampling variation within this one season. It is not a guarantee across future seasons or protection against shared-team dependence between weeks.",
            "Fixed penalties, yearly weights and update cadence; no parameter search was performed. This is a new exploratory comparison on a season already used for the published baseline evaluation.",
        ],
    }
    artifacts = {
        "summary.json": summary,
        "games.json": {"experiment_id": signature, "games": rows},
        "calibration-games.json": {
            "experiment_id": signature,
            "games": calibration_rows,
        },
        "fits.json": {
            "experiment_id": signature,
            "preseason_model": baseline,
            "calibration_initial_model": initial,
            "fits": calibration_fits + test_fits,
        },
    }
    output.mkdir(parents=True, exist_ok=True)
    for name, value in artifacts.items():
        temporary = output / (name + ".tmp")
        temporary.write_text(json.dumps(value, separators=(",", ":"), allow_nan=False))
        temporary.replace(output / name)
    manifest = {
        "signature": signature,
        "files": {
            name: hashlib.sha256((output / name).read_bytes()).hexdigest()
            for name in FILES
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(summary_metrics, indent=2), flush=True)
    return summary


def main():
    with (ROOT / ".local/basketball-evaluation.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(
                "A basketball evaluation build is already active"
            ) from None
        conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        with conn:
            build(conn, json.loads((OUT / "overview.json").read_text()))


if __name__ == "__main__":
    main()
