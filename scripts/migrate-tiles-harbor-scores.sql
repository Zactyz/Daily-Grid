-- Migration: add Tiles and BlindSlide (harbor) score tables
-- Safe to re-run (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS tiles_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  hints_used INTEGER DEFAULT 0,
  initials TEXT CHECK(length(initials) <= 3),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(puzzle_id, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_tiles_puzzle_time
  ON tiles_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_tiles_puzzle_created
  ON tiles_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tiles_puzzle_anon
  ON tiles_scores(puzzle_id, anon_id);

CREATE TABLE IF NOT EXISTS harbor_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  hints_used INTEGER DEFAULT 0,
  initials TEXT CHECK(length(initials) <= 3),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(puzzle_id, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_harbor_puzzle_time
  ON harbor_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_harbor_puzzle_created
  ON harbor_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_harbor_puzzle_anon
  ON harbor_scores(puzzle_id, anon_id);
