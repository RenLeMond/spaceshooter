import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadWorker() {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return (await import(url)).default;
}

function makeFrontendApi(storage = new Map(), config = {}) {
  const sourcePath = new URL('../../../js/leaderboard_api.js', import.meta.url);
  return readFile(sourcePath, 'utf8').then((source) => {
    const sandbox = {
      window: {
        STARSEA_LEADERBOARD: config,
        localStorage: {
          getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
          },
          setItem(key, value) {
            storage.set(key, String(value));
          }
        },
        crypto: {
          getRandomValues(arr) {
            for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
            return arr;
          }
        },
        fetch: async () => new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        }),
        console
      },
      Response,
      console
    };
    sandbox.window.window = sandbox.window;
    sandbox.localStorage = sandbox.window.localStorage;
    sandbox.crypto = sandbox.window.crypto;
    sandbox.fetch = sandbox.window.fetch;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return { api: sandbox.window.StarseaLeaderboard, storage, sandbox };
  });
}

const TEST_GUEST_KEY = 'gst_abcdefghijklmnopqrstuvwxyz123456';

async function claimGuest(worker, db, userId, ip = '203.0.113.200') {
  const response = await worker.fetch(new Request('https://example.com/api/guest-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ user_id: userId, guest_key: TEST_GUEST_KEY })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  assert.equal(response.status, 200);
  return (await response.json()).user_id;
}

class FakeDb {
  constructor() {
    this.users = new Map();
    this.leaderboards = new Map();
    this.leaderboardEntries = [];
    this.rateLimits = new Map();
    this.accounts = new Map();
    this.sessions = new Map();
    this.guestIdentities = new Map();
    this.cloudSaves = new Map();
    this.matchHistory = new Map();
    this.now = '2026-06-02 12:00:00';
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const sql = this.sql;
    if (sql.includes('FROM guest_identities')) {
      return this.db.guestIdentities.get(this.args[0]) || null;
    }
    if (sql.includes('SELECT 1 AS ok FROM users WHERE id')) {
      return this.db.users.has(this.args[0]) ? { ok: 1 } : null;
    }
    if (sql.includes('SELECT 1')) return { ok: 1 };
    if (sql.includes('FROM leaderboards l') && sql.includes('WHERE l.user_id')) {
      const id = this.args[0];
      const score = this.db.leaderboards.get(id);
      const user = this.db.users.get(id);
      return score && user ? { user_id: id, username: user.username, ...score } : null;
    }
    if (sql.includes('FROM leaderboard_entries e') && sql.includes('WHERE e.user_id')) {
      const id = this.args[0];
      const row = this.db.leaderboardEntries
        .filter(item => item.user_id === id)
        .sort((a, b) => b.score - a.score || a.updated_at.localeCompare(b.updated_at) || a.entry_id.localeCompare(b.entry_id))[0];
      const user = this.db.users.get(id);
      return row && user ? { username: user.username, avatar: user.avatar, bio: user.bio, ...row } : null;
    }
    if (sql.includes('FROM leaderboard_entries') && sql.includes('WHERE user_id')) {
      const id = this.args[0];
      const row = this.db.leaderboardEntries
        .filter(item => item.user_id === id)
        .sort((a, b) => b.score - a.score || a.updated_at.localeCompare(b.updated_at) || a.entry_id.localeCompare(b.entry_id))[0];
      return row ? { score: row.score, ship_type: row.ship_type, updated_at: row.updated_at, entry_id: row.entry_id } : null;
    }
    if (sql.includes('COUNT(*) + 1 AS rank')) {
      const [score, updatedAt, userId] = this.args;
      let rank = 1;
      for (const [id, row] of this.db.leaderboards) {
        if (row.score > score || (row.score === score && (row.updated_at < updatedAt || (row.updated_at === updatedAt && id < userId)))) {
          rank++;
        }
      }
      for (const row of this.db.leaderboardEntries) {
        const tieId = row.entry_id || row.user_id;
        if (row.score > score || (row.score === score && (row.updated_at < updatedAt || (row.updated_at === updatedAt && tieId < userId)))) {
          rank++;
        }
      }
      return { rank };
    }
    if (sql.includes('SELECT score FROM leaderboards')) {
      const row = this.db.leaderboards.get(this.args[0]);
      return row ? { score: row.score } : null;
    }
    if (sql.includes('SELECT score, ship_type, updated_at FROM leaderboards')) {
      return this.db.leaderboards.get(this.args[0]) || null;
    }
    if (sql.includes('FROM request_rate_limits') && sql.includes('WHERE key')) {
      return this.db.rateLimits.get(this.args[0]) || null;
    }
    if (sql.includes('FROM accounts') && sql.includes('WHERE account_key')) {
      return this.db.accounts.get(this.args[0]) || null;
    }
    if (sql.includes('FROM account_sessions')) {
      const row = this.db.sessions.get(this.args[0]);
      if (!row) return null;
      const account = [...this.db.accounts.values()].find(item => item.account_id === row.account_id);
      return account ? { user_id: account.user_id, expires_at: row.expires_at || 0 } : null;
    }
    if (sql.includes('FROM player_cloud_saves')) {
      return this.db.cloudSaves.get(this.args[0]) || null;
    }
    throw new Error('Unhandled first SQL: ' + sql);
  }

  async all() {
    if (this.sql.includes('FROM leaderboard_entries e') && this.sql.includes('ORDER BY')) {
      const results = this.db.leaderboardEntries
        .map(row => ({ username: this.db.users.get(row.user_id)?.username, avatar: this.db.users.get(row.user_id)?.avatar, bio: this.db.users.get(row.user_id)?.bio, ...row }))
        .sort((a, b) => b.score - a.score || a.updated_at.localeCompare(b.updated_at) || a.entry_id.localeCompare(b.entry_id))
        .slice(0, this.args[0]);
      return { results };
    }
    if (this.sql.includes('FROM leaderboards l') && this.sql.includes('ORDER BY')) {
      const results = [...this.db.leaderboards.entries()]
        .map(([user_id, row]) => ({ user_id, username: this.db.users.get(user_id)?.username, ...row }))
        .sort((a, b) => b.score - a.score || a.updated_at.localeCompare(b.updated_at) || a.user_id.localeCompare(b.user_id))
        .slice(0, this.args[0]);
      return { results };
    }
    if (this.sql.includes('FROM match_history')) {
      const rows = this.db.matchHistory.get(this.args[0]) || [];
      return { results: typeof this.args[1] === 'number' ? rows.slice(0, this.args[1]) : rows };
    }
    throw new Error('Unhandled all SQL: ' + this.sql);
  }

  async run() {
    const sql = this.sql;
    if (sql.includes('CREATE TABLE IF NOT EXISTS request_rate_limits')) return {};
    if (sql.includes('CREATE TABLE IF NOT EXISTS accounts')) return {};
    if (sql.includes('CREATE TABLE IF NOT EXISTS account_sessions')) return {};
    if (sql.includes('CREATE TABLE IF NOT EXISTS player_cloud_saves')) return {};
    if (sql.includes('CREATE TABLE IF NOT EXISTS match_history')) return {};
    if (sql.includes('CREATE TABLE IF NOT EXISTS leaderboard_entries')) return {};
    if (sql.includes('CREATE TABLE IF NOT EXISTS guest_identities')) return {};
    if (sql.includes('CREATE INDEX IF NOT EXISTS')) return {};
    if (sql.includes('DELETE FROM request_rate_limits')) return {};
    if (sql.includes('UPDATE request_rate_limits')) {
      const key = this.args[0];
      const existing = this.db.rateLimits.get(key);
      if (existing) existing.count++;
      return {};
    }
    if (sql.includes('INSERT INTO request_rate_limits')) {
      const [key, now] = this.args;
      const existing = this.db.rateLimits.get(key);
      this.db.rateLimits.set(key, existing ? { count: existing.count + 1, window_start: existing.window_start } : { count: 1, window_start: now });
      return {};
    }
    if (sql.includes('INSERT INTO users')) {
      const existing = this.db.users.get(this.args[0]) || {};
      this.db.users.set(this.args[0], { ...existing, username: this.args[1], avatar: this.args[2], bio: this.args[3], is_guest: 1 });
      return {};
    }
    if (sql.includes('INSERT INTO accounts')) {
      const [accountId, accountKey, accountLabel, passwordSalt, passwordHash, passwordIterations, userId] = this.args;
      this.db.accounts.set(accountKey, {
        account_id: accountId,
        account_key: accountKey,
        account_label: accountLabel,
        password_salt: passwordSalt,
        password_hash: passwordHash,
        password_algorithm: 'pbkdf2-sha256',
        password_iterations: passwordIterations,
        user_id: userId
      });
      return {};
    }
    if (sql.includes('UPDATE accounts') && sql.includes('password_algorithm')) {
      const [salt, hash, iterations, accountId] = this.args;
      const account = [...this.db.accounts.values()].find(item => item.account_id === accountId);
      if (account) Object.assign(account, { password_salt: salt, password_hash: hash, password_algorithm: 'pbkdf2-sha256', password_iterations: iterations });
      return {};
    }
    if (sql.includes('INSERT INTO guest_identities')) {
      const [userId, keyHash] = this.args;
      this.db.guestIdentities.set(userId, { user_id: userId, key_hash: keyHash });
      return {};
    }
    if (sql.includes('INSERT INTO account_sessions')) {
      const [token, accountId, expiresAt] = this.args;
      this.db.sessions.set(token, { token, account_id: accountId, expires_at: expiresAt });
      return {};
    }
    if (sql.includes('DELETE FROM account_sessions')) {
      this.db.sessions.delete(this.args[0]);
      return {};
    }
    if (sql.includes('INSERT INTO player_cloud_saves')) {
      const [userId, permanentCores, talentsJson, unlockedSkinsJson, currentSkin, bestScore, profileJson, revision] = this.args;
      this.db.cloudSaves.set(userId, { user_id: userId, permanent_cores: permanentCores, talents_json: talentsJson, unlocked_skins_json: unlockedSkinsJson, current_skin: currentSkin, best_score: bestScore, profile_json: profileJson, revision, updated_at: this.db.now });
      return {};
    }
    if (sql.includes('INSERT INTO match_history')) {
      const [matchId, userId, score, wave, skin, isNewBest, permanentCoresEarned, playedAt] = this.args;
      const owner = [...this.db.matchHistory.entries()].find(([, rows]) => rows.some(row => row.match_id === matchId));
      if (owner && owner[0] !== userId) return {};
      const rows = this.db.matchHistory.get(userId) || [];
      const next = rows.filter(row => row.match_id !== matchId);
      next.unshift({ match_id: matchId, user_id: userId, score, wave, skin, is_new_best: isNewBest, permanent_cores_earned: permanentCoresEarned, played_at: playedAt });
      next.sort((a, b) => String(b.played_at).localeCompare(String(a.played_at)));
      this.db.matchHistory.set(userId, next);
      return {};
    }
    if (sql.includes('DELETE FROM match_history')) {
      const [userId, limit] = this.args;
      const rows = this.db.matchHistory.get(userId) || [];
      this.db.matchHistory.set(userId, rows.slice(0, limit));
      return {};
    }
    if (sql.includes('INSERT INTO leaderboards')) {
      const [userId, score, shipType] = this.args;
      const existing = this.db.leaderboards.get(userId);
      if (!existing || score > existing.score) {
        this.db.leaderboards.set(userId, { score, ship_type: shipType, updated_at: this.db.now });
      }
      return {};
    }
    if (sql.includes('INSERT INTO leaderboard_entries')) {
      const [entryId, userId, score, shipType] = this.args;
      this.db.leaderboardEntries.push({ entry_id: entryId, user_id: userId, score, ship_type: shipType, updated_at: this.db.now });
      return {};
    }
    throw new Error('Unhandled run SQL: ' + sql);
  }
}

test('frontend regenerates stored user_id values that the Worker rejects', async () => {
  const storage = new Map([['space_user_id', 'legacy-user']]);
  const { api } = await makeFrontendApi(storage);

  const userId = api.ensureUserId();

  assert.match(userId, /^usr_[a-z0-9]{8,32}$/);
  assert.equal(storage.get('space_user_id'), userId);
});

test('frontend skips same-origin health checks when useSameOriginApi is false', async () => {
  let fetchCalls = 0;
  const { api } = await makeFrontendApi(new Map(), { apiBase: '', useSameOriginApi: false });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ ok: true }));
  };
  try {
    assert.equal(await api.checkHealth(), false);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('frontend bound score submissions do not rotate legacy account ids through guest sessions', async () => {
  const storage = new Map([
    ['space_user_id', 'usr_legacyacct'],
    ['space_account_token', 'sess_legacyacct']
  ]);
  const { api, sandbox } = await makeFrontendApi(storage);
  const paths = [];
  sandbox.fetch = async (url, options) => {
    paths.push({ url, options });
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };

  await api.submitScore(1000, 'void', 'Legacy');

  assert.deepEqual(paths.map(call => call.url), ['/api/submit-score']);
  assert.equal(JSON.parse(paths[0].options.body).user_id, 'usr_legacyacct');
  assert.equal(paths[0].options.headers.Authorization, 'Bearer sess_legacyacct');
});

test('frontend account bind only claims a guest identity after identity_required', async () => {
  const storage = new Map([['space_user_id', 'usr_newbind01']]);
  const { api, sandbox } = await makeFrontendApi(storage);
  const paths = [];
  sandbox.fetch = async (url) => {
    paths.push(url);
    if (paths.length === 1) {
      return new Response(JSON.stringify({ error: 'identity_required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === '/api/guest-session') {
      return new Response(JSON.stringify({ success: true, user_id: 'usr_newbind01', migrated: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      mode: 'registered',
      token: 'sess_newbind',
      user_id: 'usr_newbind01',
      save: { revision: 1 }
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  await api.bindAccount('new@example.com', 'secret123', {});

  assert.deepEqual(paths, ['/api/auth/bind', '/api/guest-session', '/api/auth/bind']);
  assert.equal(storage.get('space_account_token'), 'sess_newbind');
});

test('Worker does not grant CORS access to an unapproved origin', async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request('https://example.com/api/health', {
    headers: { Origin: 'https://evil.example', 'CF-Connecting-IP': '203.0.113.6' }
  }), { DB: new FakeDb(), ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('Worker updates username without creating a leaderboard row for zero score', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_abcdef12');
  const response = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify({ user_id: 'usr_abcdef12', guest_key: TEST_GUEST_KEY, username: 'Pilot', score: 0, ship_type: 'void' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.updated, false);
  assert.equal(db.users.get('usr_abcdef12').username, 'Pilot');
  assert.equal(db.leaderboards.has('usr_abcdef12'), false);
});

test('Worker player rank uses the same tie-break as leaderboard rows', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.users.set('usr_aaaaaaaa', { username: 'A' });
  db.users.set('usr_bbbbbbbb', { username: 'B' });
  db.leaderboards.set('usr_aaaaaaaa', { score: 100, ship_type: 'void', updated_at: '2026-06-02 10:00:00' });
  db.leaderboards.set('usr_bbbbbbbb', { score: 100, ship_type: 'void', updated_at: '2026-06-02 11:00:00' });

  const response = await worker.fetch(new Request('https://example.com/api/player?user_id=usr_bbbbbbbb', {
    headers: { Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.8' }
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rank, 2);
});

test('Worker leaderboard keeps multiple score entries for the same player', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.now = '2026-06-02 10:00:00';
  await claimGuest(worker, db, 'usr_multiscore');

  const headers = { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.28' };
  const first = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: 'usr_multiscore', guest_key: TEST_GUEST_KEY, username: 'Multi', score: 1200, ship_type: 'void' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  db.now = '2026-06-02 10:01:00';
  const second = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers: { ...headers, 'CF-Connecting-IP': '203.0.113.29' },
    body: JSON.stringify({ user_id: 'usr_multiscore', guest_key: TEST_GUEST_KEY, username: 'Multi', score: 900, ship_type: 'thunder' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(db.leaderboardEntries.length, 2);

  const board = await worker.fetch(new Request('https://example.com/api/leaderboard?limit=10', {
    headers: { Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.30' }
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const body = await board.json();

  assert.deepEqual(body.entries.map(entry => entry.score), [1200, 900]);
  assert.equal(body.entries[0].user_id, 'usr_multiscore');
  assert.equal(body.entries[1].user_id, 'usr_multiscore');
});

test('Worker profile-only score sync does not add a duplicate leaderboard entry', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.now = '2026-06-02 10:00:00';
  await claimGuest(worker, db, 'usr_profileonly');
  const headers = { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.31' };

  const first = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: 'usr_profileonly', guest_key: TEST_GUEST_KEY, username: 'Pilot', score: 1500, ship_type: 'void' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  db.now = '2026-06-02 10:02:00';
  const profileOnly = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers: { ...headers, 'CF-Connecting-IP': '203.0.113.32' },
    body: JSON.stringify({ user_id: 'usr_profileonly', guest_key: TEST_GUEST_KEY, username: 'PilotRenamed', score: 0, ship_type: 'void', bio: 'Renamed' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(first.status, 200);
  assert.equal(profileOnly.status, 200);
  assert.equal(db.leaderboardEntries.length, 1);
  assert.equal(db.users.get('usr_profileonly').username, 'PilotRenamed');
  const body = await profileOnly.json();
  assert.equal(body.updated, false);
  assert.equal(body.score, 1500);
});

test('Worker rejects oversized submit bodies before parsing JSON', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const response = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'Content-Length': '20000', 'CF-Connecting-IP': '203.0.113.9' },
    body: '{}'
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 413);
});

test('Worker registers an account on first bind and returns a session token', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_firstbind');
  const response = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify({
      account: 'pilot@example.com',
      password: 'secret123',
      user_id: 'usr_firstbind',
      guest_key: TEST_GUEST_KEY,
      save: {
        permanentCores: 40,
        talents: { A: 1 },
        unlockedSkins: ['default', 'thunder'],
        currentSkin: 'thunder',
        bestScore: 9000,
        profile: { nickname: 'Pilot', avatar: 'fa-crown', bio: 'Ready' },
        matchHistory: [{ id: 'm1', score: 9000, wave: 3, skin: 'thunder', isNewBest: true, permanentCoresEarned: 4, playedAt: '2026-06-02T09:30:40.000Z' }]
      }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'registered');
  assert.equal(body.user_id, 'usr_firstbind');
  assert.match(body.token, /^sess_/);
  assert.equal(db.cloudSaves.get('usr_firstbind').best_score, 9000);
  assert.equal(db.matchHistory.get('usr_firstbind')[0].match_id, 'm1');
});

test('Worker logs in on second bind and returns existing cloud save', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_firstbind');
  const first = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.11' },
    body: JSON.stringify({ account: 'pilot@example.com', password: 'secret123', user_id: 'usr_firstbind', guest_key: TEST_GUEST_KEY, save: { bestScore: 1200, permanentCores: 5 } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  assert.equal(first.status, 200);
  const firstBody = await first.clone().json();
  await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firstBody.token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.11' },
    body: JSON.stringify({
      revision: firstBody.save.revision,
      save: { ...firstBody.save, profile: { nickname: 'Pilot', avatar: 'fa-crown', bio: 'Cloud' } }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  const second = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.12' },
    body: JSON.stringify({ account: 'pilot@example.com', password: 'secret123', user_id: 'usr_otherdevice', save: { bestScore: 500, permanentCores: 99 } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.mode, 'login');
  assert.equal(body.user_id, 'usr_firstbind');
  assert.equal(body.save.bestScore, 1200);
  assert.equal(body.save.permanentCores, 5);
  assert.equal(body.save.profile.nickname, 'Pilot');
  assert.equal(body.save.profile.avatar, 'fa-crown');
});

test('Worker treats profile username as nickname when syncing account data', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_profilealias');
  const response = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.18' },
    body: JSON.stringify({
      account: 'username-profile@example.com',
      password: 'secret123',
      user_id: 'usr_profilealias',
      guest_key: TEST_GUEST_KEY,
      save: {
        profile: { username: 'AliasPilot', avatar: 'fa-rocket', bio: 'Alias path' }
      }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.save.profile.nickname, 'AliasPilot');
  assert.equal(body.save.profile.avatar, 'fa-rocket');
  assert.equal(db.users.get('usr_profilealias').username, 'AliasPilot');
});

test('Worker keeps cloud profile when another device sends default profile fields', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_profilekeep');
  const first = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.19' },
    body: JSON.stringify({
      account: 'profile-keep@example.com',
      password: 'secret123',
      user_id: 'usr_profilekeep',
      guest_key: TEST_GUEST_KEY,
      save: { profile: { nickname: 'CloudPilot', avatar: 'fa-rocket', bio: 'Cloud bio' } }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  assert.equal(first.status, 200);

  const second = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.20' },
    body: JSON.stringify({
      account: 'profile-keep@example.com',
      password: 'secret123',
      user_id: 'usr_otherprofile',
      save: { profile: { nickname: '星海先驱者', avatar: 'fa-user-astronaut', bio: '' } }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.save.profile.nickname, 'CloudPilot');
  assert.equal(body.save.profile.avatar, 'fa-rocket');
  assert.equal(body.save.profile.bio, 'Cloud bio');
});

test('Worker cloud save endpoint persists match history with second-level timestamps', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_cloudsave');
  const auth = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.13' },
    body: JSON.stringify({ account: 'pilot@example.com', password: 'secret123', user_id: 'usr_cloudsave', guest_key: TEST_GUEST_KEY })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const authBody = await auth.json();
  const token = authBody.token;

  const saveResponse = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.14' },
    body: JSON.stringify({
      revision: authBody.save.revision,
      save: { bestScore: 7000, permanentCores: 12, matchHistory: [{ id: 'm2', score: 7000, wave: 5, skin: 'void', playedAt: '2026-06-02T09:31:22.000Z' }] }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  assert.equal(saveResponse.status, 200);

  const loadResponse = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.15' }
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(loadResponse.status, 200);
  const body = await loadResponse.json();
  assert.equal(body.save.bestScore, 7000);
  assert.equal(body.save.matchHistory[0].playedAt, '2026-06-02T09:31:22.000Z');
});

test('Worker keeps match history below the configured limit', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  await claimGuest(worker, db, 'usr_fullhistory');
  const auth = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.16' },
    body: JSON.stringify({ account: 'full-history@example.com', password: 'secret123', user_id: 'usr_fullhistory', guest_key: TEST_GUEST_KEY })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const authBody = await auth.json();
  const token = authBody.token;
  const matchHistory = Array.from({ length: 25 }, (_, index) => ({
    id: `full_${index}`,
    score: 1000 + index,
    wave: index + 1,
    skin: 'default',
    playedAt: new Date(Date.UTC(2026, 5, 2, 10, 0, index)).toISOString()
  }));

  const saveResponse = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.17' },
    body: JSON.stringify({ revision: authBody.save.revision, save: { matchHistory } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(saveResponse.status, 200);
  assert.equal(db.matchHistory.get('usr_fullhistory').length, 25);
});

test('Worker rejects score submissions that do not authenticate the submitted guest id', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const response = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.31' },
    body: JSON.stringify({ user_id: 'usr_victim0001', username: 'Impostor', score: 1000, ship_type: 'void', run_duration_ms: 60000 })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'identity_required');
});

test('Worker rotates a legacy public guest id instead of allowing it to be claimed', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.users.set('usr_legacy0001', { username: 'Legacy' });
  db.leaderboards.set('usr_legacy0001', { score: 500, ship_type: 'default', updated_at: db.now });

  const response = await worker.fetch(new Request('https://example.com/api/guest-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.32' },
    body: JSON.stringify({ user_id: 'usr_legacy0001', guest_key: 'gst_abcdefghijklmnopqrstuvwxyz123456' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.migrated, true);
  assert.notEqual(body.user_id, 'usr_legacy0001');
  assert.match(body.user_id, /^usr_[a-z0-9]{8,32}$/);
});

test('Worker logout revokes the server-side account session', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const guestKey = 'gst_abcdefghijklmnopqrstuvwxyz123456';
  await worker.fetch(new Request('https://example.com/api/guest-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.33' },
    body: JSON.stringify({ user_id: 'usr_logout001', guest_key: guestKey })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const bound = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.33' },
    body: JSON.stringify({ account: 'logout@example.com', password: 'secret123', user_id: 'usr_logout001', guest_key: guestKey, save: {} })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const token = (await bound.json()).token;

  const logout = await worker.fetch(new Request('https://example.com/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.33' }
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const cloud = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.33' }
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(logout.status, 200);
  assert.equal(cloud.status, 401);
});

test('Worker rejects legacy sessions without an expiry timestamp', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.accounts.set('legacy-session@example.com', {
    account_id: 'acct_legacy_session',
    account_key: 'legacy-session@example.com',
    account_label: 'legacy-session@example.com',
    password_salt: 'salt',
    password_hash: 'hash',
    user_id: 'usr_legacysess'
  });
  db.sessions.set('sess_legacy', { token: 'sess_legacy', account_id: 'acct_legacy_session', expires_at: 0 });

  const response = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    headers: { Authorization: 'Bearer sess_legacy', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.38' }
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 401);
  assert.equal(db.sessions.has('sess_legacy'), false);
});

test('Worker revisioned cloud snapshot allows currency spending and talent reset', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const guestKey = 'gst_abcdefghijklmnopqrstuvwxyz123456';
  await worker.fetch(new Request('https://example.com/api/guest-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.34' },
    body: JSON.stringify({ user_id: 'usr_snapshot01', guest_key: guestKey })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const bound = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.34' },
    body: JSON.stringify({
      account: 'snapshot@example.com',
      password: 'secret123',
      user_id: 'usr_snapshot01',
      guest_key: guestKey,
      save: { permanentCores: 100, talents: { A: 2 }, unlockedSkins: ['default', 'void'], currentSkin: 'void' }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const first = await bound.json();

  const updated = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.34' },
    body: JSON.stringify({ revision: first.save.revision, save: { permanentCores: 20, talents: {}, unlockedSkins: ['default'], currentSkin: 'default' } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(updated.status, 200);
  const save = (await updated.json()).save;
  assert.equal(save.permanentCores, 20);
  assert.equal(save.talents.A, 0);
  assert.deepEqual(save.unlockedSkins, ['default']);
  assert.equal(save.revision, first.save.revision + 1);
});

test('Worker rejects a stale cloud snapshot revision with the current save', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.accounts.set('stale@example.com', { account_id: 'acct_stale', account_key: 'stale@example.com', account_label: 'stale@example.com', password_salt: 'salt', password_hash: 'hash', user_id: 'usr_stale0001' });
  db.sessions.set('sess_stale', { token: 'sess_stale', account_id: 'acct_stale', expires_at: Date.now() + 60000 });
  db.cloudSaves.set('usr_stale0001', { user_id: 'usr_stale0001', permanent_cores: 50, talents_json: '{}', unlocked_skins_json: '["default"]', current_skin: 'default', best_score: 0, profile_json: '{}', revision: 3, updated_at: db.now });

  const response = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_stale', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.35' },
    body: JSON.stringify({ revision: 2, save: { permanentCores: 0 } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).save.revision, 3);
});

test('Worker limits stored match history to the newest 50 records', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.accounts.set('history@example.com', { account_id: 'acct_history', account_key: 'history@example.com', account_label: 'history@example.com', password_salt: 'salt', password_hash: 'hash', user_id: 'usr_history001' });
  db.sessions.set('sess_history', { token: 'sess_history', account_id: 'acct_history', expires_at: Date.now() + 60000 });
  const matchHistory = Array.from({ length: 60 }, (_, index) => ({
    id: `limit_${index}`,
    score: index,
    wave: 1,
    playedAt: new Date(Date.UTC(2026, 5, 2, 0, 0, index)).toISOString()
  }));

  const response = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_history', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.36' },
    body: JSON.stringify({ revision: 0, save: { matchHistory } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  assert.equal(db.matchHistory.get('usr_history001').length, 50);
});

test('Worker cannot overwrite another users match history record id', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  db.accounts.set('owner@example.com', { account_id: 'acct_owner', account_key: 'owner@example.com', account_label: 'owner@example.com', password_salt: 'salt', password_hash: 'hash', user_id: 'usr_owner0001' });
  db.accounts.set('attacker@example.com', { account_id: 'acct_attacker', account_key: 'attacker@example.com', account_label: 'attacker@example.com', password_salt: 'salt', password_hash: 'hash', user_id: 'usr_attack001' });
  db.sessions.set('sess_attacker', { token: 'sess_attacker', account_id: 'acct_attacker', expires_at: Date.now() + 60000 });
  db.matchHistory.set('usr_owner0001', [{
    match_id: 'shared_match_id',
    user_id: 'usr_owner0001',
    score: 5000,
    wave: 5,
    skin: 'void',
    is_new_best: 1,
    permanent_cores_earned: 10,
    played_at: '2026-06-02T10:00:00.000Z'
  }]);

  const response = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_attacker', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.39' },
    body: JSON.stringify({
      revision: 0,
      save: {
        matchHistory: [{ id: 'shared_match_id', score: 1, wave: 1, playedAt: '2026-06-03T10:00:00.000Z' }]
      }
    })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 200);
  assert.equal(db.matchHistory.get('usr_owner0001')[0].score, 5000);
  assert.equal(db.matchHistory.get('usr_attack001')?.length || 0, 0);
});

test('Worker rejects oversized account bind bodies before parsing JSON', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const response = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': '70000',
      Origin: 'https://renlimeng.qzz.io',
      'CF-Connecting-IP': '203.0.113.37'
    },
    body: JSON.stringify({ account: 'large@example.com', password: 'secret123', padding: 'x'.repeat(60000) })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(response.status, 413);
});
