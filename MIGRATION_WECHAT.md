# 微信小游戏迁移说明（`wechat-minigame` 分支）

本分支把 `main` 分支的 H5 版《星海猎手 V6》迁移到微信小游戏运行时。

## 目录结构

```
spaceshooter/
├── game.json              # 小游戏入口配置（竖屏）
├── game.js                # 小游戏入口脚本：加载 adapter → 引擎 → 主流程
├── weapp-adapter.js       # 浏览器 API 适配层（window/document/localStorage/AudioContext/Image/事件桥）
├── project.config.json    # 微信开发者工具项目配置（compileType=game，appid 已存在）
├── js/
│   ├── engine_base.js     # 已追加 GameGlobal 守卫导出
│   ├── engine_entities.js # 已追加 GameGlobal 守卫导出（helpers + WEAPONS_NAMES）
│   ├── engine_physics.js  # 仅扩展 GameEngine.prototype，无需修改
│   ├── engine_boss.js     # 同上
│   ├── engine_renderer.js # 同上
│   ├── engine_hangar.js   # 同上
│   ├── sound.js           # 已追加 GameGlobal 守卫导出
│   ├── wechat_main.js     # 小游戏主线程入口（取代 H5 的 main.js）
│   ├── main.js            # 仅 H5 用，小游戏不加载
│   └── game_worker.js     # 仅 H5 用，小游戏不加载
└── space_shooter.html / *.html / style.css   # H5 资源，小游戏运行时忽略
```

## 启动链路

```
微信小游戏运行时
   └─ game.js
        ├─ require('./weapp-adapter.js')   // 注入 window/document/localStorage 等
        ├─ require('./js/engine_base.js')  // 暴露 GameGlobal.GameEngine
        ├─ require('./js/engine_entities.js')
        ├─ require('./js/engine_physics.js')
        ├─ require('./js/engine_boss.js')
        ├─ require('./js/engine_renderer.js')
        ├─ require('./js/engine_hangar.js')
        ├─ require('./js/sound.js')        // 暴露 GameGlobal.sfx
        └─ require('./js/wechat_main.js')  // new GameEngine() + RAF 主循环
```

## 与 H5 版的差异 & 已做的兼容工作


| 项            | H5 行为                                               | 小游戏行为                                   | 处理                                                                                                  |
| ------------ | --------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Canvas 取得    | `document.getElementById('gameCanvas')`             | `wx.createCanvas()`                     | adapter 中 `document.getElementById('gameCanvas')` 返回 `wx.createCanvas()` 创建的上屏 Canvas               |
| 触摸事件         | `canvas.addEventListener('touchstart', …)`          | `wx.onTouchStart/Move/End`              | adapter 在上屏 Canvas 上注入 `addEventListener`，把 wx 触摸事件包成 DOM TouchEvent 派发                             |
| 键盘           | `window.addEventListener('keydown')`                | 不支持                                     | adapter 静默 no-op；移动端没有键盘需求                                                                          |
| localStorage | `window.localStorage`                               | `wx.getStorageSync` / `setStorageSync`  | adapter 已桥接（含 `space_best_score` / `space_current_skin` / `space_unlocked_skins`）                   |
| 音效           | `new AudioContext()`                                | 不支持 WebAudio                            | adapter 给一套 noop OscillatorNode/GainNode，避免 sound.js 抛错。**真实声音待后续接 `wx.createInnerAudioContext()`** |
| Web Worker   | `new Worker('js/game_worker.js')` + OffscreenCanvas | 不支持 `importScripts`，OffscreenCanvas 不可用 | adapter 让 `new Worker()` 抛错；`wechat_main.js` 直接走主线程渲染（等价 H5 的 fallback 分支）                          |
| RAF          | `requestAnimationFrame`                             | 必须用 `canvas.requestAnimationFrame`      | adapter 在 `GameGlobal` 上挂的是 canvas 提供的版本                                                            |


## 已完成的 UI 迁移

`js/wechat_ui.js` 提供了一个轻量 Canvas UI 层，由 `wechat_main.js` 每帧在引擎 draw 之后叠加绘制，并通过
`GameGlobal.__uiCaptureInput` 与 adapter 协作 —— **UI 显示时吞掉触摸事件**，避免触摸菜单时飞机跟着抖。

- **HUD**：顶部信息条（SCORE / SCRAP / WAVE / HI）+ HP/Shield/Warp 三条进度条 + EM 炸弹按钮 + 暂停按钮 + Boss 血条
- **起始菜单**：标题 + HI-SCORE + 开始战斗按钮 + 操作提示
- **暂停菜单**：继续航行 / 重新开始 / 返回主菜单
- **战败结算**：终末得分 + 抵御波数 + 再来一局 / 返回主菜单
- **生命周期**：`wx.onHide` 自动暂停，`wx.onShow` 重置时钟避免 dt 跳变

