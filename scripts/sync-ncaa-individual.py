"""Validate and sync the cached NCAA national-stat derivative to D1."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/data/basketball/ncaa-individual.json"
SQL = ROOT / ".local/ncaa-individual.sql"

release = json.loads(PUBLIC.read_text())
if release.get("schema_version") not in (1, 2) or release.get("season") != 2026:
    raise SystemExit("Unsupported NCAA individual release")
players = release.get("players")
if not isinstance(players, list) or not players:
    raise SystemExit("NCAA individual release has no players")
def quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"

lines = [
    "CREATE TABLE IF NOT EXISTS ncaa_individual_players (season INTEGER NOT NULL, division INTEGER NOT NULL CHECK(division IN (1,2,3)), player_id TEXT NOT NULL, name TEXT NOT NULL, team_name TEXT, ppg REAL, rpg REAL, apg REAL, mpg REAL, ppg_rank INTEGER, payload_json TEXT NOT NULL, PRIMARY KEY(season, division, player_id));",
    "CREATE INDEX IF NOT EXISTS ncaa_individual_division_rank ON ncaa_individual_players(season, division, ppg_rank);",
    "DELETE FROM ncaa_individual_players WHERE season=2026;",
]
for player in players:
    payload = json.dumps(player, ensure_ascii=False, separators=(",", ":"))
    values = [2026, player["division"], player["player_id"], player["name"], player.get("team_name"), player.get("ppg"), player.get("rpg"), player.get("apg"), player.get("mpg"), player.get("ppg_rank"), payload]
    lines.append("INSERT OR REPLACE INTO ncaa_individual_players (season,division,player_id,name,team_name,ppg,rpg,apg,mpg,ppg_rank,payload_json) VALUES (" + ",".join(map(quote, values)) + ");")
SQL.parent.mkdir(parents=True, exist_ok=True)
SQL.write_text("\n".join(lines) + "\n")

for path in [ROOT / "worker/migrations/0016_ncaa_individual.sql", SQL]:
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/cloudflare.py"),
            "d1",
            "execute",
            "bball-silvermine",
            "--remote",
            "--file",
            str(path),
        ],
        check=True,
        cwd=ROOT,
    )
print(f"Synced {len(players):,} NCAA individual records")
