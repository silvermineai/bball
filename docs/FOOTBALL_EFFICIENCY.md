# Football efficiency desk

`/football/efficiency/` compares team production across 12 measures, with the opposing offense from the same game serving as the defense's allowed production. The September 2026 release contains 1,912 team-game rows from 956 games in 2025 and 38 rows from 19 games in partial 2026. All current games have both team rows. There are 236 represented teams in 2025 (136 FBS) and 38 in 2026 (31 FBS). Representation does not establish complete game coverage.

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

`ncaa_scraper.football_efficiency` writes a comparison index at `/data/football/efficiency.json` and 274 content-addressed team-season profiles under `/data/football/efficiency/profiles/<sha256>.json`. A profile contains its full game logs, original own/opponent rows, computed game rates, season summaries and source receipts. The hash is SHA-256 over the compact sorted-key JSON before its final newline. Published content-addressed profiles are retained when later editions are built.

The index edition covers metric definitions, implementation hash, source receipts and every profile hash. The client fetches only the selected Team A profile and verifies its SHA-256, team ID and season before rendering. Aborted/stale requests cannot overwrite a new selection. Download and integrity failures produce a retryable message. No credentials enter the frontend.

`scripts/sync-football-efficiency.py` reconstructs and checks every public artifact, checks the corresponding remote D1 source SHA-256 receipts, then records a verified file-hash manifest in `football_artifacts` under `football-efficiency`. Manifest registration uses the real current timestamp; it is not an as-of training snapshot. The files themselves are served by Cloudflare Workers Assets. The regular football publisher now builds, tests and registers these assets along with its existing pipelines.

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_efficiency
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p test_football_efficiency.py
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/sync-football-efficiency.py
.venv/bin/python scripts/cloudflare.py deploy
```

Verification includes independent reconciliation of all 1,950 raw rows, paired opponents, schedule coverage, content hashes and 13,152 season rates. Tests cover weighted rates, missing/zero/negative values, no-opportunity samples, missing opponents, nonfinal exclusions, duplicate/incorrect identities, null-last sorting and failed/mismatched downloads. Browser QA covers both opponent samples, team swaps, filtering/sorting, source expansion, season changes, URL reload, error recovery and mobile layout.
