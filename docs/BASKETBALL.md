# Basketball research desk

Native Next.js pages now live at `/basketball/`, `/basketball/matchups/`, `/basketball/ratings/`, `/basketball/players/`, `/basketball/impact/`, `/basketball/recruiting/`, `/basketball/player/` and `/basketball/model/`. Per-game basketball briefs appear at `/basketball/briefs/:id/` and in the shared journal. Old scouting, game-planning, film and other archive routes remain served by the TanStack application.

## Current verified import

- 20,495 schedule records across season-ending years 2024–2027.
- 18,822 completed games with usable paired team box scores; 13 other completed games excluded from efficiency calculations.
- 196,865 identified 2025–26 player box-score rows, with 11 unidentified source rows preserved separately.
- 9,990 player/team entries with recorded minutes in the player index; incomplete box-score aggregates are not presented as complete rates.
- 426,040 published player-season statistic rows grouped by player, team and category, retaining labels, values, displays and descriptions.
- 4,974 NCAA league-wide RAPM records, kept in their original NCAA identity namespace.
- 1,629 published 2026–27 games, including 1,579 forecasts. This is a partial schedule.
- 5,461 players listed under 2026–27 in the source, spanning 354 programs. Listings are unconfirmed and may carry over; they do not prove current eligibility or a roster return.
- 1,595 different-program records in the historical 2024–25 → 2025–26 appearance comparison. These are observed participation changes, not claims about transfer announcements or reasons.

## Source policy and identifiers

All new imports use the SportsDataverse GitHub release store. The publisher labels datasets CC BY 4.0. Attribution, source URLs, retrieval times, ETags, last-modified metadata and SHA-256 hashes are retained. Direct ESPN extraction remains disabled; NCAA requests must pass robots checks and currently cannot proceed.

Parquet downloads substantially reduce network transfer. The shared release client maintains polite request spacing, conditional caching and bounded retries. Every published release used for this edition is listed in the model notebook.

Stable ESPN athlete IDs join game appearances to roster listings. Missing player IDs are preserved in `bb_unresolved`, not fabricated or inferred from names. NCAA RAPM IDs are not joined by name to ESPN IDs. The available `mbb_player_crosswalk` release was inspected but does not supply a verified NCAA-to-ESPN mapping, so it is not used for that purpose.

Public roster profiles retain basketball-relevant fields. Age and birth date are excluded. Historical program comparisons use actual recorded minutes, rather than mutable prior-season roster listings. A player absent from a partial listing is never labeled as departed. Multiple program affiliations are marked ambiguous. “New to dataset” does not mean freshman or new recruit.

## Independent efficiency model

`basketball_model.py` trains a ridge model on offensive efficiency for both sides of each eligible game. Estimated possessions are the average of each side's `FGA + 0.475 × FTA − ORB + TO`. Points per 100 estimated possessions are the response. Separate team offense, opponent defense and home-floor features are used. A second ridge model fits tempo from both team identities.

Efficiency regularization is fixed at 12; tempo regularization at 8. Older seasons receive weights of `0.6 ** age_in_seasons`. A program must have at least ten observed games in the latest fitting season to enter the model. The fitted field currently has 366 programs. This empirical eligibility rule is disclosed rather than represented as a verified complete Division I membership list.

For the 2026–27 forecast:

1. Fit initial efficiency and tempo coefficients on 2023–24.
2. Use 2024–25 predictions to calibrate a two-parameter logistic margin-to-win-probability mapping. The 80th percentile of absolute errors defines a symmetric nominal 80% interval.
3. Fit evaluation coefficients on 2023–24 and 2024–25, keeping calibration fixed. Evaluate 2025–26 without feeding that season's results into the evaluation model.
4. Fit production coefficients on all three completed seasons. Apply the fixed calibration and publish future game forecasts with immutable model IDs and timestamps.

The 2025–26 test covers 5,734 games and excludes 564 paired-box games involving teams outside the trained field. Metrics: 67.37% winner accuracy, 10.46-point margin MAE, 13.35-point margin RMSE, 15.37-point total MAE, 0.2057 Brier score, 0.5943 log loss and 78.69% empirical coverage for nominal 80% ranges. The constant-home-margin baseline MAE is 11.97 points. These are retrospective results, not a market-edge claim.

