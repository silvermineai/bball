# NCAA player impact archives

The native [`/basketball/impact/`](/basketball/impact/) board shows the attributed NCAA league-wide stint RAPM release. [`/basketball/impact/within-team/`](/basketball/impact/within-team/) adds the separate within-team RAPM release, which estimates a player's contribution relative to teammates in the same team model.

The within-team archive covers season-ending years 2010–26, with 67,554 source player/team rows across 17 editions. Each row retains the publisher's team, player code, NCAA player ID, team ID, person ID, offensive RAPM, defensive RAPM, net RAPM, team offensive possessions and number of modeled players. A default 500-possession filter is shown in the UI; lower thresholds remain available for research.

Within-team RAPM is not a recruiting grade, transfer valuation or forecast feature. The source release supplies a team offensive-possession sample rather than a separate defensive-possession field, so the UI labels the qualifying denominator precisely. Player and team IDs remain source-native and are never joined to ESPN identities by name. The league-wide and within-team boards are separate evidence products.

The importer downloads the publisher's Parquet releases through the shared conditional-cache client, retains retrieval receipts and SHA-256 hashes, writes compact season derivatives to `frontend/public/data/basketball/`, and archives every raw Parquet file plus receipt in R2 under `basketball/impact-within-team/<season>/<sha256>`. Rebuild with:

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_within_impact
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_basketball_within_impact.py'
PYTHONPATH=ncaa_scraper .venv/bin/python scripts/sync-within-impact.py
```

The publication is labeled CC BY 4.0 by SportsDataverse. Silvermine preserves source labels and reports the release's descriptive estimates without presenting them as a proprietary model or an eligibility conclusion.
