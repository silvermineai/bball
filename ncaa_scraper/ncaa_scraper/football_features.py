"""Fixed, retrospective test of lagged efficiency features beyond weekly scores."""

from __future__ import annotations

import fcntl
import hashlib
import json
import math
import sqlite3
from collections import defaultdict
from pathlib import Path

import numpy as np

from .football import DB_PATH, number
from .football_evaluation import (
    calibrate_rows,
    digest,
    encoded,
    iso,
    metrics,
    rolling,
    timestamp,
    week_start,
)
from .football_model import predict
from .football_sources import ROOT, utcnow

SPEC_PATH = ROOT / "data/research/football-efficiency-experiment.json"
SPEC = json.loads(SPEC_PATH.read_text())
BASE = ROOT / "frontend/public/data/football/evaluation"
OUT = ROOT / "frontend/public/data/football/features"
FEATURES = SPEC["features"]


def paired_inputs(games, raw_rows):
    source = {}
    for r in raw_rows:
        key = (r.get("game_id"), r.get("pos_team_id"))
        if key in source:
            raise ValueError("Duplicate advanced game/team identity")
        source[key] = r
    pairs = []
    for g in games:
        rows = [source.get((g["id"], g[side + "_id"])) for side in ("home", "away")]
        if any(r is None for r in rows):
            continue
        values = [
            [
                number(r.get(k))
                for k in ("EPA_overall_off", "off_yards", "scrimmage_plays")
            ]
            for r in rows
        ]
        if any(v is None for row in values for v in row) or any(
            row[2] <= 0 for row in values
        ):
            continue
        if any(int(r["season"]) != g["season"] for r in rows):
            raise ValueError("Advanced feature season disagrees with schedule")
        pairs.append(
            {
                "game_id": g["id"],
                "season": g["season"],
                "kickoff": g["kickoff"],
                "home_id": g["home_id"],
                "away_id": g["away_id"],
                "home": dict(zip(("epa", "yards", "plays"), values[0])),
                "away": dict(zip(("epa", "yards", "plays"), values[1])),
            }
        )
    return pairs


def feature_state(pairs, season, cutoff):
    selected = [
        r
        for r in pairs
        if season - SPEC["feature_seasons"] < r["season"] <= season
        and timestamp(r["kickoff"]) < timestamp(cutoff)
    ]
    if not selected:
        raise ValueError("No prior paired advanced games for feature state")
    teams = defaultdict(
        lambda: {
            "games": 0,
            "off_epa": 0.0,
            "off_yards": 0.0,
            "off_plays": 0.0,
            "def_epa": 0.0,
            "def_yards": 0.0,
            "def_plays": 0.0,
        }
    )
    league = {"epa": 0.0, "yards": 0.0, "plays": 0.0}
    for r in selected:
        weight = SPEC["prior_season_weight"] ** (season - r["season"])
        for side, other in (("home", "away"), ("away", "home")):
            t = teams[r[side + "_id"]]
            t["games"] += 1
            for k in ("epa", "yards", "plays"):
                t["off_" + k] += weight * r[side][k]
                t["def_" + k] += weight * r[other][k]
                league[k] += weight * r[side][k]
    prior = {
        "epa": league["epa"] / league["plays"],
        "ypp": league["yards"] / league["plays"],
    }
    for t in teams.values():
        t["rates"] = {
            f"{side}_{metric}": (
                t[f"{side}_{field}"] + SPEC["shrinkage_plays"] * prior[metric]
            )
            / (t[f"{side}_plays"] + SPEC["shrinkage_plays"])
            for side in ("off", "def")
            for metric, field in (("epa", "epa"), ("ypp", "yards"))
        }
    record = {
        "season": season,
        "training_before": cutoff,
        "game_ids": sorted(r["game_id"] for r in selected),
        "inputs_sha256": digest(selected),
        "league": league,
        "prior": prior,
        "teams": dict(teams),
    }
    record["id"] = digest(record)
    return record


def feature_vector(row, state):
    g = row["game"]
    default = {
        f"{side}_{metric}": state["prior"][metric]
        for side in ("off", "def")
        for metric in ("epa", "ypp")
    }
    home = state["teams"].get(g["home_id"], {}).get("rates", default)
    away = state["teams"].get(g["away_id"], {}).get("rates", default)
    vector = [row["raw_margin"]] + [
        home[k] - away[k] for k in ("off_epa", "def_epa", "off_ypp", "def_ypp")
    ]
    return vector


def enrich(rows, pairs):
    states = {}
    result = []
    for row in rows:
        key = (row["game"]["season"], row["training_before"])
        if key not in states:
            states[key] = feature_state(pairs, *key)
        state = states[key]
        result.append(
            {
                **row,
                "feature_state_id": state["id"],
                "features": feature_vector(row, state),
                "missing_history": [
                    side
                    for side in ("home", "away")
                    if row["game"][side + "_id"] not in state["teams"]
                ],
            }
        )
    return result, list(states.values())


