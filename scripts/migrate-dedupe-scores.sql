-- Remove duplicate daily scores per account (keep earliest submission).
-- Safe to re-run: only deletes rows where a strictly earlier row exists for the same puzzle + account.
-- Account key: COALESCE(user_id, anon_id)

-- Run once per table, e.g.:
--   npx wrangler d1 execute daily-grid-db --remote --file=scripts/migrate-dedupe-scores.sql

DELETE FROM snake_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM snake_scores
  ) WHERE rn > 1
);

DELETE FROM pathways_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM pathways_scores
  ) WHERE rn > 1
);

DELETE FROM lattice_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM lattice_scores
  ) WHERE rn > 1
);

DELETE FROM bits_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM bits_scores
  ) WHERE rn > 1
);

DELETE FROM hashi_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM hashi_scores
  ) WHERE rn > 1
);

DELETE FROM shikaku_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM shikaku_scores
  ) WHERE rn > 1
);

DELETE FROM conduit_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM conduit_scores
  ) WHERE rn > 1
);

DELETE FROM perimeter_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM perimeter_scores
  ) WHERE rn > 1
);

DELETE FROM polyfit_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM polyfit_scores
  ) WHERE rn > 1
);

DELETE FROM tiles_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM tiles_scores
  ) WHERE rn > 1
);

DELETE FROM harbor_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY puzzle_id, COALESCE(user_id, anon_id)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM harbor_scores
  ) WHERE rn > 1
);
