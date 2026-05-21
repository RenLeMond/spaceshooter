// =============================================
// 星海猎手 V6: GameEngine - RENDERER 模块
// =============================================

Object.assign(GameEngine.prototype, {
    drawWingmen() {
        // P1: 0-GC for loop + cached flame gradient lookup
        for (let wi = 0; wi < this.wingmen.length; wi++) {
            const w = this.wingmen[wi];
            this.ctx.save();
            this.ctx.translate(w.x, w.y);
            this.ctx.rotate(w.bankAngle);

            const flameHeight = Math.random() * 8 + 6;
            const hInt = Math.min(14, Math.max(6, Math.round(flameHeight)));
            this.ctx.fillStyle = this.wingmanFlameGradients[hInt];
            this.ctx.beginPath();
            this.ctx.moveTo(-3, 6);
            this.ctx.lineTo(0, 6 + flameHeight);
            this.ctx.lineTo(3, 6);
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.fillStyle = '#1e293b';
            this.ctx.strokeStyle = '#c084fc';
            this.ctx.lineWidth = 1.8;
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = '#c084fc';

            this.ctx.beginPath();
            this.ctx.moveTo(0, -10);
            this.ctx.lineTo(-8, 4);
            this.ctx.lineTo(-3, 2);
            this.ctx.lineTo(3, 2);
            this.ctx.lineTo(8, 4);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = '#22d3ee';
            this.ctx.beginPath();
            this.ctx.arc(0, -3, 2, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.restore();
        }
    },

    drawPlayer() {
        const p = this.player;
        this.ctx.save();
        this.ctx.translate(p.x, p.y);

        // 1. 根据不同皮肤绘制等离子火焰尾迹
        const flameHeight = Math.random() * (15 + this.hangar.engineLevel * 10) + 15;
        let flameColor = 'rgba(245, 158, 11, 0.6)'; // default #f59e0b
        if (this.currentSkin === 'void') {
            flameColor = 'rgba(192, 132, 252, 0.6)'; // #c084fc
        } else if (this.currentSkin === 'thunder') {
            flameColor = 'rgba(34, 211, 238, 0.6)'; // #22d3ee
        } else if (this.currentSkin === 'imperial') {
            flameColor = 'rgba(239, 68, 68, 0.6)'; // #ef4444
        } else if (this.hangar.engineLevel > 0) {
            flameColor = 'rgba(244, 63, 94, 0.6)'; // #f43f5e
        }
        
        this.ctx.fillStyle = flameColor;
        this.ctx.beginPath();
        this.ctx.moveTo(-8, 12);
        this.ctx.lineTo(0, 12 + flameHeight);
        this.ctx.lineTo(8, 12);
        this.ctx.closePath();
        this.ctx.fill();

        // 2. 根据皮肤类型微调升级机翼/机枪配色
        let wingStroke = '#10b981', wingFill = '#064e3b';
        let turretStroke = '#22d3ee', turretFill = '#475569';
        
        if (this.currentSkin === 'void') {
            wingStroke = '#d946ef'; wingFill = '#4a044e';
            turretStroke = '#f472b6'; turretFill = '#3b0764';
        } else if (this.currentSkin === 'thunder') {
            wingStroke = '#facc15'; wingFill = '#422006';
            turretStroke = '#22d3ee'; turretFill = '#1e293b';
        } else if (this.currentSkin === 'imperial') {
            wingStroke = '#fbbf24'; wingFill = '#78350f';
            turretStroke = '#ef4444'; turretFill = '#3f1f06';
        }

        if (this.hangar.wingsLevel > 0) {
            this.ctx.strokeStyle = wingStroke;
            this.ctx.lineWidth = 2.5;
            this.ctx.fillStyle = wingFill;
            this.ctx.beginPath();
            this.ctx.moveTo(-24, 6);
            this.ctx.lineTo(-42, 18);
            this.ctx.lineTo(-20, 12);
            this.ctx.moveTo(24, 6);
            this.ctx.lineTo(42, 18);
            this.ctx.lineTo(20, 12);
            this.ctx.fill();
            this.ctx.stroke();
        }

        if (this.hangar.turretLevel > 0) {
            this.ctx.fillStyle = turretFill;
            this.ctx.strokeStyle = turretStroke;
            this.ctx.lineWidth = 1.5;
            this.ctx.fillRect(-35, -5, 8, 12);
            this.ctx.strokeRect(-35, -5, 8, 12);
            this.ctx.fillRect(27, -5, 8, 12);
            this.ctx.strokeRect(27, -5, 8, 12);
        }

        // 3. 根据皮肤类别配置船身参数与辉光样式
        let glowColor = '#06b6d4', glowBlur = 10, fillStyle = '#1e293b';
        if (this.currentSkin === 'void') {
            glowColor = '#d946ef'; glowBlur = 15; fillStyle = '#170b24';
        } else if (this.currentSkin === 'thunder') {
            glowColor = '#facc15'; glowBlur = 12; fillStyle = '#0f172a';
        } else if (this.currentSkin === 'imperial') {
            glowColor = '#fbbf24'; glowBlur = 15; fillStyle = '#1a1005';
        }

        this.ctx.shadowBlur = glowBlur;
        this.ctx.shadowColor = glowColor;
        this.ctx.fillStyle = fillStyle;
        this.ctx.strokeStyle = glowColor;
        this.ctx.lineWidth = 2.5;

        // 4. 绘制机体流线型矢量边缘
        this.ctx.beginPath();
        if (this.currentSkin === 'void') {
            this.ctx.moveTo(0, -28);
            this.ctx.lineTo(-26, 14);
            this.ctx.lineTo(-14, 2);
            this.ctx.lineTo(0, 8);
            this.ctx.lineTo(14, 2);
            this.ctx.lineTo(26, 14);
        } else if (this.currentSkin === 'thunder') {
            this.ctx.moveTo(0, -25);
            this.ctx.lineTo(-28, 6);
            this.ctx.lineTo(-15, 6);
            this.ctx.lineTo(-12, 14);
            this.ctx.lineTo(12, 14);
            this.ctx.lineTo(15, 6);
            this.ctx.lineTo(28, 6);
        } else if (this.currentSkin === 'imperial') {
            this.ctx.moveTo(0, -26);
            this.ctx.lineTo(-22, 4);
            this.ctx.lineTo(-25, 12);
            this.ctx.lineTo(0, 4);
            this.ctx.lineTo(25, 12);
            this.ctx.lineTo(22, 4);
        } else {
            this.ctx.moveTo(0, -25);
            this.ctx.lineTo(-24, 12);
            this.ctx.lineTo(-12, 6);
            this.ctx.lineTo(12, 6);
            this.ctx.lineTo(24, 12);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // 5. 绘制机舱护罩玻璃
        let glassColor = '#22d3ee';
        if (this.currentSkin === 'void') glassColor = '#f472b6';
        else if (this.currentSkin === 'thunder') glassColor = '#67e8f9';
        else if (this.currentSkin === 'imperial') glassColor = '#ef4444';

        this.ctx.fillStyle = glassColor;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -18);
        this.ctx.lineTo(-5, -4);
        this.ctx.lineTo(5, -4);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.shadowBlur = 0; // 重置阴影

        // 6. 雷霆皮肤特有随机电击微型火花
        if (this.currentSkin === 'thunder' && Math.random() < 0.25) {
            this.ctx.save();
            this.ctx.strokeStyle = '#facc15';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            const sx = (Math.random() - 0.5) * 35;
            const sy = (Math.random() - 0.5) * 20;
            this.ctx.moveTo(sx, sy);
            this.ctx.lineTo(sx + (Math.random() - 0.5) * 12, sy + (Math.random() - 0.5) * 12);
            this.ctx.lineTo(sx + (Math.random() - 0.5) * 6, sy + (Math.random() - 0.5) * 6);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 7. 特色防护盾波纹
        if (this.shieldTime > 0) {
            this.ctx.save();
            let shieldStroke = '#22d3ee', shieldGlow = '#06b6d4';
            if (this.currentSkin === 'void') {
                shieldStroke = '#d946ef'; shieldGlow = '#c084fc';
            } else if (this.currentSkin === 'thunder') {
                shieldStroke = '#facc15'; shieldGlow = '#eab308';
            } else if (this.currentSkin === 'imperial') {
                shieldStroke = '#fbbf24'; shieldGlow = '#d97706';
            }

            this.ctx.strokeStyle = shieldStroke;
            this.ctx.lineWidth = 3;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = shieldGlow;
            this.ctx.globalAlpha = 0.45 + Math.sin(this.frameNow * 0.015) * 0.15;
            
            if (this.currentSkin === 'void') {
                this.ctx.beginPath();
                this.ctx.arc(0, -4, 35, 0, Math.PI * 2);
                this.ctx.stroke();
                
                this.ctx.rotate(this.frameNow * 0.005);
                this.ctx.beginPath();
                this.ctx.arc(0, -4, 35, 0, Math.PI * 0.5);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(0, -4, 35, Math.PI, Math.PI * 1.5);
                this.ctx.stroke();
            } else if (this.currentSkin === 'thunder') {
                this.ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI) / 3 + this.frameNow * 0.001;
                    const rx = Math.cos(angle) * 36;
                    const ry = Math.sin(angle) * 36 - 4;
                    if (i === 0) this.ctx.moveTo(rx, ry);
                    else this.ctx.lineTo(rx, ry);
                }
                this.ctx.closePath();
                this.ctx.stroke();
            } else if (this.currentSkin === 'imperial') {
                this.ctx.beginPath();
                this.ctx.arc(0, -4, 34, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(0, -4, 37, 0, Math.PI * 2);
                this.ctx.stroke();
            } else {
                this.ctx.beginPath();
                this.ctx.arc(0, -4, 35, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        // 8. 引力弹弓加速特效
        if (this.slingshotTime > 0) {
            this.ctx.save();
            let slingshotStroke = '#fbbf24', slingshotGlow = '#d97706';
            if (this.currentSkin === 'void') {
                slingshotStroke = '#d946ef'; slingshotGlow = '#c084fc';
            } else if (this.currentSkin === 'thunder') {
                slingshotStroke = '#facc15'; slingshotGlow = '#ca8a04';
            }
            
            this.ctx.strokeStyle = slingshotStroke; 
            this.ctx.lineWidth = 3.5;
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = slingshotGlow;
            this.ctx.globalAlpha = 0.5 + Math.sin(this.frameNow * 0.02) * 0.2;
            this.ctx.beginPath();
            this.ctx.arc(0, -4, 42, 0, Math.PI * 2);
            this.ctx.stroke();
            
            this.ctx.rotate(this.frameNow * 0.003);
            // P2: 预计算两种皮肤的描边颜色，避免每帧拼接
            this.ctx.strokeStyle = this.currentSkin === 'void' ? 'rgba(217, 70, 239, 0.4)' : 'rgba(251, 191, 36, 0.4)';
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(-48, -48, 96, 96);
            this.ctx.restore();
        }

        this.ctx.restore();
    },

    drawBoss() {
        if (!this.boss || !this.boss.active) return;
        const b = this.boss;

        if (b.type === 'worm') {
            this.ctx.save();
            const parts = b.parts;
            
            this.ctx.strokeStyle = '#10b981';
            this.ctx.lineWidth = 4;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#34d399';
            
            let prevPart = null;
            for (let i = 0; i < 10; i++) {
                const part = parts[`segment${i}`];
                if (!part || !part.active) {
                    prevPart = null;
                    continue;
                }
                
                if (prevPart) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(prevPart.x, prevPart.y);
                    this.ctx.lineTo(part.x, part.y);
                    this.ctx.stroke();
                }
                prevPart = part;
            }
            
            for (let i = 0; i < 10; i++) {
                const part = parts[`segment${i}`];
                if (!part || !part.active) continue;
                
                this.ctx.fillStyle = '#064e3b';
                this.ctx.strokeStyle = '#34d399';
                this.ctx.lineWidth = 3;
                
                this.ctx.beginPath();
                for (let j = 0; j < 6; j++) {
                    const angle = j * Math.PI / 3 + this.frameNow * 0.001 * (i % 2 === 0 ? 1 : -1);
                    const px = part.x + Math.cos(angle) * part.radius;
                    const py = part.y + Math.sin(angle) * part.radius;
                    if (j === 0) this.ctx.moveTo(px, py);
                    else this.ctx.lineTo(px, py);
                }
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
                
                if (part.isHead) {
                    this.ctx.fillStyle = '#ef4444';
                    this.ctx.shadowColor = '#ef4444';
                    this.ctx.beginPath();
                    this.ctx.arc(part.x, part.y, part.radius * 0.4, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
            this.ctx.restore();
            return;
        }

        this.ctx.save();
        this.ctx.translate(b.x, b.y);

        if (b.state === 'implosion') {
            const angle = this.frameNow * 0.01;
            this.ctx.rotate(angle);
            const radius = 60 + Math.sin(this.frameNow * 0.05) * 10;

            this.ctx.fillStyle = 'rgba(107, 33, 168, 0.7)'; // #6b21a8 equivalent
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.strokeStyle = '#d8b4fe';            this.ctx.lineWidth = 2.5;
            for (let j = 0; j < 4; j++) {
                this.ctx.beginPath();
                for (let r = 0; r < radius; r += 3) {
                    const theta = r * 0.08 + j * Math.PI / 2;
                    const x = Math.cos(theta) * r;
                    const y = Math.sin(theta) * r;
                    if (r === 0) this.ctx.moveTo(x, y);
                    else this.ctx.lineTo(x, y);
                }
                this.ctx.stroke();
            }
            this.ctx.restore();
            return;
        }

        if (b.state === 'titan') {
            this.ctx.fillStyle = '#1e1b4b'; 
            this.ctx.strokeStyle = '#d946ef'; 
            this.ctx.lineWidth = 3.5;
            
            this.ctx.beginPath();
            this.ctx.moveTo(-70, -40);
            this.ctx.lineTo(70, -40);
            this.ctx.lineTo(95, 0);
            this.ctx.lineTo(40, 60);
            this.ctx.lineTo(0, 85);
            this.ctx.lineTo(-40, 60);
            this.ctx.lineTo(-95, 0);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = '#0f0b29';
            this.ctx.strokeStyle = '#a21caf';
            this.ctx.beginPath();
            this.ctx.moveTo(-35, -20);
            this.ctx.lineTo(35, -20);
            this.ctx.lineTo(20, 20);
            this.ctx.lineTo(-20, 20);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            const core = b.parts.core;
            if (core.active) {
                this.ctx.save();
                this.ctx.translate(0, 20);
                this.ctx.shadowBlur = 25;
                this.ctx.shadowColor = '#d946ef';
                this.ctx.fillStyle = '#fdf4ff';
                this.ctx.strokeStyle = '#d946ef';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 26 + Math.sin(this.frameNow * 0.02) * 5, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                this.ctx.restore();
            }
            
            this.ctx.save();
            this.ctx.rotate(b.titanAngle);
            const numRocks = 12;
            const ringRadius = 135;
            for (let i = 0; i < numRocks; i++) {
                const rockAngle = (i / numRocks) * Math.PI * 2;
                const rx = Math.cos(rockAngle) * ringRadius;
                const ry = Math.sin(rockAngle) * ringRadius;
                
                this.ctx.fillStyle = i % 2 === 0 ? '#fb923c' : '#c084fc';
                this.ctx.strokeStyle = i % 2 === 0 ? '#d97706' : '#8b5cf6';
                this.ctx.lineWidth = 1.5;
                
                this.ctx.beginPath();
                this.ctx.arc(rx, ry, 8 + (i % 3) * 3, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }
            this.ctx.restore();
            
            if (b.laserActive) {
                this.ctx.save();
                const startX = 0;
                const startY = 20;
                const angles = [Math.PI/2 - 0.4 + b.laserAngle, Math.PI/2 + 0.4 - b.laserAngle];
                
                for (let ai = 0; ai < angles.length; ai++) {
                    const angle = angles[ai];
                    const endX = Math.cos(angle) * 1000;
                    const endY = Math.sin(angle) * 1000;
                    
                    this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
                    this.ctx.lineWidth = 20 + Math.sin(this.frameNow * 0.05) * 6;
                    this.ctx.shadowBlur = 30;
                    this.ctx.shadowColor = '#ef4444';
                    this.ctx.beginPath();
                    this.ctx.moveTo(startX, startY);
                    this.ctx.lineTo(endX, endY);
                    this.ctx.stroke();
                    
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = 6 + Math.sin(this.frameNow * 0.05) * 2;
                    this.ctx.shadowBlur = 0;
                    this.ctx.beginPath();
                    this.ctx.moveTo(startX, startY);
                    this.ctx.lineTo(endX, endY);
                    this.ctx.stroke();
                }
                
                this.ctx.restore();
            }
            
            this.ctx.restore();
            return;
        }

        if (b.parts.shieldCore.active) {
            this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
            this.ctx.lineWidth = 4;
            this.ctx.fillStyle = 'rgba(6, 182, 212, 0.05)';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 115, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.fillStyle = '#1e293b';
        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(-60, -30);
        this.ctx.lineTo(60, -30);
        this.ctx.lineTo(80, 20);
        this.ctx.lineTo(0, 50);
        this.ctx.lineTo(-80, 20);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        const sPart = b.parts.shieldCore;
        if (sPart.active) {
            this.ctx.fillStyle = '#0f172a';
            this.ctx.strokeStyle = '#06b6d4';
            this.ctx.lineWidth = 2.5;
            this.ctx.beginPath();
            this.ctx.arc(sPart.offset.x, sPart.offset.y, sPart.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#22d3ee';
            this.ctx.beginPath();
            this.ctx.arc(sPart.offset.x, sPart.offset.y, 8 + Math.sin(this.frameNow * 0.01) * 3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        const lPart = b.parts.leftWing;
        if (lPart.active) {
            this.ctx.fillStyle = '#334155';
            this.ctx.strokeStyle = '#fb923c';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(-60, -10);
            this.ctx.lineTo(-110, 25);
            this.ctx.lineTo(-60, 20);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        const rPart = b.parts.rightWing;
        if (rPart.active) {
            this.ctx.fillStyle = '#334155';
            this.ctx.strokeStyle = '#fb923c';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(60, -10);
            this.ctx.lineTo(110, 25);
            this.ctx.lineTo(60, 20);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        const mCore = b.parts.core;
        this.ctx.fillStyle = '#0f172a';
        this.ctx.strokeStyle = '#f43f5e';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(0, 20, 22, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#f43f5e';
        this.ctx.beginPath();
        this.ctx.arc(0, 20, 10 + Math.sin(this.frameNow * 0.02) * 4, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    },

    drawBlackHole() {
        if (!this.blackHole || !this.blackHole.active) return;
        const bh = this.blackHole;

        this.ctx.save();
        this.ctx.translate(bh.x, bh.y);
        this.ctx.rotate(bh.pulse * 0.2);

        // P1: Use pre-allocated black hole gradient + scale transform instead of per-frame createRadialGradient
        const scaleFactor = (bh.radius * 3.5) / 70;
        this.ctx.save();
        this.ctx.scale(scaleFactor, scaleFactor);
        this.ctx.fillStyle = this.blackHoleGradient;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 76, 0, Math.PI * 2); // 70 * (3.8/3.5) ≈ 76; bh.radius cancels
        this.ctx.fill();
        this.ctx.restore();

        this.ctx.fillStyle = '#02040a';
        this.ctx.strokeStyle = '#ec4899';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, bh.radius + Math.sin(bh.pulse) * 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.restore();
    },

    draw() {
        const drawStart = performance.now();
        this.frameNow = Date.now(); // P2: 0-GC 每帧缓存时钟，draw 调用链中所有时间动画统一读 this.frameNow
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        if (this.screenshake > 0) {
            const shakeX = (Math.random() - 0.5) * this.screenshake;
            const shakeY = (Math.random() - 0.5) * this.screenshake;
            this.ctx.translate(shakeX, shakeY);
        }

        this.ctx.scale(this.scaleX, this.scaleY);

        // P1: 0-GC banded star rendering — only 10 fillStyle changes for all 80 stars
        for (let b = 0; b < this.starBandCount; b++) {
            const group = this.starGroups[b];
            if (group.count === 0) continue;
            this.ctx.fillStyle = this.starColors[b];
            const xs = group.xs, ys = group.ys, sizes = group.sizes;
            for (let si = 0; si < group.count; si++) {
                this.ctx.fillRect(xs[si], ys[si], sizes[si], sizes[si]);
            }
        }

        // P1: 0-GC powerup rendering — for loop + cached radial gradients
        for (let pi = 0; pi < this.maxPowerups; pi++) {
            const item = this.powerups[pi];
            if (!item.active) continue;
            this.ctx.save();
            this.ctx.translate(item.x, item.y);
            
            if (item.type === 'scrap') {
                this.ctx.rotate(this.frameNow * 0.004 + item.x * 0.01);
                this.ctx.fillStyle = '#fbbf24';
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 1;
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = '#d97706';
                
                this.ctx.beginPath();
                this.ctx.moveTo(0, -6.5);
                this.ctx.lineTo(5.63, 3.25);
                this.ctx.lineTo(-5.63, 3.25);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                this.ctx.fillStyle = this.powerupGradients[item.type] || this.powerupGradients['Rad'];
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 16, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-6, -6, 12, 12);
            }
            this.ctx.restore();
        }

        this.drawBlackHole();
        this.drawBoss();

        if (this.titanRipples) {
            const aBuckets = this.alphaBuckets;
            for (let ri = 0; ri < this.maxTitanRipples; ri++) {
                const ripple = this.titanRipples[ri];
                if (!ripple.active) continue;
                this.ctx.save();
                const colorStr = ripple.color || '167, 139, 250';
                const aIdx = Math.max(0, Math.min(aBuckets, Math.round(ripple.alpha * aBuckets)));
                // 缓存查找：base color + alpha bucket → 复用字符串实例
                let entry = this.rippleStyleCache.get(colorStr);
                if (!entry) {
                    entry = { stroke: new Array(aBuckets + 1), shadow: `rgba(${colorStr}, 1)` };
                    for (let i = 0; i <= aBuckets; i++) {
                        entry.stroke[i] = `rgba(${colorStr}, ${(i / aBuckets).toFixed(2)})`;
                    }
                    this.rippleStyleCache.set(colorStr, entry);
                }
                this.ctx.strokeStyle = entry.stroke[aIdx];
                this.ctx.lineWidth = 4;
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = entry.shadow;
                this.ctx.beginPath();
                this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
            }
        }

        if (this.player && this.player.hp > 0) {
            this.drawPlayer();
            if (this.hangar.turretLevel > 0) {
                this.drawWingmen();
            }
        }

        if (this.lightningChains) {
            const aBuckets = this.alphaBuckets;
            for (let ci = 0; ci < this.maxLightningChains; ci++) {
                const chain = this.lightningChains[ci];
                if (!chain.active) continue;
                const aIdx = Math.max(0, Math.min(aBuckets, Math.round(chain.alpha * aBuckets)));
                this.ctx.save();
                this.ctx.strokeStyle = this.lightningGoldByAlpha[aIdx];
                this.ctx.lineWidth = 3.5;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#fbbf24';
                this.ctx.beginPath();
                const segCount = chain.segCount;
                for (let si = 0; si < segCount; si++) {
                    const seg = chain.segments[si];
                    if (si === 0) this.ctx.moveTo(seg.x1, seg.y1);
                    this.ctx.lineTo(seg.x2, seg.y2);
                }
                this.ctx.stroke();

                this.ctx.strokeStyle = this.lightningWhiteByAlpha[aIdx];
                this.ctx.lineWidth = 1.2;
                this.ctx.stroke();
                this.ctx.restore();
            }
        }

        for (let i = 0; i < this.maxBullets; i++) {
            const b = this.bullets[i];
            if (!b.active) continue;
            this.ctx.shadowBlur = b.radius * 3;
            this.ctx.shadowColor = b.color;
            this.ctx.fillStyle = b.color;
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        for (let i = 0; i < this.maxMeteors; i++) {
            const m = this.meteors[i];
            if (!m.active) continue;
            this.ctx.save();
            this.ctx.translate(m.x, m.y);
            this.ctx.rotate(m.angle);

            this.ctx.fillStyle = m.color;
            this.ctx.globalAlpha = 0.9;
            this.ctx.strokeStyle = '#475569';
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            for (let j = 0; j < m.numPoints; j++) {
                const angle = (j / m.numPoints) * Math.PI * 2;
                const dist = m.radius * m.offsets[j];
                const px = Math.cos(angle) * dist;
                const py = Math.sin(angle) * dist;
                
                if (j === 0) {
                    this.ctx.moveTo(px, py);
                } else {
                    this.ctx.lineTo(px, py);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.globalAlpha = 1.0;

            if (m.hp < m.maxHp && m.hp > 0) {
                this.ctx.rotate(-m.angle);
                this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                this.ctx.fillRect(-m.radius, -m.radius - 12, m.radius * 2, 4);
                this.ctx.fillStyle = '#ef4444';
                this.ctx.fillRect(-m.radius, -m.radius - 12, (m.radius * 2) * (m.hp / m.maxHp), 4);
            }

            this.ctx.restore();
        }

        // P0: 0-GC 粒子渲染 — 纯整型索引分组 + beginPath/rect/fill 聚合，彻底消灭 Path2D/字符串拼接
        const pGroups = this.particleGroups;
        const pColorIds = this.particleColorIds;
        const pBuf = this.particleBuffer;
        const pColorList = this.particleColorList;
        const maxUC = this.maxUniqueColors;
        const totalSlots = pColorList.length * 5;
        // Reset all group counters (only active slots)
        for (let g = 0; g < totalSlots; g++) {
            pGroups[g].count = 0;
        }
        // Classify particles into integer-indexed groups
        for (let i = 0; i < this.maxParticles; i++) {
            const o = i * 8;
            if (pBuf[o + 7] === 0) continue;
            const alpha = pBuf[o + 5];
            const alphaId = Math.min(4, Math.max(0, Math.ceil(alpha * 5) - 1));
            const colorId = pColorIds[i];
            const gIdx = colorId * 5 + alphaId;
            if (gIdx >= 0 && gIdx < pGroups.length) {
                const grp = pGroups[gIdx];
                grp.indices[grp.count++] = i;
            }
        }
        // Render each non-empty group with a single beginPath + batch rect + fill
        const alphaValues = [0.2, 0.4, 0.6, 0.8, 1.0];
        for (let g = 0; g < totalSlots; g++) {
            const grp = pGroups[g];
            if (grp.count === 0) continue;
            const colorId = (g / 5) | 0;
            const alphaId = g % 5;
            this.ctx.globalAlpha = alphaValues[alphaId];
            this.ctx.fillStyle = pColorList[colorId];
            this.ctx.beginPath();
            for (let k = 0; k < grp.count; k++) {
                const idx = grp.indices[k];
                const o = idx * 8;
                const x = pBuf[o];
                const y = pBuf[o + 1];
                const size = pBuf[o + 4];
                this.ctx.rect(x - size, y - size, size * 2, size * 2);
            }
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;

        const fontCache = this.floatTextFontCache;
        for (let fi = 0; fi < this.maxFloatTexts; fi++) {
            const ft = this.floatTexts[fi];
            if (!ft.active) continue;
            this.ctx.save();
            this.ctx.globalAlpha = ft.alpha;
            this.ctx.fillStyle = ft.color;
            const size = ft.size | 0;
            let font = fontCache[size];
            if (!font) {
                font = `bold ${size}px Impact, system-ui`;
                if (size < fontCache.length) fontCache[size] = font;
            }
            this.ctx.font = font;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ft.text, ft.x, ft.y);
            this.ctx.restore();
        }

        // 测量渲染延迟
        this.drawDelay = performance.now() - drawStart;
        if (this.isBenchmarking) {
            this.benchDrawDelayTotal += this.drawDelay;
            if (this.drawDelay > this.benchDrawDelayMax) this.benchDrawDelayMax = this.drawDelay;
        }

        // 绘制 Overlay HUD 性能监测面板 (如果运行中且处于跑分或按下了 H 键)
        if (this.isRunning && (this.isBenchmarking || this.keys['KeyH'])) {
            this.drawPerformanceOverlay();
        }

        this.ctx.restore();
    },

    drawPerformanceOverlay() {
        this.ctx.save();
        
        // 1. 0-GC 纯净计算活动实体个数 (不使用 filter / map 等垃圾产生式)
        let activeBullets = 0;
        for (let i = 0; i < this.maxBullets; i++) {
            if (this.bullets[i].active) activeBullets++;
        }
        
        let activeMeteors = 0;
        for (let i = 0; i < this.maxMeteors; i++) {
            if (this.meteors[i].active) activeMeteors++;
        }
        
        const activeParticles = this.activeParticleCount;

        // 2. 绘制磨砂发光玻璃面板
        const ox = 25;
        const oy = 130;
        const ow = 210;
        const oh = 180;
        
        // Panel Glow
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = this.isBenchmarking ? '#ec4899' : '#06b6d4';
        
        // Panel Background
        this.ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
        this.ctx.strokeStyle = this.isBenchmarking ? 'rgba(236, 72, 153, 0.6)' : 'rgba(6, 182, 212, 0.6)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        if (this.ctx.roundRect) {
            this.ctx.roundRect(ox, oy, ow, oh, 12);
        } else {
            this.ctx.rect(ox, oy, ow, oh);
        }
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.shadowBlur = 0; // 重置阴影

        // 3. 绘制标题
        this.ctx.font = 'bold 9px monospace';
        this.ctx.fillStyle = this.isBenchmarking ? '#f472b6' : '#22d3ee';
        this.ctx.fillText(this.isBenchmarking ? '⚡ OVERCLOCK BENCHMARK ACTIVE' : '⚡ PERFORMANCE MONITOR', ox + 12, oy + 22);

        // 4. 0-GC 极客防御标志
        this.ctx.fillStyle = '#34d399';
        this.ctx.fillText('🛡️ [0-GC PURE DEFIANCE]', ox + 12, oy + 38);

        // 5. 渲染各项指标
        this.ctx.font = '8px monospace';
        this.ctx.fillStyle = '#94a3b8';
        
        // FPS
        const fpsStr = `FPS      : ${(this.currentFps || 60).toFixed(1)} Hz`;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(fpsStr, ox + 12, oy + 56);
        
        // PHYS Latency
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('PHYS LAT : ', ox + 12, oy + 72);
        this.ctx.fillStyle = this.physDelay > 2.0 ? '#ef4444' : '#e2e8f0';
        this.ctx.fillText(`${(this.physDelay || 0).toFixed(2)} ms`, ox + 72, oy + 72);
        
        // DRAW Latency
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('DRAW LAT : ', ox + 12, oy + 88);
        this.ctx.fillStyle = this.drawDelay > 4.0 ? '#ef4444' : '#e2e8f0';
        this.ctx.fillText(`${(this.drawDelay || 0).toFixed(2)} ms`, ox + 72, oy + 88);

        // Bullets
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('BULLETS  : ', ox + 12, oy + 104);
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillText(`${activeBullets} / ${this.maxBullets}`, ox + 72, oy + 104);

        // Meteors
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('METEORS  : ', ox + 12, oy + 120);
        this.ctx.fillStyle = '#c084fc';
        this.ctx.fillText(`${activeMeteors} / ${this.maxMeteors}`, ox + 72, oy + 120);

        // Particles
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('PARTICLES: ', ox + 12, oy + 136);
        this.ctx.fillStyle = '#fb7185';
        this.ctx.fillText(`${activeParticles} / ${this.maxParticles}`, ox + 72, oy + 136);

        // 跑分倒计时
        if (this.isBenchmarking) {
            const progress = (this.benchmarkDuration - this.benchmarkTimer) / 1000;
            this.ctx.fillStyle = '#f472b6';
            this.ctx.fillText(`TIME REMAINING: ${Math.max(0, progress).toFixed(1)}s`, ox + 12, oy + 160);
            
            // 绘制倒计时进度条
            this.ctx.fillStyle = 'rgba(244, 114, 182, 0.2)';
            this.ctx.fillRect(ox + 12, oy + 166, ow - 24, 4);
            this.ctx.fillStyle = '#ec4899';
            const progressRatio = Math.max(0, this.benchmarkTimer / this.benchmarkDuration);
            this.ctx.fillRect(ox + 12, oy + 166, (ow - 24) * (1 - progressRatio), 4);
        } else {
            this.ctx.fillStyle = '#64748b';
            this.ctx.fillText('Press [H] to Toggle Overlay', ox + 12, oy + 160);
        }

        this.ctx.restore();
    }

});
