"""Archive NCAA team-box Parquet releases and receipts in R2."""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local/basketball"

# The scheduled publication rebuilds the local catalog, but historical
# content-addressed objects do not need to be uploaded on every run. Limiting
# incremental maintenance to the current season avoids a long series of
# redundant R2 requests (and makes a transient R2 timeout less likely to block
# the model refresh). A full rebuild still archives every retained season.
seasons = [2026] if os.getenv("BASKETBALL_D1_INCREMENTAL") == "1" else list(range(2010, 2027))
for season in seasons:
    source = LOCAL / f"ncaa_mbb_team_box_{season}.parquet"
    receipt_path = source.with_name(source.name + ".receipt.json")
    if not source.exists() or not receipt_path.exists():
        raise SystemExit(f"Missing NCAA team-box source for {season}")
    receipt = json.loads(receipt_path.read_text())
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if receipt.get("sha256") != digest:
        raise SystemExit(f"Source receipt mismatch for {season}")
    key = f"bball-research/basketball/ncaa-team-box/{season}/{digest}"
    for path, suffix, content_type in ((source, ".parquet", "application/vnd.apache.parquet"), (receipt_path, ".receipt.json", "application/json")):
        subprocess.run([sys.executable, "scripts/cloudflare.py", "r2", "object", "put", key + suffix, "--file", str(path.resolve()), "--content-type", content_type, "--remote"], cwd=ROOT, check=True)
    print(f"Archived NCAA team box {season}", flush=True)
