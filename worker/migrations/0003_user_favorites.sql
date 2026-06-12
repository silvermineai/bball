CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INTEGER NOT NULL,
  favorite_type TEXT NOT NULL CHECK (favorite_type IN ('team', 'player')),
  entity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, favorite_type, entity_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_type ON user_favorites (user_id, favorite_type, created_at);
