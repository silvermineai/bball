# Football efficiency experiment

`/football/features/` tests whether lagged EPA and yardage improve the published weekly score model. The experiment is retrospective and exploratory. Its fixed design was recorded after the historical season and after the weekly benchmark was known, before computing these feature results. It is not a prospective preregistration. No parameter search was performed against the test results, and no current forecast or ledger registration was changed.

## Result

| Same 784 games in the 2025 season | Original weekly reference | Score-only correction | Score + efficiency |
| --------------------------------- | ------------------------: | --------------------: | -----------------: |
| Margin MAE, points                |                 13.640227 |             13.359664 |          13.337269 |
| Margin RMSE, points               |                 17.311306 |             16.802668 |          16.727503 |
| Probability-pick accuracy         |                  70.1531% |              70.1531% |           70.1531% |
| Brier score                       |                  0.194944 |              0.194944 |           0.193678 |
| Log loss                          |                  0.570612 |              0.570612 |           0.567630 |
| Nominal 80% range coverage        |                  79.4643% |              80.9949% |           79.8469% |

The primary contrast is **efficiency minus score-only correction**, not efficiency minus the original reference. Margin MAE differs by **−0.0223945963 points**, with an approximate 95% week-block bootstrap range of **−0.1865948345 to +0.1485339426**. The incremental benefit is inconclusive. Most point-error improvement relative to the original reference came from fitting a score-only correction. Total predictions remain identical across all methods (MAE 12.808141 points).

This result does not justify promoting the efficiency candidate. It also does not establish that efficiency features can never help: this is one fixed design, with one training season, unadjusted rates, a selected historical cohort and imperfect historical publication information.

## Fixed temporal design

The machine-readable specification is `data/research/football-efficiency-experiment.json`.

1. Generate 770 weekly, pregame-style base predictions for 2023, using the existing score-model policy. Learn two corrections to the actual-home-margin-minus-base-margin residual: a control using only base margin, and a candidate using base margin plus four efficiency gaps. Standardization uses only 2023 means and population standard deviations. Zero-variance columns use scale one. Both use ridge penalty 100 and an unpenalized intercept. These correction coefficients and scaling remain frozen afterward.
2. Apply the corrections to the original weekly experiment's 787 predictions for 2024. Fit separate logistic probability curves and empirical 80% absolute-margin-error ranges for each corrected model. Calibration remains frozen for evaluation.
3. Evaluate on exactly the original weekly benchmark's 784 games from the 2025 season, including January 2026 postseason games. Retain its 24 exclusions for teams outside the frozen score-model field. Weekly base score fits and feature pools can incorporate earlier results during the test season; the correction models and probability calibrations cannot.

All weekly cutoffs are strictly before Sunday 00:00 UTC, 24 hours before the Monday bucket. Kickoff clocks constrain the input sample; they do not reconstruct when the publisher released or revised statistics. This retrospective limitation applies to both scores and efficiency inputs.

## Features and source coverage

The candidate adds four designated-home-minus-away differences: offensive EPA per play, EPA allowed per play, offensive yards per play and yards allowed per play. Inputs require a paired, scored FBS-versus-FBS game, both advanced rows with finite `EPA_overall_off` and `off_yards`, and positive `scrimmage_plays`. Defense uses the opponent's offensive numerator and play denominator. Source game and team IDs must match the schedule.

Each cutoff pools the current and preceding season. Prior-season numerators and denominators receive weight 0.5. Each team rate is shrunk toward the cutoff-specific pooled league rate with 300 equivalent plays. A team with no usable history receives that league rate; none of the 784 evaluation games needed that fallback. Pooling uses totals and denominators rather than averaging game rates.

There are 3,124 complete paired advanced input games from 2022–2025 and 65 dated feature states: 21 training, 22 calibration and 22 evaluation weeks. Fifty of the original 3,174 eligible score-input games lack a complete advanced pair and do not enter feature pools. The score fits retain their eligible score samples.

SportsDataverse bulk releases are attributed under the publisher-stated CC BY 4.0 license. The outputs record normalization, aggregation and independent modeling changes. Four advanced-data receipts plus schedule receipts retain source URLs, retrieval times and hashes. Direct ESPN/NCAA extraction remains disabled.

## Evidence and reproduction

Public artifacts under `/data/football/features/`:

- `summary.json`: fixed design, source receipts, original benchmark manifest, correction coefficients, scaling, calibration, coverage and results.
- `games.json`: all 784 paired forecasts, outcomes, feature values, individual candidate/control contributions, cutoffs and fit/state identifiers.
- `training.json`: 770 training rows and 21 weekly base fits with training IDs.
- `calibration.json`: 787 raw and corrected calibration rows.
- `feature-states.json`: 65 states with exact input-game IDs, pooled league rates and weighted team numerators, denominators and shrunk rates.
- `advanced-inputs.json`: 3,124 paired normalized source inputs.
- `manifest.json`: common experiment ID and hashes of the six other files.

The signature pins the original weekly experiment, fixed design, source receipts, normalized inputs and five Python implementations. Builds and archives share a file lock and only reuse verified cached artifacts. The builder rejects warehouse/base-benchmark drift and must reproduce the original weekly metrics before reporting a comparison.

`archive-football-features.py` verifies all hashes, design and baseline dependencies, then bundles the seven feature artifacts, original six benchmark artifacts, design and five implementation files into a deterministic tar. It uploads to private R2 under `bball-research/football/feature-experiments/<sha256>.tar` and downloads it to verify its hash. Public JSON is served through Workers Assets. Existing D1 source records and model/ledger tables are unchanged.

Initial experiment ID: `81d1075f50ec2bd95934da41304ca392b2e68574c3fb68f60c51561e8978f573`.
Initial verified R2 bundle: `bball-research/football/feature-experiments/a015b82936a38bf7ebd85b2fe64cea2aebb422f77552d256a55022dbb8d9b234.tar`.

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_features
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p test_football_features.py
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/cloudflare.py deploy --dry-run
.venv/bin/python scripts/archive-football-features.py
.venv/bin/python scripts/cloudflare.py deploy
```

`scripts/publish-football-features.py` runs this sequence; the regular football publisher also builds, tests and archives the feature experiment.

## Verification and interpretation

Python tests verify weighted feature pooling and shrinkage, missing pairs, duplicate rejection, temporal cutoffs, training-only standardization, ridge normal equations, every evaluation correction and calibrated prediction. Perturbing future 2025 EPA/yardage leaves 2023/2024 states, learned corrections and 2024 calibration unchanged while changing later 2025 feature states.

An independent audit reconciles all 3,124 pairs with the warehouse, recalculates 34,888 team rates across 65 states, verifies training cutoffs and independently reproduces all 5,000 week-block bootstrap draws (seed 2623). Resampling retains whole UTC weeks and recomputes game-weighted error from sums and counts. Teams recur across weeks, so the approximate interval does not remove every source of dependence.

Frontend tests independently reproduce metrics and contributions, enforce artifact hashes/edition identity, and check common filters and full-precision CSV exports. The page supports program/month/minimum-change filters, monthly comparisons, pagination, model-term evidence, source downloads and failed-load retry. Model contributions explain an arithmetic correction, not causal effects.

See [the original weekly experiment](FOOTBALL_EVALUATION.md) for base-model fitting and [the efficiency archive](FOOTBALL_EFFICIENCY.md) for source ingestion and denominator definitions.
