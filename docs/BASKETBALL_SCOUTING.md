# Basketball program scouting

The native program library at `/basketball/programs/` contains 366 program dossiers. Each dossier combines the published preseason model with descriptive 2025–26 team games, player workloads, seven historical windows and questions to investigate on film. `/basketball/compare/` compares two programs on a home, road or neutral floor.

## Data edition and interpretation

`basketball_scouting.py` reads the existing local basketball warehouse and published overview/player index. It checks that the schedule, team-box and player-box source hashes match the published edition before producing derivatives. This release contains 12,062 team-game observations, 12,060 paired efficiency samples and 5,030 player/team entries across the model's 366 rated programs. This is an empirical model field, not a separately verified complete Division I membership list.

Profiles preserve the source edition, generation time and model ID. The compact index and individual JSON files are served through Cloudflare Assets; underlying source records and receipts remain in D1. This workflow does not alter forecast registrations or retrain the model.

## Statistical rules

- Each rate pools its own valid numerators and denominators. A missing field removes that game's contribution only from metrics requiring it. Completed scores still contribute to records when paired boxes are missing.
- Four Factors use effective shooting `(FGM + 0.5 × 3PM) / FGA`, turnovers divided by estimated possessions, offensive rebounds divided by available rebounds, and `FTA / FGA`. Possessions use the existing model's averaged two-sided estimate and 0.475 free-throw coefficient.
- Pace is normalized to 40 minutes, accounting for overtime. Raw efficiency and split factors are unadjusted. The main ratings board also publishes separate opponent-adjusted factor estimates for eFG%, turnovers, offensive rebounds and free-throw rate; those estimates are not substituted into the historical split cards.
- Full-season ranks require ten valid games per metric. Ties share competition rank; favorable percentiles use average tied positions. Style measures receive no favorable rank.
- Windows include the full season, last ten, last five, home, road, neutral and games against opponents ranked in the current model's top 50. The latter uses retrospective opponent rankings, not pregame knowledge. Split selection never refits the model.
- Player usage divides observed `FGA + 0.475 × FTA + TO` by team opportunities prorated by the player's minutes in the same games. Overtime contributes to available minutes. Usage is an estimate, not measured on-court possessions. DNPs and invalid or incomplete opportunities are excluded, and each sample count is exposed.
- AST/TO requires recorded positive turnovers. Three-point attempts and AST/TO show their own game counts. Missing values remain unavailable. The personnel table defaults to 200 recorded minutes and represents historical affiliations, not verified current availability.

Public formula references: [KenPom's Four Factors explanation](https://kenpom.com/blog/stats-explained/) and [Basketball Reference's glossary](https://www.basketball-reference.com/about/glossary.html). Source observations come from attributed SportsDataverse releases; no proprietary ratings are copied.

## Matchup workbench

The browser applies the same published coefficients and calibration as the Python model. Automated parity checks cover all 1,579 published basketball forecasts at their published score and probability precision. Changing the floor updates scores, win probability, total, pace and the nominal 80% margin range. Historical comparison windows affect descriptive statistics only.

The workbench also shows the model-term decomposition behind each scenario: league baseline, each team's own offense effect, opponent defense effect and venue effect. Those fitted effects sum to the displayed points-per-100-possession efficiency before pace converts them to scores. They explain the model's arithmetic; they do not identify player-level causes or replace the historical Four Factor and personnel evidence.

Hypothetical comparisons are not scheduled games and do not enter the prospective ledger. The game-plan workbench now places the source-listed 2026–27 roster view beside each scenario: returning, different-program, new-to-dataset and ambiguous observations are joined by the publisher athlete ID to prior workload when available. It reports both the returning share of matched prior minutes and the total prior workload represented by returning plus matched incoming players. The roster-continuity challenger now also uses minutes-weighted attributed publisher Box BPM for exact source IDs with coverage, with missing values withheld rather than imputed. The interactive desk displays the separately published challenger when both selected programs have usable prior and predicted net ratings. These are recruiting and rotation questions for a coach, not confirmed depth charts, departure claims or primary model inputs. The forecast still does not include current roster, injury or recruiting features, and a generated scenario is not evidence of betting value.

The roster impact lab also joins the challenger’s minutes-weighted publisher Box BPM fields by exact team ID. It can sort programs by represented Box BPM and exports prior, returning, represented and incoming BPM alongside workload and rating context. Missing source values remain unavailable; the fields are descriptive publisher context and do not change the primary forecast.

Program selections and venue now persist in the comparison URL (`a`, `b`, `venue=neutral|a|b`). Incoming matchup briefs preserve their actual designated floor, and swapping programs retains the physical home team. The [expanded briefs](BASKETBALL_BRIEFS.md) use the same scouting edition and link into the workbench.

## Rebuild and publish

```bash
# Rebuild derivatives from the current local data edition.
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_scouting

# Test, rebuild both frontends and deploy the current edition to Cloudflare.
.venv/bin/python scripts/publish-scouting.py
```

For fresh basketball source data, use `scripts/publish-basketball.py`, which now rebuilds these derivatives as part of its refresh. The scouting-only publisher needs the local source database; it does not redownload sources or change D1 schema.

Seven Python tests cover weighted rates, missingness, denominator guards, away-side reversal, overtime, ranking ties, usage and empty splits. Three frontend tests cover forecast parity, invalid selections and venue behavior. Browser verification also exercises filtering, split changes, chart inspection, player qualification and comparison controls.
