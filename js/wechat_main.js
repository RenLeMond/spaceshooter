// 微信小游戏主线程入口 —— 对标 H5 版 main.js 中的 "降级单线程" 分支
// 小游戏环境：没有 DOM 菜单/HUD，没有 OffscreenCanvas，没有可 importScripts 的 Worker。
// 所以这里直接在主线程实例化 GameEngine + 一个 Canvas UI 层（WechatUI），跑 RAF 主循环。

(function bootstrap() {
    try {
        const G = GameGlobal;
        const canvas = G.__screenCanvas;
        const sys = G.__sysInfo;

        // ---- 微信小游戏自适应 ----
        // 覆盖 resizeCanvas：使用物理分辨率 (DPR) 设置 canvas buffer 大小，输出 Retina 级清晰画面。
        const TARGET = 9 / 16;

        // 1) 实例化引擎
        const engine = new G.GameEngine();
        G.gameEngine = engine;

        // 重新计算 letterbox并 patch resizeCanvas
        engine.resizeCanvas = function () {
            // 获取系统最新的视口尺寸 (CSS 像素)
            const info = (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function')
                ? wx.getWindowInfo()
                : (G.__sysInfo || { windowWidth: 375, windowHeight: 667, pixelRatio: 1 });
            
            const W_css = info.windowWidth;
            const H_css = info.windowHeight;
            
            // 小游戏物理 canvas 尺寸 (系统在启动时自动设为物理分辨率)
            // 读取已分配好的屏幕 Canvas physical 尺寸，避免手动赋值触发微信底层视口缩小 Bug
            const DPR = info.pixelRatio || 1;
            const physicalW = this.canvas.width || (W_css * DPR);
            const physicalH = this.canvas.height || (H_css * DPR);
            
            const r = W_css / H_css;
            let rw_css, rh_css;
            if (r > TARGET) { rh_css = H_css; rw_css = rh_css * TARGET; }
            else            { rw_css = W_css; rh_css = rw_css / TARGET; }
            
            // 真实缩放比例系数
            const scaleFactorX = physicalW / W_css;
            const scaleFactorY = physicalH / H_css;
            
            // 计算逻辑分辨率 (540x960) 映射到高精物理分辨率的缩放与偏置
            this.scaleX = (rw_css * scaleFactorX) / this.logicalWidth;
            this.scaleY = (rh_css * scaleFactorY) / this.logicalHeight;
            
            // 物理边距
            this.__lbOX = ((W_css - rw_css) / 2) * scaleFactorX;
            this.__lbOY = ((H_css - rh_css) / 2) * scaleFactorY;
            this.__lbRW = rw_css * scaleFactorX;
            this.__lbRH = rh_css * scaleFactorY;
            
            this.hudClearance = 150;
        };
        engine.resizeCanvas();

        // 2) 创建 UI 层
        const ui = new G.WechatUI(engine);
        G.wechatUI = ui;
        engine.isRunning = false;

        // 3) 主循环
        let lastTime = G.performance.now();
        function gameLoop(currentTime) {
            G.requestAnimationFrame(gameLoop);
            const dt = currentTime - lastTime;
            lastTime = currentTime;
            try {
                if (ui.state === 'playing' && !engine.isPaused) {
                    engine.update(dt);
                }

                const ctx = engine.ctx;
                const ox = engine.__lbOX || 0;
                const oy = engine.__lbOY || 0;

                // 1. 先清整屏并填充深蓝黑背景色（使两侧/上下 margin 视觉一体化）
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#02040a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                if (ui.state !== 'menu') {
                    // 2. 平移到 letterbox 内，绘制引擎画面
                    ctx.save();
                    ctx.translate(ox, oy);
                    
                    // 临时接管 clearRect，使其在 draw() 调用时不擦除已填色的 margins
                    const origClearRect = ctx.clearRect;
                    ctx.clearRect = function (x, y, w, h) {
                        // 游戏帧已清屏，所以内层 draw clear 设为 no-op，既防黑边被擦除又能优化渲染性能
                    };
                    
                    engine.draw();
                    
                    ctx.clearRect = origClearRect; // 还原
                    ctx.restore();
                }
                
                ui.update();

                // 3. UI 在 letterbox 区域内平移缩放绘制（共享逻辑坐标系 540x960）
                ctx.save();
                ctx.translate(ox, oy);
                ctx.scale(engine.scaleX || 1, engine.scaleY || 1);
                ui.draw(ctx);
                ctx.restore();
            } catch (e) {
                console.error('[wechat_main] frame error:', e && (e.stack || e.message || e));
            }
        }
        G.requestAnimationFrame(gameLoop);

        // 4) 监听窗口尺寸变化，实现动态自适应
        if (typeof wx !== 'undefined' && typeof wx.onWindowResize === 'function') {
            wx.onWindowResize(function () {
                if (engine && typeof engine.resizeCanvas === 'function') {
                    engine.resizeCanvas();
                }
            });
        }

        // 5) 生命周期
        if (typeof wx !== 'undefined') {
            wx.onHide(function () {
                if (ui.state === 'playing') {
                    engine.isPaused = true;
                    ui.setState('paused');
                }
            });
            wx.onShow(function () {
                lastTime = G.performance.now();
            });
        }
    } catch (e) {
        console.error('[wechat_main] bootstrap FATAL:', e && (e.stack || e.message || e));
    }
})();
