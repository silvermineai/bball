"""Run the project's Wrangler with credentials from ~/.env, never printed."""

import os
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
values = dotenv_values(Path.home() / ".env")
env = os.environ.copy()
env["CLOUDFLARE_API_TOKEN"] = (
    env.get("CLOUDFLARE_API_TOKEN")
    or env.get("CF_API_TOKEN_ACCOUNT")
    or values.get("CF_API_TOKEN_ACCOUNT")
    or ""
)
env["CLOUDFLARE_ACCOUNT_ID"] = (
    env.get("CLOUDFLARE_ACCOUNT_ID")
    or env.get("CF_ACCOUNT_ID")
    or values.get("CF_ACCOUNT_ID")
    or ""
)
if not env["CLOUDFLARE_API_TOKEN"] or not env["CLOUDFLARE_ACCOUNT_ID"]:
    raise SystemExit(
        "Cloudflare account credentials are missing from the environment or ~/.env"
    )
result = subprocess.run(
    ["node", "node_modules/wrangler/bin/wrangler.js", *sys.argv[1:]],
    cwd=root / "worker",
    env=env,
    check=False,
)
if result.returncode:
    raise SystemExit(result.returncode)
if (
    sys.argv[1:2] == ["deploy"]
    and not any(arg.startswith("--dry-run") for arg in sys.argv[2:])
    and os.environ.get("SKIP_BRIEF_ARCHIVE") != "1"
):
    archive_python = root / ".venv/bin/python"
    if not archive_python.exists():
        archive_python = Path(sys.executable)
    archived = subprocess.run(
        [str(archive_python), str(root / "scripts/archive-briefs.py")],
        cwd=root,
        check=False,
    )
    if archived.returncode:
        print(
            "Deployment succeeded, but brief archiving failed. Retry scripts/archive-briefs.py without redeploying.",
            file=sys.stderr,
        )
        raise SystemExit(archived.returncode)
elif sys.argv[1:2] == ["deploy"] and os.environ.get("SKIP_BRIEF_ARCHIVE") == "1":
    print("Skipped optional brief archive capture (SKIP_BRIEF_ARCHIVE=1).")
raise SystemExit(0)
