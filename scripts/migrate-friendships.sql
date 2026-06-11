-- Friends graph (Phase 2). Safe to re-run where IF NOT EXISTS applies.

CREATE TABLE IF NOT EXISTS friendships (
  user_id_a TEXT NOT NULL,
  user_id_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id_a, user_id_b),
  CHECK (user_id_a < user_id_b)
);

CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_id_a, status);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_id_b, status);
