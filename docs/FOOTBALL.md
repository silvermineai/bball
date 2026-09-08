# Football data and forecasting

The football-first publication is built in **Next.js 16**, React and Tailwind, statically exported to Cloudflare Workers Assets. Structured source records, model versions, forecasts and market observations are stored in **Cloudflare D1**. Native basketball forecasts and research pages now start at `/basketball/`; preserved TanStack scouting tools remain on their archive routes. See [basketball documentation](BASKETBALL.md).

## Published data edition

The first verified import contains 18,758 schedule records across 2022–2026; 82,187 player box-score rows across 2025–2026; 12,850 player/team entries for 2025; and 1,421 for 2026. Coverage spans multiple divisions; the prediction model is FBS-vs-FBS only. This is **not** a complete roster census. Three games marked final lack scores and are excluded from modeling.

The September 5, 2026 07:56 UTC edition forecasts 744 upcoming FBS matchups with `ridge-team-calibrated-v2-9faf8033016a`. Its fixed 2025 holdout covers 784 games and excludes 24 games involving unseen teams. Probability-pick accuracy is 65.43%; margin-pick accuracy is 66.20%. Margin MAE is 14.24 points, margin RMSE 17.99 and total MAE 12.98. A constant home-margin baseline has 15.99-point MAE on the same games. These are retrospective baseline results, not proof of market advantage.

The v2 change separates probability and interval calibration from the test season. Brier score is 0.211391, log loss 0.610242, and the nominal 80% margin range covers 80.61% of the test outcomes. Point forecasts and score-model errors are unchanged from v1 on this source edition. Probability-pick accuracy is lower than the margin-pick accuracy; no improvement in winner selection is claimed.

## Sources and collection policy

