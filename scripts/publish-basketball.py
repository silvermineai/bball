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
run_remote_migration(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        "bball-silvermine",
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
        "bball-silvermine",
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
        "bball-silvermine",
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
        "bball-silvermine",
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
        "bball-silvermine",
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
        "bball-silvermine",
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
        "bball-silvermine",
        "--remote",
        "--file",
        "migrations/0023_basketball_ncaa_shooting.sql",
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
run_logged(
    [
        PY,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        "bball-silvermine",
        "--remote",
        "--file",
        "../.local/ncaa-player-box-2026.sql",
    ],
    ROOT / ".local/ncaa-player-box-publish-d1.log",
)
run([PY, "scripts/sync-ledger.py"])
run([PY, "scripts/sync-shooting.py"])
run([PY, "scripts/sync-recruiting.py"])
run([PY, "scripts/sync-careers.py"])
run([PY, "scripts/sync-ncaa-individual.py"])
run([PY, "scripts/sync-matchup-stints.py"])
run([PY, "scripts/sync-ncaa-team-box.py"])
run([PY, "scripts/sync-ncaa-player-box.py"])
run([PY, "scripts/sync-ncaa-source-releases.py"])
run([PY, "scripts/sync-within-impact.py"])
run([PY, "scripts/archive-evaluation.py"])
if not BATCH_PUBLICATION:
    run([PY, "scripts/cloudflare.py", "deploy"])
