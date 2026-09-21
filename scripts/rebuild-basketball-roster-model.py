"""Rebuild the basketball roster challenger from verified cached releases.

This is a bounded recovery path for a source warehouse that cannot be rebuilt
within the local disk budget. It imports only the partitions needed by the
ESPN roster challenger and publishes atomically after all source hashes and
model checks pass. The optional NCAA historical replay is deliberately marked
unavailable because its cross-publisher mapping must meet its own threshold.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))

from ncaa_scraper.basketball import ingest  # noqa: E402
from ncaa_scraper.basketball_roster_model import build  # noqa: E402
from ncaa_scraper.basketball_sources import client  # noqa: E402


PARTITIONS = {
    "schedule": (2024, 2025, 2026, 2027),
    "team_box": (2024, 2025, 2026),
    "player_box": (2024, 2025, 2026),
    "rosters": (2025, 2026, 2027),
    "publisher_player_value": (2024, 2025, 2026),
}


def verified_cached_partitions(source_client, cache: Path):
    """Yield source partitions only when their receipt hash is exact."""
    for dataset, seasons in PARTITIONS.items():
        _, template = source_client.datasets[dataset]
        for season in seasons:
            name = template.format(year=season)
            path = cache / name
            receipt_path = cache / f"{name}.receipt.json"
            if not path.exists() or not receipt_path.exists():
                raise RuntimeError(f"missing cached release or receipt: {name}")
            receipt = json.loads(receipt_path.read_text())
            expected = receipt.get("sha256")
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if not expected or actual != expected:
                raise RuntimeError(f"cached release hash mismatch: {name}")
            yield dataset, season


def rebuild(output: Path) -> dict:
    source_client = client()
    cache = ROOT / ".local/basketball"
    partitions = list(verified_cached_partitions(source_client, cache))
    with tempfile.NamedTemporaryFile(
        prefix="basketball-roster-rebuild-", suffix=".sqlite3", dir=ROOT / ".local", delete=False
    ) as handle:
        db_path = Path(handle.name)
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        for migration in ("0009_basketball_research.sql", "0018_basketball_boutique.sql"):
            conn.executescript((ROOT / "worker/migrations" / migration).read_text())
        for dataset, season in partitions:
            rows, receipt = source_client.load(dataset, season, refresh=False)
            ingest(conn, dataset, season, rows, receipt)
        conn.commit()
        overview = json.loads((ROOT / "frontend/public/data/basketball/overview.json").read_text())
        artifact = build(
            conn,
            overview["model"],
            overview["upcoming"],
            include_ncaa_replay=False,
        )
        conn.close()
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent, prefix=f".{output.name}.", delete=False
        ) as handle:
            json.dump(artifact, handle, separators=(",", ":"), allow_nan=False)
            handle.flush()
            temp_output = Path(handle.name)
        temp_output.replace(output)
        return {
            "partitions": len(partitions),
            "scenario_games": artifact["coverage"]["scenario_games"],
            "teams_with_player_watch": sum(bool(row.get("player_watch")) for row in artifact["teams"]),
            "scenarios_with_player_watch": sum(
                bool(row.get("home_player_watch") or row.get("away_player_watch"))
                for row in artifact["scenarios"]
            ),
            "historical_evaluation": artifact["historical_evaluation"]["status"],
        }
    finally:
        db_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "frontend/public/data/basketball/roster-model.json",
    )
    args = parser.parse_args()
    result = rebuild(args.output)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
