# Basketball shooting evidence

`/basketball/shooting/` combines program/player selection, a season-aware court map, shot-type breakdowns, event inspection and game-level coverage. It defaults to field-goal samples that reconcile with box scores. Historical affiliations are not current availability claims.

## Imported edition

The catalog includes the 2024, 2025 and 2026 season-ending SportsDataverse releases: 7,110,829 play-by-play events across 18,561 source games and 2,172,183 accepted field-goal attempts. The 2024 release contains 2,004,997 events and 720,123 accepted attempts; the 2025 release contains 2,190,101 events and 713,827 accepted attempts; the 2026 release contains 2,915,731 events and 738,233 accepted attempts. Each season retains its own source receipt, edition and reconciliation counts. The 2024 release predates `points_attempted`, so normalization falls back to its explicit `score_value` field.

The 2024 edition covers 713 observed programs and 9,195 shooter identities; 10,345 of 12,302 team-game samples and 92,370 of 110,427 player-game samples reconcile. The 2025 edition covers 682 observed programs and 8,864 shooter identities; 10,584 of 12,270 team-game samples and 94,811 of 110,461 player-game samples reconcile. The 2026 edition covers 721 programs and 9,312 shooter identities; 12,367 of 12,550 team-game samples and 111,293 of 113,675 player-game samples reconcile. These are not verified Division I membership rosters.

## Identity, outcomes and coverage

- IDs remain strings, including event IDs too large for JavaScript's exact integer range. No player is created from name matching.
- A field-goal event requires an explicit shooting flag, supported field-goal type, team identity and made/missed flag. Missing or zero attempt values are recovered only from the explicit score-value field, which records attempted value even on misses. Conflicting values are excluded.
- Free throws are not included in field-goal shooting rates. Layups, dunks, tips and jumpers use source event labels; they are not inferred play calls or tracking categories.
- Exact duplicates count once. Conflicting duplicate event payloads disqualify the game's reconciled sample; the original release remains archived.
- Reconciliation requires FGA, FGM, 3PA and 3PM to agree exactly. Player reconciliation additionally requires the team sample to match. Missing box fields never become zero. Matching totals cannot verify event ordering or location accuracy.
- All imported attempts remain inspectable by clearing the matched-games filter. Counts explain how many shot-game samples match and how many corresponding box-score games exist. A player with multiple recorded affiliations retains all games under the same source identity.

## Court locations

The publisher documents raw coordinates relative to a basket at `(25, 0)`. The diagram places the baseline 5.25 feet behind that origin. The map omits positions outside the court, placeholders at `(25, 0)` or `(0, 0)`, three-point positions within 20 feet, layup/dunk/tip positions over ten feet, and positions differing from an explicitly stated distance by over four feet. It does not correct coordinates or manufacture missing locations.

The 2024 edition has 45,336 accepted locations, 11 inconsistent locations and 144 placeholders; the 2025 edition has 185,695 accepted locations, 477 inconsistent locations and 6,228 placeholders; the 2026 edition has 733,313 accepted locations, 2,276 inconsistent locations and 2,644 placeholders. Beyond-half-court attempts remain in percentages while being omitted from the half-court drawing. Source coordinates are approximate and should not be treated as optical tracking. The filters are conservative heuristics, not proof of shot location.

FG% is makes divided by attempts; eFG% adds half a made three-pointer to the numerator. Field-goal points per attempt excludes free throws. Filters apply to all three summaries and the event table; unavailable coordinates affect the map only.

## Cloudflare storage and refresh

Each original Parquet file and receipt is stored in the private R2 bucket `bball-research` under `basketball/pbp/<season>/<sha256>`. Source download URLs, timestamps, license attribution and content hashes are retained. Direct ESPN/NCAA requests remain disabled under the existing source policy.

D1 migration `0011_basketball_shooting.sql` adds versioned shot chunks, entity summaries and the active source pointer. Event arrays are split into at most 100 shots per row. The read-only shooting API selects the active edition and filters source IDs exactly. It does not modify the forecast ledger.

The edition fingerprint includes the PBP hash, schedule/team-box/player-box hashes and calculation version. New chunks and profiles are imported before the active pointer is updated in the final batch. Old editions remain available in storage; a failed early batch cannot activate a partial new edition. Export manifests prevent accidentally mixing SQL batches and public catalogs.

```bash
# Build using the current cached source and generate bounded SQL batches.
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_shooting --seasons 2024 2025 2026 --sql

# Full source refresh, validation, Cloudflare sync and site deployment.
.venv/bin/python scripts/publish-shooting.py
```

`publish-basketball.py` also refreshes shooting evidence after refreshing the underlying box scores. The R2 bucket must already exist. The weekly `.github/workflows/refresh-research.yml` job runs the combined publication and can be dispatched manually for a source correction.

Python tests cover made/missed semantics, exact IDs, attempt-value fallback, missing shooters, coordinate guards, reconciliation and cache integrity. Frontend tests verify that missing locations and long attempts remain in shooting denominators. Worker tests cover input validation, active-edition selection, absent profiles and exact athlete filtering across games.

Sources: [SportsDataverse releases](https://github.com/sportsdataverse/sportsdataverse-data), [publisher coordinate code](https://github.com/sportsdataverse/hoopR/blob/main/R/espn_mbb_data.R). The publisher labels datasets CC BY 4.0; Silvermine adds normalization, audits and derived statistics.
