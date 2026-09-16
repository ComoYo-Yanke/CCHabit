# 🧭 TapHabit 风格 · 习惯打卡小程序

**简体中文** | [English](#english-version)

<img src="./static/icon.png" width="250" alt="TapHabit" />

> ⚡ 纯本地 · 无服务端 · 无账号 · 不联网
> 对标 TapHabit 的习惯追踪小程序，所有数据保存在微信小程序 storage 里。

---

## 📑 目录

[✨ 特性](#-特性) · [🚀 快速开始](#-快速开始) · [🧪 自测](#-自测) · [📁 结构](#-结构) · [🗃️ 数据模型](#️-数据模型) · [🛡️ 边界](#️-边界) · [📊 图表库](#-图表库) · [📜 许可](#-许可)

---

## ✨ 特性

- **纯本地**：无服务端、无账号、不联网
- **原生技术栈**：WXML + WXSS + JS，未用 uniapp
- **可视化**：Canvas 2D 折线 / 柱状图 + 纯 WXML 热力图，可横向滑动回看全部历史
- **快捷打卡**：首页卡片点一下直接记一笔，要填数值 / 备注再进弹层
- **深浅色主题**：浅色 / 深色 / 跟随系统，一套 CSS 变量换肤，图表一并跟随
- **自定义主题**：另开一页调五个颜色 + 卡片透明度与毛玻璃 + 背景图（取景 / 缩放 / 模糊 / 淡化），整页实时预览，颜色从底色现推
- **背景图框选**：整张图摊开，拖着一个屏幕比例的取景小窗选显示范围，窗外压暗表示不显示；另配滑块调远近
- **毛玻璃卡片**：卡片带 `backdrop-filter`，模糊半径可调；自定义主题下调低卡片透明度时，背景图会糊开再透上来
- **悬浮胶囊导航**：底栏浮在内容之上、带毛玻璃，只有图标；点击切换，页面之间淡出淡入
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
node scripts/lint-structure.js     # 组件引用 / 事件绑定 / 资源路径 / CSS 变量 / 主题一致性 / theme.json 配套 / 弹层结构
node scripts/lint-bindings.js      # WXML 绑定变量与 JS 对应关系
```

---

## 📁 结构

```
├── app.js / app.json / app.wxss     入口、全局配置、深色默认变量
├── theme.json                       窗口底色的深浅两套值（供 app.json 以 @ 引用）
├── custom-tab-bar/                  自定义底部导航（必须在根目录）
├── lib/ucharts/u-charts.js          uCharts v2.5.0（Canvas 2D）
├── styles/icons.wxss                内联 base64 SVG 图标
├── utils/                           date.js · storage.js · stats.js · theme.js · page-fade.js
├── components/                      nav-bar · heatmap · habit-card · habit-editor
│                                    checkin-sheet · qiun-charts · empty-state · app-bg
├── pages/                           index · habit-detail · stats · settings · about
│                                    theme-editor（自定义主题，整页即预览）
└── scripts/                         自测与静态检查（不参与打包）
```

---

## 🗃️ 数据模型

存储 key 统一 `th:` 前缀。

- **`th:meta`** — `{ version: 1, createdAt, seeded }`
- **`th:habits`** — 习惯列表（`id / name / unit / icon / color / target / step / enabled / sort`）
- **`th:records`** — 按习惯分桶的打卡记录，短名压缩：`d` 日期 / `v` 数值 / `n` 备注 / `t` 时间戳；同一天允许多条
- **`th:settings`** — `{ haptic, theme, customTheme }`，`theme` 取 `light` / `dark` / `system` / `custom`；`customTheme` 只在 `custom` 时起作用，且**只存用户改的那几项**（五个颜色 / 卡片透明度与毛玻璃 / 背景图路径与模糊淡化），整套色值由 `utils/theme.js` 现算

单条约 70 字节，上限 1MB/key、10MB 总量，约可存 10 万条以上。写入均包 try/catch，配额异常抛 `{ code: 'QUOTA_EXCEEDED' }`，设置页提供用量进度条（≥70% 黄、≥90% 红）与导出 / 导入 / 清空。

---

## 🛡️ 边界

| 场景 | 处理 |
| --- | --- |
| 删除习惯 | 级联删除记录并提示条数 |
| 存储写满 | 捕获配额异常，引导到「存储管理」备份清理 |
| 未来日期 | 日历标灰且不可点；热力图拦截；弹层夹回今天并禁止写入 |
| 日历 | 只读一览，不绑点击；可往前翻月份，不可翻到未来 |
| 修改过去打卡 | 只读回看，写入入口不渲染且方法内拦截 |
| 补打卡 | 功能已移除，不再提供入口与文案 |
| 区间翻页 | 周 / 月 / 年不允许翻到未来，`canNext` 与点击处理共用同一判据 |
| 切主题 | `app.wxss` 的深色值是兜底，即使 `page-style` 未生效也只是「没换肤」，不会白屏或透明 |
| 自定义主题配色 | 语义色不推算（取现成那两套）；层级方向跟底色亮度反，不跟主题名 |
| 下调卡片透明度 | 只影响卡片，弹层另有实心的 `--popup-*`，不跟着透 |
| 卡片毛玻璃 | 半径可调（0–40px，默认 16），只在卡片真的半透明时看得见；弹层不加 |
| 底栏图标颜色 | 唯一跟着主题走的图标：它拿不到 CSS 变量，而选中胶囊的填充就是主色 |
| 图表不跟主题变色 | 颜色走 JS 不走 CSS，两个带图表的页面各自在 `onShow` 里用 `chartVars()` 重算 |
| 点图表没有提示框 | uCharts 的 `hexToRgb()` 只认 hex，喂 `rgba()` 会在触摸回调里抛异常；`chartVars()` 先把带 alpha 的值展平成实心 hex |
| 背景图占空间 | 存本地文件而非 storage；换图 / 移除 / 恢复默认 / 清空数据 / 导入覆盖都会删掉旧文件 |
| 横屏背景图 | 编辑页把整张图摊开当舞台，拖屏幕比例的小窗选范围，窗内即真机所见 |
| 拖不动取景小窗 | 某一轴上窗子已占满舞台（行程为 0）时本来就没得挪；舞台宽度未量到时也不动，量到后自愈 |
| 瘦高的背景图 | 舞台按原图比例变得很高（1:3 的图 = 卡片宽的 3 倍），有意为之 |
| 背景图问不到尺寸 | 取景台整块不渲染（只留滑块），真实图层退回 `aspectFill` 铺满居中 |
| 背景图看不见 | 依赖 `.page` 自成层叠上下文；卡片要够透才有图透上来 |
| 切走自定义主题后背景图还在 | 背景图只在 `theme === 'custom'` 时该出现，组件因此额外盯主题名变化 |
| 导入含背景图的备份 | 只搬颜色不搬图：路径是导出那台手机的，本机打开是坏的 |
| 跟随系统 | 系统一切换即实时重画；`app.json` 的 `darkmode` 若被去掉会静默退化成「永远深色」 |
| 点的是当前这一页 | 撤销待执行的切换、把淡出到一半的页面拉回来，不切页 |
| 切 tab 的高亮 | 只在「这一页已经显示出来」时被画，第一帧就不可能画错 |
| 切 tab 的整页闪烁 | 淡出 → `switchTab` → 淡入；`.page--out` 默认就在，框架提前亮出的那一帧是透明的 |
| 点了 tab 没反应 | 每次点击都现读当前路由，并且必然走到 `switchTab`；脱节最多吃掉一次点击 |
| 连着猛点几个 tab | 定时器被后一次覆盖，「后一次说了算」，不存在卡死 |
| 更新日志 | 页面只铺最近 1 条，更早的不展开，点「更早的版本记录」复制仓库地址 |
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

[✨ Features](#-features) · [🚀 Quick Start](#-quick-start) · [🧪 Tests](#-tests) · [📁 Structure](#-structure) · [🗃️ Data Model](#️-data-model) · [🛡️ Edge Cases](#️-edge-cases) · [📊 Chart Library](#-chart-library) · [📜 License](#-license)

---

## ✨ Features

- **Fully local**: no server, no account, no network
- **Native stack**: WXML + WXSS + JS, no uniapp
- **Visuals**: Canvas 2D line / column charts + pure WXML heatmap, scrollable back through the full history
- **Quick check-in**: tap a home-screen card to record once; open the sheet when you need values or notes
- **Light / dark theme**: light, dark, or follow system; one set of CSS variables reskins everything, charts included
- **Custom theme**: a dedicated page for five colors plus card alpha and blur, and a background image (framing / zoom / blur / dim); the page is the live preview, and the rest of the palette is derived from the background color
- **Framing by hand**: the whole image is laid out flat and you drag a screen-shaped window over it to pick what shows; the area outside is dimmed. A slider handles distance
- **Frosted-glass cards**: `backdrop-filter` on every card with an adjustable radius, so lowering card alpha under a custom theme blurs the background image before letting it through
- **Floating capsule nav**: the tab bar hovers above the content with a frosted-glass fill and icons only; tap to switch, with a fade out / fade in between pages
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
node scripts/lint-structure.js     # Component refs / bindings / asset paths / CSS vars / theme consistency / theme.json pairing / sheet structure
node scripts/lint-bindings.js      # Cross-checks WXML bindings against JS
```

---

## 📁 Structure

```
├── app.js / app.json / app.wxss     Entry, global config, dark default tokens
├── theme.json                       Light/dark window background, referenced via @ from app.json
├── custom-tab-bar/                  Custom tab bar (must be at project root)
├── lib/ucharts/u-charts.js          uCharts v2.5.0 (Canvas 2D)
├── styles/icons.wxss                Inline base64 SVG icons
├── utils/                           date.js · storage.js · stats.js · theme.js · page-fade.js
├── components/                      nav-bar · heatmap · habit-card · habit-editor
│                                    checkin-sheet · qiun-charts · empty-state · app-bg
├── pages/                           index · habit-detail · stats · settings · about
│                                    theme-editor (custom theme; the page is the preview)
└── scripts/                         Self-tests & static checks (not bundled)
```

---

## 🗃️ Data Model

All keys use the `th:` prefix.

- **`th:meta`** — `{ version: 1, createdAt, seeded }`
- **`th:habits`** — habit list (`id / name / unit / icon / color / target / step / enabled / sort`)
- **`th:records`** — check-ins bucketed by habit, short keys: `d` date / `v` value / `n` note / `t` timestamp; multiple per day allowed
- **`th:settings`** — `{ haptic, theme, customTheme }` where `theme` is `light` / `dark` / `system` / `custom`; `customTheme` only applies when `custom` and stores **only what the user changed** (five colors, card alpha and blur, background image path/blur/dim), with the full token set derived at runtime by `utils/theme.js`

~70 bytes per record; 1MB/key and 10MB total → 100,000+ records. Writes are wrapped in try/catch; quota errors throw `{ code: 'QUOTA_EXCEEDED' }`. Settings page shows a usage bar (≥70% yellow, ≥90% red) plus export / import / clear.

---

## 🛡️ Edge Cases

| Scenario | Handling |
| --- | --- |
| Delete habit | Cascade-delete records and report the count |
| Storage full | Catch quota errors, guide to "Storage" to back up and clean |
| Future date | Calendar dims the cell and ignores taps; heatmap blocks; sheet clamps to today and forbids writes |
| Calendar | Read-only overview, no tap target; pages back through months but never into the future |
| Edit past check-in | Read-only; write entries not rendered and blocked in methods |
| Back-filling | Removed; no entry point or caption left |
| Period paging | Week / month / year can't page into the future; `canNext` and the tap handler share one predicate |
| Theme switch | The dark tokens in `app.wxss` are the fallback, so even if `page-style` didn't apply the result is "no reskin", never a blank or transparent screen |
| Custom theme colors | Semantic colors are not derived (taken from the two existing sets); the ramp direction follows the background's brightness, not the theme's name |
| Lowering card alpha | Cards only — sheets keep their own solid `--popup-*` set and do not fade with them |
| Frosted cards | Radius is adjustable (0–40px, default 16) and visible only where cards are genuinely translucent; sheets are excluded |
| Tab bar icon color | The only icons that follow the theme: they can't read CSS variables, and the active pill is filled with the accent |
| Charts ignoring the custom theme | Chart colors travel through JS, not CSS, so both pages that draw one recompute with `chartVars()` in `onShow` |
| Tapping a chart and getting no tooltip | uCharts' `hexToRgb()` takes hex only; `rgba()` raises inside the touch handler, so `chartVars()` flattens translucent values to solid hex first |
| Background image footprint | Stored as a local file with only a path in storage; changing / removing / resetting it, clearing data and importing all delete the old file |
| A landscape background image | The editor lays the whole image out as a stage and you drag a screen-shaped window over it; what is in the window is what the device shows |
| The framing window won't move | On an axis where the window already fills the stage (zero travel) there is nothing to move; nor does it move before the stage width has been measured — it heals on the next render |
| A tall, narrow background image | The stage grows tall with it (a 1:3 image is three card-widths tall), deliberately |
| Background image with unknown dimensions | The framing stage is not rendered at all (sliders only) and the real layer falls back to `aspectFill`, filled and centred |
| Background image not visible | Depends on `.page` forming a stacking context; the card ramp has to be translucent enough for the image to show through |
| Background image lingers after leaving the custom theme | The image belongs to `theme === 'custom'` only, so the component also watches the theme name |
| Importing a backup that has one | Colors travel, the image doesn't: the path belongs to the exporting phone and is broken here |
| Follow system | Repaints the moment the system switches; dropping `darkmode` from `app.json` degrades silently to "always dark" |
| Tapping the current tab | Fades back in and switches nothing; an in-flight fade-out is cancelled rather than left half done |
| Tab highlight | Only ever painted on a page that is already showing, so it can't be wrong on the first frame |
| Whole-page flash on switch | Fade out → `switchTab` → fade in, and `.page--out` defaults to on, so the frame the framework reveals before the new page's `onShow` is a transparent one |
| A tab tap doing nothing | Every tap re-reads the real route and then necessarily reaches `switchTab`; a desync costs one tap at most |
| Rapid tab taps | The pending timer is replaced, so the last tap wins; nothing can get stuck |
| Changelog | The page renders the latest 1 entry only; older ones are not expanded — tapping "更早的版本记录" copies the repo URL |
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
