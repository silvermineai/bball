"""Compare active event editions and every published event row against Cloudflare D1."""

import concurrent.futures
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
conn = sqlite3.connect(
    f"file:{ROOT / '.local/football-events.sqlite3'}?mode=ro", uri=True
)
conn.row_factory = sqlite3.Row
index = json.loads((ROOT / "frontend/public/data/football/events.json").read_text())


def query(sql):
    output = subprocess.check_output(
        [
            sys.executable,
            str(ROOT / "scripts/cloudflare.py"),
            "d1",
            "execute",
            "bball-silvermine",
            "--remote",
            "--json",
            "--command",
            sql,
        ],
        cwd=ROOT,
        text=True,
    )
    return json.loads(output)[0]["results"]


active = query("SELECT * FROM football_event_active ORDER BY season,dataset")
if active != [
    dict(r)
    for r in conn.execute("SELECT * FROM football_event_active ORDER BY season,dataset")
]:
    raise SystemExit("Remote event active editions differ")
checked = 0
for entry in index["editions"]:
    edition = entry["edition"]
    if not re.fullmatch(r"football-events-[0-9a-f]{20}", edition):
        raise SystemExit("Invalid event edition identity")
    sql = f"SELECT * FROM football_event_editions WHERE edition='{edition}'"
    if query(sql) != [dict(r) for r in conn.execute(sql)]:
        raise SystemExit("Remote event metadata differs")
    count = query(
        f"SELECT count(*) AS n FROM football_events WHERE edition='{edition}'"
    )[0]["n"]
    if count != entry["coverage"]["records"]:
        raise SystemExit("Remote event row count differs")
    sql = f"SELECT * FROM football_events WHERE edition='{edition}' ORDER BY record_key"
    expected = [dict(r) for r in conn.execute(sql)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(
            pool.map(
                lambda offset, statement=sql: query(
                    statement + f" LIMIT 2500 OFFSET {offset}"
                ),
                range(0, len(expected), 2500),
            )
        )
    actual = [r for page in pages for r in page]
    if actual != expected:
        raise SystemExit(
            f"Remote event rows differ: {entry['dataset']}/{entry['season']}"
        )
    checked += len(actual)
    print(
        f"Verified D1 {entry['dataset']}/{entry['season']}: {len(actual):,} complete event rows and metadata",
        flush=True,
    )
conn.close()
print(
    f"All {len(index['editions'])} active event editions and {checked:,} complete rows match the local release."
)
