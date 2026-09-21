"""Compact, source-native shot-location profiles for women's basketball."""

from __future__ import annotations

import math
from collections import defaultdict

GRID_COLUMNS = 10
GRID_ROWS = 9
X_MIN = -25.0
X_MAX = 25.0
Y_MIN = -5.25
Y_MAX = 41.75
BAND_LABELS = ("Rim", "Paint", "Midrange", "3-point")
SIDE_LABELS = ("Chart left", "Middle", "Chart right")


def _number(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _made(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().casefold() in {"1", "true", "yes", "made"}


def _identity(value, fallback: str) -> str:
    text = str(value or "").strip()
    return text or fallback


def _band(x: float, y: float) -> str:
    distance = math.hypot(x, y)
    if distance <= 4:
        return "Rim"
    if distance <= 12:
        return "Paint"
    if distance >= 22.15:
        return "3-point"
    return "Midrange"


def _side(x: float) -> str:
    if x < -8:
        return "Chart left"
    if x > 8:
        return "Chart right"
    return "Middle"


def build_shot_profiles(rows: list[dict]) -> list[dict]:
    """Aggregate every source shooter into a compact court-coordinate grid.

    A profile is keyed only by the release's ``shooter_id``. It deliberately
    does not join to the separate player-season table because that table uses a
    different identity namespace. All attempts remain in the denominator;
    coordinate cells are display bins derived from the supplied feet values.
    """
    width = (X_MAX - X_MIN) / GRID_COLUMNS
    height = (Y_MAX - Y_MIN) / GRID_ROWS
    profiles: dict[str, dict] = {}
    for row in rows:
        profile_id = _identity(row.get("shooter_id"), "unknown")
        profile = profiles.setdefault(
            profile_id,
            {
                "profile_id": profile_id,
                "names": set(),
                "teams": set(),
                "attempts": 0,
                "makes": 0,
                "located_attempts": 0,
                "cells": defaultdict(lambda: [0, 0]),
                "bands": defaultdict(lambda: [0, 0]),
                "sides": defaultdict(lambda: [0, 0]),
            },
        )
        name = str(row.get("shooter_clean_name") or "").strip()
        team = str(row.get("team_id") or "").strip()
        if name:
            profile["names"].add(name)
        if team:
            profile["teams"].add(team)
        profile["attempts"] += 1
        if _made(row.get("made")):
            profile["makes"] += 1

        x = _number(row.get("shot_x"))
        y = _number(row.get("shot_y"))
        if x is None or y is None or not (X_MIN <= x <= X_MAX and Y_MIN <= y <= Y_MAX):
            continue
        profile["located_attempts"] += 1
        column = min(GRID_COLUMNS - 1, max(0, int((x - X_MIN) / width)))
        grid_row = min(GRID_ROWS - 1, max(0, int((y - Y_MIN) / height)))
        cell = profile["cells"][(column, grid_row)]
        cell[0] += 1
        if _made(row.get("made")):
            cell[1] += 1
        band = profile["bands"][_band(x, y)]
        side = profile["sides"][_side(x)]
        band[0] += 1
        side[0] += 1
        if _made(row.get("made")):
            band[1] += 1
            side[1] += 1

    output = []
    for profile in profiles.values():
        names = sorted(profile["names"])
        teams = sorted(profile["teams"])
        output.append(
            {
                "profile_id": profile["profile_id"],
                "name": names[0] if names else profile["profile_id"],
                "team": teams[0] if teams else "Unknown team",
                "identity_status": "ambiguous" if len(names) > 1 or len(teams) > 1 else "stable",
                "attempts": profile["attempts"],
                "makes": profile["makes"],
                "located_attempts": profile["located_attempts"],
                "cells": [
                    {"column": column, "row": grid_row, "attempts": values[0], "makes": values[1]}
                    for (column, grid_row), values in sorted(profile["cells"].items())
                    if values[0]
                ],
                "bands": [
                    {"label": label, "attempts": profile["bands"][label][0], "makes": profile["bands"][label][1]}
                    for label in BAND_LABELS
                ],
                "sides": [
                    {"label": label, "attempts": profile["sides"][label][0], "makes": profile["sides"][label][1]}
                    for label in SIDE_LABELS
                ],
            }
        )
    return sorted(output, key=lambda item: (-item["attempts"], item["name"], item["profile_id"]))
