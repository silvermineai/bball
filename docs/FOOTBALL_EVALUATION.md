# Weekly football model experiment

`/football/evaluation/` tests the existing ridge score model under a weekly update policy. This is a retrospective experiment, separate from the live forecast model and prospective ledger. It now publishes two independent transitions: a 2024 test calibrated on 2023, and the existing 2025 benchmark calibrated on 2024.

## Observed results

| 2025 season, same 784 games       | Fixed preseason | Weekly refits |
| --------------------------------- | --------------: | ------------: |
| Margin MAE, points                |         14.2417 |       13.6402 |
| Margin RMSE, points               |         17.9925 |       17.3113 |
| Total MAE, points                 |         12.9828 |       12.8081 |
| Probability-pick accuracy         |        65.4337% |      70.1531% |
| Brier score                       |        0.211391 |      0.194944 |
| Log loss                          |        0.610242 |      0.570612 |
| Nominal 80% margin-range coverage |        80.6122% |      79.4643% |

Weekly minus preseason margin MAE is **−0.6015 points**. An approximate 95% interval from 5,000 whole-week bootstrap resamples is **−0.8775 to −0.3030**, using seed 2605 and the 22 represented UTC weeks. Each resample recomputes the game-weighted mean from sampled block sums and counts; it does not average differently sized weekly means. Teams recur across weeks, so those blocks do not eliminate all dependence. This interval is not a forecast of future improvement or proof of a betting advantage.

The reported settings were fixed before this experiment's results were computed. The experiment was still designed after the historical evaluation season, and historical data may have been corrected later. There is no claim that these forecasts were available before those games. Live model `ridge-team-calibrated-v2-9faf8033016a`, its 744 forecasts and all ledger registrations remain unchanged.

The same frozen-field rules produce the following independent holdouts:

| Test season | Compared games | Preseason margin MAE | Weekly margin MAE | Weekly winner accuracy |
|------------:|---------------:|---------------------:|------------------:|-----------------------:|
| 2024 | 787 | 14.6361 | 13.9048 | 66.3278% |
| 2025 | 784 | 14.2417 | 13.6402 | 70.1531% |

The 2024 row is a separate historical transition, not blended into the 2025 headline metrics.

## Temporal design

1. Fit the existing score model on eligible 2022 results, freezing its team field. During the 2023 season, refit every represented calendar week and generate the first transition's calibration predictions. Fit that weekly policy's logistic probability curve and 80th-percentile absolute-margin-error width on the 2023 predictions; the fixed preseason policy retains its own separately reproduced 2023 calibration.
2. Fit the 2024 test baseline on eligible 2022–2023 results and freeze its team field for both methods. Refit each represented 2024 calendar week using the same cutoff and score features, then evaluate the independent 2024 holdout.
3. Use the 2024 rolling predictions to calibrate the second transition, fit the fixed 2025 benchmark on eligible 2022–2024 results, and evaluate each represented 2025 Monday bucket. Earlier 2025 results can enter later fits, but never their own prediction. Both transition calibrations remain frozen throughout their following-season tests.

There are 22 weekly calibration fits and 22 weekly test fits. Source weeks can restart in postseason; calendar UTC weeks are computed from kickoff timestamps instead. Football seasons use their starting year, so January 2026 postseason games belong to the 2025 evaluation. A start-time buffer reduces overlap with ongoing games; it does not reconstruct historical result-publication timestamps. Current source final flags and corrections remain retrospective inputs.

The original `football_model.py` is reused without modification. Team ridge penalties remain 12 for margin and 24 for total; home-field penalties remain 2 and intercepts are unpenalized. Recency weights remain `0.65 ** (latest_included_season - game_season)`. Adding the first current-season result therefore also changes the recency reference year, as in the existing production fitting code. The weekly-policy comparison includes that reweighting. Neither policy uses injuries, rosters, advanced team statistics, recruiting, weather or market prices.

## Metrics and reproducibility

Score error metrics use full-precision fitted home margins and totals. The experiment's per-game `home_margin` and `total` fields intentionally preserve that precision; the interface formats them for reading. Home-win probabilities retain the production function's four-decimal output; range endpoints retain its one-decimal output. Accuracy uses a home pick at a displayed probability of at least 50%. Brier/log-loss inputs are clipped to `[1e-6, 1-1e-6]`; coverage includes endpoints. Unexpected tied modern football finals stop the build for source review.

Public artifacts under `/data/football/evaluation/` are:

- `summary.json`: settings, two calibrations, headline metrics, independent transition metrics, coverage, excluded games, implementation hashes and four schedule receipts.
- `games.json`: all 784 paired forecasts, results, weekly fit IDs and cutoffs. `starts_at` is the evaluation schema's alias for source `kickoff`.
- `calibration-games.json`: all 787 pregame-style 2024 weekly predictions plus the earlier 2023 transition's calibration predictions and fit references; these are calibration evidence, not test scores.
- `fits.json`: the 44 current 2024/2025 weekly coefficient sets, the 21 earlier 2023 sets and training-game IDs, plus the initial and fixed preseason fits.
- `training-games.json`: all 3,174 eligible source games from 2022–2025, including games later excluded from the frozen comparison field, so training and exclusions can be independently checked.
- `manifest.json`: content hashes for every artifact and the experiment signature.

The experiment signature includes settings, relevant source receipts, input games, the linked production model ID and both Python implementation hashes. An unchanged verified signature reuses its output. Builds and archives share a file lock; no running process is inferred from the mere presence of the lock file.

`archive-football-evaluation.py` verifies file hashes, experiment IDs and implementation hashes, creates a deterministic tar bundle, uploads it to private R2 under `bball-research/football/experiments/<sha256>.tar`, downloads it again and verifies its hash. The bundle includes input data and Python implementation. The public JSON files are served by Cloudflare Workers Assets. Existing D1 source records remain unchanged. No synthetic prospective registrations are created.

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_evaluation
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p test_football_evaluation.py
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python scripts/archive-football-evaluation.py
.venv/bin/python scripts/cloudflare.py deploy
```

The regular football publisher also builds, tests and archives this experiment before deployment. Benchmark parity failures stop publication instead of silently changing the comparison.

## Verification

An independent audit reconciles every input against the read-only football warehouse, checks all 65 ridge normal equations (maximum residual below `7e-10`), the logistic optima and empirical range quantiles. Tests reproduce every calibration/test raw prediction from coefficients, every training cohort/cutoff and every public metric; the fixed benchmark must match the currently published holdout. Perturbing future evaluation scores cannot affect earlier fits or either transition's calibration. The interface supports shared month/venue/program filters, error sorting, reliability-bin inspection, monthly charts, pagination, fit details, filtered CSV export and data-load retry. Existing basketball evaluation behavior is regression-checked after making its common prediction type support both sports.

Relevant statistical references: [time-series evaluation guidance](https://scikit-learn.org/stable/modules/cross_validation.html#time-series-split) and [probability calibration](https://scikit-learn.org/stable/modules/calibration.html). Source releases remain attributed to [SportsDataverse](https://github.com/sportsdataverse/sportsdataverse-data), labeled CC BY 4.0 by its publisher; direct ESPN/NCAA extraction is not enabled.

The [follow-up efficiency experiment](FOOTBALL_FEATURES.md) holds this benchmark fixed and tests lagged EPA/yardage against a matched score-only correction. Its small incremental margin-error gain is inconclusive; neither experiment has been promoted to current forecasts.
