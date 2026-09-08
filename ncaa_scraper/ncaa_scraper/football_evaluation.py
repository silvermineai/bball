"""Retrospective weekly football refits, isolated from published forecasts."""

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

from .football import DB_PATH
from .football_model import calibrate, eligible, fit, forecast, predict
from .football_sources import ROOT, utcnow

OUT = ROOT / "frontend/public/data/football/evaluation"
SETTINGS = {
    "version": "football-weekly-experiment-v1",
    "calibration_season": 2024,
    "evaluation_season": 2025,
    "refit": "Monday 00:00 UTC",
    "start_buffer_hours": 24,
    "field": "Frozen from the preceding-season score fit",
    "season_weight": 0.65,
    "margin_penalty": 12,
    "total_penalty": 24,
    "home_field_penalty": 2,
    "logistic_penalty": 0.01,
    "bootstrap_replicates": 5000,
    "bootstrap_seed": 2605,
}
FILES = (
    "summary.json",
    "games.json",
    "calibration-games.json",
    "fits.json",
    "training-games.json",
)


def encoded(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(v):
    return hashlib.sha256(encoded(v).encode()).hexdigest()


def timestamp(v):
    d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("A timezone is required")
    return d.astimezone(timezone.utc)


def iso(v):
    return v.isoformat().replace("+00:00", "Z")


def week_start(v):
    d = timestamp(v)
    return d.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
        days=d.weekday()
    )


def training_before(games, season, cutoff, field=None):
    return [
        g
        for g in games
        if g["season"] <= season
        and eligible(g, iso(cutoff))
        and (field is None or (g["home_id"] in field and g["away_id"] in field))
    ]


def rolling(games, season):
    target = sorted(
        [g for g in games if g["season"] == season],
        key=lambda g: (timestamp(g["kickoff"]), g["id"]),
    )
    prior = training_before(
        games, season - 1, week_start(target[0]["kickoff"]) - timedelta(hours=24)
    )
    base = fit(prior)
    field = set(base["teams"])
    weeks = defaultdict(list)
    for g in target:
        weeks[week_start(g["kickoff"])].append(g)
    rows, fits = [], []
    for week, scheduled in sorted(weeks.items()):
        cutoff = week - timedelta(hours=SETTINGS["start_buffer_hours"])
        training = training_before(games, season, cutoff, field)
        model = fit(training)
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
        for g in scheduled:
            p = predict(model, g)
            if p is not None:
                rows.append(
                    {
                        "game": g,
                        "raw_margin": p[0],
                        "raw_total": p[1],
                        "weekly_fit_id": record["id"],
                        "training_before": iso(cutoff),
                    }
                )
        print(
            f"Football weekly fit {season} {iso(week)[:10]}: {len(training)} games",
            flush=True,
        )
    return base, rows, fits


def calibrate_rows(rows, season=None):
    if (
        len(rows) < 100
        or len({r["game"]["home_score"] > r["game"]["away_score"] for r in rows}) != 2
    ):
        raise ValueError("Calibration requires 100 games and both outcomes")
    x = np.array([[1.0, r["raw_margin"]] for r in rows])
    y = np.array(
        [float(r["game"]["home_score"] > r["game"]["away_score"]) for r in rows]
    )
    coef = np.array([0.0, 0.1])
    for _ in range(100):
        p = 1 / (1 + np.exp(-np.clip(x @ coef, -30, 30)))
        step = np.linalg.solve(
            x.T @ ((p * (1 - p))[:, None] * x) + np.eye(2) * 0.01,
            x.T @ (p - y) + 0.01 * coef,
        )
        coef -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    else:
        raise ValueError("Calibration failed to converge")
    if not np.all(np.isfinite(coef)) or coef[1] <= 0:
        raise ValueError("Calibration slope must be positive")
    errors = [
        abs(r["raw_margin"] - r["game"]["home_score"] + r["game"]["away_score"])
        for r in rows
    ]
    return {
        "season": int(season if season is not None else rows[0]["game"]["season"]),
        "games": len(rows),
        "logistic_coefficients": coef.tolist(),
        "margin_half_width": float(np.quantile(errors, 0.8)),
        "logistic_penalty": 0.01,
    }


def prediction(model, game, calibration):
    raw = predict(model, game)
    if raw is None:
        raise ValueError("Comparison field differs between models")
    result = forecast({**model, "calibration": calibration}, game)
    # Preserve raw score estimates for parity with the published holdout metrics.
    return {**result, "home_margin": raw[0], "total": raw[1]}


