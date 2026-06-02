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
    throw new Error('Unhandled all SQL: ' + this.sql);
  }

  async run() {
    const sql = this.sql;
    if (sql.includes('CREATE TABLE IF NOT EXISTS request_rate_limits')) return {};
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
      this.db.users.set(this.args[0], { username: this.args[1], is_guest: 1 });
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
