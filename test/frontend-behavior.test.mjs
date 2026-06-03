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

test('weapon stat calculation lists all in-run hangar module bonuses', async () => {
  const sandbox = await loadMainWeaponHelpers();
  sandbox.updateWeaponStatsState({
    hangar: { turretLevel: 2, engineLevel: 3, wingsLevel: 1 },
    equippedMods: []
  });

  const stats = sandbox.computeWeaponStats();
  const titles = stats.details.map(item => item.title);

  assert.ok(titles.includes('纳米智能伴飞僚机'));
  assert.ok(titles.includes('等离子尾喷'));
  assert.ok(titles.includes('切割能盾翼'));
  assert.ok(stats.details.some(item => item.title === '等离子尾喷' && item.desc.includes('尾迹烧伤')));
  assert.ok(stats.details.some(item => item.title === '切割能盾翼' && item.desc.includes('护盾激活')));
});

test('weapon stat calculation lists active mod and skin effects that change combat', async () => {
  const sandbox = await loadMainWeaponHelpers();
  sandbox.updateWeaponStatsState({
    slots: ['EM', 'Fire'],
    comboKey: 'EM+Fire',
    currentSkin: 'thunder',
    equippedMods: ['drone', 'tesla', 'implosion']
  });

  const stats = sandbox.computeWeaponStats();
  const titles = stats.details.map(item => item.title);

  assert.ok(titles.includes('先驱无人机'));
  assert.ok(titles.includes('特斯拉雷电'));
  assert.ok(titles.includes('折跃重力星轨'));
  assert.ok(titles.includes('超维雷霆机体'));
  assert.ok(stats.details.some(item => item.title === '超维雷霆机体' && item.desc.includes('520px')));
});

test('weapon stat calculation lists void skin slingshot tsunami effect', async () => {
  const sandbox = await loadMainWeaponHelpers();
  sandbox.updateWeaponStatsState({ currentSkin: 'void' });

  const stats = sandbox.computeWeaponStats();

  assert.ok(stats.details.some(item => item.title === '星渊幻影机体' && item.desc.includes('800px')));
});

test('leaderboard page keeps bound accounts locked and removes unlink control', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');

  assert.equal(html.includes('id="btnUnbindAccount"'), false);
  assert.match(html, /当前档案已绑定/);
});

test('leaderboard page uses automatic sync controls and offers local account logout', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');
  const pageScript = await readFile(new URL('../js/leaderboard_page.js', import.meta.url), 'utf8');

  assert.equal(html.includes('id="btnSyncLocalScore"'), false);
  assert.equal(html.includes('id="btnRefreshLocal"'), false);
  assert.match(html, /id="btnLogoutAccount"/);
  assert.match(pageScript, /function logoutAccount\(\)/);
  assert.match(pageScript, /space_account_token/);
});

test('hangar summary link has overflow guards', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');

  assert.match(html, /\.hangar-link\s*{[^}]*max-width:\s*100%/s);
  assert.match(html, /\.hangar-link\s*{[^}]*white-space:\s*nowrap/s);
});

test('gameplay HUD uses the compact spacing pass', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(css, /#hud\s*{[^}]*padding:\s*8px 12px 0 !important/s);
  assert.match(css, /#hud\s*{[^}]*gap:\s*4px !important/s);
  assert.match(css, /#hud #bossHpGroup\s*{[^}]*padding:\s*6px 8px !important/s);
});
