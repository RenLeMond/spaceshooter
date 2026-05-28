# 星海猎手 · WeChat 小游戏移植版

本分支 (`wechat-minigame`) 是《星海猎手》(Starsea Hunter) 的**微信小游戏**移植版本。H5 原版位于 `main` 分支。

完整的移植说明、架构改动与适配细节请见 [`MIGRATION_WECHAT.md`](./MIGRATION_WECHAT.md)。

## 在微信开发者工具中打开

1. 打开 **微信开发者工具**，选择 **小游戏** 项目类型。
2. 点击 **导入项目**，选择本仓库根目录作为项目目录。
3. AppID 可使用 `project.config.json` 中预填的测试号，或填入你自己的小游戏 AppID。
4. 关键配置（已写入 `project.config.json`）：
   - `compileType`: `game`
   - 项目根目录：仓库根目录
5. 点击 **编译** 即可在模拟器中运行；真机调试请使用工具栏的「预览」/「真机调试」。

## 入口文件

- `game.json` — 小游戏配置清单
- `game.js` — 启动入口，加载 `weapp-adapter.js` 后引导 `js/wechat_main.js`
- `weapp-adapter.js` — 官方 weapp 适配层（提供 `document` / `window` / `Image` 等浏览器 API 兜底）
- `js/wechat_main.js` — 小游戏主循环（替代 H5 版的 `js/main.js`）
- `js/wechat_ui.js` — 小游戏 UI 层
- `js/sound_wx.js` — 基于 `wx.createInnerAudioContext` 的音频实现

## 注意

- 不要在本分支引入 DOM / HTML / Web Worker 相关代码，小游戏运行时不支持。
- 资源访问统一通过 `wx.getFileSystemManager()` 或 `weapp-adapter` 兜底完成。