def metrics(rows, method):
    errors = np.array(
        [r[method]["home_margin"] - r["home_score"] + r["away_score"] for r in rows]
    )
    total = np.array(
        [r[method]["total"] - r["home_score"] - r["away_score"] for r in rows]
    )
    p = np.clip([r[method]["home_win_probability"] for r in rows], 1e-6, 1 - 1e-6)
    y = np.array([r["home_score"] > r["away_score"] for r in rows], dtype=float)
    return {
        "games": len(rows),
        "margin_mae": float(np.abs(errors).mean()),
        "margin_rmse": float(np.sqrt((errors**2).mean())),
        "total_mae": float(np.abs(total).mean()),
        "margin_bias": float(errors.mean()),
        "winner_accuracy": float(((p >= 0.5) == y).mean()),
        "brier": float(((p - y) ** 2).mean()),
        "log_loss": float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()),
        "interval_coverage": float(
            np.mean(
                [
                    r[method]["margin_low"]
                    <= r["home_score"] - r["away_score"]
                    <= r[method]["margin_high"]
                    for r in rows
                ]
            )
        ),
    }


def paired_difference(rows):
    weeks = defaultdict(list)
    for r in rows:
        actual = r["home_score"] - r["away_score"]
        weeks[iso(week_start(r["starts_at"]))].append(
            abs(r["weekly"]["home_margin"] - actual)
            - abs(r["preseason"]["home_margin"] - actual)
        )
    sums = np.array([sum(v) for v in weeks.values()])
    counts = np.array([len(v) for v in weeks.values()])
    rng = np.random.default_rng(SETTINGS["bootstrap_seed"])
    samples = rng.integers(
        0, len(weeks), size=(SETTINGS["bootstrap_replicates"], len(weeks))
    )
    draws = sums[samples].sum(axis=1) / counts[samples].sum(axis=1)
    lo, hi = np.quantile(draws, [0.025, 0.975])
    return {
        "difference": float(sums.sum() / counts.sum()),
        "low": float(lo),
        "high": float(hi),
        "weeks": len(weeks),
    }


