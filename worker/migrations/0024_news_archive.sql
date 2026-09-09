-- Publisher-supplied basketball context headlines retained in D1.
-- Article bodies are never fetched; only the RSS fields and source URL are stored.
CREATE TABLE IF NOT EXISTS bb_news_articles (
  id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  sport TEXT NOT NULL,
  headline TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  published TEXT NOT NULL,
  link TEXT NOT NULL,
  categories_json TEXT NOT NULL CHECK(json_valid(categories_json)),
  author TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bb_news_articles_sport_published
  ON bb_news_articles(sport, published DESC, id DESC);
CREATE INDEX IF NOT EXISTS bb_news_articles_publisher
  ON bb_news_articles(publisher, published DESC);

CREATE TABLE IF NOT EXISTS bb_news_releases (
  edition TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  article_count INTEGER NOT NULL,
  feeds_json TEXT NOT NULL CHECK(json_valid(feeds_json)),
  first_recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bb_news_releases_generated
  ON bb_news_releases(generated_at DESC);
