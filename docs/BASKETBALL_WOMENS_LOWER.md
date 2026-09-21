# Women’s basketball lower-division coverage

The women’s D2 and D3 division desk now exposes three separate, source-scoped surfaces:

- the NCAA.com contest archive, keyed by its exact contest ID and explicit `division` request;
- source-native individual and team leaderboards, which retain names and team slugs without inventing stable athlete identities; and
- a descriptive team record board derived only from complete finals in that same contest archive.

The record board ranks each source team within its requested division by recorded win percentage, then average scoring margin, then points scored. It is a descriptive standings aid. It does not infer opponent strength, roster availability, eligibility, or a composite player/team grade. Incomplete finals remain in the retained schedule but do not enter records, and missing scores are never treated as zero.

The current lower-division schedule edition is a receipt-backed 2025 season capture. It may contain no future contests when the season has ended. Lower-division predictions remain unavailable until a separately validated model edition has a target-season schedule, exact team identity contract, historical training finals, calibration evidence, and source receipts. Division I women’s forecasts are published by the separate women’s model edition.

The source release, query contract, response receipts, and identity boundary remain visible in the readiness desk. No direct NCAA stats host crawl, name-only provider join, or Division I substitution is used.


## Historical rating evidence

`frontend/public/data/basketball/womens-lower-division-ratings.json` adds a bounded research artifact for each division. It fits a regularized score-margin rating and home-court term on the 2025 exact-division NCAA finals, then reports a chronological 80/20 within-season holdout. The artifact retains the source schedule SHA-256, all response receipts, exclusion counts, source-local team slug, and the holdout metrics. It is surfaced beside the D2/D3 schedule desk as a top-25 historical strength board.

This artifact is intentionally `research_only` and emits no future-game rows or probabilities. The current source has only one completed season and no `seasonYear=2026` lower-division target schedule, so publishing a 2026–27 forecast would overstate the evidence. The next model gate is a second receipt-backed exact-division season plus the 2026–27 target schedule; player availability, transfers, injuries, and cross-provider identity joins remain outside the current fit.
