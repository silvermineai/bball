# Historical football player archive

The player index now covers 2018–2026, while the defense/specialist notebook remains on its existing event editions. This release adds 24 attributed bulk files for 2018–2021 to the previously archived 18 files for 2022–2024: player box scores, passing, rushing, receiving, defensive events and specialist events. The 2018–2024 raw records are retained in Cloudflare D1 and archived with their receipts in private R2. No forecasts, model coefficients, betting observations or prospective registrations are regenerated.

## Player coverage

| Season        | Raw box rows | Games with box rows | Athlete/program records | Team placeholder entries excluded |
| ------------- | -----------: | ------------------: | ----------------------: | --------------------------------: |
| 2018          |       40,131 |                 887 |                   6,930 |                               189 |
| 2019          |       39,436 |                 891 |                   6,845 |                               172 |
| 2020          |       25,715 |                 571 |                   5,107 |                               128 |
| 2021          |       44,043 |                 891 |                   8,529 |                               209 |
| 2022          |       40,598 |                 900 |                   7,552 |                               229 |
| 2023          |       57,239 |                 911 |                   9,441 |                               232 |
| 2024          |       78,993 |                 965 |                  12,314 |                               219 |
| 2025          |       80,498 |                 958 |                  12,638 |                               212 |
| 2026, partial |        6,733 |                  93 |                   5,418 |                                63 |

The combined index contains 74,774 athlete/program/season records and 413,386 raw box rows. These are not unique people, current rosters or verified transfers. Box rows include category records, so one athlete can have several rows in one game. Source coverage varies by season, division and statistical category; it is not a national completeness claim. The catalog also reports completed schedule entries across all imported divisions, which is a broader sample than the player boxes.

This import also fixes a pre-existing identity issue: the publisher uses negative IDs labeled `Team` for team-attributed plays. These records remain in the raw warehouse and source archive but are excluded from athlete lists, profile links and player rankings. Exclusions affect all nine published indexes, including 2025 and partial 2026. Positive source IDs retain their exact stat-season program identities. The source's offensive qualification rule remains FBS, with at least 100 passing plays, 50 rushing plays or 30 receiving plays; ranks are recomputed among the remaining valid athlete records.

The importer validates positive team IDs, season consistency, exact game/participant joins, required columns and duplicate identities before mutation. Athlete identifiers must be positive numeric IDs, except recognized negative `Team` placeholders (including the older `- Team` spelling), which are retained explicitly. The 2018–2024 inputs contain no missing game context or duplicate player/team/category keys. A failing validation stops the import before changing the warehouse.

## Defensive and specialist coverage

| Season        | Defensive event rows | Specialist event rows |
| ------------- | -------------------: | --------------------: |
| 2022          |                4,839 |                 8,633 |
| 2023          |                4,867 |                 7,888 |
| 2024          |                5,547 |                 9,347 |
| 2025          |                7,925 |                 8,518 |
| 2026, partial |                  196 |                   149 |

All 57,909 event rows match their source game and participant IDs. These are name-attributed source events, not unique athletes. They have no stable athlete ID and are never attached to player profiles through name matching. Each raw row and field remains available through the existing event notebook, with missing values, negative yardage and fractional sacks preserved. An ID join validates source context, not the factual correctness of every publisher name or team label.

The event builder retains immutable editions; the four existing 2025/2026 editions remain unchanged and six historical editions are added. The notebook's existing field definitions and limitations still apply. Event counts do not establish complete tackle totals, defensive snaps, field-goal accuracy or complete return opportunities.

## Source policy and integrity

The files come from SportsDataverse's public release store, whose README labels the datasets CC BY 4.0. Attribution, license URL and the aggregation changes are retained in source receipts. Source metadata was rechecked before import. Downloads use the established identified, single-request-at-a-time client, conditional caching, bounded retries and immediate stops on access-denied responses. No direct ESPN or NCAA extraction is enabled.

Every receipt's dataset, season, canonical source URL and SHA-256 must match its cached payload. Fourteen schedule/directory receipts are pinned as dependencies. All 42 historical inputs must be present and validated together. Staging uses a copy of the football warehouse; local activation changes only these dataset/season scopes in one transaction. Existing source rows outside those scopes and model/market/prediction tables remain untouched.

