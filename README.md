# 🧭 TapHabit 风格 · 习惯打卡小程序

**简体中文** | [English](#english-version)

<div style="width:120px;height:120px;border-radius:24px;background:#222b3d;display:flex;align-items:center;justify-content:center;margin:0 auto;box-shadow:inset 0 0 0 2px #33415c;">
  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6L9 17l-5-5"></path>
  </svg>
</div>




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
- **方形卡片栅格**：首页习惯一行两个圆角方形小卡，卡上的热力图只画**当月**、按日历排开（一行七天，顶上标着一周日到周六的数字 1~7），圆点只分打过 / 没打过；快捷打卡收成一个对勾图标；打卡详情点进去照旧
- **图表单位就是区间**：统计页与详情页都是日 / 周 / 月 / 年四档，选日看每天、选周看每周、选月看每月、选年看每年，图上每一格对应一次翻页；时间轴图表左右滑动回看，两头的箭头平移整个窗口（日 30 天 / 周 26 周 / 月 12 个月 / 年 5 年），汇总指标与排行榜跟着窗口走
- **快捷打卡**：首页卡片点一下直接记一笔，要填数值 / 备注再进弹层
- **深浅色主题**：浅色 / 深色 / 跟随系统，一套 CSS 变量换肤，图表一并跟随
- **自定义主题**：另开一页调五个颜色 + 卡片透明度与毛玻璃 + 背景图（取景 / 缩放 / 模糊 / 淡化），整页实时预览，颜色从底色现推
- **主题预设**：调好的一套存成预设（最多三个），随时一键切回来。一个预设存的是自定义主题里**能调的全部** —— 五个颜色、卡片透明度与毛玻璃、背景图本体与它的取景 / 缩放 / 模糊 / 淡化。于是背景图有了多个持有者，删图走 `storage.releaseImageFile` 的引用计数，没人指着了才真删（见下）
- **背景图框选**：整张图摊开，拖着一个屏幕比例的取景小窗选显示范围，窗外压暗表示不显示；另配滑块调远近。这套东西收在正中的「调整背景图」弹窗里，页面上往下滑不会再蹭到取景框
- **毛玻璃卡片**：卡片带 `backdrop-filter`，模糊半径可调；自定义主题下调低卡片透明度时，背景图会糊开再透上来
- **悬浮胶囊导航**：底栏浮在内容之上、带毛玻璃，只有图标；「新建习惯」的圆钮也在胶囊里、挨着「主页」（实心主色，跟主题走），页面切到别的 tab 时点它会先切回首页再弹新建层；点击切换，页面之间淡出淡入
- **更新提示**：每次打开小程序都弹一次「已更新至 vX.Y.Z」并列出本次更新内容；不想看可以在弹窗里勾上「此次更新不再显示」，勾选只压制**这一个版本**，下次改版本号又会弹
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
├── utils/                           date.js · storage.js · stats.js · theme.js · version.js · page-fade.js
├── components/                      nav-bar · heatmap · habit-card · habit-editor
│                                    checkin-sheet · qiun-charts · empty-state · app-bg
├── pages/                           index · habit-detail · stats · settings · about
│                                    theme-editor（自定义主题，整页即预览）
└── scripts/                         自测与静态检查（不参与打包）
```

---

## 🗃️ 数据模型

存储 key 统一 `th:` 前缀。

- **`th:meta`** — `{ version: 1, createdAt, seeded, appVersion }`（`appVersion` 记着上次打开时的版本号，供排查问题时对照；「更新提示不再显示」不在这里，见 `th:settings.updateMuted`）
- **`th:habits`** — 习惯列表（`id / name / unit / icon / color / target / step / enabled / sort`）
- **`th:records`** — 按习惯分桶的打卡记录，短名压缩：`d` 日期 / `v` 数值 / `n` 备注 / `t` 时间戳；同一天允许多条
- **`th:settings`** — `{ haptic, theme, customTheme, themePresets, updateMuted }`，`theme` 取 `light` / `dark` / `system` / `custom`；`customTheme` 只在 `custom` 时起作用，且**只存用户改的那几项**（五个颜色 / 卡片透明度与毛玻璃 / 背景图路径与模糊淡化），整套色值由 `utils/theme.js` 现算；`themePresets` 是最多三个主题预设，各存 `{ id, name, cfg }`，`cfg` 是**一整份** `customTheme`（`PRESET_KEYS` 由 `theme.DEFAULT_CUSTOM` 的键直接推出，所以背景图也在内）；`updateMuted` 存「不再显示更新提示」的那个版本号

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
| 区间翻页 | 日 / 周 / 月 / 年不允许翻到未来，判据是「下一屏的最后一格落在今天所在的那一格之后」；`canNext` 与点击处理共用同一判据 |
| 切主题 | `app.wxss` 的深色值是兜底，即使 `page-style` 未生效也只是「没换肤」，不会白屏或透明 |
| 自定义主题配色 | 语义色不推算（取现成那两套）；层级方向跟底色亮度反，不跟主题名 |
| 下调卡片透明度 | 只影响卡片，弹层另有实心的 `--popup-*`，不跟着透 |
| 卡片毛玻璃 | 半径可调（0–40px，默认 16），只在卡片真的半透明时看得见；弹层不加 |
| 底栏图标颜色 | 唯一跟着主题走的图标：它拿不到 CSS 变量，而选中胶囊的填充就是主色 |
| 图表不跟主题变色 | 颜色走 JS 不走 CSS，两个带图表的页面各自在 `onShow` 里用 `chartVars()` 重算 |
| 点图表没有提示框 | uCharts 的 `hexToRgb()` 只认 hex，喂 `rgba()` 会在触摸回调里抛异常；`chartVars()` 先把带 alpha 的值展平成实心 hex |
| 图表单位 | 粒度**就是**区间（日→天、周→周、月→月、年→年）。曾经是「比区间细一档」的梯子，但那样控件与横轴说的不是一件事：点了「周」，横轴上却是一天一根柱子 |
| 一格一个单位却只有一根柱子 | 靠 `date.windowOf()` 铺一串同类单位解决（日 30 格 / 周 26 格 / 月 12 格 / 年 5 格），不是一个区间画一格 |
| 图表横向滑动 | 用 uCharts 自带的 `enableScroll`，不套 `scroll-view`：`scroll-view` 会把 Y 轴和刻度一起推走，而 uCharts 只对绘图区做 `translate`，刻度钉在原地 |
| 滚动图表一屏几格 | `stats.chartItemCount()` 给 `xAxis.itemCount`（日 10 / 周 8 / 月 6 / 年 5），对比柱状图固定 5（习惯名，和时间无关）；`itemCount ≥ 类目数`时布局和不滚动完全一样，所以小数量的习惯是安全的 |
| 滚动图表初始位置 | 靠构造时的 `xAxis.scrollAlign`（`qiun-charts` 的 `scrollStart`，默认 `right`）；重画时这个字段没人读，必须改传 `updateData({scrollPosition: ...})` |
| 习惯一多对比图的名字就没了 | uCharts 的抽稀拿 `labelCount` 当「一屏想放几个」，且**不看 `enableScroll`**：配上 `labelCount: 6`，6 个习惯起就每隔一个名字抹白一个。去掉它，`maxXAxisListLength` 默认取类目总数、`ratio` 恒为 1，一个都不抽 |
| 对比图看的是前几名 | 横轴按打卡次数降序排，所以它从**左**起步（`scrollStart="left"`）；默认的 `right` 是给时间轴用的，用在这儿会把第一名顶到屏幕外 |
| 时间轴标签被截成「9/…」 | 收缩器按**像素估宽**（CJK 1em、数字 0.55em）而不是字数，且滚动模式下「一格」取 `itemCount` 分之一屏而不是类目总数分之一屏 |
| 汇总与图表对不上 | 汇总 / 排行 / 两张图共用 `date.windowOf()` 的 start/end，说的永远是同一片时间 |
| 两张图单位不一致 | 粒度只有 `stats.granOfRange()` 一处定义，同一页的两张图共用，标题也由 `granLabel()` 拼出来 |
| 首页卡片一行两个 | 列宽是 `calc((100% - 20rpx) / 2)`；写 50% 会把间距也算进两列，第二列被挤到下一行 |
| 方形卡片的边长 | `height: 0` + `padding-bottom: 100%`（百分比内边距按**宽度**解析），不用 `aspect-ratio` —— 老 iOS 的 WebView 不认，卡片会压成一条 |
| 卡片热力图为什么是 27rpx | 尺寸是**倒着**算的：这块是卡片主角，先把高度用满。正方形卡片去掉 14rpx 内边距 / 44rpx 头部 / 52rpx 底部，剩 309rpx —— 6×27 + 5×3 + 周几那行 = 198rpx，加 12rpx 上边距共 210rpx，44 + 210 + 52 = 306 ≤ 309，所以 27rpx 是**高度**允许的上限，再大一行就顶出去。格子被高度定死之后 7 列铺不满卡片宽度（273 < 309），这是几何上的必然（7 列 × 6 行偏竖长，塞不进横长的空间），所以整块居中而不是把圆点拉成椭圆 |
| 卡片圆点为什么是正圆 | 格子 `width: height: 24rpx` + `border-radius: 50%`。改回紧凑热力图的 `padding-bottom: 100%` 也行，但那套的边长跟着列宽（`flex: 1`）走，而这里列宽是定死的 |
| 卡片上的一周从周日排 | 卡片上是「日历」，日历就是周日起排的，所以表头 `1~7` = 周日…周六；而 `utils/date.js` 的一周起点是周一（详情页那张能点的日历跟着它）。**不动共享的 `monthCalendar`**，在 `pages/index` 的 `cardCalendar` 里把整串右移一格：开头空 `(leadMon + 1) % 7` 格。行数不会因此变多（最坏仍是 6 行），卡片是按 6 行留的高度 |
| 卡片圆点对不上数字 | 表头和格子是两个 flex 容器，列宽必须**由构造**一致，不能各写一份「项宽 + 间距 + 居中」——两份独立的账差一像素，七列下来就错开小半格。两边共用 `.hc-cal` 上的 `--cal-w`（7 × 27 + 6 × 14 = 273rpx），项一律 `flex: none`，于是第 i 列在两边都必然落在 `i × 41rpx` |
| 更新提示何时弹 | **每次打开都弹**。两道闸：`_updateChecked` 让一次启动只判一次（首页是 tab 页，不加就会被每次 `onShow` 弹一遍）；`th:settings.updateMuted` 存用户勾过「不再显示」的那个版本号，所以只压制这一个版本 |
| 更新提示勾了又反悔 | 「不再显示」是在**关闭**那一刻才落盘的，且每次弹出都从没勾开始；勾了又取消、或勾完直接点「知道了」都不会留下痕迹 |
| 不点遮罩就杀掉小程序 | 不像早先那样「弹出即记录版本」：现在弹是常态，压制只由用户勾选决定 |
| 预设里都存什么 | `PRESET_KEYS = Object.keys(theme.DEFAULT_CUSTOM)` —— 由「可定制项」的定义直接推出来，不手抄一份清单。手抄的话，以后往调色板里加一项，老预设会悄悄少掉那一项（切回去只觉得「哪儿不太一样」，说不上来），而这种漏只有真机上才看得见 |
| 取景框误触 | 取景台收进正中的「调整背景图」弹窗，页面里不再有可拖的取景框 |
| 取景台太大 | 外面套一层 `width: 68%` 的框。必须套在外层：高度是 `padding-bottom` 百分比撑出来的，百分比内边距按**包含块的宽度**解析，所以框一窄宽高会一起等比缩，里面百分比定位的小窗分毫不差 |
| 取景弹窗里量舞台 | 打开时量两次：立刻量一次让拖动可用，展开动画（`scale(0.94)` → 原位）走完再量一次，否则量到的是缩放后的宽度 |
| 背景图占空间 | 存本地文件而非 storage。删文件走 `storage.releaseImageFile` 的**引用计数**：当前配置和每个预设各算一个持有者，还有人指着就不删（所以「换图 / 移除 / 恢复默认 / 删预设」都得**先落盘再释放**）；只有「清空数据 / 导入覆盖」这种整份设置都要没了的场合才整批收掉（`releaseBackgroundImage`，模块私有）。上限 = 当前一张 + 三个预设各一张 |
| 横屏背景图 | 编辑页把整张图摊开当舞台，拖屏幕比例的小窗选范围，窗内即真机所见 |
| 拖不动取景小窗 | 某一轴上窗子已占满舞台（行程为 0）时本来就没得挪；舞台宽度未量到时也不动，量到后自愈 |
| 瘦高的背景图 | 舞台按原图比例变得很高（1:3 的图 = 卡片宽的 3 倍），有意为之；弹窗主体可滚动 |
| 背景图问不到尺寸 | 弹窗里给出说明并提示换一张，真实图层退回 `aspectFill` 铺满居中 |
| 背景图看不见 | 依赖 `.page` 自成层叠上下文；卡片要够透才有图透上来 |
| 切走自定义主题后背景图还在 | 背景图只在 `theme === 'custom'` 时该出现，组件因此额外盯主题名变化 |
| 导入含背景图的备份 | 只搬颜色不搬图：路径是导出那台手机的，本机打开是坏的。当前配置和**每个预设**的 `image` 都要抹掉，漏一个就是个空路径 |
| 跟随系统 | 系统一切换即实时重画；`app.json` 的 `darkmode` 若被去掉会静默退化成「永远深色」 |
| 底栏里「新建习惯」的高度 | 也是 86rpx，和 `.tab` 一样：胶囊高度由最高的孩子定，它高出去就会顶高胶囊，`app.wxss` 里 `.page` 的 `padding-bottom` 就压不住 |
| 底栏里点「新建习惯」 | 已经在首页就**直接**调页面的 `onAddHabit`，不走 `switchTab`：切到当前 tab 框架不会重跑 `onShow`，那个 pending 标记会一直躺着，等用户哪天切到别的 tab 再回来时突然弹出来。在别的 tab 上才走「打全局标记 + 切回首页」那条老路 |
| 底栏里点「新建习惯」没反应 | 它和三个 tab 共用同一套 `touchend` 判定（`dispatch()`），「页面滑动过之后底栏点不动」那个坑对加号一样成立 |
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

<div style="width:120px;height:120px;border-radius:24px;background:#222b3d;display:flex;align-items:center;justify-content:center;margin:0 auto;box-shadow:inset 0 0 0 2px #33415c;">
  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6L9 17l-5-5"></path>
  </svg>
</div>



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
- **Square-card grid**: habits sit two per row as rounded squares; the heatmap on a card covers **the current month only**, laid out like a calendar (seven per row, weekday numbers 1–7 above, Sunday first as on a calendar) and reduced to dots (checked in / not, no shading); quick check-in is a single tick icon — the detail page behind a tap is unchanged
- **Chart unit *is* the range**: both the stats page and the detail page offer day / week / month / year — one bucket per day, per week, per month, per year — and each bucket corresponds to one page of paging; time-axis charts pan sideways to look back, the arrows shift the whole window (30 days / 26 weeks / 12 months / 5 years), and the summary tiles and ranking follow that window
- **Quick check-in**: tap a home-screen card to record once; open the sheet when you need values or notes
- **Light / dark theme**: light, dark, or follow system; one set of CSS variables reskins everything, charts included
- **Custom theme**: a dedicated page for five colors plus card alpha and blur, and a background image (framing / zoom / blur / dim); the page is the live preview, and the rest of the palette is derived from the background color
- **Theme presets**: save the set you tuned as a preset (up to three) and switch back to it in one tap. A preset stores **everything customizable** in the custom theme — five colors, card alpha and blur, and the background image with its framing / zoom / blur / dim. That gives the image several holders, so deletion goes through the `storage.releaseImageFile` reference count and only removes the file once nothing points at it (see below)
- **Framing by hand**: the whole image is laid out flat and you drag a screen-shaped window over it to pick what shows; the area outside is dimmed. A slider handles distance. All of it lives in a centred "Adjust background image" modal, so scrolling the page can't nudge the framing window
- **Frosted-glass cards**: `backdrop-filter` on every card with an adjustable radius, so lowering card alpha under a custom theme blurs the background image before letting it through
- **Floating capsule nav**: the tab bar hovers above the content with a frosted-glass fill and icons only; the "new habit" button lives in the capsule next to "Home" (solid accent, follows the theme) and switches back to Home first when tapped from another tab; tap to switch, with a fade out / fade in between pages
- **Update notice**: a "已更新至 vX.Y.Z" popup listing what changed shows on **every launch**; tick "此次更新不再显示" to mute it. The mute only suppresses **that one version** — the next version number prompts again
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
├── utils/                           date.js · storage.js · stats.js · theme.js · version.js · page-fade.js
├── components/                      nav-bar · heatmap · habit-card · habit-editor
│                                    checkin-sheet · qiun-charts · empty-state · app-bg
├── pages/                           index · habit-detail · stats · settings · about
│                                    theme-editor (custom theme; the page is the preview)
└── scripts/                         Self-tests & static checks (not bundled)
```

---

## 🗃️ Data Model

All keys use the `th:` prefix.

- **`th:meta`** — `{ version: 1, createdAt, seeded, appVersion }` where `appVersion` records the version last opened (kept for reference when debugging; "don't show this update again" lives in `th:settings.updateMuted`)
- **`th:habits`** — habit list (`id / name / unit / icon / color / target / step / enabled / sort`)
- **`th:records`** — check-ins bucketed by habit, short keys: `d` date / `v` value / `n` note / `t` timestamp; multiple per day allowed
- **`th:settings`** — `{ haptic, theme, customTheme, themePresets, updateMuted }` where `theme` is `light` / `dark` / `system` / `custom`; `customTheme` only applies when `custom` and stores **only what the user changed** (five colors, card alpha and blur, background image path/blur/dim), with the full token set derived at runtime by `utils/theme.js`; `themePresets` holds up to three theme presets, each `{ id, name, cfg }` where `cfg` is a **whole** `customTheme` (`PRESET_KEYS` is derived straight from `theme.DEFAULT_CUSTOM`'s keys, so the background image is included); `updateMuted` holds the version number the user muted the update notice for

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
| Period paging | Day / week / month / year can't page into the future: the predicate asks whether the next screen's **last bucket** would land past today's bucket; `canNext` and the tap handler share it |
| Theme switch | The dark tokens in `app.wxss` are the fallback, so even if `page-style` didn't apply the result is "no reskin", never a blank or transparent screen |
| Custom theme colors | Semantic colors are not derived (taken from the two existing sets); the ramp direction follows the background's brightness, not the theme's name |
| Lowering card alpha | Cards only — sheets keep their own solid `--popup-*` set and do not fade with them |
| Frosted cards | Radius is adjustable (0–40px, default 16) and visible only where cards are genuinely translucent; sheets are excluded |
| Tab bar icon color | The only icons that follow the theme: they can't read CSS variables, and the active pill is filled with the accent |
| Charts ignoring the custom theme | Chart colors travel through JS, not CSS, so both pages that draw one recompute with `chartVars()` in `onShow` |
| Tapping a chart and getting no tooltip | uCharts' `hexToRgb()` takes hex only; `rgba()` raises inside the touch handler, so `chartVars()` flattens translucent values to solid hex first |
| Chart units | The bucket **is** the range (day→day, week→week, month→month, year→year). It used to be a ladder one step *finer* than the range, but then the control and the axis told different stories: you tapped "week" and the axis drew one bar per day |
| One bucket per unit would give a single bar | Solved by laying out a run of same-unit buckets in `date.windowOf()` (30 days / 26 weeks / 12 months / 5 years) rather than drawing one bar per range |
| Panning the chart | uCharts' own `enableScroll`, not a `scroll-view` wrapper: a `scroll-view` drags the y-axis and its ticks off-screen, while uCharts translates only the plot and leaves the ticks pinned |
| How many buckets fit on screen | `stats.chartItemCount()` feeds `xAxis.itemCount` (day 10 / week 8 / month 6 / year 5); the comparison chart is pinned at 5 (habit names, unrelated to time). When `itemCount >= categories.length` the layout is identical to a non-scrolling chart, so small habit counts are safe |
| Where a scrolling chart starts | `xAxis.scrollAlign` at construction time (the `scrollStart` prop on `qiun-charts`, `right` by default); redraws ignore that field, so they must pass `updateData({scrollPosition: ...})` instead |
| Habit names vanishing once there are several habits | uCharts' thinning treats `labelCount` as "how many fit on screen" and **ignores `enableScroll`**: with `labelCount: 6`, from six habits up every other name is blanked. Drop it, and `maxXAxisListLength` defaults to the category count with `ratio` fixed at 1 — nothing gets thinned |
| The comparison chart cares about the top few | Its axis is sorted by check-in count descending, so it starts at the **left** (`scrollStart="left"`); the default `right` is for time axes and would push the leader off-screen |
| Time-axis labels truncated to "9/…" | The shrinker estimates **pixels** (CJK 1em, digits 0.55em) rather than characters, and in scroll mode a slot is `itemCount`-th of the plot, not total-categories-th |
| Summary disagreeing with the chart | The summary, the ranking and both charts share `date.windowOf()`'s start/end, so they always describe the same stretch of time |
| The two charts disagreeing | Granularity is defined once in `stats.granOfRange()`, shared by both charts on a page, and the titles are built from `granLabel()` |
| Two cards per row | The column is `calc((100% - 20rpx) / 2)`; plain 50% counts the gap inside the two columns and pushes the second onto its own row |
| The square card's side | `height: 0` + `padding-bottom: 100%` (percentage padding resolves against the **width**), not `aspect-ratio` — older iOS WebViews ignore the latter and squash the card flat |
| Why the card's dots are 27rpx | The size is worked out **backwards**: this block is the card's main event, so height is spent first. A square card has 309rpx left after 14rpx padding, a 44rpx header and a 52rpx footer — 6×27 + 5×3 plus the weekday row is 198rpx, and 12rpx of top margin brings it to 210, so 44 + 210 + 52 = 306 ≤ 309. 27rpx is thus the ceiling **height** allows; one rpx more and a row spills out. Once the cells are fixed, seven columns can't fill the card's width (273 < 309) — pure geometry (7 columns × 6 rows is a tall shape and won't fit a wide one), so the block is centred instead of stretching the dots into ellipses |
| Why the dots are round | The cell is `width: height: 24rpx` + `border-radius: 50%`. The compact heatmap's `padding-bottom: 100%` trick would work too, but there the side follows a `flex: 1` column width, and here the column is fixed |
| The card's week starting on Sunday | The card is a **calendar**, and calendars start on Sunday, so the header `1~7` is Sun…Sat; `utils/date.js` starts weeks on Monday (the tappable calendar on the detail page follows it). The shared `monthCalendar` is left alone — `cardCalendar` in `pages/index` shifts the whole run right by one instead, opening with `(leadMon + 1) % 7` blanks. That can't add a row (six is still the worst case), and the card's height budgets for six |
| The card's dots not lining up with the numbers | The header and the grid are two flex containers, so their column widths have to match **by construction** rather than by two hand-copied sets of "item width + gap + centring" — two separate accounts off by one pixel drift half a cell across seven columns. Both read `--cal-w` off `.hc-cal` (7 × 27 + 6 × 14 = 273rpx) and every item is `flex: none`, so column *i* lands at `i × 41rpx` in both |
| When the update notice shows | On **every launch**. Two guards: `_updateChecked` makes it fire once per launch (Home is a tab page, so without it every `onShow` would pop it again), and `th:settings.updateMuted` stores the version the user muted, so only that one version is suppressed |
| Ticking "don't show again" and changing your mind | The mute is written when the popup is **closed**, and every popup starts unticked; ticking then unticking, or ticking and tapping "got it" anyway, leaves no trace |
| Killing the app without dismissing | No longer records the version on open the way it used to: showing is now the norm, and suppression is the user's call alone |
| Nudging the framing window | The framing stage lives in a centred "Adjust background image" modal, so the page itself has no draggable framing box |
| The framing stage being too big | A `width: 68%` wrapper around it. It has to be on the outside: the height comes from a `padding-bottom` percentage, and percentage padding resolves against the **containing block's width**, so narrowing the wrapper shrinks width and height together while the percentage-positioned window inside stays exactly put |
| Measuring the stage in that modal | Measured twice: once immediately so dragging works, once after the entrance animation (`scale(0.94)` → none) finishes, since an in-flight measurement reads the scaled width |
| Background image footprint | Stored as a local file with only a path in storage. Deletion goes through `storage.releaseImageFile`'s **reference count**: the current config and each preset are holders, and the file survives while any of them points at it (so changing / removing / resetting / deleting a preset must all **persist first, then release**); only "everything is going away" cases (clear data, import overwrite) sweep the lot via `releaseBackgroundImage`, which stays module-private. Ceiling = one current + one per preset |
| What a preset stores | `PRESET_KEYS = Object.keys(theme.DEFAULT_CUSTOM)` — derived from the definition of "customizable" rather than re-listed by hand. A hand-written list means the next field added to the palette silently goes missing from older presets ("something looks different", but you can't say what), and that kind of gap only shows up on a real device |
| A landscape background image | The editor lays the whole image out as a stage and you drag a screen-shaped window over it; what is in the window is what the device shows |
| The framing window won't move | On an axis where the window already fills the stage (zero travel) there is nothing to move; nor does it move before the stage width has been measured — it heals on the next render |
| A tall, narrow background image | The stage grows tall with it (a 1:3 image is three card-widths tall), deliberately; the 68% wrapper above pulls the whole thing down by about a third, long edge included, and the modal body scrolls |
| Background image with unknown dimensions | The modal says so and suggests picking another image, and the real layer falls back to `aspectFill`, filled and centred |
| Background image not visible | Depends on `.page` forming a stacking context; the card ramp has to be translucent enough for the image to show through |
| Background image lingers after leaving the custom theme | The image belongs to `theme === 'custom'` only, so the component also watches the theme name |
| Importing a backup that has one | Colors travel, the image doesn't: the path belongs to the exporting phone and is broken here. The `image` of the current config and of **every preset** has to be blanked — miss one and it's a dead path |
| Follow system | Repaints the moment the system switches; dropping `darkmode` from `app.json` degrades silently to "always dark" |
| Height of "new habit" in the bar | Also 86rpx, matching `.tab`: the capsule's height is set by its tallest child, so overshooting it would grow the bar and `.page`'s `padding-bottom` could no longer clear it |
| Tapping "new habit" in the bar | On Home it calls the page's `onAddHabit` **directly** rather than `switchTab`: switching to the current tab doesn't re-run `onShow`, so the pending flag would sit there and pop the editor later, whenever the user happens to return from another tab. On the other tabs it takes the usual "set the flag, switch home" route |
| Tapping "new habit" and getting nothing | It shares the tabs' `touchend` test (`dispatch()`); the "bar won't respond after the page has been swiped" bug applies to the plus just as much |
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
