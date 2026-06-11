-- Add user_id to all score tables (idempotent via pragma check pattern — run once)

ALTER TABLE snake_scores ADD COLUMN user_id TEXT;
ALTER TABLE pathways_scores ADD COLUMN user_id TEXT;
ALTER TABLE lattice_scores ADD COLUMN user_id TEXT;
ALTER TABLE bits_scores ADD COLUMN user_id TEXT;
ALTER TABLE hashi_scores ADD COLUMN user_id TEXT;
ALTER TABLE shikaku_scores ADD COLUMN user_id TEXT;
ALTER TABLE conduit_scores ADD COLUMN user_id TEXT;
ALTER TABLE perimeter_scores ADD COLUMN user_id TEXT;
ALTER TABLE polyfit_scores ADD COLUMN user_id TEXT;
ALTER TABLE tiles_scores ADD COLUMN user_id TEXT;
ALTER TABLE harbor_scores ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_snake_user_puzzle ON snake_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_pathways_user_puzzle ON pathways_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_lattice_user_puzzle ON lattice_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_bits_user_puzzle ON bits_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_hashi_user_puzzle ON hashi_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_shikaku_user_puzzle ON shikaku_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_conduit_user_puzzle ON conduit_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_perimeter_user_puzzle ON perimeter_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_polyfit_user_puzzle ON polyfit_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_tiles_user_puzzle ON tiles_scores(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_harbor_user_puzzle ON harbor_scores(user_id, puzzle_id);
