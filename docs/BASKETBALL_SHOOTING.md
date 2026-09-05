# Basketball shooting evidence

`/basketball/shooting/` combines program/player selection, a court map, shot-type breakdowns, event inspection and game-level coverage. It defaults to field-goal samples that reconcile with box scores. Historical affiliations are not current availability claims.

## Imported edition

The 2026 season-ending SportsDataverse release contains 2,915,731 play-by-play events across 6,275 games. The corresponding completed schedule has 6,300 games. Normalization accepts 738,233 field-goal attempts and retains 700 without a shooter ID in team evidence; 14 potential attempts have unresolved team/event identities and are excluded. Other events remain in the archived source.

The data covers 721 observed programs and 9,312 shooter identities, including opponents outside the 366-program model field. It is not a verified Division I membership roster. Of 12,550 team-game samples, 12,367 match all four box-score counts. Of 113,675 player-game samples, 111,293 pass both player and team reconciliation.

## Identity, outcomes and coverage

- IDs remain strings, including event IDs too large for JavaScript's exact integer range. No player is created from name matching.
- A field-goal event requires an explicit shooting flag, supported field-goal type, team identity and made/missed flag. Attempt values of zero are recovered only from the explicit score-value field, which records attempted value even on misses. Conflicting values are excluded.
- Free throws are not included in field-goal shooting rates. Layups, dunks, tips and jumpers use source event labels; they are not inferred play calls or tracking categories.
- Exact duplicates count once. Conflicting duplicate event payloads disqualify the game's reconciled sample; the original release remains archived.
- Reconciliation requires FGA, FGM, 3PA and 3PM to agree exactly. Player reconciliation additionally requires the team sample to match. Missing box fields never become zero. Matching totals cannot verify event ordering or location accuracy.
- All imported attempts remain inspectable by clearing the matched-games filter. Counts explain how many shot-game samples match and how many corresponding box-score games exist. A player with multiple recorded affiliations retains all games under the same source identity.

## Court locations

The publisher documents raw coordinates relative to a basket at `(25, 0)`. The diagram places the baseline 5.25 feet behind that origin. The map omits positions outside the court, placeholders at `(25, 0)` or `(0, 0)`, three-point positions within 20 feet, layup/dunk/tip positions over ten feet, and positions differing from an explicitly stated distance by over four feet. It does not correct coordinates or manufacture missing locations.

There are 733,313 accepted locations, 2,276 inconsistent locations and 2,644 placeholders in this edition. Beyond-half-court attempts remain in percentages while being omitted from the half-court drawing. Source coordinates are approximate and should not be treated as optical tracking. The filters are conservative heuristics, not proof of shot location.

FG% is makes divided by attempts; eFG% adds half a made three-pointer to the numerator. Field-goal points per attempt excludes free throws. Filters apply to all three summaries and the event table; unavailable coordinates affect the map only.

## Cloudflare storage and refresh

The original Parquet file and its receipt are stored in the private R2 bucket `bball-research` under `basketball/pbp/2026/<sha256>`. Source download URLs, timestamps, license attribution and content hashes are retained. Direct ESPN/NCAA requests remain disabled under the existing source policy.

D1 migration `0011_basketball_shooting.sql` adds versioned shot chunks, entity summaries and the active source pointer. Event arrays are split into at most 100 shots per row. The read-only shooting API selects the active edition and filters source IDs exactly. It does not modify the forecast ledger.

The edition fingerprint includes the PBP hash, schedule/team-box/player-box hashes and calculation version. New chunks and profiles are imported before the active pointer is updated in the final batch. Old editions remain available in storage; a failed early batch cannot activate a partial new edition. Export manifests prevent accidentally mixing SQL batches and public catalogs.

```bash
# Build using the current cached source and generate bounded SQL batches.
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_shooting --sql

# Full source refresh, validation, Cloudflare sync and site deployment.
.venv/bin/python scripts/publish-shooting.py
```

`publish-basketball.py` also refreshes shooting evidence after refreshing the underlying box scores. The R2 bucket must already exist. No automated recurring refresh is installed yet.

Python tests cover made/missed semantics, exact IDs, attempt-value fallback, missing shooters, coordinate guards, reconciliation and cache integrity. Frontend tests verify that missing locations and long attempts remain in shooting denominators. Worker tests cover input validation, active-edition selection, absent profiles and exact athlete filtering across games.

Sources: [SportsDataverse releases](https://github.com/sportsdataverse/sportsdataverse-data), [publisher coordinate code](https://github.com/sportsdataverse/hoopR/blob/main/R/espn_mbb_data.R). The publisher labels datasets CC BY 4.0; Silvermine adds normalization, audits and derived statistics.
