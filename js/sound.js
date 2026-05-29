// =============================================
// 星海猎手 V7: GameEngine - SOUND 音效节流模块
// =============================================

class SoundFX {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.lastPlayTime = {};
        this.recentPlaysBuffer = new Float64Array(8); // V7: 固定长度环形缓冲区 (0-GC)
        this.recentPlaysHead = 0;
        this.recentPlaysCount = 0;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    /**
     * V7 Global sound concurrency thottling & safety gate to prevent Safari audio thread freeze/overload
     * Limits total sound triggers to 6 within a 50ms window.
     */
    checkThrottle(key, cooldown = 0) {
        if (this.muted) return false;
        this.init();
        if (!this.ctx) return false;

        const now = this.ctx.currentTime;

        // 1. Key-specific cooldown
        if (cooldown > 0 && now - (this.lastPlayTime[key] || 0) < cooldown) {
            return false;
        }

        // 2. Global concurrency throttle (max 6 active schedules per 50ms) — 0-GC ring buffer
        let activeCount = 0;
        for (let i = 0; i < this.recentPlaysCount; i++) {
            const idx = (this.recentPlaysHead - this.recentPlaysCount + i + 8) % 8;
            if (now - this.recentPlaysBuffer[idx] < 0.05) {
                activeCount++;
            }
        }
        if (activeCount >= 6) {
            return false;
        }

        this.recentPlaysBuffer[this.recentPlaysHead] = now;
        this.recentPlaysHead = (this.recentPlaysHead + 1) % 8;
        if (this.recentPlaysCount < 8) this.recentPlaysCount++;
        this.lastPlayTime[key] = now;
        return true;
    }

    playShoot() {
        if (!this.checkThrottle('shoot', 0.05)) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playHit() {
        if (!this.checkThrottle('hit', 0.04)) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playExplosion(isLarge = false) {
        const key = isLarge ? 'expl_L' : 'expl_S';
        if (!this.checkThrottle(key, 0.06)) return;
        const now = this.ctx.currentTime;

        const duration = isLarge ? 0.4 : 0.25;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isLarge ? 300 : 600, now);
        filter.frequency.exponentialRampToValueAtTime(10, now + duration);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(isLarge ? 0.35 : 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + duration);
    }

    playPowerup() {
        if (!this.checkThrottle('powerup', 0.15)) return;
        const now = this.ctx.currentTime;
        const freqs = [330, 440, 554, 660];
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.05);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + idx * 0.05 + 0.15);
            gain.gain.setValueAtTime(0.05, now + idx * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.2);
        });
    }

    playBomb() {
        if (!this.checkThrottle('bomb', 0.5)) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(30, now + 1.2);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
    }

    playGameOver() {
        if (!this.checkThrottle('gameover', 1.0)) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.8);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
    }

    playSlingshot() {
        if (!this.checkThrottle('slingshot', 0.3)) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        const fmGain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.5);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(60, now);
        
        fmGain.gain.setValueAtTime(200, now);
        fmGain.gain.exponentialRampToValueAtTime(800, now + 0.5);
        
        gainNode.gain.setValueAtTime(0.18, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc2.connect(fmGain);
        fmGain.connect(osc.frequency);
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.5);
        osc2.stop(now + 0.5);
    }

    playTitanLaser() {
        if (!this.checkThrottle('titanlaser', 0.2)) return;
        const now = this.ctx.currentTime;
        const duration = 0.8;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + duration);
        
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(40, now + duration);
        
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        noise.connect(filter);
        filter.connect(gainNode);
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        noise.start(now);
        osc.start(now);
        noise.stop(now + duration);
        osc.stop(now + duration);
    }

    playGravityRipple() {
        if (!this.checkThrottle('gravityripple', 0.3)) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.6);
        
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.setValueAtTime(0.2, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        const lfo = this.ctx.createOscillator();
        lfo.frequency.setValueAtTime(15, now);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(0.1, now);
        
        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc.start(now);
        lfo.start(now);
        osc.stop(now + 0.6);
        lfo.stop(now + 0.6);
    }

    playWarp() {
        if (!this.checkThrottle('warp', 0.25)) return;
        const now = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.45);
        
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(150, now);
        modGain.gain.setValueAtTime(300, now);
        modGain.gain.exponentialRampToValueAtTime(10, now + 0.45);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.45);
        
        mod.connect(modGain);
        modGain.connect(osc.frequency);
        
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        gainNode.gain.setValueAtTime(0.22, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        
        osc.start(now);
        mod.start(now);
        osc.stop(now + 0.45);
        mod.stop(now + 0.45);
    }

    playSkinSwitch() {
        if (!this.checkThrottle('skinswitch', 0.15)) return;
        const now = this.ctx.currentTime;
        
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.setValueAtTime(783.99, now + 0.08);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1046.50, now);
        osc2.frequency.setValueAtTime(1567.98, now + 0.08);
        
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.25);
        osc2.stop(now + 0.25);
    }
}

const sfx = new SoundFX();
