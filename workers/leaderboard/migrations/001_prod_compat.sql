-- Production incremental migration (2026-08-21)
-- Align legacy D1 with workers/leaderboard/schema.sql

ALTER TABLE accounts ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'sha256';
ALTER TABLE accounts ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 1;
ALTER TABLE account_sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_cloud_saves ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS guest_identities (
    user_id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Backfill session expiry for existing tokens (30-day TTL from now)
UPDATE account_sessions
SET expires_at = CAST(strftime('%s', 'now') AS INTEGER) + 2592000
WHERE expires_at = 0 OR expires_at IS NULL;
