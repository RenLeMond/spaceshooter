const ALLOWED_SHIPS = new Set(['default', 'void', 'thunder', 'imperial']);
const USER_ID_RE = /^usr_[a-z0-9]{8,32}$/;
const GUEST_KEY_RE = /^gst_[a-z0-9]{32,64}$/;
const WRITE_BODY_LIMITS = {
  '/api/submit-score': 4096,
  '/api/guest-session': 4096,
  '/api/auth/bind': 65536,
  '/api/auth/logout': 4096,
  '/api/cloud-save': 65536
};
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 120000;
const MATCH_HISTORY_LIMIT = 50;
const DEFAULT_NICKNAME = '星海先驱者';
const DEFAULT_AVATAR = 'fa-user-astronaut';
const DEFAULT_ALLOWED_ORIGINS = 'https://renlimeng.qzz.io,https://rlmbest.xyz,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787,http://127.0.0.1:8787,http://localhost:8080,http://127.0.0.1:8080,http://localhost:9999,http://127.0.0.1:9999';
const RATE_LIMITS = {
  '/api/leaderboard': { limit: 120, windowSeconds: 60 },
  '/api/submit-score': { limit: 20, windowSeconds: 60 },
  '/api/guest-session': { limit: 20, windowSeconds: 60 },
  '/api/auth/bind': { limit: 12, windowSeconds: 60 },
  '/api/auth/logout': { limit: 20, windowSeconds: 60 },
  '/api/cloud-save': { limit: 40, windowSeconds: 60 }
};
let profileColumnsChecked = false;

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      // 仅在首次冷启动时并行执行兼容性迁移（不阻塞主流程的 DDL 均已移入 schema.sql）
      await ensureRuntimeCompat(env.DB);
      const bodyLimit = WRITE_BODY_LIMITS[url.pathname];
      if (bodyLimit && request.method === 'POST' && isBodyTooLarge(request, bodyLimit)) {
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
        return new Response(JSON.stringify({ entries: rows }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
            ...corsHeaders
          }
        });
      }

      if (url.pathname === '/api/player' && request.method === 'GET') {
        const userId = url.searchParams.get('user_id') || '';
        if (!USER_ID_RE.test(userId)) {
          return jsonResponse({ error: 'invalid user_id' }, corsHeaders, 400);
        }
        const player = await getPlayerRecord(env.DB, userId);
        return jsonResponse(player || { user_id: userId, score: 0, ship_type: 'default', rank: null }, corsHeaders);
      }

      if (url.pathname === '/api/guest-session' && request.method === 'POST') {
        const payload = await readJson(request, bodyLimit);
        const result = await claimGuestIdentity(env.DB, payload.user_id, payload.guest_key);
        if (result.error) return jsonResponse({ error: result.error }, corsHeaders, 400);
        return jsonResponse({ success: true, ...result }, corsHeaders);
      }

      if (url.pathname === '/api/auth/bind' && request.method === 'POST') {
        const payload = await readJson(request, bodyLimit);
        const result = await bindAccount(env.DB, payload, request);
        if (result.error) {
          const status = result.error === 'invalid_credentials' || result.error === 'identity_required' ? 401 : 400;
          return jsonResponse({ success: false, error: result.error }, corsHeaders, status);
        }
        return jsonResponse({ success: true, ...result }, corsHeaders);
      }

      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const revoked = await revokeSession(env.DB, request);
        return jsonResponse({ success: true, revoked }, corsHeaders);
      }

      if (url.pathname === '/api/cloud-save') {
        const session = await requireSession(env.DB, request);
        if (!session) return jsonResponse({ error: 'unauthorized' }, corsHeaders, 401);
        if (request.method === 'GET') {
          const save = await loadCloudSave(env.DB, session.user_id);
          return jsonResponse({ success: true, user_id: session.user_id, save }, corsHeaders);
        }
        if (request.method === 'POST') {
          const payload = await readJson(request, bodyLimit);
          const current = await loadCloudSave(env.DB, session.user_id);
          const revision = clampInt(payload.revision, 0, 2147483647, -1);
          if (revision !== current.revision) {
            return jsonResponse({ error: 'revision_conflict', save: current }, corsHeaders, 409);
          }
          const save = await replaceCloudSave(env.DB, session.user_id, payload.save || {}, current.revision + 1);
          return jsonResponse({ success: true, user_id: session.user_id, save }, corsHeaders);
        }
      }

      if (url.pathname === '/api/submit-score' && request.method === 'POST') {
        const payload = await readJson(request, bodyLimit);
        const userId = String(payload.user_id || '');
        const username = sanitizeUsername(payload.username);
        const avatar = sanitizeAvatar(payload.avatar);
        const bio = sanitizeBio(payload.bio);
        const score = clampInt(payload.score, 0, 9999999, 0);
        const shipType = ALLOWED_SHIPS.has(payload.ship_type) ? payload.ship_type : 'default';

        if (!USER_ID_RE.test(userId)) {
          return jsonResponse({ error: 'invalid user_id' }, corsHeaders, 400);
        }
        if (!username) {
          return jsonResponse({ error: 'invalid username' }, corsHeaders, 400);
        }
        const identity = await authorizeUserWrite(env.DB, request, userId, payload.guest_key);
        if (!identity) {
          return jsonResponse({ error: 'identity_required' }, corsHeaders, 401);
        }

        const result = await upsertScore(env.DB, userId, username, score, shipType, avatar, bio);
        if (result.suspicious) {
          return jsonResponse({ error: 'score_rejected', reason: 'implausible_delta' }, corsHeaders, 422);
        }
        return jsonResponse({ success: true, ...result }, corsHeaders);
      }

      return jsonResponse({ error: 'not found' }, corsHeaders, 404);
    } catch (err) {
      if (err && err.code === 'payload_too_large') {
        return jsonResponse({ error: 'payload_too_large' }, corsHeaders, 413);
      }
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
    : (allowed.includes(origin) ? origin : '');

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
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

async function readJson(request, maxBytes = 65536) {
  try {
    if (isBodyTooLarge(request, maxBytes)) throw payloadTooLargeError();
    if (!request.body) return {};
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw payloadTooLargeError();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes) || '{}');
  } catch (err) {
    if (err && err.code === 'payload_too_large') throw err;
    if (isBodyTooLarge(request, maxBytes)) throw payloadTooLargeError();
    return {};
  }
}

