-- Snake game leaderboard table
CREATE TABLE IF NOT EXISTS snake_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  hints_used INTEGER DEFAULT 0,
  initials TEXT CHECK(length(initials) <= 3),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(puzzle_id, anon_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_snake_puzzle_time 
  ON snake_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_snake_puzzle_created 
  ON snake_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_snake_puzzle_anon 
  ON snake_scores(puzzle_id, anon_id);

-- Pathways game leaderboard table
CREATE TABLE IF NOT EXISTS pathways_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  hints_used INTEGER DEFAULT 0,
  initials TEXT CHECK(length(initials) <= 3),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(puzzle_id, anon_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_pathways_puzzle_time 
  ON pathways_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_pathways_puzzle_created 
  ON pathways_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pathways_puzzle_anon 
  ON pathways_scores(puzzle_id, anon_id);
