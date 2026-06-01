// ⚡ 《星海猎手 V7：机载超维构装与深空天象》Web Worker 子线程引擎核心
// 声明顶层代理与全局 Mock 防线，使得包含 DOM/Audio 依赖的 JS 文件能在 DOM-less Web Worker 中直接执行
self.document = {
    getElementById: (id) => {
        // 返回一个符合 DOM 节点要求的代理对象，防止调用任何方法或属性时抛出 ReferenceError/TypeError
        return {
            addEventListener: () => {},
            removeEventListener: () => {},
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false
            },
            style: {},
            querySelector: () => null,
            querySelectorAll: () => [],
            innerText: '',
            innerHTML: '',
            className: '',
            getContext: () => ({})
        };
    },
    addEventListener: () => {},
    removeEventListener: () => {}
};

self.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: self.setTimeout.bind(self),
    clearTimeout: self.clearTimeout.bind(self),
    setInterval: self.setInterval.bind(self),
    clearInterval: self.clearInterval.bind(self),
    performance: self.performance,
    localStorage: {
        getItem: (key) => {
            if (key === 'space_unlocked_skins') return JSON.stringify(self.unlockedSkins || ["default"]);
            if (key === 'space_current_skin') return self.currentSkin || 'default';
            if (key === 'space_best_score') return String(self.bestScore || 0);
            if (key === 'space_v7_talents') return JSON.stringify(self.talents || { A: 0, B: 0, C: 0, D: 0, E: 0 });
            if (key === 'space_permanent_cores') return String(self.permanentCores || 0);
            return null;
        },
        setItem: (key, val) => {
            if (key === 'space_best_score') {
                self.bestScore = parseInt(val);
                postMessage({ type: 'saveLocalStorage', key, val });
            }
            if (key === 'space_current_skin') {
                self.currentSkin = val;
                postMessage({ type: 'saveLocalStorage', key, val });
            }
            if (key === 'space_unlocked_skins') {
                self.unlockedSkins = JSON.parse(val);
                postMessage({ type: 'saveLocalStorage', key, val });
            }
            if (key === 'space_v7_talents') {
                try { self.talents = JSON.parse(val); } catch (e) {}
                postMessage({ type: 'saveLocalStorage', key, val });
            }
            if (key === 'space_permanent_cores') {
                self.permanentCores = Math.max(0, parseInt(val, 10) || 0);
                postMessage({ type: 'saveLocalStorage', key, val: String(self.permanentCores) });
            }
        }
    }
};

// 使得全局 localStorage 指向 mock
self.localStorage = self.window.localStorage;

// 极客级无感声效 Proxy 代理 — 同帧 sfx 调用聚合为一个 postMessage，避免每发子弹/命中独立跨线程消息
const sfxQueue = [];
self.flushSfxQueue = function() {
    if (sfxQueue.length === 0) return;
    postMessage({ type: 'soundBatch', calls: sfxQueue.slice() });
    sfxQueue.length = 0;
};
const sfxProxy = new Proxy({}, {
    get: function(target, prop) {
        return function(...args) {
            sfxQueue.push({ method: prop, args: args });
        };
    }
});
self.sfx = sfxProxy;

// 导入星海猎手所有核心引擎文件 (不加载 sound.js，直接使用上面的 Proxy 代理，规避 AudioContext 报错)
// 继承 main.js 注入到 Worker URL 的 ?v=ASSET_VERSION，保证引擎文件与主线程一起失效旧缓存
const __ENGINE_VER = self.location.search || '';
importScripts(
    'engine_base.js' + __ENGINE_VER,
    'engine_physics.js' + __ENGINE_VER,
    'engine_entities.js' + __ENGINE_VER,
    'engine_boss.js' + __ENGINE_VER,
    'engine_renderer.js' + __ENGINE_VER,
    'engine_hangar.js' + __ENGINE_VER
);

// 继承 GameEngine 类并重写 DOM 依赖的方法
class GameEngineWorker extends GameEngine {
    constructor() {
        super();
        this.rafId = null;
        this.lastTime = 0;
    }

