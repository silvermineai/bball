"""Archive NCAA roster and shot Parquet releases and receipts in R2."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local/basketball"


def archive(dataset: str, stem: str, seasons: range, prefix: str) -> None:
    for season in seasons:
        source = LOCAL / f"{stem}_{season}.parquet"
        receipt_path = source.with_name(source.name + ".receipt.json")
        if not source.exists() or not receipt_path.exists():
            raise SystemExit(f"Missing {dataset} source for {season}")
        receipt = json.loads(receipt_path.read_text())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if receipt.get("sha256") != digest:
            raise SystemExit(f"Source receipt mismatch for {dataset} {season}")
        key = f"bball-research/basketball/{prefix}/{season}/{digest}"
        for path, suffix, content_type in (
            (source, ".parquet", "application/vnd.apache.parquet"),
            (receipt_path, ".receipt.json", "application/json"),
        ):
            subprocess.run(
                [
                    sys.executable,
                    "scripts/cloudflare.py",
                    "r2",
                    "object",
                    "put",
                    key + suffix,
                    "--file",
                    str(path.resolve()),
                    "--content-type",
                    content_type,
                    "--remote",
                ],
                cwd=ROOT,
                check=True,
            )
        print(f"Archived NCAA {dataset} {season}", flush=True)


archive("roster", "ncaa_mbb_team_rosters", range(2010, 2027), "ncaa-rosters")
archive("shot", "ncaa_mbb_shots", range(2019, 2027), "ncaa-shots")
