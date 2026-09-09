"""Apply an authorized CollegeBasketballData recruiting export to D1."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / ".local/cbbd-recruiting.sql"
MIGRATION = ROOT / "worker/migrations/0026_cbbd_recruiting.sql"

if not SQL.exists():
    raise SystemExit("No .local/cbbd-recruiting.sql; run ncaa_scraper.cbbd_recruiting first")
for path in (MIGRATION, SQL):
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", "bball-silvermine", "--remote", "--file", str(path)],
        cwd=ROOT,
        check=True,
    )
print("Synced authorized CollegeBasketballData recruiting evidence")