function payloadTooLargeError() {
  const err = new Error('payload_too_large');
  err.code = 'payload_too_large';
  return err;
}

function isBodyTooLarge(request, maxBytes) {
  const contentLength = request.headers.get('Content-Length');
  if (!contentLength) return false;
  const bytes = Number.parseInt(contentLength, 10);
  return Number.isFinite(bytes) && bytes > maxBytes;
}

async function checkRateLimit(db, request, pathname, config) {
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

// 运行时兼容性迁移：只保留无法在 schema.sql 中幂等处理的 ALTER TABLE
// 所有 CREATE TABLE / CREATE INDEX 均已移入 schema.sql，通过 wrangler d1 migrations apply 部署
async function ensureRuntimeCompat(db) {
  if (profileColumnsChecked) return;
  // 兼容旧数据库；正式部署仍应先执行 schema.sql / migration。
  await Promise.all([
    db.prepare("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT 'fa-user-astronaut'").run().catch(() => {}),
    db.prepare("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''").run().catch(() => {}),
    db.prepare("ALTER TABLE accounts ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'sha256'").run().catch(() => {}),
    db.prepare("ALTER TABLE accounts ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 1").run().catch(() => {}),
    db.prepare("ALTER TABLE account_sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0").run().catch(() => {}),
    db.prepare("ALTER TABLE player_cloud_saves ADD COLUMN revision INTEGER NOT NULL DEFAULT 0").run().catch(() => {}),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS guest_identities (
        user_id TEXT PRIMARY KEY,
        key_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run().catch(() => {})
  ]);
  profileColumnsChecked = true;
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

function sanitizeAvatar(value) {
  const icon = String(value || DEFAULT_AVATAR).trim();
  return /^fa-[a-z0-9-]{2,40}$/.test(icon) ? icon : DEFAULT_AVATAR;
}

function sanitizeBio(value) {
  return String(value || '')
    .trim()
    .replace(/[<>"'`\\]/g, '')
    .slice(0, 48);
}

function sanitizeAccount(value) {
  return String(value || '')
    .trim()
    .replace(/[<>"'`\\]/g, '')
    .slice(0, 64);
}

function accountKey(value) {
  return sanitizeAccount(value).toLowerCase();
}

function sanitizePassword(value) {
  const password = String(value || '');
  return password.length >= 6 && password.length <= 128 ? password : '';
}

function createServerUserId() {
  return 'usr_' + randomTokenPart(16);
}

function createId(prefix) {
  return `${prefix}_${randomTokenPart(24)}`;
}

function randomTokenPart(length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let token = '';
  for (let i = 0; i < bytes.length; i++) token += alphabet[bytes[i] % alphabet.length];
  return token;
}

async function hashPassword(password, salt) {
  const input = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPbkdf2Password(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: new TextEncoder().encode(salt),
    iterations
  }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

async function hashGuestKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(new Uint8Array(digest));
}

async function claimGuestIdentity(db, requestedUserId, guestKey) {
  const userId = String(requestedUserId || '');
  const key = String(guestKey || '');
  if (!USER_ID_RE.test(userId) || !GUEST_KEY_RE.test(key)) return { error: 'invalid_identity' };
  const keyHash = await hashGuestKey(key);
  const existingIdentity = await db.prepare(`
    SELECT user_id, key_hash FROM guest_identities WHERE user_id = ?1
  `).bind(userId).first();
  if (existingIdentity) {
    if (!constantTimeEqual(existingIdentity.key_hash, keyHash)) return { error: 'identity_conflict' };
    return { user_id: userId, migrated: false };
  }
  const publicUser = await db.prepare('SELECT 1 AS ok FROM users WHERE id = ?1').bind(userId).first();
  const claimedUserId = publicUser ? createServerUserId() : userId;
  await upsertUserProfile(db, claimedUserId, {});
  await db.prepare(`
    INSERT INTO guest_identities (user_id, key_hash) VALUES (?1, ?2)
  `).bind(claimedUserId, keyHash).run();
  return { user_id: claimedUserId, migrated: claimedUserId !== userId };
}

async function authorizeUserWrite(db, request, userId, guestKey) {
  const session = await requireSession(db, request);
  if (session) return session.user_id === userId ? session : null;
  if (!GUEST_KEY_RE.test(String(guestKey || ''))) return null;
  const identity = await db.prepare(`
    SELECT user_id, key_hash FROM guest_identities WHERE user_id = ?1
  `).bind(userId).first();
  if (!identity) return null;
  const keyHash = await hashGuestKey(guestKey);
  return constantTimeEqual(identity.key_hash, keyHash) ? identity : null;
}

async function bindAccount(db, payload, request) {
  const label = sanitizeAccount(payload.account);
  const key = accountKey(label);
  const password = sanitizePassword(payload.password);
  if (key.length < 4 || !password) {
    return { error: 'invalid_account' };
  }

  const existing = await db.prepare(`
    SELECT account_id, account_key, account_label, password_salt, password_hash,
           password_algorithm, password_iterations, user_id
    FROM accounts
    WHERE account_key = ?1
  `).bind(key).first();

  if (existing) {
    const algorithm = existing.password_algorithm || 'sha256';
    const iterations = existing.password_iterations || 1;
    const hash = algorithm === 'pbkdf2-sha256'
      ? await hashPbkdf2Password(password, existing.password_salt, iterations)
      : await hashPassword(password, existing.password_salt);
    if (!constantTimeEqual(hash, existing.password_hash)) {
      return { error: 'invalid_credentials' };
    }
    if (algorithm !== 'pbkdf2-sha256') {
      const upgradedSalt = createId('salt');
      const upgradedHash = await hashPbkdf2Password(password, upgradedSalt);
      await db.prepare(`
        UPDATE accounts
        SET password_salt = ?1, password_hash = ?2,
            password_algorithm = 'pbkdf2-sha256', password_iterations = ?3,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE account_id = ?4
      `).bind(upgradedSalt, upgradedHash, PBKDF2_ITERATIONS, existing.account_id).run();
    }
    const save = await loadCloudSave(db, existing.user_id);
    const token = await createSession(db, existing.account_id);
    return { mode: 'login', token, user_id: existing.user_id, save };
  }

  const requestedUserId = USER_ID_RE.test(payload.user_id || '') ? payload.user_id : '';
  const identity = requestedUserId
    ? await authorizeUserWrite(db, request, requestedUserId, payload.guest_key)
    : null;
  if (!identity) return { error: 'identity_required' };
  const userId = requestedUserId;
  const accountId = createId('acct');
  const salt = createId('salt');
  const hash = await hashPbkdf2Password(password, salt);
  await upsertUserProfile(db, userId, payload.save && payload.save.profile);
  await db.prepare(`
    INSERT INTO accounts (
      account_id, account_key, account_label, password_salt, password_hash,
      password_algorithm, password_iterations, user_id
    )
    VALUES (?1, ?2, ?3, ?4, ?5, 'pbkdf2-sha256', ?6, ?7)
  `).bind(accountId, key, label, salt, hash, PBKDF2_ITERATIONS, userId).run();
  const save = await replaceCloudSave(db, userId, payload.save || {}, 1);
  const token = await createSession(db, accountId);
  return { mode: 'registered', token, user_id: userId, save };
}

async function createSession(db, accountId) {
  const token = createId('sess');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await db.prepare(`
    INSERT INTO account_sessions (token, account_id, expires_at)
    VALUES (?1, ?2, ?3)
  `).bind(token, accountId, expiresAt).run();
  return token;
}

async function requireSession(db, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return db.prepare(`
    SELECT a.user_id, s.expires_at
    FROM account_sessions s
    JOIN accounts a ON a.account_id = s.account_id
    WHERE s.token = ?1
  `).bind(token).first().then(async session => {
    if (!session) return null;
    const expiresAt = Number(session.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      await db.prepare('DELETE FROM account_sessions WHERE token = ?1').bind(token).run();
      return null;
    }
    return session;
  });
}

async function revokeSession(db, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  await db.prepare('DELETE FROM account_sessions WHERE token = ?1').bind(token).run();
  return true;
}

async function loadCloudSave(db, userId) {
  const row = await db.prepare(`
    SELECT permanent_cores, talents_json, unlocked_skins_json, current_skin, best_score,
           profile_json, revision, updated_at
    FROM player_cloud_saves
    WHERE user_id = ?1
  `).bind(userId).first();
  const matches = await loadMatchHistory(db, userId);
  return normalizeCloudSave(row ? {
    permanentCores: row.permanent_cores,
    talents: safeJson(row.talents_json, {}),
    unlockedSkins: safeJson(row.unlocked_skins_json, ['default']),
    currentSkin: row.current_skin,
    bestScore: row.best_score,
    profile: safeJson(row.profile_json, {}),
    matchHistory: matches,
    revision: row.revision || 0,
    updatedAt: row.updated_at
  } : { matchHistory: matches, revision: 0 });
}

async function replaceCloudSave(db, userId, incomingSave, revision) {
  const snapshot = normalizeCloudSave({ ...(incomingSave || {}), revision });
  await upsertUserProfile(db, userId, snapshot.profile);
  await db.prepare(`
    INSERT INTO player_cloud_saves (
      user_id, permanent_cores, talents_json, unlocked_skins_json, current_skin,
      best_score, profile_json, revision, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      permanent_cores = excluded.permanent_cores,
      talents_json = excluded.talents_json,
      unlocked_skins_json = excluded.unlocked_skins_json,
      current_skin = excluded.current_skin,
      best_score = excluded.best_score,
      profile_json = excluded.profile_json,
      revision = excluded.revision,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  `).bind(
    userId,
    snapshot.permanentCores,
    JSON.stringify(snapshot.talents),
    JSON.stringify(snapshot.unlockedSkins),
    snapshot.currentSkin,
    snapshot.bestScore,
    JSON.stringify(snapshot.profile),
    snapshot.revision
  ).run();
  await upsertMatchHistory(db, userId, snapshot.matchHistory);
  return loadCloudSave(db, userId);
}

async function upsertUserProfile(db, userId, profile) {
  const normalized = normalizeProfile(profile || {});
  const username = normalized.nickname || DEFAULT_NICKNAME;
  await db.prepare(`
    INSERT INTO users (id, username, avatar, bio, is_guest)
    VALUES (?1, ?2, ?3, ?4, 1)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      avatar = excluded.avatar,
      bio = excluded.bio
  `).bind(userId, username, normalized.avatar, normalized.bio).run();
}

function mergeProfile(baseProfile, incomingProfile) {
  const base = normalizeProfile(baseProfile || {});
  const incoming = incomingProfile && typeof incomingProfile === 'object' ? incomingProfile : {};
  const nickname = sanitizeUsername(incoming.nickname || incoming.username || '');
  const avatar = incoming.avatar ? sanitizeAvatar(incoming.avatar) : '';
  const bio = typeof incoming.bio !== 'undefined' ? sanitizeBio(incoming.bio) : '';
  const defaultNicknameShouldNotReplace = base.nickname && base.nickname !== DEFAULT_NICKNAME && nickname === DEFAULT_NICKNAME;
  const defaultAvatarShouldNotReplace = base.avatar && base.avatar !== DEFAULT_AVATAR && avatar === DEFAULT_AVATAR;
  return {
    nickname: nickname && !defaultNicknameShouldNotReplace ? nickname : base.nickname,
    avatar: avatar && !defaultAvatarShouldNotReplace ? avatar : base.avatar,
    bio: bio || base.bio
  };
}

function normalizeCloudSave(save) {
  const raw = save || {};
  const unlockedSkins = Array.isArray(raw.unlockedSkins)
    ? raw.unlockedSkins.filter(skin => ALLOWED_SHIPS.has(skin))
    : ['default'];
  if (!unlockedSkins.includes('default')) unlockedSkins.unshift('default');
  const talents = raw.talents && typeof raw.talents === 'object' ? raw.talents : {};
  return {
    permanentCores: clampInt(raw.permanentCores, 0, 9999999, 0),
    talents: {
      A: clampInt(talents.A, 0, 3, 0),
      B: clampInt(talents.B, 0, 3, 0),
      C: clampInt(talents.C, 0, 3, 0),
      D: clampInt(talents.D, 0, 3, 0),
      E: clampInt(talents.E, 0, 2, 0)
    },
    unlockedSkins,
    currentSkin: unlockedSkins.includes(raw.currentSkin) ? raw.currentSkin : 'default',
    bestScore: clampInt(raw.bestScore, 0, 9999999, 0),
    profile: normalizeProfile(raw.profile || {}),
    matchHistory: normalizeMatchHistory(raw.matchHistory),
    revision: clampInt(raw.revision, 0, 2147483647, 0)
  };
}

function normalizeProfile(profile) {
  const nickname = profile.nickname || profile.username || '';
  return {
    nickname: sanitizeUsername(nickname),
    avatar: sanitizeAvatar(profile.avatar),
    bio: sanitizeBio(profile.bio)
  };
}

function safeJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function normalizeMatchHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(match => ({
    id: String(match.id || `match_${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
    score: clampInt(match.score, 0, 9999999, 0),
    wave: clampInt(match.wave, 1, 9999, 1),
    skin: ALLOWED_SHIPS.has(match.skin) ? match.skin : 'default',
    isNewBest: !!match.isNewBest,
    permanentCoresEarned: clampInt(match.permanentCoresEarned, 0, 9999999, 0),
    playedAt: normalizeIsoDate(match.playedAt)
  }))
    .filter(match => match.id && match.playedAt)
    .sort((left, right) => String(right.playedAt).localeCompare(String(left.playedAt)))
    .slice(0, MATCH_HISTORY_LIMIT);
}

function normalizeIsoDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function mergeMatchHistory(a, b) {
  const map = new Map();
  [...normalizeMatchHistory(a), ...normalizeMatchHistory(b)].forEach(match => {
    map.set(match.id, match);
  });
  return Array.from(map.values())
    .sort((left, right) => String(right.playedAt).localeCompare(String(left.playedAt)));
}

async function loadMatchHistory(db, userId) {
  const { results } = await db.prepare(`
    SELECT match_id, score, wave, skin, is_new_best, permanent_cores_earned, played_at
    FROM match_history
    WHERE user_id = ?1
    ORDER BY played_at DESC
  `).bind(userId).all();
  return (results || []).map(row => ({
    id: row.match_id,
    score: row.score,
    wave: row.wave,
    skin: row.skin,
    isNewBest: !!row.is_new_best,
    permanentCoresEarned: row.permanent_cores_earned,
    playedAt: row.played_at
  }));
}

async function upsertMatchHistory(db, userId, history) {
  for (const match of normalizeMatchHistory(history)) {
    await db.prepare(`
      INSERT INTO match_history (
        match_id, user_id, score, wave, skin, is_new_best, permanent_cores_earned, played_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(match_id) DO UPDATE SET
        score = excluded.score,
        wave = excluded.wave,
        skin = excluded.skin,
        is_new_best = excluded.is_new_best,
        permanent_cores_earned = excluded.permanent_cores_earned,
        played_at = excluded.played_at
      WHERE match_history.user_id = excluded.user_id
    `).bind(
      match.id,
      userId,
      match.score,
      match.wave,
      match.skin,
      match.isNewBest ? 1 : 0,
      match.permanentCoresEarned,
      match.playedAt
    ).run();
  }
  await db.prepare(`
    DELETE FROM match_history
    WHERE user_id = ?1
      AND match_id NOT IN (
        SELECT match_id FROM match_history
        WHERE user_id = ?1
        ORDER BY played_at DESC
        LIMIT ?2
      )
  `).bind(userId, MATCH_HISTORY_LIMIT).run();
}

async function getLeaderboardRows(db, limit) {
  const { results } = await db.prepare(`
    SELECT
      e.entry_id,
      e.user_id,
      u.username,
      u.avatar,
      u.bio,
      e.score,
      e.ship_type,
      e.updated_at
    FROM leaderboard_entries e
    JOIN users u ON u.id = e.user_id
    WHERE e.score > 0
    ORDER BY e.score DESC, e.updated_at ASC, e.entry_id ASC
    LIMIT ?1
  `).bind(limit).all();

  if (results && results.length) {
    return results.map((row, index) => ({
      rank: index + 1,
      entry_id: row.entry_id,
      user_id: row.user_id,
      username: row.username,
      avatar: row.avatar || 'fa-user-astronaut',
      bio: row.bio || '',
      score: row.score,
      ship_type: row.ship_type,
      updated_at: row.updated_at
    }));
  }

  const legacy = await db.prepare(`
    SELECT
      l.user_id,
      u.username,
      u.avatar,
      u.bio,
      l.score,
      l.ship_type,
      l.updated_at
    FROM leaderboards l
    JOIN users u ON u.id = l.user_id
    ORDER BY l.score DESC, l.updated_at ASC, l.user_id ASC
    LIMIT ?1
  `).bind(limit).all();

  return (legacy.results || []).map((row, index) => ({
    rank: index + 1,
    user_id: row.user_id,
    username: row.username,
    avatar: row.avatar || 'fa-user-astronaut',
    bio: row.bio || '',
    score: row.score,
    ship_type: row.ship_type,
    updated_at: row.updated_at
  }));
}

async function getPlayerRecord(db, userId) {
  let usingEntries = true;
  let row = await db.prepare(`
    SELECT e.entry_id, e.user_id, u.username, u.avatar, u.bio, e.score, e.ship_type, e.updated_at
    FROM leaderboard_entries e
    JOIN users u ON u.id = e.user_id
    WHERE e.user_id = ?1
    ORDER BY e.score DESC, e.updated_at ASC, e.entry_id ASC
    LIMIT 1
  `).bind(userId).first();

  let tieId = row ? row.entry_id : userId;

  if (!row) {
    usingEntries = false;
    row = await db.prepare(`
      SELECT l.user_id, u.username, u.avatar, u.bio, l.score, l.ship_type, l.updated_at
      FROM leaderboards l
      JOIN users u ON u.id = l.user_id
      WHERE l.user_id = ?1
    `).bind(userId).first();
  }

  if (!row) return null;

  const rankRow = usingEntries
    ? await db.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM leaderboard_entries
      WHERE score > ?1
         OR (score = ?1 AND (updated_at < ?2 OR (updated_at = ?2 AND entry_id < ?3)))
    `).bind(row.score, row.updated_at, tieId).first()
    : await db.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM leaderboards
      WHERE score > ?1
         OR (score = ?1 AND (updated_at < ?2 OR (updated_at = ?2 AND user_id < ?3)))
    `).bind(row.score, row.updated_at, row.user_id).first();

  return {
    user_id: row.user_id,
    username: row.username,
    avatar: row.avatar || 'fa-user-astronaut',
    bio: row.bio || '',
    score: row.score,
    ship_type: row.ship_type,
    updated_at: row.updated_at,
    rank: rankRow ? rankRow.rank : null
  };
}

async function upsertScore(db, userId, username, score, shipType, avatar, bio) {
  const previousEntry = await db.prepare(`
    SELECT score FROM leaderboard_entries
    WHERE user_id = ?1
    ORDER BY score DESC
    LIMIT 1
  `).bind(userId).first();
  const previousLegacy = await db.prepare(`
    SELECT score FROM leaderboards WHERE user_id = ?1
  `).bind(userId).first();
  const previousScore = Math.max(
    previousEntry ? previousEntry.score : 0,
    previousLegacy ? previousLegacy.score : 0
  );

  const userWrite = db.prepare(`
    INSERT INTO users (id, username, avatar, bio, is_guest)
    VALUES (?1, ?2, ?3, ?4, 1)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      avatar = excluded.avatar,
      bio = excluded.bio
  `).bind(userId, username, avatar, bio);

  if (score <= 0) {
    await runUserWrite(db, userWrite, userId, username);
    return {
      updated: false,
      previous_score: previousScore,
      score: previousScore,
      ship_type: shipType,
      updated_at: null
    };
  }

  // Server-side plausibility check: single-session score gain capped at 3,000,000
  const prevBest = previousScore;
  if (score - prevBest > 3000000) {
    return {
      suspicious: true,
      updated: false,
      previous_score: prevBest,
      score: prevBest,
      ship_type: shipType,
      updated_at: null
    };
  }

  const entryId = createId('lbe');
  const leaderboardEntryWrite = db.prepare(`
    INSERT INTO leaderboard_entries (entry_id, user_id, score, ship_type, updated_at)
    VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  `).bind(entryId, userId, score, shipType);

  const legacyLeaderboardWrite = db.prepare(`
    INSERT INTO leaderboards (user_id, score, ship_type, updated_at)
    VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      score = CASE WHEN excluded.score > leaderboards.score THEN excluded.score ELSE leaderboards.score END,
      ship_type = CASE WHEN excluded.score > leaderboards.score THEN excluded.ship_type ELSE leaderboards.ship_type END,
      updated_at = CASE WHEN excluded.score > leaderboards.score THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE leaderboards.updated_at END
  `).bind(userId, score, shipType);

  if (typeof db.batch === 'function') {
    await runBatchWithUserFallback(db, userWrite, leaderboardEntryWrite, userId, username);
    try {
      await legacyLeaderboardWrite.run();
    } catch (_) {}
  } else {
    await runUserWrite(db, userWrite, userId, username);
    await leaderboardEntryWrite.run();
    try {
      await legacyLeaderboardWrite.run();
    } catch (_) {}
  }

  return {
    updated: score > previousScore,
    previous_score: previousScore,
    score,
    ship_type: shipType,
    updated_at: null,
    entry_id: entryId
  };
}

async function runUserWrite(db, userWrite, userId, username) {
  try {
    await userWrite.run();
  } catch (err) {
    if (!isProfileColumnError(err)) throw err;
    await db.prepare(`
      INSERT INTO users (id, username, is_guest)
      VALUES (?1, ?2, 1)
      ON CONFLICT(id) DO UPDATE SET username = excluded.username
    `).bind(userId, username).run();
  }
}

async function runBatchWithUserFallback(db, userWrite, leaderboardWrite, userId, username) {
  try {
    await db.batch([userWrite, leaderboardWrite]);
  } catch (err) {
    if (!isProfileColumnError(err)) throw err;
    await runUserWrite(db, userWrite, userId, username);
    await leaderboardWrite.run();
  }
}

function isProfileColumnError(err) {
  const message = String(err && err.message || err).toLowerCase();
  return message.includes('avatar') || message.includes('bio');
}
