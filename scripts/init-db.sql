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

-- Lattice game leaderboard table
CREATE TABLE IF NOT EXISTS lattice_scores (
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
CREATE INDEX IF NOT EXISTS idx_lattice_puzzle_time 
  ON lattice_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_lattice_puzzle_created 
  ON lattice_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lattice_puzzle_anon 
  ON lattice_scores(puzzle_id, anon_id);

-- Hashi (Bridgeworks) game leaderboard table
CREATE TABLE IF NOT EXISTS hashi_scores (
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
CREATE INDEX IF NOT EXISTS idx_hashi_puzzle_time 
  ON hashi_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_hashi_puzzle_created 
  ON hashi_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_hashi_puzzle_anon 
  ON hashi_scores(puzzle_id, anon_id);

-- Bits game leaderboard table
CREATE TABLE IF NOT EXISTS bits_scores (
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
CREATE INDEX IF NOT EXISTS idx_bits_puzzle_time 
  ON bits_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_bits_puzzle_created 
  ON bits_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_bits_puzzle_anon 
  ON bits_scores(puzzle_id, anon_id);

-- Shikaku (Parcel) game leaderboard table
CREATE TABLE IF NOT EXISTS shikaku_scores (
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
CREATE INDEX IF NOT EXISTS idx_shikaku_puzzle_time 
  ON shikaku_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_shikaku_puzzle_created 
  ON shikaku_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_shikaku_puzzle_anon 
  ON shikaku_scores(puzzle_id, anon_id);

-- Conduit game leaderboard table
CREATE TABLE IF NOT EXISTS conduit_scores (
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
CREATE INDEX IF NOT EXISTS idx_conduit_puzzle_time 
  ON conduit_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_conduit_puzzle_created 
  ON conduit_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conduit_puzzle_anon 
  ON conduit_scores(puzzle_id, anon_id);

-- Perimeter game leaderboard table
CREATE TABLE IF NOT EXISTS perimeter_scores (
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
CREATE INDEX IF NOT EXISTS idx_perimeter_puzzle_time 
  ON perimeter_scores(puzzle_id, time_ms);

CREATE INDEX IF NOT EXISTS idx_perimeter_puzzle_created 
  ON perimeter_scores(puzzle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_perimeter_puzzle_anon 
  ON perimeter_scores(puzzle_id, anon_id);
