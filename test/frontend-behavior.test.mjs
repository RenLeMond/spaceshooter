import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function runConfigForHost(hostname) {
  const source = await readFile(new URL('../js/leaderboard_config.js', import.meta.url), 'utf8');
  const sandbox = { window: { location: { hostname } } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.window.STARSEA_LEADERBOARD;
}

async function loadMainWeaponHelpers() {
  const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('let loadoutState =');
  const end = source.indexOf('function renderLoadoutStrip()');
  const snippet = source.slice(start, end);
  const sandbox = {
    window: {},
    document: {
      getElementById() {
        return null;
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
  return sandbox;
}

test('ngrok previews use the production same-site API host', async () => {
  const ngrok = await runConfigForHost('finalize-sacrament-bagginess.ngrok-free.dev');
  const prod = await runConfigForHost('game.rlmbest.xyz');

  assert.equal(ngrok.apiBase, 'https://game.rlmbest.xyz');
  assert.equal(prod.apiBase, '');
});

test('weapon base stats expose fused weapon special bonuses', async () => {
  const sandbox = await loadMainWeaponHelpers();
  const stats = sandbox.getWeaponBaseStats(['EM', 'Rad'], 'EM+Rad');

  assert.equal(stats.name, '磁重力爆破核心');
  assert.match(stats.special, /无限穿透/);
  assert.match(stats.special, /大范围/);
});

test('weapon stat calculation includes fused weapon base damage before talent modifiers', async () => {
  const sandbox = await loadMainWeaponHelpers();
  sandbox.updateWeaponStatsState({
    slots: ['Fire', 'Rad'],
    comboKey: 'Fire+Rad',
    talents: { B: 3 },
    equippedMods: []
  });

  const stats = sandbox.computeWeaponStats();

  assert.equal(stats.base.name, '坍缩黑洞星云爆');
  assert.equal(stats.damage, 80);
  assert.equal(stats.meteorDamage, 89.60000000000001);
  assert.equal(stats.bossDamage, 82.4);
  assert.ok(stats.details.some(item => item.title === '晶核合成增益' && item.desc.includes('单发伤害最高')));
});

test('leaderboard page keeps bound accounts locked and removes unlink control', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');

  assert.equal(html.includes('id="btnUnbindAccount"'), false);
  assert.match(html, /当前档案已绑定/);
});

test('hangar summary link has overflow guards', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');

  assert.match(html, /\.hangar-link\s*{[^}]*max-width:\s*100%/s);
  assert.match(html, /\.hangar-link\s*{[^}]*white-space:\s*nowrap/s);
});
