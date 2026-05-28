// 极简 weapp-adapter —— 仅覆盖《星海猎手》代码实际依赖的浏览器 API
// 设计目标：让 engine_*.js / sound.js / wechat_main.js 在 wx 小游戏 GameGlobal 下运行时
// 对 window / document / localStorage / Image / Worker / AudioContext / requestAnimationFrame 的访问
// 全部走到这里的 mock / 适配，而不抛错。
//
// 注意：本文件运行在 wx 小游戏运行时，CommonJS 模块作用域；通过给 GameGlobal 赋值发布到全局。

/* eslint-disable no-undef */

const G = GameGlobal;

// ---------- 1) Canvas ----------
// wx.createCanvas() 第一次调用返回上屏 Canvas
const screenCanvas = wx.createCanvas();

// 基础库 3.0+ 推荐拆分接口；旧基础库回退到 getSystemInfoSync()
function readSysInfo() {
    if (typeof wx.getWindowInfo === 'function' && typeof wx.getDeviceInfo === 'function') {
        const w = wx.getWindowInfo();
        const d = wx.getDeviceInfo();
        return {
            windowWidth: w.windowWidth,
            windowHeight: w.windowHeight,
            pixelRatio: w.pixelRatio,
            screenWidth: w.screenWidth,
            screenHeight: w.screenHeight,
            platform: d.platform,
            system: d.system,
            brand: d.brand,
            model: d.model
        };
    }
    return wx.getSystemInfoSync();
}
const sysInfo = readSysInfo();
const DPR = sysInfo.pixelRatio || 1;
const SCREEN_PX_W = sysInfo.windowWidth;
const SCREEN_PX_H = sysInfo.windowHeight;

// 暴露给外部
G.__screenCanvas = screenCanvas;
G.__sysInfo = sysInfo;

// ---------- 2) 屏幕尺寸 / letterbox ----------
// 关键决策：物理上屏 canvas 使用物理分辨率 (DPR)，绘制坐标在 letterbox 中平移缩放；
// 触摸与布局使用 CSS 像素比例 (toLogical / getBoundingClientRect)。
// 这样既能实现视口在任何屏幕下的完美自适应，又能输出 Retina 级的极致高清晰画质。
const LB_TARGET = 9 / 16;
function calcLetterboxCss() {
    const info = readSysInfo();
    const w = info.windowWidth;
    const h = info.windowHeight;
    const r = w / h;
    let cw, ch, ox = 0, oy = 0;
    if (r > LB_TARGET) { ch = h; cw = ch * LB_TARGET; ox = (w - cw) / 2; }
    else                { cw = w; ch = cw / LB_TARGET; oy = (h - ch) / 2; }
    return { left: ox, top: oy, width: cw, height: ch, right: ox + cw, bottom: oy + ch };
}
// 作为首次运行及回退保底，后续由 getBoundingClientRect 动态实时重新计算
G.__letterboxCss = calcLetterboxCss();

function noopMockElement(opts) {
    const cw = (opts && opts.clientWidth) || 0;
    const ch = (opts && opts.clientHeight) || 0;
    const el = {
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        style: {},
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        removeChild() {},
        setAttribute() {},
        getAttribute() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 0, top: 0, right: cw, bottom: ch, width: cw, height: ch }; },
        clientWidth: cw,
        clientHeight: ch,
        offsetWidth: cw,
        offsetHeight: ch,
        innerText: '',
        innerHTML: '',
        textContent: '',
        className: '',
        disabled: false,
        children: [],
        firstChild: null,
        parentNode: null
    };
    el.cloneNode = () => noopMockElement(opts);
    return el;
}

// 新版微信运行时（wx 3.16+）把 GameGlobal.document / window / location 设成了
// 不可配置 + 只 getter —— 既不能赋值也不能 defineProperty 整体替换。
// 因此采用"就地打补丁"策略：保留内置对象，只覆盖我们需要的方法/字段（方法属性通常可写）。
function setOrDefine(obj, key, value) {
    try {
        obj[key] = value;
        if (obj[key] === value) return true;
    } catch (e) { /* 落到 defineProperty 分支 */ }
    try {
        Object.defineProperty(obj, key, { value, writable: true, configurable: true });
        return true;
    } catch (e2) {
        return false;
    }
}