    // 重写 DOM 绑定，在 Worker 环境下 mock 所有 DOM 引用，防止继承方法调用 classList/style 时抛出 TypeError
    bindUIElements() {
        const createMockElement = () => ({
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false
            },
            style: {},
            addEventListener: () => {},
            removeEventListener: () => {},
            innerText: '',
            innerHTML: '',
            className: '',
            querySelector: () => null,
            querySelectorAll: () => [],
            getContext: () => ({})
        });

        this.startScreen = createMockElement();
        this.pauseScreen = createMockElement();
        this.gameOverScreen = createMockElement();
        this.workshopScreen = createMockElement();
        this.mobileControls = createMockElement();
        this.hud = createMockElement();
        
        this.scoreText = createMockElement();
        this.scrapText = createMockElement();
        this.bestScoreText = createMockElement();
        this.waveText = createMockElement();
        this.hpBar = createMockElement();
        this.shieldBar = createMockElement();
        this.bombChargeBar = createMockElement();
        
        this.slot1UI = createMockElement();
        this.slot2UI = createMockElement();
        this.synergyNameUI = createMockElement();
    }

    // 重写控制器设置，Worker 端的输入完全依赖主线程 postMessage 转发，避免调用 OffscreenCanvas.addEventListener 报错
    setupControls() {
        // 空操作
    }

    // 重写 Canvas 调整大小，由主线程 resize 通知
    resizeCanvas() {
        // 空操作
    }

    // 重写 HUD 更新，向主线程同步完整的 HUD 状态
    // P1: dirty-tracking — 仅在标量字段变化时 postMessage，避免每帧无谓跨线程克隆
    _hudIsDirty(payload) {
        const last = this._lastHud;
        if (!last) return true;
        // 标量字段逐个比对
        if (last.score !== payload.score) return true;
        if (last.scrap !== payload.scrap) return true;
        if (last.wave !== payload.wave) return true;
        if (last.playerHp !== payload.playerHp) return true;
        if (last.playerMaxHp !== payload.playerMaxHp) return true;
        // shieldTime/bombCharge 量化到 100ms / 1% — 避免每帧浮点抖动触发消息
        if ((last.shieldTime / 100 | 0) !== (payload.shieldTime / 100 | 0)) return true;
        if ((last.bombCharge | 0) !== (payload.bombCharge | 0)) return true;
        if ((last.warpCharge | 0) !== (payload.warpCharge | 0)) return true;
        if (last.slot1 !== payload.slot1) return true;
        if (last.slot2 !== payload.slot2) return true;
        if (last.synergyName !== payload.synergyName) return true;
        if (last.synergyActive !== payload.synergyActive) return true;
        if (last.bossActive !== payload.bossActive) return true;
        if (last.bossHp !== payload.bossHp) return true;
        if (last.bossMaxHp !== payload.bossMaxHp) return true;
        if (last.bossType !== payload.bossType) return true;
        if (last.bossTitle !== payload.bossTitle) return true;
        if (last.bossTier !== payload.bossTier) return true;
        if (last.level !== payload.level) return true;
        // 经验条量化到 1% — 避免每点 XP 浮动都触发跨线程消息
        const lastExpPct = last.nextLevelExp > 0 ? (last.exp / last.nextLevelExp * 100 | 0) : 0;
        const newExpPct = payload.nextLevelExp > 0 ? (payload.exp / payload.nextLevelExp * 100 | 0) : 0;
        if (lastExpPct !== newExpPct) return true;
        // 已装配构装数量变化（升级选模组后）需要刷新构装面板
        const lastMods = last.equippedMods ? last.equippedMods.length : 0;
        const newMods = payload.equippedMods ? payload.equippedMods.length : 0;
        if (lastMods !== newMods) return true;
        // bossParts 浅比对（结构稳定时 4 个数字字段）
        const lp = last.bossParts, np = payload.bossParts;
        if ((lp === null) !== (np === null)) return true;
        if (lp && np) {
            if (lp.shield !== np.shield || lp.left !== np.left || lp.right !== np.right) return true;
            if (lp.shieldSlot !== np.shieldSlot) return true;
        }
        return false;
    }

    updateHUD() {
        let bossHp = 0;
        let bossMaxHp = 0;
        let bossParts = null;
        let bossType = null;
        let bossTitle = null;
        if (this.boss && this.boss.active) {
            bossType = this.boss.type;
            const tier = this.boss.encounterTier || 1;
            const tierLabel = tier > 1 ? ` · 第${tier}阶` : '';
            if (this.boss.type === 'worm') {
                let totalHp = 0;
                let totalMaxHp = 0;
                for (const key in this.boss.parts) {
                    const part = this.boss.parts[key];
                    if (part.active) {
                        totalHp += part.hp;
                    }
                    totalMaxHp += part.maxHp;
                }
                bossHp = totalHp;
                bossMaxHp = totalMaxHp;
                bossTitle = `💀 吞噬蠕虫${tierLabel} (${this.boss.wormSegmentCount || 10}节)`;
            } else if (this.boss.parts && this.boss.parts.core) {
                bossHp = this.boss.parts.core.hp;
                bossMaxHp = this.boss.parts.core.maxHp;
                const shield = this.boss.parts.shieldCore;
                const left = this.boss.parts.leftWing;
                const right = this.boss.parts.rightWing;
                const rear = this.boss.parts.rearBattery;
                // 槽位策略与主线程一致：盾在用 shield 槽；盾破后 rear 顶替 shield 槽，左右翼独立
                let shieldRatio = 0;
                let shieldLabel = null;
                if (shield && shield.active) {
                    shieldRatio = shield.hp / shield.maxHp;
                } else if (rear && rear.active) {
                    shieldRatio = rear.hp / rear.maxHp;
                    shieldLabel = 'rear';
                }
                bossParts = {
                    shield: shieldRatio,
                    shieldSlot: shieldLabel, // 'rear' 表示该槽现在显示尾炮
                    left: (left && left.active) ? left.hp / left.maxHp : 0,
                    right: (right && right.active) ? right.hp / right.maxHp : 0
                };
                if (this.boss.state === 'titan') {
                    bossTitle = `💀 星云巨神兵${tierLabel}`;
                } else {
                    bossTitle = `⚠️ 星际掠夺者号${tierLabel}`;
                }
            }
        }

        const slots = this.player && this.player.elementSlots ? this.player.elementSlots : [];
        const comboKey = this.player ? (this.player.comboKey || '') : '';
        const synergyActive = comboKey.includes('+');

        const payload = {
            type: 'hud',
            score: this.score,
            scrap: this.scrap,
            wave: this.wave,
            bestScore: this.bestScore,
            playerHp: this.player ? this.player.hp : 0,
            playerMaxHp: this.player ? this.player.maxHp : 0,
            shieldTime: this.shieldTime,
            bombCharge: this.bombCharge,
            warpCharge: this.warpCharge,
            slot1: slots[0] || null,
            slot2: slots[1] || null,
            synergyName: this.player ? this.player.synergyName : '',
            synergyActive: synergyActive,
            bossActive: !!(this.boss && this.boss.active),
            bossHp: bossHp,
            bossMaxHp: bossMaxHp,
            bossParts: bossParts,
            bossType: bossType,
            bossTitle: bossTitle,
            bossTier: this.bossTier,
            level: this.player ? (this.player.level || 1) : 1,
            exp: this.player ? (this.player.exp || 0) : 0,
            nextLevelExp: this.player ? (this.player.nextLevelExp || 120) : 120,
            // V7: 已装配的机载量子构装 + 当前晶核组合，供主线程渲染构装总览面板
            equippedMods: this.player && this.player.equippedMods ? this.player.equippedMods.slice() : [],
            comboKey: comboKey
        };
        if (this._hudIsDirty(payload)) {
            postMessage(payload);
            this._lastHud = payload;
        }
    }

    // 重写 Toast 显示，交由主线程 DOM 渲染
    showToast(text) {
        postMessage({ type: 'toast', text: text });
    }

    // 重写游戏结束
    triggerGameOver() {
        if (this.gameOverCoreSettled) return;
        this.gameOverCoreSettled = true;
        this.isRunning = false;
        const coreReward = calculatePermanentCoreReward({
            wave: this.wave,
            scrap: this.scrap,
            bossTiersDefeated: this.bossTiersDefeatedThisRun || []
        });
        // 计算最佳分数
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('space_best_score', this.bestScore);
        }
        
        postMessage({
            type: 'gameOver',
            score: this.score,
            wave: this.wave,
            bestScore: this.bestScore,
            permanentCoresEarned: this.isBenchmarking ? 0 : coreReward.total
        });
    }

    // 重写改装车间开启
    openHangar() {
        this.isPaused = true;
        postMessage({
            type: 'openHangar',
            scrap: this.scrap,
            hangar: this.hangar,
            unlockedSkins: this.unlockedSkins,
            currentSkin: this.currentSkin
        });
    }

    // 重写结束跑分
    endBenchmark() {
        this.isBenchmarking = false;
        this.isRunning = false;
        const avgFps = this.benchFrames > 0 ? (this.benchFpsTotal / this.benchFrames) : 60;
        const avgPhys = this.benchFrames > 0 ? (this.benchPhysDelayTotal / this.benchFrames) : 0.15;
        const avgDraw = this.benchFrames > 0 ? (this.benchDrawDelayTotal / this.benchFrames) : 0.20;

        let finalScore = Math.floor(avgFps * 100 - (avgPhys + avgDraw) * 400);
        if (finalScore < 1000) finalScore = 1000;

        let rank = "Superb";
        if (avgFps >= 110) rank = "⚡ Godlike";
        else if (avgFps >= 85) rank = "🚀 Ultra";
        else if (avgFps >= 55) rank = "💎 Premium";
        else rank = "⚠️ Standard";

        const metrics = {
            finalScore,
            rank,
            avgFps,
            avgPhys,
            avgDraw
        };
        postMessage({ type: 'endBenchmark', metrics });
    }

    // 自定义方法：开始循环
    startLoop() {
        this.lastTime = performance.now();
        const requestAnimationFrameMock = self.requestAnimationFrame ? self.requestAnimationFrame.bind(self) : (cb => setTimeout(() => cb(performance.now()), 1000 / 60));
        
        const loop = (currentTime) => {
            if (!this.isRunning || this.isPaused) return;
            this.rafId = requestAnimationFrameMock(loop);
            
            const deltaTime = currentTime - this.lastTime;
            this.lastTime = currentTime;
            
            // 物理更新
            this.update(deltaTime);

            // 渲染管线结算
            const drawStart = performance.now();
            this.draw();
            this.drawDelay = performance.now() - drawStart;

            // P1: 帧末统一刷出 sfx 队列，避免一帧内多次跨线程 postMessage
            self.flushSfxQueue();
        };
        
        if (this.rafId) {
            const cancelAnimationFrameMock = self.cancelAnimationFrame ? self.cancelAnimationFrame.bind(self) : (id => clearTimeout(id));
            cancelAnimationFrameMock(this.rafId);
        }
        this.rafId = requestAnimationFrameMock(loop);
    }

    stopLoop() {
        if (this.rafId) {
            const cancelAnimationFrameMock = self.cancelAnimationFrame ? self.cancelAnimationFrame.bind(self) : (id => clearTimeout(id));
            cancelAnimationFrameMock(this.rafId);
            this.rafId = null;
        }
    }

    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
        postMessage({
            type: 'togglePause',
            isPaused: this.isPaused
        });
        if (!this.isPaused) {
            this.startLoop();
        }
    }

    resumeGame() {
        this.isPaused = false;
        postMessage({
            type: 'togglePause',
            isPaused: false
        });
        this.startLoop();
    }
}

