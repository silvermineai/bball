# The Coaching Annual

College sports statistics, scouting and recruiting research from Silvermine.

**Live:** https://bball.silvermine.dev

The publication now starts with football: a Next.js frontend, Python bulk-data pipeline, independent score model and Cloudflare D1 storage. The basketball scouting archive remains accessible while its Next.js migration and 2026–27 forecast work continue.

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

## Basketball archive

| Tool | Route | What it does |
|---|---|---|
| Command center | `/basketball/` | 2025–26 final polls, power ratings, news and season summary |
| Scouting reports | `/basketball/scout/:teamId` | Four factors, strengths/weaknesses, personnel, game logs and roster |
| Game plan | `/basketball/gameplan?a=&b=` | Head-to-head comparisons, projected score and personnel watchlists |
| Recruiting board | `/basketball/recruiting` | Roster class mix, departing production, positional needs and local target tracker |
| Press room | `/basketball/pressroom?team=` | Template-generated storylines and game-preview angles |
| Film room | `/basketball/film` | Official-channel film links and team film finders |
| Power ratings | `/basketball/rankings` | SRS with opponent adjustment and four factors |

Existing basketball URLs such as `/scout/333` redirect to the corresponding archive route. Archive rosters and statistical projections are not verified current recruiting availability or a trained 2026–27 basketball model.

## Architecture

```text
ncaa_scraper/ncaa_scraper/
  football_sources.py     Attributed SportsDataverse bulk downloads and receipts
  football.py             Normalization, player rankings, artifacts and D1 export
  football_model.py       Ridge forecasts and temporal holdout evaluation
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

The static football pages load committed data artifacts. Player logs require the Worker API on the same origin; the deployment serves both. For an integrated local preview, build the site and use Wrangler against seeded local D1:

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
```

Cloudflare credentials are read from process environment or `CF_API_TOKEN_ACCOUNT` and `CF_ACCOUNT_ID` in `~/.env`; secrets never enter client code. No recurring refresh job is installed yet.

## Data policy

Football data comes from the [SportsDataverse release store](https://github.com/sportsdataverse/sportsdataverse-data), which labels its datasets [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution and per-download provenance are retained. We normalize records, calculate rankings and fit an independent score model.

Direct ESPN automated fetching is disabled because source terms restrict extraction and model training. NCAA requests must pass robots checks; the current source policy disallows crawling. Cached basketball data remains available. Source restrictions are never bypassed with stealth browsers or proxy rotation.
