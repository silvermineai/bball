"""Report market connector readiness without exposing credentials.

This is an operator preflight, not a provider probe. It reports only whether
the accepted credential names are populated and which no-credential import
paths are available. It never prints a key, its length, or an environment
value.
"""

from __future__ import annotations

import json
from collections.abc import Mapping

from .cbbd_recruiting import api_key as cbbd_api_key
from .odds_feed import configured_odds_key


def market_configuration(
    environment: Mapping[str, object] | None = None,
    file_values: Mapping[str, object] | None = None,
) -> dict[str, object]:
    """Return redacted readiness for every supported market intake path."""
    odds_configured = configured_odds_key(environment, file_values) is not None
    cbbd_configured = cbbd_api_key(environment, file_values) is not None
    return {
        "connectors": [
            {
                "id": "odds_api",
                "provider": "The Odds API",
                "sports": ["football", "basketball"],
                "markets": ["h2h", "spreads", "totals"],
                "credential_status": "configured" if odds_configured else "missing",
                "credential_keys": ["THE_ODDS_API_KEY", "ODDS_API_KEY"],
                "commands": {
                    "basketball": "PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.odds_feed --sport basketball",
                    "football": "PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.odds_feed --sport football",
                },
                "next_step": "Run the bounded licensed snapshot after confirming provider terms." if odds_configured else "Set THE_ODDS_API_KEY or ODDS_API_KEY in the server environment or ~/.env.",
            },
            {
                "id": "cbbd_lines",
                "provider": "CollegeBasketballData.com API",
                "sports": ["basketball"],
                "markets": ["h2h"],
                "credential_status": "configured" if cbbd_configured else "missing",
                "credential_keys": ["CBBD_API_KEY", "COLLEGE_BASKETBALL_DATA_API_KEY"],
                "commands": {
                    "basketball": "PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.cbbd_lines --season 2027",
                },
                "next_step": "Run the pregame moneyline capture after confirming provider terms." if cbbd_configured else "Set CBBD_API_KEY or COLLEGE_BASKETBALL_DATA_API_KEY in the server environment or ~/.env.",
            },
            {
                "id": "espn_summary",
                "provider": "ESPN Summary",
                "sports": ["football", "basketball"],
                "markets": ["h2h", "spreads", "totals"],
                "credential_status": "not_required",
                "credential_keys": [],
                "commands": {
                    "basketball": "PYTHONPATH=ncaa_scraper .venv/bin/python scripts/publish-research.py --sport basketball --espn-lines",
                    "football": "PYTHONPATH=ncaa_scraper .venv/bin/python scripts/publish-research.py --sport football --espn-lines",
                },
                "next_step": "Use the bounded prospective summary capture; missing pickcenter values remain unavailable.",
            },
            {
                "id": "licensed_csv",
                "provider": "Licensed CSV export",
                "sports": ["football", "basketball"],
                "markets": ["h2h", "spreads", "totals"],
                "credential_status": "not_required",
                "credential_keys": [],
                "commands": {
                    "basketball": "PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.market_csv <file> --sport basketball --provider <name> --license-url <url>",
                    "football": "PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.market_csv <file> --sport football --provider <name> --license-url <url>",
                },
                "next_step": "Use the exact-game CSV importer with provider identity, license URL and pregame clocks.",
            },
        ],
        "policy": "No line is inferred when a credential, exact game join, licensed import, or pregame clock is missing.",
    }


def main() -> None:
    print(json.dumps(market_configuration(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
