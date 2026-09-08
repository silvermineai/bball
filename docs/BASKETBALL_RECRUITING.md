# School announcement evidence

The native `/basketball/recruiting/` board combines a linked publisher wire for national recruiting context with selected school announcements and explicitly reviewed links to historical college production. Its separate roster-observation view retains the unconfirmed source listings, prior-season program comparisons and recorded workload for matching prior player identities.

## Coverage and claims

The September 2026 review contains 96 announced additions across Alabama, Arkansas, Arizona, Duke, Hawaiʻi, Houston, Illinois, Kansas, Kentucky, Michigan, North Carolina, Oregon, Purdue and UConn: 50 college transfers, 41 prep additions and five international additions. It also includes Michigan's planned redshirt announcement for Lincoln Cosby and subsequent season-unavailable announcement for Brandon McCoy Jr. There are 98 events from 44 school articles. Coverage is partial, including within those fourteen programs. Counts are announced additions, not current eligible or available players. Missing records are not departures or evidence of no recruiting activity.

The publisher wire links to the retained ESPN article feed for context and does not copy article bodies, photographs or biographies. It now supports search across all retained recruiting-context stories, transfer/prep/draft/eligibility topic filters, shareable URLs, pagination and CSV export. It is not a transaction ledger: headlines and descriptions do not establish eligibility, destination or availability. The board does not contain proprietary recruiting grades, stars, rankings, valuations or contact information. These events do not change preseason forecasts. Prep and international statistics remain outside the college box-score archive.

Announcement cards with one exact normalized name-and-program match now hand off to the corresponding source player file and publisher roster record for manual review. The handoff is deliberately labeled as a review aid; it is not an identity, eligibility or transfer determination.

The recruiting board supports a twelve-player watch list. It stores source IDs in repeated `rosterPick` URL parameters, so a filtered review can be shared or reopened without a server account. The school-announcement coverage map also stores its program search, evidence status and sort order in `coverageQ`, `coverageStatus` and `coverageSort`, making an unreviewed-program queue shareable. The list is a research aid for source observations; it does not alter rankings, forecasts or transaction status.

When two or more names are saved, the watch list opens a side-by-side comparison of prior recorded minutes, per-game production, true shooting and effective field goal percentage, with a CSV export. It is a review aid for the selected source IDs: missing values stay blank, and the comparison does not convert a roster observation into a transfer, eligibility or projected-role claim.

Announcement cards also show a conservative cross-check against the current source roster: normalized full-name plus program matches are labeled exact, multiple matches are flagged for review, and no match is reported without treating it as absence. This joins two source observations for navigation only; it does not assert identity, eligibility or availability.

The roster-observation view also reports a team workload-continuity table. It sums exact source-athlete-ID minutes from the preceding season for listed returning players and prior-program additions. The table is a descriptive workload signal from an unconfirmed roster snapshot; it does not establish a depth chart, eligibility, availability or a forecast adjustment.

The continuity table is searchable and exportable across all 354 programs in the 2026–27 source listing. Sorting by returning-minute share, represented prior minutes or program name changes the research question without changing the underlying roster observations.

The same workload table is available in the recorded 2025–26 view across its 727 observed programs. That historical view uses playing time on both sides of the exact-ID comparison, so it describes observed continuity and different-program records without claiming a transfer event, reason or eligibility outcome.

The announcement view also includes an all-program coverage map. Each of the 354 source-listed programs is labeled either as having reviewed school announcements in this edition or as roster observation only, with announced-addition counts, linked prior profiles and workload context where available. This makes partial coverage visible instead of allowing an unlisted program to look like a confirmed zero.

## Source review

`data/recruiting/announcements.json` is the curated input. Each school has an explicit program ID, publisher and exact source host. Each article stores its original URL, title, publication calendar date, date evidence, review timestamp and any necessary editorial caveat. Source pages are consulted for brief independent factual reporting with attribution. There is no school-roster crawler, page mirror or automated article-body storage in this pipeline.

The reviewed SIDEARM terms do not provide permission for bulk republication of school pages: https://sidearmsports.com/sports/2022/12/7/terms-of-service. Robots permission alone is not a content license. Restricted direct ESPN and NCAA automated extraction remain disabled. Historical box statistics come from the separately attributed SportsDataverse bulk releases, labeled CC BY 4.0 by the publisher.