- Bulk files are downloaded from the [SportsDataverse release store](https://github.com/sportsdataverse/sportsdataverse-data). Its README labels datasets **CC BY 4.0**; retain attribution, license link and a description of changes. Source licenses do not independently verify every upstream right.
- Publisher-provided source data includes ESPN and CollegeFootballData-derived records. We do not fetch those providers directly in this pipeline.
- `stats.ncaa.org/robots.txt` disallows crawling. The NCAA fetcher now checks robots and stops; its previous browser/stealth fallback was removed. Existing cached pages remain readable.
- [ESPN/Disney terms](https://disneytermsofuse.com/english/) restrict automated extraction and model training. Direct ESPN fetching is disabled. Re-enabling it requires an appropriate source license, not merely a working URL.
- Downloads use an identified user agent, one request per second, conditional ETags, durable local caches, bounded retries and immediate stops on 401/403. Long rate-limit pauses abort the run for later retry.
- Each receipt records dataset, season, source URL, retrieval time, last-modified value, ETag and SHA-256. No raw credentials are logged or committed.
- Every nonempty imported stat column is retained, including unknown `stat_1`–`stat_5` columns. Unmapped labels are never guessed. Missing values remain missing.
- Defense and specialist advanced rows lacking stable player IDs are retained but never linked by name alone.

## Model design

`football_model.py` fits separate ridge regressions for home margin and game total. Features are intercept, non-neutral venue, and team indicators. The margin uses opposite team signs; the total uses additive team effects. Team regularization is fixed at 12 and 24, home-field regularization at 2; intercepts are unpenalized. Training weights decay by 0.65 per season.

The v2 procedure has three temporal windows:

1. Fit initial score coefficients on 2022–2023.
2. Predict 2024: 787 scored games, 11 unseen-team games excluded. Fit a logistic home-win curve on the binary outcomes (`intercept = 0.03536320733907593`, `margin slope = 0.08705446509617575`, L2 penalty 0.01). Both outcomes and at least 100 binary games are required. The 80th percentile of absolute raw-margin errors sets a symmetric half-width of 23.767887135829675 points, using NumPy's linear quantile interpolation.
3. Refit score coefficients on 2022–2024 and evaluate 2025 with that earlier probability curve and range width frozen. Production then refits score coefficients on all eligible completed games through its current cutoff, retaining the same calibration.

No 2025 outcomes enter evaluation coefficients, probability calibration or interval calibration. Tests perturb all 2025 outcomes and verify the calibration and evaluation coefficients cannot change. The fixed choices were not tuned against the 2025 results. The procedure is retrospective: it was designed after that season and source corrections may postdate games.

Probability picks choose home at a displayed probability of at least 50%; margin picks choose home above zero raw margin. The logistic intercept can shift the winner threshold near an even matchup. Binary metrics omit tied finals. Brier, log loss and reliability bins use four-decimal displayed probabilities (log/Brier inputs are clipped to `[1e-6,1-1e-6]`); interval coverage tests inclusive one-decimal displayed endpoints. Score errors use full-precision predictions. The empirical range is not a guarantee of future coverage. Brier and log loss measure overall probabilistic performance, not calibration alone; see [scikit-learn's calibration documentation](https://scikit-learn.org/stable/modules/calibration.html).

`/football/methodology/` displays the three windows, metrics, a reliability chart and all ten bins with sample counts. `/data/football/validation.json` contains calibration/test game records, raw predictions, displayed test forecasts, training IDs, excluded IDs, both fitted coefficient sets, source receipts and the model implementation SHA-256. The D1 artifact manifest records this file's SHA-256; the large file is served through Cloudflare Assets. The JavaScript artifact tests independently reproduce the model predictions, quantile, probability mapping and reported metrics.

V1 artifacts retain their original normal-error/sigma interpretation for exact reproduction. Their sigma came from the 2025 test RMSE, so their probability and range statistics are not a separately calibrated benchmark. All 744 prior published forecasts reproduce unchanged under the compatibility path, and all earlier D1 model, prediction and ledger registration rows are retained. The ledger keeps the earliest eligible registration per game; v2 publication does not reset that selection.

There are no injury, transfer, depth-chart, recruiting, weather or coaching features yet. Unknown teams and non-FBS opponents receive no score estimate.

The matchup desk also publishes a **research-only football efficiency challenger**. It uses lagged, three-season team EPA-per-play and yards-per-play rates from the retained advanced team-game records, shrinks sparse teams toward the league prior, and applies a residual correction to the published score-only margin. The challenger is shown beside eligible upcoming games as a margin scenario; it does not change the primary probability, interval, forecast registration or market ledger. On the fixed 2025 holdout, the current artifact reports the same score-only baseline and challenger errors side by side. This is one retrospective transition with incomplete 2026 source coverage, so it is a research comparison rather than a betting signal.

## Calibration release verification

The v2 release passed 12 football tests, 12 ledger tests, 23 frontend tests and 15 Worker tests, plus Worker type checking and the combined production build. An independent database audit checked exact temporal cohorts, the fitted logistic gradient, all 744 legacy forecast reproductions, unchanged point forecasts, retained historical rows and the implementation hash. Browser checks covered desktop/mobile layout, chart hydration, the evidence download, a game brief and the forecast guide. The existing 519 KB legacy basketball bundle warning remains.

Production verification checked byte equality for the model/evidence/ledger assets, methodology, forecast guide, sample brief and homepage, and confirmed the basketball overview was unchanged. Live D1 history retains both v1 and v2 with their original registration clocks. Deployed Worker version: `bcc563b9-4afb-43be-9bb6-e23ae08d93e4`.

## Weekly model experiment

The [weekly evaluation](FOOTBALL_EVALUATION.md) compares 44 historical refits with the frozen baseline on the same 784 games. Margin MAE falls from 14.24 to 13.64 points and probability-pick accuracy rises from 65.4% to 70.2%. This retrospective evidence is published separately; it does not replace production forecasts or prospective ledger results.

## Team efficiency

The [efficiency desk](FOOTBALL_EFFICIENCY.md) now exposes all 7,370 retained advanced team-game records across 2022–2026 with 12 play-weighted measures, two-team comparisons, opponent-only FBS filtering and game-level evidence. The historical expansion archives six additional source releases in R2 and verifies their complete D1 rows. Rates remain descriptive and do not modify forecasts.

## Player rankings

FBS offensive ranks use publisher total EPA separately for passing (minimum 100 plays), rushing (50) and receiving (30). The player board also shows category games, yards per play and publisher success rate, and exports the filtered page with source athlete/team IDs, category, volume, EPA and qualification state. These are production ranks, not all-position prospect grades. EPA can overlap between passers and receivers and must not be summed across categories. Players below thresholds remain searchable and unranked. Team affiliations refer to the selected stat season.

`/api/football/players/:id?season=2018&page=0` returns an exact-athlete-ID season summary alongside up to 50 source rows with schedule context for the nine-season 2018–2026 archive. The summary exposes publisher passing, rushing and receiving aggregates (EPA, plays, yards, touchdowns, games and available EPA rank) plus counts of additional box-score categories; separate categories are never added into a composite. `/api/football/coverage` returns authoritative D1 row counts. Public pages read generated static artifacts; the player log reads D1 directly. The `/football/players/` board preserves season, category, division, search, qualification and page controls in the URL, so a coach can share a specific evaluation slice.

## Defensive and specialist event notebook

`/football/events/` exposes the previously retained name-attributed releases: 7,925 defensive and 8,518 specialist records for 2025; 196 defensive and 149 specialist records for partial 2026. These 16,788 rows are source records, **not unique athletes**. Every current row joins to its game by game ID and to a participant by team ID. No athlete ID is present, and repeated names are never merged into career totals or linked to player profiles.

The notebook supports season/type/team/division/name filters, game drilldown, metric sorting in either direction, positive-value filtering, full raw-row inspection, field coverage, source receipts and CSV downloads of the visible page. The Player leaders view groups one selected metric by the exact source name/team label, reports source-record and game counts, and exports the grouped page; it is a triage aggregation, not an athlete identity or a composite grade. The URL preserves browsing filters. Missing metrics remain null; source zeroes and negative yardage are retained. The current 2026 specialist release has no kickoff-return fields, which the field coverage table reports explicitly.

Definitions were checked against [the cfbfastR loader source](https://github.com/sportsdataverse/cfbfastR/blob/master/R/load_espn_cfb.R). `field_goals` counts attempts, not makes; zero `field_goals_yards` can reflect an unparsed distance. `punts_yards` is gross, not net yardage. These releases do not establish total tackles, defensive snaps, field-goal accuracy or complete return opportunities. Grouped leaders preserve the name-only source boundary and should be opened back into game records before personnel conclusions.

The Python builder `ncaa_scraper.football_events` reads the existing football warehouse in read-only mode and normalizes finite numeric metrics while preserving every original source field. It writes a separate ignored `.local/football-events.sqlite3`, a compact public `/data/football/events.json` index, and Cloudflare SQL. Migration `0014_football_events.sql` stores immutable source editions and rows with active-edition pointers. Each edition incorporates source receipts, normalized game context, all rows and the implementation SHA-256. Source row keys are meaningful only within their edition. Refreshes retain previous editions; activation follows row publication.

`GET /api/football/events?dataset=defense&season=2025&sort=sacks&positive=1` returns at most 40 records. Add `view=leaders` to group the selected metric by source player name, team ID and division; leaders require a metric sort and expose source-record/game counts plus the summed metric. Optional `q`, `team`, `game`, `division`, `direction` and zero-based `page` filters are validated and bound. Literal name search uses SQLite's case-insensitive ASCII matching; percent and underscore are literal characters. `edition=football-events-…` pins queries to a retained edition and must match the requested dataset/season. Unknown editions return 404. Count and data queries read the same immutable edition. Metric paths and ordering are allow-listed; numeric nulls sort last in either direction.

```bash
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football_events --sql .local/football-events.sql
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_football_events.py'
.venv/bin/python scripts/sync-football-events.py
```

The full football publisher rebuilds and syncs these event editions after refreshing the underlying sources. The standalone path does not regenerate forecasts or research registrations. The record audit reconciles every source row, numeric field and opponent join; tests also cover missing/zero/negative values, edition retention, SQL replay, validated API filters and safe CSV cells.

The event notebook release passed three Python tests, 20 Worker tests, 26 frontend tests, Worker type checking and the combined production build. The full source audit reconciled all 16,788 rows and verified that forecasts and the research ledger remained unchanged. Fractional sack counts and sack yardage remain visible; two-decimal display precision retains every current metric exactly. Live checks compared 12 API result sets—including paging, signed yardage, nulls, literal name search and edition pins—with independently selected local records. Desktop/mobile checks covered filtering, source inspection, game drilldown, CSV downloads, URL reload and fractional yardage. An application-router test covers canonical and trailing-slash API URLs. Deployed Worker version: `03741384-11bf-47ec-9655-5b701ac0b214`.

## Market integrity

977 imported archive records currently contain **zero verified pregame observations**. Archive rows lack bookmaker publication time. Observations first collected after kickoff cannot be relabeled as historical pregame quotes or closing lines. No market advantage or prospective betting performance is reported.

Home spread is negative for a home favorite; model home margin is positive for a home favorite. Their point difference is `model_home_margin + home_spread`. D1 retains prior model and forecast versions and market observations. The [shared research ledger](RESEARCH_LEDGER.md) now registers predictions and implements prospective settlement and matched-game evaluation. Live odds account validation and future real-result scoring remain pending.

## Run and publish

```bash
# Import cached releases (first run downloads), train, generate static JSON and D1 SQL
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football --sql .local/football.sql

# Validate source/model integrity
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_football.py'

# Build Next.js and the preserved basketball SPA
npm --prefix frontend run build

# Full refresh + validation + D1 sync + deployment
.venv/bin/python scripts/publish-football.py
```

The publisher requires requests, numpy and python-dotenv. Cloudflare credentials are read from the process environment or `CF_API_TOKEN_ACCOUNT` / `CF_ACCOUNT_ID` in `~/.env`. They are passed to Wrangler through its environment only. No secrets enter the frontend.

SQL imports replace current schedule/stat snapshots by dataset and season, while keeping historical prediction and market observations. There are no destructive changes to basketball tables. The local football database is under ignored `.local/`; the existing basketball SQLite database is separate.

The repository also defines a serialized daily GitHub Actions refresh in [`.github/workflows/refresh-research.yml`](../.github/workflows/refresh-research.yml). It uses the same publisher, requires `CF_ACCOUNT_ID` and `CF_API_TOKEN_ACCOUNT` repository secrets, and exposes manual sport selection. A successful deployment invokes the immutable brief archive capture. The local `~/.env` workflow remains available for development and audited manual runs.

## Remaining goal scope

- Finish migrating basketball pages from TanStack to Next.js.
- Extend the verified basketball efficiency baseline with dated roster features and rolling evaluations.
- Add verified rosters, recruiting records, eligibility and transfers with provenance.
- Extend the football efficiency challenger across additional dated transitions, then evaluate rolling splits and calibration stability before considering any production change.
- Configure and validate the licensed odds connector against a live account; collect pregame observations and evaluate future real finals through the shared ledger.
- Expand stats beyond the available box-score sample, extend historical advanced-team coverage, and document coverage against expected games/players.
- Preserve completed game briefs as an archive and add deeper human-reviewed game analysis.
- The first scheduled refresh completed successfully on September 7, 2026, including validation and combined Cloudflare deployment. Monitor source freshness and expected coverage after each run.

## Historical player expansion

The [historical player archive](FOOTBALL_PLAYER_HISTORY.md) now covers 2018–2026: 413,386 raw player box rows and 74,774 athlete/program/season records. The nine-season catalog excludes 1,653 retained team-placeholder entries from player indexes and exposes per-season source coverage and asset hashes. Defense and specialist events remain a separate name-attributed notebook; they are not joined to athlete profiles without stable source IDs. The active forecast snapshot above is intentionally narrower than this historical archive.

## Matchup notebooks

The [football matchup notebooks](FOOTBALL_BRIEFS.md) add two-sided unit comparisons, prior-season EPA leaders and private film notes to all 744 forecast briefs. Readers can select prior/current team seasons and FBS/all-opponent samples, inspect denominators and source receipts, and open the exact prospective game record. All forecast, statistics and ledger artifacts remain unchanged by this presentation release.
