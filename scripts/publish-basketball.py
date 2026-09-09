"""Refresh basketball releases, validate, sync Cloudflare D1 and publish the site."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-silvermine")

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}
PY = sys.executable
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--batch-publication",
    action="store_true",
    help="Skip the frontend and Worker test/build checks (for scheduled batch runs).",
)
parser.add_argument(
    "--basketball-sql-batch-start",
    type=int,
    metavar="N",
    help="Resume the main basketball SQL import at batch N after a confirmed interruption.",
)
parser.add_argument(
    "--ncaa-player-box-sql-batch-start",
    type=int,
    metavar="N",
    help="Resume the NCAA player-box SQL import at batch N after a confirmed interruption.",
)
args = parser.parse_args()
if args.batch_publication:
    os.environ["BATCH_PUBLICATION"] = "1"
if args.basketball_sql_batch_start is not None:
    os.environ["BASKETBALL_SQL_BATCH_START"] = str(args.basketball_sql_batch_start)
if args.ncaa_player_box_sql_batch_start is not None:
    os.environ["NCAA_PLAYER_BOX_SQL_BATCH_START"] = str(args.ncaa_player_box_sql_batch_start)
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
        retryable = (
            "Upstream service unavailable" in output
            or "code: 7009" in output
            or "Currently processing a long-running import" in output
            or "Cancelled due to no poll() received" in output
        )
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


def verified_sql_batches(first_path, start_env):
    """Read the exporter manifest and return only verified batch paths."""
    first_path = Path(first_path)
    manifest_path = first_path.with_name(f"{first_path.stem}-manifest.json")
    if not manifest_path.exists():
        raise SystemExit(f"Missing SQL batch manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    entries = manifest.get("files")
    if not isinstance(entries, list) or not entries:
        raise SystemExit(f"SQL batch manifest has no files: {manifest_path}")
    start = int(os.getenv(start_env, "0"))
    if start < 0 or start >= len(entries):
        raise SystemExit(f"{start_env} must be between 0 and {len(entries) - 1}")
    result = []
    for index, entry in enumerate(entries):
        target = first_path.parent / str(entry.get("name", ""))
        if target.name != entry.get("name") or not target.exists():
            raise SystemExit(f"Missing SQL batch listed in manifest: {target}")
        if target.stat().st_size != int(entry.get("bytes", -1)):
            raise SystemExit(f"SQL batch size changed: {target}")
        if hashlib.sha256(target.read_bytes()).hexdigest() != entry.get("sha256"):
            raise SystemExit(f"SQL batch hash changed: {target}")
        if index >= start:
            result.append((index, target))
    if start:
        print(
            f"Resuming {first_path.stem} SQL import at batch {start} "
            f"(set {start_env}=0 to replay the scoped delete batch).",
            flush=True,
        )
    return result


def import_sql_batches(first_path, log_prefix, start_env):
    batches = verified_sql_batches(first_path, start_env)
    total = len(batches) + int(os.getenv(start_env, "0"))
    for index, target in batches:
        run_logged(
            [
                PY,
                "scripts/cloudflare.py",
                "d1",
                "execute",
                D1_DB_NAME,
                "--remote",
                "--file",
                os.path.relpath(target, ROOT / "worker"),
            ],
            ROOT / ".local" / f"{log_prefix}-{index:04d}.log",
        )
        print(f"Imported {target.name} ({index + 1}/{total})", flush=True)


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
        "ncaa_scraper.basketball_standings",
        "--refresh",
    ]
)
run([PY, "scripts/build-basketball-coverage.py"])
run([PY, "-m", "ncaa_scraper.ncaa_individual_enrichment"])
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
run(
    [
        PY,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_standings.py",
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
        "2024",
        "2025",
        "2026",
        "--refresh",
        "--sql",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.pbp_catalog",
        "--seasons",
        "2019",
        "2020",
        "2021",
        "2022",
        "2023",
        "2024",
        "2025",
        "2026",
        "--refresh",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.basketball_matchups",
        "--seasons",
        "2019",
        "2020",
        "2021",
        "2022",
        "2023",
        "2024",
        "2025",
        "2026",
        "--refresh",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.basketball_ncaa_team_box",
        "--seasons",
        *[str(year) for year in range(2010, 2027)],
        "--refresh",
    ]
)
run(
    [
        PY,
        "-m",
        "ncaa_scraper.basketball_within_impact",
        "--seasons",
        *[str(year) for year in range(2010, 2027)],
        "--refresh",
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
        "test_basketball_cbbd_recruiting.py",
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
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0009_basketball_research.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0017_basketball_team_season.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0018_basketball_boutique.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0019_basketball_lineups.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0020_basketball_player_core.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0021_basketball_ncaa_player_box.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0022_basketball_ncaa_rosters.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0023_basketball_ncaa_shooting.sql",
    ]
)
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        D1_DB_NAME,
        "--remote",
        "--file",
        "migrations/0026_cbbd_recruiting.sql",
    ]
)
import_sql_batches(
    ROOT / ".local/basketball.sql",
    "basketball-publish-d1",
    "BASKETBALL_SQL_BATCH_START",
)
import_sql_batches(
    ROOT / ".local/ncaa-player-box-2026.sql",
    "ncaa-player-box-publish-d1",
    "NCAA_PLAYER_BOX_SQL_BATCH_START",
)
run([PY, "scripts/sync-basketball-core.py", "--remote"])
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-shooting.py"])
run([PY, "scripts/sync-recruiting.py"])
run([PY, "scripts/sync-news.py"])
run([PY, "scripts/sync-careers.py"])
run([PY, "scripts/sync-career-source-releases.py"])
run([PY, "scripts/sync-ncaa-individual.py"])
run([PY, "scripts/sync-matchup-stints.py"])
run([PY, "scripts/sync-ncaa-team-box.py"])
run([PY, "scripts/sync-ncaa-player-box.py"])
run([PY, "scripts/sync-ncaa-source-releases.py"])
run([PY, "scripts/sync-within-impact.py"])
run([PY, "scripts/verify-basketball-d1.py"])
run([PY, "scripts/archive-evaluation.py"])
if not BATCH_PUBLICATION:
    run([PY, "scripts/cloudflare.py", "deploy"])
