# The Coaching Annual

College sports statistics, scouting and recruiting research from Silvermine.

**Live:** https://bball.silvermine.dev

The publication covers football and men’s college basketball with a Next.js frontend, Python bulk-data pipelines, independent forecast models and Cloudflare D1 storage. Native basketball pages now include 2026–27 forecasts, efficiency ratings, player statistics, NCAA impact rankings and roster observations.

## Football

| Tool | Route | What it does |
|---|---|---|
| Football desk | `/football/` | Upcoming games, model context, national ratings and journal |
| Matchups | `/football/matchups/` | Search by team/conference/week; projected scores, win estimates and uncertainty |
| Player index | `/football/players/` | Search imported players; shareable season, role, division and qualification slices with offensive EPA rankings |
| Player game logs | `/football/player/?id=…&season=2025` | Raw source statistics served from Cloudflare D1 |
| Power ratings | `/football/ratings/` | Independent opponent-adjusted ridge team ratings |
| Defense and specialist leaders | `/football/events/` | Browse game evidence or group sacks, turnovers, kicking, punting and returns by source name/team |
| Model notebook | `/football/methodology/` | Holdout results, source receipts, missing coverage and limitations |
| Journal | `/blog/` | Generated matchup briefs and original statistical field guides |

The current football archive contains **18,759 schedule records** across 2022–26, **264,061 raw player box-score rows**, **57,909 name-attributed defensive and specialist events**, and **790 upcoming FBS schedule records**, of which **711 have a primary forecast**. Coverage is not a complete roster census. The independent 2025 test scored 784 games at **65.4% winner accuracy** and **14.24-point margin MAE**. No prospective betting advantage is claimed: the imported archive contains zero verified pregame line observations.

See [football architecture, source policy, model design, refresh workflow and remaining scope](docs/FOOTBALL.md).

## Basketball

| Tool | Route | What it does |
|---|---|---|
| Basketball desk | `/basketball/` | Upcoming forecasts, ratings and research coverage |
| Matchups | `/basketball/matchups/` | 1,579 primary forecasts plus 50 labeled cold-start estimates for 2026–27, with score ranges, adjusted Four Factor lenses and matchup briefs |
| Efficiency ratings | `/basketball/ratings/` | 366 independently rated teams, tempo, schedule strength and opponent-adjusted four factors |
| Boutique model archive | `/basketball/boutique/` | Attributed publisher adjusted team ratings and player Box Plus/Minus across 2005–06 through 2025–26, with model comparison context |
| Lineup lab | `/basketball/lineups/` | NCAA-derived five-player lineup combinations with possession thresholds, offensive/defensive ratings and net performance |
| Program dossiers | `/basketball/programs/` | 366 programs with historical splits, game trends, player workloads and film questions |
| Matchup workbench | `/basketball/compare/` | Any two rated programs, transparent model-term decomposition, venue scenarios, historical factors and source-listed roster movement |
| Shooting lab | `/basketball/shooting/` | 1.45 million recorded attempts across 2024–25 and 2025–26, player/program shot maps and box-score reconciliation |
| Play-by-play archive | `/basketball/pbp/` | Search 15.8 million indexed events across eight published seasons and jump to the publisher game page for the complete event log |
| Player statistics | `/basketball/players/` | 9,990 player/team entries, shareable ranking filters, workload filters and D1 game logs |
| Player source profiles | `/basketball/player/?id=…` | ESPN-derived identity, position, size, experience and status context across 24 seasons |
| Player profile browser | `/basketball/player-profiles/` | Search the complete legal source-profile archive by season, position, status or player ID |
| NCAA player box archive | `/basketball/ncaa-player-box/` | Browse 2026 NCAA-derived game-level rows plus historical 2010–25 player-season summaries with shooting splits and playmaking context in the separate NCAA ID namespace |
| NCAA player rankings | `/basketball/ncaa-rankings/` | Rank current NCAA-derived player/team rows by scoring, rebounding, playmaking, defense or shooting efficiency with configurable game, minute, position and class filters |
| NCAA historical leaderboard | `/basketball/ncaa-careers/` | Compare NCAA player-season rows across a selectable historical window with explicit workload filters and source identity |
| NCAA roster intel | `/basketball/ncaa-rosters/` | Search NCAA roster records by class, position, size, hometown and high school for recruiting context |
| High-school pipeline | `/basketball/ncaa-high-schools/` | Aggregate source roster rows by high school, programs represented and recorded college production, with links back to the evidence rows |
| NCAA shooting profiles | `/basketball/ncaa-shooting/` | Compare NCAA-derived shot volume, zone efficiency and average distance by player/team across 2019–26 |
| Publisher stat browser | `/basketball/source-stats/` | Search all 44 retained source-defined player-season fields across the available 2024–25 and 2025–26 releases, with D1-backed pagination and CSV export |
| Team stat browser | `/basketball/team-stats/` | Search 45 attributed aggregate team-season fields across 2023–24 through 2025–26, with source display values, pagination and CSV export |
| Player impact | `/basketball/impact/` | Publisher NCAA RAPM, kept in its own identity namespace |
| NCAA leaderboards | `/basketball/ncaa/` | Robots-respecting NCAA final national player-stat snapshots across D-I/D-II/D-III |
| Roster observations | `/basketball/recruiting/` | Dated recruiting evidence plus an all-354-program coverage map and clearly marked unconfirmed future listings |
| Roster impact lab | `/basketball/roster-lab/` | Compare returning workload, position continuity, class-year workload, incoming prior minutes, source-reported roster shape, efficiency rating and 2026–27 schedule coverage across source-listed programs |
| Press room | `/basketball/pressroom/` | Model-generated story angles for upcoming games, with links to evidence |
| Model notebook | `/basketball/model/` | Disjoint fitting, calibration and test windows, metrics and source receipts |
| Scouting archive | `/basketball/scout/` | Native program dossier index and legacy-compatible dossier links |

