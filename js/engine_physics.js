// =============================================
// 星海猎手 V6: GameEngine - PHYSICS 模块
// =============================================

// 微信小游戏 CommonJS 模块隔离下，本模块作用域看不到 engine_base.js 顶层 class GameEngine。
// H5 下 typeof === 'function'（lexical 全局），微信下从 GameGlobal 取。
var __GE = (typeof GameEngine !== 'undefined') ? GameEngine : GameGlobal.GameEngine;
function __sfx() { return (typeof sfx !== 'undefined') ? sfx : GameGlobal.sfx; }

Object.assign(__GE.prototype, {
    spawnBulletInPool(props) {
        let bullet = null;
        for (let i = 0; i < this.maxBullets; i++) {
            const idx = (this.bulletSearchIndex + i) % this.maxBullets;
            if (!this.bullets[idx].active) {
                bullet = this.bullets[idx];
                this.bulletSearchIndex = (idx + 1) % this.maxBullets;
                break;
            }
        }
        if (bullet) {
            let damage = props.damage;
            let radius = props.radius;
            let color = props.color;
            if (this.slingshotTime > 0) {
                damage *= 2;
                radius *= 1.5;
                color = '#fbbf24'; // Neon gold
            }

            bullet.x = props.x;
            bullet.y = props.y;
            bullet.vx = props.vx;
            bullet.vy = props.vy;
            bullet.radius = radius;
            bullet.damage = damage;
            bullet.color = color;
            bullet.pierce = props.pierce || 1;
            bullet.comboEffect = props.comboEffect || null;
            bullet.active = true;
            return bullet;
        }
        return null;
    },

    spawnMeteorInPool(props) {
        let meteor = null;
        for (let i = 0; i < this.maxMeteors; i++) {
            const idx = (this.meteorSearchIndex + i) % this.maxMeteors;
            if (!this.meteors[idx].active) {
                meteor = this.meteors[idx];
                this.meteorSearchIndex = (idx + 1) % this.maxMeteors;
                break;
            }
        }
        if (meteor) {
            meteor.x = props.x;
            meteor.y = props.y;
            meteor.size = props.size;
            meteor.radius = props.radius;
            meteor.vx = props.vx;
            meteor.vy = props.vy;
            meteor.hp = props.hp;
            meteor.maxHp = props.maxHp;
            meteor.type = props.type;
            meteor.angle = props.angle;
            meteor.spinSpeed = props.spinSpeed;
            // P2: 就地拷贝 offsets 到预分配 Float32Array，避免 props.offsets 引用导致的临时数组泄漏
            const numPoints = props.numPoints || 8;
            const targetOffsets = meteor.offsets;
            if (props.offsets) {
                const len = Math.min(numPoints, targetOffsets.length, props.offsets.length);
                for (let k = 0; k < len; k++) targetOffsets[k] = props.offsets[k];
            } else {
                for (let k = 0; k < numPoints; k++) targetOffsets[k] = 1;
            }
            meteor.numPoints = numPoints;
            meteor.color = props.color;
            meteor.active = true;
            return meteor;
        }
        return null;
    },

    spawnBlackHole() {
        this.blackHole = {
            x: Math.random() * (this.logicalWidth - 200) + 100,
            y: Math.random() * (this.logicalHeight - 400) + 200,
            radius: 20,
            mass: 60,       
            maxMass: 250,   
            duration: 12000,
            active: true,
            pulse: 0
        };
        this.addFloatText(this.blackHole.x, this.blackHole.y - 40, "⚠️ 引力黑洞生成！", "#f43f5e", 16);
        if (Math.random() < 0.3) {
            this.spawnWhiteHole();
        }
    },

    spawnWhiteHole() {
        this.whiteHole = {
            x: Math.random() * (this.logicalWidth - 200) + 100,
            y: Math.random() * (this.logicalHeight - 400) + 200,
            radius: 22,
            mass: 70,
            duration: 10000,
            active: true,
            pulse: 0
        };
        this.addFloatText(this.whiteHole.x, this.whiteHole.y - 40, "🌀 斥力白洞诞生！", "#22d3ee", 16);
    },

    applyBlackHoleGravity(dtClamped) {
        if (!this.blackHole || !this.blackHole.active) return;

        const bh = this.blackHole;
        bh.duration -= 16.666 * dtClamped;
        bh.pulse += 0.08 * dtClamped;

        if (bh.duration <= 0) {
            this.blackHole = null;
            return;
        }

        const G = 0.5; 
        const pullRadiusSq = 67600; // 260 * 260 = 67600

        // Pulling bullets safely from pool
        for (let bIdx = 0; bIdx < this.maxBullets; bIdx++) {
            const b = this.bullets[bIdx];
            if (!b.active) continue;
            const dx = bh.x - b.x;
            const dy = bh.y - b.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < pullRadiusSq) {
                const pullThresh = bh.radius + 5;
                if (distSq < pullThresh * pullThresh) {
                    b.active = false;
                    continue;
                }
                const dist = Math.sqrt(distSq);
                const force = (G * bh.mass) / (distSq + 100);
                const distVal = dist || 1;
                b.vx += (dx / distVal) * force * dtClamped;
                b.vy += (dy / distVal) * force * dtClamped;
            }
        }

        // Pulling meteors safely from pool
        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active) continue;
            const dx = bh.x - m.x;
            const dy = bh.y - m.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < pullRadiusSq) {
                const dist = Math.sqrt(distSq);
                if (dist < bh.radius + 10) {
                    bh.mass += m.size * 0.4;
                    this.createExplosionParticles(m.x, m.y, m.size * 0.5, m.color);
                    m.active = false;
                    __sfx().playHit();
                    this.addFloatText(bh.x, bh.y - 30, "MASS++", "#ec4899", 11);

                    if (bh.mass >= bh.maxMass) {
                        this.triggerBlackHoleSupernova();
                        break;
                    }
                    continue;
                }

                const force = (G * bh.mass) / (distSq + 200);
                const distVal = dist || 1;
                m.vx += (dx / distVal) * force * 0.4 * dtClamped;
                m.vy += (dy / distVal) * force * 0.4 * dtClamped;
            }
        }

        // Pulling player ship
        const dxP = bh.x - this.player.x;
        const dyP = bh.y - this.player.y;
        const distPSq = dxP * dxP + dyP * dyP;
        if (distPSq < pullRadiusSq) {
            const distP = Math.sqrt(distPSq);
            if (distP > bh.radius + 30) {
                const force = (G * bh.mass) / (distP * 12 + 500);
                const distVal = distP || 1;
                this.player.x += (dxP / distVal) * force * dtClamped;
                this.player.y += (dyP / distVal) * force * dtClamped;
            }
        }
    },

    applyWhiteHoleGravity(dtClamped) {
        if (!this.whiteHole || !this.whiteHole.active) return;
        
        const wh = this.whiteHole;
        wh.duration -= 16.666 * dtClamped;
        wh.pulse += 0.08 * dtClamped;
        
        if (wh.duration <= 0) {
            this.whiteHole = null;
            return;
        }
        
        const G = 0.6;
        const pushRadiusSq = 57600; // 240 * 240
        const slingshotRadiusMinSq = 1225; // 35 * 35 = 1225
        const slingshotRadiusMaxSq = 4900; // 70 * 70 = 4900
        
        // Push active bullets outward (refract trajectory)
        for (let i = 0; i < this.maxBullets; i++) {
            const b = this.bullets[i];
            if (!b.active) continue;
            const dx = b.x - wh.x;
            const dy = b.y - wh.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < pushRadiusSq) {
                const dist = Math.sqrt(distSq) || 1;
                const force = (G * wh.mass) / (distSq + 150);
                b.vx += (dx / dist) * force * 1.5 * dtClamped;
                b.vy += (dy / dist) * force * 1.5 * dtClamped;
            }
        }
        
        // Push active meteors outward
        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active) continue;
            const dx = m.x - wh.x;
            const dy = m.y - wh.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < pushRadiusSq) {
                const dist = Math.sqrt(distSq) || 1;
                const force = (G * wh.mass) / (distSq + 200);
                m.vx += (dx / dist) * force * dtClamped;
                m.vy += (dy / dist) * force * dtClamped;
            }
        }
        
        // Push player ship and trigger slingshot surge!
        const dxP = this.player.x - wh.x;
        const dyP = this.player.y - wh.y;
        const distPSq = dxP * dxP + dyP * dyP;
        
        if (distPSq < pushRadiusSq) {
            const distP = Math.sqrt(distPSq) || 1;
            const force = (G * wh.mass) / (distPSq + 300);
            
            // Push player ship outward
            this.player.x += (dxP / distP) * force * dtClamped;
            this.player.y += (dyP / distP) * force * dtClamped;
            
            // Slingshot check: zone of [35px, 70px]
            if (distPSq >= slingshotRadiusMinSq && distPSq <= slingshotRadiusMaxSq) {
                if (!this.slingshotActivated) {
                    this.triggerSlingshotSurge();
                }
            }
        } else {
            this.slingshotActivated = false;
        }
    },

    triggerSlingshotSurge() {
        this.slingshotTime = 1500;
        this.slingshotActivated = true;
        __sfx().playSlingshot();
        this.createScreenShake(20);
        
        this.addFloatText(this.player.x, this.player.y - 50, "⚡ 引力弹弓爆发 SLINGSHOT SURGE! ⚡", "#fbbf24", 18);
        this.showToast("🌀 触发引力弹弓！无敌+狂暴射速已开启！");
        
        // Spawn glorious neon-gold particles
        this.createExplosionParticles(this.player.x, this.player.y, 40, '#fbbf24');
        
        if (this.currentSkin === 'void') {
            const ripple = this.acquirePoolSlot(this.titanRipples);
            if (ripple) {
                ripple.x = this.player.x;
                ripple.y = this.player.y;
                ripple.radius = 10;
                ripple.maxRadius = 800;
                ripple.alpha = 1.0;
                ripple.color = '217, 70, 239'; // #d946ef fuchsia
                ripple.active = true;
            }
        }
    },

    triggerBlackHoleSupernova() {
        if (!this.blackHole) return;
        const bh = this.blackHole;
        this.createScreenShake(30);
        __sfx().playBomb();
        
        this.createExplosionParticles(bh.x, bh.y, 250, "#f43f5e");
        this.addFloatText(bh.x, bh.y, "CRITICAL DETONATION!", "#f43f5e", 20);

        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active) continue;
            const dx = bh.x - m.x;
            const dy = bh.y - m.y;
            if (dx * dx + dy * dy < 160000) { // 400 * 400 = 160000
                this.explodeMeteor(m);
                m.active = false;
            }
        }
        this.blackHole = null;
    },

    checkCollisions() {
        for (let bIndex = 0; bIndex < this.maxBullets; bIndex++) {
            const bullet = this.bullets[bIndex];
            if (!bullet.active) continue;

            let bulletRemoved = false;

            if (this.boss && this.boss.active && (this.boss.y === undefined || this.boss.y >= 50)) {
                const b = this.boss;
                const parts = b.parts;

                for (const key in parts) {
                    const part = parts[key];
                    if (!part.active) continue;

                    if (parts.shieldCore && key !== 'shieldCore' && parts.shieldCore.active) {
                        continue; 
                    }

                    const pX = part.x !== undefined ? part.x : b.x + part.offset.x;
                    const pY = part.y !== undefined ? part.y : b.y + part.offset.y;
                    const dx = bullet.x - pX;
                    const dy = bullet.y - pY;
                    const radSum = bullet.radius + part.radius;

                    if (dx * dx + dy * dy < radSum * radSum) {
                        this.createHitParticles(bullet.x, bullet.y, bullet.color);
                        part.hp -= bullet.damage;
                        __sfx().playHit();

                        if (part.hp <= 0) {
                            part.active = false;
                            __sfx().playExplosion(true);
                            this.createExplosionParticles(pX, pY, 80, bullet.color);
                            this.addFloatText(pX, pY, `💥 ${part.label} 歼灭!`, "#f43f5e", 15);
                            this.scrap += 30;
                            
                            if (key === 'core') {
                                if (b.state === 'mothership') {
                                    this.triggerBossImplosion();
                                } else if (b.state === 'titan') {
                                    this.destroyBossEpic();
                                }
                            }
                        }

                        bullet.pierce--;
                        if (bullet.pierce <= 0) {
                            bullet.active = false;
                            bulletRemoved = true;
                            break;
                        }
                    }
                }
            }

            if (bulletRemoved) continue;

            for (let mIndex = 0; mIndex < this.maxMeteors; mIndex++) {
                const m = this.meteors[mIndex];
                if (!m.active) continue;

                const dx = bullet.x - m.x;
                const dy = bullet.y - m.y;
                const radSum = bullet.radius + m.radius;

                if (dx * dx + dy * dy < radSum * radSum) {
                    this.createHitParticles(bullet.x, bullet.y, bullet.color);
                    m.hp -= bullet.damage;
                    __sfx().playHit();

                    if (bullet.comboEffect) {
                        this.applySynergyBulletReaction(bullet, m);
                    }

                    let meteorDead = false;
                    if (m.hp <= 0) {
                        this.explodeMeteor(m);
                        m.active = false;
                        meteorDead = true;
                    }

                    bullet.pierce--;
                    if (bullet.pierce <= 0) {
                        bullet.active = false;
                        bulletRemoved = true;
                        break;
                    }

                    if (meteorDead) {
                        break; 
                    }
                }
            }
        }

        for (let mIndex = 0; mIndex < this.maxMeteors; mIndex++) {
            const m = this.meteors[mIndex];
            if (!m.active) continue;

            const dx = this.player.x - m.x;
            const dy = this.player.y - m.y;
            const radSum = m.radius + 20;
            
            if (dx * dx + dy * dy < radSum * radSum) {
                if (this.shieldTime > 0 && this.hangar.wingsLevel > 0) {
                    this.createExplosionParticles(m.x, m.y, m.size, m.color);
                    m.active = false;
                    __sfx().playExplosion(false);
                    this.scrap += 4; 
                    this.score += Math.floor(m.size * 1.5);
                    this.addFloatText(m.x, m.y, "⚔️ SLICED! +4", "#10b981", 12);
                    continue;
                }

                this.explodeMeteor(m);
                m.active = false;
                
                if (this.shieldTime <= 0 && this.slingshotTime <= 0) {
                    this.damagePlayer(Math.floor(m.size * 0.5));
                    this.createScreenShake(15);
                } else {
                    __sfx().playHit();
                    this.addFloatText(this.player.x, this.player.y - 30, "BLOCK!", "#06b6d4", 14);
                }
            }
        }

        for (let pIndex = 0; pIndex < this.maxPowerups; pIndex++) {
            const item = this.powerups[pIndex];
            if (!item.active) continue;
            const dx = this.player.x - item.x;
            const dy = this.player.y - item.y;

            if (dx * dx + dy * dy < 1225) {
                if (item.type === 'scrap') {
                    if (this.currentSkin === 'imperial') {
                        this.scrap += 2;
                        this.addFloatText(item.x, item.y, "CRIT +2", "#fbbf24", 14);
                    } else {
                        this.scrap += 1;
                    }
                    __sfx().playHit();
                } else {
                    this.pickupPowerup(item.type);
                }
                item.active = false;
            }
        }
    },

    applySynergyBulletReaction(bullet, m) {
        if (bullet.comboEffect === 'EM+Frost') {
            m.vy *= 0.3; 
            m.color = '#3b82f6';
        } else if (bullet.comboEffect === 'EM+Fire') {
            for (let i = 0; i < this.maxMeteors; i++) {
                const other = this.meteors[i];
                if (!other.active || other === m) continue;
                const dx = other.x - m.x;
                const dy = other.y - m.y;
                if (dx * dx + dy * dy < 19600) { 
                    other.hp -= 25;
                    this.createHitParticles(other.x, other.y, '#f43f5e');
                    if (other.hp <= 0) {
                        this.explodeMeteor(other);
                        other.active = false;
                    }
                }
            }
        } else if (bullet.comboEffect === 'Frost+Rad') {
            m.vy = 0;
            m.vx = 0;
            m.color = '#818cf8';
        } else if (bullet.comboEffect === 'Fire+Rad') {
            this.createExplosionParticles(m.x, m.y, 45, '#fbbf24');
            for (let i = 0; i < this.maxMeteors; i++) {
                const other = this.meteors[i];
                if (!other.active || other === m) continue;
                const dx = m.x - other.x;
                const dy = m.y - other.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < 15625) { 
                    const dist = Math.sqrt(distSq);
                    other.hp -= 35;
                    const pullForce = 6.0;
                    const distVal = dist || 1;
                    other.vx += (dx / distVal) * pullForce;
                    other.vy += (dy / distVal) * pullForce;
                    this.createHitParticles(other.x, other.y, '#fbbf24');
                    if (other.hp <= 0) {
                        this.explodeMeteor(other);
                        other.active = false;
                    }
                }
            }
        }
    },

    applyVoidTsunamiPush(ripple, prevRadius, dtClamped) {
        const waveOuter = ripple.radius;
        const waveInner = prevRadius;
        const outerSq = waveOuter * waveOuter;
        const innerSq = waveInner * waveInner;
        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active || m.size > 45) continue;
            const dx = m.x - ripple.x;
            const dy = m.y - ripple.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > outerSq || distSq < innerSq * 0.64) continue;
            const dist = Math.sqrt(distSq) || 1;
            const push = 18 * dtClamped;
            m.vx += (dx / dist) * push;
            m.vy += (dy / dist) * push;
        }
    },

    spawnParticle(x, y, vx, vy, size, color, decay) {
        const o = this.particleIndex * 8;
        if (this.particleBuffer[o + 7] !== 0) {
            // 覆盖仍活跃的槽位（环形缓冲已满）— 净增量为 0
            if (this.activeParticleCount > 0) {
                this.activeParticleCount--;
            } else if (!this._particleCountDriftWarned) {
                // 状态漂移：槽位标记为活跃但计数已归零，说明别处计数减多了
                console.warn('[spawnParticle] activeParticleCount drift detected: slot active but count<=0');
                this._particleCountDriftWarned = true;
            }
        } else {
            this.activeParticleCount++;
        }
        this.particleBuffer[o] = x;
        this.particleBuffer[o + 1] = y;
        this.particleBuffer[o + 2] = vx;
        this.particleBuffer[o + 3] = vy;
        this.particleBuffer[o + 4] = size;
        this.particleBuffer[o + 5] = 1.0;
        this.particleBuffer[o + 6] = decay;
        this.particleBuffer[o + 7] = 1.0;
        this.particleColors[this.particleIndex] = color;
        // P0: 0-GC integer colorId registration for batch rendering
        let colorId = this.particleColorMap.get(color);
        if (colorId === undefined) {
            if (this.particleColorList.length < this.maxUniqueColors) {
                colorId = this.particleColorList.length;
                this.particleColorMap.set(color, colorId);
                this.particleColorList.push(color);
            } else {
                // 颜色表已达 maxUniqueColors，复用槽 0 颜色以保渲染（视觉降级而非粒子丢失）
                colorId = 0;
            }
        }
        this.particleColorIds[this.particleIndex] = colorId;
        this.particleIndex = (this.particleIndex + 1) % this.maxParticles;
    }

});
