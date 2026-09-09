# Historical player production

`/basketball/players/` searches annual production from 24 published box-score seasons, ending 2003 through 2026. `/basketball/player/?id=32284&season=2009` opens a source identity's historical record with season selection, program-level production, interactive development comparisons and complete retained game logs. The player index preserves season, search, sort, qualification and page controls in the URL and provides a copy-link action for sharing an exact ranking slice. Existing links from program dossiers, recruiting and shooting profiles continue to use the same route.

## What the archive contains

The initial import contains 3,676,531 source rows, of which 3,676,397 have valid player/game/team identities. There are 98,830 distinct **source IDs**, not a verified count of unique people; 164,617 player/program/season entries have recorded minutes. The retained logs include 2,484,664 eligible playing appearances and 1,168,098 explicitly reported DNP rows. Other rows may have no positive minutes or missing fields. The 134 rows missing required identities remain in the raw source archive and coverage counts; they are not assigned fabricated identities.

Coverage is not uniform. Season-ending 2003 has one game with player boxes; 2004 has eleven. Across the archive, 124,171 games have recorded playing appearances against 136,848 completed schedule entries. Those denominators describe these source releases, not verified national completeness. Some games include opponents outside Division I. Every annual index and player view exposes its season's coverage. The index warns when games with playing records are below 80% of completed schedule entries; this is a UI warning threshold, not an accreditation of seasons above it. The archive coverage drawer now reports all 17 retained box fields separately: source-row observations and shares, plus appearance-row observations and shares. This keeps a sparse field visible instead of silently turning it into a ranking input.

Source datasets are SportsDataverse's `espn_mens_college_basketball_player_boxscores` and `espn_mens_college_basketball_schedules` Parquet releases. The publisher describes the available seasons and labels the repository's datasets CC BY 4.0:

- https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_mens_college_basketball_player_boxscores
- https://github.com/sportsdataverse/sportsdataverse-data

The importer downloads bulk files through the existing rate-limited, conditionally cached, bounded-retry client. Cached file hashes must match their receipts. No direct ESPN or NCAA scraping is enabled. Forty-eight Parquet source files and their receipts are bundled in private R2 under a content-addressed `basketball/history/…tar` object. The first archive's upload was downloaded again and SHA-256 checked.

## Meaning of a statistic

Source player, game and team IDs must be positive numeric identities. Non-integral or unsafe floating IDs are rejected. Rows must have the requested source season. Exact duplicate player/game/team rows are counted once; conflicting duplicates stop publication. Conflicting schedule records also stop publication.

A season-summary appearance requires a matching team in a completed schedule entry, positive reported minutes, and no explicit DNP. All other identified rows remain visible in game logs. Unknown booleans stay unknown. Missing or negative numerical fields stay unavailable. Made-shot counts above attempts, threes above total field goals, and explicit DNP with positive minutes are flagged. Invalid shooting fields are withheld; unaffected fields remain usable. Three rows in the first import contain such source issues.

Each field has its own sample count. A total is available only if that field exists for every included appearance; per-game values divide that complete total by the appearance count. A missing assist field does not suppress an otherwise complete points average. eFG requires FGM, 3PM and FGA; TS requires points, FGA and FTA and uses the disclosed college coefficient 0.475. Zero denominators produce unavailable rates. Program stints are separate; a season's overall summary pools its actual appearances rather than averaging program averages. Field coverage includes recorded zeroes as observed values; null and blank source fields remain unavailable.

The production index defaults to 15 games, 400 recorded minutes and complete box fields. Stat rankings are per season and qualification setting, calculated before search. Exact ties receive competition ranks (1, 1, 3). Missing values are unranked. These are single-stat production rankings, not an overall talent grade or an opponent-adjusted player model. The historical NCAA leaderboard also supports effective field-goal, three-point and free-throw accuracy, points/rebounds/stocks per 40 minutes, assist-to-turnover ratio, turnover rate and three-point attempt rate. Each derived rate keeps its denominator rule visible and withholds zero-denominator seasons.

## Source identity caveats

Names never join separate source IDs. Conversely, a source ID alone is not infallible evidence that distant records belong to one person. The archive contains long gaps, stale DNP records and differing reported names. For example, ID 23574 has a 2005 record labeled Marcus Watson and a 2025 record labeled Marcus Watson Jr. The system does not assert that those are one career.

The API flags identity review when normalized reported names differ or a source ID spans more than eight years. Punctuation, case and diacritics are normalized only for this review flag. The UI retains each season's reported name and withholds a combined development chart for flagged identities. The eight-year span is a conservative review heuristic, not an eligibility rule. Even unflagged source identities are not independently verified NCAA crosswalks. A missing season does not establish a transfer, redshirt, absence or end to a career.

## Storage and release consistency

`basketball_careers.py` builds ignored `.local/basketball-careers.sqlite3`, public annual indexes in `frontend/public/data/basketball/history/`, and bounded SQL files under ignored `.local/careers-sql/`.

D1 migration `0013_basketball_careers.sql` adds three independent tables:

