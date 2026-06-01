// =============================================
// 星海猎手 V7: GameEngine - ENTITIES 模块
// =============================================

// 晶核槽 HUD 短标签 — Worker / 主线程共用（var 供 classic script 跨文件访问）
var ELEMENT_CHIP_LABELS = {
    'EM': 'EM',
    'Frost': 'FR',
    'Fire': 'FI',
    'Rad': 'RA'
};

function formatElementChipLabel(name) {
    if (!name) return '空';
    return ELEMENT_CHIP_LABELS[name] || name.toUpperCase();
}

// localStorage 容错读取 — Worker / 主线程共用
function safeReadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === '') return fallback;
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function safeReadInt(key, fallback) {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function safeReadString(key, fallback) {
    const raw = localStorage.getItem(key);
    return (raw !== null && raw !== '') ? raw : fallback;
}

var PERMANENT_CORES_KEY = 'space_permanent_cores';

function safeReadPermanentCores() {
    return Math.max(0, safeReadInt(PERMANENT_CORES_KEY, 0));
}

function savePermanentCores(value) {
    const safeValue = Math.max(0, Math.floor(Number(value) || 0));
    localStorage.setItem(PERMANENT_CORES_KEY, String(safeValue));
    return safeValue;
}

function addPermanentCores(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return safeReadPermanentCores();
    return savePermanentCores(safeReadPermanentCores() + add);
}

function calculatePermanentCoreReward(stats) {
    const defeated = (stats && Array.isArray(stats.bossTiersDefeated)) ? stats.bossTiersDefeated : [];
    let bossCoreReward = 0;
    for (let i = 0; i < defeated.length; i++) {
        bossCoreReward += Math.min(130, 35 + Math.max(1, defeated[i]) * 20);
    }
    const waveBonus = Math.min(20, Math.max(0, ((stats && stats.wave) || 1) - 1) * 2);
    const scrapBonus = Math.floor(Math.min(Math.max(0, (stats && stats.scrap) || 0), 150) / 25);
    return {
        bossCoreReward: bossCoreReward,
        waveBonus: waveBonus,
        scrapBonus: scrapBonus,
        total: bossCoreReward + waveBonus + scrapBonus
    };
}

// P2: 武器名称表 — 模块级常量，避免每次 HUD/pickup 重建对象字面量
// HUD 字号 9px、宽度有限，去掉装饰【】让单核/共鸣名能完整显示
const WEAPONS_NAMES = {
    'EM': '【高频快速电磁炮】',
    'Frost': '【超导绝对零度枪】',
    'Fire': '【熔核聚变爆裂弹】',
    'Rad': '【高能恒星辐射光】',
    'EM+Frost': '【冰暴超导跃迁枪】',
    'EM+Fire': '【雷霆聚变链式炮】',
    'EM+Rad': '【磁重力爆破核心】',
    'Fire+Frost': '【升华相差熔岩风暴】',
    'Frost+Rad': '【绝对静止视界】',
    'Fire+Rad': '【坍缩黑洞星云爆】'
};

// V7: Roguelike 模组定义表 — 模块级常量，engine_entities.js 与 main.js 共用
var ROGUE_MOD_DEFINITIONS = [
    { id: 'split', title: '多重散射 (Split Shot)', class: '通用', icon: 'fa-cubes', color: 'cyan', desc: '主炮额外向左右两翼扇形发射 +2 侧向子弹，但基础主炮单发伤害削减 15%。' },
    { id: 'heavy', title: '重力巨弹 (Heavy Mag)', class: '通用', icon: 'fa-compress', color: 'purple', desc: '子弹体积物理增大 40%，且穿透（Pierce）+1，但主炮开火频率降低 10%。' },
    { id: 'drone', title: '先驱无人机 (Vanguard Drone)', class: '通用', icon: 'fa-shield-halved', color: 'rose', desc: '加挂一架独立的智能索敌巡航能盾僚机，自动对附近流星释放 15 点的电浆能量打击。' },
    { id: 'tesla', title: '特斯拉雷电 (Tesla Arc)', class: '超维共鸣', icon: 'fa-bolt', color: 'amber', desc: '前置需拥有电磁 EM 晶核。所有子弹物理碰撞瞬间有 40% 概率触发 350px 链式高频雷暴。' },
    { id: 'implosion', title: '折跃重力星轨 (Warp Singularity)', class: '超维共鸣', icon: 'fa-circle-notch', color: 'cyan', desc: '战术折跃(Shift)在起点与终点残留轨迹上施加引力聚能拉扯流星。' },
    { id: 'antimatter', title: '反物质过载 (Antimatter Overload)', class: '混沌魔改', icon: 'fa-radiation', color: 'rose', desc: '主武器基础伤害疯狂暴涨 80%，但飞船最大 HP 永久缩减 30%，极限火力输出。' }
];

// V7: Fisher-Yates 洗牌工具函数 (0-GC 原地洗牌)
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

// V7: 先驱者六角星盘「永久天赋矩阵」定义 — Worker / 主线程共用 (var 供跨文件 classic script 访问)
// 局外 Meta 永久升级：用结算星核点亮，等级持久化于 localStorage('space_v7_talents')，开局自动生效。
var TALENT_DEFINITIONS = [
    { id: 'A', name: '量子超频催化', en: 'QUANTUM OVERCLOCK', icon: 'fa-gauge-high', color: 'cyan',    cost: 120, maxLevel: 3, desc: '折跃(Shift)充能速度永久 +10% / 级' },
    { id: 'B', name: '火控晶核增幅', en: 'CORE AMPLIFICATION', icon: 'fa-burst',      color: 'rose',    cost: 150, maxLevel: 3, desc: '普通陨石子弹伤害 +4% / 级；Boss 伤害 +1% / 级' },
    { id: 'C', name: '反物质纳米力场', en: 'ANTIMATTER FIELD',  icon: 'fa-shield-halved', color: 'cyan', cost: 100, maxLevel: 3, desc: '受到的一切伤害永久 -8% / 级' },
    { id: 'D', name: '磁力量子虹吸', en: 'MAGNET SIPHON',      icon: 'fa-magnet',     color: 'emerald', cost: 80,  maxLevel: 3, desc: '废料 / 经验吸附半径永久 +35px / 级' },
    { id: 'E', name: '僚机副武器齐射', en: 'WINGMAN VOLLEY',    icon: 'fa-angles-up',  color: 'rose',    cost: 180, maxLevel: 2, desc: '开火时 12% / 20% 概率追加侧翼齐射' }
];

function defaultTalents() {
    return { A: 0, B: 0, C: 0, D: 0, E: 0 };
}

// 从 localStorage 容错读取并按各天赋 maxLevel 夹取等级，返回规范化的 {A..E} 对象
function loadTalents() {
    const t = defaultTalents();
    const raw = safeReadJSON('space_v7_talents', null);
    if (raw && typeof raw === 'object') {
        for (let i = 0; i < TALENT_DEFINITIONS.length; i++) {
            const def = TALENT_DEFINITIONS[i];
            const v = raw[def.id];
            if (Number.isFinite(v)) t[def.id] = Math.max(0, Math.min(Math.floor(v), def.maxLevel));
        }
    }
    return t;
}

Object.assign(GameEngine.prototype, {
    updateWingmen(dtClamped) {
        const wingmenCount = Math.min(2, this.hangar.turretLevel);
        if (this.wingmen.length !== wingmenCount) {
            this.wingmen = [];
            for (let i = 0; i < wingmenCount; i++) {
                this.wingmen.push({
                    x: this.player.x,
                    y: this.player.y,
                    bankAngle: 0,
                    side: i === 0 ? -1 : 1,
                    lastShotTime: 0
                });
            }
        }

        const now = Date.now();
        for (let wi = 0; wi < this.wingmen.length; wi++) {
            const w = this.wingmen[wi];
            const targetX = this.player.x + w.side * 42 + Math.sin(now * 0.003) * 6;
            const targetY = this.player.y + 12 + Math.cos(now * 0.003) * 5;

            w.x += (targetX - w.x) * 0.18 * dtClamped;
            w.y += (targetY - w.y) * 0.18 * dtClamped;

            const dx = targetX - w.x;
            w.bankAngle = Math.max(-0.25, Math.min(0.25, dx * 0.015));
        }
    },

    wingmanFire(now, comboKey, slots) {
        const p = this.player;
        
        for (let wi = 0; wi < this.wingmen.length; wi++) {
            const w = this.wingmen[wi];
            if (now - w.lastShotTime >= p.fireInterval) {
                w.lastShotTime = now;

                if (comboKey === 'EM+Fire') {
                    let minDistSq = 160000;
                    if (this.currentSkin === 'thunder') {
                        minDistSq = 270400;
                    }
                    let target = null;
                    for (let i = 0; i < this.maxMeteors; i++) {
                        const m = this.meteors[i];
                        if (!m.active) continue;
                        const dx = m.x - w.x;
                        const dy = m.y - w.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < minDistSq) {
                            minDistSq = distSq;
                            target = m;
                        }
                    }

                    if (target) {
                        const chain = this.acquirePoolSlot(this.lightningChains);
                        if (chain) {
                            let curX = w.x;
                            let curY = w.y;
                            const numSegs = this.lightningChainSegs;
                            for (let j = 0; j < numSegs; j++) {
                                const ratio = (j + 1) / numSegs;
                                const nextTargetX = w.x + (target.x - w.x) * ratio;
                                const nextTargetY = w.y + (target.y - w.y) * ratio;
                                const noiseX = j === numSegs - 1 ? 0 : (Math.random() * 26 - 13);
                                const noiseY = j === numSegs - 1 ? 0 : (Math.random() * 26 - 13);
                                const seg = chain.segments[j];
                                seg.x1 = curX; seg.y1 = curY;
                                seg.x2 = nextTargetX + noiseX; seg.y2 = nextTargetY + noiseY;
                                curX = nextTargetX + noiseX;
                                curY = nextTargetY + noiseY;
                            }
                            chain.segCount = numSegs;
                            chain.alpha = 1.0;
                            chain.color = '#fbbf24';
                            chain.active = true;
                        }

                        target.hp -= 20;
                        this.createHitParticles(target.x, target.y, '#fbbf24');
                        sfx.playHit();
                        if (target.hp <= 0) {
                            this.explodeMeteor(target);
                            target.active = false;
                        }
                    }
                } 
                else if (comboKey === 'Fire+Rad' || comboKey === 'EM+Rad') {
                    this.spawnBulletInPool({
                        x: w.x,
                        y: w.y - 10,
                        vx: w.side * 2.5,
                        vy: -11,
                        radius: 5,
                        damage: 22,
                        color: comboKey === 'Fire+Rad' ? '#fbbf24' : '#a78bfa',
                        pierce: 1,
                        comboEffect: comboKey === 'Fire+Rad' ? 'Fire+Rad' : null
                    });
                }
                else if (comboKey === 'Frost+Rad' || comboKey === 'EM+Frost') {
                    this.spawnBulletInPool({
                        x: w.x,
                        y: w.y - 10,
                        vx: w.side * 2,
                        vy: -12,
                        radius: 4,
                        damage: 15,
                        color: '#60a5fa',
                        pierce: 1,
                        comboEffect: 'EM+Frost'
                    });
                }
                else {
                    this.spawnBulletInPool({
                        x: w.x,
                        y: w.y - 10,
                        vx: w.side * 1.5,
                        vy: -13,
                        radius: 3,
                        damage: 10 + this.hangar.turretLevel * 2,
                        color: '#c084fc',
                        pierce: 1
                    });
                }
            }
        }
    },

    pickupElement(elementName) {
        if (!this.player.elementSlots) this.player.elementSlots = [];

        if (this.player.elementSlots.length >= 2) {
            this.player.elementSlots.shift();
        }
        this.player.elementSlots.push(elementName);
        this._recomputeComboKey();

        sfx.playPowerup();
        this.updateElementsHUD();

        const comboKey = this.player.comboKey;
        const currentName = WEAPONS_NAMES[comboKey] || WEAPONS_NAMES[elementName] || '基础高频激光';
        this.showToast(`🧬 晶核重组完毕：当前挂载 ${currentName}！`);
    },

    // P2: comboKey 仅在 elementSlots 变化时重算，playerFire 每发开火直接读缓存
    _recomputeComboKey() {
        const slots = this.player.elementSlots || [];
        if (slots.length === 2) {
            // 仅 2 项时按字典序简单排序
            this.player.comboKey = (slots[0] < slots[1]) ? (slots[0] + '+' + slots[1]) : (slots[1] + '+' + slots[0]);
        } else if (slots.length === 1) {
            this.player.comboKey = slots[0];
        } else {
            this.player.comboKey = '';
        }
    },

    updateElementsHUD() {
        const slots = this.player.elementSlots || [];

        this.slot1UI.innerText = formatElementChipLabel(slots[0]);
        this.slot1UI.className = `px-1.5 h-6 min-w-[24px] rounded-lg border text-[10px] font-black flex items-center justify-center transition-all ` + this.getElementColorClass(slots[0]);

        this.slot2UI.innerText = formatElementChipLabel(slots[1]);
        this.slot2UI.className = `px-1.5 h-6 min-w-[24px] rounded-lg border text-[10px] font-black flex items-center justify-center transition-all ` + this.getElementColorClass(slots[1]);

        const comboKey = this.player.comboKey || '';
        const currentSynergy = WEAPONS_NAMES[comboKey] || WEAPONS_NAMES[slots[0]] || '';
        const displayName = currentSynergy || '基础高频激光';
        this.synergyNameUI.innerText = displayName;
        this.synergyNameUI.title = displayName;
        if (this.player) {
            this.player.synergyName = currentSynergy;
        }
        const hasCombo = comboKey.includes('+');
        if (hasCombo) {
            this.synergyNameUI.className = 'flex-1 min-w-0 text-[9px] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-400 to-indigo-400 animate-pulse truncate';
        } else if (slots[0]) {
            this.synergyNameUI.className = 'flex-1 min-w-0 text-[9px] font-bold text-cyan-400 truncate';
        } else {
            this.synergyNameUI.className = 'flex-1 min-w-0 text-[9px] font-bold text-gray-500 truncate';
        }
    },

    getElementColorClass(name) {
        switch(name) {
            case 'EM': return 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20 shadow-sm shadow-cyan-500/25';
            case 'Frost': return 'border-blue-500/50 text-blue-400 bg-blue-950/20 shadow-sm shadow-blue-500/25';
            case 'Fire': return 'border-rose-500/50 text-rose-400 bg-rose-950/20 shadow-sm shadow-rose-500/25';
            case 'Rad': return 'border-amber-500/50 text-amber-400 bg-amber-950/20 shadow-sm shadow-amber-500/25';
            default: return 'bg-gray-950 border-white/10 text-gray-500';
        }
    },

    playerFire() {
        const now = Date.now();
        if (now - this.player.lastShotTime >= this.player.fireInterval) {
            this.player.lastShotTime = now;
            sfx.playShoot();

            const p = this.player;
            const slots = p.elementSlots || [];
            const comboKey = p.comboKey || '';

            if (this.hangar.turretLevel > 0) {
                this.triggerAutoTurretFire();
                this.wingmanFire(now, comboKey, slots);
            }

            if (comboKey === 'EM+Frost') {
                this.spawnBulletInPool({
                    x: p.x, y: p.y - 30, vx: 0, vy: -14, radius: 8, damage: 35,
                    color: '#60a5fa', pierce: 3, comboEffect: 'EM+Frost'
                });
            } else if (comboKey === 'EM+Fire') {
                this.spawnBulletInPool({
                    x: p.x, y: p.y - 30, vx: 0, vy: -15, radius: 7, damage: 45,
                    color: '#fb7185', pierce: 1, comboEffect: 'EM+Fire'
                });
            } else if (comboKey === 'EM+Rad') {
                this.spawnBulletInPool({
                    x: p.x, y: p.y - 30, vx: 0, vy: -11, radius: 15, damage: 55,
                    color: '#a78bfa', pierce: 99, comboEffect: 'EM+Rad'
                });
            } else if (comboKey === 'Fire+Frost') {
                this.spawnBulletInPool({ x: p.x - 12, y: p.y - 30, vx: -1, vy: -13, radius: 6, damage: 30, color: '#3b82f6', pierce: 1, comboEffect: 'EM+Frost' });
                this.spawnBulletInPool({ x: p.x + 12, y: p.y - 30, vx: 1, vy: -13, radius: 6, damage: 30, color: '#f43f5e', pierce: 1, comboEffect: 'EM+Fire' });
            } else if (comboKey === 'Frost+Rad') {
                this.spawnBulletInPool({
                    x: p.x, y: p.y - 30, vx: 0, vy: -12, radius: 10, damage: 40,
                    color: '#818cf8', pierce: 2, comboEffect: 'Frost+Rad'
                });
            } else if (comboKey === 'Fire+Rad') {
                this.spawnBulletInPool({
                    x: p.x, y: p.y - 30, vx: 0, vy: -9, radius: 18, damage: 80,
                    color: '#fbbf24', pierce: 1, comboEffect: 'Fire+Rad'
                });
            } else {
                if (slots[0] === 'EM') {
                    this.spawnBulletInPool({ x: p.x, y: p.y - 30, vx: 0, vy: -18, radius: 3.5, damage: 25, color: '#22d3ee', pierce: 1 });
                } else if (slots[0] === 'Frost') {
                    this.spawnBulletInPool({ x: p.x, y: p.y - 30, vx: 0, vy: -14, radius: 5, damage: 30, color: '#3b82f6', pierce: 1, comboEffect: 'EM+Frost' });
                } else if (slots[0] === 'Fire') {
                    this.spawnBulletInPool({ x: p.x, y: p.y - 30, vx: 0, vy: -12, radius: 6, damage: 35, color: '#f43f5e', pierce: 1 });
                } else if (slots[0] === 'Rad') {
                    this.spawnBulletInPool({ x: p.x, y: p.y - 30, vx: 0, vy: -10, radius: 8, damage: 40, color: '#fbbf24', pierce: 1 });
                } else {
                    this.spawnBulletInPool({ x: p.x, y: p.y - 30, vx: 0, vy: -15, radius: 4, damage: 20, color: '#06b6d4', pierce: 1 });
                }
            }

            if (p.equippedMods && p.equippedMods.includes('split')) {
                const baseColor = comboKey ? '#c084fc' : (slots[0] === 'EM' ? '#22d3ee' : (slots[0] === 'Frost' ? '#3b82f6' : (slots[0] === 'Fire' ? '#f43f5e' : (slots[0] === 'Rad' ? '#fbbf24' : '#06b6d4'))));
                this.spawnBulletInPool({ x: p.x - 16, y: p.y - 20, vx: -2.5, vy: -12.5, radius: 4, damage: 15, color: baseColor, isSplitBullet: true });
                this.spawnBulletInPool({ x: p.x + 16, y: p.y - 20, vx: 2.5, vy: -12.5, radius: 4, damage: 15, color: baseColor, isSplitBullet: true });
            }

            // V7 永久天赋 E「僚机副武器齐射」：横向补火，不参与局内构装/弹弓伤害乘区
            const volleyChanceByLevel = [0, 0.12, 0.20];
            const eLevel = Math.min(2, (this.talents && this.talents.E) || 0);
            if (eLevel > 0 && Math.random() < volleyChanceByLevel[eLevel]) {
                this.spawnBulletInPool({ x: p.x - 22, y: p.y - 8, vx: -3, vy: -11, radius: 3.5, damage: 8, color: '#fbbf24', isSplitBullet: true, isTalentVolley: true });
                this.spawnBulletInPool({ x: p.x + 22, y: p.y - 8, vx: 3, vy: -11, radius: 3.5, damage: 8, color: '#fbbf24', isSplitBullet: true, isTalentVolley: true });
            }
        }
    },

    triggerAutoTurretFire() {
        let target = null;
        let minDistSq = 202500;
        
        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active) continue;
            const dx = m.x - this.player.x;
            const dy = m.y - this.player.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                target = m;
            }
        }

        if (target) {
            const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
            const speed = 11;
            const dmg = 8 + this.hangar.turretLevel * 4;

            this.spawnBulletInPool({
                x: this.player.x - 30,
                y: this.player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 3,
                damage: dmg,
                color: '#a78bfa',
                pierce: 1
            });
            this.spawnBulletInPool({
                x: this.player.x + 30,
                y: this.player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 3,
                damage: dmg,
                color: '#a78bfa',
                pierce: 1
            });
        }
    },

    handleEnemySpawning(deltaTime) {
        this.spawnTimer += deltaTime;
        this.blackHoleSpawnTimer += deltaTime;

        if (this.blackHoleSpawnTimer > 18000 && !this.blackHole && !this.boss) {
            this.blackHoleSpawnTimer = 0;
            this.spawnBlackHole();
        }

        if (this.bossSpawnCooldown <= 0 && this.score >= this.nextBossThreshold && !this.boss) {
            this.spawnBoss();
        }

        // 机舱节奏：阶梯阈值（1500 × 1.4^(w-1) 段差）+ 最小 45s 间隔
        const threshold = this.waveScoreThresholds[this.wave] || Infinity;
        if (!this.boss && this.score >= threshold) {
            this.wave++;
            this.addFloatText(this.logicalWidth / 2, this.logicalHeight / 2 - 50, `WAVE ${this.wave} COMPLETED!`, '#10b981', 22);
            sfx.playPowerup();
            const now = performance.now();
            if (now - this.lastHangarTime >= this.hangarMinInterval) {
                this.lastHangarTime = now;
                this.openHangar();
            }
        }

        // 母舰/titan 通过 bossShoot 持续喷流星弹幕，所以停掉普通生成；
        // 但吞噬蠕虫没有发射逻辑，靠"吞噬流星回血"作为主玩法，必须保留流星生成给它当口粮
        const bossActive = this.boss && this.boss.active;
        if (bossActive && this.boss.type !== 'worm') return;

        // worm 战流星会被持续吃掉，节奏比常规快 1.4×；其他情况按 wave 递进
        const baseRate = Math.max(400, 1500 - (this.wave * 120));
        const spawnRate = (bossActive && this.boss.type === 'worm') ? Math.floor(baseRate / 1.4) : baseRate;
        if (this.spawnTimer >= spawnRate) {
            this.spawnTimer = 0;
            this.spawnMeteor();
        }
    },

    spawnMeteor(xOverride = null, yOverride = null, sizeOverride = null, vxOverride = null) {
        const size = sizeOverride || (Math.random() * 50 + 20);
        const x = xOverride !== null ? xOverride : (Math.random() * (this.logicalWidth - size * 2) + size);
        const y = yOverride !== null ? yOverride : -size;
        
        let type = 'standard';
        let speedMultiplier = 1 + (this.wave * 0.1);
        let vy = (Math.random() * 2 + 1.5) * speedMultiplier;
        let vx = vxOverride !== null ? vxOverride : (Math.random() * 1.6 - 0.8);

        if (size > 60 && xOverride === null) {
            type = 'splitter';
        } else if (size < 25) {
            type = 'fast';
            vy *= 1.6;
        }

        let maxHp = 10;
        if (size < 25) {
            maxHp = Math.ceil(size * 0.4);
        } else if (size <= 45) {
            maxHp = Math.ceil(size * 0.65);
        } else if (size <= 60) {
            maxHp = Math.ceil(size * 0.85);
        } else {
            maxHp = Math.ceil(size * 1.1);
        }

        // Endless mode non-linear scaling
        if (this.endlessMode) {
            const waveFactor = this.wave - 1;
            const hpScale = Math.pow(1 + 0.42 * waveFactor, 1.15);
            const speedScale = Math.pow(1 + 0.12 * waveFactor, 0.85);
            maxHp = Math.ceil(maxHp * hpScale);
            vy *= speedScale;
        }

        // Phase Shield spawning probability (15% chance in endless mode for non-tiny meteors)
        let shieldCount = 0;
        if (this.endlessMode && Math.random() < 0.15 && size > 30 && xOverride === null) {
            type = 'phase_shield';
            shieldCount = 3;
        }

        const numPoints = Math.floor(Math.random() * 4) + 8;
        const offsets = this.scratchMeteorOffsets;
        for (let i = 0; i < numPoints; i++) {
            offsets[i] = 0.75 + Math.random() * 0.45;
        }

        this.spawnMeteorInPool({
            x: x,
            y: y,
            size: size,
            radius: size / 2,
            vx: vx,
            vy: vy,
            hp: maxHp,
            maxHp: maxHp,
            type: type,
            angle: Math.random() * Math.PI,
            spinSpeed: (Math.random() * 0.04 - 0.02),
            offsets: offsets,
            numPoints: numPoints,
            shieldCount: shieldCount,
            color: this.getMeteorColor(type)
        });
    },

    getMeteorColor(type) {
        switch(type) {
            case 'splitter': return '#d946ef';
            case 'fast': return '#fb923c';
            case 'phase_shield': return '#06b6d4';
            default: return '#94a3b8';
        }
    },

    spawnPowerup(x, y) {
        const r = Math.random();
        let chosenType = 'score';
        
        if (r < 0.15) chosenType = 'EM';
        else if (r < 0.3) chosenType = 'Frost';
        else if (r < 0.45) chosenType = 'Fire';
        else if (r < 0.6) chosenType = 'Rad';
        else if (r < 0.75) chosenType = 'shield';
        else if (r < 0.9) chosenType = 'heal';

        const p = this.acquirePoolSlot(this.powerups);
        if (!p) return;
        p.x = x; p.y = y;
        p.type = chosenType;
        p.vy = 2.5;
        p.pulse = 0;
        p.active = true;
    },

    pickupPowerup(type, item = null) {
        sfx.playPowerup();

        if (['EM', 'Frost', 'Fire', 'Rad'].includes(type)) {
            this.pickupElement(type);
            return;
        }

        if (type !== 'exp') {
            this.addFloatText(this.player.x, this.player.y - 40, `${type.toUpperCase()}!`, '#4ade80', 20);
        }
        switch(type) {
            case 'heal':
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
                this.showToast("生命系统已紧急修复 +40%");
                break;
            case 'shield':
                this.shieldTime = 8000;
                this.showToast("防护力场启动 8秒无敌");
                break;
            case 'score':
                this.score += 500;
                this.showToast("获取星空失落密匙 +500分");
                break;
            case 'exp':
                // 经验值由水晶携带（随陨石体积缩放），无值时给保底 5
                this.gainExp(item && item.expValue ? item.expValue : 5);
                break;
        }
    },

    explodeMeteor(m) {
        this.createExplosionParticles(m.x, m.y, m.size, m.color);
        sfx.playExplosion(m.size > 50);

        let scoreGain = Math.floor(m.size);
        let textColor = '#fcd34d';
        let fontSize = 14;

        if (m.type === 'splitter') {
            scoreGain = Math.floor(m.size * 3.5);
            textColor = '#ec4899';
            fontSize = 24;
        } else if (m.type === 'fast') {
            scoreGain = Math.floor(m.size * 2.5);
            textColor = '#38bdf8';
            fontSize = 18;
        }

        this.score += scoreGain;
        this.bombCharge = Math.min(100, this.bombCharge + m.size * 0.08); // 满电 ~30 颗陨石，让 EOM 更稀缺
        this.addFloatText(m.x, m.y, `+${scoreGain}`, textColor, fontSize);

        const scrapDropCount = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < scrapDropCount; i++) {
            const p = this.acquirePoolSlot(this.powerups);
            if (!p) break;
            p.x = m.x + (Math.random() * 30 - 15);
            p.y = m.y + (Math.random() * 30 - 15);
            p.type = 'scrap';
            p.vy = 2.2 + Math.random() * 0.8;
            p.pulse = 0;
            p.active = true;
        }

        // V7: 掉落经验微粒 (EXP Crystals)
        // 仅中大型陨石掉落，且只掉 1 颗；价值随体积缩放，避免小陨石刷级过快
        if (m.size >= 30) {
            const p = this.acquirePoolSlot(this.powerups);
            if (p) {
                p.x = m.x + (Math.random() * 30 - 15);
                p.y = m.y + (Math.random() * 30 - 15);
                p.type = 'exp';
                p.vy = 1.8 + Math.random() * 0.8;
                p.pulse = 0;
                // size30→5  size50→8  size70→11
                p.expValue = Math.max(4, Math.round(m.size * 0.16));
                p.active = true;
            }
        }

        if (Math.random() < 0.12) {
            this.spawnPowerup(m.x, m.y);
        }

        if (m.type === 'splitter' && m.size > 40) {
            const splitSize = m.size * 0.55;
            this.spawnMeteor(m.x - 20, m.y, splitSize, -1.8);
            this.spawnMeteor(m.x + 20, m.y, splitSize, 1.8);
        }
    },

    triggerEomBomb() {
        if (!this.isRunning || this.isPaused || this.bombCharge < 100) return;
        
        sfx.playBomb();
        this.createScreenShake(25);
        this.bombCharge = 0;
        this.createExplosionParticles(this.logicalWidth / 2, this.logicalHeight / 2, 400, '#fbbf24');
        
        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (m.active) {
                this.explodeMeteor(m);
                m.active = false;
            }
        }

        if (this.boss && this.boss.active) {
            const parts = this.boss.parts;
            for (const key in parts) {
                if (parts[key].active) {
                    parts[key].hp -= 120;
                    const pX = parts[key].x !== undefined ? parts[key].x : this.boss.x + parts[key].offset.x;
                    const pY = parts[key].y !== undefined ? parts[key].y : this.boss.y + parts[key].offset.y;
                    if (parts[key].hp <= 0) {
                        parts[key].active = false;
                        this.createExplosionParticles(pX, pY, 80, '#fbbf24');
                        this.addFloatText(pX, pY, `💥 ${parts[key].label} 歼灭!`, '#fbbf24', 14);
                        if (key === 'core') this.destroyBossEpic();
                    }
                }
            }
        }
        this.showToast("EM电浆风暴清剿全场！");
    },

    createHitParticles(x, y, color) {
        const densityReduce = this.activeParticleCount > 150 ? 0.4 : 1.0;
        const count = Math.floor(8 * densityReduce);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = Math.random() * 2 + 1;
            const decay = Math.random() * 0.05 + 0.03;
            this.spawnParticle(x, y, vx, vy, size, color, decay);
        }
    },

    createExplosionParticles(x, y, size, color) {
        const densityReduce = this.activeParticleCount > 150 ? 0.3 : 1.0;
        const count = Math.min(60, Math.floor(size * 1.2 * densityReduce));
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * (size * 0.12) + 1;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const particleSize = Math.random() * (size * 0.15) + 1.5;
            const decay = Math.random() * 0.03 + 0.015;
            this.spawnParticle(x, y, vx, vy, particleSize, color, decay);
        }
    },

    addFloatText(x, y, text, color, fontSize) {
        const ft = this.acquirePoolSlot(this.floatTexts);
        if (!ft) return;
        ft.x = x; ft.y = y;
        ft.text = text;
        ft.color = color;
        ft.size = fontSize;
        ft.alpha = 1;
        ft.active = true;
    },

    getPowerupColor(type) {
        switch(type) {
            case 'EM': return '#06b6d4';
            case 'Frost': return '#3b82f6';
            case 'Fire': return '#f43f5e';
            case 'Rad': return '#fbbf24';
            case 'shield': return '#06b6d4';
            case 'heal': return '#10b981';
            case 'exp': return '#22d3ee';
            default: return '#fbbf24';
        }
    },

    getPowerupChar(type) {
        switch(type) {
            case 'EM': return 'EM';
            case 'Frost': return 'FR';
            case 'Fire': return 'FI';
            case 'Rad': return 'RA';
            case 'shield': return '🛡️';
            case 'heal': return '❤️';
            case 'exp': return '⚡';
            default: return '⚙️';
        }
    },

    gainExp(amount) {
        if (!this.player || !this.isRunning || this.isPaused) return;
        this.player.exp += amount;
        this.addFloatText(this.player.x + (Math.random() * 40 - 20), this.player.y - 20, `+${amount} XP`, '#22d3ee', 12);
        
        if (this.player.exp >= this.player.nextLevelExp) {
            this.player.exp -= this.player.nextLevelExp;
            this.player.level++;
            // 平滑递增：确保正常一整局有机会装满 4-6 个构装，而后期仍保留成长压力
            this.player.nextLevelExp = Math.floor(120 * Math.pow(1.3, this.player.level - 1));
            this.triggerLevelUp();
        }
        this.updateHUD();
    },

    // 返回当前可供 3 选 1 的模组（满足前置条件且未装配），供升级弹窗与"无可选"兜底共用
    getAvailableMods() {
        const equipped = (this.player && this.player.equippedMods) || [];
        const slots = (this.player && this.player.elementSlots) || [];
        const hasEM = slots.includes('EM') || (this.player && this.player.comboKey && this.player.comboKey.includes('EM'));
        return ROGUE_MOD_DEFINITIONS.filter(mod => {
            if (mod.id === 'tesla' && !hasEM) return false;
            if (equipped.includes(mod.id)) return false;
            return true;
        });
    },

    // 所有超维模组已装配（或暂无满足前置条件的模组）时的替代奖励，避免弹出空白卡牌卡死
    grantLevelUpFallback() {
        sfx.playPowerup();
        let heal = 0;
        if (this.player) {
            heal = Math.ceil(this.player.maxHp * 0.25);
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
            this.addFloatText(this.player.x, this.player.y - 45, `LV.${this.player.level} · 满构装 +${heal}HP`, '#22d3ee', 16);
        }
        this.score += 800;
        this.showToast(`🧬 超维模组已全数装配！本次升级转化为 +${heal} HP 与 +800 分奖励`);
        this.updateHUD();
    },

    triggerLevelUp() {
        // 无可选模组时不弹卡，直接发放替代奖励并继续战斗（修复"全选完后空白无法返回"软锁）
        if (this.getAvailableMods().length === 0) {
            this.grantLevelUpFallback();
            return;
        }

        this.isPaused = true;
        sfx.playPowerup();
        this.createScreenShake(12);

        if (!this.isWorkerContext && this.rogueUpgradeScreen && this.rogueCardsContainer && this.rogueLevelVal) {
            this.rogueLevelVal.innerText = this.player.level;
            this.rogueUpgradeScreen.classList.remove('hidden');
            this.renderRogueUpgradeCards();
        } else {
            // Worker 模式：DOM 不可用（document mock 无 createElement），交由主线程渲染 3 选 1 卡牌
            if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
                self.postMessage({ 
                    type: 'levelUpTrigger', 
                    level: this.player.level,
                    elementSlots: this.player.elementSlots || [],
                    comboKey: this.player.comboKey || '',
                    equippedMods: this.player.equippedMods || []
                });
            }
        }
    },

    renderRogueUpgradeCards() {
        this.rogueCardsContainer.innerHTML = '';
        
        const equipped = this.player.equippedMods || [];
        const slots = this.player.elementSlots || [];
        const hasEM = slots.includes('EM') || (this.player.comboKey && this.player.comboKey.includes('EM'));

        // 过滤：前置条件 + 去重已装备模组
        const availablePool = ROGUE_MOD_DEFINITIONS.filter(mod => {
            if (mod.id === 'tesla' && !hasEM) return false;
            if (equipped.includes(mod.id)) return false; // 去重
            return true;
        });

        // Fisher-Yates 洗牌 + 取前 3 张
        const shuffled = shuffleArray([...availablePool]);
        const selected = shuffled.slice(0, 3);

        // 兜底防软锁：无可选模组时关闭弹窗并恢复战斗（triggerLevelUp 通常已拦截，此处双保险）
        if (selected.length === 0) {
            this.rogueUpgradeScreen.classList.add('hidden');
            this.isPaused = false;
            return;
        }

        selected.forEach(mod => {
            const card = document.createElement('div');
            const themeClass = mod.class === '超维共鸣' ? 'rogue-amber' : (mod.class === '混沌魔改' ? 'rogue-rose' : 'rogue-cyan');
            card.className = `rogue-card ${themeClass}`;

            card.innerHTML = `
                <div class="rogue-scan"></div>
                <div class="rogue-icon"><i class="fa-solid ${mod.icon}"></i></div>
                <div class="rogue-body pointer-events-none">
                    <div class="flex items-center justify-between">
                        <span class="rogue-name">${mod.title}</span>
                        <span class="rogue-class-tag">${mod.class}</span>
                    </div>
                    <p class="rogue-desc mt-1">${mod.desc}</p>
                </div>
                <div class="rogue-action-hint pointer-events-none">
                    <i class="fa-solid fa-circle-chevron-right animate-pulse"></i>
                </div>
            `;
            
            card.addEventListener('click', () => {
                this.applyModCard(mod.id);
                this.rogueUpgradeScreen.classList.add('hidden');
                this.isPaused = false;
                sfx.playPowerup();
                this.updateHUD();
            });
            this.rogueCardsContainer.appendChild(card);
        });
    },

    applyModCard(modId) {
        if (!this.player.equippedMods) this.player.equippedMods = [];
        this.player.equippedMods.push(modId);

        const names = {
            'split': '多重散射弹幕',
            'heavy': '重力穿透巨弹',
            'drone': '先驱切割僚机',
            'tesla': '特斯拉链式雷暴',
            'implosion': '时空引力星轨',
            'antimatter': '反物质火力过载'
        };

        this.addFloatText(this.player.x, this.player.y - 50, `+${names[modId] || modId}`, '#22d3ee', 16);
        this.showToast(`🧬 成功装配超维模组：${names[modId] || modId}！`);

        // 应用特定属性调节
        if (modId === 'heavy') {
            this.player.fireInterval = Math.floor(this.player.fireInterval * 1.12);
        } else if (modId === 'drone') {
            this.hangar.turretLevel++;
            this.updateWingmen(1.0);
        } else if (modId === 'antimatter') {
            this.player.maxHp = Math.floor(this.player.maxHp * 0.7);
            if (this.player.hp > this.player.maxHp) {
                this.player.hp = this.player.maxHp;
            }
        }
    }

});
