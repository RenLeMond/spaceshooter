// ============================================================
// V7 机载构装 UI 模块：Roguelike 升级卡片 / 构装总览面板 / 武器属性面板
// 依赖：engine_entities.js 的 ROGUE_MOD_DEFINITIONS 与 selectRogueUpgradeMods，
//       sound.js 的 sfx。通过 window.updateLoadoutUI / window.updateWeaponStatsState
//       与引擎及主线程桥接层解耦通信。
// ============================================================

function renderMainRogueUpgradeCards(container, elementSlots, comboKey, equippedMods) {
    container.innerHTML = '';

    const equipped = equippedMods || [];
    const selected = selectRogueUpgradeMods(elementSlots, comboKey, equipped);

    // 兜底防软锁：若无任何可选模组，直接关闭弹窗并恢复战斗（引擎侧通常已拦截，此处为双保险）
    if (selected.length === 0) {
        const screen = document.getElementById('rogueUpgradeScreen');
        if (screen) screen.classList.add('hidden');
        if (window.gameWorker) window.gameWorker.postMessage({ type: 'resumeGame' });
        return;
    }

    selected.forEach(mod => {
        const card = document.createElement('div');
        const themeClass = mod.class === '超维共鸣' ? 'rogue-amber' : (mod.class === '混沌魔改' ? 'rogue-rose' : 'rogue-cyan');
        card.className = `rogue-card ${themeClass}`;

        // 静态 HTML 骨架中不含用户数据；mod.title / mod.class / mod.desc 通过 textContent 注入防止 XSS
        // mod.icon 只允许字母、数字、连字符，过滤其他字符后再写入 class 属性
        const safeIcon = String(mod.icon || '').replace(/[^a-z0-9-]/gi, '');
        card.innerHTML = `
            <div class="rogue-scan"></div>
            <div class="rogue-icon"><i class="fa-solid ${safeIcon}"></i></div>
            <div class="rogue-body pointer-events-none">
                <div class="flex items-center justify-between">
                    <span class="rogue-name"></span>
                    <span class="rogue-class-tag"></span>
                </div>
                <p class="rogue-desc mt-1"></p>
            </div>
            <div class="rogue-action-hint pointer-events-none">
                <i class="fa-solid fa-circle-chevron-right animate-pulse"></i>
            </div>
        `;
        card.querySelector('.rogue-name').textContent = mod.title;
        card.querySelector('.rogue-class-tag').textContent = mod.class;
        card.querySelector('.rogue-desc').textContent = mod.desc;
        
        card.addEventListener('click', () => {
            if (window.gameWorker) {
                window.gameWorker.postMessage({ type: 'modSelected', modId: mod.id });
            }
            document.getElementById('rogueUpgradeScreen').classList.add('hidden');
            if (typeof sfx !== 'undefined' && sfx.playPowerup) sfx.playPowerup();
        });
        container.appendChild(card);
    });
}

// ============================================================
// V7 机载量子构装总览 (Loadout Overview)
// 同时服务 Worker 模式（hud 消息驱动）与单线程降级模式（engine.updateHUD 直接回调）。
// 数据源：equippedMods + 当前晶核槽 + comboKey；渲染 HUD 快捷条与全屏总览面板。
// ============================================================
// TEST_ANCHOR: WEAPON_HELPERS_START
let loadoutState = { equipped: [], slots: [], comboKey: '' };
let _lastStripSig = null;
let weaponStatsState = {
    slots: [],
    comboKey: '',
    synergyName: '基础高频激光',
    equippedMods: [],
    currentSkin: 'default',
    hangar: { turretLevel: 0, engineLevel: 0, wingsLevel: 0 },
    talents: { A: 0, B: 0, C: 0, D: 0, E: 0 }
};

function getRogueModDefinitions() {
    return (typeof ROGUE_MOD_DEFINITIONS !== 'undefined' && Array.isArray(ROGUE_MOD_DEFINITIONS))
        ? ROGUE_MOD_DEFINITIONS
        : [];
}

function loadoutThemeColor(mod) {
    return mod.class === '超维共鸣' ? 'amber' : (mod.class === '混沌魔改' ? 'rose' : 'cyan');
}

