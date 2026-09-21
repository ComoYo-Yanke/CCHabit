# CLAUDE.md

> 本文件是 TapHabit 习惯打卡小程序的开发者指南，供 Claude Code / AI 助手在修改本项目时快速了解约定、结构与边界。
> 面向用户的介绍见 `README.md`。

---

## 项目概览

- **TapHabit 风格 · 习惯打卡微信小程序**
- 纯本地 · 无服务端 · 无账号 · 不联网
- 所有数据保存在微信小程序 storage 里
- 原生技术栈：WXML + WXSS + JS，**未用 uniapp**
- 零图片资源：图标全为内联 base64 SVG
- 许可：CoMoYo-Yanke Strict Open Source License v1.0（见根目录 `LICENSE`）
- Copyright (c) 2026 CoMoYo-Yanke

---

## 目录

- [CLAUDE.md](#claudemd)
  - [项目概览](#项目概览)
  - [目录](#目录)
  - [快速开始](#快速开始)
  - [项目结构](#项目结构)
  - [数据模型](#数据模型)
  - [核心约定](#核心约定)
  - [主题系统](#主题系统)
    - [深浅色主题](#深浅色主题)
    - [自定义主题](#自定义主题)
    - [主题预设](#主题预设)
    - [背景图](#背景图)
    - [背景图框选](#背景图框选)
  - [液态玻璃](#液态玻璃)
    - [玻璃关键约定](#玻璃关键约定)
    - [分段控制器关键约定](#分段控制器关键约定)
  - [图表系统](#图表系统)
    - [图表关键约定](#图表关键约定)
  - [首页方形卡片](#首页方形卡片)
    - [卡片关键约定](#卡片关键约定)
  - [底部导航](#底部导航)
    - [底栏关键约定](#底栏关键约定)
  - [更新提示](#更新提示)
    - [更新提示关键约定](#更新提示关键约定)
  - [自测与静态检查](#自测与静态检查)
  - [边界情况](#边界情况)
  - [修改本项目时的注意事项](#修改本项目时的注意事项)
    - [主题相关](#主题相关)
    - [图表相关](#图表相关)
    - [首页卡片相关](#首页卡片相关)
    - [底部导航相关](#底部导航相关)
    - [更新提示相关](#更新提示相关)
    - [数据存储相关](#数据存储相关)
    - [测试相关](#测试相关)

---

## 快速开始

1. 用**微信开发者工具**打开项目根目录（`project.config.json` 所在目录）
2. AppID 选「测试号」或填自己的（当前为 `touristappid`）
3. 编译运行，首页可点「载入示例数据」体验

---

## 项目结构

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

## 数据模型

存储 key 统一 `th:` 前缀。

- **`th:meta`** — `{ version: 1, createdAt, seeded, appVersion }`
  - `appVersion` 记着上次打开时的版本号，供排查问题时对照
  - 「更新提示不再显示」**不在这里**，见 `th:settings.updateMuted`
- **`th:habits`** — 习惯列表（`id / name / unit / icon / color / target / step / enabled / sort`）
- **`th:records`** — 按习惯分桶的打卡记录，短名压缩：`d` 日期 / `v` 数值 / `n` 备注 / `t` 时间戳；同一天允许多条
- **`th:settings`** — `{ haptic, theme, customTheme, themePresets, updateMuted }`
  - `theme` 取 `light` / `dark` / `system` / `custom`
  - `customTheme` 只在 `custom` 时起作用，且**只存用户改的那几项**（五个颜色 / 卡片透明度与毛玻璃 / 背景图路径与模糊淡化），整套色值由 `utils/theme.js` 现算
  - `themePresets` 是最多三个主题预设，各存 `{ id, name, cfg }`，`cfg` 是**一整份** `customTheme`（`PRESET_KEYS` 由 `theme.DEFAULT_CUSTOM` 的键直接推出，所以背景图也在内）
  - `updateMuted` 存「不再显示更新提示」的那个版本号

**容量**：单条约 70 字节，上限 1MB/key、10MB 总量，约可存 10 万条以上。
写入均包 try/catch，配额异常抛 `{ code: 'QUOTA_EXCEEDED' }`，设置页提供用量进度条（≥70% 黄、≥90% 红）与导出 / 导入 / 清空。

---

## 核心约定

- **纯本地**：无服务端、无账号、不联网
- **原生技术栈**：WXML + WXSS + JS
- **零图片资源**：图标全为内联 base64 SVG
- **数据只在 storage**：背景图存本地文件（只存路径）

---

## 主题系统

### 深浅色主题
- 浅色 / 深色 / 跟随系统
- 一套 CSS 变量换肤，图表一并跟随
- `app.wxss` 的深色值是兜底

### 自定义主题
- 另开一页（`pages/theme-editor`）调五个颜色 + 卡片透明度与毛玻璃 + 背景图（取景 / 缩放 / 模糊 / 淡化）
- 整页实时预览，颜色从底色现推
- `customTheme` **只存用户改的那几项**

### 主题预设
- 调好的一套存成预设（最多三个），随时一键切回来
- 一个预设存的是自定义主题里**能调的全部**
- `PRESET_KEYS = Object.keys(theme.DEFAULT_CUSTOM)` —— 由「可定制项」的定义直接推出来，**不手抄一份清单**

### 背景图
- 存本地文件而非 storage，删文件走 `storage.releaseImageFile` 的**引用计数**
- 当前配置和每个预设各算一个持有者，还有人指着就不删
- 「换图 / 移除 / 恢复默认 / 删预设」都得**先落盘再释放**
- 「清空数据 / 导入覆盖」才整批收掉（`releaseBackgroundImage`，模块私有）
- 上限 = 当前一张 + 三个预设各一张

### 背景图框选
- 整张图摊开，拖着一个屏幕比例的取景小窗选显示范围，窗外压暗
- 另配滑块调远近
- 收在正中的「调整背景图」弹窗里，页面上往下滑不会再蹭到取景框

---

## 液态玻璃

- 1.3.0 起，**浅色 / 深色**两套主题的界面是「液态玻璃」：半透明渐变 + 一圈描边 + 内高光 + 外投影
- 彩色底光铺在 `.page::before` 上，卡片毛玻璃把它折射出来 —— 玻璃要有东西可透才成立
- 按下是**放大** `scale(1.06)`（演示就是这样），松手带过冲弹回
- 开关与滑块是**自绘组件**，不再是原生 `<switch>` / `<slider>`
- 会动的玻璃只有两处：分段控制器（日周月年 / 深浅色）的选中块、自绘滑块的把手（`--glass-seg-on` + `--glass-shadow` + 「扭曲」`--glass-warp`）；**底栏的选中块不动**（原因见底栏那节）
- **只改了这两套**：`custom` 那套配色一个像素都没变

### 玻璃关键约定

- 所有装饰都是**别名 token**，`app.wxss` 的 `page{}` 里默认值 = 「改动前的原值」或空操作，这样自定义主题取到的还是老的 `--surface` / `--border-soft`，加玻璃时**别往 `buildCustom` 里加键**
- 新装饰只加进 `THEMES.light` / `THEMES.dark`
- `.sheet` / `.modal` 重绑 `--surface` 时，**玻璃别名必须一起重绑** —— CSS 变量在声明它的元素上求值
- 卡片毛玻璃的饱和度走 `--glass-sat`（浅/深 180%），别在 `.card` 里写死
- 底栏 `.tabbar` **不用 `backdrop-filter`**：会让 fixed 胶囊变成独立合成层，滚动后点不动
- 彩色背景是 `.page::before`：`fixed` + `z-index: -1` + **静态无动画无 blur**（一次绘制缓存）
- 按下放大只给小控件；**整张卡片不能放大 1.06**（全宽卡片会顶出屏幕边距），走 `--glass-press-card`
- 热力图「没打卡」那一格走 `--heat-empty`（浅/深是**半透明**的白/黑），**不要用 `--heat-0`**：那是照不透明卡片挑的实色，卡片一变玻璃就糊成一片（浅色下网格直接看不见）。改的话三处一起改：`THEMES` 里的 `--heat-empty`、`app.wxss` 的兜底、`heatmap/index.js` 的 `fillOf`
- 开关「关着」那条轨道走 `--glass-track` / `--glass-track-edge`，**不要用 `--glass-soft`**：浅色下那是半透明白，落在浅底上看不见。轨道有 2rpx 描边，旋钮行程 48rpx 是按 `124 − 2×2 − 2×6 − 60` 算的，改尺寸要一起改
- 会滑的那块玻璃（分段控制器 / 滑块把手）身后那层「扭一下」走 `--glass-warp`（`blur(9px) saturate(190%)`）；演示里是 `blur(44px)`，这里刻意取小 —— 它是跟着动画每帧重算的一层

### 分段控制器关键约定

- 日 / 周 / 月 / 年（统计页、详情页）与 浅色 / 深色 / 跟随系统 / 自定义（设置页）都是 `.segment`
- 选中的那一段是**独立一层** `.segment::before`（不是各段自己的背景色），从当前段**滑**到目标段
- 位置只由页面写在 `.segment` 上的行内 `--seg-i`（第几段）决定；宽度与步长在 `app.wxss` 里按 `--seg-n`（默认 4）算
- **每一段的槽宽必须一致**（`.segment-item` 一律 `flex: 1`）：有一段特殊宽度，滑块就落不到格上
- 滑块身后那层「扭曲」是 `--glass-warp`，静态渐变不参与，所以滑的时候不费帧
- 按下时那一段「胀一下」，走 `--glass-press`（自定义主题下是 1，等于没动）

### 玻璃相关实现位置

- token 定义：`utils/theme.js` 的 `THEMES.light` / `THEMES.dark` 尾部
- 兜底默认值：`app.wxss` 的 `page{}`
- 自绘控件：`components/glass-switch` / `components/glass-slider`
- 底栏滑块：`custom-tab-bar/index.js` 的 `rects` / `settled` / `paint` / `settle`

---

## 图表系统

- **可视化**：Canvas 2D 折线 / 柱状图 + 纯 WXML 热力图，可横向滑动回看全部历史
- **图表单位就是区间**：统计页与详情页都是日 / 周 / 月 / 年四档，选日看每天、选周看每周、选月看每月、选年看每年，图上每一格对应一次翻页
- **时间轴图表左右滑动**回看，两头的箭头平移整个窗口（日 30 天 / 周 26 周 / 月 12 个月 / 年 5 年），汇总指标与排行榜跟着窗口走
- **图表库**：`lib/ucharts/u-charts.js` 为 [uCharts](https://www.ucharts.cn) v2.5.0（Apache-2.0），保留原始版权注释；升级直接替换该文件

### 图表关键约定
- 颜色走 JS 不走 CSS，两个带图表的页面各自在 `onShow` 里用 `chartVars()` 重算
- uCharts 的 `hexToRgb()` 只认 hex，喂 `rgba()` 会在触摸回调里抛异常；`chartVars()` 先把带 alpha 的值展平成实心 hex
- 粒度只有 `stats.granOfRange()` 一处定义，同一页的两张图共用，标题也由 `granLabel()` 拼出来
- 横向滑动用 uCharts 自带的 `enableScroll`，**不套 `scroll-view`**
- `stats.chartItemCount()` 给 `xAxis.itemCount`（日 10 / 周 8 / 月 6 / 年 5），对比柱状图固定 5
- 滚动图表初始位置靠构造时的 `xAxis.scrollAlign`；重画时必须改传 `updateData({scrollPosition: ...})`
- 去掉 `labelCount`，否则 6 个习惯起就每隔一个名字抹白一个
- 对比图横轴按打卡次数降序排，从**左**起步（`scrollStart="left"`）

---

## 首页方形卡片

- **方形卡片栅格**：首页习惯一行两个圆角方形小卡
- 卡上的热力图只画**当月**、按日历排开（一行七天，顶上标着一周日到周六的数字 1~7）
- 圆点只分打过 / 没打过；快捷打卡收成一个对勾图标；打卡详情点进去照旧
- **快捷打卡**：首页卡片点一下直接记一笔，要填数值 / 备注再进弹层

### 卡片关键约定
- 列宽是 `calc((100% - 20rpx) / 2)`；写 50% 会把间距也算进两列，第二列被挤到下一行
- 边长用 `height: 0` + `padding-bottom: 100%`（百分比内边距按**宽度**解析），**不用 `aspect-ratio`** —— 老 iOS 的 WebView 不认
- 卡片热力图尺寸是**倒着**算的：先把高度用满，27rpx 是**高度**允许的上限
- 卡片圆点为正圆：格子 `width: height: 24rpx` + `border-radius: 50%`
- 卡片上的一周从周日排（日历就是周日起排的），而 `utils/date.js` 的一周起点是周一（详情页那张能点的日历跟着它）
- **不动共享的 `monthCalendar`**，在 `pages/index` 的 `cardCalendar` 里把整串右移一格：开头空 `(leadMon + 1) % 7` 格
- 表头和格子是两个 flex 容器，列宽必须**由构造**一致，共用 `.hc-cal` 上的 `--cal-w`（7 × 27 + 6 × 14 = 273rpx）

---

## 底部导航

- **悬浮胶囊导航**：底栏浮在内容之上、带毛玻璃，只有图标
- 「新建习惯」的圆钮也在胶囊里、挨着「主页」（实心主色，跟主题走）
- 页面切到别的 tab 时点它会先切回首页再弹新建层
- 点击切换，页面之间淡出淡入
- `custom-tab-bar/` 必须在根目录

### 底栏关键约定
- 底栏图标颜色：唯一跟着主题走的图标，它拿不到 CSS 变量，而选中胶囊的填充就是主色
- 「新建习惯」的高度也是 86rpx，和 `.tab` 一样
- 已经在首页就直接调页面的 `onAddHabit`，**不走 `switchTab`**
- 它和三个 tab 共用同一套 `touchend` 判定（`dispatch()`）
- 点的是当前这一页：撤销待执行的切换、把淡出到一半的页面拉回来，不切页
- 切 tab 的高亮只在「这一页已经显示出来」时被画
- **选中块不动**：`.tab-pill` 上没有 transition，位置由 JS 直接写下去（试过「滑过去」和「滑完再切页」三版都没做干净，最终放弃 —— 每个 tab 页各有一个 tabBar 实例，切页时老实例整个丢掉，动画必断）。别再加过渡或加「先滑后切」的定时器
- 淡出 → `switchTab`（等 `LEAVE_MS` 140）→ 淡入；`.page--out` 默认就在
- 每次点击都现读当前路由，并且必然走到 `switchTab`
- 定时器被后一次覆盖，「后一次说了算」

---

## 更新提示

- 每次打开小程序都弹一次「已更新至 vX.Y.Z」并列出本次更新内容
- 不想看可以在弹窗里勾上「此次更新不再显示」
- 勾选只压制**这一个版本**，下次改版本号又会弹

### 更新提示关键约定
- **每次打开都弹**。两道闸：
  - `_updateChecked` 让一次启动只判一次（首页是 tab 页，不加就会被每次 `onShow` 弹一遍）
  - `th:settings.updateMuted` 存用户勾过「不再显示」的那个版本号
- 「不再显示」是在**关闭**那一刻才落盘的，且每次弹出都从没勾开始
- 不像早先那样「弹出即记录版本」

---

## 自测与静态检查

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

## 边界情况

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
| 图表单位 | 粒度**就是**区间（日→天、周→周、月→月、年→年） |
| 一格一个单位却只有一根柱子 | 靠 `date.windowOf()` 铺一串同类单位解决（日 30 格 / 周 26 格 / 月 12 格 / 年 5 格） |
| 图表横向滑动 | 用 uCharts 自带的 `enableScroll`，不套 `scroll-view` |
| 滚动图表一屏几格 | `stats.chartItemCount()` 给 `xAxis.itemCount`（日 10 / 周 8 / 月 6 / 年 5），对比柱状图固定 5 |
| 滚动图表初始位置 | 靠构造时的 `xAxis.scrollAlign`；重画时必须改传 `updateData({scrollPosition: ...})` |
| 习惯一多对比图的名字就没了 | 去掉 `labelCount`，`maxXAxisListLength` 默认取类目总数、`ratio` 恒为 1 |
| 对比图看的是前几名 | 横轴按打卡次数降序排，从**左**起步（`scrollStart="left"`） |
| 时间轴标签被截成「9/…」 | 收缩器按**像素估宽**（CJK 1em、数字 0.55em）而不是字数 |
| 汇总与图表对不上 | 汇总 / 排行 / 两张图共用 `date.windowOf()` 的 start/end |
| 两张图单位不一致 | 粒度只有 `stats.granOfRange()` 一处定义 |
| 首页卡片一行两个 | 列宽是 `calc((100% - 20rpx) / 2)` |
| 方形卡片的边长 | `height: 0` + `padding-bottom: 100%`，不用 `aspect-ratio` |
| 卡片热力图为什么是 27rpx | 尺寸是**倒着**算的：先把高度用满 |
| 卡片圆点为什么是正圆 | 格子 `width: height: 24rpx` + `border-radius: 50%` |
| 卡片上的一周从周日排 | 日历就是周日起排的；不动共享的 `monthCalendar`，在 `cardCalendar` 里右移一格 |
| 卡片圆点对不上数字 | 表头和格子共用 `.hc-cal` 上的 `--cal-w`，项一律 `flex: none` |
| 更新提示何时弹 | **每次打开都弹**。两道闸：`_updateChecked` + `th:settings.updateMuted` |
| 更新提示勾了又反悔 | 「不再显示」是在**关闭**那一刻才落盘的，且每次弹出都从没勾开始 |
| 不点遮罩就杀掉小程序 | 不像早先那样「弹出即记录版本」 |
| 预设里都存什么 | `PRESET_KEYS = Object.keys(theme.DEFAULT_CUSTOM)` |
| 取景框误触 | 取景台收进正中的「调整背景图」弹窗 |
| 取景台太大 | 外面套一层 `width: 68%` 的框 |
| 取景弹窗里量舞台 | 打开时量两次：立刻量一次让拖动可用，展开动画走完再量一次 |
| 背景图占空间 | 存本地文件而非 storage。删文件走 `storage.releaseImageFile` 的**引用计数** |
| 横屏背景图 | 编辑页把整张图摊开当舞台，拖屏幕比例的小窗选范围 |
| 拖不动取景小窗 | 某一轴上窗子已占满舞台（行程为 0）时本来就没得挪 |
| 瘦高的背景图 | 舞台按原图比例变得很高，有意为之；弹窗主体可滚动 |
| 背景图问不到尺寸 | 弹窗里给出说明并提示换一张，真实图层退回 `aspectFill` |
| 背景图看不见 | 依赖 `.page` 自成层叠上下文；卡片要够透才有图透上来 |
| 切走自定义主题后背景图还在 | 背景图只在 `theme === 'custom'` 时该出现，组件因此额外盯主题名变化 |
| 导入含背景图的备份 | 只搬颜色不搬图；当前配置和**每个预设**的 `image` 都要抹掉 |
| 跟随系统 | 系统一切换即实时重画；`app.json` 的 `darkmode` 若被去掉会静默退化成「永远深色」 |
| 底栏里「新建习惯」的高度 | 也是 86rpx，和 `.tab` 一样 |
| 底栏里点「新建习惯」 | 已经在首页就**直接**调页面的 `onAddHabit`，不走 `switchTab` |
| 底栏里点「新建习惯」没反应 | 它和三个 tab 共用同一套 `touchend` 判定（`dispatch()`） |
| 点的是当前这一页 | 撤销待执行的切换、把淡出到一半的页面拉回来 |
| 切 tab 的高亮 | 只在「这一页已经显示出来」时被画；选中块**不动**（不做滑动，见底栏那节） |
| 切 tab 的整页闪烁 | 淡出 → `switchTab` → 淡入；`.page--out` 默认就在 |
| 底栏选中块为什么不做滑动 | 试过「滑过去」和「滑完再切页」共三版都没做干净：每个 tab 页各有一个 tabBar 实例，切页时老实例整个丢掉，动画必在那一帧断掉。最终**不做移动效果** |
| 点了 tab 没反应 | 每次点击都现读当前路由，并且必然走到 `switchTab` |
| 连着猛点几个 tab | 定时器被后一次覆盖，「后一次说了算」 |
| 浅色下开关关态看不清 | 关态轨道走 `--glass-track`（浅色是一整条实灰轨），不再用 `--glass-soft` |
| 热力图格子看不见 | 「没打卡」那一格走 `--heat-empty` 的半透明色，不用照不透明卡片挑的 `--heat-0` |
| 分段选择器滑不过去 | `--seg-i` 写在 `.segment` 上；各段槽宽必须一样（有一段 `flex: 0 0 76rpx` 时是滑不准的） |
| 更新日志 | 页面只铺最近 1 条，更早的不展开，点「更早的版本记录」复制仓库地址 |
| 习惯已删进详情 | 弹窗提示并自动返回 |
| 导入非法 JSON | 校验结构，报错且原数据不变 |
| 导入孤儿记录 | 丢弃习惯已不存在的记录 |
| 月末溢出 | 1月31日 +1月 = 2月28/29日 |
| 名称 / 数值校验 | 名称必填 ≤12 字；数值 > 0；非法回落默认值 |

---

## 修改本项目时的注意事项

### 主题相关
- `PRESET_KEYS` 必须由 `theme.DEFAULT_CUSTOM` 的键直接推出，**不要手抄清单**，否则以后往调色板里加一项，老预设会悄悄少掉那一项
- 删背景图必须走 `storage.releaseImageFile` 的引用计数，**先落盘再释放**
- 导入备份时只搬颜色不搬图，当前配置和**每个预设**的 `image` 都要抹掉
- 背景图只在 `theme === 'custom'` 时该出现

### 玻璃相关
- 新装饰一律做成「默认值 = 原值或空操作」的别名 token，**不要往 `buildCustom` 里加键**
- `.sheet` / `.modal` 重绑 `--surface` 时，玻璃别名要**一起**重绑
- `.tabbar` **不要加 `backdrop-filter`**（fixed + 合成层 = 滚动后点不动）
- 彩色背景挂在 `.page::before`，**不要给它加动画或 `filter: blur`**
- 整张卡片不要用 `--glass-press` 的放大，走 `--glass-press-card`
- 底栏的选中块**不做动画**（`.tab-pill` 无 transition、不加 `transform`）：跨实例的动画必在切页那一帧断掉，这条已经走过三版，别回头
- 分段控制器只由 `--seg-i` 驱动，别在 `.segment-item--on` 上写背景色（会和滑块叠成两块）

### 自绘控件相关
- `glass-switch` / `glass-slider` 的对外接口是**照抄原生**的（同名属性 + `e.detail.value` + 组件节点上的 `data-*`），改它们时**保持这份兼容**，否则若干页面要跟着改
- 滑块矩形只在 `touchstart` 量一次，**不要每帧 `createSelectorQuery`**
- 别给滑块加回 `.sl-row slider { margin: 0 -8rpx }` 那种负边距（那是给原生 slider 抵消留白的）

### 图表相关
- 图表颜色走 JS 不走 CSS，两个带图表的页面各自在 `onShow` 里用 `chartVars()` 重算
- `chartVars()` 必须把带 alpha 的值展平成实心 hex，否则 uCharts 触摸回调会抛异常
- 粒度只有 `stats.granOfRange()` 一处定义，同一页的两张图共用
- 横向滑动用 uCharts 自带的 `enableScroll`，**不要套 `scroll-view`**
- 重画时必须改传 `updateData({scrollPosition: ...})`
- **不要加 `labelCount`**

### 首页卡片相关
- 列宽是 `calc((100% - 20rpx) / 2)`，**不要写 50%**
- 边长用 `height: 0` + `padding-bottom: 100%`，**不要用 `aspect-ratio`**
- 表头和格子列宽必须**由构造**一致，共用 `.hc-cal` 上的 `--cal-w`
- **不要动共享的 `monthCalendar`**，在 `pages/index` 的 `cardCalendar` 里右移一格

### 底部导航相关
- 底栏图标颜色是唯一跟着主题走的图标
- 「新建习惯」的高度也是 86rpx
- 已经在首页就直接调页面的 `onAddHabit`，**不走 `switchTab`**
- 它和三个 tab 共用同一套 `touchend` 判定（`dispatch()`）

### 更新提示相关
- `_updateChecked` 让一次启动只判一次
- `th:settings.updateMuted` 存用户勾过「不再显示」的那个版本号
- 「不再显示」是在**关闭**那一刻才落盘的

### 数据存储相关
- 存储 key 统一 `th:` 前缀
- 写入均包 try/catch，配额异常抛 `{ code: 'QUOTA_EXCEEDED' }`
- 背景图存本地文件而非 storage，只存路径

### 测试相关
- 修改纯函数后跑 `node scripts/test-utils.js`
- 修改存储逻辑后跑 `node scripts/test-integration.js`
- 修改图表后跑 `node scripts/test-charts.js`
- 修改打卡锁定逻辑后跑 `node scripts/test-checkin-lock.js`
- 修改弹层后跑 `node scripts/check-sheet.js`
- 修改组件引用 / 事件绑定 / 资源路径 / CSS 变量 / 主题一致性后跑 `node scripts/lint-structure.js`
- 修改 WXML 绑定变量后跑 `node scripts/lint-bindings.js`