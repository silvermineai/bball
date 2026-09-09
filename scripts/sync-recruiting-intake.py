"""Apply an authorized recruiting evidence export to Cloudflare D1."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / ".local/recruiting-intake.sql"
MIGRATION = ROOT / "worker/migrations/0025_basketball_recruiting_intake.sql"

if not SQL.exists():
    raise SystemExit("No .local/recruiting-intake.sql; run ncaa_scraper.recruiting_intake first")
for path in (MIGRATION, SQL):
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", "bball-silvermine", "--remote", "--file", str(path)],
        cwd=ROOT,
        check=True,
    )
print("Synced authorized recruiting evidence")
