"""Refresh basketball releases, validate, sync Cloudflare D1 and publish the site."""

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


def run_remote_migration(args, cwd=ROOT):
    """Retry only remote migration calls when Cloudflare reports an upstream outage."""
    for attempt in range(1, 4):
        result = subprocess.run(
            args, cwd=cwd, env=ENV, check=False, capture_output=True, text=True
        )
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        if result.returncode == 0:
            return
        output = (result.stdout or "") + (result.stderr or "")
        retryable = "Upstream service unavailable" in output or "code: 7009" in output
        if not retryable or attempt == 3:
            raise subprocess.CalledProcessError(result.returncode, args)
        print(
            f"Remote migration failed (attempt {attempt}/3); retrying in 15 seconds.",
            file=sys.stderr,
        )
        time.sleep(15)


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
run(
    [
        PY,
        "-m",
        "ncaa_scraper.basketball_shooting",
        "--seasons",
        "2025",
        "2026",
        "--refresh",
        "--sql",
    ]
)
run([PY, "-m", "ncaa_scraper.basketball_recruiting"])
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_recruiting.py",
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
        "test_basketball_careers.py",
    ]
)
run([PY, "-m", "ncaa_scraper.basketball_careers", "--sql"])
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_evaluation.py",
    ]
)
run([PY, "-m", "ncaa_scraper.basketball_evaluation"])
if not BATCH_PUBLICATION:
    run(["npm", "test"], ROOT / "frontend")
    run(["npm", "run", "build"], ROOT / "frontend")
    run(["npm", "run", "typecheck"], ROOT / "worker")
    run(["npm", "test"], ROOT / "worker")
run_remote_migration(
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
run_logged(
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
    ROOT / ".local/basketball-publish-d1.log",
)
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-shooting.py"])
run([PY, "scripts/sync-recruiting.py"])
run([PY, "scripts/sync-careers.py"])
run([PY, "scripts/archive-evaluation.py"])
if not BATCH_PUBLICATION:
    run([PY, "scripts/cloudflare.py", "deploy"])
