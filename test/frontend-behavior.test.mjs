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

async function loadLeaderboardApi(storage = new Map(), fetchImpl = async () => ({ success: true })) {
  const source = await readFile(new URL('../js/leaderboard_api.js', import.meta.url), 'utf8');
  const sandbox = {
    window: {
      STARSEA_LEADERBOARD: { enabled: true, useSameOriginApi: true },
      localStorage: {
        getItem(key) {
          return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
          storage.set(key, String(value));
        },
        removeItem(key) {
          storage.delete(key);
        }
      },
      crypto: {
        getRandomValues(arr) {
          for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
          return arr;
        }
      },
      fetch: async (url, options) => new Response(JSON.stringify(await fetchImpl(url, options || {})), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }),
      dispatchEvent() {},
      CustomEvent: function CustomEvent(type, init) {
        return { type, detail: init && init.detail };
      }
    },
    Response
  };
  sandbox.window.window = sandbox.window;
  sandbox.localStorage = sandbox.window.localStorage;
  sandbox.crypto = sandbox.window.crypto;
  sandbox.fetch = sandbox.window.fetch;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { api: sandbox.window.StarseaLeaderboard, storage };
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

test('engine trail burn chance is scaled by frame delta', async () => {
  const source = await readFile(new URL('../js/engine_base.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /engineLevel > 0 && Math\.random\(\) < 0\.4/);
  assert.match(source, /trailBurnChance[\s\S]*dtClamped/);
});

test('drone rogue mod does not push turret level beyond wingman capacity', async () => {
  const source = await readFile(new URL('../js/engine_entities.js', import.meta.url), 'utf8');
  const sandbox = {
    GameEngine: function GameEngine() {},
    localStorage: { getItem() { return null; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const engine = new sandbox.GameEngine();
  engine.player = { x: 100, y: 200, equippedMods: [] };
  engine.hangar = { turretLevel: 2 };
  engine.wingmen = [{ side: -1 }, { side: 1 }];
  engine.addFloatText = () => {};
  engine.showToast = () => {};
  engine.updateWingmen = function updateWingmen() {
    this.wingmenUpdatedWith = this.hangar.turretLevel;
  };

  engine.applyModCard('drone');

  assert.equal(engine.hangar.turretLevel, 2);
  assert.equal(engine.wingmenUpdatedWith, 2);
});

test('main and engine rogue card rendering share the same selectable mod pool helper', async () => {
  const entitiesSource = await readFile(new URL('../js/engine_entities.js', import.meta.url), 'utf8');
  const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

  assert.match(entitiesSource, /function getAvailableRogueModPool\(/);
  assert.match(entitiesSource, /function selectRogueUpgradeMods\(/);
  assert.match(mainSource, /selectRogueUpgradeMods\(elementSlots,\s*comboKey,\s*equipped\)/);
  assert.match(entitiesSource, /selectRogueUpgradeMods\(slots,\s*this\.player\.comboKey,\s*equipped\)/);
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

test('leaderboard profile sync does not submit best score as a leaderboard entry', async () => {
  const pageScript = await readFile(new URL('../js/leaderboard_page.js', import.meta.url), 'utf8');

  assert.equal(pageScript.includes('API.submitScore(state.bestScore'), false);
  assert.match(pageScript, /API\.submitScore\(0,\s*state\.skin,\s*state\.nickname/s);
});

test('leaderboard refresh pulls bound cloud save before rendering recent matches', async () => {
  const pageScript = await readFile(new URL('../js/leaderboard_page.js', import.meta.url), 'utf8');

  assert.match(pageScript, /async function refreshCloudSaveIfBound\(\)/);
  assert.match(pageScript, /const cloudRefresh = refreshCloudSaveIfBound\(\)\.then/s);
  assert.match(pageScript, /loadLocalData\(\);\s*renderProfile\(\);/s);
  assert.match(pageScript, /if \(!changed\) return;\s*loadLocalData\(\);\s*renderProfile\(\);/s);
});

test('leaderboard refresh pushes local hangar changes before pulling cloud save', async () => {
  const pageScript = await readFile(new URL('../js/leaderboard_page.js', import.meta.url), 'utf8');

  assert.match(pageScript, /API\.hasLocalCloudSaveChanges\(\)/);
  assert.match(pageScript, /await API\.saveCloudSave\(API\.collectLocalCloudSave\(\)\);[\s\S]*return true;/);
  assert.match(pageScript, /await API\.fetchCloudSave\(\);/);
});

test('leaderboard page does not block the first list render on slower profile calls', async () => {
  const pageScript = await readFile(new URL('../js/leaderboard_page.js', import.meta.url), 'utf8');

  assert.match(pageScript, /LEADERBOARD_CACHE_KEY/);
  assert.match(pageScript, /function renderCachedLeaderboard\(\)/);
  assert.match(pageScript, /const playerPromise = API\.fetchPlayer\(state\.userId\)\.catch/);
  assert.match(pageScript, /const data = await API\.fetchLeaderboard\(50\);[\s\S]*renderLeaderboard\(state\.leaderboard\);[\s\S]*const player = await playerPromise;/);
});

test('hangar summary link has overflow guards', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');

  assert.match(html, /\.hangar-link\s*{[^}]*max-width:\s*100%/s);
  assert.match(html, /\.hangar-link\s*{[^}]*white-space:\s*nowrap/s);
});

test('hangar talent cards use permanent core balance when rendering purchase buttons', async () => {
  const source = await readFile(new URL('../js/engine_hangar.js', import.meta.url), 'utf8');
  const elements = new Map();
  const createElement = () => ({
    classList: { add() {}, remove() {} },
    disabled: null,
    innerText: '',
    querySelectorAll() {
      return [];
    }
  });
  let readPermanentCoresCalls = 0;
  const sandbox = {
    GameEngine: function GameEngine() {},
    TALENT_DEFINITIONS: [{ id: 'A', maxLevel: 3, cost: 10 }],
    safeReadPermanentCores() {
      readPermanentCoresCalls++;
      return 12;
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const engine = new sandbox.GameEngine();
  engine.talents = { A: 0 };

  assert.doesNotThrow(() => engine.renderTalentCards());
  assert.equal(readPermanentCoresCalls, 1);
  assert.equal(elements.get('buyTalentABtn').disabled, false);
});

test('gameplay HUD uses the compact spacing pass', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(css, /#hud\s*{[^}]*padding:\s*8px 12px 0 !important/s);
  assert.match(css, /#hud\s*{[^}]*gap:\s*4px !important/s);
  assert.match(css, /#hud #bossHpGroup\s*{[^}]*padding:\s*6px 8px !important/s);
});

test('start screen bottom dock stays inside mobile visual viewport', async () => {
  const html = await readFile(new URL('../space_shooter.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /-webkit-fill-available/);
  assert.match(css, /#canvas-container\s*{[^}]*height:\s*var\(--app-height,\s*100dvh\)/s);
  assert.match(css, /#startScreen\s*{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.start-shell\s*{[^}]*min-height:\s*0/s);
  assert.match(css, /\.home-entry-dock\s*{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /\.home-entry-dock\s*{[^}]*safe-area-inset-bottom/s);
  assert.match(mainSource, /visualViewport/);
  assert.match(mainSource, /--app-height/);
});

test('leaderboard mobile rows keep the uploaded time visible', async () => {
  const html = await readFile(new URL('../leaderboard.html', import.meta.url), 'utf8');

  assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.date-column\s*{[^}]*display:\s*block/s);
  assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.date-column\s*{[^}]*grid-column:\s*2 \/ -1/s);
});

test('frontend leaderboard API authenticates guest score submissions and handles identity migration', async () => {
  const apiSource = await readFile(new URL('../js/leaderboard_api.js', import.meta.url), 'utf8');

  assert.match(apiSource, /space_guest_key/);
  assert.match(apiSource, /\/api\/guest-session/);
  assert.match(apiSource, /guest_key/);
  assert.match(apiSource, /replacement_user_id|migrated/);
});

test('frontend cloud save synchronization sends and persists revisions', async () => {
  const apiSource = await readFile(new URL('../js/leaderboard_api.js', import.meta.url), 'utf8');

  assert.match(apiSource, /space_cloud_save_revision/);
  assert.match(apiSource, /revision/);
});

test('frontend cloud save dirty marker is cleared only after a successful save', async () => {
  const storage = new Map([
    ['space_cloud_save_dirty_at', '1234'],
    ['space_account_token', 'sess_abc'],
    ['space_cloud_save_revision', '1']
  ]);
  let saveRequest = null;
  const { api } = await loadLeaderboardApi(storage, async (url, options) => {
    if (String(url).endsWith('/api/cloud-save') && options.method === 'POST') {
      saveRequest = JSON.parse(options.body);
      return { success: true, save: { revision: 2, permanentCores: 4 } };
    }
    return { success: true, save: { revision: 1, permanentCores: 99 } };
  });

  assert.equal(api.hasLocalCloudSaveChanges(), true);
  await api.saveCloudSave({ permanentCores: 4 });

  assert.equal(saveRequest.revision, 1);
  assert.equal(storage.get('space_cloud_save_revision'), '2');
  assert.equal(storage.has('space_cloud_save_dirty_at'), false);
  assert.equal(api.hasLocalCloudSaveChanges(), false);
});

test('main thread game over uses the shared local match settlement helper', async () => {
  const engineSource = await readFile(new URL('../js/engine_base.js', import.meta.url), 'utf8');
  const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

  assert.match(mainSource, /function settleLocalGameOver\(/);
  assert.match(engineSource, /settleLocalGameOver/);
});

test('all inline HTML scripts parse successfully', async () => {
  const htmlFiles = [
    'game_design.html',
    'game_manual.html',
    'index.html',
    'leaderboard.html',
    'space_shooter.html',
    'v6_hangar.html',
    'v6_roadmap.html',
    'v7_hangar.html',
    'v7_roadmap.html',
    'version_history.html'
  ];

  for (const file of htmlFiles) {
    const html = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const [index, script] of inlineScripts.entries()) {
      assert.doesNotThrow(() => new vm.Script(script[1], { filename: `${file}#inline-${index + 1}` }));
    }
  }
});

test('local launcher binds to loopback and only stops its own server process', async () => {
  const launcher = await readFile(new URL('../start.bat', import.meta.url), 'utf8');
  const server = await readFile(new URL('../tools/local_server.ps1', import.meta.url), 'utf8');

  assert.match(launcher, /127\.0\.0\.1:9999/);
  assert.match(launcher, /taskkill \/t \/f \/pid %SERVER_PID%/i);
  assert.equal(/netstat -aon|findstr :9999/i.test(launcher), false);
  assert.match(server, /http:\/\/127\.0\.0\.1:\$Port\//);
  assert.match(server, /StartsWith\(\$root/);
});
