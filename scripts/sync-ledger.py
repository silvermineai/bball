"""Sync the already-generated append-only research ledger to Cloudflare D1."""

import subprocess
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
D1_DB_NAME = os.getenv("RESEARCH_D1_DATABASE", "bball-research-v2")
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
                D1_DB_NAME,
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
