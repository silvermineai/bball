"""NCAA stats sport configuration."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SportConfig:
    code: str
    label: str
    default_org_id: int = 164
    divisions: tuple[str, ...] = ("1",)


SPORTS: dict[str, SportConfig] = {
    "MBB": SportConfig("MBB", "Men's Basketball", divisions=("1", "2", "3")),
    "WBB": SportConfig("WBB", "Women's Basketball", divisions=("1", "2", "3")),
    "MBA": SportConfig("MBA", "Baseball", divisions=("1", "2", "3")),
    "WSB": SportConfig("WSB", "Softball", divisions=("1", "2", "3")),
    "MFB": SportConfig("MFB", "Football", divisions=("1", "2", "3")),
    "MSO": SportConfig("MSO", "Men's Soccer", divisions=("1", "2", "3")),
    "WSO": SportConfig("WSO", "Women's Soccer", divisions=("1", "2", "3")),
}


DEFAULT_SPORT_CODE = "MBB"
DEFAULT_SPORT_CODES = ("MBB", "WBB", "MBA", "WSB", "MFB", "MSO", "WSO")


def sport_config(code: str) -> SportConfig:
    normalized = code.upper()
    if normalized not in SPORTS:
        raise ValueError(f"Unsupported NCAA sport code: {code}")
    return SPORTS[normalized]
