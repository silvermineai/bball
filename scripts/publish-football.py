"""Refresh attributed releases, validate, build, sync D1 and deploy the site.

Uses existing Cloudflare credentials via scripts/cloudflare.py.
No recurring job is installed by this script.
"""

import os
import subprocess
import sys
import time
from pathlib import Path

from sql_batches import is_retryable_d1_import_error, split_sql_file

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable
BATCH_PUBLICATION = os.getenv("BATCH_PUBLICATION") == "1"
FOOTBALL_D1_DATABASE = os.getenv("FOOTBALL_D1_DATABASE", "bball-football-v1")


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
        retryable = is_retryable_d1_import_error(output)
        if not retryable or attempt == 3:
            raise subprocess.CalledProcessError(result.returncode, args)
        print(
            f"Remote migration failed (attempt {attempt}/3); retrying in 15 seconds.",
            file=sys.stderr,
        )
        time.sleep(15)


def run_logged(args, log_path, cwd=ROOT):
    """Keep large Wrangler output on disk, but surface a useful failure tail."""
    # D1 imports can continue asynchronously after Wrangler reports a 7009
    # response. Give that import time to finish before attempting another one;
    # otherwise the retry itself fails with "Currently processing a
    # long-running import" and masks a recoverable upstream response.
    retry_delays = (15, 30, 60, 120, 180)
    max_attempts = len(retry_delays) + 1
    for attempt in range(1, max_attempts + 1):
        mode = "w" if attempt == 1 else "a"
        with log_path.open(mode) as log:
            if attempt > 1:
                log.write(
                    f"\nRetrying remote SQL import (attempt {attempt}/{max_attempts})\n"
                )
            result = subprocess.run(
                args,
                cwd=cwd,
                env=ENV,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
            )
        tail = log_path.read_text(errors="replace").splitlines()[-80:]
        output = "\n".join(tail)
        # Wrangler 4.93 can report a successful import receipt and still exit
        # one when its poll stream closes with an empty error. The receipt is
        # authoritative: it includes the final D1 bookmark and query count.
        completed_receipt = (
            '"success"' in output
            and '"finalBookmark"' in output
            and ("Processed " in output or "Executed " in output)
        )
        if result.returncode == 0 or completed_receipt:
            if result.returncode != 0:
                print(
                    "Remote SQL import returned a successful D1 receipt despite "
                    "Wrangler exit status 1; continuing.",
                    file=sys.stderr,
                )
            return
        retryable = is_retryable_d1_import_error(output)
        if retryable and attempt < max_attempts:
            delay = retry_delays[attempt - 1]
            print(
                f"Remote SQL import hit a transient Cloudflare error "
                f"(attempt {attempt}/{max_attempts}); retrying in {delay} seconds.",
                file=sys.stderr,
            )
            time.sleep(delay)
            continue
        print(
            f"Remote SQL import failed with exit status {result.returncode}; "
            f"last log lines from {log_path}:",
            file=sys.stderr,
        )
        print(output, file=sys.stderr)
        raise subprocess.CalledProcessError(result.returncode, args)


def import_sql_file_in_chunks(path, log_prefix, database_name=FOOTBALL_D1_DATABASE):
    """Import football rows in bounded statement-aligned files.

    The football release is large enough that one remote D1 import can hit an
    upstream reset after tens of thousands of statements. Deletes are kept in
    their own transactions and inserts stay below Wrangler's practical upload
    size, so a retry does not replay one enormous transaction.
    """
    source = Path(path)
    if not source.exists():
        raise SystemExit(f"Missing SQL export: {source}")
    chunk_dir = ROOT / ".local" / "football-import-chunks"
    chunks = split_sql_file(source, chunk_dir)
    if not chunks:
        raise SystemExit(f"SQL export is empty: {source}")
    print(f"Splitting {source.name} into {len(chunks)} bounded D1 imports", flush=True)
    for index, chunk in enumerate(chunks):
        run_logged(
            [
                PY,
                "scripts/cloudflare.py",
                "d1",
                "execute",
                database_name,
                "--remote",
                "--file",
                os.path.relpath(chunk, ROOT / "worker"),
            ],
            ROOT / ".local" / f"{log_prefix}-{index:04d}.log",
        )
        print(f"Imported {chunk.name} ({index + 1}/{len(chunks)})", flush=True)


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
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        FOOTBALL_D1_DATABASE,
        "--remote",
        "--file",
        "migrations-football/0001_football.sql",
    ]
)
# Wrangler import output can be large; retain it on disk for audit.
import_sql_file_in_chunks(ROOT / ".local/football.sql", "d1-publish")
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-football-player-history.py"])
run([PY, "scripts/sync-football-events.py"])
run([PY, "scripts/sync-football-history.py"])
run([PY, "scripts/sync-football-efficiency.py"])
run([PY, "scripts/archive-football-evaluation.py"])
run([PY, "scripts/archive-football-features.py"])
if not BATCH_PUBLICATION:
    run([PY, "scripts/cloudflare.py", "deploy"])
