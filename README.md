# 🌌 星海猎手 V6 (Starsea Hunter V6)

> **极客级双重底层性能飞跃 • 战术时空折跃与多关节利维坦吞噬蠕虫双首领决战**

[![Tech Stack](https://img.shields.io/badge/Tech_Stack-HTML5_/_Canvas_/_Vanilla_JS-0284c7?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com)
[![0-GC Optimization](https://img.shields.io/badge/Performance-0--GC_Optimized-10b981?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays)
[![Dual-Mode Engine](https://img.shields.io/badge/Architecture-Web_Worker_Offscreen-8b5cf6?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
[![CORS-Free](https://img.shields.io/badge/Offline-100%25_CORS--Free-e11d48?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## 📌 GitHub About 简介说明 (推荐直接复制至项目右侧 About 栏)

```text
🌌 极客级 HTML5 网页太空射击游戏。搭载首创的 0-GC 静态 TypedArray 物理引擎、Web Worker 双核/单线程自适应双底层渲染系统，支持 100% 离线双击运行。融合战术量子折跃、多关节利维坦吞噬蠕虫分裂 Boss 以及 3 款超维动态渐变涂装，打造畅快淋漓的 60FPS 满帧星际对决！
```

---

## 🌟 V6 核心引擎突破

《星海猎手 V6》是一个面向网页端极致性能与硬核物理反馈的纯前端太空弹幕射击游戏。

### 1. 🌀 战术超空间量子折跃 (Tactical Quantum Warp)
*   **物理机制**：当星能充能槽满额（`warpCharge >= 100`），即可触发量子折跃。
*   **空间坍缩 (Singularity Pull)**：在原坐标爆发 $50$ 颗量子衰变粒子，扭曲时空。
*   **量子轰鸣 (Quantum Boom)**：瞬间折跃 $300\text{px}$ 避开迎面流星。在新坐标点爆发 $60$ 颗量子撞击粒子，触发屏幕高频震颤，产生的量子爆破对半径 $200\text{px}$ 内的流星造成 $300$ 点巨额伤害并施加 2D 动能矢量推斥（向上弹开 $80\text{px}$，水平炸裂 $60\text{px}$）。

### 2. 🐉 利维坦吞噬蠕虫首领 (Asteroid Devourer Worm)
*   **逆向动力学关节链 (LERP Follow)**：由 $10$ 节刚体节点通过平滑阻尼物理拉扯追随。头部自动锁定最近流星并以重力场牵引吞噬，每吃掉一颗流星将汲取流星残余生命值的 $2$ 倍用于自身恢复。
*   **躯干受击断裂裂变 (Segment Fission)**：当蠕虫中后段的骨节生命值归零时，该节点变为死激活状态，其后继骨节将瞬间产生基因突变分裂，分化成一颗全新独立索敌、游动吞噬成长的短蠕虫头部，形成多头绞杀之势！

### 3. 🎨 三款超维动态涂装与物理被动 (Cosmic Skin Passive Mechanics)
*   **🌌 星渊幻影 (Void Phantom)** (售价: 80 废料)：紫粉渐变尾迹。被动：激活引力弹弓瞬间触发最大半径为 $800\text{px}$ 的**重力海啸波**，全屏击退小型星体。
*   **⚡ 超维雷霆 (Dimension Thunder)** (售价: 100 废料)：蓝黄渐变雷痕。被动：使 **EM+Fire (电磁+烈焰)** 双核连锁雷电暴击索敌距离拓宽 $30\%$ 至 **$520\text{px}$**。
*   **✨ 帝皇余晖 (Imperial Afterglow)** (售价: 120 废料)：红金华丽尾迹。被动：强力磁力范围由 $180\text{px}$ 增幅至 **$230\text{px}$**，废料回收机制获得双倍暴击增益，碰撞点渲染漂浮文字 `CRIT +2`。

---

## ⚡ 极客性能底座 (Geek Performance Architecture)

*   **⚡ 0-GC 极客算力**：采用平坦化连续内存布局，粒子缓冲复用一块 `Float32Array(4000)` 静态空间，避免运行时 `new`、`map`、`filter` 等导致的垃圾回收卡顿。碰撞检测全部基于距离平方（`dx^2 + dy^2 < R^2`）舍弃 `Math.sqrt()` 开方运算，保障全屏弹幕雷击下 100% 满帧 60FPS。
*   **🧵 Web Worker 双核架构**：当以 http 服务启动时，游戏自动开启双核模式，将核心物理更新和 Canvas 绘图上下文转移至子线程 (`OffscreenCanvas`) 执行，彻底解放主线程 DOM 渲染；在本地离线无同源协议 (`file://`) 双击运行时，自适应无缝退化至主线程单线程渲染，**规避任何 CORS 限制**。

---

## 🎮 操控指南 (Controls)

| 动作 | 键盘操作 | 触控屏/鼠标操作 |
| :--- | :--- | :--- |
| **飞船移动** | `W` `A` `S` `D` 或方向键 | 拖拽飞船进行平滑跟手移动 |
| **主炮发射** | `Space` (空格键) | 拖拽时自动连发 / 底部火控键 |
| **EM 电浆炸弹** | 点击底部 **EM炸弹** 按钮 | 点击底部 **EM炸弹** 按钮 |
| **战术量子折跃** | 按下 `Shift` (向前跃迁) | **双击** 屏幕目标位置 (直接跃迁至指尖) |
| **暂停/设置** | `Escape` 或 `P` | 点击顶部 **暂停** 图标 |

---

## 🚀 启动与调试 (Getting Started)

### 方案 A：本地极速挂载服务 (推荐)
Windows 操作系统下，直接双击运行项目根目录下的 [**`start.bat`**](file:///c:/Users/huayu/Desktop/github/spaceshooter/start.bat)：
1.  脚本将自动检测环境，按 **Python $\rightarrow$ NodeJS $\rightarrow$ Windows 原生 PowerShell 网络监听器** 的顺序在后台挂载本地 `http://localhost:9999` 服务。
2.  输入 `1` 即可在默认浏览器中以 **Web Worker 双核最高性能模式** 启动游戏本体。
3.  输入 `2` 安全释放 9999 端口并清理后台挂载服务。

### 方案 B：离线无环境极速畅玩
直接双击双击 [**`space_shooter.html`**](file:///c:/Users/huayu/Desktop/github/spaceshooter/space_shooter.html) 文件！在没有任何运行环境的电脑上，依然能以单线程降级引擎完美战斗！

### 🧪 开发者热更新调试指令 (局内彩蛋)
在游戏战斗进行中，通过键盘按下 `K` 键，或双击顶部得分栏文本，即可触发**极客热更新调试**：
*   飞船血量立即恢复 `20` 点；
*   积分立即增加 `1000` 分；
*   金属废料即刻增加 `10` 个；
*   屏幕抛出 `🧪 极客热更新调试` 高亮浮空Toast。

---

## 📁 目录结构 (Repository Layout)

```text
spaceshooter/
├── js/
│   ├── sound.js            # 离线级声效合成系统 (Web Audio API)
│   ├── engine_base.js      # 引擎基底类 (GameEngine 构造、主循环与按键)
│   ├── engine_physics.js   # 极客平方检测碰撞系统 (checkCollisions & 折跃物理)
│   ├── engine_entities.js  # 0-GC 扁平 TypedArray 粒子、弹药与流星池
│   ├── engine_boss.js      # 双首领行为 AI (母舰死光与吞噬蠕虫逆向动力学)
│   ├── engine_renderer.js  # Canvas 超维涂装渐变与高清图层绘制
│   ├── engine_hangar.js    # 改装整备舱本地存储数据持久化与升级逻辑
│   ├── game_worker.js      # Web Worker 子线程 Mock 代理及数据序列化桥梁
│   └── main.js             # 主线程 Loader、Worker 消息调度与 fallback 挂载
├── space_shooter.html      # V6 极客风格战术 HUD 主游戏入口
├── v6_hangar.html          # 超维整备舱 (机载改装、超维涂装激活)
├── game_design.html        # 极客底盘白皮书 (物理公式与数学推导，集成 LaTeX)
├── game_manual.html        # 终极战略手册 (操作指南与蠕虫对决秘诀)
├── version_history.html    # V1.0 - V6.0 编年史历史记录
├── style.css               # 磨砂拟物玻璃面板与霓虹光晕专用样式
└── start.bat               # Windows 原生免配置自适应服务器启动器
```

---

## 📜 极客白皮书与手册文档

*   [**`game_design.html` (极客底盘白皮书)**](file:///c:/Users/huayu/Desktop/github/spaceshooter/game_design.html)：深入研究了多关节利维坦吞噬蠕虫的阻尼追随受力方程式、0-GC TypedArray 连续存储索引偏移公式、量子折跃起点终点的量子密度方程等。*采用优雅的 KaTeX 离线渲染。*
*   [**`game_manual.html` (终极战略手册)**](file:///c:/Users/huayu/Desktop/github/spaceshooter/game_manual.html)：包含了 V6 版本时空折跃的战术切入与流星物理震荡弹射技巧、以及在双首领决战中克制蠕虫吞食陨石恢复生命的高级应对路线图。
