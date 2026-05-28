// 微信小游戏纯代码音效引擎
// ─────────────────────────────────────────────────────────────────────────────
// 思路：原 sound.js 用 WebAudio 实时合成（OscillatorNode + GainNode envelope），
// 小游戏运行时没有 WebAudio，但有 wx.createInnerAudioContext() 能播本地音频文件。
//
// 这里在首次启动时：
//   1) 按相同的合成数学，把每个音效在 JS 里逐采样算成 Float32 PCM
//   2) 量化到 Int16，加上 44 字节 WAV header，写入 ${USER_DATA_PATH}/sfx/<name>.wav
//   3) 每个音效预先创建 4 个 InnerAudioContext 实例做"复音池"，play 时找一个空闲的 src+play
//
// 之后启动直接读已有文件，零生成成本；玩家电池友好。
// 整体 API 与原 SoundFX 完全一致，替换 GameGlobal.sfx 即可被引擎透明使用。
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    const G = GameGlobal;
    if (typeof wx === 'undefined') return;

    const SR = 16000;             // 采样率：对这类效果完全够用，文件小
    const FS = wx.getFileSystemManager();
    const SFX_VERSION = 'v1';     // 改合成算法时 bump，旧 wav 自然失效
    const BASE_DIR = wx.env.USER_DATA_PATH + '/sfx-' + SFX_VERSION;

    // 每个音效的复音池大小 —— shoot 最常调（持续连发），其余 2 路即可
    // 总实例数 = 4 + 2*11 = 26，控制在微信推荐的 InnerAudioContext 数量上限内
    const POOL_SIZES = {
        shoot: 4, hit: 3, expl_S: 3, expl_L: 2,
        powerup: 2, bomb: 2, gameOver: 1, slingshot: 2,
        titanLaser: 2, gravityRipple: 2, warp: 2, skinSwitch: 1
    };

    // ---------------- 合成原语 ----------------

    // 振荡器（朴素采样，几 Hz 到几 kHz 的范围足够不产生明显走样）
    function oscSample(type, phase) {
        const TAU = 2 * Math.PI;
        const p = ((phase % TAU) + TAU) % TAU;
        switch (type) {
            case 'sine': return Math.sin(p);
            case 'square': return p < Math.PI ? 1 : -1;
            case 'sawtooth': return (p / Math.PI) - 1;
            case 'triangle': {
                const u = p / Math.PI;
                return u < 1 ? (2 * u - 1) : (3 - 2 * u);
            }
            default: return 0;
        }
    }

    // WebAudio exponentialRampToValueAtTime：v0 必须 > 0；v(t)=v0*(v1/v0)^(t/dur)
    function expRamp(t, dur, v0, v1) {
        if (v0 <= 0 || v1 <= 0) return v0 + (v1 - v0) * Math.max(0, Math.min(1, t / dur));
        const u = Math.max(0, Math.min(1, t / dur));
        return v0 * Math.pow(v1 / v0, u);
    }

    function linRamp(t, dur, v0, v1) {
        const u = Math.max(0, Math.min(1, t / dur));
        return v0 + (v1 - v0) * u;
    }

    // 一阶 IIR 低通：fc 可逐采样变化；模拟 WebAudio BiquadFilter lowpass 的截止扫频
    function onePoleLowpass() {
        let y = 0;
        return function step(x, fc) {
            const dt = 1 / SR;
            const rc = 1 / (2 * Math.PI * Math.max(20, fc));
            const a = dt / (rc + dt);
            y = y + a * (x - y);
            return y;
        };
    }

    function whiteNoise() { return Math.random() * 2 - 1; }

    // ---------------- 各效果合成 ----------------

    function renderShoot() {
        const dur = 0.15, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let phase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f = expRamp(t, dur, 800, 100);
            phase += (2 * Math.PI * f) / SR;
            const g = expRamp(t, dur, 0.12, 0.001);
            data[i] = oscSample('sawtooth', phase) * g;
        }
        return data;
    }

    function renderHit() {
        const dur = 0.12, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let phase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f = expRamp(t, dur, 180, 40);
            phase += (2 * Math.PI * f) / SR;
            const g = expRamp(t, dur, 0.2, 0.001);
            data[i] = oscSample('triangle', phase) * g;
        }
        return data;
    }

    function renderExplosion(isLarge) {
        const dur = isLarge ? 0.4 : 0.25;
        const n = (SR * dur) | 0;
        const data = new Float32Array(n);
        const lp = onePoleLowpass();
        const f0 = isLarge ? 300 : 600;
        const a0 = isLarge ? 0.35 : 0.2;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const fc = expRamp(t, dur, f0, 10);
            const g = expRamp(t, dur, a0, 0.001);
            // 先把噪声幅度压到 0.25 再过低通再乘 4，等价于补偿一阶低通衰减又避免硬限
            data[i] = lp(whiteNoise() * 0.25, fc) * 4 * g;
        }
        return data;
    }

    function renderPowerup() {
        const totalDur = 0.4, n = (SR * totalDur) | 0;
        const data = new Float32Array(n);
        const freqs = [330, 440, 554, 660];
        for (let k = 0; k < freqs.length; k++) {
            const start = k * 0.05;
            const dur = 0.15;
            let phase = 0;
            for (let i = 0; i < n; i++) {
                const t = i / SR - start;
                if (t < 0 || t > dur) continue;
                const f = expRamp(t, dur, freqs[k], freqs[k] * 1.5);
                phase += (2 * Math.PI * f) / SR;
                const g = expRamp(t, dur, 0.05, 0.001);
                data[i] += oscSample('sine', phase) * g;
            }
        }
        return data;
    }

    function renderBomb() {
        const dur = 1.2, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let phase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f = linRamp(t, dur, 400, 30);
            phase += (2 * Math.PI * f) / SR;
            const g = expRamp(t, dur, 0.4, 0.001);
            data[i] = oscSample('sawtooth', phase) * g;
        }
        return data;
    }

    function renderGameOver() {
        const dur = 0.8, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let phase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f = linRamp(t, dur, 150, 30);
            phase += (2 * Math.PI * f) / SR;
            const g = expRamp(t, dur, 0.3, 0.001);
            data[i] = oscSample('sawtooth', phase) * g;
        }
        return data;
    }

    function renderSlingshot() {
        const dur = 0.5, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let phaseMain = 0, phaseFM = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            // FM: 60Hz sine 乘以扫描幅度 200→800
            const fmAmp = expRamp(t, dur, 200, 800);
            phaseFM += (2 * Math.PI * 60) / SR;
            const fmOffset = oscSample('sine', phaseFM) * fmAmp;
            const fBase = expRamp(t, dur, 300, 2000);
            phaseMain += (2 * Math.PI * Math.max(20, fBase + fmOffset)) / SR;
            const g = expRamp(t, dur, 0.18, 0.001);
            data[i] = oscSample('sawtooth', phaseMain) * g;
        }
        return data;
    }

    function renderTitanLaser() {
        const dur = 0.8, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        const lp = onePoleLowpass();
        let phase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const fc = expRamp(t, dur, 1000, 80);
            const noisePart = lp(whiteNoise(), fc) * 3;
            const fOsc = linRamp(t, dur, 80, 40);
            phase += (2 * Math.PI * fOsc) / SR;
            const oscPart = oscSample('sawtooth', phase);
            const g = expRamp(t, dur, 0.25, 0.001);
            data[i] = (noisePart + oscPart) * 0.5 * g;
        }
        return data;
    }

    function renderGravityRipple() {
        const dur = 0.6, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let phase = 0, lfoPhase = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f = linRamp(t, dur, 120, 40);
            phase += (2 * Math.PI * f) / SR;
            lfoPhase += (2 * Math.PI * 15) / SR;
            const env = expRamp(t, dur, 0.2, 0.001);
            const lfo = 0.1 * oscSample('sine', lfoPhase);
            data[i] = oscSample('sine', phase) * Math.max(0, env + lfo);
        }
        return data;
    }

    function renderWarp() {
        const dur = 0.45, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        const lp = onePoleLowpass();
        let phaseMain = 0, phaseMod = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const modAmp = expRamp(t, dur, 300, 10);
            phaseMod += (2 * Math.PI * 150) / SR;
            const modOffset = oscSample('sine', phaseMod) * modAmp;
            const fBase = expRamp(t, dur, 800, 80);
            phaseMain += (2 * Math.PI * Math.max(20, fBase + modOffset)) / SR;
            const fc = expRamp(t, dur, 2000, 200);
            const g = expRamp(t, dur, 0.22, 0.001);
            data[i] = lp(oscSample('sawtooth', phaseMain), fc) * g * 2;
        }
        return data;
    }

    function renderSkinSwitch() {
        const dur = 0.25, n = (SR * dur) | 0;
        const data = new Float32Array(n);
        let p1 = 0, p2 = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f1 = t < 0.08 ? 523.25 : 783.99;
            const f2 = t < 0.08 ? 1046.50 : 1567.98;
            p1 += (2 * Math.PI * f1) / SR;
            p2 += (2 * Math.PI * f2) / SR;
            const g = expRamp(t, dur, 0.12, 0.001);
            data[i] = (oscSample('sine', p1) + oscSample('triangle', p2) * 0.5) * g;
        }
        return data;
    }

    // ---------------- Float32 → 16-bit WAV ----------------

    function floatToWav(samples) {
        const n = samples.length;
        const dataBytes = n * 2;
        const buf = new ArrayBuffer(44 + dataBytes);
        const view = new DataView(buf);
        // RIFF
        view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // "RIFF"
        view.setUint32(4, 36 + dataBytes, true);
        view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // "WAVE"
        // fmt
        view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // "fmt "
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);             // PCM
        view.setUint16(22, 1, true);             // mono
        view.setUint32(24, SR, true);            // sample rate
        view.setUint32(28, SR * 2, true);        // byte rate
        view.setUint16(32, 2, true);             // block align
        view.setUint16(34, 16, true);            // bits per sample
        // data
        view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // "data"
        view.setUint32(40, dataBytes, true);
        let off = 44;
        for (let i = 0; i < n; i++) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(off, s | 0, true);
            off += 2;
        }
        return buf;
    }

    // ---------------- 文件生成（首次启动）----------------

    function ensureDir(path) {
        try { FS.accessSync(path); } catch (e) {
            try { FS.mkdirSync(path, true); } catch (e2) {}
        }
    }

    function writeIfMissing(name, render) {
        const path = BASE_DIR + '/' + name + '.wav';
        try {
            FS.accessSync(path);
            return path;
        } catch (e) {
            const samples = render();
            const wav = floatToWav(samples);
            FS.writeFileSync(path, wav, 'binary');
            return path;
        }
    }

    ensureDir(BASE_DIR);

    const SOUND_DEFS = {
        shoot:        renderShoot,
        hit:          renderHit,
        expl_S:       () => renderExplosion(false),
        expl_L:       () => renderExplosion(true),
        powerup:      renderPowerup,
        bomb:         renderBomb,
        gameOver:     renderGameOver,
        slingshot:    renderSlingshot,
        titanLaser:   renderTitanLaser,
        gravityRipple: renderGravityRipple,
        warp:         renderWarp,
        skinSwitch:   renderSkinSwitch
    };

    // ---------------- 复音池播放器 ----------------
    function makePool(src, size) {
        const pool = [];
        for (let i = 0; i < size; i++) {
            const a = wx.createInnerAudioContext();
            a.src = src;
            a.volume = 1;
            pool.push(a);
        }
        let idx = 0;
        return function play() {
            const a = pool[idx];
            idx = (idx + 1) % size;
            // 不要 stop()：某些 wx 版本会清空 src 导致下次无声；seek(0) + play() 已能从头播
            try { a.seek(0); } catch (e) {}
            a.play();
        };
    }

    const players = {};

    function buildSound(k) {
        try {
            const path = writeIfMissing(k, SOUND_DEFS[k]);
            players[k] = makePool(path, POOL_SIZES[k] || 2);
        } catch (e) {
            console.warn('[sound_wx] generate failed:', k, e);
        }
    }

    // 优先生成最关键的 shoot（玩家进场就开火），其余在 idle tick 上异步分批，避免冷启动主线程阻塞
    buildSound('shoot');
    const remaining = Object.keys(SOUND_DEFS).filter((k) => k !== 'shoot');
    let __ri = 0;
    function buildNext() {
        if (__ri >= remaining.length) return;
        buildSound(remaining[__ri++]);
        setTimeout(buildNext, 0);
    }
    setTimeout(buildNext, 0);

    // ---------------- 与原 SoundFX 同名 API 的包装类 ----------------

    class SoundFXWx {
        constructor() {
            this.muted = false;
            this.lastPlayTime = {};
        }
        init() { /* 小游戏无需 AudioContext 解锁 */ }
        toggleMute() {
            this.muted = !this.muted;
            return this.muted;
        }
        _gate(key, minInterval) {
            const now = Date.now() / 1000;
            if (now - (this.lastPlayTime[key] || 0) < minInterval) return false;
            this.lastPlayTime[key] = now;
            return true;
        }
        _play(name, gateKey, gateInterval) {
            if (this.muted) return;
            if (gateKey && !this._gate(gateKey, gateInterval)) return;
            const p = players[name];
            if (p) p();
        }
        playShoot()         { this._play('shoot',        'shoot', 0.05); }
        playHit()           { this._play('hit',          'hit',   0.04); }
        playExplosion(isL)  { this._play(isL ? 'expl_L' : 'expl_S', isL ? 'expl_L' : 'expl_S', 0.06); }
        playPowerup()       { this._play('powerup'); }
        playBomb()          { this._play('bomb'); }
        playGameOver()      { this._play('gameOver'); }
        playSlingshot()     { this._play('slingshot'); }
        playTitanLaser()    { this._play('titanLaser'); }
        playGravityRipple() { this._play('gravityRipple'); }
        playWarp()          { this._play('warp'); }
        playSkinSwitch()    { this._play('skinSwitch'); }
    }

    // 用 wx 版替换原 sfx（原 sfx 由 sound.js 末尾的 GameGlobal 守卫块挂上来）
    G.sfx = new SoundFXWx();
})();