function updateLoadoutUI(equipped, slots, comboKey) {
    loadoutState.equipped = Array.isArray(equipped) ? equipped : [];
    loadoutState.slots = Array.isArray(slots) ? slots : [];
    loadoutState.comboKey = comboKey || '';
    renderLoadoutStrip();
    const panel = document.getElementById('loadoutPanel');
    if (panel && !panel.classList.contains('hidden')) renderLoadoutPanel();
}
window.updateLoadoutUI = updateLoadoutUI;

function updateWeaponStatsState(next) {
    weaponStatsState = Object.assign({}, weaponStatsState, next || {});
    if (next && next.hangar) weaponStatsState.hangar = Object.assign({}, weaponStatsState.hangar, next.hangar);
    if (next && next.talents) weaponStatsState.talents = Object.assign({}, weaponStatsState.talents, next.talents);
    if (next && next.equippedMods) weaponStatsState.equippedMods = Array.isArray(next.equippedMods) ? next.equippedMods : [];
    if (next && next.slots) weaponStatsState.slots = Array.isArray(next.slots) ? next.slots : [];
    const panel = document.getElementById('weaponStatsPanel');
    if (panel && !panel.classList.contains('hidden')) renderWeaponStatsPanel();
    const popover = document.getElementById('coreWeaponPopover');
    if (popover && !popover.classList.contains('hidden')) renderCoreWeaponPopover();
}
window.updateWeaponStatsState = updateWeaponStatsState;

function getWeaponBaseStats(slots, comboKey) {
    const key = comboKey || (slots && slots[0]) || '';
    const map = {
        '': { name: '基础高频激光', damage: 20, radius: 4, pierce: 1, shots: 1, desc: '无晶核挂载时的稳定主炮。', special: '稳定射速，无额外晶核增益。' },
        EM: { name: '高频快速电磁炮', damage: 25, radius: 3.5, pierce: 1, shots: 1, desc: '高速电磁弹，适合触发雷暴类构装。', special: '高速弹道，适配雷电追击类构装。' },
        Frost: { name: '超导绝对零度枪', damage: 30, radius: 5, pierce: 1, shots: 1, desc: '低温弹体，命中可触发冰暴反应。', special: '低温弹体，弹体半径略增。' },
        Fire: { name: '熔核聚变爆裂弹', damage: 35, radius: 6, pierce: 1, shots: 1, desc: '高热弹体，单发基础伤害较高。', special: '高热弹体，单发基础伤害提升。' },
        Rad: { name: '高能恒星辐射光', damage: 40, radius: 8, pierce: 1, shots: 1, desc: '高能辐射弹，弹体更大。', special: '辐射弹体，基础半径更大。' },
        'EM+Frost': { name: '冰暴超导跃迁枪', damage: 35, radius: 8, pierce: 3, shots: 1, desc: '超导冰弹，穿透能力显著提升。', special: '穿透 +2，弹体半径提升到 R8；命中减速陨石 70%。' },
        'EM+Fire': { name: '雷霆聚变链式炮', damage: 45, radius: 7, pierce: 1, shots: 1, desc: '聚变链式主炮，适合配合雷电追击。', special: '合成后基础伤害 45；命中对 140px 范围内陨石造成 25 溅射伤害。' },
        'EM+Rad': { name: '磁重力爆破核心', damage: 55, radius: 15, pierce: 99, shots: 1, desc: '大范围磁重力弹体，近似无限穿透。', special: '大范围 R15，近似无限穿透。' },
        'Fire+Frost': { name: '升华相差熔岩风暴', damage: 30, radius: 6, pierce: 1, shots: 2, desc: '左右双弹齐射，每发独立造成伤害。', special: '双发齐射，每发独立结算构装与天赋增益。' },
        'Frost+Rad': { name: '绝对静止视界', damage: 40, radius: 10, pierce: 2, shots: 1, desc: '冻结视界弹，半径与穿透均衡。', special: '半径 R10，穿透 +1；命中冻结陨石完全停止。' },
        'Fire+Rad': { name: '坍缩黑洞星云爆', damage: 80, radius: 18, pierce: 1, shots: 1, desc: '重型爆破主炮，单发伤害最高。', special: '单发伤害最高；命中对 125px 范围内陨石造成 35 溅射伤害并引力拉扯。' }
    };
    return map[key] || map[''];
}

