# NCAA national individual leaderboards

`/basketball/ncaa/` publishes the final 2025–26 men’s basketball national-ranking snapshots for Divisions I, II and III. The page keeps NCAA player IDs, source-listed program names, class, position, games and the published scoring, rebounding, assist, shooting, minutes, assist/turnover and double-double fields in their own identity namespace.

The source pages are fetched only through `ScraplingNCAAFetcher`, which requires HTTPS, checks `stats.ncaa.org/robots.txt`, rate-limits requests, rejects access-denied responses and caches the response. The current edition reprocesses cached snapshots that were previously stored as escaped byte representations; it makes no new request when rebuilding from the existing cache. The public JSON is a structured derivative and does not mirror page HTML. The NCAA navigation currently identifies `216.0` as assists per game; the scraper uses that sequence and retains `140.0` only as a compatibility fallback for older editions. Missing statistic values reflect a source page that did not publish a matching qualifying row, and counts vary by division and statistic. The browser includes a division-by-measure coverage matrix so readers can inspect those nulls before sorting or exporting a leaderboard.

`ncaa_individual.py` writes `frontend/public/data/basketball/ncaa-individual.json` and `.local/ncaa-individual.sql`. After the basketball box release is available, `ncaa_individual_enrichment` supplements unavailable assists-per-game values only when the exact NCAA player ID appears in the same-season NCAA player-box table; it records the source receipt, denominator and lack of publisher rank in `supplements.apg`. Migration `0016_ncaa_individual.sql` stores the complete player payload in Cloudflare D1 with searchable summary columns. `scripts/sync-ncaa-individual.py` regenerates the idempotent SQL on every publication and activates the D1 rows. The Worker endpoint `/api/basketball/research/ncaa-leaders` provides a paginated D1 view for integrations and returns a `provenance` object; APG responses are explicitly marked exact-ID-derived with no publisher rank, while other measures are marked as publisher snapshots.

NCAA IDs are never joined to ESPN or SportsDataverse IDs by name. The board is a source leaderboard, not a complete player census, recruiting grade or Silvermine projection.

```sh
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.ncaa_individual --divisions 1 2 3
PYTHONPATH=ncaa_scraper .venv/bin/python -m unittest discover -s ncaa_scraper/tests -p 'test_ncaa_individual.py'
.venv/bin/python scripts/sync-ncaa-individual.py
```
