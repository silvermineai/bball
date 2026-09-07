"""Immutable forecast registration, source-state history and prospective evaluation.

Run after either sport's pipeline. Does not retrain or invent historical prices.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import tempfile
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .football_sources import ROOT, utcnow

DB = ROOT / ".local/research-ledger.sqlite3"
OUT = ROOT / "frontend/public/data/research"
POLICY = "first-eligible-registration-v1"
SPORTS = ("football", "basketball")


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp must include a timezone")
    return (
        parsed.astimezone(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def finite(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def connect(path=DB):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        (ROOT / "worker/migrations/0010_research_ledger.sql").read_text()
    )
    return conn


@contextmanager
def source_connection(sport):
    """Open the source store, rebuilding it from the publisher SQL export if needed.

    CI starts from a clean checkout and may retain the D1-ready SQL export while
    the intermediate SQLite file is absent. Replaying that export against the
    same schema keeps ledger state validation fail-closed without creating an
    empty source database through SQLite's default open behavior.
    """
    path = ROOT / f".local/{sport}.sqlite3"
    if path.exists():
        source = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            yield source
        finally:
            source.close()
        return

    sql_path = ROOT / f".local/{sport}.sql"
    if not sql_path.exists():
        # A single-sport publication still has the other sport's checked-in
        # overview. Without its source artifact, leave that sport untouched.
        yield None
        return
    migration = (
        ROOT / "worker/migrations/0008_football.sql"
        if sport == "football"
        else ROOT / "worker/migrations/0009_basketball_research.sql"
    )
    with tempfile.TemporaryDirectory(prefix=f"ledger-{sport}-") as directory:
        source = sqlite3.connect(Path(directory) / f"{sport}.sqlite3")
        try:
            source.executescript(migration.read_text())
            source.executescript(sql_path.read_text())
            yield source
        finally:
            source.close()


def register(conn, sport, game, model, generated_at, now):
    if sport not in SPORTS:
        raise ValueError("Unknown sport")
    p = game["prediction"]
    for key in ("home_margin", "total", "home_win_probability"):
        if not finite(p[key]):
            raise ValueError("Nonfinite prediction")
    if not 0 <= p["home_win_probability"] <= 1 or p["total"] < 0:
        raise ValueError("Invalid prediction")
    now, generated_at = timestamp(now), timestamp(generated_at)
    cutoff = timestamp(model["cutoff"])
    if not cutoff <= generated_at <= now:
        raise ValueError("Prediction timestamps are inconsistent")
    starts_at = timestamp(game.get("starts_at") or game["kickoff"])
    payload = {
        "home_id": game["home_id"],
        "away_id": game["away_id"],
        "home_name": game["home_name"],
        "away_name": game["away_name"],
        "season": game["season"],
        "neutral": bool(game["neutral"]),
        "prediction": p,
        "model_cutoff": cutoff,
    }
    identity = digest([sport, game["id"], model["id"]])
    prior = conn.execute(
        "SELECT * FROM audit_predictions WHERE id=?", (identity,)
    ).fetchone()
    if prior:
        # Existing registration keeps both its original clock and original schedule.
        # Re-using a model ID for changed estimates is an error, not an overwrite.
        old = json.loads(prior["payload_json"])
        if old["prediction"] != p or old["model_cutoff"] != cutoff:
            raise ValueError("An existing model/game estimate cannot be rewritten")
        return identity
    conn.execute(
        "INSERT INTO audit_predictions VALUES (?,?,?,?,?,?,?,?,?)",
        (
            identity,
            sport,
            game["id"],
            model["id"],
            generated_at,
            now,
            starts_at,
            int(game["time_tbd"]),
            encoded(payload),
        ),
    )
    return identity


def observe_state(conn, sport, game_id, state, now):
    if state is not None:
        state = dict(state)
        state["starts_at"] = timestamp(state["starts_at"])
        for key in ("home_score", "away_score"):
            if state.get(key) is not None and (
                not finite(state[key])
                or state[key] < 0
                or state[key] != int(state[key])
            ):
                raise ValueError("Invalid final score")
    # Deduplicate unchanged consecutive states, but preserve A -> B -> A corrections.
    prior = conn.execute(
        "SELECT payload_json,observed_at FROM audit_game_states WHERE sport=? AND game_id=? ORDER BY observed_at DESC,id DESC LIMIT 1",
        (sport, game_id),
    ).fetchone()
    payload = encoded(state)
    if prior and prior[0] == payload:
        return
    now = timestamp(now)
    if prior and now <= prior[1]:
        raise ValueError("Changed game states require a later observation time")
    conn.execute(
        "INSERT OR IGNORE INTO audit_game_states VALUES (?,?,?,?,?)",
        (
            digest([sport, game_id, now, state]),
            sport,
            game_id,
            now,
            payload,
        ),
    )


def ingest_published(conn, now):
    for sport in SPORTS:
        overview_path = ROOT / f"frontend/public/data/{sport}/overview.json"
        if not overview_path.exists():
            continue
        overview = json.loads(overview_path.read_text())
        with source_connection(sport) as source:
            if source is None:
                continue
            for game in overview["upcoming"]:
                if game.get("prediction"):
                    register(
                        conn, sport, game, overview["model"], overview["generated_at"], now
                    )
            source.row_factory = sqlite3.Row
            prefix = "football" if sport == "football" else "bb"
            clock = "kickoff" if sport == "football" else "starts_at"
            schedule_receipts = {
                r["season"]: json.loads(r["receipt_json"])
                for r in source.execute(
                    f"SELECT * FROM {prefix}_sources WHERE dataset='schedule'"
                )
            }
            for row in conn.execute(
                "SELECT DISTINCT game_id FROM audit_predictions WHERE sport=?", (sport,)
            ).fetchall():
                g = source.execute(
                    f"SELECT * FROM {prefix}_games WHERE id=?", (row[0],)
                ).fetchone()
                state = None
                if g:
                    receipt = schedule_receipts[g["season"]]
                    state = {
                        k: g[k]
                        for k in (
                            "home_id",
                            "away_id",
                            "home_score",
                            "away_score",
                            "completed",
                            "time_tbd",
                        )
                    }
                    state.update(
                        starts_at=g[clock],
                        source_url=receipt["url"],
                        source_fetched_at=receipt["fetched_at"],
                        source_sha256=receipt["sha256"],
                    )
                observe_state(conn, sport, row[0], state, now)
    conn.commit()


def eligibility(row, state):
    if state is None:
        return "missing_schedule"
    p = row["payload"]
    if p["home_id"] != state["home_id"] or p["away_id"] != state["away_id"]:
        return "participants_changed"
    if row["time_tbd"] or state["time_tbd"]:
        return "unconfirmed_start"
    if row["starts_at"] != timestamp(state["starts_at"]):
        return "schedule_changed"
    if row["registered_at"] >= row["starts_at"]:
        return "registered_after_start"
    if (
        row["generated_at"] > row["registered_at"]
        or p["model_cutoff"] > row["generated_at"]
    ):
        return "invalid_clock"
    return None


def final_status(state, now):
    if state["completed"]:
        if state["home_score"] is None or state["away_score"] is None:
            return "final_missing_scores"
        if timestamp(state["starts_at"]) > now:
            return "inconsistent_final"
        return "settled"
    return "awaiting_result" if timestamp(state["starts_at"]) <= now else "scheduled"


def market_eligible(quote, prediction, state, now):
    p = quote["payload"]
    boundary = min(prediction["starts_at"], timestamp(state["starts_at"]))
    return (
        p["home_id"] == state["home_id"]
        and p["away_id"] == state["away_id"]
        and timestamp(p["starts_at"]) == boundary
        and prediction["registered_at"] <= quote["captured_at"] < boundary
        and quote["updated_at"] <= quote["captured_at"] <= now
        and quote["updated_at"] < boundary
        # A last-observed quote older than 24 hours isn't treated as a recent comparison.
        and (
            datetime.fromisoformat(quote["captured_at"].replace("Z", "+00:00"))
            - datetime.fromisoformat(quote["updated_at"].replace("Z", "+00:00"))
        ).total_seconds()
        <= 86400
    )


def compare(prediction, quote, state):
    p, q = prediction["payload"]["prediction"], quote["payload"]
    market = quote["market"]
    output = {
        "bookmaker": quote["bookmaker"],
        "provider": quote["provider"],
        "market": market,
        "captured_at": quote["captured_at"],
        "updated_at": quote["updated_at"],
        "line": q.get("line"),
        "model_difference": None,
        "market_home_probability": None,
    }
    if market == "spreads":
        output["model_difference"] = p["home_margin"] + q["line"]
    elif market == "totals":
        output["model_difference"] = p["total"] - q["line"]
    elif market == "h2h":
        a, b = 1 / q["home_price"], 1 / q["away_price"]
        output["market_home_probability"] = a / (a + b)
        output["model_difference"] = (
            p["home_win_probability"] - output["market_home_probability"]
        )
    if (
        state["completed"]
        and state["home_score"] is not None
        and state["away_score"] is not None
    ):
        margin, total = (
            state["home_score"] - state["away_score"],
            state["home_score"] + state["away_score"],
        )
        if market in ("spreads", "totals"):
            actual, estimate = (
                (margin, p["home_margin"])
                if market == "spreads"
                else (total, p["total"])
            )
            baseline = -q["line"] if market == "spreads" else q["line"]
            output.update(
                model_absolute_error=abs(estimate - actual),
                market_absolute_error=abs(baseline - actual),
            )
            edge = output["model_difference"]
            outcome = actual - baseline
            output["direction_result"] = (
                "pass"
                if abs(edge) < 1e-9
                else "push"
                if abs(outcome) < 1e-9
                else "win"
                if edge * outcome > 0
                else "loss"
            )
        elif margin != 0:
            outcome = int(margin > 0)
            output.update(
                model_brier=(p["home_win_probability"] - outcome) ** 2,
                market_brier=(output["market_home_probability"] - outcome) ** 2,
            )
    return output


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else None


def metrics(rows):
    settled = [r for r in rows if r["status"] == "settled"]
    binary = [r for r in settled if r["actual_margin"] != 0]
    return {
        "games": len(settled),
        "binary_games": len(binary),
        "margin_mae": mean(abs(r["home_margin"] - r["actual_margin"]) for r in settled),
        "total_mae": mean(abs(r["total"] - r["actual_total"]) for r in settled),
        "winner_accuracy": mean(
            int((r["home_win_probability"] > 0.5) == (r["actual_margin"] > 0))
            for r in binary
            if r["home_win_probability"] != 0.5
        ),
        "winner_picks": sum(r["home_win_probability"] != 0.5 for r in binary),
        "brier": mean(
            (r["home_win_probability"] - int(r["actual_margin"] > 0)) ** 2
            for r in binary
        ),
        "log_loss": mean(
            -math.log(
                max(
                    1e-12,
                    min(
                        1 - 1e-12,
                        r["home_win_probability"]
                        if r["actual_margin"] > 0
                        else 1 - r["home_win_probability"],
                    ),
                )
            )
            for r in binary
        ),
        "interval_games": sum(
            r["margin_low"] is not None and r["margin_high"] is not None
            for r in settled
        ),
        "interval_coverage": mean(
            int(r["margin_low"] <= r["actual_margin"] <= r["margin_high"])
            for r in settled
            if r["margin_low"] is not None and r["margin_high"] is not None
        ),
    }


def build_report(conn, now):
    now = timestamp(now)
    predictions = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM audit_predictions WHERE registered_at<=? ORDER BY registered_at,generated_at,id",
            (now,),
        )
    ]
    latest = {}
    for row in conn.execute(
        "SELECT * FROM audit_game_states WHERE observed_at<=? ORDER BY observed_at,id",
        (now,),
    ):
        latest[(row["sport"], row["game_id"])] = json.loads(row["payload_json"])
    quotes = defaultdict(list)
    for row in conn.execute(
        "SELECT * FROM audit_markets ORDER BY captured_at,updated_at,id"
    ):
        q = dict(row)
        q["payload"] = json.loads(q.pop("payload_json"))
        quotes[(q["sport"], q["game_id"])].append(q)
    selected, excluded = {}, []
    for row in predictions:
        row["payload"] = json.loads(row.pop("payload_json"))
        key = (row["sport"], row["game_id"])
        reason = eligibility(row, latest.get(key))
        if reason:
            excluded.append((row, reason))
        elif key not in selected:
            selected[key] = row
    rows = []
    # Show one row per game; when none is eligible, show the first excluded registration.
    seen = set(selected)
    display = [(r, None) for r in selected.values()]
    for row, reason in excluded:
        key = (row["sport"], row["game_id"])
        if key not in seen:
            display.append((row, reason))
            seen.add(key)
    for row, reason in display:
        key = (row["sport"], row["game_id"])
        state = latest.get(key)
        payload = row["payload"]
        p = payload["prediction"]
        status = "excluded" if reason else final_status(state, now)
        item = {
            k: row[k]
            for k in (
                "id",
                "sport",
                "game_id",
                "model_id",
                "generated_at",
                "registered_at",
                "starts_at",
                "time_tbd",
            )
        }
        item.update({k: payload[k] for k in ("home_name", "away_name", "season")})
        item.update({k: p[k] for k in ("home_margin", "total", "home_win_probability")})
        item.update(
            status=status,
            exclusion=reason,
            margin_low=p.get("margin_low"),
            margin_high=p.get("margin_high"),
            actual_margin=None,
            actual_total=None,
            comparisons=[],
        )
        if status == "settled":
            item.update(
                actual_margin=state["home_score"] - state["away_score"],
                actual_total=state["home_score"] + state["away_score"],
            )
        if not reason:
            chosen = {}
            for quote in quotes[key]:
                if market_eligible(quote, row, state, now):
                    chosen[(quote["provider"], quote["bookmaker"], quote["market"])] = (
                        quote
                    )
            item["comparisons"] = [
                compare(row, q, {**state, "completed": status == "settled"})
                for q in chosen.values()
            ]
        rows.append(item)
    rows.sort(key=lambda r: (r["starts_at"], r["sport"], r["game_id"]))
    summaries = {}
    for sport in SPORTS:
        subset = [r for r in rows if r["sport"] == sport]
        grouped = defaultdict(list)
        for row in subset:
            if row["status"] == "settled":
                for q in row["comparisons"]:
                    grouped[(q["provider"], q["bookmaker"], q["market"])].append(q)
        market_metrics = []
        for (provider, book, market), qs in sorted(grouped.items()):
            market_metrics.append(
                {
                    "provider": provider,
                    "bookmaker": book,
                    "market": market,
                    "games": len(qs),
                    "model_mae": mean(
                        q["model_absolute_error"]
                        for q in qs
                        if "model_absolute_error" in q
                    ),
                    "market_mae": mean(
                        q["market_absolute_error"]
                        for q in qs
                        if "market_absolute_error" in q
                    ),
                    "model_brier": mean(
                        q["model_brier"] for q in qs if "model_brier" in q
                    ),
                    "market_brier": mean(
                        q["market_brier"] for q in qs if "market_brier" in q
                    ),
                    "direction_results": dict(
                        Counter(
                            q["direction_result"] for q in qs if "direction_result" in q
                        )
                    ),
                }
            )
        summaries[sport] = {
            "games": len(subset),
            "registered_versions": sum(r["sport"] == sport for r in predictions),
            "status_counts": dict(Counter(r["status"] for r in subset)),
            "exclusion_counts": dict(
                Counter(r["exclusion"] for r in subset if r["exclusion"])
            ),
            "metrics": metrics(subset),
            "market_metrics": market_metrics,
            "games_with_comparisons": sum(bool(r["comparisons"]) for r in subset),
        }
    receipts = [
        json.loads(r[0])
        for r in conn.execute(
            "SELECT payload_json FROM audit_receipts ORDER BY captured_at DESC LIMIT 10"
        )
    ]
    return {
        "generated_at": now,
        "policy": POLICY,
        "sports": summaries,
        "games": rows,
        "provider_receipts": receipts,
        "market_observations": conn.execute(
            "SELECT count(*) FROM audit_markets"
        ).fetchone()[0],
        "unmatched_events": conn.execute(
            "SELECT count(*) FROM audit_unmatched"
        ).fetchone()[0],
        "selection": "First eligible registration per game. Latest captured pregame quote per provider, bookmaker and market after registration; not a verified closing line.",
        "limitations": [
            "Registration times are local pipeline observations, not independently notarized publication times.",
            "Changed participants or start times, unconfirmed start times and late registrations are excluded.",
            "Quotes older than 24 hours when captured are excluded; last observed quotes may still be stale today.",
            "Settlements use latest source finals, including overtime; source corrections can revise reported scores.",
            "Source finals are not official bookmaker settlements. Direction results are hypothetical, without execution, odds or fees.",
        ],
    }


def export_sql(conn, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for line in conn.iterdump():
            if line.startswith('INSERT INTO "audit_'):
                f.write(line.replace("INSERT INTO", "INSERT OR IGNORE INTO", 1) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", type=Path)
    args = parser.parse_args()
    now = utcnow()
    conn = connect()
    ingest_published(conn, now)
    report = build_report(conn, now)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "ledger.json").write_text(encoded(report))
    if args.sql:
        export_sql(conn, args.sql)
    print(
        json.dumps(
            {
                "sports": report["sports"],
                "market_observations": report["market_observations"],
            },
            indent=2,
        )
    )
    conn.close()


if __name__ == "__main__":
    main()