// 消息中心监听逻辑
let engineInstance = null;

self.onmessage = function(e) {
    const data = e.data;
    switch (data.type) {
        case 'init':
            // 接收 OffscreenCanvas 以及本地持久化数据
            self.unlockedSkins = data.unlockedSkins || ["default"];
            self.currentSkin = data.currentSkin || 'default';
            self.bestScore = data.bestScore || 0;
            self.talents = data.talents || { A: 0, B: 0, C: 0, D: 0, E: 0 };
            self.permanentCores = data.permanentCores || 0;
            
            engineInstance = new GameEngineWorker();
            
            // 覆盖 canvas 和 ctx 引用
            engineInstance.canvas = data.canvas;
            engineInstance.ctx = data.canvas.getContext('2d');

            // P0: 真实 ctx 就绪后才创建渐变 (constructor 期间是 mock 空 ctx)
            engineInstance.initGradients();

            // 物理/渲染尺寸设置
            engineInstance.canvas.width = data.width;
            engineInstance.canvas.height = data.height;
            engineInstance.scaleX = data.width / engineInstance.logicalWidth;
            engineInstance.scaleY = data.height / engineInstance.logicalHeight;

            // 初始化背景恒星
            engineInstance.initStars();
            
            postMessage({ type: 'ready' });
            break;
            
        case 'resize':
            if (engineInstance) {
                engineInstance.canvas.width = data.width;
                engineInstance.canvas.height = data.height;
                engineInstance.scaleX = data.width / engineInstance.logicalWidth;
                engineInstance.scaleY = data.height / engineInstance.logicalHeight;
            }
            break;
            
        case 'controlMode':
            if (engineInstance) {
                engineInstance.controlMode = data.mode;
            }
            break;

        case 'campaignMode':
            if (engineInstance) {
                engineInstance.endlessMode = !!data.isEndless;
            }
            break;

        case 'hudClearance':
            // 主线程实测的 HUD 占位（逻辑 y 坐标下沿）— boss 出生时用作避让基线
            if (engineInstance) {
                engineInstance.hudClearance = data.y;
            }
            break;
            
        case 'startGame':
            if (engineInstance) {
                engineInstance.isRunning = true;
                engineInstance.isPaused = false;
                engineInstance.resetGame(false);
                engineInstance.startLoop();
            }
            break;
            
        case 'startBenchmark':
            if (engineInstance) {
                engineInstance.isBenchmarking = true;
                engineInstance.benchmarkTimer = 0;
                engineInstance.benchFrames = 0;
                engineInstance.benchFpsTotal = 0;
                engineInstance.benchPhysDelayTotal = 0;
                engineInstance.benchPhysDelayMax = 0;
                engineInstance.benchDrawDelayTotal = 0;
                engineInstance.benchDrawDelayMax = 0;
                
                engineInstance.isRunning = true;
                engineInstance.isPaused = false;
                engineInstance.resetGame(false);
                
                // 强力装备改装！直接拉满！
                engineInstance.hangar.turretLevel = 2; // 伴飞僚机开启
                engineInstance.hangar.engineLevel = 2; // 等离子尾喷开启
                engineInstance.hangar.wingsLevel = 1; // 能盾切翼开启（上限为1）

                // 给玩家加上无敌和晶核，让跑分场面更酷炫
                engineInstance.shieldTime = 8000; // 8秒无敌护盾
                engineInstance.player.elementSlots = ['Fire', 'Rad']; // 坍缩黑洞星云爆 (Fire+Rad)
                engineInstance._recomputeComboKey();

                // 强制初始化僚机 — side 必须显式设置，否则 updateWingmen 因 length 已匹配不会重建，wingmanFire 计算 w.side*x 会得 NaN
                engineInstance.wingmen = [
                    { x: engineInstance.player.x - 45, y: engineInstance.player.y + 15, bankAngle: 0, side: -1, lastShotTime: 0 },
                    { x: engineInstance.player.x + 45, y: engineInstance.player.y + 15, bankAngle: 0, side:  1, lastShotTime: 0 }
                ];
                
                engineInstance.startLoop();
            }
            break;
            
        case 'keydown':
            if (engineInstance) {
                engineInstance.keys[data.code] = true;
                // 支持快捷按键
                if (data.code === 'Escape' || data.code === 'KeyP') {
                    engineInstance.togglePause();
                }
                if ((data.code === 'ShiftLeft' || data.code === 'ShiftRight')
                    && engineInstance.isRunning && !engineInstance.isPaused
                    && engineInstance.warpCharge >= 100) {
                    // Shift → 向上跳 300px 折跃
                    engineInstance.triggerWarp(engineInstance.player.x, Math.max(20, engineInstance.player.y - 300));
                }
                if (data.code === 'KeyK' && engineInstance.isRunning && !engineInstance.isPaused) {
                    engineInstance.score += 1000;
                    engineInstance.scrap += 10;
                    engineInstance.player.hp = Math.min(engineInstance.player.maxHp, engineInstance.player.hp + 20);
                    engineInstance.showToast(`🧪 极客热更新调试：积分 +1000 (当前: ${engineInstance.score})`);
                }
            }
            break;

        case 'warpAt':
            // 主线程双击 / 双指双触发的折跃 — 跳到指定逻辑坐标
            if (engineInstance && engineInstance.isRunning && !engineInstance.isPaused
                && engineInstance.warpCharge >= 100) {
                engineInstance.triggerWarp(data.x, data.y);
            }
            break;
            
        case 'keyup':
            if (engineInstance) {
                engineInstance.keys[data.code] = false;
            }
            break;
            
        case 'move':
            if (engineInstance && engineInstance.player && engineInstance.isRunning && !engineInstance.isPaused) {
                engineInstance.player.x += data.dx;
                engineInstance.player.y += data.dy;
                
                // 限制边界
                if (engineInstance.player.x < 30) engineInstance.player.x = 30;
                if (engineInstance.player.x > engineInstance.logicalWidth - 30) engineInstance.player.x = engineInstance.logicalWidth - 30;
                if (engineInstance.player.y < 50) engineInstance.player.y = 50;
                if (engineInstance.player.y > engineInstance.logicalHeight - 50) engineInstance.player.y = engineInstance.logicalHeight - 50;
            }
            break;
            
        case 'triggerEomBomb':
            if (engineInstance) {
                engineInstance.triggerEomBomb();
            }
            break;
            
        case 'upgrade':
            // 玩家在主线程的改装机舱升级了，同步升级状态给 Worker 引擎
            if (engineInstance) {
                engineInstance.scrap = data.scrap;
                engineInstance.hangar = data.hangar;
                engineInstance.unlockedSkins = data.unlockedSkins;
                engineInstance.currentSkin = data.currentSkin;
                if (data.talents) {
                    engineInstance.talents = data.talents;
                    self.talents = data.talents;
                }
                
                // 强制更新僚机对象，如果升级了僚机的话 — side 必须显式设置（见 wingmanFire 对 w.side 的使用）
                if (engineInstance.hangar.turretLevel > 0 && engineInstance.wingmen.length === 0) {
                    engineInstance.wingmen = [
                        { x: engineInstance.player.x - 45, y: engineInstance.player.y + 15, bankAngle: 0, side: -1, lastShotTime: 0 },
                        { x: engineInstance.player.x + 45, y: engineInstance.player.y + 15, bankAngle: 0, side:  1, lastShotTime: 0 }
                    ];
                }
                engineInstance.updateHUD();
            }
            break;
            
        case 'exitHangar':
            if (engineInstance) {
                engineInstance.isPaused = false;
                engineInstance.startLoop();
                engineInstance.showToast(`🛰 舰队重新起航！当前波数: ${engineInstance.wave}`);
            }
            break;
            
        case 'togglePause':
            if (engineInstance) {
                engineInstance.togglePause();
            }
            break;
            
        case 'pauseGame':
            // 仅暂停模拟（构装总览面板打开时），不弹出暂停菜单
            if (engineInstance) {
                engineInstance.isPaused = true;
            }
            break;

        case 'resumeGame':
            if (engineInstance) {
                engineInstance.isPaused = false;
                engineInstance.lastTime = performance.now();
                engineInstance.startLoop();
            }
            break;
            
        case 'resetGame':
            if (engineInstance) {
                engineInstance.isRunning = true;
                engineInstance.isPaused = false;
                engineInstance.resetGame(data.shouldStart);
                if (data.shouldStart) {
                    engineInstance.startLoop();
                } else {
                    engineInstance.stopLoop();
                }
            }
            break;
            
        case 'modSelected':
            if (engineInstance) {
                engineInstance.applyModCard(data.modId);
                engineInstance.isPaused = false;
                engineInstance.startLoop();
                engineInstance.updateHUD();
            }
            break;
    }
};