function computeWeaponStats() {
    const state = weaponStatsState;
    const mods = Array.isArray(state.equippedMods) ? state.equippedMods : [];
    const talents = state.talents || {};
    const hangar = state.hangar || {};
    const base = getWeaponBaseStats(state.slots || [], state.comboKey || '');
    let damage = base.damage;
    let radius = base.radius;
    let pierce = base.pierce;
    let fireInterval = 180;
    const details = [
        { icon: 'fa-crosshairs', title: base.name, desc: base.desc, value: base.shots > 1 ? `${base.shots} 发 x ${base.damage}` : `${base.damage}` }
    ];
    if ((state.comboKey || '').includes('+')) {
        details.push({ icon: 'fa-atom', title: '晶核合成增益', desc: base.special || base.desc, value: `${base.shots > 1 ? `${base.shots}x` : ''}R${fmt(base.radius)} / P${base.pierce}` });
    }

    if (mods.includes('antimatter')) {
        damage = Math.floor(damage * 1.8);
        details.push({ icon: 'fa-radiation', title: '反物质过载', desc: '主武器基础伤害 +80%，最大 HP -30%。', value: '+80%' });
    }
    if (mods.includes('split')) {
        damage = Math.floor(damage * 0.85);
        details.push({ icon: 'fa-cubes', title: '多重散射', desc: '主炮伤害 -15%，额外发射左右两发 15 伤害侧向子弹。', value: '侧翼 +2' });
    }
    if (mods.includes('heavy')) {
        radius *= 1.4;
        pierce += 1;
        fireInterval = Math.floor(fireInterval * 1.12);
        details.push({ icon: 'fa-compress', title: '重力巨弹', desc: '弹体半径 +40%，穿透 +1，开火间隔延长约 12%。', value: `R${fmt(radius)} / P${pierce}` });
    }

    const bLevel = Math.max(0, Math.min(Number(talents.B) || 0, 3));
    const meteorDamage = damage * (1 + bLevel * 0.04);
    const bossDamage = damage * (1 + bLevel * 0.01);
    if (bLevel > 0) {
        details.push({ icon: 'fa-burst', title: '火控晶核增幅', desc: `永久天赋 B Lv.${bLevel}：陨石伤害 +${bLevel * 4}%，Boss 伤害 +${bLevel}%。`, value: `Lv.${bLevel}` });
    }

    const turretLevel = Math.max(0, Math.min(Number(hangar.turretLevel) || 0, 3));
    if (mods.includes('drone')) {
        details.push({ icon: 'fa-shield-halved', title: '先驱无人机', desc: '机载构装额外加挂一架智能索敌巡航能盾僚机，并入当前僚机火力体系。', value: '僚机 +1' });
    }
    if (turretLevel > 0) {
        const wingmen = Math.min(2, turretLevel);
        const turretDamage = 8 + turretLevel * 4;
        const wingmanDamage = getWingmanDamage(state.comboKey || '', turretLevel);
        details.push({ icon: 'fa-gun', title: '纳米智能伴飞僚机', desc: `自动索敌双侧炮每侧 ${turretDamage} 伤害；伴飞僚机 ${wingmen} 架，共享当前晶核组合。`, value: `${wingmen} 架` });
        details.push({ icon: 'fa-jet-fighter-up', title: '僚机主射击', desc: wingmanDamage.desc, value: wingmanDamage.value });
    }

    const engineLevel = Math.max(0, Math.min(Number(hangar.engineLevel) || 0, 3));
    if (engineLevel > 0) {
        details.push({ icon: 'fa-fire-flame-curved', title: '等离子尾喷', desc: `尾迹烧伤会持续灼烧后方近距离陨石；每次触发造成 ${fmt(engineLevel * 0.8)} 点伤害。`, value: `Lv.${engineLevel}` });
    }

    const wingsLevel = Math.max(0, Math.min(Number(hangar.wingsLevel) || 0, 1));
    if (wingsLevel > 0) {
        details.push({ icon: 'fa-shield-virus', title: '切割能盾翼', desc: '护盾激活时撞击陨石会直接切割摧毁目标，并获得 +4 废料与额外分数。', value: '护盾切割' });
    }

    if (mods.includes('tesla')) {
        details.push({ icon: 'fa-bolt', title: '特斯拉雷电', desc: '所有主炮子弹命中后有 40% 概率触发 300px 链式高频雷暴，每跳 25 伤害，最多跳跃 2 次。', value: '40%' });
    }
    if (mods.includes('implosion')) {
        details.push({ icon: 'fa-circle-notch', title: '折跃重力星轨', desc: '战术折跃会在起点与终点留下引力聚能轨迹，拉扯并压制附近陨石。', value: 'Shift' });
    }

    const eLevel = Math.max(0, Math.min(Number(talents.E) || 0, 2));
    if (eLevel > 0) {
        const chance = eLevel === 1 ? 12 : 20;
        details.push({ icon: 'fa-angles-up', title: '僚机副武器齐射', desc: `永久天赋 E Lv.${eLevel}：开火时 ${chance}% 概率追加左右两发 8 伤害侧翼弹。`, value: `${chance}%` });
    }

    const dLevel = Math.max(0, Math.min(Number(talents.D) || 0, 3));
    let magnetBase = state.currentSkin === 'imperial' ? 230 : 180;
    const magnet = magnetBase + dLevel * 35;
    if (state.currentSkin === 'void') {
        details.push({ icon: 'fa-ghost', title: '星渊幻影机体', desc: '引力弹弓触发时释放 800px 引力海啸波，推挤并扰动大范围陨石。', value: '800px' });
    }
    if (state.currentSkin === 'thunder') {
        details.push({ icon: 'fa-bolt-lightning', title: '超维雷霆机体', desc: 'EM+Fire 僚机链电索敌距离 +30%，由 400px 提升到 520px。', value: '+30%' });
    }
    if (state.currentSkin === 'imperial') {
        details.push({ icon: 'fa-crown', title: '帝皇余晖机体', desc: '强磁拾取主题机体：基础吸附范围从 180px 提升到 230px；每次拾取废料 +2（双倍暴击）。', value: '+50px / 废料×2' });
    }
    if (dLevel > 0) {
        details.push({ icon: 'fa-magnet', title: '磁力量子虹吸', desc: `永久天赋 D Lv.${dLevel}：废料 / 经验吸附半径 +${dLevel * 35}px。`, value: `+${dLevel * 35}px` });
    }

    const aLevel = Math.max(0, Math.min(Number(talents.A) || 0, 3));
    if (aLevel > 0) details.push({ icon: 'fa-gauge-high', title: '量子超频催化', desc: `永久天赋 A Lv.${aLevel}：折跃充能效率 +${aLevel * 10}%。`, value: `+${aLevel * 10}%` });
    const cLevel = Math.max(0, Math.min(Number(talents.C) || 0, 3));
    if (cLevel > 0) details.push({ icon: 'fa-shield-halved', title: '反物质纳米力场', desc: `永久天赋 C Lv.${cLevel}：碰撞伤害减免 +${cLevel * 8}%。`, value: `-${cLevel * 8}%` });

    // 引力弹弓临时增益说明（非永久属性，触发时生效）
    details.push({ icon: 'fa-bolt-lightning', title: '引力弹弓狂暴', desc: '触发引力弹弓时：武器射速暴增 200%（开火间隔 ÷3）、子弹伤害 ×2、弹体半径 ×1.5、期间无敌，持续 1.5 秒。', value: '临时' });

    return { base, damage, meteorDamage, bossDamage, radius, pierce, fireInterval, magnet, details };
}

