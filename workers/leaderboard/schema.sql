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

CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    account_key TEXT NOT NULL UNIQUE,
    account_label TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_sessions (
    token TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_cloud_saves (
    user_id TEXT PRIMARY KEY,
    permanent_cores INTEGER NOT NULL DEFAULT 0 CHECK (permanent_cores >= 0),
    talents_json TEXT NOT NULL DEFAULT '{}',
    unlocked_skins_json TEXT NOT NULL DEFAULT '["default"]',
    current_skin TEXT NOT NULL DEFAULT 'default',
    best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
    profile_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_history (
    match_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
    wave INTEGER NOT NULL DEFAULT 1 CHECK (wave >= 1),
    skin TEXT NOT NULL DEFAULT 'default',
    is_new_best INTEGER NOT NULL DEFAULT 0,
    permanent_cores_earned INTEGER NOT NULL DEFAULT 0 CHECK (permanent_cores_earned >= 0),
    played_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_match_history_user_time ON match_history(user_id, played_at DESC);
