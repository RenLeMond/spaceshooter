// ⚡ 《星海猎手 V5.2.0：极客级双重底层性能飞跃》Web Worker 子线程引擎核心
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
        }
    }
};

// 使得全局 localStorage 指向 mock
self.localStorage = self.window.localStorage;

// 极客级无感声效 Proxy 代理，将局内调用的所有 sfx 接口自动拦截并通过 postMessage 转发给主线程播放
const sfxProxy = new Proxy({}, {
    get: function(target, prop) {
        return function(...args) {
            postMessage({
                type: 'sound',
                method: prop,
                args: args
            });
        };
    }
});
self.sfx = sfxProxy;

// 导入星海猎手所有核心引擎文件 (不加载 sound.js，直接使用上面的 Proxy 代理，规避 AudioContext 报错)
importScripts('engine_base.js', 'engine_physics.js', 'engine_entities.js', 'engine_boss.js', 'engine_renderer.js', 'engine_hangar.js');

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
    updateHUD() {
        let bossHp = 0;
        let bossMaxHp = 0;
        let bossParts = null;
        let bossType = null;
        if (this.boss && this.boss.active) {
            bossType = this.boss.type;
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
            } else if (this.boss.parts && this.boss.parts.core) {
                bossHp = this.boss.parts.core.hp;
                bossMaxHp = this.boss.parts.core.maxHp;
                bossParts = {
                    shield: (this.boss.parts.shieldCore && this.boss.parts.shieldCore.active) ? this.boss.parts.shieldCore.hp / this.boss.parts.shieldCore.maxHp : 0,
                    left: (this.boss.parts.leftWing && this.boss.parts.leftWing.active) ? this.boss.parts.leftWing.hp / this.boss.parts.leftWing.maxHp : 0,
                    right: (this.boss.parts.rightWing && this.boss.parts.rightWing.active) ? this.boss.parts.rightWing.hp / this.boss.parts.rightWing.maxHp : 0
                };
            }
        }

        postMessage({
            type: 'hud',
            score: this.score,
            scrap: this.scrap,
            wave: this.wave,
            bestScore: this.bestScore,
            playerHp: this.player ? this.player.hp : 0,
            playerMaxHp: this.player ? this.player.maxHp : 0,
            shieldTime: this.shieldTime,
            bombCharge: this.bombCharge,
            slot1: this.player && this.player.elementSlots ? this.player.elementSlots[0] : null,
            slot2: this.player && this.player.elementSlots ? this.player.elementSlots[1] : null,
            synergyName: this.player ? this.player.synergyName : '',
            bossActive: !!(this.boss && this.boss.active),
            bossHp: bossHp,
            bossMaxHp: bossMaxHp,
            bossParts: bossParts,
            bossType: bossType
        });
    }

    // 重写 Toast 显示，交由主线程 DOM 渲染
    showToast(text) {
        postMessage({ type: 'toast', text: text });
    }

    // 重写游戏结束
    triggerGameOver() {
        this.isRunning = false;
        // 计算最佳分数
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('space_best_score', this.bestScore);
        }
        
        postMessage({
            type: 'gameOver',
            score: this.score,
            wave: this.wave,
            bestScore: this.bestScore
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
            
            engineInstance = new GameEngineWorker();
            
            // 覆盖 canvas 和 ctx 引用
            engineInstance.canvas = data.canvas;
            engineInstance.ctx = data.canvas.getContext('2d');
            
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
                engineInstance.hangar.wingsLevel = 2; // 能盾切翼开启

                // 给玩家加上无敌和晶核，让跑分场面更酷炫
                engineInstance.shieldTime = 8000; // 8秒无敌护盾
                engineInstance.player.elementSlots = ['fire', 'lightning']; // 极爆共鸣
                
                // 强制初始化僚机
                engineInstance.wingmen = [
                    { x: engineInstance.player.x - 45, y: engineInstance.player.y + 15, bankAngle: 0, lastShotTime: 0 },
                    { x: engineInstance.player.x + 45, y: engineInstance.player.y + 15, bankAngle: 0, lastShotTime: 0 }
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
                if (data.code === 'KeyK' && engineInstance.isRunning && !engineInstance.isPaused) {
                    engineInstance.score += 1000;
                    engineInstance.scrap += 10;
                    engineInstance.player.hp = Math.min(engineInstance.player.maxHp, engineInstance.player.hp + 20);
                    engineInstance.showToast(`🧪 极客热更新调试：积分 +1000 (当前: ${engineInstance.score})`);
                }
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
                
                // 强制更新僚机对象，如果升级了僚机的话
                if (engineInstance.hangar.turretLevel > 0 && engineInstance.wingmen.length === 0) {
                    engineInstance.wingmen = [
                        { x: engineInstance.player.x - 45, y: engineInstance.player.y + 15, bankAngle: 0, lastShotTime: 0 },
                        { x: engineInstance.player.x + 45, y: engineInstance.player.y + 15, bankAngle: 0, lastShotTime: 0 }
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
    }
};
