#!/usr/bin/env python3
"""Validate and synchronize the retained publisher news release to Cloudflare D1."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/data/news.json"
MIGRATION = ROOT / "worker/migrations/0024_news_archive.sql"
SQL = ROOT / ".local/news.sql"


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
    for article in articles:
        if not isinstance(article, dict):
            raise SystemExit("news.json contains a malformed article")
        required = ("id", "publisher", "sport", "headline", "published", "link")
        if any(not str(article.get(key) or "").strip() for key in required):
            raise SystemExit("news.json contains an article without required source fields")
        categories = article.get("categories")
        if not isinstance(categories, list) or any(not isinstance(v, str) for v in categories):
            raise SystemExit("news.json contains malformed article categories")
        normalized.append(
            {
                "id": str(article["id"]),
                "publisher": str(article["publisher"]),
                "sport": str(article["sport"]),
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
        "BEGIN;",
        f"INSERT OR IGNORE INTO bb_news_releases (edition,generated_at,article_count,feeds_json) VALUES ({sql_string(edition)},{sql_string(generated_at)},{len(normalized)},{sql_string(json.dumps(feeds, ensure_ascii=False, separators=(',', ':'))) });",
    ]
    for article in normalized:
        categories_json = json.dumps(article["categories"], ensure_ascii=False, separators=(",", ":"))
        statements.append(
            "INSERT INTO bb_news_articles "
            "(id,publisher,sport,headline,description,published,link,categories_json,author,first_seen_at,last_seen_at) VALUES "
            f"({sql_string(article['id'])},{sql_string(article['publisher'])},{sql_string(article['sport'])},"
            f"{sql_string(article['headline'])},{sql_string(article['description'])},{sql_string(article['published'])},"
            f"{sql_string(article['link'])},{sql_string(categories_json)},{sql_string(article['author'])},"
            f"{sql_string(generated_at)},{sql_string(generated_at)}) "
            "ON CONFLICT(id) DO UPDATE SET publisher=excluded.publisher,sport=excluded.sport,"
            "headline=excluded.headline,description=excluded.description,published=excluded.published,"
            "link=excluded.link,categories_json=excluded.categories_json,author=excluded.author,"
            "last_seen_at=excluded.last_seen_at;"
        )
    statements.append("COMMIT;")
    SQL.write_text("\n".join(statements) + "\n")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", "bball-silvermine", "--remote", "--file", str(MIGRATION)],
        cwd=ROOT,
        check=True,
    )
    # D1's import endpoint can spend a long time on an otherwise tiny file
    # when the database is busy. Execute idempotent chunks through the query
    # endpoint instead; a rerun safely updates only the same source IDs.
    lines = statements
    commands = [lines[1]] + ["\n".join(lines[start : start + 5]) for start in range(2, len(lines) - 1, 5)]
    for command in commands:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/cloudflare.py"), "d1", "execute", "bball-silvermine", "--remote", "--command", command],
            cwd=ROOT,
            check=True,
        )
    print(json.dumps({"edition": edition, "articles": len(normalized), "generated_at": generated_at}))


if __name__ == "__main__":
    main()