UI 与引擎都在 540×960 逻辑坐标下绘制，adapter 把 `document.getElementById('canvas-container').clientWidth/Height`
桥接到屏幕像素，让引擎自带的 9:16 letterbox 适配链路直接生效。

## 本轮再补完的 UI

- **改装车间（Hangar）**：引擎过波时自动 `openHangar()`，已被 hook 切到 UI 的 `hangar` 状态；
渲染 3 张模块升级卡（纳米伴飞僚机 / 等离子尾喷 / 切割能盾翼，含等级点）+ 3 张涂装卡
（星渊幻影 / 超维雷霆 / 帝皇余晖，状态：使用中 / 已解锁 / 锁定+解锁价），点击直接调用
`engine.buyModule()` / `engine.interactSkin()`，"整备完毕"按钮触发 `engine.exitHangar()` 回到战斗
- **跑分模式（Benchmark）**：起始菜单 + 暂停菜单都加了 "极客压力测试" 入口；
UI 自动监听 `engine.isBenchmarking` 由 true→false 的切换，从
`benchFrames / benchFpsTotal / benchPhysDelayTotal / benchDrawDelayTotal` 算出 score+rank+三项指标，
切到 `benchReport` 状态展示，提供"再跑一次 / 返回主菜单"
- **晶核 / 元素芯片**：HUD 第三行直接读 `engine.player.elementSlots`，用 `formatElementChipLabel`
画两个 chip + 右侧 synergyName（双元素时显示组合名）
- **Canvas Toast**：hook 了 `engine.showToast`，所有引擎里"购买成功 / 切换涂装 / 升级"提示
自动用半透明胶囊条在屏幕上方显示 1.5s
- **暂停菜单按钮重排**：继续 / 极客压力测试 / 重新开始 / 返回主菜单 四项

## 仍然需要你提供的内容

1. **音效已纯代码实现 ✓**
  - `js/sound_wx.js` 在首次启动时按原 `sound.js` 的合成数学逐采样算出 12 个效果的 PCM，
   量化成 16-bit 单声道 WAV 写入 `${wx.env.USER_DATA_PATH}/sfx/*.wav`，
   之后 `wx.createInnerAudioContext()` 池化 4 路并发播放。**无需任何素材文件**。
  - 在 `game.js` 里于 `sound.js` 之后加载，覆盖 `GameGlobal.sfx`，引擎全部 `sfx.playXxx()` 调用透明走 wx 版。
  - 包含 shoot / hit / explosion(S+L) / powerup / bomb / gameOver / slingshot / titanLaser /
  gravityRipple / warp / skinSwitch 共 12 个；同名节流与原版一致。
  - 静音通过 `engine.toggleSound()` 调到 `sfx.toggleMute()`，行为不变。
2. **自定义字体（可选 / 需素材）**
  - 把 `Orbitron-Bold.ttf`（或类似科技感字体）放进 `fonts/`
  - 我会在 `weapp-adapter.js` 启动时 `wx.loadFont('fonts/Orbitron-Bold.ttf')` 注册，
  然后把 UI 里的 `'bold 22px sans-serif'` 换成 `'bold 22px Orbitron'`
3. **正式 `appid`**
  - 现在 `project.config.json` 里是 `wx8202dc1a4d081f1d`（占位）
  - 替换成你在「微信公众平台 → 小游戏」申请的 appid，否则没法上传体验版/正式版
4. **发布信息（如果要上架）**
  - 小游戏名称、图标 200×200 PNG、简介、分类等 —— 这些都在公众平台后台填，无需修改本仓库
5. **决定要不要做的额外项**（任选一个告诉我，我就接着做）：
  - 起始菜单的"涂装预览"动画
  - 战败结算页加"分享给好友"按钮（调 `wx.shareAppMessage`）
  - 排行榜（需要"开放数据域"，要写 `openDataContext`，工作量稍大）
  - 微信广告位（激励视频复活、Banner 等，需要先在后台开通广告位 ID）

## 本地调试

1. 用微信开发者工具打开本仓库根目录
2. 选择"小游戏" 项目类型（`project.config.json` 中 `compileType: "game"` 已配置好）
3. 编译运行；如出现报错请检查控制台，多数与上面 TODO 第 1/2 条相关（DOM-only 的 UI 调用）

## 主分支兼容性

所有对 `js/engine_base.js`、`js/engine_entities.js`、`js/sound.js` 的修改都包在
`if (typeof GameGlobal !== 'undefined')` 守卫块里，浏览器环境中 `GameGlobal` 未定义，
守卫块直接跳过，`**main` 分支 H5 版功能不受影响**。