Offensive EPA, success rate and yards-per-play values remain publisher measures, not recomputed estimates. They can use different denominators—for example passing EPA may include dropback context—and overlapping passing/receiving credit must not be summed. Unmapped box columns retain their raw names. This release does not infer a universal `stat_1` mapping or fabricate unavailable fields.

## Storage and reproducibility

`ncaa_scraper.football_player_history` writes the new raw scopes to `.local/football.sqlite3`, generates the nine athlete-only `players-<year>.json` indexes and publishes `/data/football/player-catalog.json`. The catalog contains per-season file hashes, coverage, exclusion counts, qualification definitions and source receipts. Its edition is content-addressed. The frontend verifies the complete index bytes against the catalog before displaying them; mismatched releases expose a reload error. Failed downloads can be retried.

The ignored `.local/football-player-history/manifest.json` pins all 42 raw SQL files, dependencies, public indexes, catalog and three Python implementations. Each SQL statement is checked below 95 KB. `sync-football-player-history.py` checks these files against the local warehouse and raw cache, verifies remote dependency receipts, bundles the sources, dependencies, SQL, public artifacts and implementation into a deterministic tar, uploads it to R2 and downloads it to verify its SHA-256. D1 imports operate one reviewed dataset/season at a time; a bulk import is not an atomic multi-season publication. Site deployment follows successful import and verification. Reruns read actual remote rows and receipts and skip already-matching scopes.

Every D1 raw record is compared with its complete local tuple using bounded 3,000-row reads, not counts alone. The synchronizer then registers the independent `football-player-history` artifact manifest, verifying staged and active payloads before cleanup. This manifest and the public catalog describe this player release separately from older forecast-era artifact snapshots. Existing source history remains recoverable from the content-addressed R2 bundle.

Catalog edition: `ba3c09f3ea338d8318f7194095ce7c7a3c923b22044e5c8ac2480ebc31a253f5`.
Verified source bundle: `bball-research/football/player-history/7d1a55ec252ff75a200582e3abdc60eb62d428f661225c786a14b21dbaee5e9e.tar`.

## Publish and refresh

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_player_history
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_events --sql .local/football-events.sql
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_football*.py'
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/cloudflare.py deploy --dry-run
.venv/bin/python scripts/sync-football-player-history.py
.venv/bin/python scripts/sync-football-events.py
.venv/bin/python scripts/cloudflare.py deploy
```

`scripts/publish-football-player-history.py` runs that sequence; `--refresh` conditionally rechecks the 42 historical files. The full football publisher also builds, tests and syncs this release. Source schedules and directories must already match the intended historical edition; the synchronizer stops when remote dependencies disagree. Do not start another import while a previous process is running. A timeout while observing a process does not establish that it stopped.

## Validation

Three new Python tests cover all-or-nothing input validation, cache/receipt integrity, malformed IDs, duplicate rejection, source-scope bounds, preservation of team placeholders, athlete-only rankings and exact SQL replay. The existing football suite also passes. Two frontend tests verify all nine file hashes, coverage, positive identities, ranking cohorts and mixed-edition rejection.

An independent audit reconciles all 458,419 retained 2018–2024 raw rows and all 74,774 athlete/program/season records against their exact source records. It verifies every category rank and checks all pre-existing warehouse rows outside the 42 scopes, plus unrelated public assets, for preservation. The event audit checks every raw field, missing-value count and game/opponent join across all 57,909 event records.

Browser verification covers nine historical category leaders, three complete source-backed player-log responses, all six new event editions, season URLs and back-links, raw fields, source downloads, empty/error states and desktop/mobile layouts. Production verification additionally checks D1 rows and receipts, live event editions, API responses and public asset hashes.

Source references: [SportsDataverse release store and license declaration](https://github.com/sportsdataverse/sportsdataverse-data), [D1 import/export behavior](https://developers.cloudflare.com/d1/best-practices/import-export-data/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