// ---------- 2) 给内置 document 打补丁 ----------
// wx 自带一个最小 document（含一些默认 getElementById 行为）。我们只覆盖几个关键方法，
// 让 #gameCanvas、#canvas-container 等返回我们想要的对象。
const doc = G.document || {};
if (!G.document) {
    setOrDefine(G, 'document', doc);
}
// 不调用 wx 内置 getElementById/createElement：它对未知 id 可能返回缺字段的对象，
// 让引擎里 `.classList.add()` / `.style.left = ...` 这种调用爆 TypeError；
// 直接全部返回我们的 noopMockElement，保证字段齐全。
setOrDefine(doc, 'getElementById', function (id) {
    if (id === 'gameCanvas') return screenCanvas;
    if (id === 'canvas-container') {
        return noopMockElement({ clientWidth: SCREEN_PX_W, clientHeight: SCREEN_PX_H });
    }
    return noopMockElement();
});
setOrDefine(doc, 'createElement', function (tag) {
    if (tag === 'canvas') return wx.createCanvas();
    return noopMockElement();
});
if (!doc.addEventListener) setOrDefine(doc, 'addEventListener', function () {});
if (!doc.removeEventListener) setOrDefine(doc, 'removeEventListener', function () {});
if (!doc.documentElement) setOrDefine(doc, 'documentElement', { clientWidth: SCREEN_PX_W, clientHeight: SCREEN_PX_H });
if (!doc.body) setOrDefine(doc, 'body', noopMockElement({ clientWidth: SCREEN_PX_W, clientHeight: SCREEN_PX_H }));

// ---------- 3) window / navigator / location ----------
// document/window/location 都改不动；window 就是 GameGlobal 本身。我们只补缺失字段。
if (!G.window) setOrDefine(G, 'window', G);
if (!G.navigator) setOrDefine(G, 'navigator', { userAgent: 'wechat-minigame', platform: sysInfo.platform });
setOrDefine(G, 'ontouchstart', null);
// location 是只读的，跳过 —— 我们的代码也只会读 location.search，存在与否都不会崩
if (!G.performance) setOrDefine(G, 'performance', { now: () => Date.now() });

if (typeof G.addEventListener !== 'function') setOrDefine(G, 'addEventListener', function () {});
if (typeof G.removeEventListener !== 'function') setOrDefine(G, 'removeEventListener', function () {});

// ---------- 3.5) Canvas 事件桥 ----------
// 引擎里 `this.canvas.addEventListener('touchstart' / 'touchmove' / 'touchend' / 'dblclick' / 'mousedown', ...)`
// 在小游戏的 Canvas 上不存在，这里给上屏 Canvas 注入一套与 DOM 行为一致的 listener 注册/分发器，
// 再用 wx.onTouchXxx 把系统触摸事件包装成 DOM 风格的 TouchEvent 派发出去。
if (!screenCanvas.style) {
    // 引擎 resizeCanvas 里会赋 canvas.style.left/top/width/height —— 给个 noop 容器即可
    screenCanvas.style = {};
}
if (!screenCanvas.addEventListener) {
    const listeners = {};
    screenCanvas.addEventListener = function (type, fn) {
        (listeners[type] = listeners[type] || []).push(fn);
    };
    screenCanvas.removeEventListener = function (type, fn) {
        const arr = listeners[type];
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
    };
    // 引擎里 onTouchStart/Move 用 (clientX - rect.left) * (logicalWidth / rect.width) 算逻辑坐标。
    // 这里返回 letterbox 子区域的 CSS 矩形（不是全屏），让引擎的换算正确扣掉黑边偏移。
    screenCanvas.getBoundingClientRect = function () {
        const lb = calcLetterboxCss();
        return { left: lb.left, top: lb.top, right: lb.right, bottom: lb.bottom, width: lb.width, height: lb.height };
    };
    screenCanvas.__dispatch = function (type, ev) {
        const arr = listeners[type];
        if (!arr) return;
        for (let i = 0; i < arr.length; i++) {
            try { arr[i](ev); } catch (e) { console.error('[adapter] listener error', e); }
        }
    };

    // 把 wx 触摸事件包装成 DOM TouchEvent —— 由 UI 层作为唯一入口决定何时派发
    function wrapTouches(wxTouches) {
        const arr = [];
        for (let i = 0; i < wxTouches.length; i++) {
            const t = wxTouches[i];
            arr.push({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY });
        }
        return arr;
    }
    function makeTouchEvent(type, wxEvent) {
        const touches = wrapTouches(wxEvent.touches || []);
        const changed = wrapTouches(wxEvent.changedTouches || []);
        return {
            type,
            touches,
            targetTouches: touches,
            changedTouches: changed,
            timeStamp: wxEvent.timeStamp,
            preventDefault() {},
            stopPropagation() {}
        };
    }
    // 暴露给 wechat_ui：在 UI 不消费 touch 时调用，把事件转给引擎注册到 canvas 的 listener
    G.__forwardTouchToEngine = function (type, wxEvent) {
        screenCanvas.__dispatch(type, makeTouchEvent(type, wxEvent));
    };
    G.__dispatchDblClickToEngine = function (clientX, clientY) {
        screenCanvas.__dispatch('dblclick', {
            type: 'dblclick', clientX, clientY,
            preventDefault() {}, stopPropagation() {}
        });
    };
}

