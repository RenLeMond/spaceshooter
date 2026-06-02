-- 星海猎手 V7 全球排行榜 D1 Schema
-- 初始化: wrangler d1 execute e92c11bf-8429-471d-93ea-9fe086c3b3f5 --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'fa-user-astronaut',
    bio TEXT NOT NULL DEFAULT '',
    is_guest INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE TABLE IF NOT EXISTS leaderboards (
    user_id TEXT PRIMARY KEY,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
    ship_type TEXT NOT NULL DEFAULT 'default',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_score ON leaderboards(score DESC);

CREATE TABLE IF NOT EXISTS request_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_window ON request_rate_limits(window_start);
