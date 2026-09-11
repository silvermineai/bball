# Historical football player archive

The player index now covers 2010–2026, while the defense/specialist notebook remains on its existing event editions. This release adds 48 attributed bulk files for 2010–2017 to the previously archived 42 files for 2018–2024: player box scores, passing, rushing, receiving, defensive events and specialist events. The 2010–2024 raw records are retained in Cloudflare D1 and archived with their receipts in private R2; the current 2025 and partial 2026 editions remain part of the active football warehouse. No forecasts, model coefficients, betting observations or prospective registrations are regenerated.

The cross-season career index at `/football/careers/` groups the generated season indexes by positive source athlete ID. It preserves every season/team trail, category-specific EPA totals, plays, yards, touchdowns and best source rank. Passing, rushing, receiving and event categories are kept separate; the index does not infer transfers, eligibility or a composite player value. The 55,409-player index is published as a small manifest plus 12 JSON chunks so each deployable asset stays below Cloudflare's 25 MiB limit; the browser validates and merges all chunks before rendering.

## Player coverage

| Season        | Raw box rows | Games with box rows | Athlete/program records | Team placeholder entries excluded |
| ------------- | -----------: | ------------------: | ----------------------: | --------------------------------: |
| 2010          |       32,438 |                 808 |                   4,890 |                                 0 |
| 2011          |       31,999 |                 805 |                   4,842 |                                 0 |
| 2012          |       32,681 |                 841 |                   5,010 |                                 0 |
| 2013          |       33,609 |                 855 |                   5,254 |                                 0 |
| 2014          |       34,091 |                 870 |                   5,371 |                                74 |
| 2015          |       33,938 |                 873 |                   5,333 |                                58 |
| 2016          |       40,719 |                 875 |                   7,006 |                               176 |
| 2017          |       40,016 |                 877 |                   6,736 |                               176 |
| 2018          |       40,131 |                 887 |                   6,930 |                               189 |
| 2019          |       39,436 |                 891 |                   6,845 |                               172 |
| 2020          |       25,715 |                 571 |                   5,107 |                               128 |
| 2021          |       44,043 |                 891 |                   8,529 |                               209 |
| 2022          |       40,598 |                 900 |                   7,552 |                               229 |
| 2023          |       57,239 |                 911 |                   9,441 |                               232 |
| 2024          |       78,993 |                 965 |                  12,314 |                               219 |
| 2025          |       80,498 |                 958 |                  12,638 |                               212 |
| 2026, partial |        7,059 |                  97 |                   5,664 |                                68 |

The combined index contains 119,462 athlete/program/season records and 693,203 raw box rows. The career browser resolves these records to 55,409 positive source athlete IDs. These are not unique people, current rosters or verified transfers. Box rows include category records, so one athlete can have several rows in one game. Source coverage varies by season, division and statistical category; it is not a national completeness claim. The catalog also reports completed schedule entries across all imported divisions, which is a broader sample than the player boxes.

This import also fixes a pre-existing identity issue: the publisher uses negative IDs labeled `Team` for team-attributed plays. These records remain in the raw warehouse and source archive but are excluded from athlete lists, profile links and player rankings. Exclusions affect all 17 published indexes, including 2025 and partial 2026. Positive source IDs retain their exact stat-season program identities. The source's offensive qualification rule remains FBS, with at least 100 passing plays, 50 rushing plays or 30 receiving plays; ranks are recomputed among the remaining valid athlete records.

The importer validates positive team IDs, season consistency, exact game/participant joins, required columns and duplicate identities before mutation. Athlete identifiers must be positive numeric IDs, except recognized negative `Team` placeholders (including the older `- Team` spelling), which are retained explicitly. The 2010–2024 inputs contain no missing game context or duplicate player/team/category keys. A failing validation stops the import before changing the warehouse.

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

Every receipt's dataset, season, canonical source URL and SHA-256 must match its cached payload. Thirty schedule/directory receipts are pinned as dependencies. All 90 historical inputs must be present and validated together. Staging uses a copy of the football warehouse; local activation changes only these dataset/season scopes in one transaction. Existing source rows outside those scopes and model/market/prediction tables remain untouched.

