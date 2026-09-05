# The Coaching Annual

College sports statistics, scouting and recruiting research from Silvermine.

**Live:** https://bball.silvermine.dev

The publication covers football and men’s college basketball with a Next.js frontend, Python bulk-data pipelines, independent forecast models and Cloudflare D1 storage. Native basketball pages now include 2026–27 forecasts, efficiency ratings, player statistics, NCAA impact rankings and roster observations.

## Football

| Tool | Route | What it does |
|---|---|---|
| Football desk | `/football/` | Upcoming games, model context, national ratings and journal |
| Matchups | `/football/matchups/` | Search by team/conference/week; projected scores, win estimates and uncertainty |
| Player index | `/football/players/` | Search imported players; offensive EPA rankings by role and workload |
| Player game logs | `/football/player/?id=…&season=2025` | Raw source statistics served from Cloudflare D1 |
| Power ratings | `/football/ratings/` | Independent opponent-adjusted ridge team ratings |
| Model notebook | `/football/methodology/` | Holdout results, source receipts, missing coverage and limitations |
| Journal | `/blog/` | Generated matchup briefs and original statistical field guides |

The initial edition includes **18,758 schedule records**, **82,187 player box-score rows**, and **744 upcoming FBS forecasts**. Coverage is not a complete roster census. The independent 2025 test scored 784 games at **66.2% winner accuracy** and **14.24-point margin MAE**. No prospective betting advantage is claimed: the imported archive contains zero verified pregame line observations.

See [football architecture, source policy, model design, refresh workflow and remaining scope](docs/FOOTBALL.md).

## Basketball

| Tool | Route | What it does |
|---|---|---|
| Basketball desk | `/basketball/` | Upcoming forecasts, ratings and research coverage |
| Matchups | `/basketball/matchups/` | 1,579 forecasts for 2026–27, with score ranges and matchup briefs |
| Efficiency ratings | `/basketball/ratings/` | 366 independently rated teams, tempo, schedule strength and four factors |
| Player statistics | `/basketball/players/` | 9,990 player/team entries, workload filters and D1 game logs |
| Player impact | `/basketball/impact/` | Publisher NCAA RAPM, kept in its own identity namespace |
| Roster observations | `/basketball/recruiting/` | Historical program changes and clearly marked unconfirmed future listings |
| Model notebook | `/basketball/model/` | Disjoint fitting, calibration and test windows, metrics and source receipts |
| Scouting archive | `/basketball/scout/` | Preserved scouting reports and coaching tools |

The independent 2025–26 test scored 5,734 games at **67.4% winner accuracy** and **10.46-point margin MAE**. The nominal 80% margin interval covered **78.7%** of test outcomes. These retrospective results do not establish a betting advantage. Future roster listings are unconfirmed; roster absence does not imply departure.

Existing basketball URLs such as `/scout/333` redirect to their corresponding archive route. Native pages replace the old desk, player index and recruiting landing pages; the remaining scouting tools use the preserved application.

See [basketball architecture, source policy, model design and refresh workflow](docs/BASKETBALL.md).

## Forecast record

The [prospective scorecard](https://bball.silvermine.dev/research/scorecard/) preserves original football and basketball predictions, explains exclusions and links to D1-backed game histories. The initial ledger contains 2,323 forecasts, of which 444 have confirmed starts. No prospective result or market advantage is claimed before qualifying games settle.

A credential-driven The Odds API connector records bookmaker updates and capture times, rejects ambiguous game matches and supports matched-game market comparisons. No odds credential is currently configured. See [the ledger protocol, source policy and publishing commands](docs/RESEARCH_LEDGER.md).

## Architecture

```text
ncaa_scraper/ncaa_scraper/
  football_sources.py     Attributed SportsDataverse bulk downloads and receipts
  football.py             Normalization, player rankings, artifacts and D1 export
  football_model.py       Ridge forecasts and temporal holdout evaluation
  basketball_sources.py   Basketball bulk-release catalog
  basketball.py           Basketball ingestion, rankings, rosters and D1 export
  basketball_model.py     Possession efficiency model and independent calibration
  analytics.py            Existing basketball analytics artifacts
  fetcher.py              NCAA cache reader with enforced robots checks

frontend/app/             Next.js publication pages
frontend/src/             Preserved TanStack basketball application
frontend/public/data/     Generated public statistics and model artifacts
worker/                   Hono API, D1 schema and Cloudflare asset hosting
scripts/cloudflare.py     Wrangler wrapper using ~/.env credentials
scripts/publish-football.py  Manual refresh, validation, D1 sync and deployment
.local/                   Ignored source cache, football database and run logs
```

## Develop

```bash
npm --prefix frontend install
npm --prefix worker install
npm --prefix frontend run dev       # Next.js development on :3000
npm --prefix worker run dev         # API on :8787
npm --prefix frontend run build     # Next.js + preserved basketball -> dist/client
```

The static publication pages load committed data artifacts. Player logs require the Worker API on the same origin; the deployment serves both. For an integrated local preview, build the site and use Wrangler against seeded local D1:

```bash
cd worker
npx wrangler d1 execute bball-silvermine --local --file migrations/0008_football.sql
npx wrangler d1 execute bball-silvermine --local --file ../.local/football.sql
npm run dev
```

## Refresh and publish

```bash
# Download attributed releases if uncached, normalize and train
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.football --sql .local/football.sql

# Model and ingestion checks
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_football.py'

# Full refresh, validation, D1 synchronization and deployment
.venv/bin/python scripts/publish-football.py
.venv/bin/python scripts/publish-basketball.py
```

Cloudflare credentials are read from process environment or `CF_API_TOKEN_ACCOUNT` and `CF_ACCOUNT_ID` in `~/.env`; secrets never enter client code. No recurring refresh job is installed yet.

## Data policy

Football and native basketball data come from the [SportsDataverse release store](https://github.com/sportsdataverse/sportsdataverse-data), which labels its datasets [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution and per-download provenance are retained. We normalize records, calculate rankings and fit an independent score model.

Direct ESPN automated fetching is disabled because source terms restrict extraction and model training. NCAA requests must pass robots checks; the current source policy disallows crawling. Cached basketball data remains available. Source restrictions are never bypassed with stealth browsers or proxy rotation.
