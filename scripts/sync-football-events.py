"""Publish generated event editions and activate them after their records exist."""

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if not (ROOT / ".local/football-events.sql").is_file():
    raise SystemExit("Build the football event notebook before syncing it.")
for file in ["migrations/0014_football_events.sql", "../.local/football-events.sql"]:
    args = [
        sys.executable,
        "scripts/cloudflare.py",
        "d1",
        "execute",
        "bball-silvermine",
        "--remote",
        "--file",
        file,
    ]
    for attempt in range(1, 4):
        with (ROOT / ".local/football-events-sync.log").open("a") as log:
            if attempt > 1:
                log.write(f"\nRetrying {file} (attempt {attempt}/3)\n")
            result = subprocess.run(
                args,
                cwd=ROOT,
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
            )
        if result.returncode == 0:
            break
        lines = (ROOT / ".local/football-events-sync.log").read_text(
            errors="replace"
        ).splitlines()
        tail = "\n".join(lines[-80:])
        retryable = "Upstream service unavailable" in tail or "code: 7009" in tail
        if not retryable or attempt == 3:
            print(
                f"Football event SQL sync failed for {file}; last log lines:",
                file=sys.stderr,
            )
            print(tail, file=sys.stderr)
            raise subprocess.CalledProcessError(result.returncode, args)
        print(
            f"Football event SQL sync hit a transient Cloudflare upstream error "
            f"(attempt {attempt}/3); retrying in 15 seconds.",
            file=sys.stderr,
        )
        time.sleep(15)
subprocess.run(
    [sys.executable, str(ROOT / "scripts/verify-football-events.py")],
    cwd=ROOT,
    check=True,
)
print("Football event editions synced and verified in Cloudflare D1")
