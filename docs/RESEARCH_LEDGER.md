# Forecast record and market comparisons

The shared Next.js scorecard lives at `/research/scorecard/`. Individual game history at `/research/game/?sport=football&id=…` reads Cloudflare D1 through a paginated, read-only API. Basketball uses `sport=basketball`.

## Current edition

The current registration contains 2,323 forecasted games: 744 football and 1,579 basketball. Confirmed start times make 312 football and 99 basketball games eligible for future scoring; three additional football games are awaiting a result. The other 1,879 games remain visible but excluded because their source start time is unconfirmed. Thirty football games have settled in the prospective record; basketball has no settled games yet. There are no licensed-feed quote observations in this edition. Missing metrics are null, not zero accuracy.

The football calibration release on September 5, 2026 adds 744 immutable v2 registrations. Subsequent basketball refreshes preserve every earlier registration while adding a new immutable model fingerprint when the published model edition changes; the ledger now retains 13,252 versions across the same 2,323 games (2,199 football and 11,053 basketball). The earliest eligible registration still supplies each game's prospective selection. All versions remain available through the game-history API. See [football calibration methodology](FOOTBALL.md#model-design).

This prospective record is separate from each model's retrospective holdout. Registration times are local pipeline observations, not independently notarized public release times. Existing generated forecasts are registered at the time this ledger first sees them; their registration time is never backdated to the earlier model generation date.

## Storage and selection

`0010_research_ledger.sql` creates five separate `audit_*` tables in D1. The local warehouse is ignored `.local/research-ledger.sqlite3`. Predictions contain the original game participants, start time/confirmation, model cutoff, generation time, first registration time and full estimate. The `(sport,game,model)` registration is immutable. Reusing that identity with changed predictions is an error. D1 exports use `INSERT OR IGNORE`, never replacement.

Game state observations preserve source URL, retrieval time and file SHA-256. Consecutive identical observations are deduplicated; corrections, including a return to a prior result, append another observation. Older observations never replace newer states. History is paginated in D1 rather than silently truncated in the UI.

Evaluation policy `first-eligible-registration-v1` chooses one forecast per game before examining its result: the earliest eligible local registration. An eligible forecast has confirmed, unchanged participants and start time, with model cutoff ≤ generation ≤ registration < scheduled start. If the schedule changes, the old registration stays excluded; a new eligible model version may qualify later. Missing, inconsistent or unscored finals do not contribute to metrics. Results include overtime. As-of reports ignore observations and registrations from after their cutoff. The public `games` array keeps that one-row-per-game selection; the companion `versions` array retains every immutable registration and its qualifying market comparisons so native matchup briefs can verify the active model without changing prospective scoring.

Metrics include margin/total MAE, winner accuracy, Brier score, log loss and empirical interval coverage. Each metric exposes its sample count. Tied outcomes are excluded from binary metrics, and exactly 50% probabilities produce no winner pick. Corrected source finals can revise a later report without changing the original prediction.

## Licensed odds connector

`odds_feed.py` implements [The Odds API v4](https://the-odds-api.com/liveapi/guides/v4/). Its [terms](https://the-odds-api.com/terms-and-conditions.html) permit storage, analytical UI display and derived values while prohibiting resale as a competing raw data service. No subscription has been purchased and no account has been created. No sports-odds credential was configured at release, so the connector has fixture-based validation but has not been verified against a live account.

When a quote is available, comparisons expose the bookmaker overround—the sum of both implied prices minus one—alongside the model’s point or probability difference. Moneyline comparisons also show the normalized, vig-adjusted home probability. Spread and total edges remain point differences because the production model does not claim a market-outcome distribution.

Set `THE_ODDS_API_KEY` (or `ODDS_API_KEY`) in the process environment or `~/.env`. Never put it in frontend code. A manual run requests one US-region snapshot of the three standard markets (head-to-head, spreads and totals), at most once per selected sport. The default horizon is seven days, capped at fourteen. Sports without confirmed upcoming games in that window are skipped. There are no automatic retries, redirect following or hidden historical-data purchases. Quota response headers, safe query parameters, capture time and source hash are retained; error bodies and authenticated URLs are not logged. Each response is bounded to 10 MB.

Provider events must match exactly one known game using exact normalized program names/source aliases, home/away ordering, and confirmed start time. No fuzzy name matching, reverse-home inference, or guessed date joins occur. Ambiguous/unmatched events and invalid markets are retained privately for review. Standard markets require two distinct outcomes, valid decimal prices, opposite spread points or equal total points, and a provider update no later than capture.

A comparison additionally requires registration ≤ capture < start and provider update ≤ capture. A quote older than 24 hours at capture is excluded. The last qualifying observation per provider/bookmaker/market is used; it is explicitly not a verified closing line. It may also be stale when the reader opens the site, so its capture/update times are shown.

Model and market errors are compared on exactly the same settled games, separately by bookmaker and market. A positive spread difference (`model home margin + home spread`) favors the home side; positive total difference favors over. Moneyline probabilities normalize the two inverse decimal prices to remove the two-way overround. Direction wins/losses/pushes are hypothetical source-score results, not placed bets, execution prices, official bookmaker settlement or profit estimates.

The legacy SportsDataverse betting archive remains outside this evaluation because it does not provide a verified publisher clock/bookmaker. Its importer no longer promotes future archive rows to verified pregame observations solely because they were downloaded before a scheduled game.

## Refresh and publish

```bash
# Register current generated forecasts, observe local source states, generate scorecard and D1 SQL
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.research_ledger --sql .local/research-ledger.sql

# Optional: capture from an already-configured licensed account
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.odds_feed --sport both

# Validate/build/sync/deploy the current scorecard; add --odds for the optional capture
.venv/bin/python scripts/publish-research.py
```

Refresh football or basketball first to obtain updated schedules and results. Both existing sport publish scripts now register forecasts and observe source states before rebuilding, then sync append-only ledger rows to D1 before deployment. The repository defines a serialized weekly GitHub Actions refresh in [`.github/workflows/refresh-research.yml`](../.github/workflows/refresh-research.yml), with manual sport selection and an opt-in licensed odds step. The workflow runs a release-health gate for generated timestamps and structural coverage before deployment. Repository secrets are required before its first run. Live account validation, settlement against future real finals and verified closing-line feeds remain open work.

## Release verification

The release passed 27 Python tests (source/model/ledger integrity), five Worker API/routing tests, Worker type checking and the combined Next.js/legacy production build. Browser checks covered desktop/mobile scorecards, sport/status/search filters, live D1 prediction/state histories and archive routing. Settled spread/total/moneyline rendering was checked with isolated browser test data; no fabricated market observations were published. Replaying all 4,646 D1 insert statements wrote zero rows, and sampled original registration timestamps remained unchanged. The first scheduled weekly refresh completed successfully on September 7, 2026, including validation and combined Cloudflare deployment. Live odds collection remains unverified because no provider credential is configured.
