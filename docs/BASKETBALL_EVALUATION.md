# Weekly basketball model experiment

`/basketball/evaluation/` compares the published preseason model with a weekly updating ridge challenger on identical 2025–26 games and publishes a separate 2024–25 holdout transition. The basketball navigation, model notebook and journal link to it. This is an exploratory retrospective experiment, separate from the production 2026–27 forecasts and the prospective ledger.

## Time ordering and model definition

The challenger retains the existing independent offense, opponent-defense, home-floor and tempo regressions. Efficiency penalty is 12, tempo penalty is 8, and season weights are `0.6 ** (latest_training_season - game_season)`. Possessions and overtime normalization are unchanged. There is no hyperparameter search, roster feature or bookmaker input in this experiment.

For each replay year, fit a preseason baseline using earlier seasons and freeze its program field. Membership still requires ten games in the latest prior fitting season; a program is not admitted using later evaluation-season participation. Weekly refits retain that field even before its teams have played ten games in the new season. Both methods therefore score the same games.

Each Monday at 00:00 UTC, include only completed records whose game starts are strictly before Sunday 00:00 UTC. This 24-hour buffer is conservative separation from game start, not a reconstruction of historical final-publication times. The entire current UTC week is excluded. Earlier evaluation-season outcomes can enter later weekly fits; no game enters its own forecast or an earlier fit.

The 2024–25 replay supplies 5,701 raw predictions for an independent 2025 holdout transition's two-parameter logistic calibration and 80th-percentile absolute-margin interval. The preseason baseline separately calibrates its fixed 2023–24 model on the same next-season field. The 2025–26 transition independently calibrates on 2024–25 and freezes that mapping for its test season. Calibration rows are downloadable and explicitly labeled as calibration inputs, not independent test results.

The two transitions use 69 weekly fits: 23 for the 2024–25 calibration replay, 23 for the 2025–26 holdout, and 23 for the additional 2024–25 holdout replay. Source releases are current downloads, so later source corrections can appear in historical records. The 2025–26 season had already been used for the published preseason evaluation; this is a new exploratory comparison on that season, not an untouched external test or a real-time record. No prospective forecasts or production model registrations are changed.

## First verified comparison

| Metric | Preseason | Weekly |
|---|---:|---:|
| Compared games | 5,734 | 5,734 |
| Margin MAE | 10.3861 | 9.9096 |
| Margin RMSE | 13.2627 | 12.7041 |
| Total MAE | 15.5498 | 14.6422 |
| Winner accuracy | 67.2131% | 69.7070% |
| Brier score | 0.204492 | 0.191298 |
| Log loss | 0.591141 | 0.558748 |
| Published 80% interval coverage | 79.0199% | 78.9327% |

The same-game mean difference in absolute margin error, weekly minus preseason, is -0.4764 points. A seeded 5,000-replicate bootstrap resamples whole UTC weeks and recomputes the game-weighted mean; its approximate 95% percentile range is [-0.5944, -0.3497]. This describes variation within one season. Teams repeat across weeks, and future seasons can differ; the range does not establish betting value or future improvement.

The source has 6,300 completed 2025–26 schedule records, 6,298 usable paired boxes and 564 paired-box games outside the frozen field. Both models exclude those 564. The full-cohort constant-home-margin baseline has 11.96-point MAE. Coverage uses each game's published rounded interval endpoints.

## Public evidence and interface

- `summary.json`: settings, source receipts, implementation hashes, aggregate comparison, exclusions, bootstrap and limitations.
- `games.json`: every evaluation game, final score, both predictions, weekly fit ID and strict training cutoff.
- `calibration-games.json`: the historical inputs and raw predictions used for challenger calibration.
- `fits.json`: all weekly coefficients and training-game IDs, plus the preseason and initial calibration fits. Training-feature hashes identify the actual records used.
- `manifest.json`: experiment signature and SHA-256 of every artifact.

The experiment signature covers settings, all normalized fitting records, source receipts, the production model ID and the Python evaluator/model implementation hashes. Unchanged editions are reused only when every public file passes its hash check. Warehouse receipts must match the published model's eight schedule/team-box source receipts for 2023–26 before building. The experiment opens the source warehouse read-only.

The interface filters both methods together by UTC month, venue and program. It recomputes errors and ten fixed-bin calibration summaries from the selected games. Empty selections remain unavailable rather than showing zero error. Monthly bars preserve the floor/program cohort and select the active month. The game table sorts by date, largest weekly error or largest weekly improvement; users can inspect the exact training cutoff and export all selected rows as CSV. Text fields are quoted and guarded against spreadsheet formula interpretation. Downloaded JSON retains full evidence.

A week-block interval is shown only for the full comparison, not reinterpreted as an interval for every UI slice. Calibration plots show bin counts on focus/hover and have an expandable numerical table. Sparse samples are labeled. Final scores include overtime while model scores use regulation pace.

## Storage and publishing

Public artifacts are deployed through Cloudflare Assets. A deterministic tar bundle of every JSON file plus the exact evaluator/model source is also retained in private R2 at `bball-research/basketball/experiments/<sha256>.tar`. Upload verification downloads the object and checks its hash. Build and archival processes share a local lock. No new D1 schema is needed; this experiment does not change production tables.

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_evaluation
.venv/bin/python scripts/publish-evaluation.py
```

The standalone publisher runs basketball tests, regenerates the experiment, tests/builds the frontend, checks/tests the Worker, dry-runs deployment, archives the evidence and deploys. The main basketball publisher also regenerates and archives the experiment. The serialized weekly publication workflow in [`.github/workflows/refresh-research.yml`](../.github/workflows/refresh-research.yml) invokes the same publisher after its required repository secrets are configured.

## Verification

Five Python tests exercise time-zone normalization, strict cutoffs, frozen membership, future-outcome perturbation, default-fit parity, metric arithmetic and paired resampling edge cases. All 41 basketball Python tests pass. Three frontend tests independently recompute every published aggregate from the public predictions, conserve calibration-bin game counts, check filter cohorts/empty states and verify CSV evidence. The complete frontend suite has 15 passing tests; the Worker has 15 passing tests and passes type checking.

An independent audit checks the 69 unique fit IDs, exact training sets, normalized-feature hashes and cutoffs against the warehouse, recomputes all 5,734 weekly forecasts directly from stored coefficients, and verifies ridge normal equations on opening and final fits. It also confirms exact parity with all 1,579 existing production forecasts. Local and production browser QA pass desktop/mobile rendering, calibration interaction, monthly selection, venue/program filters, missing results, pagination, fit evidence and selected CSV identities. All five live JSON files match the audited local hashes. The live journal, notebook links, sitemap, unchanged production overview and adjacent desks were also verified after deployment. The private R2 bundle passed its download-and-hash check.

Methodological references: [time-series evaluation](https://scikit-learn.org/stable/modules/cross_validation.html#time-series-split) and [probability calibration](https://scikit-learn.org/stable/modules/calibration.html). Dataset attribution and download URLs are retained in the public summary and the [production notebook](BASKETBALL.md).