Possession pace is normalized to 40 minutes using the final period count, including overtime. Forecasts use regulation pace; evaluation compares against final scores, including overtime. No injury, transfer, roster or recruiting features are used yet. Source corrections may have been published after the historical events.

## Player and team statistics

The [shooting lab](BASKETBALL_SHOOTING.md) adds 738,233 field-goal attempts from 2.9 million bulk play-by-play events, with program/player court maps, shot labels, event logs and exact box-score reconciliation. Its source release is archived in R2; versioned shot evidence is served from D1.

The [program scouting library and matchup workbench](BASKETBALL_SCOUTING.md) add 366 native dossiers, historical window comparisons, game efficiency charts, personnel workloads and venue scenarios. These use the existing source/model edition and preserve the distinction between historical observations and future predictions.

The player index exposes PPG, RPG, APG, steals, blocks, turnovers, minutes, eFG%, estimated TS% and 3P%. Default qualification is 15 games and 400 recorded minutes, with complete fields. DNP rows remain accessible in game logs. TS uses the same disclosed 0.475 college free-throw coefficient.

Team ratings show adjusted offense, defense, net efficiency and tempo, plus pooled observed four factors. Lower adjusted defense and turnover rate are better. Schedule strength is the mean adjusted net strength of rated opponents; the number of included opponents is reported. These are independent Silvermine calculations, not KenPom or another publisher's proprietary ratings.

Player impact uses the publisher's league-wide NCAA stint-ridge RAPM. Net RAPM is ORAPM + DRAPM, with a display qualification of at least 500 possessions at each end. This is a distinct data product and identity namespace. The site links to the publisher's `hoopR/R/load_ncaa_mbb.R` documentation.

## Storage and refresh

D1 migration `0009_basketball_research.sql` adds separate `bb_*` tables without modifying football or legacy basketball tables. Compact player/team box-score fields are stored alongside published player-season metrics, roster profiles, appearance summaries, source receipts, model artifacts and forecast snapshots. Full source downloads are cached locally under ignored `.local/basketball/`; public derivative JSON is served by Cloudflare Assets.

```bash
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball --sql .local/basketball.sql
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_*ball.py'
.venv/bin/python scripts/publish-basketball.py
```

The publisher refreshes sources, tests, builds both frontend applications, syncs D1 and deploys the Worker using credentials supplied through `~/.env`. No recurring job is installed yet. Football and basketball refresh scripts rebuild the shared site while leaving the other sport's data edition intact.

## Release verification

The original basketball release passed ingestion/model tests, Worker API/routing tests, Worker type checking and the combined production build. Browser checks covered desktop/mobile layouts, player search, roster view switching, matchup filters and generated briefs. Live checks verified D1 counts, player game logs and season statistics, error responses, football access and legacy scouting redirects. The scouting extension adds seven Python tests and three frontend tests, including agreement with all 1,579 published basketball forecasts. The local Wrangler preview failed with a runtime spawn error, so Worker integration is verified on the deployed release.

D1 coverage queries use a batch of individual counts to stay within its compound SELECT limit. Forecast counts include preserved model snapshots; the current model has 1,579 forecasts, while the release warehouse retains 4,737 forecasts across three model versions.

## Remaining full-goal work

- Obtain and ingest verified current recruiting/transfer/eligibility data, with dated authoritative sources and a clear distinction from roster listings.
- Expand historical player-game and play-by-play seasons, add possession/lineup analysis, and improve location validation beyond the new 2025–26 shooting lab.
- Add dated roster/efficiency features and rolling evaluations. The [shared ledger](RESEARCH_LEDGER.md) now implements prospective settlement and market comparisons; live feed validation and real future outcomes remain pending.
- Preserve completed matchup briefs and enrich major-game editorial analysis beyond generated statistical previews.
- Finish migrating remaining basketball archive tools to Next.js.
- Install monitored recurring ingestion/publishing and validate freshness against expected source coverage.
