"""Refresh attributed releases, validate, build, sync D1 and deploy the site.

Uses existing Cloudflare credentials via scripts/cloudflare.py.
No recurring job is installed by this script.
"""

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable
BATCH_PUBLICATION = os.getenv("BATCH_PUBLICATION") == "1"


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, env=ENV, check=True)


def run_logged(args, log_path, cwd=ROOT):
    """Keep large Wrangler output on disk, but surface a useful failure tail."""
    for attempt in range(1, 4):
        mode = "w" if attempt == 1 else "a"
        with log_path.open(mode) as log:
            if attempt > 1:
                log.write(f"\nRetrying remote SQL import (attempt {attempt}/3)\n")
            result = subprocess.run(
                args,
                cwd=cwd,
                env=ENV,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
            )
        if result.returncode == 0:
            return
        tail = log_path.read_text(errors="replace").splitlines()[-80:]
        output = "\n".join(tail)
        retryable = "Upstream service unavailable" in output or "code: 7009" in output
        if retryable and attempt < 3:
            print(
                f"Remote SQL import hit a transient Cloudflare upstream error "
                f"(attempt {attempt}/3); retrying in 15 seconds.",
                file=sys.stderr,
            )
            time.sleep(15)
            continue
        print(
            f"Remote SQL import failed with exit status {result.returncode}; "
            f"last log lines from {log_path}:",
            file=sys.stderr,
        )
        print(output, file=sys.stderr)
        raise subprocess.CalledProcessError(result.returncode, args)


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
run([PY, "-m", "ncaa_scraper.football_player_history"])
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_football_player_history.py",
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
if not BATCH_PUBLICATION:
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
run_logged(
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
    ROOT / ".local/d1-publish.log",
)
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-football-player-history.py"])
run([PY, "scripts/sync-football-events.py"])
run([PY, "scripts/sync-football-history.py"])
run([PY, "scripts/sync-football-efficiency.py"])
run([PY, "scripts/archive-football-evaluation.py"])
run([PY, "scripts/archive-football-features.py"])
if not BATCH_PUBLICATION:
    run([PY, "scripts/cloudflare.py", "deploy"])
