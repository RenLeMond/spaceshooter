-- Backfill leaderboard_entries from match_history rows missing on the global board (2026-08-21)

INSERT INTO leaderboard_entries (entry_id, user_id, score, ship_type, updated_at)
SELECT
  'lbe_' || lower(hex(randomblob(12))),
  mh.user_id,
  mh.score,
  mh.skin,
  mh.played_at
FROM match_history mh
WHERE mh.score > 0
  AND NOT EXISTS (
    SELECT 1
    FROM leaderboard_entries e
    WHERE e.user_id = mh.user_id
      AND e.score = mh.score
      AND e.updated_at = mh.played_at
  );

-- Refresh legacy best-score table for affected users
INSERT INTO leaderboards (user_id, score, ship_type, updated_at)
SELECT user_id, MAX(score), skin, MAX(played_at)
FROM match_history
WHERE score > 0
GROUP BY user_id
ON CONFLICT(user_id) DO UPDATE SET
  score = CASE WHEN excluded.score > leaderboards.score THEN excluded.score ELSE leaderboards.score END,
  ship_type = CASE WHEN excluded.score > leaderboards.score THEN excluded.ship_type ELSE leaderboards.ship_type END,
  updated_at = CASE WHEN excluded.score > leaderboards.score THEN excluded.updated_at ELSE leaderboards.updated_at END;
