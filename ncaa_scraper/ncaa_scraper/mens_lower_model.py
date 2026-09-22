"""Exact-scope men's DII/DIII basketball ratings and forecast readiness.

The retained NCAA release contains completed 2025 men's DII/DIII contests and
no 2026-27 target schedule. This module deliberately publishes historical
ratings plus a blocked future-forecast gate; it never treats the missing target
schedule as a reason to invent upcoming games or probabilities.
"""

from __future__ import annotations

from typing import Any

from .womens_lower_model import build_division_artifact as _build_division_artifact
from .womens_lower_model import normalize_final_games

MODEL_VERSION = "mbb-lower-ratings-v1"


def build_division_artifact(
    contests: list[dict[str, Any]],
    division: int,
    *,
    source_receipts: list[dict[str, Any]] | None = None,
    source_asset_sha256: str | None = None,
    target_schedule_present: bool = False,
) -> dict[str, Any]:
    """Build the men's source-native exact-division rating artifact."""
    return _build_division_artifact(
        contests,
        division,
        source_receipts=source_receipts,
        source_asset_sha256=source_asset_sha256,
        target_schedule_present=target_schedule_present,
        gender="men",
        model_version=MODEL_VERSION,
    )


__all__ = ["MODEL_VERSION", "build_division_artifact", "normalize_final_games"]
