"""Validate the reviewed release before storing immutable evidence in Cloudflare D1."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.basketball_recruiting import PUBLIC, SOURCE, SQL, build, sql_export

box = json.loads((PUBLIC.parent / "players.json").read_text())
overview = json.loads((PUBLIC.parent / "overview.json").read_text())
expected = build(
    json.loads(SOURCE.read_text()),
    box,
    {p["id"]: p["name"] for p in overview["ratings"]},
)
if json.loads(PUBLIC.read_text()) != expected or SQL.read_text() != sql_export(
    expected
):
    raise SystemExit(
        "Recruiting source, public release and SQL differ; rebuild before syncing"
    )
for path in [ROOT / "worker/migrations/0012_basketball_recruiting.sql", SQL]:
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
