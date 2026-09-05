"""Build reviewed recruiting evidence, verify the site and publish to Cloudflare."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "PYTHONPATH": str(ROOT / "ncaa_scraper")}


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, env=ENV, check=True)


run([sys.executable, "-m", "ncaa_scraper.basketball_recruiting"])
run(
    [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        "ncaa_scraper/tests",
        "-p",
        "test_basketball_recruiting.py",
    ]
)
run(["npm", "test"], ROOT / "frontend")
run(["npm", "run", "build"], ROOT / "frontend")
run(["npm", "run", "typecheck"], ROOT / "worker")
run(["npm", "test"], ROOT / "worker")
run([sys.executable, "scripts/cloudflare.py", "deploy", "--dry-run"])
run([sys.executable, "scripts/sync-recruiting.py"])
run([sys.executable, "scripts/cloudflare.py", "deploy"])
