"""Archive historical NCAA lineup sources and import their aggregates into D1."""

import hashlib
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local/basketball"
OUT = ROOT / ".local/lineups-sql"
DB = ROOT / ".local/basketball.sqlite3"
SEASONS = tuple(range(2019, 2025))
MAX_BATCH_BYTES = 7_500_000


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def export() -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("lineups-*.sql"):
        old.unlink()
    conn = sqlite3.connect(DB)
    files: list[dict] = []
    totals: dict[str, int] = {}
    for season in SEASONS:
        rows = conn.execute(
            "SELECT season,lineup_key,team_name,players_json,stats_json "
            "FROM bb_lineups WHERE season=? ORDER BY lineup_key",
            (season,),
        )
        statements: list[str] = [f"DELETE FROM bb_lineups WHERE season={season};\n"]
        size = len(statements[0].encode())
        part = 0
        count = 0
        for row in rows:
            statement = (
                "INSERT OR REPLACE INTO bb_lineups "
                "(season,lineup_key,team_name,players_json,stats_json) VALUES ("
                f"{row[0]},{sql_text(row[1])},{sql_text(row[2])},"
                f"{sql_text(row[3])},{sql_text(row[4])});\n"
            )
            encoded = len(statement.encode())
            if encoded >= 100_000:
                raise ValueError(f"lineup statement too large for {season}")
            if size + encoded > MAX_BATCH_BYTES and len(statements) > 1:
                target = OUT / f"lineups-{season}-{part:03d}.sql"
                target.write_text("".join(statements))
                files.append({"name": target.name, "season": season, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
                part += 1
                statements = []
                size = 0
            statements.append(statement)
            size += encoded
            count += 1
        if statements:
            target = OUT / f"lineups-{season}-{part:03d}.sql"
            target.write_text("".join(statements))
            files.append({"name": target.name, "season": season, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
        totals[str(season)] = count
    conn.close()
    manifest = {"seasons": list(SEASONS), "totals": totals, "files": files}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def run(args: list[str]) -> None:
    subprocess.run([sys.executable, "scripts/cloudflare.py", *args], cwd=ROOT, check=True)


def main() -> None:
    manifest = export()
    files = manifest["files"]
    for season in SEASONS:
        source = LOCAL / f"ncaa_mbb_lineups_{season}.parquet"
        receipt_path = source.with_name(source.name + ".receipt.json")
        receipt = json.loads(receipt_path.read_text())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if receipt.get("sha256") != digest:
            raise SystemExit(f"Source receipt mismatch for lineup season {season}")
        key = f"bball-research/basketball/lineups/{season}/{digest}"
        run(["r2", "object", "put", key + ".parquet", "--file", str(source), "--content-type", "application/vnd.apache.parquet", "--remote"])
        run(["r2", "object", "put", key + ".receipt.json", "--file", str(receipt_path), "--content-type", "application/json", "--remote"])
        print(f"Archived lineup source {season} in R2", flush=True)
    for season in SEASONS:
        season_files = [f for f in files if f["season"] == season]
        for index, item in enumerate(season_files, 1):
            path = OUT / item["name"]
            if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
                raise SystemExit(f"SQL batch changed: {path.name}")
            run(["d1", "execute", "bball-silvermine", "--remote", "--yes", "--file", str(path)])
            print(f"Imported lineup season {season} batch {index}/{len(season_files)}", flush=True)
    print("Historical lineup archive synced", flush=True)


if __name__ == "__main__":
    main()
