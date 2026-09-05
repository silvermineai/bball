# Football data and forecasting

The football-first publication is built in **Next.js 16**, React and Tailwind, statically exported to Cloudflare Workers Assets. Structured source records, model versions, forecasts and market observations are stored in **Cloudflare D1**. The existing TanStack basketball app remains at `/basketball/` while its migration continues. Previous basketball URLs redirect to their corresponding paths.

## Published data edition

The first verified import contains 18,758 schedule records across 2022–2026; 82,187 player box-score rows across 2025–2026; 12,850 player/team entries for 2025; and 1,421 for 2026. Coverage spans multiple divisions; the prediction model is FBS-vs-FBS only. This is **not** a complete roster census. Three games marked final lack scores and are excluded from modeling.

The model currently forecasts 744 upcoming FBS matchups. Its fixed 2025 holdout covers 784 games, excludes 24 games involving unseen teams, and reports 66.20% winner accuracy, 14.24-point margin MAE, 17.99-point margin RMSE and 12.98-point total MAE. A constant home-margin baseline has 15.99-point MAE on the same evaluation games. These are baseline results, not proof of market advantage.

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

For the 2025 test, fitting uses 2022–2024 only. The holdout is never used to fit coefficients. Production fitting then includes eligible completed games through the current cutoff. Unknown teams and non-FBS opponents receive no score estimate. Tests verify future results cannot change the model and the holdout never enters the evaluation fit.

Win probability uses a normal error distribution with sigma from holdout RMSE. The 80% margin range uses ±1.281552 sigma. Probability calibration and empirical interval coverage are **not independently validated**. There are no injury, transfer, depth-chart, recruiting, weather or coaching features yet. Retrospective source corrections can affect backtests.

## Player rankings

FBS offensive ranks use publisher total EPA separately for passing (minimum 100 plays), rushing (50) and receiving (30). These are production ranks, not all-position prospect grades. EPA can overlap between passers and receivers and must not be summed across categories. Players below thresholds remain searchable and unranked. Team affiliations refer to the selected stat season.

`/api/football/players/:id?season=2025&page=0` returns up to 50 source rows with schedule context. `/api/football/coverage` returns authoritative D1 row counts. Public pages read generated static artifacts; the player log reads D1 directly.

## Market integrity

977 imported archive records currently contain **zero verified pregame observations**. Archive rows lack bookmaker publication time. Observations first collected after kickoff cannot be relabeled as historical pregame quotes or closing lines. No market advantage or prospective betting performance is reported.

Home spread is negative for a home favorite; model home margin is positive for a home favorite. Their point difference is `model_home_margin + home_spread`. D1 retains prior model and forecast versions and market observations. Settlement and prospective model/market evaluation remain to be implemented.

## Run and publish

```bash
# Import cached releases (first run downloads), train, generate static JSON and D1 SQL
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football --sql .local/football.sql

# Validate source/model integrity
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_football.py'

# Build Next.js and the preserved basketball SPA
npm --prefix frontend run build

# Full refresh + validation + D1 sync + deployment (manual, not a scheduled job)
.venv/bin/python scripts/publish-football.py
```

The publisher requires requests, numpy and python-dotenv. Cloudflare credentials are read from the process environment or `CF_API_TOKEN_ACCOUNT` / `CF_ACCOUNT_ID` in `~/.env`. They are passed to Wrangler through its environment only. No secrets enter the frontend.

SQL imports replace current schedule/stat snapshots by dataset and season, while keeping historical prediction and market observations. There are no destructive changes to basketball tables. The local football database is under ignored `.local/`; the existing basketball SQLite database is separate.

## Remaining goal scope

- Finish migrating basketball pages from TanStack to Next.js.
- Build and verify the 2026–27 basketball forecast pipeline.
- Add verified rosters, recruiting records, eligibility and transfers with provenance.
- Improve football forecasts using dated efficiency and roster features; evaluate rolling splits and calibrate probabilities.
- Integrate a permitted live odds provider; settle immutable forecasts and compare only valid pregame observations.
- Expand stats beyond the available box-score sample, expose advanced defensive/specialist records, and document coverage against expected games/players.
- Preserve completed game briefs as an archive and add deeper human-reviewed game analysis.
- Add recurring ingestion/deployment with monitored job state; no recurring job is installed yet.
