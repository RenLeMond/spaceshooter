// 微信小游戏 Canvas UI 层 ——
// 取代 H5 的 HTML/Tailwind UI：HUD（得分/HP/护盾/Warp/Wave/EM 炸弹/Boss 血条）、
// 起始菜单、暂停菜单、战败结算。
//
// 设计思路：
// 1) 与引擎独立维护一份 UI 状态机 uiState：'menu' | 'playing' | 'paused' | 'over'
// 2) 每帧 engine.draw() 之后由 wechat_main.js 调用 WechatUI.draw(ctx, engine)
// 3) 触摸事件先经 UI 命中测试 —— 如果命中按钮就吞掉，否则让引擎的 canvas listener 接收
//    （通过 GameGlobal.__uiCaptureInput 开关由 adapter 判断，是否分发给引擎 canvas）

(function () {
    const G = GameGlobal;
    const W = 540;   // 逻辑画布宽（与 engine.logicalWidth 对齐）
    const H = 960;   // 逻辑画布高

    // 字体族：adapter 启动时若加载到 Orbitron-Bold.ttf，则用 'Orbitron, sans-serif'；否则降级 sans-serif
    // 中文字形 Orbitron 没有，Canvas 会按 CSS 字体回退自动走 sans-serif，故所有中英混排都安全
    const FF = () => G.__uiFontFamily || 'sans-serif';
    const font = (size, weight) => (weight || 'bold') + ' ' + size + 'px ' + FF();

    const COLOR = {
        cyan: '#22d3ee',
        cyanDim: '#0891b2',
        rose: '#f43f5e',
        amber: '#fbbf24',
        indigo: '#818cf8',
        white: '#f1f5f9',
        gray: '#94a3b8',
        dark: 'rgba(2,6,23,0.85)',
        panel: 'rgba(15,23,42,0.78)',
        border: 'rgba(34,211,238,0.35)'
    };

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function drawBar(ctx, x, y, w, h, ratio, color, bg) {
        ctx.fillStyle = bg || 'rgba(2,6,23,0.6)';
        roundRect(ctx, x, y, w, h, h / 2);
        ctx.fill();
        const fillW = Math.max(0, Math.min(1, ratio)) * (w - 2);
        if (fillW > 0) {
            ctx.fillStyle = color;
            roundRect(ctx, x + 1, y + 1, fillW, h - 2, (h - 2) / 2);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, w, h, h / 2);
        ctx.stroke();
    }

    class WechatUI {
        constructor(engine) {
            this.engine = engine;
            this.state = 'menu'; // menu | playing | paused | over | hangar | benchReport
            this.buttons = [];   // 当前帧按钮命中区（点击后清空重建）
            this._prevGameOver = false;
            this._prevBenchmarking = false;
            this._benchReport = null;
            this._toast = null;  // { text, until }
            this._hookEngine();
            this._initTouch();
        }

        // 把引擎里几个会触发 H5-DOM 弹层的方法包一层，转成 UI 状态切换 + 收集数据
        _hookEngine() {
            const e = this.engine;
            const self = this;

            const origOpenHangar = e.openHangar.bind(e);
            e.openHangar = function () {
                origOpenHangar();
                self.setState('hangar');
            };

            const origExitHangar = e.exitHangar.bind(e);
            e.exitHangar = function () {
                origExitHangar();
                self.setState('playing');
            };

            // 把 toast 转到 Canvas
            const origShowToast = e.showToast ? e.showToast.bind(e) : null;
            e.showToast = function (text) {
                if (origShowToast) { try { origShowToast(text); } catch (err) {} }
                self._toast = { text: String(text || ''), until: Date.now() + 1500 };
            };
        }

        setState(s) {
            this.state = s;
        }

        _initTouch() {
            // UI 是 wx.onTouchXxx 的唯一入口：
            //   1) 先做按钮命中测试 —— 命中则吞掉（不转给引擎）
            //   2) 未命中且当前 state==='playing' 才转给引擎（adapter 暴露的 __forwardTouchToEngine）
            //   3) touchstart 在未命中时还要做 300ms 双击合成，触发 engine canvas 的 'dblclick' listener
            let lastTapTime = 0;
            const W2 = W, H2 = H;

            // 屏幕 → 540×960 逻辑坐标（letterbox）
            const toLogical = (cx, cy) => {
                const rect = G.__screenCanvas.getBoundingClientRect();
                return {
                    x: (cx - rect.left) * (W2 / rect.width),
                    y: (cy - rect.top) * (H2 / rect.height)
                };
            };

            const hitTest = (cx, cy) => {
                const p = toLogical(cx, cy);
                // 倒序：后画的按钮优先命中
                for (let i = this.buttons.length - 1; i >= 0; i--) {
                    const b = this.buttons[i];
                    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
                        try { b.onTap(); } catch (err) { console.error('[ui] button error', err); }
                        return true;
                    }
                }
                return false;
            };

            wx.onTouchStart((e) => {
                const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
                if (!t) return;
                if (hitTest(t.clientX, t.clientY)) return; // 按钮命中 → 吞掉
                if (this.state !== 'playing') return;      // 非战斗态忽略空白点击
                G.__forwardTouchToEngine && G.__forwardTouchToEngine('touchstart', e);
                // 300ms 内两次 touchstart → 合成 dblclick（量子折跃）
                const now = Date.now();
                if (now - lastTapTime < 300) {
                    G.__dispatchDblClickToEngine && G.__dispatchDblClickToEngine(t.clientX, t.clientY);
                    lastTapTime = 0;
                } else {
                    lastTapTime = now;
                }
            });
            wx.onTouchMove((e) => {
                if (this.state !== 'playing') return;
                G.__forwardTouchToEngine && G.__forwardTouchToEngine('touchmove', e);
            });
            wx.onTouchEnd((e) => {
                if (this.state !== 'playing') return;
                G.__forwardTouchToEngine && G.__forwardTouchToEngine('touchend', e);
            });
            wx.onTouchCancel((e) => {
                if (this.state !== 'playing') return;
                G.__forwardTouchToEngine && G.__forwardTouchToEngine('touchend', e);
            });
        }

        // 每帧：检测引擎状态变化、绘制 UI
        update() {
            const e = this.engine;
            // 玩家死亡 -> 结算
            if (this.state === 'playing' && e.player && e.player.hp <= 0 && !this._prevGameOver) {
                this.setState('over');
            }
            this._prevGameOver = e.player && e.player.hp <= 0;

            // 引擎 isPaused 与 UI paused 同步（如果别处触发暂停且不是车间）
            if (this.state === 'playing' && e.isPaused) {
                this.setState('paused');
            }

            // 跑分结束（isBenchmarking 由 true 变 false）→ 计算报告并切到 benchReport
            const isBench = !!e.isBenchmarking;
            if (this._prevBenchmarking && !isBench) {
                const frames = e.benchFrames || 1;
                const avgFps = (e.benchFpsTotal || 0) / frames;
                const avgPhys = (e.benchPhysDelayTotal || 0) / frames;
                const avgDraw = (e.benchDrawDelayTotal || 0) / frames;
                let score = Math.floor(avgFps * 100 - (avgPhys + avgDraw) * 400);
                if (score < 1000) score = 1000;
                let rank = '⚠ Standard';
                if (avgFps >= 110) rank = '⚡ Godlike';
                else if (avgFps >= 85) rank = '🚀 Ultra';
                else if (avgFps >= 55) rank = '💎 Premium';
                this._benchReport = { score, rank, avgFps, avgPhys, avgDraw };
                this.setState('benchReport');
            }
            this._prevBenchmarking = isBench;
        }

        draw(ctx) {
            this.buttons.length = 0;

            if (this.state === 'menu') {
                this._drawMenu(ctx);
            } else if (this.state === 'playing') {
                this._drawHUD(ctx);
            } else if (this.state === 'paused') {
                this._drawHUD(ctx);
                this._drawPause(ctx);
            } else if (this.state === 'over') {
                this._drawHUD(ctx);
                this._drawGameOver(ctx);
            } else if (this.state === 'hangar') {
                // hangar 全屏背景遮 HUD，HUD 不画
                this._drawHangar(ctx);
            } else if (this.state === 'benchReport') {
                this._drawBenchReport(ctx);
            }

            // Canvas Toast（覆盖在所有页面之上）
            if (this._toast && Date.now() < this._toast.until) {
                this._drawToast(ctx, this._toast.text);
            } else if (this._toast) {
                this._toast = null;
            }
        }

        // ---------------- HUD ----------------
        _drawHUD(ctx) {
            const e = this.engine;
            ctx.save();

            // 顶部信息条：得分 / 废料 / Wave / 最佳
            ctx.fillStyle = COLOR.panel;
            roundRect(ctx, 10, 10, W - 20, 50, 12);
            ctx.fill();
            ctx.strokeStyle = COLOR.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(10);
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            ctx.fillText('SCORE', 22, 16);
            ctx.fillStyle = COLOR.white;
            ctx.font = font(22);
            ctx.fillText(String(e.score || 0).padStart(6, '0'), 22, 28);

            ctx.fillStyle = COLOR.amber;
            ctx.font = font(10);
            ctx.textAlign = 'center';
            ctx.fillText('SCRAP', W / 2, 16);
            ctx.fillStyle = COLOR.amber;
            ctx.font = font(18);
            ctx.fillText(String(e.scrap || 0), W / 2, 30);

            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(10);
            ctx.textAlign = 'right';
            ctx.fillText('WAVE ' + (e.wave || 1), W - 22, 16);
            ctx.fillStyle = COLOR.gray;
            ctx.font = font(12);
            ctx.fillText('HI ' + String(e.bestScore || 0).padStart(6, '0'), W - 22, 32);

            // 三条进度条：HP / Shield / Warp
            const barY = 70;
            const barH = 8;
            const barW = (W - 40 - 16) / 3;
            const hpRatio = e.player ? (e.player.hp / e.player.maxHp) : 0;
            const shRatio = (e.shieldTime || 0) > 0 ? Math.min(1, e.shieldTime / 5000) : 0;
            const wpRatio = (e.warpCharge || 0) / 100;
            drawBar(ctx, 20, barY, barW, barH, hpRatio, COLOR.rose);
            drawBar(ctx, 20 + barW + 8, barY, barW, barH, shRatio, COLOR.cyan);
            drawBar(ctx, 20 + (barW + 8) * 2, barY, barW, barH, wpRatio, COLOR.indigo);

            // HUD 第三行：核弹按钮 + 暂停按钮
            const bombReady = (e.bombCharge || 0) >= 100;
            const bombX = 20, bombY = 88, bombW = 60, bombH = 30;
            ctx.fillStyle = bombReady ? 'rgba(251,191,36,0.25)' : 'rgba(100,116,139,0.25)';
            roundRect(ctx, bombX, bombY, bombW, bombH, 8);
            ctx.fill();
            ctx.strokeStyle = bombReady ? COLOR.amber : COLOR.gray;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = bombReady ? COLOR.amber : COLOR.gray;
            ctx.font = font(11);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('EM ' + Math.floor(e.bombCharge || 0) + '%', bombX + bombW / 2, bombY + bombH / 2);
            this.buttons.push({
                x: bombX, y: bombY, w: bombW, h: bombH,
                onTap: () => { if (this.state === 'playing' && bombReady && typeof e.triggerEomBomb === 'function') e.triggerEomBomb(); }
            });

            // 暂停按钮 —— 右上方
            const pX = W - 60, pY = 88, pW = 40, pH = 30;
            ctx.fillStyle = 'rgba(15,23,42,0.6)';
            roundRect(ctx, pX, pY, pW, pH, 8);
            ctx.fill();
            ctx.strokeStyle = COLOR.cyan;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = COLOR.cyan;
            ctx.fillRect(pX + 14, pY + 9, 3, 12);
            ctx.fillRect(pX + 23, pY + 9, 3, 12);
            this.buttons.push({
                x: pX, y: pY, w: pW, h: pH,
                onTap: () => { if (this.state === 'playing') { e.isPaused = true; this.setState('paused'); } }
            });

            // 晶核槽位（player.elementSlots）+ synergyName
            if (e.player) {
                const slots = e.player.elementSlots || [];
                const slotY = 124, slotW = 36, slotH = 22, slotGap = 6;
                const slotX0 = 20;
                for (let i = 0; i < 2; i++) {
                    const name = slots[i];
                    const sx = slotX0 + i * (slotW + slotGap);
                    ctx.fillStyle = name ? 'rgba(34,211,238,0.18)' : 'rgba(15,23,42,0.6)';
                    roundRect(ctx, sx, slotY, slotW, slotH, 5);
                    ctx.fill();
                    ctx.strokeStyle = name ? COLOR.cyan : 'rgba(255,255,255,0.15)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = name ? COLOR.cyan : COLOR.gray;
                    ctx.font = font(10);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const label = name ? (G.formatElementChipLabel ? G.formatElementChipLabel(name) : name) : '空';
                    ctx.fillText(label, sx + slotW / 2, slotY + slotH / 2);
                }
                if (e.player.synergyName) {
                    ctx.fillStyle = COLOR.cyan;
                    ctx.font = font(11);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(e.player.synergyName, slotX0 + 2 * (slotW + slotGap) + 4, slotY + slotH / 2);
                }
            }

            // Boss 血条
            if (e.boss && e.boss.hp > 0) {
                const bw = W - 80, bh = 10, by = 132;
                ctx.fillStyle = COLOR.panel;
                roundRect(ctx, 40, by - 4, bw, bh + 8, 6);
                ctx.fill();
                drawBar(ctx, 40, by, bw, bh, e.boss.hp / e.boss.maxHp, COLOR.rose);
                ctx.fillStyle = COLOR.rose;
                ctx.font = font(10);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText('B O S S  ' + Math.ceil(e.boss.hp) + ' / ' + e.boss.maxHp, W / 2, by - 14);
            }

            ctx.restore();
        }

        // ---------------- 起始菜单 ----------------
        _drawMenu(ctx) {
            ctx.save();
            // 深蓝深空底色（与暂停 / 战败屏色调一致）
            ctx.fillStyle = 'rgba(2,6,23,0.92)';
            ctx.fillRect(0, 0, W, H);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(14);
            ctx.fillText('S P A C E   S H O O T E R   ·   V 6', W / 2, H * 0.28);

            ctx.fillStyle = COLOR.white;
            ctx.font = font(36);
            ctx.fillText('星 海 猎 手', W / 2, H * 0.34);

            ctx.fillStyle = COLOR.gray;
            ctx.font = font(12, 'normal');
            ctx.fillText('星能跃迁与超维涂装', W / 2, H * 0.39);

            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(12);
            ctx.fillText('HI - SCORE  ' + String(this.engine.bestScore || 0).padStart(6, '0'), W / 2, H * 0.46);

            this._button(ctx, '开 始 战 斗', W / 2 - 110, H * 0.56, 220, 56, COLOR.cyan, () => {
                this.engine.startGame();
                this.setState('playing');
            });

            this._button(ctx, '性 能 压 力 测 试', W / 2 - 90, H * 0.66, 180, 40, COLOR.indigo, () => {
                this.engine.startBenchmark();
                this.setState('playing');
            });

            ctx.fillStyle = COLOR.gray;
            ctx.font = font(11, 'normal');
            ctx.fillText('单指滑动 = 移动 / 双击屏幕 = 量子折跃', W / 2, H * 0.78);
            ctx.fillText('HP 归零即战败 · 击破 Boss 累计高分', W / 2, H * 0.81);

            ctx.restore();
        }

        // ---------------- 暂停菜单 ----------------
        _drawPause(ctx) {
            ctx.save();
            ctx.fillStyle = 'rgba(2,6,23,0.78)';
            ctx.fillRect(0, 0, W, H);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(28);
            ctx.fillText('战 术 整 备', W / 2, H * 0.36);

            ctx.fillStyle = COLOR.gray;
            ctx.font = font(12, 'normal');
            ctx.fillText('星海战场暂时处于停滞状态', W / 2, H * 0.42);

            this._button(ctx, '继 续 航 行', W / 2 - 110, H * 0.48, 220, 50, COLOR.cyan, () => {
                this.engine.isPaused = false;
                this.setState('playing');
            });

            this._button(ctx, '极 客 压 力 测 试', W / 2 - 110, H * 0.56, 220, 44, COLOR.indigo, () => {
                this.engine.isPaused = false;
                this.engine.startBenchmark();
                this.setState('playing');
            });

            this._button(ctx, '重 新 开 始', W / 2 - 110, H * 0.63, 220, 44, COLOR.amber, () => {
                this.engine.isPaused = false;
                this.engine.resetGame(true);
                this.setState('playing');
            });

            this._button(ctx, '返 回 主 菜 单', W / 2 - 110, H * 0.70, 220, 44, COLOR.gray, () => {
                this.engine.isPaused = false;
                this.engine.isRunning = false;
                this.setState('menu');
            });

            ctx.restore();
        }

        // ---------------- 改装车间 ----------------
        _drawHangar(ctx) {
            const e = this.engine;
            ctx.save();
            ctx.fillStyle = 'rgba(2,6,23,0.92)';
            ctx.fillRect(0, 0, W, H);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(22);
            ctx.fillText('改 装 车 间', W / 2, 180);

            ctx.fillStyle = COLOR.amber;
            ctx.font = font(14);
            ctx.fillText('SCRAP  ' + (e.scrap || 0), W / 2, 210);

            // 3 张模块升级卡
            const h = e.hangar || { turretLevel: 0, engineLevel: 0, wingsLevel: 0 };
            const modules = [
                { key: 'turret', name: '纳米伴飞僚机', lv: h.turretLevel, max: 3, cost: 50 + h.turretLevel * 30 },
                { key: 'engine', name: '等离子尾喷', lv: h.engineLevel, max: 3, cost: 40 + h.engineLevel * 25 },
                { key: 'wings',  name: '切割能盾翼',   lv: h.wingsLevel,  max: 1, cost: 60 }
            ];
            const cardW = W - 80, cardH = 56, cardX = 40;
            let cy = 240;
            for (const m of modules) {
                this._drawUpgradeCard(ctx, cardX, cy, cardW, cardH, m, e.scrap || 0);
                cy += cardH + 10;
            }

            // 3 张涂装卡
            cy += 8;
            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(12);
            ctx.textAlign = 'left';
            ctx.fillText('超 维 涂 装', cardX, cy);
            cy += 14;

            const skins = [
                { id: 'void',     name: '🌌 星渊幻影', cost: 80 },
                { id: 'thunder',  name: '⚡ 超维雷霆', cost: 100 },
                { id: 'imperial', name: '✨ 帝皇余晖', cost: 120 }
            ];
            const unlocked = e.unlockedSkins || ['default'];
            for (const s of skins) {
                this._drawSkinCard(ctx, cardX, cy, cardW, 38, s, unlocked, e.currentSkin, e.scrap || 0);
                cy += 44;
            }

            // 退出按钮
            this._button(ctx, '整 备 完 毕 · 起 飞 出 征', W / 2 - 150, H - 80, 300, 50, COLOR.cyan, () => {
                this.engine.exitHangar();
            });

            ctx.restore();
        }

        _drawUpgradeCard(ctx, x, y, w, h, m, scrap) {
            const maxed = m.lv >= m.max;
            const affordable = !maxed && scrap >= m.cost;

            ctx.fillStyle = COLOR.panel;
            roundRect(ctx, x, y, w, h, 10);
            ctx.fill();
            ctx.strokeStyle = maxed ? COLOR.amber : (affordable ? COLOR.cyan : 'rgba(148,163,184,0.4)');
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = COLOR.white;
            ctx.font = font(13);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(m.name, x + 12, y + 8);

            // 等级点
            const dotR = 4, dotGap = 4;
            for (let i = 0; i < m.max; i++) {
                const dx = x + 12 + i * (dotR * 2 + dotGap);
                ctx.beginPath();
                ctx.arc(dx + dotR, y + 32, dotR, 0, Math.PI * 2);
                ctx.fillStyle = i < m.lv ? COLOR.cyan : 'rgba(148,163,184,0.3)';
                ctx.fill();
            }

            // 右侧按钮
            const btnW = 84, btnH = 32, bx = x + w - btnW - 10, by = y + (h - btnH) / 2;
            let label, color;
            if (maxed) { label = '已 满 级'; color = COLOR.amber; }
            else if (affordable) { label = '升级 · ' + m.cost; color = COLOR.cyan; }
            else { label = '废料 · ' + m.cost; color = COLOR.gray; }

            ctx.fillStyle = 'rgba(2,6,23,0.7)';
            roundRect(ctx, bx, by, btnW, btnH, 8);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = font(11);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bx + btnW / 2, by + btnH / 2);

            if (!maxed && affordable) {
                this.buttons.push({
                    x: bx, y: by, w: btnW, h: btnH,
                    onTap: () => { this.engine.buyModule(m.key, m.cost); }
                });
            }
        }

        _drawSkinCard(ctx, x, y, w, h, s, unlocked, current, scrap) {
            const isEquipped = current === s.id;
            const isUnlocked = unlocked.indexOf(s.id) >= 0;
            const affordable = !isUnlocked && scrap >= s.cost;
            const accent = isEquipped ? COLOR.amber : (isUnlocked ? COLOR.cyan : (affordable ? COLOR.indigo : COLOR.gray));

            ctx.fillStyle = COLOR.panel;
            roundRect(ctx, x, y, w, h, 8);
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = COLOR.white;
            ctx.font = font(12);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.name, x + 12, y + h / 2);

            let label;
            if (isEquipped) label = '使用中';
            else if (isUnlocked) label = '装配';
            else label = (affordable ? '解锁 · ' : '废料 · ') + s.cost;

            const btnW = 72, btnH = 24, bx = x + w - btnW - 10, by = y + (h - btnH) / 2;
            ctx.fillStyle = 'rgba(2,6,23,0.7)';
            roundRect(ctx, bx, by, btnW, btnH, 6);
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = accent;
            ctx.font = font(10);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, bx + btnW / 2, by + btnH / 2);

            const tappable = !isEquipped && (isUnlocked || affordable);
            if (tappable) {
                this.buttons.push({
                    x: bx, y: by, w: btnW, h: btnH,
                    onTap: () => { this.engine.interactSkin(s.id, s.cost); }
                });
            }
        }

        // ---------------- 跑分报告 ----------------
        _drawBenchReport(ctx) {
            const r = this._benchReport || { score: 0, rank: '-', avgFps: 0, avgPhys: 0, avgDraw: 0 };
            ctx.save();
            ctx.fillStyle = 'rgba(2,6,23,0.92)';
            ctx.fillRect(0, 0, W, H);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(14);
            ctx.fillText('B E N C H M A R K   R E P O R T', W / 2, H * 0.26);

            ctx.fillStyle = COLOR.white;
            ctx.font = font(56);
            ctx.fillText(String(r.score), W / 2, H * 0.36);

            ctx.fillStyle = COLOR.amber;
            ctx.font = font(14);
            ctx.fillText(r.rank, W / 2, H * 0.43);

            // 三个指标
            const rows = [
                ['Avg FPS',  r.avgFps.toFixed(1) + ' Hz'],
                ['Physics',  r.avgPhys.toFixed(2) + ' ms'],
                ['Draw',     r.avgDraw.toFixed(2) + ' ms']
            ];
            ctx.fillStyle = COLOR.panel;
            roundRect(ctx, W / 2 - 130, H * 0.50, 260, 110, 12);
            ctx.fill();
            ctx.strokeStyle = COLOR.border;
            ctx.lineWidth = 1;
            ctx.stroke();
            for (let i = 0; i < rows.length; i++) {
                const y = H * 0.50 + 20 + i * 28;
                ctx.fillStyle = COLOR.gray;
                ctx.font = font(11);
                ctx.textAlign = 'left';
                ctx.fillText(rows[i][0], W / 2 - 110, y + 8);
                ctx.fillStyle = COLOR.cyan;
                ctx.font = font(13);
                ctx.textAlign = 'right';
                ctx.fillText(rows[i][1], W / 2 + 110, y + 8);
            }

            this._button(ctx, '再 跑 一 次', W / 2 - 110, H * 0.72, 220, 50, COLOR.indigo, () => {
                this.engine.startBenchmark();
                this.setState('playing');
            });
            this._button(ctx, '返 回 主 菜 单', W / 2 - 110, H * 0.80, 220, 44, COLOR.gray, () => {
                this.engine.isRunning = false;
                this.setState('menu');
            });

            ctx.restore();
        }

        // ---------------- Toast ----------------
        _drawToast(ctx, text) {
            ctx.save();
            const tw = Math.min(W - 40, Math.max(160, text.length * 12 + 24));
            const th = 32;
            const tx = (W - tw) / 2;
            const ty = H * 0.18;
            ctx.fillStyle = 'rgba(2,6,23,0.88)';
            roundRect(ctx, tx, ty, tw, th, 8);
            ctx.fill();
            ctx.strokeStyle = COLOR.border;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = COLOR.white;
            ctx.font = font(12);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, W / 2, ty + th / 2);
            ctx.restore();
        }

        // ---------------- 战败结算 ----------------
        _drawGameOver(ctx) {
            ctx.save();
            ctx.fillStyle = 'rgba(15,2,8,0.86)';
            ctx.fillRect(0, 0, W, H);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLOR.rose;
            ctx.font = font(32);
            ctx.fillText('战 机 坠 毁', W / 2, H * 0.32);

            ctx.fillStyle = COLOR.gray;
            ctx.font = font(12, 'normal');
            ctx.fillText('你的能量屏障已瓦解在浩瀚的废墟之中', W / 2, H * 0.38);

            ctx.fillStyle = COLOR.panel;
            roundRect(ctx, W / 2 - 130, H * 0.43, 260, 70, 12);
            ctx.fill();
            ctx.strokeStyle = COLOR.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = COLOR.cyan;
            ctx.font = font(10);
            ctx.fillText('终末得分', W / 2 - 65, H * 0.46);
            ctx.fillText('抵御波数', W / 2 + 65, H * 0.46);
            ctx.fillStyle = COLOR.white;
            ctx.font = font(22);
            ctx.fillText(String(this.engine.score || 0), W / 2 - 65, H * 0.50);
            ctx.fillText(String(this.engine.wave || 1), W / 2 + 65, H * 0.50);

            this._button(ctx, '再 来 一 局', W / 2 - 110, H * 0.60, 220, 56, COLOR.rose, () => {
                this.engine.resetGame(true);
                this.setState('playing');
            });

            this._button(ctx, '返 回 主 菜 单', W / 2 - 110, H * 0.69, 220, 50, COLOR.gray, () => {
                this.engine.isRunning = false;
                this.setState('menu');
            });

            ctx.restore();
        }

        // ---------------- 通用按钮 ----------------
        _button(ctx, label, x, y, w, h, color, onTap) {
            ctx.fillStyle = 'rgba(2,6,23,0.7)';
            roundRect(ctx, x, y, w, h, 14);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.strokeStyle = color;
            roundRect(ctx, x, y, w, h, 14);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.font = font(16);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + w / 2, y + h / 2);
            this.buttons.push({ x, y, w, h, onTap });
        }
    }

    G.WechatUI = WechatUI;
})();
