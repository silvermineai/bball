"""Run the project's Wrangler with credentials from ~/.env, never printed."""

import os
import subprocess
import sys
import time
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
args = sys.argv[1:]


def retryable_r2_upload(arguments: list[str]) -> bool:
    """R2 puts are content-addressed and safe to retry after a network timeout."""
    return arguments[:3] == ["r2", "object", "put"] and "--remote" in arguments


def retryable_d1_import(arguments: list[str]) -> bool:
    """D1 file imports can be retried when Cloudflare rejects the request upstream."""
    return (
        arguments[:2] == ["d1", "execute"]
        and "--remote" in arguments
        and "--file" in arguments
    )


def transient_failure(output: str) -> bool:
    """Recognize transport/origin failures without retrying auth or input errors."""
    lowered = output.lower()
    return any(marker in lowered for marker in (
        "error code 524",
        " 524:",
        " 502:",
        " 503:",
        " 504:",
        "timed out",
        "timeout",
        "econnreset",
        "fetch failed",
        "code: 7009",
        "upstream service unavailable",
    ))


def run_wrangler(arguments: list[str]) -> subprocess.CompletedProcess[str]:
    retryable = retryable_r2_upload(arguments) or retryable_d1_import(arguments)
    attempts = 4 if retryable else 1
    delays = (5, 15, 30)
    for attempt in range(attempts):
        result = subprocess.run(
            ["node", "node_modules/wrangler/bin/wrangler.js", *arguments],
            cwd=root / "worker",
            env=env,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        if result.stdout:
            print(result.stdout, end="")
        if result.returncode == 0:
            return result
        if attempt + 1 >= attempts or not transient_failure(result.stdout or ""):
            return result
        delay = delays[attempt]
        print(
            f"Cloudflare transient remote operation failure; retrying in {delay}s "
            f"(attempt {attempt + 2}/{attempts}).",
            file=sys.stderr,
            flush=True,
        )
        time.sleep(delay)
    raise AssertionError("unreachable")


result = run_wrangler(args)
if result.returncode:
    raise SystemExit(result.returncode)
if (
    args[:1] == ["deploy"]
    and not any(arg.startswith("--dry-run") for arg in args[1:])
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
elif args[:1] == ["deploy"] and os.environ.get("SKIP_BRIEF_ARCHIVE") == "1":
    print("Skipped optional brief archive capture (SKIP_BRIEF_ARCHIVE=1).")
raise SystemExit(0)
