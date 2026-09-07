# Football matchup notebooks

Every forecasted football game at `/blog/game-{id}/` now combines its existing projection with a two-sided unit comparison, historical player leaders, dated game-history links and a private preparation notebook. The September 2026 edition contains 744 game notebooks. Field-guide URLs remain unchanged.

## What the evidence means

The default team view uses the previous season and FBS opponents only. Readers can switch to all recorded opponents or the partial current season. Both unit tables update together: the visiting offense is compared with home-team opponent production, and the home offense with visiting-team opponent production. These are observations against each program's own opponents, not a common-opponent cohort, head-to-head prediction or opponent-adjusted rating.

The six measures are total, passing and rushing EPA per play, yards per play, source-classified explosive share and stuffed-rush share. Each cell retains its own game and play denominator. Defensive measures come from the opponent's raw row, not from the team's offense. Missing profiles or values display as unavailable. Team-record counts, scheduled finals and paired-opponent counts distinguish the scope of coverage. The definitions drawer retains the source metric definitions and adds film-review questions without claiming a verified scheme or tendency.

The team-season and opponent-sample controls preserve `stats` and `scope` in the URL. The efficiency-desk link transfers the selected season, teams and sample. Each available team's game-evidence download points to its exact content-addressed profile.

## Historical personnel

Player leaders always use the prior stat season, independently of the team comparison controls. Up to two qualifying FBS records per program and offensive category are selected by descending total source EPA; source ID breaks exact ties deterministically. Passing requires 100 plays, rushing 50 and receiving 30, matching the published player rankings. A record must also carry a published rank and a positive athlete ID. Team placeholders, nonfinite EPA, wrong seasons and other programs are excluded.

Player totals cover all their recorded opponents. Passing, rushing and receiving remain separate; a player can appear in more than one category and their EPA must not be added across categories. The cards identify the historical season and explicitly do not establish a current roster, starter, transfer status, eligibility or availability. Player links preserve the stat season and lead to the existing D1-backed game log.

## Forecast and market integrity

This release does not retrain a model, change a forecast, create a betting observation or re-register a ledger entry. The score estimate and calibrated range come directly from the existing football overview. Neutral-site and unconfirmed-kickoff labels are retained. The game-history link targets the exact sport/game record and explains that prospective selection can use an earlier eligible model version than the notebook displays.

Archive lines remain explicitly separate from qualifying feed observations. No archived price is presented as a current quote, closing line or demonstrated betting edge. The existing prospective scorecard continues to own settlement and market evaluation.

## Build and storage

`football-brief-data.ts` reads the existing public artifacts at build time. It verifies the complete player file against the catalog SHA-256 and checks every selected efficiency profile's content hash, team, season and sample equality. Cached profiles still undergo identity and sample checks at each use. Only the two programs' rates and selected personnel are sent to the interactive component; entire multi-season player and team catalogs are not sent to each page.

Source receipt timestamps, URLs and hashes are available in every notebook. These are source collection clocks, not retrospective proof of availability before a game. No new source scraping or database migration is needed: underlying rows remain in Cloudflare D1/R2 and the static notebooks deploy through Workers Assets.

Preparation notes and checkboxes use the existing browser notebook component, keyed by football game ID and model edition. They persist only in that browser. Storage denial is reported while editing remains available. Printing includes the selected sample and notes. There is no account sync.

## Verification

Frontend tests validate all 744 forecast-to-program joins, historical personnel identities, sample equality, qualification filters, negative EPA ordering, category separation and rejection of mismatched player artifacts. Browser QA compares rendered offense/defense values against the source index across both seasons and both opponent scopes; it also covers neutral sites, unconfirmed kickoffs, missing current-season records, URLs, source handoffs, notes persistence/isolation/storage denial, print output and desktop/tablet/mobile widths.

The release passed 52 frontend tests, Worker type checking and a production build. An independent HTML audit checked all 744 generated notebooks and 17,856 default-view unit rates; browser checks compared another 384 rendered values across seasons and opponent samples. All tracked public data artifacts remained unchanged.

Rebuild with `npm --prefix frontend run build`; run `npm --prefix frontend test`. A static-only deployment uses `scripts/cloudflare.py deploy` after validation. The immutable reading archive at [`/research/briefs/`](BRIEF_ARCHIVE.md) retains every football brief and its supporting evidence hashes. Archive capture time is distinct from forecast generation and does not establish pre-kickoff publication. A later deployment creates a new revision without replacing earlier views; the live `/blog/game-{id}/` route remains the current report and falls back to an archived revision only when its asset has actually disappeared. Archive snapshots do not alter the prospective scorecard or market observations.
