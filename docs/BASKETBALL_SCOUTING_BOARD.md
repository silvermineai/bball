# Player scouting board

`/basketball/scouting-board/` adds configurable production rankings to the historical player archive. It supports all 24 source seasons, season-wide ranks, program/name and source-position filters, workload filters, a three-record shortlist, shareable URLs and full-precision CSV evidence. It uses the existing versioned annual indexes and detailed comparison desk; it does not change source records, player identities, recruiting claims, forecasts or the ledger.

## What the score means

A priority score is a weighted average of favorable, same-season production percentiles. It expresses the user's selected statistical priorities. It is not an estimated probability, an overall talent rating, a trained ML model, a recruiting grade or a claim about future performance.

Eight available metrics:

| Metric             | Calculation                     | Favorable direction |
| ------------------ | ------------------------------- | ------------------- |
| Points             | PTS / recorded minutes × 40     | Higher              |
| Rebounds           | REB / recorded minutes × 40     | Higher              |
| Assists            | AST / recorded minutes × 40     | Higher              |
| Steals             | STL / recorded minutes × 40     | Higher              |
| Blocks             | BLK / recorded minutes × 40     | Higher              |
| Turnovers          | TO / recorded minutes × 40      | Lower               |
| True shooting      | PTS / [2 × (FGA + 0.475 × FTA)] | Higher              |
| Effective shooting | (FGM + 0.5 × 3PM) / FGA         | Higher              |

Per-40 rates reconstruct complete totals from the annual index's unrounded per-game rates, appearance counts and total minutes. The independent warehouse audit checks them against pooled source totals. Per-40 adjusts playing time, not pace, opponents, teammates or role. TS uses the disclosed college free-throw coefficient approximation. Missing fields and zero shooting denominators remain unavailable.

The reference group is the selected season's qualified player/program records: at least 15 games, 400 recorded minutes and complete box-score fields. Every metric requires at least 30 finite reference values. A record with an unavailable active metric receives no score; a zero-weight metric contributes zero. All-zero weights withhold scores and ranks. The index currently contains 164,617 records across 24 seasons, of which 54,759 qualify; annual source coverage varies substantially.

For each metric, percentile is `100 × (lower records + tied records / 2) / reference count`. Rates are compared at ten decimal places to avoid splitting equivalent production through floating-point noise; raw exported rates retain full precision. Turnovers use `100 − percentile`. Nonnegative weights are normalized by their sum. Final score ties at ten decimal places share competition ranks (1, 1, 3), and raw scores remain unrounded in CSV.

Search, source position and minimum minutes per game filter the already-ranked board. They never redefine the percentile reference group or renumber ranks. Separate program stints remain separate records. Source IDs are not independently verified unique-person crosswalks.

## Editorial starting priorities

| Priority        | Raw weights; each row sums to 100                |
| --------------- | ------------------------------------------------ |
| Scoring         | Points 50, true shooting 35, fewer turnovers 15  |
| Passing         | Assists 60, fewer turnovers 25, true shooting 15 |
| Rebounding      | Rebounds 65, blocks 20, true shooting 15         |
| Steals & blocks | Steals 60, blocks 40                             |

These are editable editorial defaults, not empirically fitted optimal weights. The UI exposes every value, favorable percentile, metric peer count, normalized weight and contribution. Correlated metrics can count similar production twice. Fewer turnovers can reflect a small ball-handling role; steals and blocks omit substantial defensive work. No preset establishes a player's suitability for a specific team without further scouting.

## State, data integrity and export

`season` selects the archive year, `w` stores eight raw weights in the metric order above, `q` stores search, `pos` stores the literal source position, `min` accepts 0/20/30 minutes per game, and repeated `pick` parameters retain up to three exact `season:player_id:team_id` identities. Season changes clear the shortlist. Filters and presets are shareable and support browser navigation. Copying an untouched board serializes its season and all default weights; clipboard failures expose a selectable link field. Text/range changes replace the current URL entry; discrete choices push an entry. Invalid settings produce a visible explanation, and unsupported seasons produce no board.

The client fetches one annual index, caches validated seasons, cancels stale requests and checks the index's season and edition against the server-rendered catalog before displaying records. Missing downloads expose a retry action; mismatched editions require matching page/data releases. A same-season shortlist entry absent from the qualified sample is explicitly reported. The detailed comparison link retains the exact player/program/season selections, including when result filters hide them.

CSV exports every filtered record, not only the current page. Fields include exact identity, source position, games, minutes, unrounded score, unfiltered season rank, archive edition, each raw metric, favorable percentile, raw weight, contribution and peer count. Strings that could be interpreted as spreadsheet formulas are escaped; unavailable values are blank. The index download and source receipts remain accessible on the page.

## Storage and publishing

No additional scrape is necessary for this feature. Annual indexes are already served through Cloudflare Workers Assets; detailed profiles and logs remain in D1 and original bulk source archives remain in private R2. SportsDataverse attribution, publisher-stated CC BY 4.0, source receipts and aggregation changes are retained. The scouting board does not assert direct ESPN/NCAA scraping rights or current transfer availability.

```sh
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/cloudflare.py deploy --dry-run
.venv/bin/python scripts/cloudflare.py deploy
```

The page is linked from basketball navigation, the player directory and the sitemap. The current basketball publisher automatically includes it in the static build; no source or model refresh is required to publish interface changes.

## Verification

Unit tests check independently calculated midranks, reverse turnover direction, weighted contributions, competition ties, qualification and season isolation, missing values, sparse cohorts, zero and invalid weights, URL round trips, exact shortlist identities, CSV escaping and full precision. Every published season is checked for qualified counts and monotonic ranks, with sampled percentiles independently recalculated by scanning the reference cohort. Filtering must preserve the original row and rank.

An independent Python audit checks all 164,617 player/program/season records, all 54,759 qualification flags and 1,316,936 metric values against pooled career warehouse totals across all 24 seasons. Browser checks independently recalculate complete downloaded boards, verify shortlist identity and shared URL reload/back behavior, exercise filters, pagination, contribution evidence, failed-load retry and edition rejection, and inspect desktop and mobile overflow. Existing public data hashes are retained for comparison after deployment.

See [historical player production](BASKETBALL_CAREERS.md) for source normalization, coverage and identity limitations, and [player comparisons](BASKETBALL_PLAYER_COMPARISON.md) for detailed stat denominators and game evidence.
