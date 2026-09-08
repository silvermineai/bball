"""Archive historical player inputs in R2, import D1 scopes and verify every row."""

import concurrent.futures
import fcntl
import json
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.football import DB_PATH
from ncaa_scraper.football_artifacts import manifest_statements, quote
from ncaa_scraper.football_player_history import (
    IMPLEMENTATIONS,
    KINDS,
    LOCAL,
    OUT,
    YEARS,
    sha,
    write_sql,
)
from ncaa_scraper.football_sources import CACHE, DATASETS, utcnow

LOCAL.mkdir(parents=True, exist_ok=True)
lock = (LOCAL / "import.lock").open("w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
manifest = json.loads((LOCAL / "manifest.json").read_text())
if set(manifest["implementation_sha256"]) != set(IMPLEMENTATIONS):
    raise SystemExit("Unexpected implementation manifest")
for name, value in manifest["implementation_sha256"].items():
    if sha(ROOT / "ncaa_scraper/ncaa_scraper" / name) != value:
        raise SystemExit("Implementation changed; rebuild history first")
for name, value in manifest["files"].items():
    if Path(name).name != name or sha(OUT / name) != value:
        raise SystemExit("Player catalog or index changed")
if len(manifest["sources"]) != len(KINDS) * len(YEARS) or {
    (s["dataset"], s["season"]) for s in manifest["sources"]
} != {(ds, y) for ds in KINDS for y in YEARS}:
    raise SystemExit("Unexpected historical player import scopes")
conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
columns = [r[1] for r in conn.execute("PRAGMA table_info(football_stats)")]
files = [(LOCAL / "manifest.json", "manifest.json")]
for source in manifest["sources"]:
    ds, year = source["dataset"], source["season"]
    path = LOCAL / f"{ds}-{year}.sql"
    if source["sql"] != path.name or sha(path) != source["sql_sha256"]:
        raise SystemExit("Source SQL mismatch")
    check = LOCAL / "check.sql"
    write_sql(conn, check, ds, year)
    if sha(check) != source["sql_sha256"]:
        raise SystemExit("Local warehouse changed; rebuild before syncing")
    check.unlink()
    receipt = json.loads(
        conn.execute(
            "SELECT receipt_json FROM football_sources WHERE dataset=? AND season=?",
            (ds, year),
        ).fetchone()[0]
    )
    if receipt != source["receipt"]:
        raise SystemExit("Stored source receipt changed")
    raw = CACHE / DATASETS[ds][1].format(year=year)
    if sha(raw) != receipt["sha256"]:
        raise SystemExit("Raw source cache mismatch")
    files.extend([(raw, "sources/" + raw.name), (path, "sql/" + path.name)])
for receipt in manifest["dependencies"]:
    raw = CACHE / DATASETS[receipt["dataset"]][1].format(year=receipt["season"])
    if sha(raw) != receipt["sha256"]:
        raise SystemExit("Dependency cache mismatch")
    files.append((raw, "dependencies/" + raw.name))
for name in IMPLEMENTATIONS:
    files.append((ROOT / "ncaa_scraper/ncaa_scraper" / name, "implementation/" + name))
for name in manifest["files"]:
    files.append((OUT / name, "public/" + name))


def run(args):
    return subprocess.check_output(
        [sys.executable, str(ROOT / "scripts/cloudflare.py"), *args],
        cwd=ROOT,
        text=True,
    )


def query(sql):
    return json.loads(
        run(
            [
                "d1",
                "execute",
                "bball-silvermine",
                "--remote",
                "--json",
                "--command",
                sql,
            ]
        )
    )[0]["results"]


for receipt in manifest["dependencies"]:
    actual = query(
        f"SELECT receipt_json FROM football_sources WHERE dataset='{receipt['dataset']}' AND season={int(receipt['season'])}"
    )
    if (
        len(actual) != 1
        or json.loads(actual[0]["receipt_json"])["sha256"] != receipt["sha256"]
    ):
        raise SystemExit(
            "Remote schedule/directory source differs; sync dependencies first"
        )
archive = LOCAL / "sources.tar"
with tarfile.open(archive, "w") as tar:
    for path, name in files:
        info = tar.gettarinfo(str(path), arcname=name)
        info.mtime = info.uid = info.gid = 0
        info.uname = info.gname = ""
        with path.open("rb") as stream:
            tar.addfile(info, stream)
digest = sha(archive)
key = f"bball-research/football/player-history/{digest}.tar"
checkpoint = LOCAL / "archive.json"
previous = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
if previous.get("sha256") != digest:
    run(
        [
            "r2",
            "object",
            "put",
            key,
            "--file",
            str(archive),
            "--content-type",
            "application/x-tar",
            "--remote",
        ]
    )
verified = LOCAL / "verified.tar"
run(["r2", "object", "get", key, "--file", str(verified), "--remote"])
if sha(verified) != digest:
    raise SystemExit("R2 round-trip mismatch")
verified.unlink()
checkpoint.write_text(
    json.dumps(
        {"key": key, "sha256": digest, "catalog_edition": manifest["catalog_edition"]},
        indent=2,
    )
)
print("Historical player source archive verified in private R2", flush=True)


def fetch_pages(sql, size):
    # Bound response size and allow only independent read queries to overlap.
    offsets = range(0, size, 3000)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(
            pool.map(
                lambda offset: query(sql + f" LIMIT 3000 OFFSET {offset}"), offsets
            )
        )
    return [r for page in pages for r in page]


for source in manifest["sources"]:
    ds, year = source["dataset"], source["season"]
    where = f"dataset='{ds}' AND season={year}"
    sql = f"SELECT {','.join(columns)} FROM football_stats WHERE {where} ORDER BY record_key"
    expected = [tuple(r) for r in conn.execute(sql)]
    count = query(f"SELECT count(*) AS n FROM football_stats WHERE {where}")[0]["n"]
    receipts = query(f"SELECT receipt_json FROM football_sources WHERE {where}")
    same_receipt = (
        len(receipts) == 1
        and json.loads(receipts[0]["receipt_json"]) == source["receipt"]
    )
    actual = fetch_pages(sql, count) if count == len(expected) and same_receipt else []
    if [tuple(r[k] for k in columns) for r in actual] != expected:
        run(
            [
                "d1",
                "execute",
                "bball-silvermine",
                "--remote",
                "--file",
                str(LOCAL / source["sql"]),
            ]
        )
        actual = fetch_pages(sql, len(expected))
    count = query(f"SELECT count(*) AS n FROM football_stats WHERE {where}")[0]["n"]
    if (
        count != len(expected)
        or [tuple(r[k] for k in columns) for r in actual] != expected
    ):
        raise SystemExit(f"Remote source row mismatch: {ds}/{year}")
    receipts = query(f"SELECT receipt_json FROM football_sources WHERE {where}")
    if (
        len(receipts) != 1
        or json.loads(receipts[0]["receipt_json"]) != source["receipt"]
    ):
        raise SystemExit("Remote source receipt mismatch")
    print(f"Verified D1 {ds}/{year}: {count:,} complete raw rows", flush=True)
conn.close()

# Register this independent player release after its source rows are verified.
stage, statements, activate, cleanup = manifest_statements(
    "football-player-history", utcnow(), json.dumps(manifest, sort_keys=True)
)
for statement in statements:
    query(statement)
if (
    json.loads(
        query("SELECT payload_json FROM football_artifacts WHERE name=" + quote(stage))[
            0
        ]["payload_json"]
    )
    != manifest
):
    raise SystemExit("Staged player manifest mismatch")
query(activate)
if (
    json.loads(
        query(
            "SELECT payload_json FROM football_artifacts WHERE name='football-player-history'"
        )[0]["payload_json"]
    )
    != manifest
):
    raise SystemExit("Active player manifest mismatch")
query(cleanup)
print("Registered verified historical player release in D1", flush=True)
