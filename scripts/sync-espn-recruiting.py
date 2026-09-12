"""Apply the normalized ESPN recruiting release to Cloudflare D1."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / ".local/espn-recruiting.sql"
MIGRATION = ROOT / "worker/migrations/0033_espn_recruiting.sql"
DB = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")
if not SQL.exists():
    raise SystemExit("No .local/espn-recruiting.sql; run ncaa_scraper.espn_recruiting first")
for path in (MIGRATION, SQL):
    subprocess.run([sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", DB, "--remote", "--file", str(path)], cwd=ROOT, check=True)
print("Synced ESPN recruiting release")