def fit_correction(rows, columns):
    if len(rows) < 100 or {r["game"]["season"] for r in rows} != {
        SPEC["training_season"]
    }:
        raise ValueError("Residual training must use the fixed 2023 season only")
    x = np.array([[r["features"][i] for i in columns] for r in rows])
    mean = x.mean(axis=0)
    scale = x.std(axis=0)
    scale[scale < 1e-12] = 1
    design = np.column_stack((np.ones(len(x)), (x - mean) / scale))
    y = np.array(
        [
            r["game"]["home_score"] - r["game"]["away_score"] - r["raw_margin"]
            for r in rows
        ]
    )
    penalty = np.eye(design.shape[1]) * SPEC["ridge_penalty"]
    penalty[0, 0] = 0
    coefficients = np.linalg.solve(design.T @ design + penalty, design.T @ y)
    return {
        "columns": columns,
        "features": [FEATURES[i] for i in columns],
        "mean": mean.tolist(),
        "scale": scale.tolist(),
        "coefficients": coefficients.tolist(),
        "training_ids": [r["game"]["id"] for r in rows],
        "training_sha256": digest(rows),
        "season": SPEC["training_season"],
        "penalty": SPEC["ridge_penalty"],
    }


def corrected(row, model):
    x = np.array([row["features"][i] for i in model["columns"]])
    contributions = ((x - model["mean"]) / model["scale"]) * model["coefficients"][1:]
    correction = model["coefficients"][0] + float(contributions.sum())
    return row["raw_margin"] + correction, {
        "intercept": model["coefficients"][0],
        "features": contributions.tolist(),
        "correction": correction,
    }


def calibrated(margin, total, calibration):
    intercept, slope = calibration["logistic_coefficients"]
    probability = 1 / (1 + math.exp(-max(-30, min(30, intercept + slope * margin))))
    width = calibration["margin_half_width"]
    return {
        "home_margin": margin,
        "total": total,
        "home_score": round((total + margin) / 2, 1),
        "away_score": round((total - margin) / 2, 1),
        "home_win_probability": round(probability, 4),
        "margin_low": round(margin - width, 1),
        "margin_high": round(margin + width, 1),
    }


def bootstrap(rows):
    weeks = defaultdict(list)
    for r in rows:
        actual = r["home_score"] - r["away_score"]
        weeks[iso(week_start(r["starts_at"]))].append(
            abs(r["efficiency"]["home_margin"] - actual)
            - abs(r["control"]["home_margin"] - actual)
        )
    sums = np.array([sum(v) for v in weeks.values()])
    counts = np.array([len(v) for v in weeks.values()])
    rng = np.random.default_rng(SPEC["bootstrap_seed"])
    samples = rng.integers(
        0, len(weeks), size=(SPEC["bootstrap_replicates"], len(weeks))
    )
    draws = sums[samples].sum(axis=1) / counts[samples].sum(axis=1)
    lo, hi = np.quantile(draws, [0.025, 0.975])
    return {
        "difference": float(sums.sum() / counts.sum()),
        "low": float(lo),
        "high": float(hi),
        "weeks": len(weeks),
    }


def read_base():
    manifest = json.loads((BASE / "manifest.json").read_text())
    data = {}
    for name, sha in manifest["files"].items():
        content = (BASE / name).read_bytes()
        if hashlib.sha256(content).hexdigest() != sha:
            raise ValueError("Weekly benchmark artifact changed")
        data[name] = json.loads(content)
    fits = {f["id"]: f for f in data["fits.json"]["fits"]}
    for row in data["calibration-games.json"]["games"]:
        expected = predict(fits[row["weekly_fit_id"]]["model"], row["game"])
        if not np.allclose(
            expected, [row["raw_margin"], row["raw_total"]], atol=1e-10, rtol=0
        ):
            raise ValueError("Weekly calibration forecast mismatch")
    games = {g["id"]: g for g in data["training-games.json"]["games"]}
    test = []
    for row in data["games.json"]["games"]:
        game = games[row["id"]]
        fit = fits[row["weekly_fit_id"]]
        raw = predict(fit["model"], game)
        if not np.allclose(
            raw,
            [row["weekly"]["home_margin"], row["weekly"]["total"]],
            atol=1e-10,
            rtol=0,
        ):
            raise ValueError("Weekly evaluation forecast mismatch")
        test.append(
            {
                "game": game,
                "raw_margin": raw[0],
                "raw_total": raw[1],
                "weekly_fit_id": fit["id"],
                "training_before": fit["training_before"],
            }
        )
    return manifest, data, test


