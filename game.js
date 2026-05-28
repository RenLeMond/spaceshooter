// 微信小游戏入口 —— 《星海猎手 V6》
// 1) 装配 weapp-adapter 把 window/document/localStorage/AudioContext/Image/Worker 等浏览器 API 补齐
// 2) 依次 require 引擎文件；每个引擎文件尾部的 GameGlobal 守卫块会把顶层类/常量挂到全局
// 3) 进入 js/wechat_main.js 启动主循环

// 真机预览没有 console，把异常用 showModal 显示出来，避免"一直加载"看不到原因
let __errorShown = false;
function __showFatal(prefix, err) {
    if (__errorShown) return;
    __errorShown = true;
    const msg = (err && (err.stack || err.message || String(err))) || 'unknown';
    try {
        wx.showModal({
            title: prefix,
            content: String(msg).slice(0, 500),
            showCancel: false,
            confirmText: '我知道'
        });
    } catch (_) {}
}
if (typeof wx !== 'undefined' && typeof wx.onError === 'function') {
    wx.onError(function (errInfo) {
        // errInfo 在不同基础库可能是 string、Error 或 { message, stack }
        const msg = (errInfo && (errInfo.stack || errInfo.message)) || String(errInfo);
        console.error('[wx.onError]', msg);
        __showFatal('运行时异常', msg);
    });
}
if (typeof wx !== 'undefined' && typeof wx.onUnhandledRejection === 'function') {
    wx.onUnhandledRejection(function (res) {
        const r = res && res.reason;
        const msg = (r && (r.stack || r.message)) || String(r);
        console.error('[wx.onUnhandledRejection]', msg);
        __showFatal('未处理 Promise', msg);
    });
}

function safeRequire(name, path) {
    try {
        require(path);
    } catch (e) {
        console.error('[game] FAILED to load:', name, '—', e && (e.stack || e.message || e));
        __showFatal('加载失败: ' + name, e);
        throw e;
    }
}

safeRequire('weapp-adapter', './weapp-adapter.js');

safeRequire('engine_base', './js/engine_base.js');
safeRequire('engine_entities', './js/engine_entities.js');
safeRequire('engine_physics', './js/engine_physics.js');
safeRequire('engine_boss', './js/engine_boss.js');
safeRequire('engine_renderer', './js/engine_renderer.js');
safeRequire('engine_hangar', './js/engine_hangar.js');
safeRequire('sound', './js/sound.js');
safeRequire('sound_wx', './js/sound_wx.js'); // 用 wx InnerAudioContext 版本覆盖 GameGlobal.sfx

safeRequire('wechat_ui', './js/wechat_ui.js');
safeRequire('wechat_main', './js/wechat_main.js');
