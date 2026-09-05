# Football efficiency desk

`/football/efficiency/` compares team production across 12 measures, with the opposing offense from the same game serving as the defense's allowed production. The September 2026 release now covers five source seasons and 7,370 team-game records, all with paired opponent rows:

| Season | Team-game records | Games | Represented teams | Schedule-labeled FBS teams |
|---|---:|---:|---:|---:|
| 2022 | 1,722 | 861 | 230 | 131 |
| 2023 | 1,806 | 903 | 227 | 133 |
| 2024 | 1,892 | 946 | 235 | 134 |
| 2025 | 1,912 | 956 | 236 | 136 |
| 2026 (partial) | 38 | 19 | 38 | 31 |

Representation does not establish complete game coverage or a roster census. Six 2022 all-star squads have no schedule division and remain in the full archive as unknown.

The desk defaults to 2025 and FBS opponents. Users can change season, opponent sample, both comparison teams, the board's team division, minimum covered games, search, metric, ordering side and direction. Filters persist in the URL. Every comparison includes four columns: each offense and what the other team allowed. Program selection and sorting do not create a prospect grade or opponent-adjusted ranking. Future game previews link to the corresponding comparison when both programs have 2025 data.

## Sources and definitions

The builder reads existing `.local/football.sqlite3` through a read-only connection. It makes no network requests. The underlying releases are attributed to [SportsDataverse](https://github.com/sportsdataverse/sportsdataverse-data), which labels its datasets CC BY 4.0. The original rows and source receipts are already retained in Cloudflare D1's `football_stats` and `football_sources` tables. No direct ESPN or NCAA fetching is added.

The release's observed grain is one team per game, despite the loader's introductory season-level description. Both source `game_id` and `pos_team_id` must match a scheduled participant and season. Duplicate team-game identities stop publication. Opponents are joined by game and team IDs; names never establish the join. Every original source field survives in downloadable profile evidence, including unfamiliar fields and original week numbers.

Field definitions were checked against the [cfbfastR loader source](https://github.com/sportsdataverse/cfbfastR/blob/master/R/load_espn_cfb.R), retrieved September 5, 2026, SHA-256 `681927bee091da446e3128a53869b200b8e8752628c292606c13315d7a7e78c7`. We publish brief independent definitions with explicit numerator and denominator keys. We do not infer undocumented thresholds. In particular:

- `EPA_explosive` is a play count. Our explosive share is that count divided by `scrimmage_plays`; it is not an EPA total, a fixed-yardage definition or a guarantee of reproducing every publisher rate.
- EPA per play divides `EPA_overall_off` by `scrimmage_plays`. Source EPA totals already contain rounding. Special-teams EPA is separate.
- First-down play share is not standard down-and-distance success rate.
- Power-rush conversion divides successful power attempts by power attempts. Zero opportunities produce an unavailable rate, not zero percent.
- Stuffed-rush share uses `rushing_stuff`; a lower offensive rate means fewer carries were stuffed. The defensive perspective reverses that interpretation.
- Line yards retain the source allocation and are not individual blocking grades.
- Offensive yards use `off_yards`, which need not equal passing plus rushing yardage.
- Logs use schedule dates and season phase. Postseason week numbers can restart; Week 1 does not always mean the season opener. Displayed calendar dates are UTC.

## Aggregation and coverage

Each metric is a ratio of summed numerators to summed matching denominators, using `math.fsum`. The builder includes only finite pairs with a positive denominator and records their game count. It never averages rounded game rates. Missing values and negative EPA remain distinct from measured zero. Per-metric denominators and game counts appear next to every displayed rate.

Season summaries include scored, completed games only. Any unfinished source row remains in downloadable evidence and is labeled excluded in the log. Defensive samples require the opponent's row; a missing opponent never becomes zero production. FBS-only samples restrict opponent division from that game's schedule. The separate board division filter restricts displayed teams, not their opponents.

Coverage compares advanced rows against scored finals in the imported schedule. Missing game IDs, dates and opponents are listed for each team and sample. This is an audit of the imported schedule, not an independently verified census. Teams without any advanced rows are outside this release. The 2026 sample is explicitly partial. These unadjusted descriptive features do not change score forecasts, probability calibration or research-ledger registrations, and should not be interpreted as current depth-chart strength.

## Assets and Cloudflare

`ncaa_scraper.football_efficiency` writes a comparison index at `/data/football/efficiency.json` and 966 content-addressed team-season profiles under `/data/football/efficiency/profiles/<sha256>.json`. A profile contains its full game logs, original own/opponent rows, computed game rates, season summaries and source receipts. The hash is SHA-256 over the compact sorted-key JSON before its final newline. Published content-addressed profiles are retained when later editions are built.

The index edition covers metric definitions, implementation hash, source receipts and every profile hash. The client fetches only the selected Team A profile and verifies its SHA-256, team ID and season before rendering. Aborted/stale requests cannot overwrite a new selection. Download and integrity failures produce a retryable message. No credentials enter the frontend.

`scripts/sync-football-efficiency.py` reconstructs and checks every public artifact, checks the corresponding remote D1 source SHA-256 receipts, then records a verified file-hash manifest in `football_artifacts` under `football-efficiency`. The expanded manifest exceeds D1’s per-statement SQL limit. Registration writes bounded chunks into a unique inactive staging row, verifies the full reconstructed JSON, then atomically copies it into the active manifest row. Staging is removed after active-row verification; a partial write never becomes the active manifest. Tests exercise payloads with Unicode and SQL quotes and concurrent staging names. Manifest registration uses the real current timestamp; it is not an as-of training snapshot. The files themselves are served by Cloudflare Workers Assets. The regular football publisher now builds, tests and registers these assets along with its existing pipelines.

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_efficiency
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p test_football_efficiency.py
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/sync-football-efficiency.py
.venv/bin/python scripts/cloudflare.py deploy
```

Verification includes independent reconciliation of all 1,950 raw rows, paired opponents, schedule coverage, content hashes and 13,152 season rates. Tests cover weighted rates, missing/zero/negative values, no-opportunity samples, missing opponents, nonfinal exclusions, duplicate/incorrect identities, null-last sorting and failed/mismatched downloads. Browser QA covers both opponent samples, team swaps, filtering/sorting, source expansion, season changes, URL reload, error recovery and mobile layout.


## Historical source expansion

The 2022–2024 expansion adds 5,420 advanced team-game rows and 2,522 team-directory rows from six publisher releases. The publisher's [raw README](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-data/main/README.md) still displays its CC BY 4.0 dataset badge when checked on September 5, 2026. Its separate MIT software license is not substituted for the stated dataset attribution.

`football_history.py` downloads through the existing identified, paced, conditional release client, then verifies cached bytes against each source receipt and validates dataset, season, directory identity, metric schema and every advanced game/team join. All six sources must validate before mutation. A staging database builds the complete efficiency release before an atomic local update activates only the six historical snapshots. The existing schedule editions are retained. Full regular football refreshes now also retrieve historical team directories and advanced rows alongside their schedules.

Historical team directories label six 2022 all-star squads as FBS despite missing schedule divisions. The builder therefore derives each team's division from the nonempty labels on that season's schedule. One unique label is used; missing or conflicting labels yield unknown. This matches the source used for opponent division filtering. It does not infer conference membership or independently establish division status. The raw directory records remain available in D1 and R2. The 2025 and 2026 team profiles remain byte-for-byte unchanged.

`sync-football-history.py` verifies implementation hashes, public artifacts, cached releases and regenerated SQL before uploading a deterministic R2 bundle at `bball-research/football/history/<sha256>.tar`. The archive includes original CSVs, source receipts, schedule receipts, scoped SQL and Python implementations. An R2 download must match the upload's SHA-256. D1 synchronization then replaces only the specified historical dataset/year snapshots, preserving existing schedules, player datasets, market observations, model versions and forecast registrations. Every returned D1 row and source receipt is compared with the local snapshot. A rerun checks existing contents before deciding whether an import is necessary.

The ignored `.local/football-history/manifest.json` binds the six SQL files, their source receipts and counts, implementation hashes and efficiency artifact hashes. `sync-football-efficiency.py` subsequently verifies remote source receipts and records the expanded public manifest. The [standalone publisher](../scripts/publish-football-history.py) runs tests, builds the frontend, archives/synchronizes sources, registers the artifact manifest and deploys. It does not train a forecast model or create prospective observations.

```sh
# Cached source rebuild; add --refresh to conditionally recheck the six files.
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_history
.venv/bin/python scripts/publish-football-history.py
```

Historical collection timestamps remain the actual 2026 retrieval times. These releases can support retrospective feature research, but they do not prove what statistics were available before historical games. No advanced-feature model is promoted by this import.

Expansion verification reconciles all 7,370 rows and their opponent joins, checks 46,368 pooled season rates independently, and confirms preservation of every preexisting database snapshot outside the six intended scopes plus 1,061 prior public artifacts. Four new importer tests cover bad-identity rejection before mutation, SQL replay, repeat-import stability, scope guards, source hash/season checks and the all-star division case.

The historical release passed 29 football Python tests, 39 frontend tests, the combined production build and the Cloudflare deployment dry run. Browser checks reconcile 288 comparison cells across the three added seasons and exercise source logs, conference changes, URL restoration, all-star filtering and mobile layout.
