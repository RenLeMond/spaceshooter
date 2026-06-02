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
    return { api: sandbox.window.StarseaLeaderboard, storage };
  });
}

class FakeDb {
  constructor() {
    this.users = new Map();
    this.leaderboards = new Map();
    this.rateLimits = new Map();
    this.accounts = new Map();
    this.sessions = new Map();
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
    if (sql.includes('SELECT 1')) return { ok: 1 };
    if (sql.includes('FROM leaderboards l') && sql.includes('WHERE l.user_id')) {
      const id = this.args[0];
      const score = this.db.leaderboards.get(id);
      const user = this.db.users.get(id);
      return score && user ? { user_id: id, username: user.username, ...score } : null;
    }
    if (sql.includes('COUNT(*) + 1 AS rank')) {
      const [score, updatedAt, userId] = this.args;
      let rank = 1;
      for (const [id, row] of this.db.leaderboards) {
        if (row.score > score || (row.score === score && (row.updated_at < updatedAt || (row.updated_at === updatedAt && id < userId)))) {
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
      return account ? { user_id: account.user_id } : null;
    }
    if (sql.includes('FROM player_cloud_saves')) {
      return this.db.cloudSaves.get(this.args[0]) || null;
    }
    throw new Error('Unhandled first SQL: ' + sql);
  }

  async all() {
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
      const [accountId, accountKey, accountLabel, passwordSalt, passwordHash, userId] = this.args;
      this.db.accounts.set(accountKey, { account_id: accountId, account_key: accountKey, account_label: accountLabel, password_salt: passwordSalt, password_hash: passwordHash, user_id: userId });
      return {};
    }
    if (sql.includes('INSERT INTO account_sessions')) {
      const [token, accountId] = this.args;
      this.db.sessions.set(token, { token, account_id: accountId });
      return {};
    }
    if (sql.includes('INSERT INTO player_cloud_saves')) {
      const [userId, permanentCores, talentsJson, unlockedSkinsJson, currentSkin, bestScore, profileJson] = this.args;
      this.db.cloudSaves.set(userId, { user_id: userId, permanent_cores: permanentCores, talents_json: talentsJson, unlocked_skins_json: unlockedSkinsJson, current_skin: currentSkin, best_score: bestScore, profile_json: profileJson, updated_at: this.db.now });
      return {};
    }
    if (sql.includes('INSERT INTO match_history')) {
      const [matchId, userId, score, wave, skin, isNewBest, permanentCoresEarned, playedAt] = this.args;
      const rows = this.db.matchHistory.get(userId) || [];
      const next = rows.filter(row => row.match_id !== matchId);
      next.unshift({ match_id: matchId, user_id: userId, score, wave, skin, is_new_best: isNewBest, permanent_cores_earned: permanentCoresEarned, played_at: playedAt });
      next.sort((a, b) => String(b.played_at).localeCompare(String(a.played_at)));
      this.db.matchHistory.set(userId, next);
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

test('Worker updates username without creating a leaderboard row for zero score', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const response = await worker.fetch(new Request('https://example.com/api/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify({ user_id: 'usr_abcdef12', username: 'Pilot', score: 0, ship_type: 'void' })
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
  const response = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify({
      account: 'pilot@example.com',
      password: 'secret123',
      user_id: 'usr_firstbind',
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
  const first = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.11' },
    body: JSON.stringify({ account: 'pilot@example.com', password: 'secret123', user_id: 'usr_firstbind', save: { bestScore: 1200, permanentCores: 5 } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  assert.equal(first.status, 200);
  await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await first.clone().json()).token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.11' },
    body: JSON.stringify({ save: { profile: { nickname: 'Pilot', avatar: 'fa-crown', bio: 'Cloud' } } })
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
  assert.equal(body.save.permanentCores, 99);
  assert.equal(body.save.profile.nickname, 'Pilot');
  assert.equal(body.save.profile.avatar, 'fa-crown');
});

test('Worker cloud save endpoint persists match history with second-level timestamps', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const auth = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.13' },
    body: JSON.stringify({ account: 'pilot@example.com', password: 'secret123', user_id: 'usr_cloudsave' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const token = (await auth.json()).token;

  const saveResponse = await worker.fetch(new Request('https://example.com/api/cloud-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.14' },
    body: JSON.stringify({ save: { bestScore: 7000, permanentCores: 12, matchHistory: [{ id: 'm2', score: 7000, wave: 5, skin: 'void', playedAt: '2026-06-02T09:31:22.000Z' }] } })
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

test('Worker keeps full match history in D1 instead of trimming stored rows', async () => {
  const worker = await loadWorker();
  const db = new FakeDb();
  const auth = await worker.fetch(new Request('https://example.com/api/auth/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://renlimeng.qzz.io', 'CF-Connecting-IP': '203.0.113.16' },
    body: JSON.stringify({ account: 'full-history@example.com', password: 'secret123', user_id: 'usr_fullhistory' })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });
  const token = (await auth.json()).token;
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
    body: JSON.stringify({ save: { matchHistory } })
  }), { DB: db, ALLOWED_ORIGINS: 'https://renlimeng.qzz.io' });

  assert.equal(saveResponse.status, 200);
  assert.equal(db.matchHistory.get('usr_fullhistory').length, 25);
});
