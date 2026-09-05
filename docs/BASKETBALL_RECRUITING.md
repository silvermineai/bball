# School announcement evidence

The native `/basketball/recruiting/` board combines selected school announcements with explicitly reviewed links to historical college production. Its separate roster-observation view retains the unconfirmed source listings and prior-season program comparisons.

## Coverage and claims

The initial September 2026 review contains 27 announced additions across Arizona, Houston, Kentucky, Michigan and UConn: 17 college transfers, seven prep additions and three international additions. It also includes Michigan's planned redshirt announcement for Lincoln Cosby and subsequent season-unavailable announcement for Brandon McCoy Jr. There are 29 events from 20 school articles. Coverage is partial, including within those five programs. Counts are announced additions, not current eligible or available players. Missing records are not departures or evidence of no recruiting activity.

The board does not contain proprietary recruiting grades, stars, rankings, valuations, contact information, article bodies, photographs or copied biographies. These events do not change preseason forecasts. Prep and international statistics remain outside the college box-score archive.

## Source review

`data/recruiting/announcements.json` is the curated input. Each school has an explicit program ID, publisher and exact source host. Each article stores its original URL, title, publication calendar date, date evidence, review timestamp and any necessary editorial caveat. Source pages are consulted for brief independent factual reporting with attribution. There is no school-roster crawler, page mirror or automated article-body storage in this pipeline.

The reviewed SIDEARM terms do not provide permission for bulk republication of school pages: https://sidearmsports.com/sports/2022/12/7/terms-of-service. Robots permission alone is not a content license. Restricted direct ESPN and NCAA automated extraction remain disabled. Historical box statistics come from the separately attributed SportsDataverse bulk releases, labeled CC BY 4.0 by the publisher.

Publication dates come from displayed article dates or explicit publication metadata, not inferred transfer dates. Two source-specific issues are documented in the input and visible in expanded evidence:

- Michigan's J.P. Estrella URL has April 26, but the displayed publication date and announcement text say April 28, 2026. The latter is used.
- Kentucky's Momcilovic signing article has an inconsistent closing season label. Its June 15 schedule announcement explicitly identifies him as a 2026–27 addition. UK publication dates were checked against `article:published_time` metadata.

Keep a signing and later availability statements as separate events. A planned redshirt is a school announcement, not an NCAA eligibility ruling. Current role, eligibility and availability cannot be inferred from a signing. The board shows the most recent reviewed statement; this is not a promise of real-time monitoring or an exhaustive availability review.

## Identities and history

Local person keys group editorial records for one announced player/program relationship. They are not global player IDs and are never joined to NCAA or ESPN IDs automatically. A historical stats reference must explicitly identify the reviewed player, prior team and season. The publisher requires exactly one normalized full-name AND prior-program match, matching the explicit IDs. Only punctuation/diacritics and three enumerated program spelling aliases are normalized. No fuzzy names, name-only joins or new-school roster inference are used. Ambiguity or a changed source identity stops publication.

Historical per-game statistics retain season, previous team, game count and incomplete-box count. They describe recorded appearances in 2025–26; they are not predicted production at the destination school. The public release includes a canonical JSON hash (sorted keys, compact separators, UTF-8) of the whole historical player release to identify the exact linked edition.

## Storage and publishing

`ncaa_scraper.basketball_recruiting` validates the curated input and linked stats, then generates `frontend/public/data/basketball/recruiting.json` and ignored `.local/recruiting.sql`. It does not fetch external pages. The static Next.js page renders those records at build time, then hydrates its filters and evidence histories. Program dossiers link to their recruiting filter; unreviewed programs produce an explicit no-coverage state.

Cloudflare D1 migration `0012_basketball_recruiting.sql` provides:

- `bb_recruiting_evidence`: content-addressed event revisions with the corresponding person, source and historical stats.
- `bb_recruiting_releases`: immutable complete public editions.
- `bb_recruiting_current`: one active edition per season, written last.

Both evidence and release records get a database-generated `first_recorded_at`; repeated sync uses INSERT OR IGNORE and preserves that timestamp. Content changes create new revisions without deleting the earlier evidence. Source `published_on`, editorial `checked_at`, and database observation timestamps are different clocks. The retrospectively collected articles must not be backdated into a model training or betting evaluation cutoff.

`GET /api/basketball/research/recruiting?season=2027` reads one consistent active D1 edition and returns its actual database observation timestamp. Malformed seasons return 400; seasons without reviewed data return 404. The downloadable JSON is the same edition served as a Cloudflare asset.

Run from the project root:

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.basketball_recruiting
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p test_basketball_recruiting.py
.venv/bin/python scripts/publish-recruiting.py
```

The publish script builds and checks the site, dry-runs Worker deployment, validates source/public/SQL equality, syncs D1, then deploys. `publish-basketball.py` also regenerates and validates recruiting after a historical stats refresh. No refresh changes editorial review timestamps unless source review actually occurred.

Tests cover wrong-prior-team joins, duplicate identities, explicit ID mismatch, off-domain sources, invalid chronology, publication-date discrepancies, availability histories, same-day redshirt precedence, immutable observation timestamps and retained revisions. Browser QA covers filters, prior-player links, expanded evidence, the unknown-program state, mobile layout and the preserved roster observations.
