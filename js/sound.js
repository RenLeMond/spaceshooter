class SoundFX {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.lastPlayTime = {};
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

    playShoot() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        if (now - (this.lastPlayTime['shoot'] || 0) < 0.05) return;
        this.lastPlayTime['shoot'] = now;

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
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        if (now - (this.lastPlayTime['hit'] || 0) < 0.04) return;
        this.lastPlayTime['hit'] = now;

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
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const key = isLarge ? 'expl_L' : 'expl_S';
        if (now - (this.lastPlayTime[key] || 0) < 0.06) return;
        this.lastPlayTime[key] = now;

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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
        if (this.muted) return;
        this.init();
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
