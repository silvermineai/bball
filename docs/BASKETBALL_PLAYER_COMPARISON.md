# Basketball player comparison

`/basketball/compare-players/` compares up to three exact player/program/season records from the 24-season historical archive. It supports the same player in different seasons, or separate programs within one season, without combining those records. Entry points are the player statistics index, individual historical profiles, reviewed recruiting links and the basketball navigation.

## Data and identity

Search uses existing Cloudflare Assets at `/data/basketball/history/players-<season>.json`. Selected details use the existing D1-backed `/api/basketball/research/careers/<id>?season=<year>` endpoint. Source records, R2 archives, database schema and forecast registrations are unchanged. There is no additional scraping, external data collection or new identity inference.

Each column is keyed by season, numeric source player ID and numeric program ID. Before rendering, the client checks the season index against the catalog edition, verifies that the API and selected profile use that edition, finds the exact program summary, and reconciles its shared rates, game count, minutes and qualification with the index. Unknown program/season combinations and differing editions produce an explicit error. A failed column prevents the comparison table and export from silently showing an incomplete set. Search and selected-record requests support retry and cancellation.

The current archive has 164,617 player/program records across ending-year seasons 2003–2026. Early seasons can be extremely sparse; the interface retains the season's actual games-with-appearances and completed-schedule counts. Names are display labels, never join keys. Comparing two records with a shared source ID does not independently verify that ID's real-world identity. Historical school labels and box appearances do not establish current availability or eligibility.

## Measures

- Counting statistics divide complete recorded totals by playing appearances or scale by `40 / recorded minutes`. They include points, rebounds, assists, steals, blocks, turnovers, offensive and defensive rebounds, and fouls. Per 40 is a playing-time normalization, not pace or opponent adjustment, and does not predict a full-game workload.
- Shooting uses pooled season totals. The table exposes field-goal, three-point and free-throw makes and attempts, along with field-level game coverage. It shows eFG, estimated TS with the archive's college coefficient 0.475, FG%, two-point percentage, 3P%, FT%, three-point attempt share, free-throw attempt rate and assist/turnover ratio. Formulas are visible in the table.
- Totals require that the field be recorded in every included appearance. Missing fields invalidate affected totals and rates without removing unrelated complete statistics. Nonpositive denominators yield unavailable rates. DNPs and other non-appearances remain in source evidence but do not enter playing averages.
- No synthetic overall grade, roster projection, forecast feature or betting recommendation is generated.

## Percentile chart

Counting percentiles always use per-40 values, even when the comparison table is switched to per-game. TS and eFG use their pooled rates. Each column is compared against its own season's qualified player/program records, across all reported positions and conferences. Qualification requires at least 15 games, 400 recorded minutes and complete box fields. The selected record must qualify, and at least 30 qualified records with a valid metric must exist in that season. Otherwise its percentile is withheld.

The percentile is `100 × (number below + 0.5 × number tied) / peer count`. Numerical ties use an absolute tolerance of `1e-9 × max(1, |selected value|)`. Peers are not filtered by the search query or the other selected players. Higher values mean more of a statistic; more turnovers are not a positive grade. There is no position adjustment or era/competition normalization. Some source opponents are outside Division I. Three-point accuracy receives no percentile because the compact peer index does not provide an attempt-based qualification threshold.

## Sharing and evidence

Repeated URL parameters preserve ordered selections: `p=2026:4848637:66&p=2025:4848637:66`. `basis=per40|perGame` preserves the table view. Exact duplicates are ignored; malformed, unsupported or excess selections are reported. Reload and browser back restore selections. A copy-link action and CSV download support taking a comparison into a scouting discussion.

CSV rows retain raw numerical precision, IDs, program, season, games, minutes, incomplete-box count, qualification, metric units and archive edition. They include raw totals, per-field observed-game counts, rates, percentiles and eligible peer counts. Percentages are exported as ratios. Missing values are blank. Quoting and spreadsheet-formula escaping protect source display strings. Source URLs, retrieval timestamps, SHA-256 receipts and field coverage can be opened per column in the interface.

The comparison remains attributed to the SportsDataverse bulk releases, labeled CC BY 4.0 by the publisher. It reads existing Cloudflare storage and introduces no recurring ingestion job.

## Verification and publication

Seven frontend tests cover raw-rate calculations, null/zero handling, tied percentiles, qualification and season isolation, selection round trips, mismatched program/edition/figures, CSV safety and all 24 published indices. An independent audit reconciled all 164,617 index records against program-level totals in the read-only career warehouse and confirmed per-game/per-40 parity and qualification.

Browser checks exercise three selected records, same-source-ID cross-season comparisons, removal, search limits, CSV values, clipboard links, reload/back, sparse early coverage, API failures, edition mismatches, retry and mobile layout. Live verification uses the deployed D1 endpoint, not sample player data. Existing public JSON assets are hash-checked for preservation.

```sh
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/cloudflare.py deploy --dry-run
.venv/bin/python scripts/cloudflare.py deploy
```

No derivative data build is required. Regular publishing flows already rebuild the frontend against the active historical archive.
