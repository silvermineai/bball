"""Sync the already-generated append-only research ledger to Cloudflare D1."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
if not (ROOT / ".local/research-ledger.sql").is_file():
    raise SystemExit("Generate the research ledger before syncing it.")
for file in ("migrations/0010_research_ledger.sql", "../.local/research-ledger.sql"):
    with (ROOT / ".local/research-ledger-sync.log").open("a") as log:
        subprocess.run(
            [
                PY,
                "scripts/cloudflare.py",
                "d1",
                "execute",
                "bball-silvermine",
                "--remote",
                "--file",
                file,
            ],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=True,
        )
print("Research ledger synced to Cloudflare D1")
