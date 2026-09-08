"""Archive historical player-box Parquet releases and receipts in R2."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local/basketball"
catalog = json.loads((ROOT / "frontend/public/data/basketball/history/index.json").read_text())

for season in catalog["seasons"]:
    year = int(season["season"])
    source = next(
        source
        for sources in catalog["sources"]
        for source in sources
        if source.get("dataset") == "player_box" and int(source.get("season")) == year
    )
    filename = source["url"].rsplit("/", 1)[-1]
    parquet = LOCAL / filename
    receipt_path = parquet.with_name(parquet.name + ".receipt.json")
    if not parquet.exists() or not receipt_path.exists():
        raise SystemExit(f"Missing historical player-box source for {year}: {filename}")
    receipt = json.loads(receipt_path.read_text())
    digest = hashlib.sha256(parquet.read_bytes()).hexdigest()
    if digest != source.get("sha256") or digest != receipt.get("sha256"):
        raise SystemExit(f"Historical player-box receipt mismatch for {year}")
    key = f"bball-research/basketball/careers/player-box/{year}/{digest}"
    for path, suffix, content_type in (
        (parquet, ".parquet", "application/vnd.apache.parquet"),
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
    print(f"Archived historical player-box source {year}", flush=True)