// ---------- 4) requestAnimationFrame ----------
// 不同版本的微信 RAF 在不同位置：早期挂 canvas.requestAnimationFrame，新版本可能挂 GameGlobal，
// 也可能两者都没有 —— 这里依次回退；最终用 setTimeout(16) 兜底
let __rAF, __cAF;
if (typeof G.requestAnimationFrame === 'function') {
    __rAF = G.requestAnimationFrame.bind(G);
    __cAF = (typeof G.cancelAnimationFrame === 'function') ? G.cancelAnimationFrame.bind(G) : function () {};
} else if (typeof screenCanvas.requestAnimationFrame === 'function') {
    __rAF = screenCanvas.requestAnimationFrame.bind(screenCanvas);
    __cAF = (typeof screenCanvas.cancelAnimationFrame === 'function') ? screenCanvas.cancelAnimationFrame.bind(screenCanvas) : function () {};
} else {
    let __rafId = 0;
    const __rafTimers = {};
    __rAF = function (cb) {
        const id = ++__rafId;
        __rafTimers[id] = setTimeout(() => { delete __rafTimers[id]; cb(Date.now()); }, 16);
        return id;
    };
    __cAF = function (id) { if (__rafTimers[id]) { clearTimeout(__rafTimers[id]); delete __rafTimers[id]; } };
    console.warn('[adapter] requestAnimationFrame not provided by runtime; using setTimeout fallback');
}
setOrDefine(G, 'requestAnimationFrame', __rAF);
setOrDefine(G, 'cancelAnimationFrame', __cAF);

// ---------- 5) localStorage ----------
setOrDefine(G, 'localStorage', {
    getItem(key) {
        try {
            const v = wx.getStorageSync(key);
            return v === '' ? null : v;
        } catch (e) { return null; }
    },
    setItem(key, val) {
        try { wx.setStorageSync(key, String(val)); } catch (e) {}
    },
    removeItem(key) {
        try { wx.removeStorageSync(key); } catch (e) {}
    },
    clear() {
        try { wx.clearStorageSync(); } catch (e) {}
    }
});

// ---------- 6) Image ----------
setOrDefine(G, 'Image', function () { return wx.createImage(); });

// ---------- 7) AudioContext (WebAudio) ----------
// 小游戏未提供 WebAudio。这里给出极简 mock，让 sound.js 的 createOscillator / createGain 链式调用不抛错。
// 真实音效推荐之后改用 wx.createInnerAudioContext()。
function makeFakeAudioNode() {
    const node = {
        connect() { return node; },
        disconnect() {},
        start() {},
        stop() {},
        gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
        frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
        Q: { value: 0, setValueAtTime() {} },
        type: 'sine'
    };
    return node;
}
const AudioContextCtor = function () {
    return {
        currentTime: 0,
        state: 'running',
        destination: makeFakeAudioNode(),
        resume() {},
        suspend() {},
        createOscillator: makeFakeAudioNode,
        createGain: makeFakeAudioNode,
        createBiquadFilter: makeFakeAudioNode,
        createBufferSource: makeFakeAudioNode,
        createBuffer() { return { getChannelData() { return new Float32Array(0); } }; }
    };
};
setOrDefine(G, 'AudioContext', AudioContextCtor);
setOrDefine(G, 'webkitAudioContext', AudioContextCtor);

// ---------- 8) Worker ----------
// 小游戏 worker 只能通过 wx.createWorker('workers/xxx.js') 创建，且不支持 importScripts。
// 现阶段我们走主线程路径，把 Worker 构造直接抛错让 wechat_main.js 走 fallback。
setOrDefine(G, 'Worker', function () {
    throw new Error('[wechat-minigame] Worker is not supported here; using main-thread fallback.');
});

// ---------- 9) OffscreenCanvas ----------
// canvas.transferControlToOffscreen 不存在，留空即可；wechat_main 直接走主线程渲染。

// ---------- 10) 字体（wx.loadFont）----------
// 把 Orbitron-Bold.ttf 注册成 Canvas 可用字体，UI 文本可走 'bold 22px Orbitron, sans-serif'
// Orbitron 没有中文字形，浏览器/小游戏 Canvas 会按 CSS 字体回退链自动用 sans-serif 渲染汉字
setOrDefine(G, '__uiFontFamily', 'sans-serif');
try {
    const family = wx.loadFont && wx.loadFont('Orbitron-Bold.ttf');
    if (family && typeof family === 'string') {
        setOrDefine(G, '__uiFontFamily', family + ', sans-serif');
    }
} catch (e) {
    console.warn('[adapter] loadFont failed:', e);
}

// ---------- 11) console（小游戏默认就有 console，这里不动） ----------
