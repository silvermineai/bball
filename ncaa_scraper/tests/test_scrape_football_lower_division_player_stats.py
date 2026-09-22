"""Pure contract tests for the ESPN lower-division player capture helpers."""

from __future__ import annotations

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/scrape-football-lower-division-player-stats.py"
SPEC = importlib.util.spec_from_file_location("scrape_football_lower", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_team_total_ids_are_not_player_identities() -> None:
    assert MODULE.is_rankable_athlete_id("5308774")
    assert not MODULE.is_rankable_athlete_id("-12291")
    assert not MODULE.is_rankable_athlete_id("Team")
    assert not MODULE.is_rankable_athlete_id("0")


def test_provider_values_are_padded_without_inventing_values() -> None:
    assert MODULE.align_provider_values(
        ["completions/passingAttempts", "passingYards", "adjQBR"],
        ["12/30", "76"],
    ) == ["12/30", "76", ""]
    assert MODULE.align_provider_values(["yards"], ["12", "unkeyed"]) == ["12"]
    assert MODULE.align_provider_values(["yards"], [None]) == [""]
