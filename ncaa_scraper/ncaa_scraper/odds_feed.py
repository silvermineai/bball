"""Opt-in The Odds API v4 collection for the research ledger.

Reads THE_ODDS_API_KEY or ODDS_API_KEY from environment / ~/.env.
One region, three standard markets, at most one call per selected sport.
No key, raw response body or authenticated URL is logged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import dotenv_values

from .football_sources import ROOT, utcnow
from .research_ledger import connect, digest, encoded, finite, timestamp

PROVIDER = "The Odds API"
SPORT_KEYS = {"football": "americanfootball_ncaaf", "basketball": "basketball_ncaab"}
TERMS = "https://the-odds-api.com/terms-and-conditions.html"
CACHE = ROOT / ".local/odds"


def normalize_name(value):
    value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    )
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def schedules(sport):
    conn = sqlite3.connect(f"file:{ROOT}/.local/{sport}.sqlite3?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    aliases = {}
    if sport == "football":
        rows = conn.execute(
            "SELECT team_id,stats_json FROM football_stats WHERE dataset='teams'"
        )
        for row in rows:
            p = json.loads(row["stats_json"])
            aliases.setdefault(row["team_id"], set()).update(
                p[k] for k in ("display_name", "short_display_name") if p.get(k)
            )
        games = [
            dict(r)
            for r in conn.execute("SELECT *,kickoff AS starts_at FROM football_games")
        ]
    else:
        for row in conn.execute("SELECT team_id,profile_json FROM bb_rosters"):
            p = json.loads(row["profile_json"])
            if p.get("team_display_name"):
                aliases.setdefault(row["team_id"], set()).add(p["team_display_name"])
        games = [dict(r) for r in conn.execute("SELECT * FROM bb_games")]
    conn.close()
    for g in games:
        g["starts_at"] = timestamp(g["starts_at"])
        for side in ("home", "away"):
            g[side + "_aliases"] = {
                normalize_name(n)
                for n in aliases.get(g[side + "_id"], set()) | {g[side + "_name"]}
                if n
            }
    return games


def match_event(event, games):
    start = timestamp(event["commence_time"])
    home, away = normalize_name(event["home_team"]), normalize_name(event["away_team"])
    candidates = [
        g
        for g in games
        if not g["completed"]
        and not g["time_tbd"]
        and g["starts_at"] == start
        and home in g["home_aliases"]
        and away in g["away_aliases"]
    ]
    if len(candidates) != 1:
        raise ValueError("No unique exact participant/start-time match")
    return candidates[0]


def normalize_market(event, book, market, game, captured_at, receipt_id):
    kind = market["key"]
    if kind not in ("spreads", "totals", "h2h"):
        raise ValueError("Unsupported market")
    if not isinstance(book.get("key"), str) or not 1 <= len(book["key"]) <= 100:
        raise ValueError("Missing bookmaker identity")
    updated = timestamp(market.get("last_update") or book["last_update"])
    captured = timestamp(captured_at)
    if updated > captured:
        raise ValueError("Provider update is after capture")
    outcomes = market["outcomes"]
    if len(outcomes) != 2 or len({o["name"] for o in outcomes}) != 2:
        raise ValueError("Expected two distinct outcomes")
    by_name = {o["name"]: o for o in outcomes}
    names = (
        ("Over", "Under")
        if kind == "totals"
        else (event["home_team"], event["away_team"])
    )
    try:
        first, second = (by_name[n] for n in names)
    except KeyError:
        raise ValueError("Outcome labels do not match participants") from None
    if any(not finite(o.get("price")) or o["price"] <= 1 for o in (first, second)):
        raise ValueError("Invalid decimal price")
    line = None
    if kind != "h2h":
        if not finite(first.get("point")) or not finite(second.get("point")):
            raise ValueError("Missing line")
        line = first["point"]
        if kind == "spreads" and abs(line + second["point"]) > 1e-9:
            raise ValueError("Spread sides do not sum to zero")
        if kind == "totals" and (line < 0 or line != second["point"]):
            raise ValueError("Total sides do not agree")
    payload = {
        "home_id": game["home_id"],
        "away_id": game["away_id"],
        "starts_at": timestamp(event["commence_time"]),
        "event_id": event["id"],
        "line": line,
        "receipt_id": receipt_id,
    }
    labels = (
        ("over_price", "under_price")
        if kind == "totals"
        else ("home_price", "away_price")
    )
    payload.update({labels[0]: first["price"], labels[1]: second["price"]})
    return updated, payload


def ingest(conn, sport, events, receipt, games):
    captured = timestamp(receipt["captured_at"])
    receipt_id = digest(receipt)
    conn.execute(
        "INSERT OR IGNORE INTO audit_receipts VALUES (?,?,?,?)",
        (receipt_id, captured, PROVIDER, encoded(receipt)),
    )
    accepted, rejected = 0, 0
    for event in events:
        try:
            if not isinstance(event.get("id"), str) or not 1 <= len(event["id"]) <= 150:
                raise ValueError("Invalid provider event identity")
            if event.get("sport_key") != SPORT_KEYS[sport]:
                raise ValueError("Unexpected sport key")
            game = match_event(event, games)
            if timestamp(event["commence_time"]) <= captured:
                raise ValueError("Event already started at capture")
            for book in event.get("bookmakers", []):
                for market in book.get("markets", []):
                    try:
                        updated, payload = normalize_market(
                            event, book, market, game, captured, receipt_id
                        )
                        key = digest(
                            [
                                sport,
                                game["id"],
                                PROVIDER,
                                book["key"],
                                market["key"],
                                captured,
                                payload,
                            ]
                        )
                        conn.execute(
                            "INSERT OR IGNORE INTO audit_markets VALUES (?,?,?,?,?,?,?,?,?)",
                            (
                                key,
                                sport,
                                game["id"],
                                PROVIDER,
                                book["key"],
                                market["key"],
                                captured,
                                updated,
                                encoded(payload),
                            ),
                        )
                        accepted += 1
                    except (KeyError, TypeError, ValueError) as error:
                        reject(
                            conn,
                            sport,
                            event,
                            captured,
                            f"Invalid market: {type(error).__name__}",
                            {"bookmaker": book.get("key"), "market": market.get("key")},
                        )
                        rejected += 1
        except (KeyError, TypeError, ValueError) as error:
            reject(
                conn,
                sport,
                event,
                captured,
                str(error) if isinstance(error, ValueError) else "Malformed event",
            )
            rejected += 1
    conn.commit()
    return {"accepted_markets": accepted, "rejected_records": rejected}


def reject(conn, sport, event, captured, reason, detail=None):
    # Full responses remain in the private source cache. An unmatched event can
    # contain hundreds of bookmaker outcomes, so keep its D1 review row bounded.
    payload = {
        "event": {
            k: str(event.get(k, ""))[:240]
            for k in ("id", "sport_key", "home_team", "away_team", "commence_time")
        },
        "event_sha256": digest(event),
        "detail": {k: str(v)[:240] for k, v in (detail or {}).items()},
    }
    conn.execute(
        "INSERT OR IGNORE INTO audit_unmatched VALUES (?,?,?,?,?,?)",
        (
            digest([sport, captured, payload, reason]),
            sport,
            str(event.get("id", "unknown"))[:150],
            captured,
            reason,
            encoded(payload),
        ),
    )


def fetch(sport, api_key, days=7):
    url = f"https://api.the-odds-api.com/v4/sports/{SPORT_KEYS[sport]}/odds/"
    until = datetime.now(timezone.utc) + timedelta(days=days)
    params = {
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
        "commenceTimeTo": until.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        with requests.get(
            url,
            params={**params, "apiKey": api_key},
            headers={"User-Agent": "SilvermineResearch/1.0 (bball.silvermine.dev)"},
            timeout=(10, 30),
            stream=True,
            allow_redirects=False,
        ) as response:
            if response.status_code != 200:
                # Error URLs and provider bodies can contain credentials; never forward them.
                raise RuntimeError(
                    f"Odds provider returned HTTP {response.status_code}; no retry performed"
                )
            chunks = []
            size = 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > 10_000_000:
                    raise RuntimeError("Odds response exceeds the 10 MB bound")
                chunks.append(chunk)
            raw = b"".join(chunks)
            captured = timestamp(utcnow())
            receipt = {
                "provider": PROVIDER,
                "sport": sport,
                "captured_at": captured,
                "url": url,
                "parameters": params,
                "license_url": TERMS,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "quota": {
                    k: response.headers.get("x-requests-" + k)
                    for k in ("remaining", "used", "last")
                },
            }
    except requests.RequestException:
        raise RuntimeError(
            "Odds provider request failed; no retry performed and no authenticated URL logged"
        ) from None
    try:
        events = json.loads(raw)
    except ValueError:
        raise RuntimeError("Odds provider returned invalid JSON") from None
    if not isinstance(events, list) or not all(isinstance(e, dict) for e in events):
        raise RuntimeError("Unexpected odds response shape")
    CACHE.mkdir(parents=True, exist_ok=True)
    name = f"{sport}-{digest(receipt)}"
    (CACHE / (name + ".json")).write_bytes(raw)
    (CACHE / (name + ".receipt.json")).write_text(encoded(receipt))
    return events, receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sport", choices=[*SPORT_KEYS, "both"], default="football")
    parser.add_argument("--days", type=int, choices=range(1, 15), default=7)
    args = parser.parse_args()
    values = dotenv_values(Path.home() / ".env")
    key = (
        os.environ.get("THE_ODDS_API_KEY")
        or os.environ.get("ODDS_API_KEY")
        or values.get("THE_ODDS_API_KEY")
        or values.get("ODDS_API_KEY")
    )
    if not key:
        raise SystemExit(
            "No odds credential configured. Add THE_ODDS_API_KEY to ~/.env; no provider call was made."
        )
    conn = connect()
    for sport in SPORT_KEYS if args.sport == "both" else [args.sport]:
        games = schedules(sport)
        now = timestamp(utcnow())
        end = timestamp(
            (datetime.now(timezone.utc) + timedelta(days=args.days)).isoformat()
        )
        if not any(
            not g["completed"] and not g["time_tbd"] and now < g["starts_at"] <= end
            for g in games
        ):
            print(
                f"{sport}: no confirmed scheduled games in the requested window; no provider call"
            )
            continue
        events, receipt = fetch(sport, key, args.days)
        print(sport, ingest(conn, sport, events, receipt, games))
        remaining = receipt["quota"]["remaining"]
        if remaining is not None and float(remaining) < 3:
            print(
                "Stopping before another call: insufficient remaining quota for three markets"
            )
            break
        time.sleep(1)
    conn.close()


if __name__ == "__main__":
    main()
