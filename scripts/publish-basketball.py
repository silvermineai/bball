"""Refresh basketball releases, validate, sync Cloudflare D1 and publish the site."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, env=ENV, check=True)


run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_*ball.py",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.basketball",
        "--refresh",
        "--sql",
        str(ROOT / ".local/basketball.sql"),
    ]
)
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_research_ledger.py",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.research_ledger",
        "--sql",
        str(ROOT / ".local/research-ledger.sql"),
    ]
)
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_scouting.py",
    ]
)
run([PY, "-m", "ncaa_scraper.basketball_scouting"])
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_shooting.py",
    ]
)
run([PY, "-m", "ncaa_scraper.basketball_shooting", "--refresh", "--sql"])
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run(["npm", "run", "typecheck"], ROOT / "worker")
run(["npm", "test"], ROOT / "worker")
run(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        "bball-silvermine",
        "--remote",
        "--file",
        "migrations/0009_basketball_research.sql",
    ]
)
with (ROOT / ".local/basketball-publish-d1.log").open("w") as log:
    subprocess.run(
        [
            PY,
            "scripts/cloudflare.py",
            "d1",
            "execute",
            "bball-silvermine",
            "--remote",
            "--file",
            "../.local/basketball.sql",
        ],
        cwd=ROOT,
        env=ENV,
        stdout=log,
        stderr=subprocess.STDOUT,
        check=True,
    )
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-shooting.py"])
run([PY, "scripts/cloudflare.py", "deploy"])
