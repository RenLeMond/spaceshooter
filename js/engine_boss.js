// =============================================
// 星海猎手 V7: GameEngine - BOSS 模块
// =============================================

var BOSS_SPAWN_COOLDOWN_MS = 12000;

Object.assign(GameEngine.prototype, {
    // 第 n 阶首领所需累计分数：3500 起，之后每阶间隔 3800 × 1.26^(n-2)
    getBossSpawnThreshold(encounterTier) {
        if (encounterTier <= 1) return 3500;
        let threshold = 3500;
        for (let t = 2; t <= encounterTier; t++) {
            threshold += Math.floor(3800 * Math.pow(1.26, t - 2));
        }
        return threshold;
    },

    _refreshNextBossThreshold() {
        this.nextBossThreshold = this.getBossSpawnThreshold(this.bossTier + 1);
    },

    getBossHpScale(tier) {
        return 1 + (tier - 1) * 0.38;
    },

    _scaledBossHp(base, tier) {
        return Math.floor(base * this.getBossHpScale(tier));
    },

    _bossTierLabel(tier) {
        return tier > 1 ? ` · 第${tier}阶` : '';
    },

    spawnBoss() {
        const tier = this.bossTier + 1;
        if (Math.random() < 0.5) {
            this.spawnTitanBoss(tier);
        } else {
            this.spawnAsteroidWorm(tier);
        }
        this.showToast(`🚨 第 ${tier} 阶首领降临！(${this.getBossSpawnThreshold(tier)} 分)`);
    },

    // 母舰阶段 boss 半径上界（盾光环最大半径 115 + 安全 15）
    // titan 阶段碎石环最大半径 135 + 安全 15
    // 用主线程实测的 HUD 下沿做避让基线，HUD 占不到时 fallback 到设计值
    _bossTargetY(designed, topExtent) {
        const clearance = this.hudClearance || 0;
        return Math.max(designed, clearance + topExtent);
    },

    spawnTitanBoss(tier) {
        const hpScale = this.getBossHpScale(tier);
        const radiusBonus = (tier - 1) * 2;
        const shieldHp = this._scaledBossHp(200, tier);
        const wingHp = this._scaledBossHp(150, tier);
        const coreHp = this._scaledBossHp(500, tier);

        this.boss = {
            type: 'titan',
            encounterTier: tier,
            state: 'mothership',
            x: this.logicalWidth / 2,
            y: -150,
            targetY: this._bossTargetY(160, 130),
            width: 220,
            height: 100,
            vx: 1.5 + (tier - 1) * 0.12,
            bulletTimer: 0,
            bulletInterval: Math.max(700, 1200 - (tier - 1) * 85),
            extraVolley: tier >= 3,
            active: true,
            parts: {
                shieldCore: { hp: shieldHp, maxHp: shieldHp, active: true, offset: { x: 0, y: -25 }, radius: 25 + radiusBonus, label: "防护罩发生器" },
                leftWing: { hp: wingHp, maxHp: wingHp, active: true, offset: { x: -85, y: 15 }, radius: 25 + radiusBonus, label: "左排炮翼" },
                rightWing: { hp: wingHp, maxHp: wingHp, active: true, offset: { x: 85, y: 15 }, radius: 25 + radiusBonus, label: "右排炮翼" },
                core: { hp: coreHp, maxHp: coreHp, active: true, offset: { x: 0, y: 20 }, radius: 35 + radiusBonus, label: "核心本体" }
            }
        };

        // 第 4 阶起：追加双联尾炮（额外部件，击破后母舰火力减弱）
        if (tier >= 4) {
            const tailHp = this._scaledBossHp(120, tier);
            this.boss.parts.rearBattery = {
                hp: tailHp, maxHp: tailHp, active: true,
                offset: { x: 0, y: 45 }, radius: 20 + radiusBonus,
                label: "双联尾炮"
            };
        }

        this.addFloatText(this.logicalWidth / 2, 200, `🚨 超级母舰空降！${this._bossTierLabel(tier)}`, "#ef4444", 22);
        this._setBossTitle(`⚠️ 星际掠夺者号${this._bossTierLabel(tier)}`);
        this._showBossHpGroup();
    },

    spawnAsteroidWorm(tier) {
        const segmentCount = Math.min(12 + Math.floor((tier - 1) / 2), 16);
        const headHp = this._scaledBossHp(1500, tier);
        const segHp = this._scaledBossHp(400, tier);
        const headRadius = 40 + (tier - 1) * 2;

        this.boss = {
            type: 'worm',
            encounterTier: tier,
            wormSegmentCount: segmentCount,
            maxSplitHeads: Math.min(3 + Math.floor((tier - 1) / 2), 5),
            headSpeed: 4 + (tier - 1) * 0.25,
            devourMultiplier: 2 + (tier - 1) * 0.15,
            active: true,
            parts: {}
        };

        const startY = -400;
        const startX = this.logicalWidth / 2;

        for (let i = 0; i < segmentCount; i++) {
            const isHead = i === 0;
            const radius = isHead ? headRadius : Math.max(12, 30 - i * 1.5 + (tier - 1));
            this.boss.parts[`segment${i}`] = {
                hp: isHead ? headHp : segHp,
                maxHp: isHead ? headHp : segHp,
                active: true,
                x: startX,
                y: startY - i * 30,
                vx: 0,
                vy: 0,
                radius: radius,
                label: isHead ? "巨兽颚颅" : "吞噬者骨节",
                isHead: isHead,
                wasHead: isHead, // 持久标记：本段在活着的时候是不是头，便于死亡时一次性派发"颚颅 vs 普通分裂"事件
                splitHandled: false, // 死亡分裂事件是否已处理，防止多帧重复浮字 / 重复指派下一节
                idx: i
            };
        }

        this.addFloatText(this.logicalWidth / 2, 200, `🚨 吞噬蠕虫出现！${this._bossTierLabel(tier)}`, "#10b981", 22);
        this._setBossTitle(`💀 吞噬蠕虫${this._bossTierLabel(tier)} (${segmentCount}节)`);
        this._showBossHpGroup();
        this._resetWormPartHud();
    },

    _setBossTitle(text) {
        const el = document.getElementById('bossMainTitle');
        if (el) el.innerText = text;
    },

    _showBossHpGroup() {
        const el = document.getElementById('bossHpGroup');
        if (el) el.classList.remove('hidden');
    },

    _resetWormPartHud() {
        const ids = [
            ['partHpShield', 'partBarShield'],
            ['partHpLeft', 'partBarLeft'],
            ['partHpRight', 'partBarRight']
        ];
        ids.forEach(([textId, barId]) => {
            const txt = document.getElementById(textId);
            const bar = document.getElementById(barId);
            if (txt) txt.innerText = "未激活";
            if (bar) bar.style.width = "0%";
        });
    },

    _updateMothershipHud() {
        const b = this.boss;
        const core = b.parts.core;
        const shield = b.parts.shieldCore;
        const left = b.parts.leftWing;
        const right = b.parts.rightWing;
        const rear = b.parts.rearBattery;

        const mainPct = document.getElementById('bossMainPercent');
        const mainBar = document.getElementById('bossMainHpBar');
        if (mainPct) mainPct.innerText = `${Math.ceil((core.hp / core.maxHp) * 100)}%`;
        if (mainBar) mainBar.style.width = `${(core.hp / core.maxHp) * 100}%`;

        // 槽位策略：盾若仍在用 shield 槽；盾被破且 rear 存在则改显 rear（避免覆盖左/右翼）
        const shieldText = document.getElementById('partHpShield');
        const shieldBar = document.getElementById('partBarShield');
        if (shield.active) {
            if (shieldText) shieldText.innerText = `${Math.ceil((shield.hp / shield.maxHp) * 100)}%`;
            if (shieldBar) shieldBar.style.width = `${(shield.hp / shield.maxHp) * 100}%`;
        } else if (rear && rear.active) {
            if (shieldText) shieldText.innerText = `尾炮 ${Math.ceil((rear.hp / rear.maxHp) * 100)}%`;
            if (shieldBar) shieldBar.style.width = `${(rear.hp / rear.maxHp) * 100}%`;
        } else {
            if (shieldText) shieldText.innerText = '❌ 已瘫痪';
            if (shieldBar) shieldBar.style.width = '0%';
        }

        const leftText = document.getElementById('partHpLeft');
        const leftBar = document.getElementById('partBarLeft');
        if (leftText) leftText.innerText = left.active ? `${Math.ceil((left.hp / left.maxHp) * 100)}%` : '❌ 已炸飞';
        if (leftBar) leftBar.style.width = left.active ? `${(left.hp / left.maxHp) * 100}%` : '0%';

        const rightText = document.getElementById('partHpRight');
        const rightBar = document.getElementById('partBarRight');
        if (rightText) rightText.innerText = right.active ? `${Math.ceil((right.hp / right.maxHp) * 100)}%` : '❌ 已炸飞';
        if (rightBar) rightBar.style.width = right.active ? `${(right.hp / right.maxHp) * 100}%` : '0%';
    },

    _bossTrackPlayerX(b, dtClamped, speed, margin) {
        const dx = this.player.x - b.x;
        if (Math.abs(dx) > 8) {
            b.x += Math.sign(dx) * speed * dtClamped;
        }
        b.x = Math.max(margin, Math.min(this.logicalWidth - margin, b.x));
    },

    updateBoss(dtClamped) {
        if (!this.boss || !this.boss.active) return;
        const b = this.boss;

        if (b.type === 'worm') {
            this.updateWorm(dtClamped);
            return;
        }

        if (b.state === 'mothership') {
            const tier = b.encounterTier || 1;
            const trackSpeed = 1.8 + (tier - 1) * 0.15;
            const margin = 130;

            if (b.y < b.targetY) {
                b.y += 1.5 * dtClamped;
                // 空降过程中也缓慢对齐玩家 X，避免落地后才开始追
                this._bossTrackPlayerX(b, dtClamped, trackSpeed * 0.5, margin);
            } else {
                // 母舰阶段：横向追踪玩家（不再纯 ping-pong）
                this._bossTrackPlayerX(b, dtClamped, trackSpeed, margin);
            }

            b.bulletTimer += 16.666 * dtClamped;
            const interval = b.bulletInterval || 1200;
            if (b.bulletTimer > interval) {
                b.bulletTimer = 0;
                this.bossShoot();
                if (b.extraVolley) this.bossShoot();
            }

            this._updateMothershipHud();
        }
        else if (b.state === 'implosion') {
            b.implosionTimer -= 16.666 * dtClamped;
            this.createScreenShake(12);
            for (let i = 0; i < this.maxMeteors; i++) {
                const m = this.meteors[i];
                if (!m.active) continue;
                const dx = b.x - m.x;
                const dy = b.y - m.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < 900) {
                    this.createExplosionParticles(m.x, m.y, m.size * 0.4, m.color);
                    m.active = false;
                    this.scrap += 1;
                    continue;
                }

                const dist = Math.sqrt(distSq) || 1;
                const force = 12000 / (distSq + 100);
                m.vx += (dx / dist) * force * dtClamped;
                m.vy += (dy / dist) * force * dtClamped;
            }

            if (b.implosionTimer <= 0) {
                this.triggerNebulaTitanEvolution();
            }
        }
        else if (b.state === 'titan') {
            const tier = b.encounterTier || 1;
            const trackSpeed = 1.0 + (tier - 1) * 0.08;
            this._bossTrackPlayerX(b, dtClamped, trackSpeed, 150);

            // dt 累积相位（原: Date.now()*0.0025）保证暂停后不会突跳
            b.titanWobblePhase = (b.titanWobblePhase || 0) + 0.0025 * 16.666 * dtClamped;
            b.y = b.targetY + Math.sin(b.titanWobblePhase) * 15;

            const rockInterval = Math.max(1600, 2200 - (tier - 1) * 120);
            const rippleInterval = Math.max(2800, 4000 - (tier - 1) * 150);
            const laserInterval = Math.max(5000, 7500 - (tier - 1) * 350);

            b.rockTimer += 16.666 * dtClamped;
            b.rippleTimer += 16.666 * dtClamped;
            b.laserTimer += 16.666 * dtClamped;
            b.titanAngle += 0.03 * dtClamped;

            if (b.rockTimer > rockInterval) {
                b.rockTimer = 0;
                this.titanRockVomit();
            }

            if (b.rippleTimer > rippleInterval) {
                b.rippleTimer = 0;
                this.titanGravityRipple();
            }

            if (b.laserTimer > laserInterval) {
                b.laserTimer = 0;
                this.titanStartDeathLaser();
            }

            if (b.laserActive) {
                b.laserSweepTimer -= 16.666 * dtClamped;
                if (b.laserSweepTimer <= 0) {
                    b.laserActive = false;
                    b.laserDamageCarry = 0;
                } else {
                    // V7: 360-degree sweep continuous linear angle accumulation (modulo 2π to prevent float precision loss)
                    b.laserAnglePhase = ((b.laserAnglePhase || 0) + 0.0035 * 16.666 * dtClamped) % (Math.PI * 2);
                    b.laserAngle = b.laserAnglePhase;
                    this.checkTitanLaserCollision(dtClamped);
                }
            }

            const core = b.parts.core;
            const mainPct = document.getElementById('bossMainPercent');
            const mainBar = document.getElementById('bossMainHpBar');
            if (mainPct) mainPct.innerText = `${Math.ceil((core.hp / core.maxHp) * 100)}%`;
            if (mainBar) mainBar.style.width = `${(core.hp / core.maxHp) * 100}%`;

            const shieldText = document.getElementById('partHpShield');
            const shieldBar = document.getElementById('partBarShield');
            if (shieldText) shieldText.innerText = '⚡ 核心聚变共鸣中';
            if (shieldBar) shieldBar.style.width = '100%';
            const leftText = document.getElementById('partHpLeft');
            const leftBar = document.getElementById('partBarLeft');
            if (leftText) leftText.innerText = '🛡️ 量子碎石外环';
            if (leftBar) leftBar.style.width = '100%';
            const rightText = document.getElementById('partHpRight');
            const rightBar = document.getElementById('partBarRight');
            if (rightText) rightText.innerText = '🛡️ 量子碎石外环';
            if (rightBar) rightBar.style.width = '100%';
        }
    },

    updateWorm(dtClamped) {
        const b = this.boss;
        const parts = b.parts;
        const segCount = b.wormSegmentCount || 10;
        let head = null;
        let activeCount = 0;
        let totalHp = 0;
        let totalMaxHp = 0;

        for (let i = 0; i < segCount; i++) {
            const part = parts[`segment${i}`];
            if (!part) continue;
            if (part.active) {
                activeCount++;
                totalHp += part.hp;
                totalMaxHp += part.maxHp;
                if (!head || part.isHead) {
                    head = part;
                }
            } else if (!part.splitHandled) {
                // 仅在该段刚死的那一帧处理一次断裂事件（wasHead 是持久标记，isHead 在此清零）
                part.splitHandled = true;
                part.isHead = false;
                const nextPart = parts[`segment${i + 1}`];
                if (nextPart && nextPart.active && !nextPart.isHead) {
                    if (part.wasHead) {
                        // 颚颅被毁：下一节必须接替，不受分裂头数量限制
                        nextPart.isHead = true;
                        nextPart.wasHead = true;
                        nextPart.label = "巨兽颚颅";
                    } else {
                        let activeHeads = 0;
                        for (let k = 0; k < segCount; k++) {
                            const p = parts[`segment${k}`];
                            if (p && p.active && p.isHead) activeHeads++;
                        }
                        const maxHeads = b.maxSplitHeads || 3;
                        if (activeHeads < maxHeads) {
                            nextPart.isHead = true;
                            nextPart.wasHead = true;
                            nextPart.label = "分裂突变首";
                            this.addFloatText(nextPart.x, nextPart.y, "🦠 躯体断裂！产生分裂突变！", "#f43f5e", 14);
                        }
                    }
                }
            }
        }

        if (activeCount === 0) {
            this.triggerWormPhase2();
            return;
        }

        const mainPct = document.getElementById('bossMainPercent');
        const mainBar = document.getElementById('bossMainHpBar');
        if (mainPct) mainPct.innerText = `${Math.ceil((totalHp / totalMaxHp) * 100)}%`;
        if (mainBar) mainBar.style.width = `${(totalHp / totalMaxHp) * 100}%`;

        const headSpeed = b.headSpeed || 4;
        const devourMult = b.devourMultiplier || 2;

        for (let i = 0; i < segCount; i++) {
            const part = parts[`segment${i}`];
            if (!part || !part.active) continue;

            if (part.isHead) {
                const tx = this.player.x;
                const ty = this.player.y;

                // 沿途吞噬：只咬碰到的陨石，不改变追玩家方向
                for (let j = 0; j < this.maxMeteors; j++) {
                    const m = this.meteors[j];
                    if (!m.active) continue;
                    const distSq = (m.x - part.x) ** 2 + (m.y - part.y) ** 2;
                    const eatRadius = part.radius + m.radius;
                    if (distSq < eatRadius * eatRadius) {
                        m.active = false;
                        part.hp = Math.min(part.maxHp, part.hp + m.hp * devourMult);
                        this.createHitParticles(part.x, part.y, "#10b981");
                        sfx.playHit();
                        this.addFloatText(part.x, part.y, "DEVOUR +HP", "#10b981", 12);
                    }
                }

                const dx = tx - part.x;
                const dy = ty - part.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                part.x += (dx / dist) * headSpeed * dtClamped;
                part.y += (dy / dist) * headSpeed * dtClamped;

                part.x = Math.max(part.radius, Math.min(this.logicalWidth - part.radius, part.x));
                part.y = Math.max(-100, Math.min(this.logicalHeight + 100, part.y));

            } else {
                let prevIdx = i - 1;
                while (prevIdx >= 0 && (!parts[`segment${prevIdx}`] || !parts[`segment${prevIdx}`].active)) {
                    prevIdx--;
                }
                if (prevIdx >= 0) {
                    const leader = parts[`segment${prevIdx}`];
                    const dx = leader.x - part.x;
                    const dy = leader.y - part.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const targetDist = leader.radius + part.radius - 5;

                    if (dist > targetDist) {
                        const speed = 5 + (b.encounterTier || 1) * 0.15;
                        part.x += (dx / dist) * speed * dtClamped;
                        part.y += (dy / dist) * speed * dtClamped;
                    }
                }
            }

            const pDistSq = (this.player.x - part.x) ** 2 + (this.player.y - part.y) ** 2;
            if (pDistSq < (this.player.width / 2 + part.radius) ** 2) {
                if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
                    const tier = b.encounterTier || 1;
                    this.damagePlayer(part.isHead ? Math.floor(25 + tier * 2) : Math.floor(10 + tier));
                    const dx = this.player.x - part.x;
                    const dy = this.player.y - part.y;
                    this.player.x += dx > 0 ? 30 : -30;
                    this.player.y += dy > 0 ? 30 : -30;
                }
            }
        }
    },

    triggerBossImplosion() {
        const b = this.boss;
        b.state = 'implosion';
        b.implosionTimer = 3000;
        this.createScreenShake(30);
        sfx.playBomb();
        this.addFloatText(b.x, b.y, "⚠️ 发现高能引力坍缩奇点！", "#ec4899", 20);
        this.showToast("🚨 警告：母舰发生大坍缩！正在吸扯全屏碎石重组！");
    },

    triggerWormPhase2() {
        const b = this.boss;
        const tier = b.encounterTier || 1;
        
        // V7: 清理蠕虫残留体节数据，释放内存
        b.segments = null;
        b.wormSegmentCount = 0;

        // Transform the boss type and state into the titan implosion sequence
        b.type = 'titan';
        b.state = 'implosion';
        b.implosionTimer = 3000;
        b.x = this.logicalWidth / 2;
        b.y = this.logicalHeight / 3;
        b.targetY = this._bossTargetY(180, 150);
        b.titanAngle = 0;
        b.titanWobblePhase = 0;
        b.laserAnglePhase = 0;
        b.vx = 1.2 + (tier - 1) * 0.08;

        const titanCoreHp = this._scaledBossHp(800, tier);
        const shieldHp = this._scaledBossHp(200, tier);
        const wingHp = this._scaledBossHp(150, tier);
        const radiusBonus = (tier - 1) * 2;
        
        b.parts = {
            shieldCore: { hp: shieldHp, maxHp: shieldHp, active: true, offset: { x: 0, y: -25 }, radius: 25 + radiusBonus, label: "防护罩发生器" },
            leftWing: { hp: wingHp, maxHp: wingHp, active: true, offset: { x: -85, y: 15 }, radius: 25 + radiusBonus, label: "左排炮翼" },
            rightWing: { hp: wingHp, maxHp: wingHp, active: true, offset: { x: 85, y: 15 }, radius: 25 + radiusBonus, label: "右排炮翼" },
            core: { hp: titanCoreHp, maxHp: titanCoreHp, active: true, offset: { x: 0, y: 20 }, radius: 45 + radiusBonus, label: "巨神兵心脏" }
        };
        
        b.rockTimer = 0;
        b.rippleTimer = 0;
        b.laserTimer = 0;
        b.laserActive = false;
        b.laserAngle = 0;

        this.createScreenShake(35);
        sfx.playBomb();
        this.addFloatText(b.x, b.y, "⚠️ 吞噬颚颅碎裂！引力星轨聚能！", "#ef4444", 20);
        this.showToast("🚨 绝境警告：吞噬蠕虫头部蜕变为星云奇点核心！开始重构碎岩星环！");
        this._setBossTitle(`💀 星云星环吞噬者${this._bossTierLabel(tier)}`);
        this._showBossHpGroup();
    },

    triggerNebulaTitanEvolution() {
        const b = this.boss;
        const tier = b.encounterTier || 1;
        const titanCoreHp = this._scaledBossHp(800, tier);

        b.state = 'titan';
        // titan 形态碎石环外径 135 + 15 安全裕量；加上 ±15 的 wobble 在内
        b.targetY = this._bossTargetY(180, 150);
        b.titanAngle = 0;
        b.titanWobblePhase = 0; // y 抖动相位，dt 累积以免暂停跳变
        b.laserAnglePhase = 0;  // 死光横扫角度相位，同上
        b.vx = 1.2 + (tier - 1) * 0.08;

        b.parts.core.active = true;
        b.parts.core.hp = titanCoreHp;
        b.parts.core.maxHp = titanCoreHp;
        b.parts.core.radius = 45 + (tier - 1) * 3;
        b.parts.core.label = "巨神兵心脏";

        b.rockTimer = 0;
        b.rippleTimer = 0;
        b.laserTimer = 0;
        b.laserActive = false;
        b.laserAngle = 0;

        sfx.playPowerup();
        this.createScreenShake(40);

        this.createExplosionParticles(b.x, b.y, 160, '#fbbf24');
        this.createExplosionParticles(b.x, b.y, 120, '#d946ef');

        this.addFloatText(b.x, b.y, `💀 星云巨神兵${this._bossTierLabel(tier)} 降临！`, "#d946ef", 24);
        this._setBossTitle(`💀 星云巨神兵${this._bossTierLabel(tier)}`);
        this.showToast("😱 终极灾难：吸附碎石后的【星云巨神兵】觉醒！");
    },

    titanRockVomit() {
        const b = this.boss;
        const tier = b.encounterTier || 1;
        const rockCount = Math.min(6 + Math.floor(tier / 2), 10);
        sfx.playHit();
        this.addFloatText(b.x, b.y + 40, "✨ 陨岩狂飙！", "#fb923c", 14);
        for (let n = 0; n < rockCount; n++) {
            const angle = (n / rockCount) * Math.PI * 2;
            this.spawnMeteorInPool({
                x: b.x + Math.cos(angle) * 40,
                y: b.y + Math.sin(angle) * 40 + 20,
                size: 28 + tier * 2,
                radius: 14 + tier,
                vx: Math.cos(angle) * (4 + tier * 0.2),
                vy: Math.sin(angle) * (4 + tier * 0.2) + 1.5,
                hp: 18 + tier * 4,
                maxHp: 18 + tier * 4,
                type: 'fast',
                angle: angle,
                spinSpeed: 0.03,
                numPoints: 8,
                color: '#fb923c'
            });
        }
    },

    titanGravityRipple() {
        const b = this.boss;
        const tier = b.encounterTier || 1;
        sfx.playGravityRipple();
        this.addFloatText(b.x, b.y + 45, "🌀 重力涟漪！", "#a78bfa", 16);
        this.createScreenShake(20);

        const ripple = this.acquirePoolSlot(this.titanRipples);
        if (ripple) {
            ripple.x = b.x;
            ripple.y = b.y;
            ripple.radius = 10;
            ripple.maxRadius = 400 + tier * 40;
            ripple.alpha = 1.0;
            ripple.color = null;
            ripple.active = true;
        }

        const dx = this.player.x - b.x;
        const dy = this.player.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const pushForce = 35 + tier * 4;
        this.player.x += (dx / dist) * pushForce;
        this.player.y += (dy / dist) * pushForce;

        if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
            this.damagePlayer(10 + tier * 2);
        }
    },

    titanStartDeathLaser() {
        const b = this.boss;
        b.laserActive = true;
        b.laserSweepTimer = 1800;
        b.laserAngle = 0;
        b.laserAnglePhase = 0; // 每次起手都从 0 相位开始
        b.laserDamageCarry = 0;
        sfx.playTitanLaser();
        this.addFloatText(b.x, b.y + 50, "💥 OVERLOAD DEATH LASER!", "#ef4444", 22);
        this.showToast("⚠️ 警报：巨神兵正在积蓄能量释放横扫切割死光！");
    },

    checkTitanLaserCollision(dtClamped) {
        const b = this.boss;
        if (!b || !b.laserActive) return;

        const angles = [Math.PI / 2 - 0.4 + b.laserAngle, Math.PI / 2 + 0.4 - b.laserAngle];

        for (let ai = 0; ai < angles.length; ai++) {
            const angle = angles[ai];
            const x1 = b.x;
            const y1 = b.y + 20;
            const x2 = b.x + Math.cos(angle) * 1000;
            const y2 = b.y + Math.sin(angle) * 1000;

            const px = this.player.x;
            const py = this.player.y;

            const dx = px - x1;
            const dy = py - y1;

            const lx = x2 - x1;
            const ly = y2 - y1;
            const len = Math.sqrt(lx * lx + ly * ly) || 1;
            const u = (dx * lx + dy * ly) / (len * len);

            const clampedU = Math.max(0, Math.min(1, u));
            const nx = x1 + clampedU * lx;
            const ny = y1 + clampedU * ly;

            const distSq = (px - nx) * (px - nx) + (py - ny) * (py - ny);
            if (distSq < 900) {
                if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
                    b.laserDamageCarry = (b.laserDamageCarry || 0) + 1.2 * dtClamped;
                    const laserDamage = Math.floor(b.laserDamageCarry);
                    if (laserDamage > 0) {
                        b.laserDamageCarry -= laserDamage;
                        this.damagePlayer(laserDamage);
                        this.createScreenShake(6);
                    }
                } else {
                    this.addFloatText(px, py - 30, "LASER BLOCKED!", "#06b6d4", 11);
                }
            }
        }
    },

    bossShoot() {
        if (!this.boss || !this.boss.active) return;
        const b = this.boss;
        const tier = b.encounterTier || 1;
        const bulletHp = 12 + tier * 3;

        if (b.parts.shieldCore.active) {
            const spread = 0.4 + (tier - 1) * 0.04;
            for (let angle = -spread; angle <= spread; angle += 0.2) {
                this.spawnMeteorInPool({
                    x: b.x,
                    y: b.y + b.parts.shieldCore.offset.y + 10,
                    size: 16 + tier,
                    radius: 8 + tier * 0.5,
                    vx: Math.sin(angle) * (3 + tier * 0.15),
                    vy: Math.cos(angle) * (3.5 + tier * 0.15),
                    hp: bulletHp,
                    maxHp: bulletHp,
                    type: 'fast',
                    angle: 0,
                    spinSpeed: 0.01,
                    numPoints: 8,
                    color: '#06b6d4'
                });
            }
        }

        if (b.parts.leftWing.active) {
            this.spawnMeteorInPool({
                x: b.x + b.parts.leftWing.offset.x,
                y: b.y + b.parts.leftWing.offset.y,
                size: 20 + tier,
                radius: 10 + tier * 0.5,
                vx: -1.5 - tier * 0.1,
                vy: 4 + tier * 0.1,
                hp: bulletHp + 3,
                maxHp: bulletHp + 3,
                type: 'fast',
                angle: 0,
                spinSpeed: 0.02,
                numPoints: 8,
                color: '#fb923c'
            });
        }

        if (b.parts.rightWing.active) {
            this.spawnMeteorInPool({
                x: b.x + b.parts.rightWing.offset.x,
                y: b.y + b.parts.rightWing.offset.y,
                size: 20 + tier,
                radius: 10 + tier * 0.5,
                vx: 1.5 + tier * 0.1,
                vy: 4 + tier * 0.1,
                hp: bulletHp + 3,
                maxHp: bulletHp + 3,
                type: 'fast',
                angle: 0,
                spinSpeed: -0.02,
                numPoints: 8,
                color: '#fb923c'
            });
        }

        if (b.parts.rearBattery && b.parts.rearBattery.active) {
            this.spawnMeteorInPool({
                x: b.x + b.parts.rearBattery.offset.x,
                y: b.y + b.parts.rearBattery.offset.y,
                size: 18 + tier,
                radius: 9 + tier * 0.5,
                vx: 0,
                vy: 5 + tier * 0.15,
                hp: bulletHp + 5,
                maxHp: bulletHp + 5,
                type: 'fast',
                angle: 0,
                spinSpeed: 0.02,
                numPoints: 8,
                color: '#a78bfa'
            });
        }
    },

    destroyBossEpic() {
        const tier = this.boss.encounterTier || 1;
        this.boss.active = false;
        this.createScreenShake(45);
        sfx.playExplosion(true);
        const bX = this.boss.x !== undefined ? this.boss.x : this.logicalWidth / 2;
        const bY = this.boss.y !== undefined ? this.boss.y : this.logicalHeight / 3;
        this.addFloatText(bX, bY, `🏆 第${tier}阶 BOSS 歼灭！`, "#10b981", 24);
        this.scrap += 150 + tier * 45;
        this.score += 5000 + tier * 1500;

        if (!this.bossTiersDefeatedThisRun) this.bossTiersDefeatedThisRun = [];
        this.bossTiersDefeatedThisRun.push(tier);
        this.bossTier = tier;
        this.bossSpawnCooldown = BOSS_SPAWN_COOLDOWN_MS;
        this._refreshNextBossThreshold();
        const nextTier = tier + 1;
        const cooldownSec = Math.ceil(BOSS_SPAWN_COOLDOWN_MS / 1000);
        this.showToast(`🛰 ${cooldownSec}秒后下一阶首领登场 (第${nextTier}阶 · ${this.nextBossThreshold}分)`);

        const hpGroup = document.getElementById('bossHpGroup');
        if (hpGroup) hpGroup.classList.add('hidden');
        this.boss = null;
    }

});
