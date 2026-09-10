-- Preserve the NCAA division attached to a publisher RSS feed.
-- ESPN's broad feed remains division-neutral (NULL); NCAA D-I, D-II and
-- D-III feeds are stored with their supplied feed scope.
ALTER TABLE bb_news_articles ADD COLUMN division TEXT;
CREATE INDEX IF NOT EXISTS bb_news_articles_sport_division_published
  ON bb_news_articles(sport, division, published DESC, id DESC);
