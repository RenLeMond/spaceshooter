class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.logicalWidth = 540;
        this.logicalHeight = 960;
        
        this.isRunning = false;
        this.isPaused = false;
        this.controlMode = 'touch'; 
        
        this.score = 0;
        this.scrap = 0; 
        this.bestScore = parseInt(localStorage.getItem('space_best_score') || '0');
        this.wave = 1;
        this.shieldTime = 0;
        this.bombCharge = 100;
        
        this.player = null;
        this.maxBullets = 200;
        this.maxMeteors = 40;
        this.bullets = Array.from({ length: this.maxBullets }, () => ({ active: false }));
        this.maxMeteorPoints = 12; // numPoints 范围 8~11，预留 12
        this.meteors = Array.from({ length: this.maxMeteors }, () => ({
            active: false,
            offsets: new Float32Array(this.maxMeteorPoints)
        }));
        this.scratchMeteorOffsets = new Float32Array(this.maxMeteorPoints); // P2: spawnMeteor 复用，避免每次 new Array
        this.wingmen = [];
        this.whiteHole = null;
        this.slingshotTime = 0;
        this.slingshotActivated = false;
        // P2: 0-GC 闭环对象池 — 杜绝 splice 引发的隐式内存重排
        this.maxLightningChains = 16;
        this.lightningChainSegs = 4;
        this.lightningChains = Array.from({ length: this.maxLightningChains }, () => ({
            active: false,
            alpha: 0,
            color: '#fbbf24',
            segCount: 0,
            segments: Array.from({ length: this.lightningChainSegs }, () => ({ x1: 0, y1: 0, x2: 0, y2: 0 }))
        }));
        this.maxTitanRipples = 16;
        this.titanRipples = Array.from({ length: this.maxTitanRipples }, () => ({
            active: false, x: 0, y: 0, radius: 0, maxRadius: 0, alpha: 0, color: null
        }));
        this.maxParticles = 500;
        this.particleBuffer = new Float32Array(this.maxParticles * 8);
        this.particleColors = new Array(this.maxParticles).fill('');
        this.particleColorIds = new Uint16Array(this.maxParticles);
        this.particleColorMap = new Map();
        this.particleColorList = [];
        this.maxUniqueColors = 64;
        this.particleGroups = [];
        for (let i = 0; i < this.maxUniqueColors * 5; i++) {
            this.particleGroups[i] = {
                count: 0,
                indices: new Uint16Array(this.maxParticles)
            };
        }

        this.powerupGradients = {};
        this.wingmanFlameGradients = [];
        this.blackHoleGradient = null;
        // P0: 渐变创建延迟到 initGradients() 中，待真实 ctx 就绪后再生成
        // (Worker 模式下 constructor 期间 ctx 是 mock 空对象，调用 createRadialGradient 会 TypeError)
        if (this.ctx && typeof this.ctx.createRadialGradient === 'function') {
            this.initGradients();
        }

        // P2: 预建 10 档 alpha 量化字符串池 — 用于 lightning/ripple 描边，杜绝每帧拼接
        this.alphaBuckets = 10;
        this.lightningGoldByAlpha = new Array(this.alphaBuckets + 1);
        this.lightningWhiteByAlpha = new Array(this.alphaBuckets + 1);
        for (let i = 0; i <= this.alphaBuckets; i++) {
            const a = (i / this.alphaBuckets).toFixed(2);
            this.lightningGoldByAlpha[i] = `rgba(251, 191, 36, ${a})`;
            this.lightningWhiteByAlpha[i] = `rgba(255, 255, 255, ${a})`;
        }
        // ripple 颜色按 base RGB 串 + alpha bucket 缓存
        this.rippleStyleCache = new Map();

        // P2: 预建 floatText 字体串缓存 — 按 size 字号 lookup
        this.floatTextFontCache = new Array(64);

        this.maxPowerups = 32;
        this.powerups = Array.from({ length: this.maxPowerups }, () => ({
            active: false, x: 0, y: 0, type: 'scrap', vy: 0, pulse: 0
        }));
        this.stars = [];
        this.maxFloatTexts = 40;
        this.floatTexts = Array.from({ length: this.maxFloatTexts }, () => ({
            active: false, x: 0, y: 0, text: '', color: '#ffffff', size: 14, alpha: 0
        }));
        this.screenshake = 0;
        this.frameNow = Date.now(); // 由 draw() 每帧刷新，作为渲染中所有时间动画的统一时钟
        
        this.hangar = {
            turretLevel: 0, 
            engineLevel: 0, 
            wingsLevel: 0,  
        };
        
        this.currentSkin = localStorage.getItem('space_current_skin') || 'default';
        try {
            this.unlockedSkins = JSON.parse(localStorage.getItem('space_unlocked_skins') || '["default"]');
            if (!Array.isArray(this.unlockedSkins)) this.unlockedSkins = ['default'];
        } catch (e) {
            this.unlockedSkins = ['default'];
        }
        
        this.bulletSearchIndex = 0;
        this.meteorSearchIndex = 0;
        this.particleIndex = 0;
        this.activeParticleCount = 0; // P2: 0-GC 活跃粒子计数，避免每次 spawn 都 O(maxParticles) 扫描

        this.blackHole = null;
        this.blackHoleSpawnTimer = 0;
        this.boss = null; 
        this.bossSpawned = false;

        this.spawnTimer = 0;
        this.waveTransitionTimer = 0;
        this.keys = {};

        // 机舱节奏：阶梯阈值表 + 最小冷却 45 秒
        // 第 n 项 = 升到 wave n+1 所需累积分数。曲线 1500 * 1.4^(w-1) 段差
        this.hangarMinInterval = 45000;
        this.lastHangarTime = -Infinity; // 允许首次开
        this.waveScoreThresholds = [0];
        let _cum = 0;
        for (let w = 1; w <= 30; w++) {
            _cum += 1500 * Math.pow(1.4, w - 1);
            this.waveScoreThresholds[w] = Math.floor(_cum);
        }

        // --- 性能跑分 (Benchmark) 核心指标及状态 ---
        this.isBenchmarking = false;
        this.benchmarkTimer = 0;
        this.benchmarkDuration = 8000; // 8秒满负载超频压力测试
        this.benchmarkEntitiesSpawnTimer = 0;
        
        // 采样指标
        this.benchFrames = 0;
        this.benchFpsTotal = 0;
        this.benchPhysDelayTotal = 0;
        this.benchPhysDelayMax = 0;
        this.benchDrawDelayTotal = 0;
        this.benchDrawDelayMax = 0;
        
        // 当前实时采样
        this.currentFps = 0;
        this.fpsLastTime = performance.now();
        this.fpsFrameCount = 0;
        this.physDelay = 0; // 物理更新延迟(ms)
        this.drawDelay = 0; // 渲染更新延迟(ms)
        
        this.bindUIElements();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
        this.initStars();
    }

    // P0: 渐变在 ctx 真正就绪后才创建。constructor (worker mock) 与 worker init (真实 ctx) 都会调用
    initGradients() {
        const powerupColorMap = {
            'EM': '#06b6d4', 'Frost': '#3b82f6', 'Fire': '#f43f5e',
            'Rad': '#fbbf24', 'shield': '#06b6d4', 'heal': '#10b981'
        };
        const powerupTypes = ['EM', 'Frost', 'Fire', 'Rad', 'shield', 'heal'];
        this.powerupGradients = {};
        for (let i = 0; i < powerupTypes.length; i++) {
            const type = powerupTypes[i];
            const grad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 15);
            grad.addColorStop(0, powerupColorMap[type]);
            grad.addColorStop(1, 'transparent');
            this.powerupGradients[type] = grad;
        }

        this.wingmanFlameGradients = [];
        for (let h = 6; h <= 14; h++) {
            const grad = this.ctx.createLinearGradient(0, 5, 0, 5 + h);
            grad.addColorStop(0, '#a78bfa');
            grad.addColorStop(1, 'transparent');
            this.wingmanFlameGradients[h] = grad;
        }

        this.blackHoleGradient = this.ctx.createRadialGradient(0, 0, 5, 0, 0, 70);
        this.blackHoleGradient.addColorStop(0, '#000000');
        this.blackHoleGradient.addColorStop(0.2, '#f43f5e');
        this.blackHoleGradient.addColorStop(0.5, '#ec4899');
        this.blackHoleGradient.addColorStop(1, 'transparent');
    }

    // P2: 0-GC 池槽位获取 — 优先复用 inactive 槽；池满返回 null，调用方决定丢弃
    acquirePoolSlot(pool) {
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].active) return pool[i];
        }
        return null;
    }

    bindUIElements() {
        this.startScreen = document.getElementById('startScreen');
        this.pauseScreen = document.getElementById('pauseScreen');
        this.gameOverScreen = document.getElementById('gameOverScreen');
        this.workshopScreen = document.getElementById('workshopScreen');
        this.mobileControls = document.getElementById('mobileControls');
        this.hud = document.getElementById('hud');
        
        this.scoreText = document.getElementById('scoreText');
        this.scoreText.addEventListener('dblclick', () => {
            if (this.isRunning && !this.isPaused) {
                this.score += 1000;
                this.scrap += 10;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
                this.showToast(`🧪 极客双击调试：积分 +1000 (当前: ${this.score})`);
            }
        });
        this.scrapText = document.getElementById('scrapText');
        this.bestScoreText = document.getElementById('bestScoreText');
        this.waveText = document.getElementById('waveText');
        this.hpBar = document.getElementById('hpBar');
        this.shieldBar = document.getElementById('shieldBar');
        this.bombChargeBar = document.getElementById('bombChargeBar');
        this.warpBar = document.getElementById('warpBar');
        
        this.slot1UI = document.getElementById('slot1');
        this.slot2UI = document.getElementById('slot2');
        this.synergyNameUI = document.getElementById('synergyName');

        document.getElementById('selectTouchBtn').addEventListener('click', () => this.setControlMode('touch'));
        document.getElementById('selectKeyBtn').addEventListener('click', () => this.setControlMode('keyboard'));
        document.getElementById('startPlayBtn').addEventListener('click', () => this.startGame());
        
        document.getElementById('resumeBtn').addEventListener('click', () => this.resumeGame());
        document.getElementById('restartFromPauseBtn').addEventListener('click', () => this.resetGame(true));
        document.getElementById('retryBtn').addEventListener('click', () => this.resetGame(true));
        document.getElementById('backToMenuBtn').addEventListener('click', () => this.showMenu());
        
        document.getElementById('controlToggleBtn').addEventListener('click', () => this.toggleControlModeDirectly());
        document.getElementById('soundToggleBtn').addEventListener('click', (e) => this.toggleSound(e));
        document.getElementById('bombBtn').addEventListener('click', () => this.triggerEomBomb());

        document.getElementById('buyTurretBtn').addEventListener('click', () => this.buyModule('turret', 50));
        document.getElementById('buyEngineBtn').addEventListener('click', () => this.buyModule('engine', 40));
        document.getElementById('buyWingsBtn').addEventListener('click', () => this.buyModule('wings', 60));
        document.getElementById('buySkinVoidBtn').addEventListener('click', () => this.interactSkin('void', 80));
        document.getElementById('buySkinThunderBtn').addEventListener('click', () => this.interactSkin('thunder', 100));
        document.getElementById('buySkinImperialBtn').addEventListener('click', () => this.interactSkin('imperial', 120));
        document.getElementById('exitWorkshopBtn').addEventListener('click', () => this.exitHangar());

        // 绑定跑分 UI 交互事件
        const startBench = document.getElementById('startBenchmarkBtn');
        if (startBench) startBench.addEventListener('click', () => this.startBenchmark());
        
        const pauseBench = document.getElementById('pauseBenchmarkBtn');
        if (pauseBench) pauseBench.addEventListener('click', () => this.startBenchmark());
        
        const closeBench = document.getElementById('benchCloseBtn');
        if (closeBench) closeBench.addEventListener('click', () => this.closeBenchmarkReport());
        
        const retryBench = document.getElementById('benchRetryBtn');
        if (retryBench) retryBench.addEventListener('click', () => this.startBenchmark());

        this.bestScoreText.innerText = String(this.bestScore).padStart(6, '0');
    }

    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        const targetRatio = 9 / 16;
        const currentRatio = width / height;
        
        let renderWidth, renderHeight;
        if (currentRatio > targetRatio) {
            // Height is the limiting factor (Pillarbox - black bars on left/right)
            renderHeight = height;
            renderWidth = height * targetRatio;
        } else {
            // Width is the limiting factor (Letterbox - black bars on top/bottom)
            renderWidth = width;
            renderHeight = width / targetRatio;
        }
        
        this.canvas.width = renderWidth;
        this.canvas.height = renderHeight;
        
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${(width - renderWidth) / 2}px`;
        this.canvas.style.top = `${(height - renderHeight) / 2}px`;
        this.canvas.style.width = `${renderWidth}px`;
        this.canvas.style.height = `${renderHeight}px`;

        this.scaleX = renderWidth / this.logicalWidth;
        this.scaleY = renderHeight / this.logicalHeight;
    }

    initStars() {
        // P1: 10-band brightness-grouped starfield for 0-GC rendering
        const NUM_STARS = 80;
        const NUM_BANDS = 10;
        this.starBandCount = NUM_BANDS;
        this.starColors = [];
        for (let b = 0; b < NUM_BANDS; b++) {
            const brightness = (0.5 + (b / NUM_BANDS) * 0.5).toFixed(2);
            this.starColors[b] = `rgba(255, 255, 255, ${brightness})`;
        }
        // Temporary collection bins
        const bins = [];
        for (let b = 0; b < NUM_BANDS; b++) bins[b] = [];
        for (let i = 0; i < NUM_STARS; i++) {
            const brightness = Math.random() * 0.5 + 0.5;
            const bandIdx = Math.min(NUM_BANDS - 1, Math.floor((brightness - 0.5) / 0.5 * NUM_BANDS));
            bins[bandIdx].push({
                x: Math.random() * this.logicalWidth,
                y: Math.random() * this.logicalHeight,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 1.5 + 0.5
            });
        }
        // Flatten into typed-like parallel arrays per band
        this.starGroups = [];
        for (let b = 0; b < NUM_BANDS; b++) {
            const bin = bins[b];
            const count = bin.length;
            const xs = new Float32Array(count);
            const ys = new Float32Array(count);
            const sizes = new Float32Array(count);
            const speeds = new Float32Array(count);
            for (let j = 0; j < count; j++) {
                xs[j] = bin[j].x;
                ys[j] = bin[j].y;
                sizes[j] = bin[j].size;
                speeds[j] = bin[j].speed;
            }
            this.starGroups[b] = { count, xs, ys, sizes, speeds };
        }
        // Keep legacy this.stars as empty (no longer used in hot path)
        this.stars = [];
    }






    setControlMode(mode) {
        this.controlMode = mode;
        const touchBtn = document.getElementById('selectTouchBtn');
        const keyBtn = document.getElementById('selectKeyBtn');
        
        if (mode === 'touch') {
            touchBtn.classList.add('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
            keyBtn.classList.remove('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
        } else {
            keyBtn.classList.add('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
            touchBtn.classList.remove('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
        }
        this.showToast(mode === 'touch' ? "已选择：指尖滑动连发模式" : "已选择：键盘虚拟按键模式");
    }

    toggleControlModeDirectly() {
        const nextMode = this.controlMode === 'touch' ? 'keyboard' : 'touch';
        this.setControlMode(nextMode);
        if (nextMode === 'keyboard') {
            this.mobileControls.classList.remove('hidden');
        } else {
            this.mobileControls.classList.add('hidden');
        }
    }

    toggleSound(e) {
        const muted = sfx.toggleMute();
        const icon = e.currentTarget.querySelector('i');
        if (muted) {
            icon.className = 'fa-solid fa-volume-xmark';
            this.showToast("音效已静音");
        } else {
            icon.className = 'fa-solid fa-volume-high';
            sfx.playShoot();
            this.showToast("音效已开启");
        }
    }

    showToast(text) {
        const toast = document.getElementById('toastMessage');
        toast.innerText = text;
        toast.style.opacity = '1';
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
        }, 1500);
    }




























    update(deltaTime) {
        if (!this.isRunning || this.isPaused) return;

        // 采样实时 FPS
        const now = performance.now();
        this.fpsFrameCount++;
        if (now - this.fpsLastTime >= 500) { // 每 500ms 刷新一次采样 FPS
            this.currentFps = (this.fpsFrameCount * 1000) / (now - this.fpsLastTime);
            this.fpsFrameCount = 0;
            this.fpsLastTime = now;
        }

        const physStart = performance.now();

        const dt = deltaTime / 16.666;
        const dtClamped = Math.min(dt, 3.0);
        const dtClampedMs = dtClamped * 16.666; // P2: 用于 ms 计时器，避免切标签后裸 deltaTime 一次性榨干 shield/slingshot

        this.applyBlackHoleGravity(dtClamped);
        this.applyWhiteHoleGravity(dtClamped);
        this.updateBoss(dtClamped);

        if (this.screenshake > 0) {
            this.screenshake -= 0.5 * dtClamped;
        }

        // P1: 0-GC star update via flat typed arrays per brightness band
        for (let b = 0; b < this.starBandCount; b++) {
            const group = this.starGroups[b];
            const count = group.count;
            const ys = group.ys;
            const xs = group.xs;
            const speeds = group.speeds;
            for (let si = 0; si < count; si++) {
                ys[si] += speeds[si] * dtClamped;
                if (ys[si] > this.logicalHeight) {
                    ys[si] = 0;
                    xs[si] = Math.random() * this.logicalWidth;
                }
            }
        }

        if (this.shieldTime > 0) {
            this.shieldTime -= dtClampedMs;
        }

        if (this.warpCharge < 100) {
            this.warpCharge += 0.333 * dtClamped; // 5 秒充满: 100 / (5 * 60fps) ≈ 0.333/帧
            if (this.warpCharge > 100) this.warpCharge = 100;
        }

        if (this.slingshotTime > 0) {
            this.slingshotTime -= dtClampedMs;
        }

        for (let i = 0; i < this.maxLightningChains; i++) {
            const chain = this.lightningChains[i];
            if (!chain.active) continue;
            chain.alpha -= 0.04 * dtClamped;
            if (chain.alpha <= 0) chain.active = false;
        }

        for (let i = 0; i < this.maxTitanRipples; i++) {
            const ripple = this.titanRipples[i];
            if (!ripple.active) continue;
            ripple.radius += 5.5 * dtClamped;
            ripple.alpha -= 0.015 * dtClamped;
            if (ripple.alpha <= 0 || ripple.radius >= ripple.maxRadius) {
                ripple.active = false;
            }
        }

        if (this.hangar.turretLevel > 0) {
            this.updateWingmen(dtClamped);
        }

        const moveSpeed = this.player.speed * dtClamped;
        if (this.controlMode === 'keyboard') {
            if (this.keys['ArrowLeft'] || this.keys['KeyA']) {
                this.player.x -= moveSpeed;
            }
            if (this.keys['ArrowRight'] || this.keys['KeyD']) {
                this.player.x += moveSpeed;
            }
            if (this.keys['ArrowUp'] || this.keys['KeyW']) {
                this.player.y -= moveSpeed;
            }
            if (this.keys['ArrowDown'] || this.keys['KeyS']) {
                this.player.y += moveSpeed;
            }
            if (this.keys['Space']) {
                this.playerFire();
            }
        } else {
            this.playerFire();
        }

        if (this.player.x < 30) this.player.x = 30;
        if (this.player.x > this.logicalWidth - 30) this.player.x = this.logicalWidth - 30;
        if (this.player.y < 50) this.player.y = 50;
        if (this.player.y > this.logicalHeight - 50) this.player.y = this.logicalHeight - 50;

        for (let i = 0; i < this.maxBullets; i++) {
            const bullet = this.bullets[i];
            if (!bullet.active) continue;
            bullet.y += bullet.vy * dtClamped;
            bullet.x += bullet.vx * dtClamped;
            
            if (bullet.y < -50 || bullet.x < -20 || bullet.x > this.logicalWidth + 20) {
                bullet.active = false;
            }
        }

        this.handleEnemySpawning(deltaTime);

        // 引擎尾迹烧伤 (从 draw 移入 update，避免暂停期仍触发游戏状态改动)
        if (this.hangar.engineLevel > 0 && Math.random() < 0.4) {
            const burn = this.hangar.engineLevel * 0.8;
            for (let i = 0; i < this.maxMeteors; i++) {
                const m = this.meteors[i];
                if (!m.active) continue;
                const dx = this.player.x - m.x;
                const dy = (this.player.y + 40) - m.y;
                if (dx * dx + dy * dy < 4225) {
                    m.hp -= burn;
                    this.createHitParticles(m.x, m.y, '#f43f5e');
                }
            }
        }

        for (let i = 0; i < this.maxMeteors; i++) {
            const meteor = this.meteors[i];
            if (!meteor.active) continue;
            meteor.y += meteor.vy * dtClamped;
            meteor.x += meteor.vx * dtClamped;
            meteor.angle += meteor.spinSpeed * dtClamped;

            if (meteor.y > this.logicalHeight + meteor.size) {
                meteor.active = false;
                if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
                    this.damagePlayer(Math.floor(meteor.size * 0.3));
                    this.createScreenShake(8);
                } else {
                    sfx.playHit();
                }
            }
        }

        for (let i = 0; i < this.maxFloatTexts; i++) {
            const ft = this.floatTexts[i];
            if (!ft.active) continue;
            ft.y -= 1 * dtClamped;
            ft.alpha -= 0.02 * dtClamped;
            if (ft.alpha <= 0) ft.active = false;
        }

        for (let i = 0; i < this.maxParticles; i++) {
            const o = i * 8;
            if (this.particleBuffer[o + 7] === 0) continue;
            this.particleBuffer[o] += this.particleBuffer[o + 2] * dtClamped; // x += vx
            this.particleBuffer[o + 1] += this.particleBuffer[o + 3] * dtClamped; // y += vy
            this.particleBuffer[o + 5] -= this.particleBuffer[o + 6] * dtClamped; // alpha -= decay
            if (this.particleBuffer[o + 5] <= 0) {
                this.particleBuffer[o + 7] = 0; // active = 0
                if (this.activeParticleCount > 0) this.activeParticleCount--;
            }
        }

        for (let i = 0; i < this.maxPowerups; i++) {
            const item = this.powerups[i];
            if (!item.active) continue;

            if (item.type === 'scrap') {
                const dx = this.player.x - item.x;
                const dy = this.player.y - item.y;
                const distSq = dx * dx + dy * dy;
                let magnetRadius = 180;
                let magnetRadiusSq = 32400;
                if (this.currentSkin === 'imperial') {
                    magnetRadius = 230;
                    magnetRadiusSq = 52900;
                }
                
                if (distSq < magnetRadiusSq) {
                    const dist = Math.sqrt(distSq);
                    const pullForce = 3.5 + (magnetRadius - dist) * 0.08;
                    const distVal = dist || 1;
                    item.x += (dx / distVal) * pullForce * dtClamped;
                    item.y += (dy / distVal) * pullForce * dtClamped;
                } else {
                    item.y += item.vy * dtClamped;
                }
            } else {
                item.y += item.vy * dtClamped;
                item.pulse += 0.05 * dtClamped;
            }

            if (item.y > this.logicalHeight + 30) {
                item.active = false;
            }
        }

        this.checkCollisions();
        this.updateHUD();

        // 测量物理延迟
        this.physDelay = performance.now() - physStart;

        // 如果是 Benchmark 模式，进行压力高负载实装！
        if (this.isBenchmarking) {
            this.benchmarkTimer += deltaTime;
            this.benchmarkEntitiesSpawnTimer += deltaTime;

            // 疯狂生成流星，测试物理碰撞与粒子系统高负载
            if (this.benchmarkEntitiesSpawnTimer > 60) {
                this.benchmarkEntitiesSpawnTimer = 0;
                
                // 生成多颗流星
                for (let count = 0; count < 2; count++) {
                    const benchOffsets = this.scratchMeteorOffsets;
                    for (let k = 0; k < 8; k++) benchOffsets[k] = Math.random() * 0.4 + 0.8;
                    this.spawnMeteorInPool({
                        x: Math.random() * this.logicalWidth,
                        y: -30,
                        size: Math.random() * 25 + 15,
                        radius: Math.random() * 12 + 8,
                        vx: (Math.random() - 0.5) * 6,
                        vy: Math.random() * 8 + 4,
                        hp: 30,
                        maxHp: 30,
                        type: 'normal',
                        angle: Math.random() * Math.PI,
                        spinSpeed: (Math.random() - 0.5) * 0.1,
                        offsets: benchOffsets,
                        numPoints: 8,
                        color: '#c084fc'
                    });
                }

                // 疯狂生成粒子爆炸，给粒子池上满载压力
                this.createExplosionParticles(
                    Math.random() * this.logicalWidth,
                    Math.random() * (this.logicalHeight / 2) + 100,
                    20,
                    '#22d3ee'
                );
            }

            // 自动狂暴开火 (跑分时僚机和主机疯狂输出以拉满弹幕)
            for (let i = 0; i < 3; i++) {
                this.spawnBulletInPool({
                    x: Math.random() * this.logicalWidth,
                    y: this.logicalHeight - 150,
                    vx: (Math.random() - 0.5) * 8,
                    vy: -15,
                    radius: 4,
                    damage: 15,
                    color: '#fbbf24',
                    pierce: 2,
                    comboEffect: 'Fire+Rad'
                });
            }

            // 在第 2 秒和第 5 秒强制生成引力黑洞与白洞，引发粒子涡流
            if (Math.abs(this.benchmarkTimer - 2000) < 30 && !this.blackHole) {
                this.spawnBlackHole();
                if (this.blackHole) {
                    this.blackHole.x = this.logicalWidth / 2;
                    this.blackHole.y = this.logicalHeight / 3;
                    this.blackHole.mass = 150;
                }
            }
            if (Math.abs(this.benchmarkTimer - 5000) < 30 && !this.whiteHole) {
                this.spawnWhiteHole();
                if (this.whiteHole) {
                    this.whiteHole.x = this.logicalWidth / 2;
                    this.whiteHole.y = this.logicalHeight * 2 / 3;
                    this.whiteHole.mass = 160;
                }
            }

            // 限制玩家位置在中央不动，以便美观
            this.player.x = this.logicalWidth / 2;
            this.player.y = this.logicalHeight * 0.82;

            // 收集 Benchmark 数据
            this.benchFrames++;
            this.benchFpsTotal += this.currentFps || 60;
            this.benchPhysDelayTotal += this.physDelay;
            if (this.physDelay > this.benchPhysDelayMax) this.benchPhysDelayMax = this.physDelay;

            // 8 秒后自动结束跑分
            if (this.benchmarkTimer >= this.benchmarkDuration) {
                this.endBenchmark();
            }
        }
    }





    startGame() {
        sfx.init();
        this.startScreen.classList.add('hidden');
        this.hud.classList.remove('opacity-0');
        
        if (this.controlMode === 'keyboard') {
            if ('ontouchstart' in window) {
                this.mobileControls.classList.remove('hidden');
            }
        } else {
            this.mobileControls.classList.add('hidden');
        }
        this.resetGame(false);
    }

    resetGame(shouldStart = true) {
        this.score = 0;
        this.scrap = 0;
        this.wave = 1;
        this.shieldTime = 0;
        this.bombCharge = 100;
        this.warpCharge = 100;
        this.lastHangarTime = -Infinity; // 局内复位，下局首次过 wave 即可开机舱
        for (let i = 0; i < this.maxBullets; i++) this.bullets[i].active = false;
        for (let i = 0; i < this.maxMeteors; i++) this.meteors[i].active = false;
        this.particleBuffer.fill(0);
        this.particleColors.fill('');
        this.particleColorIds.fill(0);
        this.particleColorMap.clear();
        this.particleColorList.length = 0;
        for (let g = 0; g < this.particleGroups.length; g++) {
            this.particleGroups[g].count = 0;
        }
        for (let i = 0; i < this.maxPowerups; i++) this.powerups[i].active = false;
        for (let i = 0; i < this.maxFloatTexts; i++) this.floatTexts[i].active = false;
        for (let i = 0; i < this.maxLightningChains; i++) this.lightningChains[i].active = false;
        for (let i = 0; i < this.maxTitanRipples; i++) this.titanRipples[i].active = false;
        this.spawnTimer = 0;
        this.blackHoleSpawnTimer = 0;
        this.waveTransitionTimer = 0;
        
        this.hangar = { turretLevel: 0, engineLevel: 0, wingsLevel: 0 };
        this.blackHole = null;
        this.boss = null;
        this.bossSpawned = false;
        
        this.bulletSearchIndex = 0;
        this.meteorSearchIndex = 0;
        this.particleIndex = 0;
        this.activeParticleCount = 0;

        // P2: 补齐遗漏的状态清理（whiteHole / wingmen / slingshot / toast 定时器等）
        this.whiteHole = null;
        if (this.wingmen) this.wingmen.length = 0;
        this.slingshotTime = 0;
        this.slingshotActivated = false;
        this.screenshake = 0;
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
            this.toastTimeout = null;
        }

        this.player = {
            x: this.logicalWidth / 2,
            y: this.logicalHeight * 0.82,
            width: 50,
            height: 50,
            speed: 8,
            hp: 100,
            maxHp: 100,
            elementSlots: [], 
            lastShotTime: 0,
            fireInterval: 180,
        };

        this.updateHUD();
        this.gameOverScreen.classList.add('hidden');
        this.pauseScreen.classList.add('hidden');
        this.workshopScreen.classList.add('hidden');
        document.getElementById('bossHpGroup').classList.add('hidden');
        this.isPaused = false;
        this.isRunning = true;

        this.setupControls();
        sfx.playPowerup();
    }

    showMenu() {
        this.gameOverScreen.classList.add('hidden');
        this.pauseScreen.classList.add('hidden');
        this.workshopScreen.classList.add('hidden');
        this.startScreen.classList.remove('hidden');
        this.hud.classList.add('opacity-0');
        this.mobileControls.classList.add('hidden');
        this.isRunning = false;
    }







    damagePlayer(amount) {
        this.player.hp -= amount;
        // P1: 仅当一次性伤害 ≥5 时播放大爆炸，避免激光持续掉血每帧触发声效 spam
        sfx.playExplosion(amount >= 5);
        this.addFloatText(this.player.x, this.player.y - 30, `-${amount} HP`, '#f43f5e', 18);

        if (this.player.hp <= 0) {
            this.player.hp = 0;
            this.triggerGameOver();
        }
    }

    triggerGameOver() {
        this.isRunning = false;
        sfx.playGameOver();
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('space_best_score', this.bestScore);
        }

        document.getElementById('endScore').innerText = String(this.score).padStart(6, '0');
        document.getElementById('endWave').innerText = this.wave;
        document.getElementById('endBest').innerText = String(this.bestScore).padStart(6, '0');
        this.gameOverScreen.classList.remove('hidden');
    }

    triggerWarp(tx, ty) {
        if (!this.isRunning || this.isPaused || this.warpCharge < 100) return;
        
        // 1. Singularity Pull at Start Position
        this.createExplosionParticles(this.player.x, this.player.y, 50, "#c084fc");
        this.addFloatText(this.player.x, this.player.y, "WARP", "#c084fc", 16);

        // Execute Teleport
        this.player.x = tx;
        this.player.y = ty;
        this.warpCharge = 0;
        
        // 2. Quantum Boom at End Position
        this.createExplosionParticles(tx, ty, 60, "#22d3ee");
        this.createScreenShake(15);
        sfx.playBomb();

        // 3. Calculate physics push and damage for meteors
        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active) continue;
            
            const dx = m.x - tx;
            const dy = m.y - ty;
            const distSq = dx*dx + dy*dy;
            if (distSq < 40000) { // 200px radius
                m.hp -= 300; 
                if (m.hp <= 0) {
                    this.explodeMeteor(m);
                } else {
                    // Push away
                    m.y -= 80;
                    m.x += dx > 0 ? 60 : -60;
                }
            }
        }
    }


    setupControls() {
        if (this.cleanupControls) this.cleanupControls();
        
        const handleKeyDown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Escape' || e.code === 'KeyP') {
                this.togglePause();
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                if (this.warpCharge >= 100) {
                    // Warp forward
                    this.triggerWarp(this.player.x, Math.max(20, this.player.y - 300));
                }
            }
            if (e.code === 'KeyK' && this.isRunning && !this.isPaused) {
                this.score += 1000;
                this.scrap += 10;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
                this.showToast(`🧪 极客热更新调试：积分 +1000 (当前: ${this.score})`);
            }
        };
        const handleKeyUp = (e) => {
            this.keys[e.code] = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        let touchStartX = 0;
        let touchStartY = 0;
        let isDragging = false;
        let lastTapTime = 0;
        
        const onTouchStart = (e) => {
            if (!this.isRunning || this.isPaused) return;
            if (this.controlMode === 'touch') {
                isDragging = true;
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.logicalWidth / rect.width;
                const scaleY = this.logicalHeight / rect.height;
                touchStartX = (touch.clientX - rect.left) * scaleX;
                touchStartY = (touch.clientY - rect.top) * scaleY;
                
                const now = performance.now();
                if (now - lastTapTime < 300) {
                    if (this.warpCharge >= 100) {
                        this.triggerWarp(touchStartX, touchStartY);
                    }
                }
                lastTapTime = now;
            }
        };

        const onTouchMove = (e) => {
            if (!isDragging || this.controlMode !== 'touch') return;
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.logicalWidth / rect.width;
            const scaleY = this.logicalHeight / rect.height;
            const touchX = (touch.clientX - rect.left) * scaleX;
            const touchY = (touch.clientY - rect.top) * scaleY;
            
            const dx = touchX - touchStartX;
            const dy = touchY - touchStartY;
            this.player.x += dx;
            this.player.y += dy;
            touchStartX = touchX;
            touchStartY = touchY;

            if (this.player.x < 30) this.player.x = 30;
            if (this.player.x > this.logicalWidth - 30) this.player.x = this.logicalWidth - 30;
            if (this.player.y < 50) this.player.y = 50;
            if (this.player.y > this.logicalHeight - 50) this.player.y = this.logicalHeight - 50;
        };

        const onTouchEnd = () => { isDragging = false; };

        const onDblClick = (e) => {
            if (!this.isRunning || this.isPaused) return;
            if (this.warpCharge >= 100) {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.logicalWidth / rect.width;
                const scaleY = this.logicalHeight / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                this.triggerWarp(x, y);
            }
        };

        this.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', onTouchEnd);
        this.canvas.addEventListener('dblclick', onDblClick);

        let isMouseDragging = false;
        let mouseStartX = 0;
        let mouseStartY = 0;

        const onMouseDown = (e) => {
            if (!this.isRunning || this.isPaused) return;
            if (this.controlMode === 'touch') {
                isMouseDragging = true;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.logicalWidth / rect.width;
                const scaleY = this.logicalHeight / rect.height;
                mouseStartX = (e.clientX - rect.left) * scaleX;
                mouseStartY = (e.clientY - rect.top) * scaleY;
            }
        };

        const onMouseMove = (e) => {
            if (!isMouseDragging || this.controlMode !== 'touch') return;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.logicalWidth / rect.width;
            const scaleY = this.logicalHeight / rect.height;
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;
            const dx = mouseX - mouseStartX;
            const dy = mouseY - mouseStartY;
            this.player.x += dx;
            this.player.y += dy;
            mouseStartX = mouseX;
            mouseStartY = mouseY;

            if (this.player.x < 30) this.player.x = 30;
            if (this.player.x > this.logicalWidth - 30) this.player.x = this.logicalWidth - 30;
            if (this.player.y < 50) this.player.y = 50;
            if (this.player.y > this.logicalHeight - 50) this.player.y = this.logicalHeight - 50;
        };

        const onMouseUp = () => { isMouseDragging = false; };

        this.canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const leftKeyBtn = document.getElementById('leftKey');
        const rightKeyBtn = document.getElementById('rightKey');
        const fireKeyBtn = document.getElementById('fireKey');

        const handleLeftBtnStart = (e) => { e.preventDefault(); this.keys['ArrowLeft'] = true; };
        const handleLeftBtnEnd = () => { this.keys['ArrowLeft'] = false; };
        const handleRightBtnStart = (e) => { e.preventDefault(); this.keys['ArrowRight'] = true; };
        const handleRightBtnEnd = () => { this.keys['ArrowRight'] = false; };
        const handleFireBtnStart = (e) => { e.preventDefault(); this.keys['Space'] = true; };
        const handleFireBtnEnd = () => { this.keys['Space'] = false; };

        leftKeyBtn.addEventListener('touchstart', handleLeftBtnStart, { passive: false });
        leftKeyBtn.addEventListener('touchend', handleLeftBtnEnd);
        rightKeyBtn.addEventListener('touchstart', handleRightBtnStart, { passive: false });
        rightKeyBtn.addEventListener('touchend', handleRightBtnEnd);
        fireKeyBtn.addEventListener('touchstart', handleFireBtnStart, { passive: false });
        fireKeyBtn.addEventListener('touchend', handleFireBtnEnd);

        leftKeyBtn.addEventListener('mousedown', handleLeftBtnStart);
        leftKeyBtn.addEventListener('mouseup', handleLeftBtnEnd);
        rightKeyBtn.addEventListener('mousedown', handleRightBtnStart);
        rightKeyBtn.addEventListener('mouseup', handleRightBtnEnd);
        fireKeyBtn.addEventListener('mousedown', handleFireBtnStart);
        fireKeyBtn.addEventListener('mouseup', handleFireBtnEnd);

        this.cleanupControls = () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            this.canvas.removeEventListener('touchstart', onTouchStart);
            this.canvas.removeEventListener('touchmove', onTouchMove);
            this.canvas.removeEventListener('touchend', onTouchEnd);
            this.canvas.removeEventListener('dblclick', onDblClick);
            this.canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            
            leftKeyBtn.removeEventListener('touchstart', handleLeftBtnStart);
            leftKeyBtn.removeEventListener('touchend', handleLeftBtnEnd);
            rightKeyBtn.removeEventListener('touchstart', handleRightBtnStart);
            rightKeyBtn.removeEventListener('touchend', handleRightBtnEnd);
            fireKeyBtn.removeEventListener('touchstart', handleFireBtnStart);
            fireKeyBtn.removeEventListener('touchend', handleFireBtnEnd);
            
            leftKeyBtn.removeEventListener('mousedown', handleLeftBtnStart);
            leftKeyBtn.removeEventListener('mouseup', handleLeftBtnEnd);
            rightKeyBtn.removeEventListener('mousedown', handleRightBtnStart);
            rightKeyBtn.removeEventListener('mouseup', handleRightBtnEnd);
            fireKeyBtn.removeEventListener('mousedown', handleFireBtnStart);
            fireKeyBtn.removeEventListener('mouseup', handleFireBtnEnd);
        };
    }

    updateHUD() {
        this.scoreText.innerText = String(this.score).padStart(6, '0');
        this.scrapText.innerText = this.scrap;
        this.waveText.innerText = this.wave;
        this.hpBar.style.width = `${this.player.hp}%`;
        
        const shieldPercent = this.shieldTime > 0 ? (this.shieldTime / 8000) * 100 : 0;
        this.shieldBar.style.width = `${shieldPercent}%`;
        this.bombChargeBar.style.width = `${this.bombCharge}%`;
        this.warpBar.style.width = `${this.warpCharge}%`;
    }

    createScreenShake(intensity) {
        this.screenshake = intensity;
    }







    // Pause functionality
    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseScreen.classList.remove('hidden');
        } else {
            this.pauseScreen.classList.add('hidden');
        }
    }

    resumeGame() {
        this.isPaused = false;
        this.pauseScreen.classList.add('hidden');
    }

    startBenchmark() {
        this.isBenchmarking = true;
        this.benchmarkTimer = 0;
        this.benchmarkEntitiesSpawnTimer = 0;
        this.benchFrames = 0;
        this.benchFpsTotal = 0;
        this.benchPhysDelayTotal = 0;
        this.benchPhysDelayMax = 0;
        this.benchDrawDelayTotal = 0;
        this.benchDrawDelayMax = 0;

        // 重置游戏为特定跑分高负载初始状态
        this.resetGame(false);
        this.isRunning = true;
        this.isPaused = false;
        
        // 隐藏不需要的UI
        this.startScreen.classList.add('hidden');
        this.pauseScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.workshopScreen.classList.add('hidden');
        const benchModal = document.getElementById('benchmarkModal');
        if (benchModal) benchModal.classList.add('hidden');
        this.hud.classList.remove('opacity-0');

        // 强力装备改装！直接拉满！
        this.hangar.turretLevel = 2; // 伴飞僚机开启
        this.hangar.engineLevel = 2; // 等离子尾喷开启
        this.hangar.wingsLevel = 2; // 能盾切翼开启

        // 给玩家加上无敌和晶核，让跑分场面更酷炫
        this.shieldTime = 8000; // 8秒无敌护盾
        this.player.elementSlots = ['Fire', 'Rad']; // 坍缩黑洞星云爆 (Fire+Rad)
        this._recomputeComboKey();


        // 强制初始化僚机
        this.wingmen = [
            { x: this.player.x - 45, y: this.player.y + 15, bankAngle: 0, lastShotTime: 0 },
            { x: this.player.x + 45, y: this.player.y + 15, bankAngle: 0, lastShotTime: 0 }
        ];

        this.showToast("⚡ 极客超频压力测试 (Benchmark) 启动...");
    }

    endBenchmark() {
        this.isBenchmarking = false;
        this.isRunning = false;

        // 计算平均值
        const avgFps = this.benchFrames > 0 ? (this.benchFpsTotal / this.benchFrames) : 60;
        const avgPhys = this.benchFrames > 0 ? (this.benchPhysDelayTotal / this.benchFrames) : 0.15;
        const avgDraw = this.benchFrames > 0 ? (this.benchDrawDelayTotal / this.benchFrames) : 0.20;

        // 性能得分公式：基于平均 FPS 和极低延迟加权
        // 基准 60fps 得分 6000，120fps 得分 12000；延迟每多 1ms 扣除 400 分
        let finalScore = Math.floor(avgFps * 100 - (avgPhys + avgDraw) * 400);
        if (finalScore < 1000) finalScore = 1000; // 保底分数

        // 评级
        let rank = "Superb";
        if (avgFps >= 110) rank = "⚡ Godlike";
        else if (avgFps >= 85) rank = "🚀 Ultra";
        else if (avgFps >= 55) rank = "💎 Premium";
        else rank = "⚠️ Standard";

        // 更新 UI 弹窗
        const benchScoreVal = document.getElementById('benchScoreVal');
        const benchFpsVal = document.getElementById('benchFpsVal');
        const benchPhysVal = document.getElementById('benchPhysVal');
        const benchDrawVal = document.getElementById('benchDrawVal');
        const benchModal = document.getElementById('benchmarkModal');

        if (benchScoreVal) benchScoreVal.innerHTML = `${finalScore} <span class="text-[10px] text-cyan-500 font-extrabold uppercase tracking-widest">${rank}</span>`;
        if (benchFpsVal) benchFpsVal.innerText = `${avgFps.toFixed(1)} Hz`;
        if (benchPhysVal) benchPhysVal.innerText = `${avgPhys.toFixed(2)} ms`;
        if (benchDrawVal) benchDrawVal.innerText = `${avgDraw.toFixed(2)} ms`;

        if (benchModal) benchModal.classList.remove('hidden');
        sfx.playPowerup();
    }

    closeBenchmarkReport() {
        const benchModal = document.getElementById('benchmarkModal');
        if (benchModal) benchModal.classList.add('hidden');
        this.showMenu();
    }
}
