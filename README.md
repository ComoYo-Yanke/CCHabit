# 🧭 TapHabit 风格 · 习惯打卡小程序

**简体中文** | [English](#english-version)

<img src="./static/icon.png" width="250" alt="TapHabit" />

> ⚡ 纯本地 · 无服务端 · 无账号 · 不联网
> 对标 TapHabit 的习惯追踪小程序，所有数据保存在微信小程序 storage 里。

---

## 📑 目录

[✨ 特性](#-特性) · [🚀 快速开始](#-快速开始) · [🧪 自测](#-自测) · [📁 结构](#-结构) · [🗃️ 数据模型](#️-数据模型) · [🧠 设计决策](#-设计决策) · [🛡️ 边界](#️-边界) · [📊 图表库](#-图表库) · [📜 许可](#-许可)

---

## ✨ 特性

- **纯本地**：无服务端、无账号、不联网
- **原生技术栈**：WXML + WXSS + JS，未用 uniapp
- **可视化**：Canvas 2D 折线 / 柱状图 + 纯 WXML 热力图，可横向滑动回看全部历史
- **快捷打卡**：首页卡片点一下直接记一笔，要填数值 / 备注再进弹层
- **深色主题**：全局 CSS 变量，自定义导航栏 / 底部导航，页面切换淡入
- **零图片资源**：图标全为内联 base64 SVG

---

## 🚀 快速开始

1. 用**微信开发者工具**打开项目根目录（`project.config.json` 所在目录）
2. AppID 选「测试号」或填自己的（当前为 `touristappid`）
3. 编译运行，首页可点「载入示例数据」体验

---

## 🧪 自测

```bash
node scripts/test-utils.js         # 日期 / 统计纯函数单测
node scripts/test-integration.js   # 模拟 wx.storage 全链路集成测试
node scripts/test-charts.js        # 真跑折线 / 柱状图（73 项，坐标量纲 / X 轴压字 / 色值守卫）
node scripts/test-checkin-lock.js  # 验证「只能打卡当天」（33 项）
node scripts/check-sheet.js        # 无头浏览器量弹层：5 机型 × 正常/压力内容；按钮位置 + 占屏比 ≤ 70%
node scripts/lint-structure.js     # 组件引用 / 事件绑定 / 资源路径 / CSS 变量 / 弹层结构
node scripts/lint-bindings.js      # WXML 绑定变量与 JS 对应关系
```

---

## 📁 结构

```
├── app.js / app.json / app.wxss     入口、全局配置、深色主题变量
├── custom-tab-bar/                  自定义底部导航（必须在根目录）
├── lib/ucharts/u-charts.js          uCharts v2.5.0（Canvas 2D）
├── styles/icons.wxss                内联 base64 SVG 图标
├── utils/                           date.js · storage.js · stats.js
├── components/                      nav-bar · heatmap · habit-card · habit-editor
│                                    checkin-sheet · qiun-charts · empty-state
├── pages/                           index · habit-detail · stats · settings · about
└── scripts/                         自测与静态检查（不参与打包）
```

---

## 🗃️ 数据模型

存储 key 统一 `th:` 前缀。

- **`th:meta`** — `{ version: 1, createdAt, seeded }`
- **`th:habits`** — 习惯列表（`id / name / unit / icon / color / target / step / enabled / sort`）
- **`th:records`** — 按习惯分桶的打卡记录，短名压缩：`d` 日期 / `v` 数值 / `n` 备注 / `t` 时间戳；同一天允许多条
- **`th:settings`** — `{ haptic, confirmDelete }`

单条约 70 字节，上限 1MB/key、10MB 总量，约可存 10 万条以上。写入均包 try/catch，配额异常抛 `{ code: 'QUOTA_EXCEEDED' }`，设置页提供用量进度条（≥70% 黄、≥90% 红）与导出 / 导入 / 清空。

---

## 🧠 设计决策

1. **日期一律 `YYYY-MM-DD` 字符串** — `new Date('2026-09-11')` 按 UTC 解析会退回前一天，故手工拆分构造本地 Date；一周从周一开始。
2. **数据出入口唯一** — 全部经 `utils/storage.js`，内部维护内存缓存，读失败回落默认值，避免白屏。
3. **连续打卡宽限** — 今天未打卡时给一天宽限，昨天有记录则不清零。
4. **统计只汇总次数** — 单位不同，跨习惯加总数值无意义。
5. **图表 Canvas，热力图 WXML** — `qiun-charts` 封装分辨率（传设备 px）、暗色主题默认配置（工厂函数避免串台）、触摸坐标归一化；`extra.line/area/column/bar` 必须给齐，且无数据不建实例。
6. **弹层主体用 `scroll-view` + flex 让位** — `flex: 1` + `min-height: 0`，不许手算高度；确认按钮移到头部 `flex-shrink: 0` 区域，故障失去物理条件。**踩过的坑**：「确认按钮不见」曾被归因到 `scroll-view`（说不参与 flex 收缩），换成 `view` + `overflow-y: auto` 后按钮是回来了，但真机上弹层滑不动、反而滚背景页 —— 普通 `view` 的 overflow 滚动挂在 WebView 的 touchmove 上，正被遮罩的 `catchtouchmove` 吃掉。真正的病因是漏了 `min-height: 0`（flex 项目默认 `min-height: auto`，压不下去），与是不是 `scroll-view` 无关。`scroll-view` 走原生滚动，手势不会冒泡到遮罩，才是正解。
6.1 **弹层最多占 68% 屏高** — 再高就成了全屏页，背景完全看不见，也失去了「这是盖在上面的一层」的感觉。`max-height: 68vh` 还顺带保证了主体一定会溢出：内容几乎正好装得下时滚动行程只有几十 rpx，看着就像「不能滚」，这是「创建习惯的弹层划不动」的主因。`.sheet-body` 另有一条 `max-height: 60vh` 兜底 —— `scroll-view` 要滚就得有个确定高度，`flex: 1` 算出来的高度通常认，但不值得赌：万一没认，它就是 content 高、永远不滚。
7. **uCharts 的 `width` / `height` 是设备 px** — 传逻辑宽会让图形只占左上角 1/dpr。
8. **X 轴标签抽稀挡不住最后一个** — 用 `xCategoryFormatter` 截断超长习惯名；不要配 `xAxis.itemCount`。
9. **悬浮按钮加号用 `.ic-plus-white`** — 蓝加号画在蓝底上等于没有。
10. **自定义 tabBar 必须在根目录** — 样式色值写死。
11. **图标零资源** — 全内联 base64 SVG。
12. **只能打卡当天** — 弹层无日期切换；`blockedByReadonly()` 不看 `data.readonly`，重新和时钟比对；组件不信任传入日期，未来 / 非法一律夹回今天。
13. **canvas 是原生组件** — 弹层盖不住，只能 `hidden` 时 `display: none` 让它不渲染；重新显示要重建而非重绘。
14. **弹层打开要锁页面滚动** — `catchtouchmove` 管触摸，`page-meta` 管滚轮。
15. **`.mask` 必须 `position: fixed`** — 祖上不能有 `transform` / `filter` / `perspective` / `will-change`。
16. **遮罩收起必须 `display: none`** — 光写 `opacity: 0` / `visibility: hidden` 不够：`input` / `textarea` / `switch` 是原生组件，由客户端控件画在 WebView 之上，只认「在不在渲染树里」，不认绘制层属性。首页偶尔冒出的「背单词」正是 habit-editor 名称框的 placeholder。组件因此用 `mounted` / `active` 两级状态：收起先摘 `--on` 播动画，260ms 后摘 `--mounted` 整棵卸载。
17. **`display` 从 `none` 变 `flex` 时过渡不会触发** — 需要 `mounted` → `wx.nextTick` → `active` 两阶段，让元素先以收起姿态完成一次真实布局，再加动效类。
18. **`switchTab` 的页面保持挂载** — 固定 `animation-name` 只会播一次，所以页面淡入用 `pageFadeInA` / `pageFadeInB` 两个同名动画轮换触发；只动 `opacity`，不碰 `transform`（见第 15 条）。
19. **首页卡片「打卡」是快捷打卡** — 直接记一笔（`v = 1`，不套用 `habit.step`），不弹窗。首页是「一屏扫过去顺手点一下」的场景，为记一次默认量而弹面板成本比动作本身高；要填数值 / 备注走详情页或概览区「去打卡」的弹层。
20. **移除每日目标与进度条** — 打卡就是记个数，`target` 字段保留在数据模型里（编辑提交时省略，靠 `saveHabit` 的合并保住旧值），继续用于热力图色阶。
21. **热力图覆盖全部历史** — 周数按最早一条记录算（下限 26、上限 260 周），`scroll` 模式下按固定列宽铺开、初始 `scroll-left` 靠右停在今天，向左拖回看。`scroll-view` 的 `scroll-left` 单位是 px 而非 rpx。
22. **统计页区间翻页的边界判据只看「下一段还没发生」** — 也就是 `下一段的 start > 今天`。这里的方向写反过一次：「左」按钮点了没反应，反而能一直往「右」翻到未来去。原来那句等价于「区间起点在过去」，而上一周 / 上一月 / 上一年的起点**必然**在过去，于是往回翻被全线挡死、往未来翻没人拦。`canNext`（右箭头的灰态）和点击处理必须用同一个判据，否则会出现「箭头亮着但点了没反应」。

---

## 🛡️ 边界

| 场景 | 处理 |
| --- | --- |
| 删除习惯 | 级联删除记录并提示条数 |
| 存储写满 | 捕获配额异常，引导到「存储管理」备份清理 |
| 未来日期 | 日历 / 热力图拦截；弹层夹回今天并禁止写入 |
| 修改过去打卡 | 只读回看，写入入口不渲染且方法内拦截 |
| 区间翻页 | 周 / 月 / 年不允许翻到未来 |
| 习惯已删进详情 | 弹窗提示并自动返回 |
| 导入非法 JSON | 校验结构，报错且原数据不变 |
| 导入孤儿记录 | 丢弃习惯已不存在的记录 |
| 月末溢出 | 1月31日 +1月 = 2月28/29日 |
| 名称 / 数值校验 | 名称必填 ≤12 字；数值 > 0；非法回落默认值 |

---

## 📊 图表库

`lib/ucharts/u-charts.js` 为 [uCharts](https://www.ucharts.cn) v2.5.0（Apache-2.0），保留原始版权注释；升级直接替换该文件。

---

## 📜 许可

**CoMoYo-Yanke Strict Open Source License v1.0**，详见根目录 `LICENSE`。
Copyright (c) 2026 **CoMoYo-Yanke**. All rights reserved.

---

<a id="english-version"></a>

# 🧭 TapHabit-style · Habit Tracker Mini Program

[简体中文](#-taphabit-风格--习惯打卡小程序) | **English**

<img src="./static/icon.png" width="250" alt="TapHabit" />

> ⚡ Fully local · No server · No account · No network
> A TapHabit-style habit tracker. All data lives in WeChat Mini Program storage.

---

## 📑 Contents

[✨ Features](#-features) · [🚀 Quick Start](#-quick-start) · [🧪 Tests](#-tests) · [📁 Structure](#-structure) · [🗃️ Data Model](#️-data-model) · [🧠 Design Decisions](#-design-decisions) · [🛡️ Edge Cases](#️-edge-cases) · [📊 Chart Library](#-chart-library) · [📜 License](#-license)

---

## ✨ Features

- **Fully local**: no server, no account, no network
- **Native stack**: WXML + WXSS + JS, no uniapp
- **Visuals**: Canvas 2D line / column charts + pure WXML heatmap, scrollable back through the full history
- **Quick check-in**: tap a home-screen card to record once; open the sheet when you need values or notes
- **Dark theme**: global CSS variables, custom nav bar / tab bar, fading page transitions
- **Zero image assets**: all icons are inline base64 SVG

---

## 🚀 Quick Start

1. Open the project root (where `project.config.json` lives) with **WeChat DevTools**
2. Choose "Test Account" or fill in your own AppID (currently `touristappid`)
3. Compile and run; tap "Load Sample Data" on the home page

---

## 🧪 Tests

```bash
node scripts/test-utils.js         # Unit tests for date / stats pure functions
node scripts/test-integration.js   # Full integration tests with mocked wx.storage
node scripts/test-charts.js        # Real line/column runs (73 cases: axis units, label overlap, colors)
node scripts/test-checkin-lock.js  # Verifies "only today can be checked in" (33 cases)
node scripts/check-sheet.js        # Headless browser: 5 sizes x normal/stress; button position + screen coverage <= 70%
node scripts/lint-structure.js     # Component refs / bindings / asset paths / CSS vars / sheet structure
node scripts/lint-bindings.js      # Cross-checks WXML bindings against JS
```

---

## 📁 Structure

```
├── app.js / app.json / app.wxss     Entry, global config, dark theme tokens
├── custom-tab-bar/                  Custom tab bar (must be at project root)
├── lib/ucharts/u-charts.js          uCharts v2.5.0 (Canvas 2D)
├── styles/icons.wxss                Inline base64 SVG icons
├── utils/                           date.js · storage.js · stats.js
├── components/                      nav-bar · heatmap · habit-card · habit-editor
│                                    checkin-sheet · qiun-charts · empty-state
├── pages/                           index · habit-detail · stats · settings · about
└── scripts/                         Self-tests & static checks (not bundled)
```

---

## 🗃️ Data Model

All keys use the `th:` prefix.

- **`th:meta`** — `{ version: 1, createdAt, seeded }`
- **`th:habits`** — habit list (`id / name / unit / icon / color / target / step / enabled / sort`)
- **`th:records`** — check-ins bucketed by habit, short keys: `d` date / `v` value / `n` note / `t` timestamp; multiple per day allowed
- **`th:settings`** — `{ haptic, confirmDelete }`

~70 bytes per record; 1MB/key and 10MB total → 100,000+ records. Writes are wrapped in try/catch; quota errors throw `{ code: 'QUOTA_EXCEEDED' }`. Settings page shows a usage bar (≥70% yellow, ≥90% red) plus export / import / clear.

---

## 🧠 Design Decisions

1. **Dates are always `YYYY-MM-DD` strings** — `new Date('2026-09-11')` parses as UTC and falls back a day; parse manually into a local Date. Weeks start Monday.
2. **Single data gateway** — everything goes through `utils/storage.js` with an in-memory cache; read failures fall back to defaults, no white screens.
3. **Streak grace** — one-day grace if today has no check-in yet; not reset if yesterday has records.
4. **Stats aggregate counts only** — units differ, summing values across habits is meaningless.
5. **Canvas for charts, WXML for heatmap** — `qiun-charts` wraps resolution (device px), dark-theme defaults (factory to avoid shared nested arrays), touch normalization; all `extra.line/area/column/bar` required, and no instance without data.
6. **Sheet body is `scroll-view` + flex yield** — `flex: 1` plus `min-height: 0`; never hand-computed heights. The confirm button lives in the `flex-shrink: 0` header, so the bug loses its physical conditions. **The detour**: "confirm button missing" was blamed on `scroll-view` (said not to participate in flex shrinking), and switching to `view` + `overflow-y: auto` brought the button back — but on a real device the sheet would not scroll while the page behind it did. A plain `view`'s overflow scrolling rides on the WebView touchmove, which the mask's `catchtouchmove` swallows. The actual cause was the missing `min-height: 0` (flex items default to `min-height: auto`, so they can't shrink), unrelated to `scroll-view`. `scroll-view` scrolls natively, so the gesture never bubbles to the mask.
6.1 **A sheet covers at most 68% of the viewport height** — any taller and it becomes a full-screen page, hiding the background entirely and losing the "this is a layer on top" feel. `max-height: 68vh` also guarantees the body overflows: when the content *almost* fits, the scroll travel is a few dozen rpx, which reads as "it won't scroll" — the main cause of "the create-habit sheet won't scroll". `.sheet-body` carries an extra `max-height: 60vh` fallback: a `scroll-view` needs a definite height to scroll at all, and while the height flex resolves is usually honoured, it isn't worth the bet — if it isn't, the element is content-height and never scrolls.
7. **uCharts `width` / `height` are device px** — logical width shrinks graphics to the top-left 1/dpr.
8. **X-axis thinning can't stop the last label** — `xCategoryFormatter` truncates long habit names; don't set `xAxis.itemCount`.
9. **Floating button plus uses `.ic-plus-white`** — a blue plus on blue is no plus.
10. **Custom tabBar must be at root** — colors hardcoded.
11. **Zero icon assets** — all inline base64 SVG.
12. **Check-in only for today** — no date switcher; `blockedByReadonly()` ignores `data.readonly` and re-compares against the clock; caller dates clamped to today.
13. **canvas is a native component** — sheets can't cover it; toggle `display: none` via `hidden`, and recreate (not redraw) on show.
14. **Lock page scroll when a sheet opens** — `catchtouchmove` for touch, `page-meta` for wheel.
15. **`.mask` must be `position: fixed`** — no `transform` / `filter` / `perspective` / `will-change` on ancestors.
16. **A collapsed mask must be `display: none`** — `opacity: 0` / `visibility: hidden` is not enough: `input` / `textarea` / `switch` are native components drawn by the client above the WebView, and they only respect *presence in the render tree*, not paint-level properties. The stray "背单词" on the home screen was the habit-editor name field's placeholder. Components therefore use two-stage `mounted` / `active`: drop `--on` to play the exit animation, then drop `--mounted` 260ms later to unmount the subtree.
17. **A transition does not fire when `display` goes `none` → `flex`** — it needs `mounted` → `wx.nextTick` → `active` so the element first completes a real layout in its collapsed pose before the animation class lands.
18. **`switchTab` keeps pages mounted** — a fixed `animation-name` plays once, so the page fade alternates between two identical keyframes, `pageFadeInA` / `pageFadeInB`; animate `opacity` only, never `transform` (see #15).
19. **The home-screen "check in" button is a quick check-in** — it records once (`v = 1`, ignoring `habit.step`) with no sheet. The home screen is a "scan and tap" surface, where a sheet costs more than the action it wraps; use the detail page or the overview's "去打卡" for values and notes.
20. **Daily target and progress bars removed** — a check-in just records a count. `target` stays in the data model (omitted on edit submit so `saveHabit`'s merge preserves it) and still drives heatmap intensity.
21. **The heatmap covers the full history** — week count derives from the earliest record (floor 26, ceiling 260); in `scroll` mode columns have a fixed width and the initial `scroll-left` pins to today, then drag left to look back. `scroll-view`'s `scroll-left` is in px, not rpx.
22. **Stats range paging is bounded by "the next range hasn't happened yet"** — that is, `next.start > today`. The direction was inverted once: the "previous" button did nothing, while "next" happily walked into the future. The old test was equivalent to "the range starts in the past", and the previous week / month / year *always* starts in the past — so paging backwards was blocked outright and paging forwards was unguarded. `canNext` (the greyed-out next arrow) must use the same predicate as the tap handler, or you get an arrow that looks live but does nothing.

---

## 🛡️ Edge Cases

| Scenario | Handling |
| --- | --- |
| Delete habit | Cascade-delete records and report the count |
| Storage full | Catch quota errors, guide to "Storage" to back up and clean |
| Future date | Calendar / heatmap block; sheet clamps to today and forbids writes |
| Edit past check-in | Read-only; write entries not rendered and blocked in methods |
| Period paging | Week / month / year can't page into the future |
| Detail after habit deleted | Toast and auto-return |
| Import invalid JSON | Validate, error out, keep existing data |
| Import orphan records | Discard records whose habit no longer exists |
| Month-end overflow | Jan 31 + 1 month = Feb 28/29 |
| Name / value validation | Name required ≤12 chars; value > 0; invalid falls back to defaults |

---

## 📊 Chart Library

`lib/ucharts/u-charts.js` is [uCharts](https://www.ucharts.cn) v2.5.0 (Apache-2.0), original copyright preserved. To upgrade, replace the file.

---

## 📜 License

**CoMoYo-Yanke Strict Open Source License v1.0** — see `LICENSE` at the project root.
Copyright (c) 2026 **CoMoYo-Yanke**. All rights reserved.

---

<div align="center">

**Made with ❤️ by CoMoYo-Yanke · 2026**

</div>