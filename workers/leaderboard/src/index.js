const ALLOWED_SHIPS = new Set(['default', 'void', 'thunder', 'imperial']);
const USER_ID_RE = /^usr_[a-z0-9]{8,32}$/;
const MAX_JSON_BODY_BYTES = 4096;
const DEFAULT_ALLOWED_ORIGINS = 'https://renlimeng.qzz.io,https://rlmbest.xyz,http://localhost:8787,http://127.0.0.1:8787,http://localhost:8080,http://127.0.0.1:8080,http://localhost:9999,http://127.0.0.1:9999';
const RATE_LIMITS = {
  '/api/leaderboard': { limit: 120, windowSeconds: 60 },
  '/api/submit-score': { limit: 20, windowSeconds: 60 }
};

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/submit-score' && request.method === 'POST' && isBodyTooLarge(request)) {
        return jsonResponse({ error: 'payload_too_large' }, corsHeaders, 413);
      }

      const rateConfig = RATE_LIMITS[url.pathname];
      if (rateConfig) {
        const rate = await checkRateLimit(env.DB, request, url.pathname, rateConfig);
        if (!rate.allowed) {
          return jsonResponse({ error: 'rate_limited', retry_after: rate.retryAfter }, corsHeaders, 429);
        }
      }

      if (url.pathname === '/api/health') {
        await env.DB.prepare('SELECT 1').first();
        return jsonResponse({ ok: true, service: 'starsea-leaderboard' }, corsHeaders);
      }

      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const limit = clampInt(url.searchParams.get('limit'), 1, 50, 50);
        const rows = await getLeaderboardRows(env.DB, limit);
        return jsonResponse({ entries: rows }, corsHeaders);
      }

      if (url.pathname === '/api/player' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        if (!USER_ID_RE.test(userId)) {
          return jsonResponse({ error: 'invalid user_id' }, corsHeaders, 400);
        }
        const player = await getPlayerRecord(env.DB, userId);
        return jsonResponse(player || { user_id: userId, score: 0, ship_type: 'default', rank: null }, corsHeaders);
      }

      if (url.pathname === '/api/submit-score' && request.method === 'POST') {
        const payload = await readJson(request);
        const userId = String(payload.user_id || '');
        const username = sanitizeUsername(payload.username);
        const score = clampInt(payload.score, 0, 999999999, 0);
        const shipType = ALLOWED_SHIPS.has(payload.ship_type) ? payload.ship_type : 'default';

        if (!USER_ID_RE.test(userId)) {
          return jsonResponse({ error: 'invalid user_id' }, corsHeaders, 400);
        }
        if (!username) {
          return jsonResponse({ error: 'invalid username' }, corsHeaders, 400);
        }

        const result = await upsertScore(env.DB, userId, username, score, shipType);
        return jsonResponse({ success: true, ...result }, corsHeaders);
      }

      return jsonResponse({ error: 'not found' }, corsHeaders, 404);
    } catch (err) {
      console.error(err);
      return jsonResponse({ error: 'internal_error', message: String(err.message || err) }, corsHeaders, 500);
    }
  }
};

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const allowOrigin = allowed.includes('*')
    ? '*'
    : (allowed.includes(origin) ? origin : allowed[0] || '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function parseAllowedOrigins(value) {
  return String(value || DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function jsonResponse(body, corsHeaders, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isBodyTooLarge(request) {
  const contentLength = request.headers.get('Content-Length');
  if (!contentLength) return false;
  const bytes = Number.parseInt(contentLength, 10);
  return Number.isFinite(bytes) && bytes > MAX_JSON_BODY_BYTES;
}

async function checkRateLimit(db, request, pathname, config) {
  await ensureRateLimitTable(db);

  const now = Math.floor(Date.now() / 1000);
  const ip = getClientIp(request);
  const key = `${pathname}:${ip}`;
  const current = await db.prepare(`
    SELECT count, window_start
    FROM request_rate_limits
    WHERE key = ?1
  `).bind(key).first();

  if (current && now - current.window_start < config.windowSeconds) {
    if (current.count >= config.limit) {
      return {
        allowed: false,
        retryAfter: Math.max(1, config.windowSeconds - (now - current.window_start))
      };
    }

    await db.prepare(`
      UPDATE request_rate_limits
      SET count = count + 1
      WHERE key = ?1
    `).bind(key).run();
    return { allowed: true };
  }

  await db.prepare(`
    INSERT INTO request_rate_limits (key, count, window_start)
    VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET
      count = 1,
      window_start = excluded.window_start
  `).bind(key, now).run();

  await db.prepare(`
    DELETE FROM request_rate_limits
    WHERE window_start < ?1
  `).bind(now - 3600).run();

  return { allowed: true };
}

async function ensureRateLimitTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS request_rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL
    )
  `).run();
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
}

function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeUsername(value) {
  return String(value || '')
    .trim()
    .replace(/[<>"'`\\]/g, '')
    .slice(0, 12);
}

