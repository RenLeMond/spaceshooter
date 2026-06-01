# 🌌 星海猎手 V7 (Starsea Hunter V7)

> **极客级双重底层性能飞跃 • 局外持久化先驱者星盘永久天赋系统 • 局内 Roguelike 超维模组构装**

[![Tech Stack](https://img.shields.io/badge/Tech_Stack-HTML5_/_Canvas_/_Vanilla_JS-0284c7?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com)
[![0-GC Optimization](https://img.shields.io/badge/Performance-0--GC_Optimized-10b981?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays)
[![Dual-Mode Engine](https://img.shields.io/badge/Architecture-Web_Worker_Offscreen-8b5cf6?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
[![CORS-Free](https://img.shields.io/badge/Offline-100%25_CORS--Free-e11d48?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## 🌟 V7 核心引擎突破

《星海猎手 V7》是一个面向网页端极致性能与硬核物理反馈的纯前端太空弹幕射击游戏。

### 1. 🧬 先驱者六角星盘永久天赋系统 (Pioneer Permanent Talent Star-Disk)
*   **物理与存储机制**：在局外整备机库中，玩家可通过打碎陨石收集的 **合金废料 (Scrap)** 激活永久六角星盘。被动属性通过 `localStorage` 自动实现持久化保存。重置星盘将返还 100% 合金废料。
*   **五大核心被动天赋**：
    *   **Node A: 量子超频催化 (Quantum Overclock)**：提高战术量子折跃（Shift/双击）充能效率 $10\% \sim 30\%$，极大增强瞬间脱困的容错率。
    *   **Node B: 火控晶核增幅 (Core Amplification)**：使普通陨石子弹伤害提升 $4\% \sim 12\%$，对 Boss 的伤害加成仅提高 $1\% \sim 3\%$ 以保持战斗挑战性。
    *   **Node C: 反物质纳米力场 (Antimatter Field)**：加固一层反物质能核盾，物理减免陨石碰撞动能造成的碾压伤害 $8\% \sim 24\%$。
    *   **Node D: 磁力量子虹吸 (Magnet Siphon)**：使合金废料与经验晶体虹吸回收吸引半径显著扩大 $35\text{px} \sim 105\text{px}$。
    *   **Node E: 僚机副武器齐射 (Wingman Volley)**：在开火时有 $12\% \sim 20\%$ 的概率触发侧翼副武器齐射，赋予战机常态化大范围压制火力。

### 2. 🌀 Roguelike 3选1 超维改装构装 (In-Game Roguelike 3-Choice Upgrade)
*   **洗牌与防锁死兜底**：当局内获取足够经验升级时，游戏主逻辑暂停，并利用 **0-GC Fisher-Yates 洗牌算法** 在以下 $6$ 大超维模组中随机抽取 $3$ 项供玩家选择。当全部模组满级时，触发**反锁死兜底防御机制 (Anti-Softlock Fallback)**，奖励 $+25\%$ 最大生命回复与 $+800$ 分。
*   **六大改装超维模组**：
    *   **多重散射 (Split Shot)**：发射多向散射流星弹，大幅扩展正面火力扇区。
    *   **重力巨弹 (Heavy Mag)**：炮弹体积倍增，附带毁灭性的动能击退与贯穿溅射。
    *   **巡航能盾无人机 (Vanguard Drone)**：召唤一架自动环绕的高能粒子无人机，物理阻挡近身陨石。
    *   **特斯拉电弧 (Tesla Arc)**：在飞船周边高频激发连锁高压雷击，锁死近距小型流星。
    *   **折跃引力星轨 (Warp Singularity)**：量子折跃后在起点和终点生成时空黑洞，持续吸收并绞杀碎星。
    *   **反物质过载 (Antimatter Overload)**：飞船引擎超载，以牺牲少许能盾为代价，爆发性提升 $40\%$ 开火射速！

### 3. ☄️ 无尽深空非线性缩放与相位能盾 (Endless Non-linear Scaling & Phase Shields)
*   **非线性强度缩放**：随着波次 (Wave) 推进，陨石的血量和飞行速度执行非线性幂次缩放关系：
    $$HP \propto \text{Wave}^{1.15}$$
    $$vy \propto \text{Wave}^{0.85}$$
*   **相位能盾陨石 (Phase Shielded Meteors)**：流星在刷新时有 $15\%$ 的概率自带三段相位防护能盾。能盾处于激活状态时，将直接物理阻断前 $3$ 次子弹攻击（单次射击只消耗 1 层护盾判定，无法被秒杀），玩家必须利用多段打击快速融盾。

### 4. ☀️ 太阳磁暴异常天象状态机 (Solar Magnetism Storm State Machine)
*   **磁海重塑与辐射**：局内搭载恒星级气象系统，每隔 $45\text{s}$ 会爆发一次持续 $12\text{s}$ 的太阳磁暴灾难状态。
*   **双刃剑效应**：
    *   **电磁暴吸附**：废料磁吸范围瞬间膨胀至原本的 $3$ 倍，帮助战机在乱军之中回收大量合金。
    *   **强核辐射 (Radiation!)**：太阳风暴肆虐下，屏幕最外围 $80\text{px}$ 边缘带沦为致命的高辐射区。若战机驶入，将产生红色频闪警告，并以每 $200\text{ms}$ 扣除 $1$ 点生命值的高频伤害进行物理惩罚，强迫玩家在版心区域进行精细微操。

### 5. 🖥️ 高清 DPI 触控精准像素同步 (High-DPI Pointer Mapping)
*   **像素级绝对对齐**：为了解决 Retina / 4K / 移动端高分屏视口在非标逻辑像素缩放下的指尖坐标漂移，引擎底层完全重构了物理指针转换公式。通过将鼠标/触控物理事件流经过 `getBoundingClientRect()` 平滑阻尼解算，将其映射至标准的 `logicalX` 与 `logicalY` 逻辑坐标，确保了无论高分显示器还是指尖拖拽，飞船均能实现 100% 像素级贴合同步。

---

## 🏆 首领图鉴 (Boss Bestiary)

### ⚠️ 星际掠夺者号 (Phase Reaver) — 双形态母舰
*   **母舰阶段 (Mothership)**：4 个可分部位破坏（盾发生器 / 左排炮翼 / 右排炮翼 / 核心本体），第 $4$ 阶起加挂双联尾炮。在无尽模式下，母舰部位同样会随机覆盖 **相位能盾**，要求玩家优先集火融盾破防。
*   **核心坍缩奇点 (Implosion)**：核心 HP 归零后进入 $3\text{s}$ 高能坍缩态，全屏陨石被引力扯入并屠戮，玩家必须物理闪避奇点核心高爆爆破。
*   **星云巨神兵 (Nebula Titan)**：坍缩完成后**升级形态**！碎石环旋舞（12 颗轨道流星，半径 $135\text{px}$）+ 三技能轮转：陨岩狂飙 / 重力涟漪 / **OVERLOAD DEATH LASER** 双向横扫极光死光。

### 💀 吞噬蠕虫 (Asteroid Devourer) — 关节链刚体
*   **形态构造**：$10\sim14$ 节刚体骨节通过 LERP 阻尼跟随主头部。头部速度 $4 + 0.25 \times (n-1)$，所有节点都吞噬玩家但**只有头部能咬流星回血**。
*   **吞噬回血玩法**：头部碰到流星即吞噬，按 `devourMultiplier (2 + 0.15 × (n-1))` 倍率把流星 HP 转化为自身 HP（封顶 maxHp）。
*   **断裂裂变 (Segment Fission)**：当某节段被击杀，紧邻的后继节点突变成新的独立追猎头部（同屏最多允许 3 个虫头并存进行自我繁殖）。

---

## ⚡ 极客性能底座 (Geek Performance Architecture)

*   **⚡ 0-GC 极客算力**：采用平坦化连续内存布局，粒子缓冲复用一块 `Float32Array(4000)` 静态空间，避免运行时垃圾回收卡顿。碰撞检测全部基于距离平方（`dx^2 + dy^2 < R^2`）舍弃 `Math.sqrt()` 开方运算，保障全屏弹幕雷击下 100% 满帧 60FPS/120FPS。
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
├── space_shooter.html      # V7 极客风格战术 HUD 主游戏入口
├── v7_hangar.html          # 先驱者核心矩阵天赋星盘机库 (局外改装、永久天赋星盘、物理沙盒)
├── v7_roadmap.html         # V7 无尽深空指南与星盘天赋设计路线图
├── game_design.html        # 极客底盘白皮书 (物理公式与数学推导，集成 LaTeX)
├── game_manual.html        # 终极战略手册 (操作指南与蠕虫对决秘诀)
├── version_history.html    # V1.0 - V7.0 超时空编年史历史记录
├── style.css               # 磨砂拟物玻璃面板与霓虹光晕专用样式
└── start.bat               # Windows 原生免配置自适应服务器启动器
```

---

## 📜 版本编年史 (Version Chronicle)

| 版本 | 标题 | 引入的关键玩法 / Boss | 底层突破 |
| :---: | :--- | :--- | :--- |
| **V1** | 重金属空战起航纪元 | 拖动惯性 + 流星粉碎 + 整备车间废料经济 | Native Canvas 2D + 粒子预分配池 |
| **V2** | 时空坍缩与分裂巨陨 | **引力黑洞**（吞噬陨石/子弹/玩家，并超新星爆裂） + **分裂型陨石**（分裂衍生子实体） | 矢量霓虹特效 + 弹药复用数组 |
| **V3** | 晶核聚变与十重主炮 | **EM/Frost/Fire/Rad 四晶核 + 左右双卡槽**，10 套共鸣大招（雷霆链式炮 / 坍缩黑洞星云爆…） | 原型链元素武器注入器 |
| **V4** | 无尽裂变与星云巨神兵 | **智能伴飞僚机**（最多 2 架共享晶核技能）+ 首领 **Nebula Titan 巨神兵**（部位破坏）+ **白洞引力弹弓** | 僚机弹药对象池 + Boss 部件状态机 |
| **V5** | 引擎极致解耦与超频跑分 | 8 秒**极客超频 Benchmark**压力测试 + 0-GC HUD overlay 监测 + 实时帧/物理/绘制延迟 | engine.js 拆 6 模块；摆脱 `file://` CORS 痛点 |
| **V6** | 星能跃迁与超维涂装 | **量子折跃 (Shift / 双击)** + **三款超维涂装** + **吞噬蠕虫 Boss** + worm 流星食物保障 | Path2D 粒子合并重绘；SoundFX 限流节流 |
| **V7** | 先驱者星盘与超维构装 *(当前版本)* | **先驱者六角星盘永久天赋 (Node A~E)** + **Roguelike 3选1超维模组** + **太阳磁暴异常天象** + **无尽模式非线性缩放** + **相位能盾** | 0-GC Fisher-Yates 快速洗牌算法；Retina 高分屏触控同步映射；防软锁局外持久化 |

---

## 📜 极客白皮书与手册文档

*   [**`game_design.html` (极客底盘白皮书)**](file:///c:/Users/huayu/Desktop/github/spaceshooter/game_design.html)：深入研究了多关节利维坦吞噬蠕虫的阻尼追随受力方程式、0-GC TypedArray 连续存储索引偏移公式、量子折跃起点终点的量子密度方程等。*采用优雅的 KaTeX 离线渲染。*
*   [**`game_manual.html` (终极战略手册)**](file:///c:/Users/huayu/Desktop/github/spaceshooter/game_manual.html)：包含了 V7 版本时空折跃的战术切入与流星物理震荡弹射技巧、Roguelike 3选1 构装模组最佳配装路线、以及在无尽模式下如何规避太阳磁暴致命边缘辐射的高级应对路线图。
