// ⚡ 《星海猎手 V6：星能折跃与超维涂装》主线程桥接与加载入口
window.onload = function() {
    const canvas = document.getElementById('gameCanvas');
    let useWorker = false;
    let worker = null;
    
    // 检查浏览器对 OffscreenCanvas 以及 Web Worker 的支持情况
    if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker === 'function') {
        try {
            // 尝试创建 Web Worker 实例 (使用本地路径，以便 CORS 拦截时能被 catch 捕获)
            worker = new Worker('js/game_worker.js');
            useWorker = true;
        } catch (e) {
            console.warn("⚠️ Web Worker CORS restrict or security sandbox blocked. Auto fallback to main thread. Error details:", e);
            useWorker = false;
        }
    } else {
        console.warn("⚠️ Browser does not support OffscreenCanvas or Web Workers. Fallback to main thread.");
    }
    
    // 如果启用多线程 Worker 模式
    if (useWorker && worker) {
        console.log("⚡ Web Worker Dual-Threaded Mode activated successfully! OffscreenCanvas transferred.");
        
        // 转移 Canvas 控制权给 Web Worker
        const offscreen = canvas.transferControlToOffscreen();
        
        // 主线程缩放比例变量与 resize 监听器
        let scaleX = 1;
        let scaleY = 1;
        
        function updateMainScale() {
            const container = document.getElementById('canvas-container');
            const width = container.clientWidth;
            const height = container.clientHeight;
            const targetRatio = 9 / 16;
            const currentRatio = width / height;
            
            let renderWidth, renderHeight;
            if (currentRatio > targetRatio) {
                renderHeight = height;
                renderWidth = height * targetRatio;
            } else {
                renderWidth = width;
                renderHeight = width / targetRatio;
            }
            
            // 物理居中并重设 DOM Canvas 的 CSS 样式，保持和单线程一致
            canvas.style.position = 'absolute';
            canvas.style.left = `${(width - renderWidth) / 2}px`;
            canvas.style.top = `${(height - renderHeight) / 2}px`;
            canvas.style.width = `${renderWidth}px`;
            canvas.style.height = `${renderHeight}px`;
            
            scaleX = renderWidth / 540; // 逻辑宽度 = 540
            scaleY = renderHeight / 960; // 逻辑高度 = 960
            
            worker.postMessage({
                type: 'resize',
                width: renderWidth,
                height: renderHeight
            });
        }
        
        // 从 localStorage 中读取本地持久化状态数据
        let mainUnlockedSkins = JSON.parse(localStorage.getItem('space_unlocked_skins') || '["default"]');
        let mainCurrentSkin = localStorage.getItem('space_current_skin') || 'default';
        let mainBestScore = parseInt(localStorage.getItem('space_best_score') || '0');
        let mainScrap = 0;
        let mainHangar = { turretLevel: 0, engineLevel: 0, wingsLevel: 0 };
        
        // 发送 init 初始化消息给 Worker 线程并转移 Canvas
        worker.postMessage({
            type: 'init',
            canvas: offscreen,
            width: canvas.width,
            height: canvas.height,
            unlockedSkins: mainUnlockedSkins,
            currentSkin: mainCurrentSkin,
            bestScore: mainBestScore
        }, [offscreen]);
        
        window.addEventListener('resize', updateMainScale);
        updateMainScale();
        
        // 统一小 Toast 弹框提示
        let mainToastTimeout = null;
        function mainShowToast(text) {
            const toast = document.getElementById('toastMessage');
            if (toast) {
                toast.innerText = text;
                toast.style.opacity = '1';
                clearTimeout(mainToastTimeout);
                mainToastTimeout = setTimeout(() => {
                    toast.style.opacity = '0';
                }, 1500);
            }
        }
        
        // 极客级无缝 Hangar UI 升级函数
        function updateMainHangarUI() {
            document.getElementById('shopScrapText').innerText = mainScrap;
            
            const buyTurretBtn = document.getElementById('buyTurretBtn');
            const turretLevelText = document.getElementById('turretLevelText');
            if (mainHangar.turretLevel >= 3) {
                turretLevelText.innerText = `[MAX • 级3]`;
                buyTurretBtn.innerText = "已满级";
                buyTurretBtn.disabled = true;
            } else {
                const cost = 50 + mainHangar.turretLevel * 30;
                turretLevelText.innerText = mainHangar.turretLevel > 0 ? `[级${mainHangar.turretLevel}]` : "未装备";
                buyTurretBtn.innerText = `升级: ${cost} 废料`;
                buyTurretBtn.disabled = mainScrap < cost;
            }

            const buyEngineBtn = document.getElementById('buyEngineBtn');
            const engineLevelText = document.getElementById('engineLevelText');
            if (mainHangar.engineLevel >= 3) {
                engineLevelText.innerText = `[MAX • 级3]`;
                buyEngineBtn.innerText = "已满级";
                buyEngineBtn.disabled = true;
            } else {
                const cost = 40 + mainHangar.engineLevel * 25;
                engineLevelText.innerText = mainHangar.engineLevel > 0 ? `[级${mainHangar.engineLevel}]` : "未装备";
                buyEngineBtn.innerText = `升级: ${cost} 废料`;
                buyEngineBtn.disabled = mainScrap < cost;
            }

            const buyWingsBtn = document.getElementById('buyWingsBtn');
            const wingsLevelText = document.getElementById('wingsLevelText');
            if (mainHangar.wingsLevel >= 1) {
                wingsLevelText.innerText = `[MAX • 已激活]`;
                buyWingsBtn.innerText = "已装配";
                buyWingsBtn.disabled = true;
            } else {
                wingsLevelText.innerText = "未装备";
                buyWingsBtn.innerText = `购买: 60 废料`;
                buyWingsBtn.disabled = mainScrap < 60;
            }

            const skins = [
                { id: 'void', cost: 80, textId: 'skinVoidText', btnId: 'buySkinVoidBtn', name: '星渊幻影' },
                { id: 'thunder', cost: 100, textId: 'skinThunderText', btnId: 'buySkinThunderBtn', name: '超维雷霆' },
                { id: 'imperial', cost: 120, textId: 'skinImperialText', btnId: 'buySkinImperialBtn', name: '帝皇余晖' }
            ];

            skins.forEach(s => {
                const txt = document.getElementById(s.textId);
                const btn = document.getElementById(s.btnId);
                if (!txt || !btn) return;

                if (mainCurrentSkin === s.id) {
                    txt.innerText = `[使用中 • 极效]`;
                    txt.className = txt.className.replace('text-gray-500', '').trim() + ' text-emerald-400 font-bold';
                    btn.innerText = "使用中";
                    btn.disabled = true;
                    btn.className = btn.className.replace(/bg-\w+-600/, 'bg-emerald-600');
                } else if (mainUnlockedSkins.includes(s.id)) {
                    txt.innerText = `[已解锁]`;
                    txt.className = txt.className.replace('text-emerald-400', '').trim() + ' text-gray-400';
                    btn.innerText = "装配";
                    btn.disabled = false;
                    const color = s.id === 'void' ? 'fuchsia' : (s.id === 'thunder' ? 'yellow' : 'amber');
                    btn.className = btn.className.replace(/bg-\w+-600/, `bg-${color}-600`);
                } else {
                    txt.innerText = "未解锁";
                    txt.className = txt.className.replace('text-emerald-400', '').trim() + ' text-gray-500';
                    btn.innerText = `解锁: ${s.cost} 废料`;
                    btn.disabled = mainScrap < s.cost;
                    const color = s.id === 'void' ? 'fuchsia' : (s.id === 'thunder' ? 'yellow' : 'amber');
                    btn.className = btn.className.replace(/bg-\w+-600/, `bg-${color}-600`);
                }
            });
        }

        function buyMainModule(type) {
            if (type === 'turret') {
                const cost = 50 + mainHangar.turretLevel * 30;
                if (mainScrap >= cost && mainHangar.turretLevel < 3) {
                    mainScrap -= cost;
                    mainHangar.turretLevel++;
                    sfx.playPowerup();
                    mainShowToast(`🛠 纳米伴飞僚机装配成功！当前僚机等级/数量: ${mainHangar.turretLevel}`);
                }
            } else if (type === 'engine') {
                const cost = 40 + mainHangar.engineLevel * 25;
                if (mainScrap >= cost && mainHangar.engineLevel < 3) {
                    mainScrap -= cost;
                    mainHangar.engineLevel++;
                    sfx.playPowerup();
                    mainShowToast(`🛠 等离子尾喷升级成功！当前等级: ${mainHangar.engineLevel}`);
                }
            } else if (type === 'wings') {
                if (mainScrap >= 60 && mainHangar.wingsLevel < 1) {
                    mainScrap -= 60;
                    mainHangar.wingsLevel = 1;
                    sfx.playPowerup();
                    mainShowToast("🛠 切割能盾翼配置成功！");
                }
            }
            updateMainHangarUI();
            
            // 同步升级配置给 Web Worker 线程
            worker.postMessage({
                type: 'upgrade',
                scrap: mainScrap,
                hangar: mainHangar,
                unlockedSkins: mainUnlockedSkins,
                currentSkin: mainCurrentSkin
            });
        }

        function interactMainSkin(skinId) {
            const cost = skinId === 'void' ? 80 : (skinId === 'thunder' ? 100 : 120);
            if (mainUnlockedSkins.includes(skinId)) {
                mainCurrentSkin = skinId;
                localStorage.setItem('space_current_skin', skinId);
                sfx.playSkinSwitch();
                const names = { void: '🌌 星渊幻影', thunder: '⚡ 超维雷霆', imperial: '✨ 帝皇余晖' };
                mainShowToast(`🎨 成功切换机体涂装为: ${names[skinId] || skinId}`);
            } else {
                if (mainScrap >= cost) {
                    mainScrap -= cost;
                    mainUnlockedSkins.push(skinId);
                    localStorage.setItem('space_unlocked_skins', JSON.stringify(mainUnlockedSkins));
                    mainCurrentSkin = skinId;
                    localStorage.setItem('space_current_skin', skinId);
                    sfx.playPowerup();
                    const names = { void: '🌌 星渊幻影', thunder: '⚡ 超维雷霆', imperial: '✨ 帝皇余晖' };
                    mainShowToast(`✨ 成功解锁并装配超维机体: ${names[skinId] || skinId}`);
                } else {
                    mainShowToast("❌ 合金废料不足，无法解锁！");
                }
            }
            updateMainHangarUI();

            // 同步升级及皮肤状态给 Web Worker 线程
            worker.postMessage({
                type: 'upgrade',
                scrap: mainScrap,
                hangar: mainHangar,
                unlockedSkins: mainUnlockedSkins,
                currentSkin: mainCurrentSkin
            });
        }
        
        // 双击得分作弊器桥接 (Cheat Button)
        const scoreText = document.getElementById('scoreText');
        if (scoreText) {
            scoreText.addEventListener('dblclick', () => {
                worker.postMessage({ type: 'keydown', code: 'KeyK' });
                setTimeout(() => worker.postMessage({ type: 'keyup', code: 'KeyK' }), 50);
            });
        }
        
        // 监听子线程 Worker 发来的消息
        worker.onmessage = function(e) {
            const msg = e.data;
            switch (msg.type) {
                case 'ready':
                    console.log("⚡ Web Worker ready.");
                    break;
                case 'hud':
                    // 更新主线程 HUD
                    document.getElementById('scoreText').innerText = String(msg.score).padStart(6, '0');
                    document.getElementById('scrapText').innerText = msg.scrap;
                    document.getElementById('waveText').innerText = msg.wave;
                    document.getElementById('hpBar').style.width = `${msg.playerHp}%`;
                    
                    const shieldPercent = msg.shieldTime > 0 ? (msg.shieldTime / 8000) * 100 : 0;
                    document.getElementById('shieldBar').style.width = `${shieldPercent}%`;
                    document.getElementById('bombChargeBar').style.width = `${msg.bombCharge}%`;
                    
                    // 同步废料字段
                    mainScrap = msg.scrap;
                    
                    // 晶核状态与共鸣名称渲染
                    const slot1UI = document.getElementById('slot1');
                    const slot2UI = document.getElementById('slot2');
                    const synergyNameUI = document.getElementById('synergyName');
                    
                    const labelMap = { 
                        'EM': 'EM', 
                        'Frost': 'FR', 
                        'Fire': 'FI', 
                        'Rad': 'RA' 
                    };
                    const colorMap = {
                        'EM': 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20 shadow-sm shadow-cyan-500/25',
                        'Frost': 'border-blue-500/50 text-blue-400 bg-blue-950/20 shadow-sm shadow-blue-500/25',
                        'Fire': 'border-rose-500/50 text-rose-400 bg-rose-950/20 shadow-sm shadow-rose-500/25',
                        'Rad': 'border-amber-500/50 text-amber-400 bg-amber-950/20 shadow-sm shadow-amber-500/25'
                    };

                    [slot1UI, slot2UI].forEach((el, idx) => {
                        if (!el) return;
                        const chip = idx === 0 ? msg.slot1 : msg.slot2;
                        if (chip) {
                            el.innerText = labelMap[chip] || chip;
                            el.className = `px-1.5 h-6 min-w-[24px] rounded-lg bg-gray-950 border flex items-center justify-center text-[10px] font-extrabold tracking-wider transition-all duration-300 ${colorMap[chip] || 'border-cyan-500/30 text-cyan-400 bg-cyan-950/10'}`;
                        } else {
                            el.innerText = "空";
                            el.className = 'px-1.5 h-6 min-w-[24px] rounded-lg bg-gray-950 border border-white/10 flex items-center justify-center text-[10px] text-gray-500 font-bold transition-all';
                        }
                    });

                    if (synergyNameUI) {
                        if (msg.synergyName) {
                            synergyNameUI.innerText = msg.synergyName;
                            synergyNameUI.className = 'text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-400 to-indigo-400 animate-pulse truncate shrink-0 max-w-[85px] sm:max-w-[120px]';
                        } else {
                            synergyNameUI.innerText = "基础机载激光";
                            synergyNameUI.className = 'text-[9px] font-bold text-cyan-400 truncate shrink-0 max-w-[85px] sm:max-w-[120px]';
                        }
                    }
                    
                    // Boss HP HUD 联动
                    const bossHpGroup = document.getElementById('bossHpGroup');
                    if (bossHpGroup) {
                        if (msg.bossActive) {
                            bossHpGroup.classList.remove('hidden');
                            const bossPercent = msg.bossMaxHp > 0 ? Math.ceil((msg.bossHp / msg.bossMaxHp) * 100) : 0;
                            document.getElementById('bossMainPercent').innerText = `${bossPercent}%`;
                            document.getElementById('bossMainHpBar').style.width = `${bossPercent}%`;
                            
                            if (msg.bossType === 'worm') {
                                document.getElementById('bossMainTitle').innerText = "💀 吞噬蠕虫 (Asteroid Devourer)";
                                document.getElementById('partHpShield').innerText = "未激活";
                                document.getElementById('partBarShield').style.width = "0%";
                                document.getElementById('partHpLeft').innerText = "未激活";
                                document.getElementById('partBarLeft').style.width = "0%";
                                document.getElementById('partHpRight').innerText = "未激活";
                                document.getElementById('partBarRight').style.width = "0%";
                            } else {
                                document.getElementById('bossMainTitle').innerText = "⚠️ 星际掠夺者号 (Phase Reaver)";
                                if (msg.bossParts) {
                                    document.getElementById('partHpShield').innerText = `${Math.ceil(msg.bossParts.shield * 100)}%`;
                                    document.getElementById('partBarShield').style.width = `${msg.bossParts.shield * 100}%`;
                                    document.getElementById('partHpLeft').innerText = `${Math.ceil(msg.bossParts.left * 100)}%`;
                                    document.getElementById('partBarLeft').style.width = `${msg.bossParts.left * 100}%`;
                                    document.getElementById('partHpRight').innerText = `${Math.ceil(msg.bossParts.right * 100)}%`;
                                    document.getElementById('partBarRight').style.width = `${msg.bossParts.right * 100}%`;
                                }
                            }
                        } else {
                            bossHpGroup.classList.add('hidden');
                        }
                    }
                    break;
                    
                case 'sound':
                    // 在主线程播放合成声效
                    if (sfx[msg.method]) {
                        sfx[msg.method](...(msg.args || []));
                    }
                    break;

                case 'soundBatch':
                    // P1: 单帧聚合的多个 sfx 调用，减少跨线程往返
                    if (msg.calls) {
                        for (let bi = 0; bi < msg.calls.length; bi++) {
                            const call = msg.calls[bi];
                            if (sfx[call.method]) {
                                sfx[call.method](...(call.args || []));
                            }
                        }
                    }
                    break;
                    
                case 'toast':
                    mainShowToast(msg.text);
                    break;
                    
                case 'saveLocalStorage':
                    localStorage.setItem(msg.key, msg.val);
                    if (msg.key === 'space_best_score') mainBestScore = parseInt(msg.val);
                    if (msg.key === 'space_current_skin') mainCurrentSkin = msg.val;
                    if (msg.key === 'space_unlocked_skins') mainUnlockedSkins = JSON.parse(msg.val);
                    break;
                    
                case 'gameOver':
                    document.getElementById('endScore').innerText = String(msg.score).padStart(6, '0');
                    document.getElementById('endWave').innerText = msg.wave;
                    document.getElementById('endBest').innerText = String(msg.bestScore).padStart(6, '0');
                    document.getElementById('gameOverScreen').classList.remove('hidden');
                    break;
                    
                case 'openHangar':
                    mainScrap = msg.scrap;
                    mainHangar = msg.hangar;
                    mainUnlockedSkins = msg.unlockedSkins;
                    mainCurrentSkin = msg.currentSkin;
                    document.getElementById('workshopScreen').classList.remove('hidden');
                    updateMainHangarUI();
                    break;
                    
                case 'togglePause':
                    const pauseScreen = document.getElementById('pauseScreen');
                    if (pauseScreen) {
                        if (msg.isPaused) {
                            pauseScreen.classList.remove('hidden');
                        } else {
                            pauseScreen.classList.add('hidden');
                        }
                    }
                    break;
                    
                case 'endBenchmark':
                    const metrics = msg.metrics;
                    const benchScoreVal = document.getElementById('benchScoreVal');
                    const benchFpsVal = document.getElementById('benchFpsVal');
                    const benchPhysVal = document.getElementById('benchPhysVal');
                    const benchDrawVal = document.getElementById('benchDrawVal');
                    const benchModal = document.getElementById('benchmarkModal');
                    
                    if (benchScoreVal) benchScoreVal.innerHTML = `${metrics.finalScore} <span class="text-[10px] text-cyan-500 font-extrabold uppercase tracking-widest">${metrics.rank}</span>`;
                    if (benchFpsVal) benchFpsVal.innerText = `${metrics.avgFps.toFixed(1)} Hz`;
                    if (benchPhysVal) benchPhysVal.innerText = `${metrics.avgPhys.toFixed(2)} ms`;
                    if (benchDrawVal) benchDrawVal.innerText = `${metrics.avgDraw.toFixed(2)} ms`;
                    
                    if (benchModal) benchModal.classList.remove('hidden');
                    sfx.playPowerup();
                    break;
            }
        };
        
        // 选择操控模式功能桥接
        let mainControlMode = 'touch';
        function setMainControlMode(mode) {
            mainControlMode = mode;
            worker.postMessage({ type: 'controlMode', mode: mode });
            
            const touchBtn = document.getElementById('selectTouchBtn');
            const keyBtn = document.getElementById('selectKeyBtn');
            if (touchBtn && keyBtn) {
                if (mode === 'touch') {
                    touchBtn.classList.add('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
                    keyBtn.classList.remove('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
                } else {
                    keyBtn.classList.add('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
                    touchBtn.classList.remove('neon-border-cyan', 'border-cyan-500/50', 'bg-cyan-950/20');
                }
            }
            mainShowToast(mode === 'touch' ? "已选择：指尖滑动连发模式" : "已选择：键盘虚拟按键模式");
        }
        
        // 绑定大厅与菜单按钮
        document.getElementById('selectTouchBtn').addEventListener('click', () => setMainControlMode('touch'));
        document.getElementById('selectKeyBtn').addEventListener('click', () => setMainControlMode('keyboard'));
        document.getElementById('startPlayBtn').addEventListener('click', () => {
            sfx.init();
            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('hud').classList.remove('opacity-0');
            
            const mobileControls = document.getElementById('mobileControls');
            if (mobileControls) {
                if (mainControlMode === 'keyboard' && ('ontouchstart' in window)) {
                    mobileControls.classList.remove('hidden');
                } else {
                    mobileControls.classList.add('hidden');
                }
            }
            
            worker.postMessage({ type: 'startGame' });
        });
        
        // 暂停菜单按键监听
        document.getElementById('resumeBtn').addEventListener('click', () => {
            document.getElementById('pauseScreen').classList.add('hidden');
            worker.postMessage({ type: 'resumeGame' });
        });
        document.getElementById('restartFromPauseBtn').addEventListener('click', () => {
            document.getElementById('pauseScreen').classList.add('hidden');
            worker.postMessage({ type: 'resetGame', shouldStart: true });
        });
        document.getElementById('retryBtn').addEventListener('click', () => {
            document.getElementById('gameOverScreen').classList.add('hidden');
            worker.postMessage({ type: 'resetGame', shouldStart: true });
        });
        document.getElementById('backToMenuBtn').addEventListener('click', () => {
            document.getElementById('pauseScreen').classList.add('hidden');
            document.getElementById('gameOverScreen').classList.add('hidden');
            document.getElementById('startScreen').classList.remove('hidden');
            document.getElementById('hud').classList.add('opacity-0');
            document.getElementById('mobileControls').classList.add('hidden');
            worker.postMessage({ type: 'resetGame', shouldStart: false });
        });
        
        // 声效/核弹/快捷键绑定
        document.getElementById('controlToggleBtn').addEventListener('click', () => {
            const nextMode = mainControlMode === 'touch' ? 'keyboard' : 'touch';
            setMainControlMode(nextMode);
            const mobileControls = document.getElementById('mobileControls');
            if (mobileControls) {
                if (nextMode === 'keyboard') {
                    mobileControls.classList.remove('hidden');
                } else {
                    mobileControls.classList.add('hidden');
                }
            }
        });
        document.getElementById('soundToggleBtn').addEventListener('click', (e) => {
            const muted = sfx.toggleMute();
            const icon = e.currentTarget.querySelector('i');
            if (muted) {
                icon.className = 'fa-solid fa-volume-xmark';
                mainShowToast("音效已静音");
            } else {
                icon.className = 'fa-solid fa-volume-high';
                sfx.playShoot();
                mainShowToast("音效已开启");
            }
        });
        document.getElementById('bombBtn').addEventListener('click', () => {
            worker.postMessage({ type: 'triggerEomBomb' });
        });
        
        // 改装整备车间动作
        document.getElementById('buyTurretBtn').addEventListener('click', () => buyMainModule('turret'));
        document.getElementById('buyEngineBtn').addEventListener('click', () => buyMainModule('engine'));
        document.getElementById('buyWingsBtn').addEventListener('click', () => buyMainModule('wings'));
        document.getElementById('buySkinVoidBtn').addEventListener('click', () => interactMainSkin('void'));
        document.getElementById('buySkinThunderBtn').addEventListener('click', () => interactMainSkin('thunder'));
        document.getElementById('buySkinImperialBtn').addEventListener('click', () => interactMainSkin('imperial'));
        document.getElementById('exitWorkshopBtn').addEventListener('click', () => {
            document.getElementById('workshopScreen').classList.add('hidden');
            worker.postMessage({ type: 'exitHangar' });
        });
        
        // 性能跑分 (Benchmark) 按钮动作
        const startBench = document.getElementById('startBenchmarkBtn');
        if (startBench) {
            startBench.addEventListener('click', () => {
                document.getElementById('startScreen').classList.add('hidden');
                document.getElementById('pauseScreen').classList.add('hidden');
                document.getElementById('gameOverScreen').classList.add('hidden');
                document.getElementById('workshopScreen').classList.add('hidden');
                const benchModal = document.getElementById('benchmarkModal');
                if (benchModal) benchModal.classList.add('hidden');
                document.getElementById('hud').classList.remove('opacity-0');
                
                mainShowToast("⚡ 极客超频压力测试 (Benchmark) 启动...");
                worker.postMessage({ type: 'startBenchmark' });
            });
        }
        const pauseBench = document.getElementById('pauseBenchmarkBtn');
        if (pauseBench) {
            pauseBench.addEventListener('click', () => {
                document.getElementById('pauseScreen').classList.add('hidden');
                worker.postMessage({ type: 'startBenchmark' });
            });
        }
        const closeBench = document.getElementById('benchCloseBtn');
        if (closeBench) {
            closeBench.addEventListener('click', () => {
                document.getElementById('benchmarkModal').classList.add('hidden');
                document.getElementById('startScreen').classList.remove('hidden');
                document.getElementById('hud').classList.add('opacity-0');
            });
        }
        const retryBench = document.getElementById('benchRetryBtn');
        if (retryBench) {
            retryBench.addEventListener('click', () => {
                document.getElementById('benchmarkModal').classList.add('hidden');
                worker.postMessage({ type: 'startBenchmark' });
            });
        }
        
        // 键盘事件映射到 Worker 线程
        window.addEventListener('keydown', (e) => {
            worker.postMessage({ type: 'keydown', code: e.code });
            if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            worker.postMessage({ type: 'keyup', code: e.code });
        });
        
        // 移动端虚拟按键映射
        const leftKeyBtn = document.getElementById('leftKey');
        const rightKeyBtn = document.getElementById('rightKey');
        const fireKeyBtn = document.getElementById('fireKey');
        if (leftKeyBtn && rightKeyBtn && fireKeyBtn) {
            const handleLeftStart = (e) => { e.preventDefault(); worker.postMessage({ type: 'keydown', code: 'ArrowLeft' }); };
            const handleLeftEnd = () => worker.postMessage({ type: 'keyup', code: 'ArrowLeft' });
            const handleRightStart = (e) => { e.preventDefault(); worker.postMessage({ type: 'keydown', code: 'ArrowRight' }); };
            const handleRightEnd = () => worker.postMessage({ type: 'keyup', code: 'ArrowRight' });
            const handleFireStart = (e) => { e.preventDefault(); worker.postMessage({ type: 'keydown', code: 'Space' }); };
            const handleFireEnd = () => worker.postMessage({ type: 'keyup', code: 'Space' });
            
            leftKeyBtn.addEventListener('touchstart', handleLeftStart, { passive: false });
            leftKeyBtn.addEventListener('touchend', handleLeftEnd);
            rightKeyBtn.addEventListener('touchstart', handleRightStart, { passive: false });
            rightKeyBtn.addEventListener('touchend', handleRightEnd);
            fireKeyBtn.addEventListener('touchstart', handleFireStart, { passive: false });
            fireKeyBtn.addEventListener('touchend', handleFireEnd);
            
            leftKeyBtn.addEventListener('mousedown', handleLeftStart);
            leftKeyBtn.addEventListener('mouseup', handleLeftEnd);
            rightKeyBtn.addEventListener('mousedown', handleRightStart);
            rightKeyBtn.addEventListener('mouseup', handleRightEnd);
            fireKeyBtn.addEventListener('mousedown', handleFireStart);
            fireKeyBtn.addEventListener('mouseup', handleFireEnd);
        }
        
        // 触控滑动拖动输入转发
        let touchStartX = 0;
        let touchStartY = 0;
        let isDragging = false;
        
        canvas.addEventListener('touchstart', (e) => {
            isDragging = true;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches[0];
            const dx = (touch.clientX - touchStartX) / scaleX;
            const dy = (touch.clientY - touchStartY) / scaleY;
            
            worker.postMessage({ type: 'move', dx: dx, dy: dy });
            
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }, { passive: false });

        canvas.addEventListener('touchend', () => { isDragging = false; });
        
        // 鼠标拖拽输入转发
        let isMouseDragging = false;
        let mouseStartX = 0;
        let mouseStartY = 0;

        canvas.addEventListener('mousedown', (e) => {
            isMouseDragging = true;
            mouseStartX = e.clientX;
            mouseStartY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDragging) return;
            const dx = (e.clientX - mouseStartX) / scaleX;
            const dy = (e.clientY - mouseStartY) / scaleY;
            
            worker.postMessage({ type: 'move', dx: dx, dy: dy });
            
            mouseStartX = e.clientX;
            mouseStartY = e.clientY;
        });

        window.addEventListener('mouseup', () => { isMouseDragging = false; });
        
        // 设置最佳得分
        const bestScoreText = document.getElementById('bestScoreText');
        if (bestScoreText) bestScoreText.innerText = String(mainBestScore).padStart(6, '0');
        
        // 挂载全局调试实例
        window.gameWorker = worker;
        
        return; // 完成多线程启动，终止 onload 函数
    }

    // 优雅优雅降级：主线程单线程运行模式 (CORS 本地沙盒被拦截或不支持时自动无缝降级)
    console.warn("⚠️ Web Worker CORS restrict or not supported, auto fallback to Main Thread seamlessly!");
    const engine = new GameEngine();
    window.gameEngine = engine; // 挂载全局调试实例

    let lastTime = performance.now();
    function gameLoop(currentTime) {
        requestAnimationFrame(gameLoop);
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

        engine.update(deltaTime);
        engine.draw();
    }

    requestAnimationFrame(gameLoop);
};