Publication dates come from displayed article dates or explicit publication metadata, not inferred transfer dates. Source-specific issues are documented in the input and visible in expanded evidence:

- Michigan's J.P. Estrella URL has April 26, but the displayed publication date and announcement text say April 28, 2026. The latter is used.
- Kentucky's Momcilovic signing article has an inconsistent closing season label. Its June 15 schedule announcement explicitly identifies him as a 2026–27 addition. UK publication dates were checked against `article:published_time` metadata.
- Hawaiʻi's June 9 update lists arrivals whose commitments may have occurred earlier. The board records the update date. Kellen Hampton has one recorded minute in one Pacific game in the box archive; the school describes a prior redshirt season. That tiny sample is retained with a visible caveat, not treated as a full-season role or eligibility ruling. Point Loma transfer Jaden Matingou has no matching profile in the linked release.
- Purdue's Caden Pierce announcement identifies a 2025–26 redshirt year at Princeton. No last-season stat link is manufactured from his 2024–25 production. The April 16 [Jamyn Sondrup announcement](https://purduesports.com/news/2026/04/16/sondrup-signs-with-the-boilermakers) explicitly defers his arrival until 2028–29, so he is outside this 2026–27 release.
- Kansas's May 1 Mordini article also identifies four previously signed freshmen. Their event summaries explicitly describe that update rather than claim May 1 as the original signing date; prior schools remain unrecorded where the cited article does not supply them. Freshman Trent Perry receives no college-stat link despite sharing a name with a college player.
- North Carolina’s August 21 roster announcement supplies the update date for its 11 newcomers. Cade Bennerman has no matching 2025–26 box profile. Neo Avdalas remains unlinked because the archive uses Neoklis Avdalas; the exact-name rule is preserved. Sayon Keita is categorized by his international club pathway even though the announcement lists him as a freshman.
- The current bulk player release shortens Arizona State’s “Marcus Adams Jr.” display name to “Marcus Adams.” That one reviewed person has an explicit, key-scoped provider-name alias; the exact team and athlete IDs are still required. No general suffix or fuzzy-name matching is enabled.
- Illinois additions use seven individually reviewed signing articles, including the three November 2025 announcements for 2026–27 freshmen.

Keep a signing and later availability statements as separate events. A planned redshirt is a school announcement, not an NCAA eligibility ruling. Current role, eligibility and availability cannot be inferred from a signing. The board shows the most recent reviewed statement; this is not a promise of real-time monitoring or an exhaustive availability review.

## Identities and history

Local person keys group editorial records for one announced player/program relationship. They are not global player IDs and are never joined to NCAA or ESPN IDs automatically. A historical stats reference must explicitly identify the reviewed player, prior team and season. The publisher requires exactly one normalized full-name AND prior-program match, matching the explicit IDs. Only punctuation/diacritics and six enumerated program spelling aliases are normalized. No fuzzy names, name-only joins or new-school roster inference are used. Ambiguity or a changed source identity stops publication.

There are 33 reviewed historical links. Historical per-game statistics retain season, previous team, game count and incomplete-box count. These statistics describe recorded appearances in 2025–26; they are not predicted production at the destination school. The board highlights samples below ten games and shows each latest statement without requiring the evidence drawer to be opened. The public release includes a canonical JSON hash (sorted keys, compact separators, UTF-8) of the whole historical player release to identify the exact linked edition.

Roster observations also carry an optional `prior_production` summary when the exact source athlete ID has recorded prior-season statistics: games, minutes, minutes per game, counting rates, shooting efficiency, usage rates and prior programs. These are aggregated across prior program stints using recorded game counts; they describe historical workload only and never establish transfer status, eligibility or a new-school role. The roster board can sort by prior minutes, points, rebounds, assists, true shooting or effective field goal percentage, and includes the full profile in its CSV export. Observation filters include source-reported position and class labels, alongside program/player search and movement status. They are encoded in `rosterSeason`, `rosterQ`, `rosterPosition`, `rosterClass`, `rosterStatus`, `rosterSort` and `rosterPage` query parameters so a staff can share the exact slice being reviewed.

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
