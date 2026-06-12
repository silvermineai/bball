# The Coaching Annual 🏀

A college basketball analytics and recruiting platform for coaches and beat writers,
built from real public data: ESPN's public APIs, stats.ncaa.org, and official YouTube channels.

**The 2025-26 dataset**: 6,300 completed games, 362 D-I teams, 5,600+ rostered players,
final AP/Coaches polls, season statistics, and conference standings.

## The toolkit

| Tool | Route | What it does |
|------|-------|--------------|
| **Command Center** | `/` | Final polls, power top-10, news wire, season summary |
| **Scouting Reports** | `/scout/:teamId` | Full dossier per team: how-to-beat plan, strengths/weaknesses, four factors vs national percentiles, key personnel, quality wins/bad losses, full game log + roster |
| **Game Plan** | `/gameplan?a=&b=` | Pick two teams: projected score & win probability, keys to the game, mirrored tale-of-the-tape, personnel watchlists, printable sheet |
| **Recruiting Board** | `/recruiting` | Roster runway per program (class mix, departing production, positional needs), national turnover board, private target tracker, portal news wire |
| **Press Room** | `/pressroom?team=` | Auto-generated storylines, stat nuggets with national context, copy-ready article lede; add an opponent for game-preview angles |
| **Film Room** | `/film` | Latest film from official channels (NCAA March Madness, BTN, ACC, Big East, Big 12), matched to teams, plus per-team film finders |
| **Power Ratings** | `/rankings` | All 362 teams by SRS (schedule-adjusted margin, home-court adjusted, blowouts capped) with four-factor columns |

## Architecture

```
ncaa_scraper/           Python data pipeline
  ncaa_scraper/espn.py        ESPN public APIs -> SQLite (teams, games, rosters,
                              season stats, leaders, standings, rankings, news)
  ncaa_scraper/film.py        Official YouTube channel RSS -> film.json
  ncaa_scraper/analytics.py   SRS ratings, four factors, narratives, press kits,
                              roster analysis -> frontend/public/data/*.json
  ncaa_scraper/...            stats.ncaa.org scraper (play-by-play, shots, box scores)

frontend/               TanStack Start SPA (Vite + React 19 + Tailwind)
  src/routes/                 command center, scout, gameplan, recruiting,
                              pressroom, film, rankings + teams/games/players
  public/data/                static analytics artifacts (served as-is)

worker/                 Cloudflare Worker API (Hono + D1): auth, favorites,
                        ingest endpoints, admin scrape jobs
local_runner/           local job runner that drives the Python scraper
data/ncaa_mbb.sqlite3   the SQLite database
```

## Refresh the data

```bash
# scrape: teams, standings, season scoreboards, rankings, rosters, stats, leaders, news
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.espn --all

# film room: official YouTube channel feeds
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.film

# rebuild the analytics artifacts consumed by the frontend
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.analytics
```

## Run the app

```bash
cd frontend
npm install
npm run build          # SPA -> dist/client
npx serve -s dist/client -l 3211
```

Dev server: `npm run dev` (TanStack Start mode on :3000).
Deploy: the Cloudflare worker serves `frontend/dist/client` with `/api/*` on D1
(`cd worker && npx wrangler deploy`).

## Methodology notes

- **SRS power ratings**: iterative simple rating system over all D-I vs D-I games,
  ±28-point margin cap, 3.2-point home-court adjustment.
- **Efficiency**: points per 100 possessions using ESPN's estimated possessions;
  full-season scoring rates over regular-season per-game pace.
- **Win probability**: normal CDF over the SRS margin with σ = 11.
- **Departures**: seniors + graduates on final rosters (waivers not modeled).
- All data comes from public sources; narratives are template-generated from the
  numbers, never invented.