- `bb_career_profiles`: a versioned player/season summary, including separate program records.
- `bb_career_logs`: versioned log chunks of at most 40 rows.
- `bb_career_seasons`: active edition, source receipts and coverage for each season.

Each edition hashes the source file hashes, season and transformation version. Profile/log inserts are idempotent and retain old editions. Active pointers are exported last, after all new summaries and logs. SQL statements are capped below 95 KB and files below 8 MB. The first full import contains 253 files and roughly 2 GB of SQL; allow it to finish. It does not alter the existing team model, forecast snapshots, recruiting evidence, shot data or legacy tables.

`GET /api/basketball/research/careers/:id?season=2026` returns all active season profiles and the selected season's complete retained logs. The default is the latest source season for that ID. A valid season with no records for a known ID returns an explicit empty selection. Malformed parameters return 400, absent identities or unimported seasons return 404, and an edition changing between profile/source reads returns a retryable 503. Queries bind exact IDs and pin logs to the selected profile edition. When the hash-addressed static history audit names that same edition, the response also includes field-level source and appearance coverage; a mismatched or unavailable static audit is withheld rather than merged. `GET /api/basketball/research/careers/source?season=2026` streams the exact attributed player-box Parquet release for that edition from hash-addressed private R2, with the D1 receipt hash as its ETag and a matching 304 response. The player statistics desk exposes that download beside its filtered CSV. The existing `/players/:id` API remains available for publisher-computed season statistics and roster observations from the 2024–26 research tables; the native player panel now lets readers switch among those publisher-stat seasons.

Each completed-game row in the native player panel links directly to its ESPN source game. That gives coaches a one-click path from a retained player log to the underlying box score and play-by-play evidence.

## Publishing and recovery

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_careers --sql
.venv/bin/python scripts/publish-careers.py
# Recheck remote release files only when desired:
.venv/bin/python scripts/publish-careers.py --refresh
```

The publisher tests, builds and dry-runs deployment before syncing D1 and deploying. `sync-careers.py` checks catalog/SQL/source hashes, archives the raw files and records every confirmed imported batch. If that sync has actually stopped, `scripts/sync-careers.py --resume` resumes its matching checkpoint. Inspect the running process before restarting; an observation timeout does not establish that it stopped. The exporter and synchronizer hold a process lock, preventing a second run from overwriting files in use.

The archive has a standalone publisher; the main basketball publisher also rebuilds historical derivatives from the cached source files before building the site, then syncs changed historical editions before deployment. The separate historical warehouse does not feed extra seasons into the preseason model. The synchronizer reads actual remote season editions and skips a batch only when all seasons it contains already match. A fully current warehouse skips archive and SQL uploads. Annual index hashes are checked against the export manifest, and a changed local annual index is rebuilt from source rather than trusted solely by its edition label. No recurring historical job is installed. Additional statistical categories, verified identity crosswalks and dated forecast features remain separate future work.

For source seasons 2006–26, an individual player file also looks up the retained SportsDataverse player-value release by the exact career source ID and shows Box BPM, offensive BPM and defensive BPM when those fields are present. The panel is deliberately attributed and separate from the NCAA identity archive: a matching numeric key does not establish eligibility, a current roster position or a person-level crosswalk between publishers. The complete publisher model archive remains available from `/basketball/boutique/?kind=players`.

## Verification

Ten Python tests cover missing-field denominators, DNP/unmatched rows, impossible shooting values, ID/season checks, duplicate conflicts, separate program stints, source conflicts, immutable edition export, active process locks and incremental batch selection. Frontend tests cover missing chart values, identity review and stable tie rankings. Worker tests cover parameter validation, source absence and edition consistency.

An independent source audit reconciles every source row count to retained logs and aggregate appearance counts, directly recomputes selected historical players from Parquet, and compares all 9,990 current-season player/program game counts and complete scoring averages to the prior release. Local browser QA uses the real SQLite archive behind route interception and checks historical search, season URLs, source coverage, qualification, real player histories, identity warnings, game fields and mobile layout.

The first production release passed all 37 Python, frontend and Worker tests, Worker type checking, the production build and deployment dry run. Live D1 checks confirmed every active edition, profile count, identified-row total, playing-appearance total and retained game-log count across all 24 seasons. Audit log counts one season at a time to keep these large JSON aggregations bounded. The public catalog and five selected player/season API payloads matched the local audited archive, including every game-log field. The complete browser flow also passed against production, including the legacy published-statistics and roster panel. Private R2 source storage was verified by downloading the first bundle and comparing its SHA-256; a subsequent synchronization confirmed current remote editions and skipped data uploads.

## Comparing historical players

The [player comparison desk](BASKETBALL_PLAYER_COMPARISON.md) uses these same season indices and D1 profiles to compare three exact player/program/season records. It adds per-40 production, pooled shooting denominators, season-relative qualified percentiles, shareable selections and CSV export. It preserves archive editions and does not change source records or identity mappings.

The [scouting board](BASKETBALL_SCOUTING_BOARD.md) adds editable multi-stat production priorities to the same 24-season archive. Rankings retain the season-wide qualified reference group through filtering, expose every percentile contribution, and link an exact three-record shortlist into the comparison desk.
