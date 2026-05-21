// =============================================
// 星海猎手 V6: GameEngine - BOSS 模块
// =============================================

Object.assign(GameEngine.prototype, {
    spawnBoss() {
        this.bossSpawned = true;
        if (Math.random() < 0.5) {
            this.spawnTitanBoss();
        } else {
            this.spawnAsteroidWorm();
        }
    },

    spawnTitanBoss() {
        this.boss = {
            type: 'titan',
            state: 'mothership',
            x: this.logicalWidth / 2,
            y: -150,
            targetY: 160,
            width: 220,
            height: 100,
            vx: 1.5,
            bulletTimer: 0,
            active: true,
            parts: {
                shieldCore: { hp: 200, maxHp: 200, active: true, offset: { x: 0, y: -25 }, radius: 25, label: "防护罩发生器" },
                leftWing: { hp: 150, maxHp: 150, active: true, offset: { x: -85, y: 15 }, radius: 25, label: "左排炮翼" },
                rightWing: { hp: 150, maxHp: 150, active: true, offset: { x: 85, y: 15 }, radius: 25, label: "右排炮翼" },
                core: { hp: 500, maxHp: 500, active: true, offset: { x: 0, y: 20 }, radius: 35, label: "核心本体" }
            }
        };
        this.addFloatText(this.logicalWidth / 2, 200, "🚨 敌军超级母舰空降！！", "#ef4444", 22);
        document.getElementById('bossMainTitle').innerText = "⚠️ 星际掠夺者号 (Phase Reaver)";
        document.getElementById('bossHpGroup').classList.remove('hidden');
    },

    spawnAsteroidWorm() {
        this.boss = {
            type: 'worm',
            active: true,
            parts: {}
        };
        
        let startY = -400;
        let startX = this.logicalWidth / 2;
        
        for (let i = 0; i < 10; i++) {
            const isHead = i === 0;
            const hp = isHead ? 1500 : 400;
            const radius = isHead ? 40 : (30 - i * 1.5);
            this.boss.parts[`segment${i}`] = {
                hp: hp,
                maxHp: hp,
                active: true,
                x: startX,
                y: startY - i * 30,
                vx: 0,
                vy: 0,
                radius: radius,
                label: isHead ? "巨兽颚颅" : "吞噬者骨节",
                isHead: isHead,
                idx: i
            };
        }
        
        this.addFloatText(this.logicalWidth / 2, 200, "🚨 警告：深空星体吞噬者出现！！", "#10b981", 22);
        document.getElementById('bossMainTitle').innerText = "💀 吞噬蠕虫 (Asteroid Devourer)";
        document.getElementById('bossHpGroup').classList.remove('hidden');
        document.getElementById('partHpShield').innerText = "未激活";
        document.getElementById('partBarShield').style.width = "0%";
        document.getElementById('partHpLeft').innerText = "未激活";
        document.getElementById('partBarLeft').style.width = "0%";
        document.getElementById('partHpRight').innerText = "未激活";
        document.getElementById('partBarRight').style.width = "0%";
    },

    updateBoss(dtClamped) {
        if (!this.boss || !this.boss.active) return;
        const b = this.boss;

        if (b.type === 'worm') {
            this.updateWorm(dtClamped);
            return;
        }

        if (b.state === 'mothership') {
            if (b.y < b.targetY) {
                b.y += 1.5 * dtClamped;
            } else {
                b.x += b.vx * dtClamped;
                if (b.x < 130 || b.x > this.logicalWidth - 130) {
                    b.vx *= -1;
                }
            }

            b.bulletTimer += 16.666 * dtClamped;
            if (b.bulletTimer > 1200) {
                b.bulletTimer = 0;
                this.bossShoot();
            }

            const core = b.parts.core;
            const shield = b.parts.shieldCore;
            const left = b.parts.leftWing;
            const right = b.parts.rightWing;

            document.getElementById('bossMainPercent').innerText = `${Math.ceil((core.hp / core.maxHp) * 100)}%`;
            document.getElementById('bossMainHpBar').style.width = `${(core.hp / core.maxHp) * 100}%`;

            document.getElementById('partHpShield').innerText = shield.active ? `${Math.ceil((shield.hp / shield.maxHp) * 100)}%` : '❌ 已瘫痪';
            document.getElementById('partBarShield').style.width = shield.active ? `${(shield.hp / shield.maxHp) * 100}%` : '0%';

            document.getElementById('partHpLeft').innerText = left.active ? `${Math.ceil((left.hp / left.maxHp) * 100)}%` : '❌ 已炸飞';
            document.getElementById('partBarLeft').style.width = left.active ? `${(left.hp / left.maxHp) * 100}%` : '0%';

            document.getElementById('partHpRight').innerText = right.active ? `${Math.ceil((right.hp / right.maxHp) * 100)}%` : '❌ 已炸飞';
            document.getElementById('partBarRight').style.width = right.active ? `${(right.hp / right.maxHp) * 100}%` : '0%';
        } 
        else if (b.state === 'implosion') {
            b.implosionTimer -= 16.666 * dtClamped;
            this.createScreenShake(12);
            // Pull all active meteors towards Boss core (b.x, b.y)
            for (let i = 0; i < this.maxMeteors; i++) {
                const m = this.meteors[i];
                if (!m.active) continue;
                const dx = b.x - m.x;
                const dy = b.y - m.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < 900) { // 30 * 30 = 900
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
            b.x += b.vx * 0.5 * dtClamped;
            if (b.x < 150 || b.x > this.logicalWidth - 150) {
                b.vx *= -1;
            }
            
            b.y = b.targetY + Math.sin(Date.now() * 0.0025) * 15;
            
            b.rockTimer += 16.666 * dtClamped;
            b.rippleTimer += 16.666 * dtClamped;
            b.laserTimer += 16.666 * dtClamped;
            b.titanAngle += 0.03 * dtClamped;
            
            if (b.rockTimer > 2200) {
                b.rockTimer = 0;
                this.titanRockVomit();
            }
            
            if (b.rippleTimer > 4000) {
                b.rippleTimer = 0;
                this.titanGravityRipple();
            }
            
            if (b.laserTimer > 7500) {
                b.laserTimer = 0;
                this.titanStartDeathLaser();
            }
            
            if (b.laserActive) {
                b.laserSweepTimer -= 16.666 * dtClamped;
                if (b.laserSweepTimer <= 0) {
                    b.laserActive = false;
                } else {
                    b.laserAngle = 0.5 * Math.sin(Date.now() * 0.005);
                    this.checkTitanLaserCollision(dtClamped);
                }
            }
            
            const core = b.parts.core;
            document.getElementById('bossMainPercent').innerText = `${Math.ceil((core.hp / core.maxHp) * 100)}%`;
            document.getElementById('bossMainHpBar').style.width = `${(core.hp / core.maxHp) * 100}%`;
            
            document.getElementById('partHpShield').innerText = '⚡ 核心聚变共鸣中';
            document.getElementById('partBarShield').style.width = '100%';
            document.getElementById('partHpLeft').innerText = '🛡️ 量子碎石外环';
            document.getElementById('partBarLeft').style.width = '100%';
            document.getElementById('partHpRight').innerText = '🛡️ 量子碎石外环';
            document.getElementById('partBarRight').style.width = '100%';
        }
    },

    updateWorm(dtClamped) {
        const b = this.boss;
        const parts = b.parts;
        let head = null;
        let activeCount = 0;
        let totalHp = 0;
        let totalMaxHp = 0;
        
        for (let i = 0; i < 10; i++) {
            const part = parts[`segment${i}`];
            if (!part) continue;
            if (part.active) {
                activeCount++;
                totalHp += part.hp;
                totalMaxHp += part.maxHp;
                if (!head || part.isHead) {
                    head = part; // The lowest index active part acts as the head
                }
            } else {
                // Segment dead logic: split the worm.
                // Since this segment is dead, the next segment becomes a new head.
                const nextPart = parts[`segment${i+1}`];
                if (nextPart && nextPart.active && !nextPart.isHead) {
                    // Count active heads
                    let activeHeads = 0;
                    for (let k = 0; k < 10; k++) {
                        const p = parts[`segment${k}`];
                        if (p && p.active && p.isHead) activeHeads++;
                    }
                    
                    if (activeHeads < 3) {
                        nextPart.isHead = true;
                        nextPart.label = "分裂突变首";
                        this.addFloatText(nextPart.x, nextPart.y, "🦠 躯体断裂！产生分裂突变！", "#f43f5e", 14);
                    }
                }
            }
        }
        
        if (activeCount === 0) {
            this.destroyBossEpic();
            return;
        }

        document.getElementById('bossMainPercent').innerText = `${Math.ceil((totalHp / totalMaxHp) * 100)}%`;
        document.getElementById('bossMainHpBar').style.width = `${(totalHp / totalMaxHp) * 100}%`;

        // Update each segment
        for (let i = 0; i < 10; i++) {
            const part = parts[`segment${i}`];
            if (!part || !part.active) continue;
            
            if (part.isHead) {
                // Seek nearest active meteor
                let targetMeteor = null;
                let minDist = 999999;
                for (let j = 0; j < this.maxMeteors; j++) {
                    const m = this.meteors[j];
                    if (m.active) {
                        const distSq = (m.x - part.x)**2 + (m.y - part.y)**2;
                        if (distSq < minDist) {
                            minDist = distSq;
                            targetMeteor = m;
                        }
                    }
                }
                
                let tx = this.player.x;
                let ty = this.player.y;
                if (targetMeteor) {
                    tx = targetMeteor.x;
                    ty = targetMeteor.y;
                    
                    if (minDist < (part.radius + targetMeteor.radius)**2) {
                        // Eat meteor
                        targetMeteor.active = false;
                        part.hp = Math.min(part.maxHp, part.hp + targetMeteor.hp * 2);
                        this.createHitParticles(part.x, part.y, "#10b981");
                        sfx.playHit();
                        this.addFloatText(part.x, part.y, "DEVOUR +HP", "#10b981", 12);
                    }
                }
                
                // Kinematics: move towards target
                const speed = 4;
                const dx = tx - part.x;
                const dy = ty - part.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                part.x += (dx/dist) * speed * dtClamped;
                part.y += (dy/dist) * speed * dtClamped;
                
                // Keep head in bounds
                part.x = Math.max(part.radius, Math.min(this.logicalWidth - part.radius, part.x));
                part.y = Math.max(-100, Math.min(this.logicalHeight + 100, part.y));
                
            } else {
                // Follow the previous active segment
                let prevIdx = i - 1;
                while (prevIdx >= 0 && (!parts[`segment${prevIdx}`] || !parts[`segment${prevIdx}`].active)) {
                    prevIdx--;
                }
                if (prevIdx >= 0) {
                    const leader = parts[`segment${prevIdx}`];
                    const dx = leader.x - part.x;
                    const dy = leader.y - part.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const targetDist = leader.radius + part.radius - 5;
                    
                    if (dist > targetDist) {
                        const speed = 5;
                        part.x += (dx/dist) * speed * dtClamped;
                        part.y += (dy/dist) * speed * dtClamped;
                    }
                }
            }
            
            // Collision with player
            const pDistSq = (this.player.x - part.x)**2 + (this.player.y - part.y)**2;
            if (pDistSq < (this.player.width/2 + part.radius)**2) {
                if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
                    this.damagePlayer(part.isHead ? 25 : 10);
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

    triggerNebulaTitanEvolution() {
        const b = this.boss;
        b.state = 'titan';
        b.targetY = 180;
        b.titanAngle = 0;
        b.vx = 1.2;
        
        b.parts.core.active = true;
        b.parts.core.hp = 800;
        b.parts.core.maxHp = 800;
        b.parts.core.radius = 45;
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
        
        this.addFloatText(b.x, b.y, "💀 星云巨神兵 NEBULA TITAN 降临！", "#d946ef", 24);
        document.getElementById('bossMainTitle').innerText = "💀 星云巨神兵 (Nebula Titan)";
        this.showToast("😱 终极灾难：吸附碎石后的【星云巨神兵】觉醒！");
    },

    titanRockVomit() {
        const b = this.boss;
        sfx.playHit();
        this.addFloatText(b.x, b.y + 40, "✨ 陨岩狂飙！", "#fb923c", 14);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
            this.spawnMeteorInPool({
                x: b.x + Math.cos(angle) * 40,
                y: b.y + Math.sin(angle) * 40 + 20,
                size: 28,
                radius: 14,
                vx: Math.cos(angle) * 4,
                vy: Math.sin(angle) * 4 + 1.5,
                hp: 18,
                maxHp: 18,
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
        sfx.playGravityRipple();
        this.addFloatText(b.x, b.y + 45, "🌀 重力涟漪！", "#a78bfa", 16);
        this.createScreenShake(20);
        
        const ripple = this.acquirePoolSlot(this.titanRipples);
        if (ripple) {
            ripple.x = b.x;
            ripple.y = b.y;
            ripple.radius = 10;
            ripple.maxRadius = 400;
            ripple.alpha = 1.0;
            ripple.color = null;
            ripple.active = true;
        }
        
        const dx = this.player.x - b.x;
        const dy = this.player.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const pushForce = 35;
        this.player.x += (dx / dist) * pushForce;
        this.player.y += (dy / dist) * pushForce;
        
        if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
            this.damagePlayer(10);
        }
    },

    titanStartDeathLaser() {
        const b = this.boss;
        b.laserActive = true;
        b.laserSweepTimer = 1800;
        b.laserAngle = 0;
        sfx.playTitanLaser();
        this.addFloatText(b.x, b.y + 50, "💥 OVERLOAD DEATH LASER!", "#ef4444", 22);
        this.showToast("⚠️ 警报：巨神兵正在积蓄能量释放横扫切割死光！");
    },

    checkTitanLaserCollision(dtClamped) {
        const b = this.boss;
        if (!b || !b.laserActive) return;
        
        const angles = [Math.PI/2 - 0.4 + b.laserAngle, Math.PI/2 + 0.4 - b.laserAngle];
        
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
                    this.damagePlayer(Math.floor(1.2 * dtClamped));
                    this.createScreenShake(6);
                } else {
                    this.addFloatText(px, py - 30, "LASER BLOCKED!", "#06b6d4", 11);
                }
            }
        }
    },

    bossShoot() {
        if (!this.boss || !this.boss.active) return;
        const b = this.boss;

        if (b.parts.shieldCore.active) {
            for (let angle = -0.4; angle <= 0.4; angle += 0.2) {
                this.spawnMeteorInPool({
                    x: b.x,
                    y: b.y + b.parts.shieldCore.offset.y + 10,
                    size: 16,
                    radius: 8,
                    vx: Math.sin(angle) * 3,
                    vy: Math.cos(angle) * 3.5,
                    hp: 12,
                    maxHp: 12,
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
                size: 20,
                radius: 10,
                vx: -1.5,
                vy: 4,
                hp: 15,
                maxHp: 15,
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
                size: 20,
                radius: 10,
                vx: 1.5,
                vy: 4,
                hp: 15,
                maxHp: 15,
                type: 'fast',
                angle: 0,
                spinSpeed: -0.02,
                numPoints: 8,
                color: '#fb923c'
            });
        }
    },

    destroyBossEpic() {
        this.boss.active = false;
        this.createScreenShake(45);
        sfx.playExplosion(true);
        const bX = this.boss.x !== undefined ? this.boss.x : this.logicalWidth / 2;
        const bY = this.boss.y !== undefined ? this.boss.y : this.logicalHeight / 3;
        this.addFloatText(bX, bY, "🏆 战役大捷 • BOSS歼灭！", "#10b981", 24);
        this.scrap += 150;
        this.score += 5000;
        document.getElementById('bossHpGroup').classList.add('hidden');
        this.boss = null;
    }

});
