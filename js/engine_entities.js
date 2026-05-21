// =============================================
// 星海猎手 V6: GameEngine - ENTITIES 模块
// =============================================

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

        this.slot1UI.innerText = slots[0] ? slots[0].toUpperCase() : '空';
        this.slot1UI.className = `px-1.5 h-6 min-w-[24px] rounded-lg border text-[10px] font-black flex items-center justify-center transition-all ` + this.getElementColorClass(slots[0]);

        this.slot2UI.innerText = slots[1] ? slots[1].toUpperCase() : '空';
        this.slot2UI.className = `px-1.5 h-6 min-w-[24px] rounded-lg border text-[10px] font-black flex items-center justify-center transition-all ` + this.getElementColorClass(slots[1]);

        const comboKey = this.player.comboKey || '';
        const currentSynergy = WEAPONS_NAMES[comboKey] || WEAPONS_NAMES[slots[0]] || '';
        const displayName = currentSynergy || '基础高频激光';
        this.synergyNameUI.innerText = displayName;
        this.synergyNameUI.title = displayName; // hover/长按显示完整名，防 truncate 截断
        if (this.player) {
            this.player.synergyName = currentSynergy;
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

        if (this.score >= 3500 && !this.boss && !this.bossSpawned) {
            this.wave = 3;
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

        if (this.boss && this.boss.active) return;

        const spawnRate = Math.max(400, 1500 - (this.wave * 120)); 
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
            color: this.getMeteorColor(type)
        });
    },

    getMeteorColor(type) {
        switch(type) {
            case 'splitter': return '#d946ef';
            case 'fast': return '#fb923c';
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

    pickupPowerup(type) {
        sfx.playPowerup();

        if (['EM', 'Frost', 'Fire', 'Rad'].includes(type)) {
            this.pickupElement(type);
            return;
        }

        this.addFloatText(this.player.x, this.player.y - 40, `${type.toUpperCase()}!`, '#4ade80', 20);
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
            default: return '⚙️';
        }
    }

});
