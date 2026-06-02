// ⚡ 《星海猎手 V7：机载超维构装与深空天象》主线程桥接与加载入口
// 资源缓存版本号 — 同步于 space_shooter.html 的所有 ?v= 查询参数。
// Worker 链 (game_worker.js + importScripts 的 6 个引擎文件) 通过 self.location.search 自动继承该版本，
// 后续 bump 仅需改本常量 + HTML 的 ?v= 两处即可全量失效旧缓存。
const ASSET_VERSION = '7.0.18';

window.onload = function() {
    const canvas = document.getElementById('gameCanvas');
    let useWorker = false;
    let worker = null;

    // 检查浏览器对 OffscreenCanvas 以及 Web Worker 的支持情况
    if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker === 'function') {
        try {
            // 尝试创建 Web Worker 实例 (使用本地路径，以便 CORS 拦截时能被 catch 捕获)
            worker = new Worker('js/game_worker.js?v=' + ASSET_VERSION);
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

            sendHudClearance();
        }

        // 测算 HUD 在 canvas 上的实际占位高度（逻辑坐标），上报给 Worker 让 boss 位置自适应让位
        // 关键：临时展开 bossHpGroup 以保证测得的是 BOSS 战时的最大 HUD 高度
        const hudEl = document.getElementById('hud');
        const bossHpGroupEl = document.getElementById('bossHpGroup');
        function sendHudClearance() {
            if (!hudEl || !bossHpGroupEl) return;
            const canvasRect = canvas.getBoundingClientRect();
            if (canvasRect.height <= 0) return;
            const wasHudHidden = hudEl.classList.contains('opacity-0');
            const wasBossHidden = bossHpGroupEl.classList.contains('hidden');
            // 临时让 HUD 进入"满高"状态完成一次测量
            if (wasHudHidden) hudEl.classList.remove('opacity-0');
            if (wasBossHidden) bossHpGroupEl.classList.remove('hidden');
            const hudRect = hudEl.getBoundingClientRect();
            if (wasBossHidden) bossHpGroupEl.classList.add('hidden');
            if (wasHudHidden) hudEl.classList.add('opacity-0');
            const hudBottomCss = hudRect.bottom - canvasRect.top;
            const hudLogicalBottom = hudBottomCss * (960 / canvasRect.height);
            worker.postMessage({ type: 'hudClearance', y: hudLogicalBottom });
        }
        
        // 从 localStorage 中读取本地持久化状态数据
        const MAIN_SKIN_IDS = ['default', 'void', 'thunder', 'imperial'];
        let mainUnlockedSkins = safeReadJSON('space_unlocked_skins', ['default']);
        if (!Array.isArray(mainUnlockedSkins)) mainUnlockedSkins = ['default'];
        let mainCurrentSkin = safeReadString('space_current_skin', 'default');
        function refreshMainSkinState() {
            const storedSkins = safeReadJSON('space_unlocked_skins', ['default']);
            mainUnlockedSkins = Array.isArray(storedSkins)
                ? storedSkins.filter(id => MAIN_SKIN_IDS.includes(id))
                : ['default'];
            if (!mainUnlockedSkins.includes('default')) mainUnlockedSkins.unshift('default');
            const storedSkin = safeReadString('space_current_skin', 'default');
            mainCurrentSkin = mainUnlockedSkins.includes(storedSkin) ? storedSkin : 'default';
            localStorage.setItem('space_unlocked_skins', JSON.stringify(mainUnlockedSkins));
            localStorage.setItem('space_current_skin', mainCurrentSkin);
            return mainCurrentSkin;
        }
        refreshMainSkinState();
        let mainBestScore = safeReadInt('space_best_score', 0);
        let mainScrap = 0;
        let mainHangar = { turretLevel: 0, engineLevel: 0, wingsLevel: 0 };
        let mainTalents = (typeof loadTalents === 'function') ? loadTalents() : { A: 0, B: 0, C: 0, D: 0, E: 0 };
        let mainPermanentCores = (typeof safeReadPermanentCores === 'function') ? safeReadPermanentCores() : 0;
        
        // 发送 init 初始化消息给 Worker 线程并转移 Canvas
        worker.postMessage({
            type: 'init',
            canvas: offscreen,
            width: canvas.width,
            height: canvas.height,
            unlockedSkins: mainUnlockedSkins,
            currentSkin: mainCurrentSkin,
            bestScore: mainBestScore,
            talents: mainTalents,
            permanentCores: mainPermanentCores
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

        function recordLocalMatchHistory(match) {
            try {
                const key = 'space_match_history';
                const raw = localStorage.getItem(key);
                const list = raw ? JSON.parse(raw) : [];
                const history = Array.isArray(list) ? list : [];
                history.unshift({
                    id: `match_${Date.now().toString(36)}`,
                    score: Math.max(0, Math.floor(Number(match.score) || 0)),
                    wave: Math.max(1, Math.floor(Number(match.wave) || 1)),
                    skin: match.skin || 'default',
                    isNewBest: !!match.isNewBest,
                    permanentCoresEarned: Math.max(0, Math.floor(Number(match.permanentCoresEarned) || 0)),
                    playedAt: new Date().toISOString()
                });
                localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
            } catch (_) {}
        }

        window.addEventListener('starsea-leaderboard-sync-error', function (event) {
            const message = event && event.detail && event.detail.message ? ': ' + event.detail.message : '';
            mainShowToast('云端同步失败，请至排行榜页手动同步' + message);
        });
        
        // v2 升级卡更新器：联动等级点 / level-tag / button / is-maxed 卡态
        function renderUpgradeCard(cardId, progressId, tagId, btnId, level, maxLevel, cost, scrap, labels) {
            const card = document.getElementById(cardId);
            const progress = document.getElementById(progressId);
            const tag = document.getElementById(tagId);
            const btn = document.getElementById(btnId);
            if (!card || !progress || !tag || !btn) return;

            // 等级点：第 i 个 dot 仅在 i < level 时点亮
            const dots = progress.querySelectorAll('.dot');
            for (let i = 0; i < dots.length; i++) {
                if (i < level) dots[i].classList.add('active');
                else dots[i].classList.remove('active');
            }

            if (level >= maxLevel) {
                card.classList.add('is-maxed');
                tag.innerText = labels.maxed;
                btn.innerText = labels.btnMaxed;
                btn.disabled = true;
            } else {
                card.classList.remove('is-maxed');
                tag.innerText = level > 0 ? labels.leveled(level) : labels.locked;
                btn.innerText = labels.btnCost(cost);
                btn.disabled = scrap < cost;
            }
        }

        // 极客级无缝 Hangar UI 升级函数
        function updateMainHangarUI() {
            document.getElementById('shopScrapText').innerText = mainScrap;
            const permanentCoreText = document.getElementById('permanentCoreText');
            if (permanentCoreText) permanentCoreText.innerText = mainPermanentCores;

            renderUpgradeCard(
                'upgradeCardTurret', 'turretProgress', 'turretLevelText', 'buyTurretBtn',
                mainHangar.turretLevel, 3, 50 + mainHangar.turretLevel * 30, mainScrap,
                {
                    maxed: 'MAX · LV.3',
                    btnMaxed: '已满级',
                    leveled: (lv) => `LV.${lv}`,
                    locked: '未装备',
                    btnCost: (c) => `升级 · ${c}`
                }
            );

            renderUpgradeCard(
                'upgradeCardEngine', 'engineProgress', 'engineLevelText', 'buyEngineBtn',
                mainHangar.engineLevel, 3, 40 + mainHangar.engineLevel * 25, mainScrap,
                {
                    maxed: 'MAX · LV.3',
                    btnMaxed: '已满级',
                    leveled: (lv) => `LV.${lv}`,
                    locked: '未装备',
                    btnCost: (c) => `升级 · ${c}`
                }
            );

            renderUpgradeCard(
                'upgradeCardWings', 'wingsProgress', 'wingsLevelText', 'buyWingsBtn',
                mainHangar.wingsLevel, 1, 60, mainScrap,
                {
                    maxed: 'EQUIPPED',
                    btnMaxed: '已装配',
                    leveled: (lv) => `LV.${lv}`,
                    locked: '未装备',
                    btnCost: (c) => `购买 · ${c}`
                }
            );

            // v2 涂装卡：每张卡用 status chip + action button + 卡 is-equipped 三件套联动
            const skins = [
                { id: 'void',     cost: 80,  cardId: 'skinCardVoid',     textId: 'skinVoidText',     btnId: 'buySkinVoidBtn' },
                { id: 'thunder',  cost: 100, cardId: 'skinCardThunder',  textId: 'skinThunderText',  btnId: 'buySkinThunderBtn' },
                { id: 'imperial', cost: 120, cardId: 'skinCardImperial', textId: 'skinImperialText', btnId: 'buySkinImperialBtn' }
            ];

            skins.forEach(s => {
                const card = document.getElementById(s.cardId);
                const chip = document.getElementById(s.textId);
                const btn = document.getElementById(s.btnId);
                if (!card || !chip || !btn) return;

                if (mainCurrentSkin === s.id) {
                    card.classList.add('is-equipped');
                    chip.className = 'status-chip status-equipped';
                    chip.innerHTML = '<i class="fa-solid fa-circle-radiation text-[8px]"></i> EQUIPPED';
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-check-double text-[10px] mr-2"></i> 使用中';
                } else if (mainUnlockedSkins.includes(s.id)) {
                    card.classList.remove('is-equipped');
                    chip.className = 'status-chip status-unlocked';
                    chip.innerHTML = '<i class="fa-solid fa-circle-check text-[8px]"></i> Unlocked';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-rocket text-[10px] mr-2"></i> 装配涂装';
                } else {
                    card.classList.remove('is-equipped');
                    chip.className = 'status-chip status-locked';
                    chip.innerHTML = '<i class="fa-solid fa-lock text-[8px]"></i> Locked';
                    btn.disabled = mainPermanentCores < s.cost;
                    btn.innerHTML = `<span class="cost"><i class="fa-solid fa-gem text-cyan-300"></i> ${s.cost}</span> 解锁涂装`;
                }
            });

            // V7 先驱者永久天赋矩阵渲染
            if (typeof TALENT_DEFINITIONS !== 'undefined') {
                const talentLabels = {
                    maxed: 'MAX',
                    btnMaxed: '已点满',
                    leveled: (lv) => `LV.${lv}`,
                    locked: '未点亮',
                    btnCost: (c) => `点亮 · ${c}`
                };
                TALENT_DEFINITIONS.forEach(def => {
                    renderUpgradeCard(
                        `talentCard${def.id}`, `talentProgress${def.id}`, `talentLevelText${def.id}`, `buyTalent${def.id}Btn`,
                        mainTalents[def.id] || 0, def.maxLevel, def.cost, mainPermanentCores, talentLabels
                    );
                });
            }
        }

        function buyMainTalent(id) {
            if (typeof TALENT_DEFINITIONS === 'undefined') return;
            const def = TALENT_DEFINITIONS.find(t => t.id === id);
            if (!def) return;
            const lv = mainTalents[id] || 0;
            if (lv >= def.maxLevel) return;
            if (mainPermanentCores < def.cost) {
                mainShowToast("❌ 星核不足，无法点亮永久天赋！");
                return;
            }
            mainPermanentCores = savePermanentCores(mainPermanentCores - def.cost);
            mainTalents[id] = lv + 1;
            localStorage.setItem('space_v7_talents', JSON.stringify(mainTalents));
            sfx.playPowerup();
            mainShowToast(`🧬 永久天赋【${def.name}】已强化至 LV.${mainTalents[id]}！`);
            updateMainHangarUI();

            worker.postMessage({
                type: 'upgrade',
                scrap: mainScrap,
                hangar: mainHangar,
                unlockedSkins: mainUnlockedSkins,
                currentSkin: mainCurrentSkin,
                talents: mainTalents
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
                currentSkin: mainCurrentSkin,
                talents: mainTalents
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
                if (mainPermanentCores >= cost) {
                    mainPermanentCores = savePermanentCores(mainPermanentCores - cost);
                    mainUnlockedSkins.push(skinId);
                    localStorage.setItem('space_unlocked_skins', JSON.stringify(mainUnlockedSkins));
                    mainCurrentSkin = skinId;
                    localStorage.setItem('space_current_skin', skinId);
                    sfx.playPowerup();
                    const names = { void: '🌌 星渊幻影', thunder: '⚡ 超维雷霆', imperial: '✨ 帝皇余晖' };
                    mainShowToast(`✨ 成功解锁并装配超维机体: ${names[skinId] || skinId}`);
                } else {
                    mainShowToast("❌ 星核不足，无法解锁！");
                }
            }
            updateMainHangarUI();

            // 同步升级及皮肤状态给 Web Worker 线程
            worker.postMessage({
                type: 'upgrade',
                scrap: mainScrap,
                hangar: mainHangar,
                unlockedSkins: mainUnlockedSkins,
                currentSkin: mainCurrentSkin,
                talents: mainTalents
            });
        }
        
        // 双击得分作弊器桥接 — 用 click 计数器（400ms 内连点两次），desktop/touch 都生效，比 dblclick 在移动端更可靠
        const scoreCell = document.getElementById('scoreCell') || document.getElementById('scoreText');
        if (scoreCell) {
            let lastScoreTap = 0;
            const fireCheat = (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                const now = performance.now();
                if (now - lastScoreTap < 400) {
                    worker.postMessage({ type: 'keydown', code: 'KeyK' });
                    setTimeout(() => worker.postMessage({ type: 'keyup', code: 'KeyK' }), 50);
                    lastScoreTap = 0;
                } else {
                    lastScoreTap = now;
                }
            };
            scoreCell.addEventListener('click', fireCheat);
            scoreCell.addEventListener('touchend', (e) => {
                e.preventDefault(); // 防止触屏 ghost click 重复触发
                fireCheat(e);
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
                    const warpBarEl = document.getElementById('warpBar');
                    if (warpBarEl) warpBarEl.style.width = `${msg.warpCharge || 0}%`;

                    // V7: 同步局内等级与经验进度条
                    const hudLevelTextEl = document.getElementById('hudLevelText');
                    const expBarEl = document.getElementById('expBar');
                    const expPercentTextEl = document.getElementById('expPercentText');
                    if (hudLevelTextEl) hudLevelTextEl.innerText = msg.level || 1;
                    const expPercent = (msg.nextLevelExp > 0) ? (msg.exp / msg.nextLevelExp) * 100 : 0;
                    if (expBarEl) expBarEl.style.width = `${expPercent}%`;
                    if (expPercentTextEl) expPercentTextEl.innerText = `${Math.floor(expPercent)}%`;

                    // V7: 同步机载构装总览（快捷条 + 面板，若打开）
                    updateLoadoutUI(
                        msg.equippedMods || [],
                        [msg.slot1, msg.slot2].filter(Boolean),
                        msg.comboKey || ''
                    );

                    // 同步废料字段
                    mainScrap = msg.scrap;
                    
                    // 晶核状态与共鸣名称渲染
                    const slot1UI = document.getElementById('slot1');
                    const slot2UI = document.getElementById('slot2');
                    const synergyNameUI = document.getElementById('synergyName');
                    
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
                            el.innerText = formatElementChipLabel(chip);
                            el.className = `px-1.5 h-6 min-w-[24px] rounded-lg bg-gray-950 border flex items-center justify-center text-[10px] font-extrabold tracking-wider transition-all duration-300 ${colorMap[chip] || 'border-cyan-500/30 text-cyan-400 bg-cyan-950/10'}`;
                        } else {
                            el.innerText = "空";
                            el.className = 'px-1.5 h-6 min-w-[24px] rounded-lg bg-gray-950 border border-white/10 flex items-center justify-center text-[10px] text-gray-500 font-bold transition-all';
                        }
                    });

                    if (synergyNameUI) {
                        const displayName = msg.synergyName || '基础高频激光';
                        synergyNameUI.innerText = displayName;
                        synergyNameUI.title = displayName;
                        if (msg.synergyActive) {
                            synergyNameUI.className = 'flex-1 min-w-0 text-[9px] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-400 to-indigo-400 animate-pulse truncate';
                        } else if (msg.slot1) {
                            synergyNameUI.className = 'flex-1 min-w-0 text-[9px] font-bold text-cyan-400 truncate';
                        } else {
                            synergyNameUI.className = 'flex-1 min-w-0 text-[9px] font-bold text-gray-500 truncate';
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

                            if (msg.bossTitle) {
                                document.getElementById('bossMainTitle').innerText = msg.bossTitle;
                            } else if (msg.bossType === 'worm') {
                                document.getElementById('bossMainTitle').innerText = "💀 吞噬蠕虫 (Asteroid Devourer)";
                            } else {
                                document.getElementById('bossMainTitle').innerText = "⚠️ 星际掠夺者号 (Phase Reaver)";
                            }

                            if (msg.bossType === 'worm') {
                                document.getElementById('partHpShield').innerText = "未激活";
                                document.getElementById('partBarShield').style.width = "0%";
                                document.getElementById('partHpLeft').innerText = "未激活";
                                document.getElementById('partBarLeft').style.width = "0%";
                                document.getElementById('partHpRight').innerText = "未激活";
                                document.getElementById('partBarRight').style.width = "0%";
                            } else if (msg.bossParts) {
                                const bp = msg.bossParts;
                                const shieldPctText = bp.shieldSlot === 'rear'
                                    ? `尾炮 ${Math.ceil(bp.shield * 100)}%`
                                    : (bp.shield > 0 ? `${Math.ceil(bp.shield * 100)}%` : '❌ 已瘫痪');
                                document.getElementById('partHpShield').innerText = shieldPctText;
                                document.getElementById('partBarShield').style.width = `${bp.shield * 100}%`;
                                document.getElementById('partHpLeft').innerText = bp.left > 0 ? `${Math.ceil(bp.left * 100)}%` : '❌ 已炸飞';
                                document.getElementById('partBarLeft').style.width = `${bp.left * 100}%`;
                                document.getElementById('partHpRight').innerText = bp.right > 0 ? `${Math.ceil(bp.right * 100)}%` : '❌ 已炸飞';
                                document.getElementById('partBarRight').style.width = `${bp.right * 100}%`;
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
                    if (msg.key === 'space_best_score') mainBestScore = safeReadInt('space_best_score', 0);
                    if (msg.key === 'space_current_skin') mainCurrentSkin = safeReadString('space_current_skin', 'default');
                    if (msg.key === 'space_unlocked_skins') {
                        const skins = safeReadJSON('space_unlocked_skins', ['default']);
                        mainUnlockedSkins = Array.isArray(skins) ? skins : ['default'];
                    }
                    if (msg.key === 'space_v7_talents' && typeof loadTalents === 'function') {
                        mainTalents = loadTalents();
                    }
                    if (msg.key === 'space_permanent_cores' && typeof safeReadPermanentCores === 'function') {
                        mainPermanentCores = safeReadPermanentCores();
                    }
                    break;
                    
                case 'gameOver':
                    mainPermanentCores = addPermanentCores(msg.permanentCoresEarned || 0);
                    recordLocalMatchHistory({
                        score: msg.score,
                        wave: msg.wave,
                        skin: msg.currentSkin || mainCurrentSkin,
                        isNewBest: !!msg.isNewBest,
                        permanentCoresEarned: msg.permanentCoresEarned || 0
                    });
                    if (msg.isNewBest && window.StarseaLeaderboard && typeof window.StarseaLeaderboard.syncScoreToCloud === 'function') {
                        window.StarseaLeaderboard.syncScoreToCloud(msg.bestScore, msg.currentSkin || mainCurrentSkin);
                    }
                    document.getElementById('endScore').innerText = String(msg.score).padStart(6, '0');
                    document.getElementById('endWave').innerText = msg.wave;
                    document.getElementById('endBest').innerText = String(msg.bestScore).padStart(6, '0');
                    const endCoreRewardEl = document.getElementById('endCoreReward');
                    if (endCoreRewardEl) endCoreRewardEl.innerText = `+${msg.permanentCoresEarned || 0}`;
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
                    
                case 'togglePause': {
                    const pauseScreen = document.getElementById('pauseScreen');
                    if (pauseScreen) {
                        if (msg.isPaused) {
                            pauseScreen.classList.remove('hidden');
                        } else {
                            pauseScreen.classList.add('hidden');
                        }
                    }
                    break;
                }
                    
                case 'endBenchmark': {
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

                case 'levelUpTrigger': {
                    const rogueUpgradeScreen = document.getElementById('rogueUpgradeScreen');
                    const rogueLevelVal = document.getElementById('rogueLevelVal');
                    const rogueCardsContainer = document.getElementById('rogueCardsContainer');
                    
                    if (rogueUpgradeScreen && rogueCardsContainer && rogueLevelVal) {
                        rogueLevelVal.innerText = msg.level;
                        rogueUpgradeScreen.classList.remove('hidden');
                        renderMainRogueUpgradeCards(rogueCardsContainer, msg.elementSlots || [], msg.comboKey || '', msg.equippedMods || []);
                    }
                    break;
                }

                case 'hazardOverlay': {
                    const hazardOverlayEl = document.getElementById('hazardOverlay');
                    const hazardAlertBoxEl = document.getElementById('hazardAlertBox');
                    if (hazardOverlayEl) {
                        if (msg.active) {
                            hazardOverlayEl.classList.remove('hidden');
                            hazardOverlayEl.classList.add('flex');
                            hazardOverlayEl.style.backgroundColor = 'rgba(127, 29, 29, 0.45)';
                            if (hazardAlertBoxEl) {
                                hazardAlertBoxEl.classList.remove('opacity-0', 'scale-90');
                                hazardAlertBoxEl.classList.add('opacity-100', 'scale-100');
                            }
                        } else {
                            hazardOverlayEl.classList.add('hidden');
                            hazardOverlayEl.classList.remove('flex');
                            hazardOverlayEl.style.backgroundColor = 'rgba(127, 29, 29, 0)';
                            if (hazardAlertBoxEl) {
                                hazardAlertBoxEl.classList.add('opacity-0', 'scale-90');
                                hazardAlertBoxEl.classList.remove('opacity-100', 'scale-100');
                            }
                        }
                    }
                    break;
                }
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
                touchBtn.classList.toggle('is-selected', mode === 'touch');
                keyBtn.classList.toggle('is-selected', mode === 'keyboard');
                const touchIcon = touchBtn.querySelector('i');
                const keyIcon = keyBtn.querySelector('i');
                if (touchIcon) touchIcon.classList.toggle('animate-pulse', mode === 'touch');
                if (keyIcon) keyIcon.classList.toggle('animate-pulse', mode === 'keyboard');
            }
            mainShowToast(mode === 'touch' ? "已选择：指尖滑动连发模式" : "已选择：键盘虚拟按键模式");
        }
        
        // V7: 经典 / 无尽深空 战役模式桥接（Worker 模式下必须显式 postMessage 给子线程引擎）
        let mainEndlessMode = false;
        function setMainCampaignMode(isEndless) {
            mainEndlessMode = isEndless;
            worker.postMessage({ type: 'campaignMode', isEndless: isEndless });

            const classicBtn = document.getElementById('selectClassicBtn');
            const endlessBtn = document.getElementById('selectEndlessBtn');
            if (classicBtn && endlessBtn) {
                classicBtn.classList.toggle('is-selected', !isEndless);
                endlessBtn.classList.toggle('is-selected', isEndless);
            }
            mainShowToast(isEndless ? "已选择：无尽深空突变模式" : "已选择：经典星域防守模式");
        }

        // 绑定大厅与菜单按钮
        document.getElementById('selectTouchBtn').addEventListener('click', () => setMainControlMode('touch'));
        document.getElementById('selectKeyBtn').addEventListener('click', () => setMainControlMode('keyboard'));
        const selectClassicBtn = document.getElementById('selectClassicBtn');
        const selectEndlessBtn = document.getElementById('selectEndlessBtn');
        if (selectClassicBtn) selectClassicBtn.addEventListener('click', () => setMainCampaignMode(false));
        if (selectEndlessBtn) selectEndlessBtn.addEventListener('click', () => setMainCampaignMode(true));
        document.getElementById('startPlayBtn').addEventListener('click', () => {
            sfx.init();
            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('hud').classList.remove('opacity-0');
            refreshMainSkinState();
            
            const mobileControls = document.getElementById('mobileControls');
            if (mobileControls) {
                if (mainControlMode === 'keyboard' && ('ontouchstart' in window)) {
                    mobileControls.classList.remove('hidden');
                } else {
                    mobileControls.classList.add('hidden');
                }
            }
            
            worker.postMessage({ type: 'startGame', currentSkin: mainCurrentSkin });
        });
        
        // 暂停菜单按键监听
        document.getElementById('resumeBtn').addEventListener('click', () => {
            document.getElementById('pauseScreen').classList.add('hidden');
            worker.postMessage({ type: 'resumeGame' });
        });
        document.getElementById('restartFromPauseBtn').addEventListener('click', () => {
            document.getElementById('pauseScreen').classList.add('hidden');
            refreshMainSkinState();
            worker.postMessage({ type: 'resetGame', shouldStart: true, currentSkin: mainCurrentSkin });
        });
        document.getElementById('retryBtn').addEventListener('click', () => {
            document.getElementById('gameOverScreen').classList.add('hidden');
            refreshMainSkinState();
            worker.postMessage({ type: 'resetGame', shouldStart: true, currentSkin: mainCurrentSkin });
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
        document.getElementById('pauseBtn').addEventListener('click', () => {
            worker.postMessage({ type: 'togglePause' });
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
        if (typeof TALENT_DEFINITIONS !== 'undefined') {
            TALENT_DEFINITIONS.forEach(def => {
                const tb = document.getElementById(`buyTalent${def.id}Btn`);
                if (tb) tb.addEventListener('click', () => buyMainTalent(def.id));
            });
        }
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
        
        // 折跃触发：移动端 300ms 内双触发即触发量子折跃
        let lastTapTime = 0;
        canvas.addEventListener('touchstart', (e) => {
            isDragging = true;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;

            const now = performance.now();
            if (now - lastTapTime < 300) {
                const rect = canvas.getBoundingClientRect();
                const sx = 540 / rect.width;
                const sy = 960 / rect.height;
                worker.postMessage({
                    type: 'warpAt',
                    x: (touch.clientX - rect.left) * sx,
                    y: (touch.clientY - rect.top) * sy
                });
            }
            lastTapTime = now;
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

        // 折跃触发：PC 端在画布上双击即触发量子折跃到光标位置
        canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = 540 / rect.width;
            const sy = 960 / rect.height;
            worker.postMessage({
                type: 'warpAt',
                x: (e.clientX - rect.left) * sx,
                y: (e.clientY - rect.top) * sy
            });
        });

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

function renderMainRogueUpgradeCards(container, elementSlots, comboKey, equippedMods) {
    container.innerHTML = '';

    const equipped = equippedMods || [];
    const hasEM = elementSlots.includes('EM') || comboKey.includes('EM');
    const poolSource = getRogueModDefinitions();

    // 过滤：前置条件 + 去重已装备模组
    const availablePool = poolSource.filter(mod => {
        if (mod.id === 'tesla' && !hasEM) return false;
        if (equipped.includes(mod.id)) return false; // 去重
        return true;
    });

    // 使用 Fisher-Yates 洗牌算法，避免原地 sort 污染，保证纯随机概率
    const shuffled = typeof shuffleArray === 'function' ? shuffleArray([...availablePool]) : (function(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    })([...availablePool]);
    
    const selected = shuffled.slice(0, 3);

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
            sfx.playPowerup();
        });
        container.appendChild(card);
    });
}

// ============================================================
// V7 机载量子构装总览 (Loadout Overview)
// 同时服务 Worker 模式（hud 消息驱动）与单线程降级模式（engine.updateHUD 直接回调）。
// 数据源：equippedMods + 当前晶核槽 + comboKey；渲染 HUD 快捷条与全屏总览面板。
// ============================================================
let loadoutState = { equipped: [], slots: [], comboKey: '' };
let _lastStripSig = null;

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
