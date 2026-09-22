"""Validate and sync the cached NCAA national-stat derivative to D1."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/data/basketball/ncaa-individual.json"
RECEIPT = ROOT / ".local/basketball/ncaa-individual-2026.json.receipt.json"
SQL = ROOT / ".local/ncaa-individual.sql"


def quote(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def load_release(public_path: Path = PUBLIC) -> dict[str, Any]:
    release = json.loads(public_path.read_text())
    if release.get("schema_version") not in (1, 2) or release.get("season") != 2026:
        raise ValueError("Unsupported NCAA individual release")
    players = release.get("players")
    if not isinstance(players, list) or not players:
        raise ValueError("NCAA individual release has no players")
    return release


def load_receipt(
    release: dict[str, Any],
    public_path: Path = PUBLIC,
    receipt_path: Path = RECEIPT,
) -> dict[str, Any]:
    """Load the exact archived receipt; never synthesize a source locator."""

    receipt = json.loads(receipt_path.read_text())
    season = release.get("season")
    digest = hashlib.sha256(public_path.read_bytes()).hexdigest()
    fetched_at = receipt.get("fetched_at")
    url = receipt.get("url")
    if (
        receipt.get("dataset") != "ncaa_individual"
        or receipt.get("season") != season
        or receipt.get("sha256") != digest
        or not isinstance(url, str)
        or not re.match(r"^https?://", url)
        or not isinstance(fetched_at, str)
    ):
        raise ValueError("NCAA individual receipt does not match the published release")
    try:
        captured = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("NCAA individual receipt has an invalid source timestamp") from exc
    if captured.tzinfo is None:
        raise ValueError("NCAA individual receipt source timestamp has no timezone")
    return receipt


def build_sql(release: dict[str, Any], receipt: dict[str, Any]) -> str:
    players = release["players"]
    season = int(release["season"])
    lines = [
        "CREATE TABLE IF NOT EXISTS ncaa_individual_players (season INTEGER NOT NULL, division INTEGER NOT NULL CHECK(division IN (1,2,3)), player_id TEXT NOT NULL, name TEXT NOT NULL, team_name TEXT, ppg REAL, rpg REAL, apg REAL, mpg REAL, ppg_rank INTEGER, payload_json TEXT NOT NULL, PRIMARY KEY(season, division, player_id));",
        "CREATE INDEX IF NOT EXISTS ncaa_individual_division_rank ON ncaa_individual_players(season, division, ppg_rank);",
        "CREATE TABLE IF NOT EXISTS bb_sources (dataset TEXT, season INTEGER, receipt_json TEXT NOT NULL, PRIMARY KEY(dataset,season));",
        f"DELETE FROM ncaa_individual_players WHERE season={season};",
    ]
    for player in players:
        payload = json.dumps(player, ensure_ascii=False, separators=(",", ":"))
        values = [season, player["division"], player["player_id"], player["name"], player.get("team_name"), player.get("ppg"), player.get("rpg"), player.get("apg"), player.get("mpg"), player.get("ppg_rank"), payload]
        lines.append("INSERT OR REPLACE INTO ncaa_individual_players (season,division,player_id,name,team_name,ppg,rpg,apg,mpg,ppg_rank,payload_json) VALUES (" + ",".join(map(quote, values)) + ");")
    receipt_json = json.dumps(receipt, ensure_ascii=False, separators=(",", ":"))
    lines.append(
        "INSERT OR REPLACE INTO bb_sources(dataset,season,receipt_json) VALUES ("
        + ",".join(map(quote, ["ncaa_individual", season, receipt_json]))
        + ");"
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    try:
        release = load_release()
        receipt = load_receipt(release)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    SQL.parent.mkdir(parents=True, exist_ok=True)
    SQL.write_text(build_sql(release, receipt))

    for path in [ROOT / "worker/migrations/0016_ncaa_individual.sql", SQL]:
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts/cloudflare.py"),
                "d1",
                "execute",
                D1_DB_NAME,
                "--remote",
                "--file",
                str(path),
            ],
            check=True,
            cwd=ROOT,
        )
    print(f"Synced {len(release['players']):,} NCAA individual records and exact source receipt")


if __name__ == "__main__":
    main()
