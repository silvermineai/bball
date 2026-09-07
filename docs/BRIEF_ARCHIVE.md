# Immutable matchup brief archive

The reading archive at [`/research/briefs/`](https://bball.silvermine.dev/research/briefs/) preserves the standalone reading view of every generated basketball and football matchup brief. It is a historical record of what the site captured, not a replacement for the live matchup page.

## What is retained

Each capture contains the rendered article, its local stylesheet and the allowlisted supporting files that the article links to. Application scripts, controls, browser-only preparation notes, React metadata and private user text are removed. The default statistical view remains. Downloads are rewritten to immutable archive object URLs, while links to live program, player, methodology and game-history pages remain live handoffs.

The archive labels its first-recorded timestamp separately from the forecast generation timestamp. A capture clock proves when this archive stored a view; it does not prove that the forecast was publicly available before a game or that it was the final version. A later capture of the same game gets a new revision and leaves earlier revisions readable. Removed or replaced live briefs can still be reached through their archived revisions; a current URL is redirected only after its live asset returns 404 and a matching archived game is found.

The first stored edition contains 2,323 game snapshots: 744 football and 1,579 basketball. It also stores the shared research ledger and the supporting football and basketball evidence files required by those pages. New deployments run the capture hook after the Worker deploy succeeds. If capture or verification fails, the deployment remains successful and the archiver can be retried with `scripts/archive-briefs.py` without redeploying.

## Storage and integrity

Archive bytes are gzip-compressed individually and concatenated into a content-addressed R2 pack. D1 records each SHA-256 digest, pack key, byte range, decompressed size and MIME type, plus immutable game/version metadata. The Worker validates the digest format, allowlisted pack key, range and MIME type before reading a bounded R2 range and decompressing it. It sends an immutable ETag and a restrictive content-security policy; missing R2 content returns a temporary error instead of a fabricated page.

The archiver verifies the local pack, downloads and verifies the R2 pack again, checks every dependency hash and reads back the D1 metadata after insertion. Objects are never replaced or deleted. Replaying a capture preserves existing object ranges and timestamps and appends no new bytes for already-known content.

## API and filtering

`GET /api/research/briefs` supports `sport=all|football|basketball`, a bounded team search, `game`, `view=latest|versions`, a page number and an internal `asof` sequence pin. The archive browser uses that pin when paging so a new deployment cannot reshuffle a multi-page browse. Search uses literal substring matching; wildcard characters are not SQL patterns.

`GET /archive/briefs/:sport/:game/:revision` serves a specific retained page. Supporting bytes are available at `/archive/brief-objects/:sha256`. Both routes are read-only and do not expose arbitrary R2 keys. The archive is intentionally separate from forecast registration and market evaluation: its snapshots do not create odds observations, settle games or alter the prospective scorecard.

## Build and verification

Build the static site before a capture:

```bash
npm --prefix frontend run build
PYTHONPATH=ncaa_scraper .venv/bin/python scripts/archive-briefs.py
```

The Python archive tests cover sanitization, dependency traversal, pack ranges, corruption, replay and append-only SQL. Worker tests cover query validation, bounded R2 reads, decompression, ETags, missing objects, retired URL fallback and pinned pagination. The browser QA script in `.local/brief-archive/qa.py` checks byte hashes, D1 pagination, both sports, filters, mobile widths, error/retry behavior and retired URLs against a local Worker when available; production checks use the same script without asserting a retired live asset.
