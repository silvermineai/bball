"""Refresh attributed releases, validate, build, sync D1 and deploy the site.

Uses existing Cloudflare credentials via scripts/cloudflare.py.
No recurring job is installed by this script.
"""

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
        "test_football.py",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.football",
        "--refresh",
        "--sql",
        str(ROOT / ".local/football.sql"),
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
        "test_football_events.py",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.football_events",
        "--sql",
        str(ROOT / ".local/football-events.sql"),
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
        "test_football_efficiency.py",
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
        "test_football_history.py",
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
        "test_football_artifacts.py",
    ]
)
run([PY, "-m", "ncaa_scraper.football_history"])
run([PY, "-m", "ncaa_scraper.football_evaluation"])
run([PY, "-m", "ncaa_scraper.football_features"])
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_football_features.py",
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
        "test_football_evaluation.py",
    ]
)
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
        "migrations/0008_football.sql",
    ]
)
# Wrangler import output can be large; retain it on disk for audit.
with (ROOT / ".local/d1-publish.log").open("w") as log:
    subprocess.run(
        [
            PY,
            "scripts/cloudflare.py",
            "d1",
            "execute",
            "bball-silvermine",
            "--remote",
            "--file",
            "../.local/football.sql",
        ],
        cwd=ROOT,
        env=ENV,
        stdout=log,
        stderr=subprocess.STDOUT,
        check=True,
    )
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-football-events.py"])
run([PY, "scripts/sync-football-history.py"])
run([PY, "scripts/sync-football-efficiency.py"])
run([PY, "scripts/archive-football-evaluation.py"])
run([PY, "scripts/archive-football-features.py"])
run([PY, "scripts/cloudflare.py", "deploy"])