def build(conn, overview, out=OUT):
    source_games = [
        dict(r)
        for r in conn.execute("SELECT * FROM football_games ORDER BY kickoff,id")
    ]
    valid = [
        {k: v for k, v in g.items() if k != "source_json"}
        for g in source_games
        if 2022 <= g["season"] <= 2025 and eligible(g, overview["generated_at"])
    ]
    if any(g["home_score"] == g["away_score"] for g in valid):
        raise ValueError("Unexpected tied modern football final; review the source")
    receipts = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT receipt_json FROM football_sources WHERE dataset='schedule' AND season BETWEEN 2022 AND 2025 ORDER BY season"
        )
    ]
    if {r["season"] for r in receipts} != {2022, 2023, 2024, 2025}:
        raise ValueError("Four schedule receipts required")
    for r in receipts:
        if not any(
            s["dataset"] == "schedule"
            and s["season"] == r["season"]
            and s["sha256"] == r["sha256"]
            for s in overview["sources"]
        ):
            raise ValueError("Source differs from published benchmark")
    implementation = {
        name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
        for name in ("football_evaluation.py", "football_model.py")
    }
    signature = digest(
        {
            "settings": SETTINGS,
            "sources": receipts,
            "games": valid,
            "model_id": overview["model"]["id"],
            "implementation": implementation,
        }
    )
    manifest_path = out / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("signature") == signature and all(
            (out / name).exists()
            and hashlib.sha256((out / name).read_bytes()).hexdigest()
            == manifest.get("files", {}).get(name)
            for name in FILES
        ):
            return json.loads((out / "summary.json").read_text())
    initial, cal_rows, cal_fits = rolling(valid, 2024)
    weekly_cal = calibrate_rows(cal_rows, season=2024)
    fixed_cal = calibrate([g for g in valid if g["season"] == 2024], initial)
    baseline, test_rows, test_fits = rolling(valid, 2025)
    fitted = {f["id"]: f["model"] for f in test_fits}
    def records(predictions, preseason_model, weekly_models, calibration, fixed_calibration):
        result = []
        for r in predictions:
            g = r["game"]
            result.append(
                {
                    **{
                        k: g[k]
                        for k in (
                            "id",
                            "season",
                            "home_id",
                            "away_id",
                            "home_name",
                            "away_name",
                            "home_score",
                            "away_score",
                            "neutral",
                        )
                    },
                    "starts_at": g["kickoff"],
                    "preseason": prediction(preseason_model, g, fixed_calibration),
                    "weekly": prediction(weekly_models[r["weekly_fit_id"]], g, calibration),
                    "weekly_fit_id": r["weekly_fit_id"],
                    "training_before": r["training_before"],
                }
            )
        return result

    rows = records(test_rows, baseline, fitted, weekly_cal, fixed_cal)
    # Add an earlier independent transition. The 2023 rolling replay supplies
    # calibration; the already-built 2024 replay supplies the test games.
    earlier_initial, earlier_cal_rows, earlier_cal_fits = rolling(valid, 2023)
    earlier_weekly_cal = calibrate_rows(earlier_cal_rows, season=2023)
    earlier_fixed_cal = calibrate(
        [g for g in valid if g["season"] == 2023], earlier_initial
    )
    earlier_rows = records(
        cal_rows,
        initial,
        {f["id"]: f["model"] for f in cal_fits},
        earlier_weekly_cal,
        earlier_fixed_cal,
    )
    measured = {method: metrics(rows, method) for method in ("preseason", "weekly")}
    season_results = [
        {
            "season": 2024,
            "calibration_season": 2023,
            "stage": "independent_test",
            "metrics": {method: metrics(earlier_rows, method) for method in ("preseason", "weekly")},
            "compared_games": len(earlier_rows),
            "weekly_fits": len(cal_fits),
            "calibration_games": len(earlier_cal_rows),
            "calibration_weeks": len(earlier_cal_fits),
        },
        {
            "season": 2025,
            "calibration_season": 2024,
            "stage": "independent_test",
            "metrics": measured,
            "compared_games": len(rows),
            "weekly_fits": len(test_fits),
            "calibration_games": len(cal_rows),
            "calibration_weeks": len(cal_fits),
        },
    ]
    for k in (
        "games",
        "margin_mae",
        "margin_rmse",
        "total_mae",
        "winner_accuracy",
        "brier",
        "log_loss",
        "interval_coverage",
    ):
        if not math.isclose(
            measured["preseason"][k],
            overview["model"]["evaluation"][k],
            rel_tol=1e-10,
            abs_tol=1e-10,
        ):
            raise ValueError("Published baseline parity failed: " + k)
    target = [g for g in valid if g["season"] == 2025]
    scored = {r["id"] for r in rows}
    summary = {
        "id": signature,
        "generated_at": utcnow(),
        "settings": SETTINGS,
        "production_model_id": overview["model"]["id"],
        "source_edition": overview["generated_at"],
        "sources": receipts,
        "implementation_sha256": implementation,
        "metrics": measured,
        "season_results": season_results,
        "calibration": {"preseason": fixed_cal, "weekly": weekly_cal},
        "paired_mae_difference": paired_difference(rows),
        "baseline_margin_mae": overview["model"]["evaluation"]["baseline_margin_mae"],
        "coverage": {
            "completed_schedule_games": sum(
                g["season"] == 2025 and g["completed"] for g in source_games
            ),
            "scored_fbs_games": len(target),
            "compared_games": len(rows),
            "outside_field": len(target) - len(rows),
            "calibration_games": len(cal_rows),
            "calibration_weeks": len(cal_fits),
            "test_weeks": len(test_fits),
        },
        "excluded_games": [g for g in target if g["id"] not in scored],
        "limitations": [
            "Retrospective experiment designed after the evaluation season. Historical source revisions and actual result-availability times are not reconstructed.",
            "The 2023–24 and 2024–25 rolling transitions use prior-season calibration and independent following-season tests; calibration rows are not independent test performance.",
            "Evaluation-season results enter later weekly fits only after the cutoff buffer, but never their own prediction.",
            "The 24-hour start buffer is conservative scheduling, not proof that a historical result had been reported. Calendar weeks use UTC, not source week numbers.",
            "Teams are frozen from the previous-season fit to keep both methods on the same field. New or unseen teams are excluded; performance on them is unknown.",
            "Both methods use scores, program identity and venue only. No roster, recruiting, injury, advanced efficiency or market features are included.",
            "The approximate interval resamples whole calendar weeks. Repeated teams and schedules can remain dependent across those blocks; it is not proof of future improvement or market advantage.",
            "No production forecasts, model registrations, odds observations or prospective ledger results are changed by this experiment.",
        ],
    }
    artifacts = {
        "summary.json": summary,
        "games.json": {"experiment_id": signature, "games": rows},
        "calibration-games.json": {
            "experiment_id": signature,
            "games": cal_rows,
            "earlier_transition": {"season": 2023, "games": earlier_cal_rows},
        },
        "fits.json": {
            "experiment_id": signature,
            "initial_model": initial,
            "preseason_model": baseline,
            "earlier_calibration_model": earlier_initial,
            "earlier_fits": earlier_cal_fits,
            "fits": cal_fits + test_fits,
        },
        "training-games.json": {"experiment_id": signature, "games": valid},
    }
    out.mkdir(parents=True, exist_ok=True)
    for name, value in artifacts.items():
        (out / name).write_text(encoded(value) + "\n")
    manifest = {
        "signature": signature,
        "files": {
            name: hashlib.sha256((out / name).read_bytes()).hexdigest()
            for name in FILES
        },
    }
    manifest_path.write_text(encoded(manifest) + "\n")
    return summary


def main():
    lock_path = ROOT / ".local/football-evaluation.lock"
    lock_path.parent.mkdir(exist_ok=True)
    lock = lock_path.open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("An evaluation build or archive is already active") from None
    overview = json.loads((OUT.parent / "overview.json").read_text())
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        summary = build(conn, overview)
    print(
        json.dumps(
            {
                "coverage": summary["coverage"],
                "metrics": summary["metrics"],
                "difference": summary["paired_mae_difference"],
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