async function getLeaderboardRows(db, limit) {
  const { results } = await db.prepare(`
    SELECT
      l.user_id,
      u.username,
      l.score,
      l.ship_type,
      l.updated_at
    FROM leaderboards l
    JOIN users u ON u.id = l.user_id
    ORDER BY l.score DESC, l.updated_at ASC
    LIMIT ?1
  `).bind(limit).all();

  return (results || []).map((row, index) => ({
    rank: index + 1,
    user_id: row.user_id,
    username: row.username,
    score: row.score,
    ship_type: row.ship_type,
    updated_at: row.updated_at
  }));
}

async function getPlayerRecord(db, userId) {
  const row = await db.prepare(`
    SELECT l.user_id, u.username, l.score, l.ship_type, l.updated_at
    FROM leaderboards l
    JOIN users u ON u.id = l.user_id
    WHERE l.user_id = ?1
  `).bind(userId).first();

  if (!row) return null;

  const rankRow = await db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM leaderboards
    WHERE score > ?1
       OR (score = ?1 AND (updated_at < ?2 OR (updated_at = ?2 AND user_id < ?3)))
  `).bind(row.score, row.updated_at, row.user_id).first();

  return {
    user_id: row.user_id,
    username: row.username,
    score: row.score,
    ship_type: row.ship_type,
    updated_at: row.updated_at,
    rank: rankRow ? rankRow.rank : null
  };
}

async function upsertScore(db, userId, username, score, shipType) {
  const previous = await db.prepare(`
    SELECT score FROM leaderboards WHERE user_id = ?1
  `).bind(userId).first();

  const userWrite = db.prepare(`
    INSERT INTO users (id, username, is_guest)
    VALUES (?1, ?2, 1)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username
  `).bind(userId, username);

  if (score <= 0 && !previous) {
    await userWrite.run();
    return {
      updated: false,
      previous_score: 0,
      score: 0,
      ship_type: shipType,
      updated_at: null
    };
  }

  const leaderboardWrite = db.prepare(`
    INSERT INTO leaderboards (user_id, score, ship_type, updated_at)
    VALUES (?1, ?2, ?3, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      score = CASE WHEN excluded.score > leaderboards.score THEN excluded.score ELSE leaderboards.score END,
      ship_type = CASE WHEN excluded.score > leaderboards.score THEN excluded.ship_type ELSE leaderboards.ship_type END,
      updated_at = CASE WHEN excluded.score > leaderboards.score THEN datetime('now') ELSE leaderboards.updated_at END
  `).bind(userId, score, shipType);

  if (typeof db.batch === 'function') {
    await db.batch([userWrite, leaderboardWrite]);
  } else {
    await userWrite.run();
    await leaderboardWrite.run();
  }

  const current = await db.prepare(`
    SELECT score, ship_type, updated_at FROM leaderboards WHERE user_id = ?1
  `).bind(userId).first();

  const previousScore = previous ? previous.score : 0;
  const currentScore = current ? current.score : score;

  return {
    updated: currentScore > previousScore,
    previous_score: previousScore,
    score: currentScore,
    ship_type: current ? current.ship_type : shipType,
    updated_at: current ? current.updated_at : null
  };
}
