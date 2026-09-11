#!/usr/bin/env python3
"""Validate and synchronize the retained publisher news release to Cloudflare D1."""

from __future__ import annotations

import os

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ncaa_scraper"))
from ncaa_scraper.news_rss import permitted_source_url  # noqa: E402

D1_DB_NAME = os.getenv("BASKETBALL_D1_DATABASE", "bball-research-v2")

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/data/news.json"
# 0029 is a one-time upgrade for databases that already had 0024. The base
# migration now declares the nullable column, and recurring syncs only replay
# the idempotent table/index creation so the scheduled job stays repeatable.
MIGRATIONS = (ROOT / "worker/migrations/0024_news_archive.sql",)
SQL = ROOT / ".local/news.sql"


def run_remote(arguments: list[str], *, attempts: int = 4) -> None:
    """Run one idempotent Wrangler request, retrying transient D1 failures."""
    for attempt in range(attempts):
        try:
            subprocess.run(arguments, cwd=ROOT, check=True)
            return
        except subprocess.CalledProcessError:
            if attempt + 1 >= attempts:
                raise
            time.sleep(10 * (2**attempt))


def sql_string(value: object) -> str:
    return "'" + str(value if value is not None else "").replace("'", "''") + "'"


def main() -> None:
    release = json.loads(PUBLIC.read_text())
    if not isinstance(release, dict) or int(release.get("schema_version", 0)) < 2:
        raise SystemExit("news.json is not a supported RSS release")
    articles = release.get("articles")
    feeds = release.get("feeds")
    generated_at = str(release.get("generated_at") or "")
    if not isinstance(articles, list) or not isinstance(feeds, list) or not generated_at:
        raise SystemExit("news.json is missing release metadata")
    normalized: list[dict[str, object]] = []
    allowed_divisions = {"D-I", "D-II", "D-III"}
    for article in articles:
        if not isinstance(article, dict):
            raise SystemExit("news.json contains a malformed article")
        required = ("id", "publisher", "sport", "headline", "published", "link")
        if any(not str(article.get(key) or "").strip() for key in required):
            raise SystemExit("news.json contains an article without required source fields")
        if not permitted_source_url(str(article["link"]), str(article["publisher"])):
            raise SystemExit("news.json contains a source link outside the declared publisher")
        categories = article.get("categories")
        if not isinstance(categories, list) or any(not isinstance(v, str) for v in categories):
            raise SystemExit("news.json contains malformed article categories")
        division = article.get("division")
        if division is not None and str(division) not in allowed_divisions:
            raise SystemExit("news.json contains an unsupported NCAA division")
        normalized.append(
            {
                "id": str(article["id"]),
                "publisher": str(article["publisher"]),
                "sport": str(article["sport"]),
                "division": str(division) if division is not None else None,
                "headline": str(article["headline"]),
                "description": str(article.get("description") or ""),
                "published": str(article["published"]),
                "link": str(article["link"]),
                "categories": categories,
                "author": str(article.get("author") or ""),
            }
        )
    edition = hashlib.sha256(
        json.dumps(release, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    SQL.parent.mkdir(parents=True, exist_ok=True)
    statements = [
        f"INSERT OR IGNORE INTO bb_news_releases (edition,generated_at,article_count,feeds_json) VALUES ({sql_string(edition)},{sql_string(generated_at)},{len(normalized)},{sql_string(json.dumps(feeds, ensure_ascii=False, separators=(',', ':'))) });",
    ]
    for article in normalized:
        categories_json = json.dumps(article["categories"], ensure_ascii=False, separators=(",", ":"))
        statements.append(
            "INSERT INTO bb_news_articles "
            "(id,publisher,sport,division,headline,description,published,link,categories_json,author,first_seen_at,last_seen_at) VALUES "
            f"({sql_string(article['id'])},{sql_string(article['publisher'])},{sql_string(article['sport'])},"
            f"{sql_string(article['division'])},"
            f"{sql_string(article['headline'])},{sql_string(article['description'])},{sql_string(article['published'])},"
            f"{sql_string(article['link'])},{sql_string(categories_json)},{sql_string(article['author'])},"
            f"{sql_string(generated_at)},{sql_string(generated_at)}) "
            "ON CONFLICT(id) DO UPDATE SET publisher=excluded.publisher,sport=excluded.sport,division=excluded.division,"
            "headline=excluded.headline,description=excluded.description,published=excluded.published,"
            "link=excluded.link,categories_json=excluded.categories_json,author=excluded.author,"
            "last_seen_at=excluded.last_seen_at;"
        )
    SQL.write_text("\n".join(statements) + "\n")
    for migration in MIGRATIONS:
        run_remote(
            [sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", D1_DB_NAME, "--remote", "--file", str(migration)],
        )
    # D1's import endpoint can spend a long time on an otherwise tiny file
    # when the database is busy. Execute idempotent chunks through the query
    # endpoint instead; a rerun safely updates only the same source IDs.
    # Do not wrap these commands in SQL BEGIN/COMMIT statements. D1's query
    # endpoint handles each idempotent statement safely, while explicit SQL
    # transactions are rejected by the API and can leave a refresh half done.
    # Keep each write independent. D1 occasionally returns an internal error
    # for a multi-statement request while the same idempotent single statement
    # succeeds; one-row requests also make retries resume at a clear boundary.
    commands = statements
    for command in commands:
        run_remote(
            [sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", D1_DB_NAME, "--remote", "--command", command],
        )
    print(json.dumps({"edition": edition, "articles": len(normalized), "generated_at": generated_at}))


if __name__ == "__main__":
    main()
