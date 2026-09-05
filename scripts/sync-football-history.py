"""Archive validated historical sources in R2, synchronize their D1 snapshots and verify every row."""

import fcntl
import hashlib
import json
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.football import DB_PATH
from ncaa_scraper.football_history import DATASET_NAMES, LOCAL, YEARS, write_source_sql
from ncaa_scraper.football_sources import CACHE, DATASETS

LOCAL.mkdir(parents=True, exist_ok=True)
lock = (LOCAL / "import.lock").open("w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
manifest = json.loads((LOCAL / "manifest.json").read_text())
for name, expected in manifest["implementation_sha256"].items():
    if (
        name
        not in (
            "football_history.py",
            "football_efficiency.py",
            "football.py",
            "football_sources.py",
        )
        or hashlib.sha256(
            (ROOT / "ncaa_scraper/ncaa_scraper" / name).read_bytes()
        ).hexdigest()
        != expected
    ):
        raise SystemExit("Implementation changed; rebuild historical release first")
for name, expected in manifest["efficiency"]["files"].items():
    if (
        ".." in Path(name).parts
        or Path(name).is_absolute()
        or hashlib.sha256(
            (ROOT / "frontend/public/data/football" / name).read_bytes()
        ).hexdigest()
        != expected
    ):
        raise SystemExit(
            "Efficiency artifact changed; rebuild historical release first"
        )
scopes = [(r["dataset"], r["season"]) for r in manifest["sources"]]
if len(scopes) != 6 or set(scopes) != {(ds, y) for ds in DATASET_NAMES for y in YEARS}:
    raise SystemExit("Unexpected historical import scope")
conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
columns = [r[1] for r in conn.execute("PRAGMA table_info(football_stats)")]
files = [(LOCAL / "manifest.json", "manifest.json")]
for source in manifest["sources"]:
    ds, year = source["dataset"], source["season"]
    path = LOCAL / f"{ds}-{year}.sql"
    if (
        source["sql"] != path.name
        or hashlib.sha256(path.read_bytes()).hexdigest() != source["sql_sha256"]
    ):
        raise SystemExit("Historical SQL content mismatch")
    check = LOCAL / "check.sql"
    write_source_sql(conn, check, ds, year)
    if check.read_bytes() != path.read_bytes():
        raise SystemExit("Local source rows changed; rebuild before syncing")
    check.unlink()
    receipt = source["receipt"]
    stored = conn.execute(
        "SELECT receipt_json FROM football_sources WHERE dataset=? AND season=?",
        (ds, year),
    ).fetchone()
    if not stored or json.loads(stored[0]) != receipt:
        raise SystemExit("Local source receipt changed")
    filename = DATASETS[ds][1].format(year=year)
    raw = CACHE / filename
    if hashlib.sha256(raw.read_bytes()).hexdigest() != receipt["sha256"]:
        raise SystemExit("Cached source no longer matches imported edition")
    files.extend([(raw, "sources/" + filename), (path, "sql/" + path.name)])
for name in manifest["implementation_sha256"]:
    files.append((ROOT / "ncaa_scraper/ncaa_scraper" / name, "implementation/" + name))


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


# Schedule joins must use the same published source editions on both sides.
for receipt in manifest["schedules"]:
    year = int(receipt["season"])
    rows = query(
        f"SELECT receipt_json FROM football_sources WHERE dataset='schedule' AND season={year}"
    )
    if (
        len(rows) != 1
        or json.loads(rows[0]["receipt_json"])["sha256"] != receipt["sha256"]
    ):
        raise SystemExit(
            "Remote schedule edition differs; synchronize the intended schedule first"
        )
archive = LOCAL / "sources.tar"
with tarfile.open(archive, "w") as bundle:
    for path, name in files:
        info = bundle.gettarinfo(str(path), arcname=name)
        info.mtime = info.uid = info.gid = 0
        info.uname = info.gname = ""
        with path.open("rb") as stream:
            bundle.addfile(info, stream)
sha = hashlib.sha256(archive.read_bytes()).hexdigest()
key = f"bball-research/football/history/{sha}.tar"
checkpoint = LOCAL / "archive.json"
previous = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
if previous.get("sha256") != sha:
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
if hashlib.sha256(verified.read_bytes()).hexdigest() != sha:
    raise SystemExit("Historical R2 round-trip mismatch")
verified.unlink()
checkpoint.write_text(json.dumps({"key": key, "sha256": sha}, indent=2))
print("Historical source archive verified in R2", flush=True)
for source in manifest["sources"]:
    ds, year = source["dataset"], source["season"]
    sql = f"SELECT {','.join(columns)} FROM football_stats WHERE dataset='{ds}' AND season={year} ORDER BY record_key"
    expected = [tuple(r) for r in conn.execute(sql)]
    existing = query(sql)
    if [tuple(r[k] for k in columns) for r in existing] != expected:
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
    else:
        receipts = query(
            f"SELECT receipt_json FROM football_sources WHERE dataset='{ds}' AND season={year}"
        )
        if (
            len(receipts) != 1
            or json.loads(receipts[0]["receipt_json"]) != source["receipt"]
        ):
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
    actual = query(sql)
    if [tuple(r[k] for k in columns) for r in actual] != expected:
        raise SystemExit(f"Remote historical rows differ: {ds}/{year}")
    receipts = query(
        f"SELECT receipt_json FROM football_sources WHERE dataset='{ds}' AND season={year}"
    )
    if (
        len(receipts) != 1
        or json.loads(receipts[0]["receipt_json"]) != source["receipt"]
    ):
        raise SystemExit("Remote historical receipt differs")
    print(
        f"Verified D1 {ds}/{year}: {len(actual)} complete rows and source receipt",
        flush=True,
    )
conn.close()