def build(conn, out=OUT):
    base_manifest, base, test = read_base()
    games = base["training-games.json"]["games"]
    for g in games:
        actual = dict(
            conn.execute(
                "SELECT * FROM football_games WHERE id=?", (g["id"],)
            ).fetchone()
        )
        actual.pop("source_json")
        if actual != g:
            raise ValueError("Warehouse schedule differs from weekly benchmark")
    sources = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT receipt_json FROM football_sources WHERE dataset='team_advanced' AND season BETWEEN 2022 AND 2025 ORDER BY season"
        )
    ]
    if [s["season"] for s in sources] != [2022, 2023, 2024, 2025]:
        raise ValueError("Four advanced source seasons required")
    raw = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT stats_json FROM football_stats WHERE dataset='team_advanced' AND season BETWEEN 2022 AND 2025 ORDER BY season,record_key"
        )
    ]
    pairs = paired_inputs(games, raw)
    implementations = {
        name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
        for name in (
            "football_features.py",
            "football_evaluation.py",
            "football_model.py",
            "football.py",
            "football_sources.py",
        )
    }
    signature = digest(
        {
            "spec": SPEC,
            "base": base_manifest,
            "sources": sources,
            "pairs": pairs,
            "implementation": implementations,
        }
    )
    if (out / "manifest.json").exists():
        cached = json.loads((out / "manifest.json").read_text())
        if cached["experiment_id"] == signature and all(
            hashlib.sha256((out / name).read_bytes()).hexdigest() == sha
            for name, sha in cached["files"].items()
        ):
            print("Verified unchanged efficiency experiment cache")
            return json.loads((out / "summary.json").read_text())
    _, train, train_fits = rolling(games, SPEC["training_season"])
    train, train_states = enrich(train, pairs)
    calibration, cal_states = enrich(base["calibration-games.json"]["games"], pairs)
    evaluation, test_states = enrich(test, pairs)
    models = {
        "control": fit_correction(train, [0]),
        "efficiency": fit_correction(train, list(range(len(FEATURES)))),
    }
    calibrations = {}
    for method, model in models.items():
        rows = [{**r, "raw_margin": corrected(r, model)[0]} for r in calibration]
        calibrations[method] = calibrate_rows(rows)
    rows = []
    weekly_calibration = base["summary.json"]["calibration"]["weekly"]
    for r in evaluation:
        row = {
            **r["game"],
            "starts_at": r["game"]["kickoff"],
            "weekly_fit_id": r["weekly_fit_id"],
            "training_before": r["training_before"],
            "feature_state_id": r["feature_state_id"],
            "features": r["features"],
            "missing_history": r["missing_history"],
            "weekly": calibrated(r["raw_margin"], r["raw_total"], weekly_calibration),
            "contributions": {},
        }
        for method, model in models.items():
            margin, contributions = corrected(r, model)
            row[method] = calibrated(margin, r["raw_total"], calibrations[method])
            row["contributions"][method] = contributions
        rows.append(row)
    results = {
        method: metrics(rows, method) for method in ("weekly", "control", "efficiency")
    }
    for key, value in base["summary.json"]["metrics"]["weekly"].items():
        if abs(results["weekly"][key] - value) > 1e-10:
            raise ValueError("Published weekly benchmark metrics changed")
    summary = {
        "id": signature,
        "generated_at": utcnow(),
        "spec": SPEC,
        "implementation_sha256": implementations,
        "base_experiment_id": base_manifest["signature"],
        "base_manifest": base_manifest,
        "sources": sources,
        "schedule_sources": base["summary.json"]["sources"],
        "coverage": {
            "training_games": len(train),
            "calibration_games": len(calibration),
            "evaluation_games": len(rows),
            "paired_advanced_games": len(pairs),
            "feature_states": len(train_states + cal_states + test_states),
            "missing_history_games": sum(bool(r["missing_history"]) for r in rows),
        },
        "models": models,
        "calibration": calibrations,
        "metrics": results,
        "paired_difference": bootstrap(rows),
        "cohort": base["summary.json"]["coverage"],
    }
    files = {
        "summary.json": summary,
        "games.json": {"experiment_id": signature, "games": rows},
        "training.json": {
            "experiment_id": signature,
            "rows": train,
            "fits": train_fits,
        },
        "calibration.json": {"experiment_id": signature, "rows": calibration},
        "feature-states.json": {
            "experiment_id": signature,
            "states": train_states + cal_states + test_states,
        },
        "advanced-inputs.json": {"experiment_id": signature, "games": pairs},
    }
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"experiment_id": signature, "files": {}}
    for name, value in files.items():
        content = (encoded(value) + "\n").encode()
        (out / name).write_bytes(content)
        manifest["files"][name] = hashlib.sha256(content).hexdigest()
    (out / "manifest.json").write_text(encoded(manifest) + "\n")
    return summary


def main():
    lock_path = ROOT / ".local/football-features.lock"
    lock_path.parent.mkdir(exist_ok=True)
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            result = build(conn)
        print(
            json.dumps(
                {
                    k: result[k]
                    for k in ("id", "coverage", "metrics", "paired_difference")
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