The independent 2025–26 test scored 5,734 games at **67.4% winner accuracy** and **10.46-point margin MAE**. The historical player archive retains **3.68 million identified box-score rows** across 24 seasons. The nominal 80% margin interval covered **78.7%** of test outcomes. These retrospective results do not establish a betting advantage. Future roster listings are unconfirmed; roster absence does not imply departure.

Existing basketball URLs such as `/scout/333` redirect to the native `/basketball/scout/333/` dossier aliases. Native pages replace the old desk, player index, recruiting landing page, scouting archive, rankings, team, game and press indexes; game-planning and other remaining archive tools use the preserved application.

See [basketball architecture, source policy, model design and refresh workflow](docs/BASKETBALL.md).

See [program scouting definitions and publishing workflow](docs/BASKETBALL_SCOUTING.md) for pooled Four Factors, workload estimates and scenario-model parity checks.

See [shooting evidence, source coverage and Cloudflare storage](docs/BASKETBALL_SHOOTING.md) for play-by-play shot analysis.

## Forecast record

The [prospective scorecard](https://bball.silvermine.dev/research/scorecard/) preserves original football and basketball predictions, explains exclusions and links to D1-backed game histories. The ledger contains 2,323 forecasted games, of which 411 have confirmed starts. The [immutable reading archive](https://bball.silvermine.dev/research/briefs/) preserves each captured brief version separately. No prospective result or market advantage is claimed before qualifying games settle.

The [historical market archive](https://bball.silvermine.dev/research/markets/) exposes retained football market observations with matchup, source and capture-time context. These rows are labeled archival references and stay outside prospective odds evaluation until the timing evidence qualifies.

The [coverage desk](https://bball.silvermine.dev/research/coverage/) gathers current source editions, player/recruiting counts, model holdouts, forecast clocks and explicit source limitations in one dated view.

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

Cloudflare credentials are read from process environment or `CF_API_TOKEN_ACCOUNT` and `CF_ACCOUNT_ID` in `~/.env`; secrets never enter client code. A serialized weekly GitHub Actions refresh is defined in [`.github/workflows/refresh-research.yml`](.github/workflows/refresh-research.yml). It requires repository secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN_ACCOUNT`; a manual run can select one sport and optionally use `THE_ODDS_API_KEY` for a licensed odds snapshot. Each successful deployment also captures the immutable matchup reading archive.

## Data policy

Football and native basketball data come from the [SportsDataverse release store](https://github.com/sportsdataverse/sportsdataverse-data), which labels its datasets [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution and per-download provenance are retained. We normalize records, calculate rankings and fit an independent score model.

Direct ESPN automated fetching is disabled because source terms restrict extraction and model training. NCAA requests must pass robots checks; the current source policy disallows crawling. Cached basketball data remains available. Source restrictions are never bypassed with stealth browsers or proxy rotation.
