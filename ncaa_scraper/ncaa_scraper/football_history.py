"""Import historical team directories and advanced games without rebuilding forecasts."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import sqlite3
from pathlib import Path

from .football import DB_PATH, store_rows
from .football_efficiency import METRICS, build, encoded, export, season_release
from .football_sources import CACHE, DATASETS, RELEASES, ROOT, ReleaseClient

YEARS = (2022, 2023, 2024)
DATASET_NAMES = ("teams", "team_advanced")
LOCAL = ROOT / ".local/football-history"


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def validate_download(dataset, year, rows, receipt, cache=CACHE):
    tag, pattern = DATASETS[dataset]
    filename = pattern.format(year=year)
    payload = (cache / filename).read_bytes()
    if (
        receipt["dataset"] != dataset
        or receipt["season"] != year
        or receipt["url"] != f"{RELEASES}/{tag}/{filename}"
        or hashlib.sha256(payload).hexdigest() != receipt["sha256"]
    ):
        raise ValueError("Source receipt or cached content mismatch")
    if not rows or any(r.get("season") != str(year) for r in rows):
        raise ValueError("Empty or mixed-season historical source")
    if dataset == "teams":
        ids = [r.get("team_id") for r in rows]
        if any(not i for i in ids) or len(ids) != len(set(ids)):
            raise ValueError("Missing or duplicate directory identity")
    else:
        required = {"game_id", "pos_team_id", "season"}
        required.update(m[2] for m in METRICS)
        required.update(m[3] for m in METRICS)
        if not required.issubset(rows[0]):
            raise ValueError("Historical advanced source lacks required fields")
    return filename


def write_source_sql(conn, path, dataset, year):
    if dataset not in DATASET_NAMES or year not in YEARS:
        raise ValueError("Outside historical team import scope")
    # Only these dataset/year snapshots are replaced. No schedule or model writes.
    statements = [
        f"DELETE FROM football_stats WHERE dataset={sql_value(dataset)} AND season={year};"
    ]
    for row in conn.execute(
        "SELECT * FROM football_stats WHERE dataset=? AND season=? ORDER BY record_key",
        (dataset, year),
    ):
        statements.append(
            "INSERT INTO football_stats VALUES (" + ",".join(map(sql_value, row)) + ");"
        )
    source = conn.execute(
        "SELECT * FROM football_sources WHERE dataset=? AND season=?", (dataset, year)
    ).fetchone()
    statements.append(
        "INSERT OR REPLACE INTO football_sources VALUES ("
        + ",".join(map(sql_value, source))
        + ");"
    )
    path.write_text("\n".join(statements) + "\n")


def import_history(conn, downloads, out, local):
    expected = {(ds, y) for y in YEARS for ds in DATASET_NAMES}
    if {(ds, y) for ds, y, _, _ in downloads} != expected or len(downloads) != len(
        expected
    ):
        raise ValueError(
            "Historical release requires exactly six dataset/season inputs"
        )
    games = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM football_games")}
    schedules = []
    for year in YEARS:
        source = conn.execute(
            "SELECT receipt_json FROM football_sources WHERE dataset='schedule' AND season=?",
            (year,),
        ).fetchone()
        if not source:
            raise ValueError(
                "Import the dated schedule before historical advanced rows"
            )
        schedules.append(json.loads(source[0]))
        directory = next(
            rows for ds, y, rows, _ in downloads if ds == "teams" and y == year
        )
        rows = next(
            rows for ds, y, rows, _ in downloads if ds == "team_advanced" and y == year
        )
        # Validate every game/team/season join before any mutation.
        season_release(rows, games, {r["team_id"]: r for r in directory}, year)
    # Use a staging copy because store_rows owns its transaction. A bad build
    # cannot leave a partially activated historical source in the main warehouse.
    staged = sqlite3.connect(":memory:")
    staged.row_factory = sqlite3.Row
    conn.backup(staged)
    for dataset, year, rows, receipt in downloads:
        store_rows(staged, dataset, year, rows, receipt)
    files = build(staged)
    local.mkdir(parents=True, exist_ok=True)
    sources = []
    for dataset, year, rows, receipt in downloads:
        name = f"{dataset}-{year}.sql"
        write_source_sql(staged, local / name, dataset, year)
        sources.append(
            {
                "dataset": dataset,
                "season": year,
                "records": len(rows),
                "receipt": receipt,
                "sql": name,
                "sql_sha256": hashlib.sha256((local / name).read_bytes()).hexdigest(),
            }
        )
    # Atomic local activation of only the six reviewed source snapshots.
    with conn:
        for dataset, year, _, receipt in downloads:
            conn.execute(
                "DELETE FROM football_stats WHERE dataset=? AND season=?",
                (dataset, year),
            )
            conn.executemany(
                "INSERT INTO football_stats VALUES (?,?,?,?,?,?,?,?)",
                [
                    tuple(r)
                    for r in staged.execute(
                        "SELECT * FROM football_stats WHERE dataset=? AND season=?",
                        (dataset, year),
                    )
                ],
            )
            conn.execute(
                "INSERT OR REPLACE INTO football_sources VALUES (?,?,?)",
                (dataset, year, json.dumps(receipt)),
            )
    staged.close()
    manifest = export(files, out)
    record = {
        "sources": sources,
        "schedules": schedules,
        "efficiency": manifest,
        "implementation_sha256": {
            name: hashlib.sha256(
                Path(__file__).with_name(name).read_bytes()
            ).hexdigest()
            for name in (
                "football_history.py",
                "football_efficiency.py",
                "football.py",
                "football_sources.py",
            )
        },
    }
    (local / "manifest.json").write_text(encoded(record) + "\n")
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    LOCAL.mkdir(parents=True, exist_ok=True)
    with (LOCAL / "import.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        client = ReleaseClient()
        downloads = []
        for year in YEARS:
            for dataset in DATASET_NAMES:
                rows, receipt = client.load(dataset, year, refresh=args.refresh)
                validate_download(dataset, year, rows, receipt)
                downloads.append((dataset, year, rows, receipt))
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            record = import_history(
                conn, downloads, ROOT / "frontend/public/data/football", LOCAL
            )
        print(
            json.dumps(
                {
                    "edition": record["efficiency"]["edition"],
                    "sources": [
                        {k: r[k] for k in ("dataset", "season", "records")}
                        for r in record["sources"]
                    ],
                }
            )
        )


if __name__ == "__main__":
    main()