Offensive EPA, success rate and yards-per-play values remain publisher measures, not recomputed estimates. They can use different denominators—for example passing EPA may include dropback context—and overlapping passing/receiving credit must not be summed. Unmapped box columns retain their raw names. This release does not infer a universal `stat_1` mapping or fabricate unavailable fields.

## Storage and reproducibility

`ncaa_scraper.football_player_history` writes the new raw scopes to `.local/football.sqlite3`, generates the 17 athlete-only `players-<year>.json` indexes and publishes `/data/football/player-catalog.json`. It also publishes the career manifest and its 12 chunk files under `/data/football/player-careers*.json`. The catalog contains per-season file hashes, coverage, exclusion counts, qualification definitions and source receipts. Its edition is content-addressed. The frontend verifies the complete season index bytes against the catalog before displaying them; mismatched releases expose a reload error. Failed downloads can be retried.

The ignored `.local/football-player-history/manifest.json` pins all 90 raw SQL files, dependencies, public indexes, catalog and three Python implementations. Each SQL statement is checked below 95 KB. `sync-football-player-history.py` checks these files against the local warehouse and raw cache, bundles the sources, dependencies, SQL, public artifacts and implementation into a deterministic tar, compresses it as a deterministic `.tar.gz` under Wrangler's 300 MiB upload limit, uploads it to R2 and downloads it to verify its SHA-256. D1 imports operate one reviewed dataset/season at a time; a bulk import is not an atomic multi-season publication. Site deployment follows successful import and verification. Reruns read actual remote rows and receipts and skip already-matching scopes.

The football player board exposes the same verified source bundle at `/api/football/player-history/source`. The endpoint reads the active D1 archive pointer, serves the content-addressed tar or compressed tar from private R2, returns its SHA-256 as the ETag and refuses malformed or missing pointers. The archive is a reproducibility handoff containing raw releases, dependency receipts, replay SQL, implementations and generated public artifacts; the paginated player browser remains the normal research view.

Every D1 raw record is compared with its complete local tuple using bounded 3,000-row reads, not counts alone. The synchronizer then registers the independent `football-player-history` artifact manifest, verifying staged and active payloads before cleanup. This manifest and the public catalog describe this player release separately from older forecast-era artifact snapshots. Existing source history remains recoverable from the content-addressed R2 bundle.

Catalog edition: `aba40ed4c64de73e7d3ab65e68b8fb6d33fefccb1aa0d530e113bd3581944321`.
Verified source bundle: `bball-research/football/player-history/43a134c9ee6b4dafcce75af604c5c3c69c5e35975e0beafedc460f5860b0920a.tar.gz`.

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

`scripts/publish-football-player-history.py` runs that sequence; `--refresh` conditionally rechecks the 90 historical files. The full football publisher also builds, tests and syncs this release. Source schedules and directories must already match the intended historical edition; the synchronizer stops when remote dependencies disagree. Do not start another import while a previous process is running. A timeout while observing a process does not establish that it stopped.

## Validation

Three new Python tests cover all-or-nothing input validation, cache/receipt integrity, malformed IDs, duplicate rejection, source-scope bounds, preservation of team placeholders, athlete-only rankings and exact SQL replay. The existing football suite also passes. Two frontend tests verify all 17 file hashes, coverage, positive identities, ranking cohorts and mixed-edition rejection.

An independent audit reconciles all 900,713 retained 2010–2024 raw rows and all 119,462 athlete/program/season records against their exact source records. It verifies every category rank and checks all pre-existing warehouse rows outside the 90 scopes, plus unrelated public assets, for preservation. The event audit checks every raw field, missing-value count and game/opponent join across all 57,909 event records.

Browser verification covers 17 historical category leaders, three complete source-backed player-log responses, all six new event editions, season URLs and back-links, raw fields, source downloads, empty/error states and desktop/mobile layouts. Production verification additionally checks D1 rows and receipts, live event editions, API responses and public asset hashes.

Source references: [SportsDataverse release store and license declaration](https://github.com/sportsdataverse/sportsdataverse-data), [D1 import/export behavior](https://developers.cloudflare.com/d1/best-practices/import-export-data/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
