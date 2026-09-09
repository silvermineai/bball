# Authorized recruiting evidence intake

The recruiting page separates the reviewed school-announcement file and source-listed roster observations from provider exports that the operator is explicitly licensed to use. The intake does not crawl ESPN, NCAA or school pages. It accepts a CSV supplied under an applicable provider agreement, validates source clocks and URLs, stores a SHA-256 receipt and keeps the raw row in the private D1 table `bb_recruiting_intake`.

The optional [`cbbd_recruiting` connector](../ncaa_scraper/ncaa_scraper/cbbd_recruiting.py) supports the licensed CollegeBasketballData API. It requests the portal, player-recruiting and team-recruiting endpoints server-side with `CBBD_API_KEY` from the environment or `~/.env`, retains each response in the separate private D1 table `bb_cbbd_recruiting`, and publishes only provider/kind counts and capture clocks through the coverage endpoint. The portal API supplies a season and eligibility field but no event date; the connector therefore does not fabricate a transfer date or merge these rows into the dated school-announcement board. Review the [CollegeBasketballData terms](https://collegebasketballdata.com/terms) and keep the key out of source control.

The public endpoint `/api/basketball/research/recruiting-intake?season=2027` exposes coverage metadata only: row count, provider names, status counts, latest capture clocks and provider capabilities. Its CBBD capability record identifies `year` as the season field and explicitly marks event dates unavailable. It never republishes the provider payload. Intake records do not alter forecasts, roster status, school-announcement history or an eligibility determination.

## CSV contract

Required columns are:

```text
record_id,season,player_name,player_source_id,from_program,from_program_id,to_program,to_program_id,status,status_date,source_published_on,source_url,source_publisher,captured_at
```

`status` must be one of `reported_transfer`, `reported_commitment`, `reported_withdrawal`, `reported_eligibility`, `reported_unavailability` or `reported_update`. Dates use `YYYY-MM-DD`; `captured_at` is an ISO-8601 timestamp with a timezone. Transfer and commitment rows require `from_program`. `source_url` and the supplied `--license-url` must be HTTPS URLs. The source and status dates cannot be after the capture clock, and future captures are rejected. A stable `record_id` is recommended; when omitted, the importer derives one from the file hash and row content.

The importer validates every row before writing SQL:

```bash
PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.recruiting_intake \
  authorized-recruiting.csv \
  --provider "Licensed Provider" \
  --license-url https://provider.example/terms
PYTHONPATH=ncaa_scraper .venv/bin/python scripts/sync-recruiting-intake.py
```

The first command writes `.local/recruiting-intake.sql` and prints the source hash. The second applies migration `0025_basketball_recruiting_intake.sql` and the idempotent rows to the remote D1 database. A malformed row rejects the complete export before the SQL is generated. Keep the provider agreement and any access credentials outside the repository.

For the authorized CBBD API path:

```bash
CBBD_API_KEY=... PYTHONPATH=ncaa_scraper .venv/bin/python -m ncaa_scraper.cbbd_recruiting --season 2027
PYTHONPATH=ncaa_scraper .venv/bin/python scripts/sync-cbbd-recruiting.py
```

The connector makes one bounded request per endpoint, spaces requests by one second, retries only transient provider responses, and fails before any call when no key is configured. The generated SQL is idempotent and keeps the exact source URL, response hash, capture clock and raw provider row in D1. No raw CBBD payload is returned to the browser or exposed as a bulk download.
