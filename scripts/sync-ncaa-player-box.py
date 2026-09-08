"""Archive NCAA player-box Parquet releases and receipts in R2."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local/basketball"

for season in range(2010, 2027):
    source = LOCAL / f"ncaa_mbb_player_box_{season}.parquet"
    receipt_path = source.with_name(source.name + ".receipt.json")
    if not source.exists() or not receipt_path.exists():
        raise SystemExit(f"Missing NCAA player-box source for {season}")
    receipt = json.loads(receipt_path.read_text())
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if receipt.get("sha256") != digest:
        raise SystemExit(f"Source receipt mismatch for {season}")
    key = f"bball-research/basketball/ncaa-player-box/{season}/{digest}"
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
    print(f"Archived NCAA player boxes {season}", flush=True)
