"""Stable public identifiers for app-facing sports data."""

from __future__ import annotations

import hashlib

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
SPORT_IDS = {
    "MBB": "s_mbb",
    "WBB": "s_wbb",
    "MBA": "s_bsb",
    "WSB": "s_sfb",
    "MFB": "s_fbl",
    "MSO": "s_mso",
    "WSO": "s_wso",
}


def internal_id(prefix: str, source: int | str) -> str:
    digest = hashlib.sha256(f"{prefix}:{source}".encode("utf-8")).digest()
    value = int.from_bytes(digest[:9], "big")
    encoded = ""
    while value:
        value, idx = divmod(value, len(ALPHABET))
        encoded = ALPHABET[idx] + encoded
    return f"{prefix}_{encoded.rjust(11, '0')[-11:]}"


def sport_id(sport_code: str) -> str:
    return SPORT_IDS.get(sport_code.upper(), f"s_{sport_code.lower()[:3].ljust(3, 'x')}")