function getWingmanDamage(comboKey, turretLevel) {
    if (comboKey === 'EM+Fire') return { value: '链电 20', desc: '锁定附近流星触发链式电击，每次 20 伤害（固定伤害，不受反物质/天赋加成）。' };
    if (comboKey === 'Fire+Rad' || comboKey === 'EM+Rad') return { value: '每架 22', desc: '每架发射一枚 22 伤害侧向能量弹。' };
    if (comboKey === 'Frost+Rad' || comboKey === 'EM+Frost') return { value: '每架 15', desc: '每架发射一枚 15 伤害低温侧向弹。' };
    return { value: `每架 ${10 + turretLevel * 2}`, desc: `默认伴飞弹每架 ${10 + turretLevel * 2} 伤害。` };
}

function fmt(num) {
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function renderWeaponStatsPanel() {
    const stats = computeWeaponStats();
    const titleEl = document.getElementById('weaponStatsTitle');
    const subtitleEl = document.getElementById('weaponStatsSubtitle');
    const meteorEl = document.getElementById('weaponStatsMeteorDamage');
    const bossEl = document.getElementById('weaponStatsBossDamage');
    const fireEl = document.getElementById('weaponStatsFireRate');
    const fireHintEl = document.getElementById('weaponStatsFireRateHint');
    const projectileEl = document.getElementById('weaponStatsProjectile');
    const projectileHintEl = document.getElementById('weaponStatsProjectileHint');
    const magnetEl = document.getElementById('weaponStatsMagnet');
    const magnetHintEl = document.getElementById('weaponStatsMagnetHint');
    const detailsEl = document.getElementById('weaponStatsDetails');
    if (!detailsEl) return;

    if (titleEl) titleEl.textContent = stats.base.name;
    if (subtitleEl) subtitleEl.textContent = stats.base.shots > 1 ? `当前为 ${stats.base.shots} 发齐射，每发独立结算增益` : '当前主炮单发结算增益';
    if (meteorEl) meteorEl.textContent = stats.base.shots > 1 ? `${stats.base.shots} x ${fmt(stats.meteorDamage)}` : fmt(stats.meteorDamage);
    if (bossEl) bossEl.textContent = `Boss ${stats.base.shots > 1 ? `${stats.base.shots} x ` : ''}${fmt(stats.bossDamage)}`;
    if (fireEl) fireEl.textContent = `${stats.fireInterval}ms`;
    if (fireHintEl) fireHintEl.textContent = stats.fireInterval > 180 ? '重力巨弹降低频率' : '基础频率';
    if (projectileEl) projectileEl.textContent = `R${fmt(stats.radius)} · P${stats.pierce}`;
    if (projectileHintEl) projectileHintEl.textContent = '半径 / 穿透';
    if (magnetEl) magnetEl.textContent = `${stats.magnet}px`;
    if (magnetHintEl) magnetHintEl.textContent = '废料与经验晶体';

    detailsEl.innerHTML = stats.details.map(item => `
        <div class="weapon-detail-row">
            <i class="fa-solid ${item.icon}"></i>
            <div><strong>${item.title}</strong><span>${item.desc}</span></div>
            <em>${item.value}</em>
        </div>
    `).join('');
}

function renderCoreWeaponPopover() {
    const popover = document.getElementById('coreWeaponPopover');
    if (!popover) return;
    const stats = computeWeaponStats();
    const titleEl = document.getElementById('coreWeaponPopoverTitle');
    const bodyEl = document.getElementById('coreWeaponPopoverBody');
    const metaEl = document.getElementById('coreWeaponPopoverMeta');
    if (titleEl) titleEl.textContent = stats.base.name;
    if (bodyEl) bodyEl.textContent = stats.base.special || stats.base.desc;
    if (metaEl) {
        metaEl.textContent = `${stats.base.shots > 1 ? `${stats.base.shots} 发齐射 · ` : ''}伤害 ${fmt(stats.damage)} · 半径 R${fmt(stats.radius)} · 穿透 P${stats.pierce}`;
    }
}

function toggleCoreWeaponPopover(forceOpen) {
    const popover = document.getElementById('coreWeaponPopover');
    if (!popover) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : popover.classList.contains('hidden');
    if (shouldOpen) {
        renderCoreWeaponPopover();
        popover.classList.remove('hidden');
        popover.setAttribute('aria-hidden', 'false');
    } else {
        popover.classList.add('hidden');
        popover.setAttribute('aria-hidden', 'true');
    }
}

function openWeaponStatsPanel(source) {
    const panel = document.getElementById('weaponStatsPanel');
    if (!panel) return;
    renderWeaponStatsPanel();
    const pauseScreen = document.getElementById('pauseScreen');
    const openedFromPause = source === 'pause' || (pauseScreen && !pauseScreen.classList.contains('hidden'));
    panel.dataset.resumeOnClose = openedFromPause ? 'false' : 'true';
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    if (!openedFromPause) loadoutPause();
    if (typeof sfx !== 'undefined' && sfx.playPowerup) sfx.playPowerup();
}

function closeWeaponStatsPanel() {
    const panel = document.getElementById('weaponStatsPanel');
    if (!panel) return;
    const shouldResume = panel.dataset.resumeOnClose === 'true';
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    if (shouldResume) loadoutResume();
}

function bindWeaponStatsUI() {
    const weaponStatsBtn = document.getElementById('weaponStatsBtn');
    if (weaponStatsBtn && weaponStatsBtn.dataset.bound !== 'true') {
        weaponStatsBtn.dataset.bound = 'true';
        weaponStatsBtn.addEventListener('click', () => openWeaponStatsPanel('hud'));
    }
    const pauseWeaponStatsBtn = document.getElementById('pauseWeaponStatsBtn');
    if (pauseWeaponStatsBtn && pauseWeaponStatsBtn.dataset.bound !== 'true') {
        pauseWeaponStatsBtn.dataset.bound = 'true';
        pauseWeaponStatsBtn.addEventListener('click', () => openWeaponStatsPanel('pause'));
    }
    const weaponStatsCloseBtn = document.getElementById('weaponStatsCloseBtn');
    if (weaponStatsCloseBtn && weaponStatsCloseBtn.dataset.bound !== 'true') {
        weaponStatsCloseBtn.dataset.bound = 'true';
        weaponStatsCloseBtn.addEventListener('click', closeWeaponStatsPanel);
    }
    const coreWeaponTrigger = document.getElementById('coreWeaponTrigger');
    if (coreWeaponTrigger && coreWeaponTrigger.dataset.bound !== 'true') {
        coreWeaponTrigger.dataset.bound = 'true';
        coreWeaponTrigger.addEventListener('click', () => toggleCoreWeaponPopover());
    }
    const coreWeaponPopoverClose = document.getElementById('coreWeaponPopoverClose');
    if (coreWeaponPopoverClose && coreWeaponPopoverClose.dataset.bound !== 'true') {
        coreWeaponPopoverClose.dataset.bound = 'true';
        coreWeaponPopoverClose.addEventListener('click', () => toggleCoreWeaponPopover(false));
    }
}

bindWeaponStatsUI();

// TEST_ANCHOR: WEAPON_HELPERS_END
function renderLoadoutStrip() {
    const strip = document.getElementById('loadoutStrip');
    const iconsWrap = document.getElementById('loadoutStripIcons');
    if (!strip || !iconsWrap) return;

    const equipped = loadoutState.equipped;
    // 仅在装配集合变化时重建 DOM，避免每帧 innerHTML 刷新
    const sig = equipped.join(',');
    if (sig === _lastStripSig) return;
    _lastStripSig = sig;

    if (!equipped || equipped.length === 0) {
        strip.classList.add('hidden');
        strip.classList.remove('flex');
        return;
    }
    strip.classList.remove('hidden');
    strip.classList.add('flex');

    const colorBy = {
        cyan: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/40',
        amber: 'text-amber-300 border-amber-500/40 bg-amber-950/40',
        rose: 'text-rose-300 border-rose-500/40 bg-rose-950/40'
    };
    let html = '';
    equipped.forEach(id => {
        const mod = getRogueModDefinitions().find(m => m.id === id);
        if (!mod) return;
        const c = colorBy[loadoutThemeColor(mod)] || colorBy.cyan;
        html += `<span class="w-5 h-5 rounded-md border flex items-center justify-center text-[9px] ${c}" title="${mod.title}"><i class="fa-solid ${mod.icon}"></i></span>`;
    });
    iconsWrap.innerHTML = html;
}

function renderLoadoutPanel() {
    const list = document.getElementById('loadoutList');
    const countEl = document.getElementById('loadoutCount');
    if (!list) return;

    const equipped = loadoutState.equipped || [];
    const slots = loadoutState.slots || [];
    const hasEM = slots.includes('EM') || (loadoutState.comboKey || '').includes('EM');
    if (countEl) countEl.innerText = equipped.length;

    const colorBy = {
        cyan: { tag: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10', icon: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/40', glow: 'border-cyan-500/40' },
        amber: { tag: 'text-amber-300 border-amber-500/40 bg-amber-500/10', icon: 'text-amber-300 border-amber-500/40 bg-amber-950/40', glow: 'border-amber-500/40' },
        rose: { tag: 'text-rose-300 border-rose-500/40 bg-rose-500/10', icon: 'text-rose-300 border-rose-500/40 bg-rose-950/40', glow: 'border-rose-500/40' }
    };

    let html = '';
    getRogueModDefinitions().forEach(mod => {
        const isEquipped = equipped.includes(mod.id);
        const locked = (mod.id === 'tesla' && !hasEM && !isEquipped);
        const theme = colorBy[loadoutThemeColor(mod)] || colorBy.cyan;

        const cardCls = isEquipped
            ? `bg-gray-900/70 border ${theme.glow} shadow-lg`
            : 'bg-gray-900/30 border border-white/5 opacity-55';
        const iconCls = isEquipped ? theme.icon : 'text-gray-600 border-white/10 bg-gray-950/40';

        let statusBadge;
        if (isEquipped) {
            statusBadge = `<span class="text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest shrink-0 ${theme.tag}"><i class="fa-solid fa-check mr-0.5"></i>已装配</span>`;
        } else if (locked) {
            statusBadge = `<span class="text-[8px] font-black px-1.5 py-0.5 rounded text-amber-500/80 border border-amber-500/20 uppercase tracking-widest shrink-0"><i class="fa-solid fa-lock mr-0.5"></i>需 EM 晶核</span>`;
        } else {
            statusBadge = `<span class="text-[8px] font-black px-1.5 py-0.5 rounded text-gray-500 border border-white/10 uppercase tracking-widest shrink-0">未装配</span>`;
        }

        html += `
            <div class="flex items-start gap-3 p-3 rounded-xl ${cardCls} transition">
                <div class="w-9 h-9 rounded-lg border flex items-center justify-center text-sm shrink-0 ${iconCls}">
                    <i class="fa-solid ${mod.icon}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-black ${isEquipped ? 'text-white' : 'text-gray-400'} truncate">${mod.title}</span>
                        ${statusBadge}
                    </div>
                    <p class="text-[11px] leading-snug mt-1 ${isEquipped ? 'text-gray-300' : 'text-gray-500'}">${mod.desc}</p>
                </div>
            </div>`;
    });
    list.innerHTML = html;
}

function loadoutPause() {
    if (window.gameWorker) window.gameWorker.postMessage({ type: 'pauseGame' });
    else if (window.gameEngine) window.gameEngine.isPaused = true;
}
function loadoutResume() {
    if (window.gameWorker) window.gameWorker.postMessage({ type: 'resumeGame' });
    else if (window.gameEngine) window.gameEngine.isPaused = false;
}

function openLoadoutPanel() {
    const panel = document.getElementById('loadoutPanel');
    if (!panel) return;
    renderLoadoutPanel();
    panel.classList.remove('hidden');
    loadoutPause();
    if (typeof sfx !== 'undefined' && sfx.playPowerup) sfx.playPowerup();
}
function closeLoadoutPanel() {
    const panel = document.getElementById('loadoutPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    loadoutResume();
}

(function bindLoadoutUI() {
    const strip = document.getElementById('loadoutStrip');
    const closeBtn = document.getElementById('loadoutCloseBtn');
    if (strip) strip.addEventListener('click', openLoadoutPanel);
    if (closeBtn) closeBtn.addEventListener('click', closeLoadoutPanel);
})();
