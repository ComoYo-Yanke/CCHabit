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
- **深浅色主题**：浅色 / 深色 / 跟随系统，一套 CSS 变量换肤，图表一并跟随
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
- **`th:settings`** — `{ haptic, theme }`，`theme` 取 `light` / `dark` / `system`

单条约 70 字节，上限 1MB/key、10MB 总量，约可存 10 万条以上。写入均包 try/catch，配额异常抛 `{ code: 'QUOTA_EXCEEDED' }`，设置页提供用量进度条（≥70% 黄、≥90% 红）与导出 / 导入 / 清空。

---

## 🧠 设计决策

1. **日期一律 `YYYY-MM-DD` 字符串** — `new Date('2026-09-11')` 按 UTC 解析会退回前一天，故手工拆分构造本地 Date；一周从周一开始。
2. **数据出入口唯一** — 全部经 `utils/storage.js`，内部维护内存缓存，读失败回落默认值，避免白屏。
3. **连续打卡宽限** — 今天未打卡时给一天宽限，昨天有记录则不清零。
4. **统计只汇总次数** — 单位不同，跨习惯加总数值无意义。
5. **图表 Canvas，热力图 WXML** — `qiun-charts` 封装分辨率（传设备 px）、按主题取色的默认配置（工厂函数避免串台，见第 26 条）、触摸坐标归一化；`extra.line/area/column/bar` 必须给齐，且无数据不建实例。
6. **弹层主体用 `scroll-view` + flex 让位** — `flex: 1` + `min-height: 0`，不许手算高度；确认按钮移到头部 `flex-shrink: 0` 区域，故障失去物理条件。**踩过的坑**：「确认按钮不见」曾被归因到 `scroll-view`（说不参与 flex 收缩），换成 `view` + `overflow-y: auto` 后按钮是回来了，但真机上弹层滑不动、反而滚背景页 —— 普通 `view` 的 overflow 滚动挂在 WebView 的 touchmove 上，正被遮罩的 `catchtouchmove` 吃掉。真正的病因是漏了 `min-height: 0`（flex 项目默认 `min-height: auto`，压不下去），与是不是 `scroll-view` 无关。`scroll-view` 走原生滚动，手势不会冒泡到遮罩，才是正解。
6.1 **弹层最多占 68% 屏高** — 再高就成了全屏页，背景完全看不见，也失去了「这是盖在上面的一层」的感觉。`max-height: 68vh` 还顺带保证了主体一定会溢出：内容几乎正好装得下时滚动行程只有几十 rpx，看着就像「不能滚」，这是「创建习惯的弹层划不动」的主因。`.sheet-body` 另有一条 `max-height: 60vh` 兜底 —— `scroll-view` 要滚就得有个确定高度，`flex: 1` 算出来的高度通常认，但不值得赌：万一没认，它就是 content 高、永远不滚。
7. **uCharts 的 `width` / `height` 是设备 px** — 传逻辑宽会让图形只占左上角 1/dpr。
8. **X 轴标签抽稀挡不住最后一个** — 用 `xCategoryFormatter` 截断超长习惯名；不要配 `xAxis.itemCount`。
9. **悬浮按钮加号用 `.ic-plus-white`** — 蓝加号画在蓝底上等于没有。
10. **自定义 tabBar 必须在根目录，且底色不能靠 CSS 变量** — 它由框架独立挂载，不在页面的节点树里，继承不到 `page` 上的变量。底色 / 描边 / 选中胶囊的填充因此由 JS 用行内样式喂（`utils/theme.js` → `custom-tab-bar` 的 `syncTheme`）。又因为每个 tab 页各有一个自己的实例，主题变了别的实例不会自己更新，所以把「切选中态」和「同步主题」并成同一个入口 `setActive(index)`，页面每次 `onShow` 调一次就都跟上了。形态是**悬浮在底部的胶囊**、点击切换，见第 30 条。
11. **图标零资源** — 全内联 base64 SVG。代价是**图标颜色烘焙在 SVG 里、不跟主题走**，所以浅色主题下只挑「深色底和白色底上都能看」的中性灰（`#6B7280`），选中态则两套主题共用 `#5B8CFF`，并让文字也跟着用同一个值，避免文字和并排的图标对不上色。
12. **只能打卡当天** — 弹层无日期切换；`blockedByReadonly()` 不看 `data.readonly`，重新和时钟比对；组件不信任传入日期，未来 / 非法一律夹回今天。
13. **canvas 是原生组件** — 弹层盖不住，只能 `hidden` 时 `display: none` 让它不渲染；重新显示要重建而非重绘。
14. **弹层打开要锁页面滚动** — `catchtouchmove` 管触摸，`page-meta` 管滚轮。
15. **`.mask` 必须 `position: fixed`** — 祖上不能有 `transform` / `filter` / `perspective` / `will-change`。
16. **遮罩收起必须 `display: none`** — 光写 `opacity: 0` / `visibility: hidden` 不够：`input` / `textarea` / `switch` 是原生组件，由客户端控件画在 WebView 之上，只认「在不在渲染树里」，不认绘制层属性。首页偶尔冒出的「背单词」正是 habit-editor 名称框的 placeholder。组件因此用 `mounted` / `active` 两级状态：收起先摘 `--on` 播动画，260ms 后摘 `--mounted` 整棵卸载。
17. **`display` 从 `none` 变 `flex` 时过渡不会触发** — 需要 `mounted` → `wx.nextTick` → `active` 两阶段，让元素先以收起姿态完成一次真实布局，再加动效类。
18. **`switchTab` 的页面保持挂载** — 三个 tab 页从头到尾都活着，DOM 不重建。所以页面切换的淡出 / 淡入只能靠 `transition` 翻一个类、不能靠 `@keyframes`（动画不会自己重播，而且动画优先级高于过渡，还得配套 `animation: none` 那一串把戏）；反过来，`onReady` 一辈子只触发一次，正好用来当「首访的淡入时机」（见第 28 条）。只动 `opacity`，不碰 `transform`（见第 15 条）。
19. **首页卡片「打卡」是快捷打卡** — 直接记一笔（`v = 1`，不套用 `habit.step`），不弹窗。首页是「一屏扫过去顺手点一下」的场景，为记一次默认量而弹面板成本比动作本身高；要填数值 / 备注走详情页或概览区「去打卡」的弹层。
20. **移除每日目标与进度条** — 打卡就是记个数。`target` 字段保留在数据模型里（编辑提交时省略，靠 `saveHabit` 的合并保住旧值），但**不再有任何界面消费它**：热力图也不再传 `target`，色阶改按区间内最大值相对分档，和首页总览一致。
21. **移除补打卡** — 过去的日子只能**只读回看**：热力图 / 历史记录点进去仍能打开弹层，但弹层不给日期切换、不渲染录入区与删除按钮，`blockedByReadonly()` 还会再和时钟比对一次。写入路径本就不存在，此前只剩「点击日期可补打卡」这句文案在许诺一个做不到的功能。（日历不在此列，它连点击都没有，见第 29 条。）
22. **删除习惯恒定二次确认，不设开关** — 删习惯会级联删掉它全部打卡记录且不可恢复，没有「以后别问了」的合理场景，所以从 `DEFAULT_SETTINGS` 里去掉了 `confirmDelete`，两处 `onDeleteHabit` 都无条件弹确认。（老用户本地可能还留着这个键，不会再被读到。）
23. **热力图覆盖全部历史** — 周数按最早一条记录算（下限 26、上限 260 周），`scroll` 模式下按固定列宽铺开、初始 `scroll-left` 靠右停在今天，向左拖回看。`scroll-view` 的 `scroll-left` 单位是 px 而非 rpx。**首页总览和详情页共用同一套算法**：详情页此前固定 26 周，超出部分根本画不出来，也就无从「往左翻」。
24. **区间翻页的边界判据只看「下一段还没发生」** — 也就是 `下一段的 start > 今天`。这里的方向在统计页和详情页各写反过一次：「左」按钮点了没反应，反而能一直往「右」翻到未来去。原来那句等价于「区间起点在过去」，而上一周 / 上一月 / 上一年的起点**必然**在过去，于是往回翻被全线挡死、往未来翻没人拦。`canNext`（右箭头的灰态）和点击处理必须用同一个判据，否则会出现「箭头亮着但点了没反应」——详情页原来正是如此（灰态判的是 `rangeInfo.end < today`，点击判的是另一句）。两处的修法都是抽一个 `shiftedAnchor(delta)`：越界返回 `null`，`canNext` 直接取 `!!shiftedAnchor(1)`，判据只有一份。
25. **主题靠 CSS 变量重写，不做两套 wxss** — `app.wxss` 里 `page { … }` 那批变量是**深色默认值**；切浅色时页面把另一组值通过 `<page-meta page-style="…">` 写成 `page` 元素的行内样式。内联样式优先级高于选择器规则，而自定义属性是继承属性，会一路传到页面内每个节点和自定义组件（不管 `styleIsolation` 是什么）。于是「加一个主题」= 往 `utils/theme.js` 的 `THEMES` 里加一份变量表。两条纪律：① `app.wxss` 与 `THEMES.dark` 必须逐字一致（前者是兜底，也是唯一能写注释的地方）；② `page-style` 是**整体覆盖**，页面已有的 `overflow: hidden`（弹层锁滚动）必须自己拼在后面，不能各写各的。
26. **有三处不跟随页面变量，必须单独喂** — ① `custom-tab-bar`（见第 10 条）；② canvas 图表：颜色写在 uCharts 的配置对象里，走 JS 不走 CSS，所以 `qiun-charts` 多了一个 `theme` 属性，`defaultOpts(themeName)` 从**同一份变量表**取色 —— 组件还要单独 observe `theme`：换主题时数据和 `opts` 都没变，不 observe 就没人重绘，画布上留着的还是上一套配色；③ `wx.setBackgroundColor` / `setBackgroundTextStyle` —— `page` 的 background 只覆盖页面本身，下拉刷新露出的那截和 iOS 橡皮筋回弹的底色属于窗口背景，得单独设。
27. **「跟随系统」依赖 `app.json` 的 `"darkmode": true`** — 这个开关同时决定两件事：`wx.onThemeChange` 会不会派发（基础库 2.11.0 起），以及 `wx.getAppBaseInfo().theme` 有没有值。少了它，`theme` 恒为 `undefined`，`utils/theme.js` 的 `system()` 会一路退回默认主题 —— 表现就是「跟随系统」安静地永远等于深色，和「这个功能没做」看不出区别。这里踩过一次：最初为了避免框架接管原生控件配色而刻意没开，结果顺手把跟随系统一起关掉了；而本项目的导航栏（`navigationStyle: custom`）和 tabBar（`tabBar.custom`）都由自己画，框架本来也无从接管，那个顾虑不成立。实时切换靠 `app.js` 里注册一次的 `wx.onThemeChange`：系统一切换就调栈顶页面的 `syncTheme()`，再由它去读一次系统主题 —— 刻意不读回调参数里的 `res.theme`，让「系统主题」只有一个来源，不必在两个值之间挑一个信。只重画栈顶页面，栈里其余页面等各自 `onShow` 时自然跟上。`theme.json` 另把窗口底色按 `@windowBg` 暴露给框架，`app.json` 的 `window.backgroundColor` 引用它，这样首帧（以及部分安卓机型切换主题导致的重载之后）就已经是对的。
28. **页面切换是「淡出 → switchTab → 淡入」，一个布尔量翻两个方向** — `fading` 就是全部机制：`true` = 这一页必须是透明的。去掉 `.page--out` 就 0→1（0.26s 对称 ease-in-out，进场），加上就 1→0（0.14s `ease-in`，退场）。两条曲线各自写在 `.page--fade` / `.page--out` 里，**顺序不能调**：两个类同时在元素上时要靠后面的赢。四次尝试才定下来的几个点：
    - **关键不变量只有一条：没在显示的页面必须是透明的。** 框架把目标页搬上台前、到它的 `onShow` 跑起来之间隔着至少一帧，那一帧的透明度不由我们决定 —— 那一帧是什么样，用户就看到什么样。所以① `fading` 初值是 `true`（新实例第一帧就带着 `.page--out` 被画出来），② 每个 tab 页的 `onHide` 都置回 `true`，③ 唯一的例外是切换那一下故意先淡出。这条守住，框架露出的那一帧就是「透明的」，用户看到的是干净的淡入。
      反过来，**绝不能在页面可见的时候置 `true`**，否则就是把一个正在显示的页面按到透明 —— 那就是「整页闪没又出现」。
    - **不用 `@keyframes`，只用 `transition`。** 用动画会连带三个坑：同一属性上动画优先级高于过渡（退场想用 `transition` 就得先 `animation: none` 把动画撤掉，否则页面淡不下去）、`fill-mode: forwards` 会把 `opacity` 钉死、switchTab 的页面一直活着 DOM 不重建所以固定 `animation-name` 不重播（还得备 `pageFadeInA` / `pageFadeInB` 换名字 + `fadeKey`）。现在只要一个类在不在。
    - **触发时机分两个：首访 `onReady`，复访 `onShow`。** 首访的 `onShow` 早于布局落定，页面还在做第一轮重活（`onLoad` 读数据、图表初始化），动画叠在上面就是闪；`onReady`（初次渲染完成）之后起动画才干净。复访时页面早就建好了，`onShow` 直接淡入即可。`pageFade` 用一个 `_fadeReady` 标记区分两者。
    - **`.page` 的兄弟节点不跟着淡**：首页的悬浮「+」是 `.page` 的兄弟，自己挂一套 `.fab--out`。**不能直接复用 `page--out`** —— `.fab` 自己的 `transition` 还管着 `transform`（按压反馈），两个简写会互相覆盖，所以两边都把过渡写全。
    **三件事必须成对**：wxml 上有 `page--fade`、`onShow` 里调了 `show`、`onHide` 里调了 `leave`。少了 `onHide` 那一下，这一页第二次被搬上台时就不是透明的了，会闪。项目里五个页面各自成对，只能靠这条纪律。
    **`transform` 不能加**：那会让 `.page` 成为 `position: fixed` 子元素的包含块（见第 15 条）。
30. **底栏是悬浮胶囊（只有图标），点击切换、没有拖动** — 胶囊浮在内容之上、不占布局，所以 `.page` 的 `padding-bottom` 必须把它的高度让出来（152rpx + 安全区 = 离底 20 + 胶囊 108 + 透气 24），两处改一处就得改另一处；胶囊高度又由 `.tab` 的 padding 和内边距决定，去掉文字那次就矮了约 20rpx，三个数得一起改。
    拖动效果已经**完全移除**（同时移除了它带来的一整套状态：绝对定位的高亮滑块 `.tab-pill`、`pillX` / `pillW`、`instant` 抑制过渡、`followFinger` / `dragTo` / `indexAt`、`_dragging` / `_moved` / `_suppressTap`、逐段震动）。移除的理由不只是「不需要」，而是那一套的每一部分都在制造只有它自己才需要的麻烦：
    - 滑块要连续跟手，于是需要**独立图层 + JS 喂坐标**；喂坐标的前提是知道每段多宽，于是要么异步量 DOM（`createSelectorQuery` 的回调最早下一帧才回来，第一帧胶囊画不出来 —— 这正是「第一次进必然闪一下」的根因，见第 32 条），要么把段宽钉死成常量再自己算 rpx→px 的换算。
    - 命中判定不能靠 `data-index`（触摸事件有捕获语义，事件目标始终是 `touchstart` 落在的那个元素），只能靠坐标算下标。
    - 拖动期间 `data.selected` 脱离真实页面、松手时 `tap` 可能补一次、归位时还得挑一个「页面已经不可见」的时机擦残留（见第 32 条）。
    现在高亮就是**当前那一段自己的背景色**（`tab--on`，颜色由 JS 行内样式给，跟主题走），只在段落之间跳、不连续移动，上面这些全都不存在了。`.tab:active` 的按压态仍然不加：切换时页面在淡出，再叠一层按压变暗是多余的。
31. **震动统一走「震动反馈」开关** — 打卡那两处（首页快捷打卡、打卡弹层）用的是 `storage.getSettings().haptic` + `wx.vibrateShort({ type: 'light', fail: () => {} })`，写法保持一致。刻意不做成公共函数：各自三行，抽出去反而要在两个已稳定的文件里动刀。（底栏拖动移除后，切 tab 不再有震动 —— 切页的反馈由页面淡出提供。）
32. **底栏的三条纪律：高亮只在页面 `onShow` 时变、判据现读路由、切换不铺垫状态机** — `custom-tab-bar` 是**按页面各挂一份**的，而这一份只在「它自己那一页可见」的时候才被人看到。这条前提推出下面三件事：
    - **点 tab 时不去改高亮。** 高亮的唯一来源是各页面 `onShow` 里的 `setActive`，也就是「哪一页真的显示出来了，高亮才落到哪一段」。两个好处：高亮和页面状态天然一致，不会出现「按钮切了、页面没切」这种两边打架的观感；离开某页后也不会留下任何要擦的残留状态（早先拖动那套就留过，见下）。
    - **唯一需要操心的残留是「新实例的第一帧」**：`selected` 初值是 0，第一次进「统计」会先画一帧「习惯」被选中。所以 `attached` 里按**当前路由**给初值（`getCurrentPages()` 栈顶的 `route` 去 `list` 里找下标）。`onShow` 有可能先于 `attached` 跑过（框架在部分机型 / 版本上就是这个顺序），所以只在 `selected` 还是初值 0、且查到的下标大于 0 时才写 —— 免得把页面刚设好的值盖回去。
      ⚠️ 这一块踩过三次，都是同一句话的反面：**任何「擦残留」都必须挑一个页面已经不可见 / 还没变得可见的时机做**。最早为了拖动那套，高亮的即时反馈让它在按下时就滑到目标段，于是要擦；擦的时机先放在 `switchTab` 的 `complete`（那时旧页面还在屏幕上，高亮**当着用户的面滑回去**，看着像抽搐了一下），后来挂在 `pageFade.hide` 里（那套机制整个删掉时又得搬家）。**拖动移除后这个残留连同擦除逻辑一起消失了** —— 这是移除拖动的附带收益。
      ⚠️ 另一个真元凶也随拖动一起没了：高亮滑块的第一帧宽度来自异步测量（`createSelectorQuery` 的回调最早下一帧才回来，在那之前胶囊画不出来），所以**每个页面第一次被打开时高亮都会先消失一帧再冒出来**，全点过一遍之后反而好了（那时测量结果已缓存）。它的指纹正是「第一次必然、之后不再犯」。
    - **切换逻辑不铺垫任何状态机**：`onTap` → `commit(index)` → 淡出当前页 → 140ms 后 `switchTab`。没有忙标志、没有超时兜底、没有拖动状态机 —— 每次点击都必然走到 `switchTab`，不存在被自家状态吞掉的点击。防「连点两次」用的是「后一次说了算」：重设那个 140ms 定时器即可，上一次待执行的切换自动作废（`detached` 里清一次）。需要早退的只有一种情况：点的就是本页，此时撤销待执行的切换、并把淡出到一半的页面拉回来。
      判据是**现读**的当前路由，不是任何缓存。这里出过 bug：「切不切」原来拿 `_live`（记账）去比，只要它有一处和现实脱节 —— 漏了一次 `onShow`、上一次 `switchTab` 被拒、`attached` 播种的时机不对 —— 就会**永久**判成「已经在这一页了」，此后再点这个 tab 都没反应，表现成「点了切换、下方按钮也变了、页面却没切换」。现读的判据永远等于现实，脱节最多影响一次点击且下次自愈。认不出路由时返回 **-1 并当作「不一样」**去切 —— 未知绝不能算作「已经在这一页」。

33. **更新日志只铺最近 3 条，更早的引导去仓库** — 理由是这份列表是给人扫一眼的，铺满就没人看。`about.js` 里 `CHANGELOG` 仍然记全，页面上 `slice(0, CHANGELOG_LIMIT)`，多出来时多一行「更早的版本记录 ›」。这一行**刻意不做展开**（不是「点开看全部」）：既然结论是「条目多了没人看」，展开就把问题原样搬了回来。点了它和开发者那栏一样**复制仓库地址**——小程序打不开外链（`web-view` 只认业务域名，个人开发者一般没有），所以全项目的对外链接只有这一种形态。

29. **日历是只读一览，不绑点击** — 它的职责只是「当月哪几天打了卡、哪几天没打」，打卡入口在页头的「打卡」按钮，看某天明细走下面的历史记录列表。此前格子上绑着 `onCalDayTap`，于是点今天 / 未来会弹出打卡层 —— 一个本不该有写入路径的面板成了写入入口。顺带修掉一个符号错误：`monthCalendar` 里写的是 `isFuture: diff < 0`，而 `diffDays(a, b)` 算的是 `b - a`，所以那个 `diff` 是「日期减今天」，**为正才是未来**。方向一反过来，整月的过去日期全被标成未来 —— 点昨天提示「还没到的日子」，点明天反而能打开弹层，连未来格子压暗的样式也全落在历史日期上。`scripts/test-utils.js` 现在钉住「`isFuture` 必须等于日期直接比较的结果」，且刻意不做时钟相关断言（否则过几个月这条会自己红掉）。同一处还把压暗色从 `--surface-3` 换成 `--text-3`：前者是底色系列，浅色主题下接近纯白，写在白卡片上等于把日期擦掉。

---

## 🛡️ 边界

| 场景 | 处理 |
| --- | --- |
| 删除习惯 | 级联删除记录并提示条数 |
| 存储写满 | 捕获配额异常，引导到「存储管理」备份清理 |
| 未来日期 | 日历标灰且不可点；热力图拦截；弹层夹回今天并禁止写入 |
| 日历 | 只读一览，不绑点击；可往前翻月份，不可翻到未来（见决策 29） |
| 修改过去打卡 | 只读回看，写入入口不渲染且方法内拦截 |
| 补打卡 | 功能已移除，不再提供入口与文案 |
| 区间翻页 | 周 / 月 / 年不允许翻到未来；判据只有一份（见决策 24） |
| 切主题 | `app.wxss` 的深色值是兜底，即使 `page-style` 未生效也只是「没换肤」，不会白屏或透明 |
| 跟随系统 | 系统一切换即实时重画；`app.json` 的 `darkmode` 若被去掉会静默退化成「永远深色」（见决策 27） |
| 点的是当前这一页 | 撤销待执行的切换、把淡出到一半的页面拉回来，不切页（见决策 32） |
| 切 tab 的高亮 | 只在「这一页已经显示出来」时被画，第一帧就不可能画错；拖动没了，也就没有残留要擦（见决策 30 / 32） |
| 切 tab 的整页闪烁 | 淡出 → `switchTab` → 淡入；`.page--out` 默认就在，框架提前亮出的那一帧是透明的（见决策 28） |
| 点了 tab 没反应 | 每次点击都现读当前路由，并且必然走到 `switchTab`；没有忙标志、没有记账，脱节最多吃掉一次点击（见决策 32） |
| 连着猛点几个 tab | 定时器被后一次覆盖，「后一次说了算」，不存在卡死（见决策 32） |
| 更新日志 | 页面只铺最近 3 条，更早的不展开，点「更早的版本记录」复制仓库地址（见决策 33） |
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
- **Light / dark theme**: light, dark, or follow system; one set of CSS variables reskins everything, charts included
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
- **`th:settings`** — `{ haptic, theme }` where `theme` is `light` / `dark` / `system`

~70 bytes per record; 1MB/key and 10MB total → 100,000+ records. Writes are wrapped in try/catch; quota errors throw `{ code: 'QUOTA_EXCEEDED' }`. Settings page shows a usage bar (≥70% yellow, ≥90% red) plus export / import / clear.

---

## 🧠 Design Decisions

1. **Dates are always `YYYY-MM-DD` strings** — `new Date('2026-09-11')` parses as UTC and falls back a day; parse manually into a local Date. Weeks start Monday.
2. **Single data gateway** — everything goes through `utils/storage.js` with an in-memory cache; read failures fall back to defaults, no white screens.
3. **Streak grace** — one-day grace if today has no check-in yet; not reset if yesterday has records.
4. **Stats aggregate counts only** — units differ, summing values across habits is meaningless.
5. **Canvas for charts, WXML for heatmap** — `qiun-charts` wraps resolution (device px), theme-derived defaults (factory to avoid shared nested arrays, see #26), touch normalization; all `extra.line/area/column/bar` required, and no instance without data.
6. **Sheet body is `scroll-view` + flex yield** — `flex: 1` plus `min-height: 0`; never hand-computed heights. The confirm button lives in the `flex-shrink: 0` header, so the bug loses its physical conditions. **The detour**: "confirm button missing" was blamed on `scroll-view` (said not to participate in flex shrinking), and switching to `view` + `overflow-y: auto` brought the button back — but on a real device the sheet would not scroll while the page behind it did. A plain `view`'s overflow scrolling rides on the WebView touchmove, which the mask's `catchtouchmove` swallows. The actual cause was the missing `min-height: 0` (flex items default to `min-height: auto`, so they can't shrink), unrelated to `scroll-view`. `scroll-view` scrolls natively, so the gesture never bubbles to the mask.
6.1 **A sheet covers at most 68% of the viewport height** — any taller and it becomes a full-screen page, hiding the background entirely and losing the "this is a layer on top" feel. `max-height: 68vh` also guarantees the body overflows: when the content *almost* fits, the scroll travel is a few dozen rpx, which reads as "it won't scroll" — the main cause of "the create-habit sheet won't scroll". `.sheet-body` carries an extra `max-height: 60vh` fallback: a `scroll-view` needs a definite height to scroll at all, and while the height flex resolves is usually honoured, it isn't worth the bet — if it isn't, the element is content-height and never scrolls.
7. **uCharts `width` / `height` are device px** — logical width shrinks graphics to the top-left 1/dpr.
8. **X-axis thinning can't stop the last label** — `xCategoryFormatter` truncates long habit names; don't set `xAxis.itemCount`.
9. **Floating button plus uses `.ic-plus-white`** — a blue plus on blue is no plus.
10. **The custom tabBar must live at the root, and its background cannot come from CSS variables** — the framework mounts it separately, outside the page's node tree, so it inherits nothing from `page`. Background, border and the selected capsule's fill are therefore fed as inline styles from JS (`utils/theme.js` → the tab bar's `syncTheme`). And since each tab page owns its own instance, a theme change doesn't reach the others on its own — so "switch selection" and "sync theme" are merged into one entry point, `setActive(index)`, which every page calls from `onShow`. Its shape is a **floating capsule at the bottom**, switched by tapping — see #30.
11. **Zero icon assets** — all inline base64 SVG. The price is that **icon colours are baked into the SVG and don't follow the theme**, so the light theme only uses neutral greys (`#6B7280`) that read on both dark and white, and the active state shares `#5B8CFF` across both themes with the adjacent text set to the same value so text and icon can't drift apart.
12. **Check-in only for today** — no date switcher; `blockedByReadonly()` ignores `data.readonly` and re-compares against the clock; caller dates clamped to today.
13. **canvas is a native component** — sheets can't cover it; toggle `display: none` via `hidden`, and recreate (not redraw) on show.
14. **Lock page scroll when a sheet opens** — `catchtouchmove` for touch, `page-meta` for wheel.
15. **`.mask` must be `position: fixed`** — no `transform` / `filter` / `perspective` / `will-change` on ancestors.
16. **A collapsed mask must be `display: none`** — `opacity: 0` / `visibility: hidden` is not enough: `input` / `textarea` / `switch` are native components drawn by the client above the WebView, and they only respect *presence in the render tree*, not paint-level properties. The stray "背单词" on the home screen was the habit-editor name field's placeholder. Components therefore use two-stage `mounted` / `active`: drop `--on` to play the exit animation, then drop `--mounted` 260ms later to unmount the subtree.
17. **A transition does not fire when `display` goes `none` → `flex`** — it needs `mounted` → `wx.nextTick` → `active` so the element first completes a real layout in its collapsed pose before the animation class lands.
18. **`switchTab` keeps pages mounted** — all three tab pages stay alive for the whole session and the DOM is never rebuilt. Two consequences the page transition leans on: the cross-fade has to be a `transition` driven by flipping one class, not `@keyframes` (an animation never replays on its own, and it outranks a transition on the same property, dragging in the whole `animation: none` workaround); and `onReady` fires exactly once, which is what makes it the right trigger for the *first* entrance (see #28). Animate `opacity` only, never `transform` (see #15).
19. **The home-screen "check in" button is a quick check-in** — it records once (`v = 1`, ignoring `habit.step`) with no sheet. The home screen is a "scan and tap" surface, where a sheet costs more than the action it wraps; use the detail page or the overview's "去打卡" for values and notes.
20. **Daily target and progress bars removed** — a check-in just records a count. `target` stays in the data model (omitted on edit submit so `saveHabit`'s merge preserves it) but **no UI consumes it any more**: the heatmap no longer takes a `target` either, scaling by the range's maximum instead, matching the home overview.
21. **Back-filling check-ins removed** — past days are **read-only**: the heatmap and history list still open the sheet, but it offers no date switcher and renders neither the entry fields nor the delete buttons, and `blockedByReadonly()` re-checks the clock once more. No write path ever existed, so all that remained was the "tap a date to back-fill" caption promising something the app wouldn't do. (The calendar is not on this list — it isn't even tappable; see #29.)
22. **Deleting a habit always confirms, with no toggle** — it cascade-deletes every check-in and cannot be undone; there's no sane "don't ask again" case, so `confirmDelete` is gone from `DEFAULT_SETTINGS` and both `onDeleteHabit` handlers prompt unconditionally. (An existing user's local copy of the key may survive; it is simply never read.)
23. **The heatmap covers the full history** — week count derives from the earliest record (floor 26, ceiling 260); in `scroll` mode columns have a fixed width and the initial `scroll-left` pins to today, then drag left to look back. `scroll-view`'s `scroll-left` is in px, not rpx. **The home overview and the detail page share one algorithm**: the detail page used to be pinned to 26 weeks, so anything older was never drawn and there was nothing to scroll back to.
24. **Range paging is bounded by "the next range hasn't happened yet"** — that is, `next.start > today`. The direction was inverted once on *each* of the stats and detail pages: the "previous" button did nothing, while "next" happily walked into the future. The old test was equivalent to "the range starts in the past", and the previous week / month / year *always* starts in the past — so paging backwards was blocked outright and paging forwards was unguarded. `canNext` (the greyed-out next arrow) and the tap handler must use the same predicate, or you get an arrow that looks live but does nothing — exactly what the detail page did (grey state tested `rangeInfo.end < today`, the tap handler tested something else). Both pages now share one `shiftedAnchor(delta)` returning `null` when out of bounds, with `canNext` reading `!!shiftedAnchor(1)`.
25. **Theming rewrites CSS variables rather than shipping two wxss sets** — the tokens under `page { … }` in `app.wxss` are the **dark defaults**; to go light, a page writes another set as an inline style on the `page` element via `<page-meta page-style="…">`. Inline styles outrank selector rules, and custom properties are inherited, so they reach every node and custom component in the page whatever its `styleIsolation`. Adding a theme therefore means adding a token table to `THEMES` in `utils/theme.js`. Two rules: ① `app.wxss` and `THEMES.dark` must match character for character (the former is the fallback and the only place that can carry comments); ② `page-style` **replaces** the attribute wholesale, so a page's existing `overflow: hidden` (sheet scroll lock) has to be concatenated after it.
26. **Three things don't follow the page variables and must be fed separately** — ① `custom-tab-bar` (see #10); ② canvas charts, whose colours live in the uCharts options object and travel through JS rather than CSS, so `qiun-charts` grew a `theme` property and `defaultOpts(themeName)` reads from **the same token table** — the component also has to observe `theme` on its own: when the theme changes, neither the data nor the `opts` property changes, so without the observer nothing redraws and the canvas keeps the previous palette; ③ `wx.setBackgroundColor` / `setBackgroundTextStyle` — `page`'s background covers only the page itself, while the strip revealed by pull-to-refresh and the iOS rubber-band overscroll belong to the window.
27. **"Follow system" depends on `"darkmode": true` in `app.json`** — that one flag decides two things at once: whether `wx.onThemeChange` is dispatched at all (base library 2.11.0+), and whether `wx.getAppBaseInfo().theme` has a value. Without it, `theme` is permanently `undefined` and `system()` in `utils/theme.js` falls all the way back to the default — so "follow system" quietly resolves to dark forever, indistinguishable from "this feature was never built". We hit exactly that: the flag was originally left off to keep the framework from taking over native control colours, which also turned follow-system off. The worry didn't hold anyway — the nav bar (`navigationStyle: custom`) and the tab bar (`tabBar.custom`) are both drawn by hand, so the framework had nothing to take over. Live switching comes from a single `wx.onThemeChange` registered in `app.js`: on a system switch it calls the top page's `syncTheme()`, which re-reads the system theme itself — deliberately ignoring the callback's `res.theme` so there is one source of truth rather than a choice between two values. Only the top page is repainted; the rest of the stack catches up in its own `onShow`. A `theme.json` additionally exposes the window background as `@windowBg` for `app.json`'s `window.backgroundColor` to reference, so the very first frame — and the frames after the reload that some Android devices trigger on a theme switch — are already correct.
28. **A tab switch is fade out → `switchTab` → fade in, driven by one boolean flipping two ways** — `fading` is the entire mechanism: `true` means "this page must be transparent". Dropping `.page--out` goes 0→1 (0.26s symmetric ease-in-out, entrance); adding it goes 1→0 (0.14s `ease-in`, exit). The two curves live in `.page--fade` / `.page--out` respectively, and **their order matters** — with both classes on the element the later one must win. Four attempts went into these points:
    - **There is exactly one invariant: a page that isn't showing must be transparent.** The framework raises the destination page at least one frame before its `onShow` runs, and that frame's opacity is not ours to decide — whatever it is, that is what the user sees. Hence ① `fading` defaults to `true` (a fresh instance is painted with `.page--out` on its very first frame), ② every tab page's `onHide` puts it back to `true`, and ③ the only exception is a switch, where fading out first is the whole point. Keep this and the frame the framework reveals is a transparent one, so what the user sees is a clean fade-in.
      Conversely, **never set it to `true` while the page is visible** — that presses a showing page to transparent, which is exactly the "whole page blinks out and back" symptom.
    - **A `transition`, never `@keyframes`.** Using an animation drags in three traps: an animation outranks a transition on the same property (so an exit that wants a `transition` must first cancel the animation with `animation: none`, or the page never fades down), `fill-mode: forwards` pins `opacity`, and since switchTab pages stay mounted and the DOM is never rebuilt a fixed `animation-name` never replays (hence two identical keyframe sets swapped by name, `pageFadeInA` / `pageFadeInB`, plus `fadeKey`). Now it comes down to whether one class is present.
    - **Two triggers: `onReady` for the first visit, `onShow` afterwards.** On a first visit `onShow` arrives before layout settles and the page is still doing its first round of heavy work (`onLoad` reading data, charts initialising); an animation stacked on top of that is the flash. `onReady` ("initial render complete") is the clean moment to start it. On a revisit the page is long since built, so `onShow` fades straight in. `pageFade` tells the two apart with a `_fadeReady` flag.
    - **Siblings of `.page` don't fade with it.** The home screen's floating "+" is a sibling and carries its own `.fab--out`. **It cannot just reuse `page--out`**: `.fab`'s own `transition` also covers `transform` (the press feedback), and the two shorthands overwrite each other — so both sides write their transitions out in full.
    **Three things must come as a set**: `page--fade` in the wxml, `show` in `onShow`, `leave` in `onHide`. Miss the `onHide` call and that page is no longer transparent the second time the framework raises it, which flashes. All five pages pair them today; only this rule enforces it.
    **No `transform`**: it would make `.page` the containing block for `position: fixed` descendants (see #15).
30. **The tab bar is a floating capsule, icons only, switching on tap and nothing else** — it floats above the content rather than occupying layout, so `.page`'s `padding-bottom` has to give its height back (152rpx + safe area = 20 gap + 108 capsule + 24 breathing room); change one and you must change the other, and the capsule's own height is set by `.tab`'s padding. **The drag is gone entirely, along with everything it dragged in** — there is no `.tab-pill` layer, no touch handlers, no `GEO`, no `instant`, no `followFinger`, no `_suppressTap`, no segment-width arithmetic in JS. What that machinery cost, and why deleting it was the fix, is the point:
    - **It existed for one requirement — the highlight tracking the finger *continuously*.** A per-`.tab` background can only jump segment to segment, so the movement needed its own layer positioned by JS. Take the requirement away and the whole apparatus is dead weight: **with tap-only switching, the highlight never has to travel at all**, because it is only ever painted on a page that is already showing.
    - **Its geometry had to be computed, not measured, and that was the root cause of the first-open flash** (see #32). `createSelectorQuery`'s callback cannot return before the **next frame**, so on frame one the capsule had no width and could not be painted at all. The workaround was to bake `SEG_RPX` / `PAD_RPX` / `BORDER_RPX` into `index.js` as constants that must match `index.wxss`, with `.tab` pinned to a fixed width so a variable-width segment couldn't desync the computed positions from the real ones — a "change one, change both" note in two files, forever. **All of that is gone now**, because nothing in JS computes a position.
    - **Touch events capture.** `touchmove` was bound to the whole capsule, and the event target stays whatever the `touchstart` landed on, so sliding onto a neighbouring `.tab` never fired *its* handler; the index had to be derived from the coordinate. And a `tap` could still follow a drag — when travel stayed inside the tap tolerance you got both `touchend` and `tap`, and that `tap` carried the segment the touch *started* on, switching the page back — which needed `_suppressTap`, whose invalidation moment was itself a bug (relying on "the tap will consume it" alone means that if the tap never arrives, the flag stays set and eats every later tap). **None of these problems can occur when the only input is `bindtap`.**
    - **What replaced it is one line of styling.** `.tab--on` puts the highlight on as an inline background, with `transition: background-color 0.18s ease` on `.tab` for the fade. `.tabbar` itself is unchanged (fixed, centred, rounded, `backdrop-filter`).
    `catchtouchmove` and `.tab:active` went with it: the capsule doesn't scroll, and the pressed-state dim was only removed because the drag left it disagreeing with the capsule.
31. **Haptics all go through the one "vibration" switch** — `storage.getSettings().haptic` + `wx.vibrateShort({ type: 'light', fail: () => {} })`, the same three lines used by the two check-in paths (home quick check-in, check-in sheet). Deliberately not extracted into a helper: three lines in two places, and pulling them out would mean cutting into two files that are already settled.
32. **The highlight "flicker" when switching tabs comes from one tabBar instance per page** — the symptom: switching from 习惯 to 统计, the highlight flashes onto 习惯 after the jump before settling on 统计; and it happens **unfailingly the first time each page is opened, then never again once every tab has been visited**. `custom-tab-bar` is mounted **once per page**, and each copy is only ever seen while *its own* page is showing — meaning the highlight it should display is always its own page's segment. Two things used to let it be painted with the wrong highlight, and both are now structurally impossible:
    - **The capsule's width on the first frame came from an async measurement, and its closed-form replacement was no better** (see the geometry bullet in #30). `createSelectorQuery`'s callback cannot return before the next frame, so on frame one the capsule was not painted at all and popped in once the measurement landed; computing the geometry instead traded that for a pair of constants that could silently drift from the stylesheet. **"It stops happening once you've tapped every tab" is the signature of the first cause.** With no moving layer there is nothing to measure, nothing to compute, and no gap. Both rounds of fixing this were paying interest on the drag.
    - **The highlight moved for instant feedback before the switch, and that state stayed behind in that instance.** The press used to slide the highlight to the target segment so the tap visibly registered; coming back to this page, that copy painted the target segment and was then pulled back. The restore lived in the **page's `onHide`**, and we got its moment wrong **twice**: it was first put in `switchTab`'s `complete`, where the highlight ended up **sliding back in front of the user**, reading as "it twitched and then recovered"; later it lived in `pageFade.hide` and was hoisted out when that machinery was deleted. `complete` typically fires while the old page is still on screen. **Any "clean up the leftovers" step has to pick a moment when the page is either already invisible or not yet visible — a `switchTab` callback is neither.** Nothing moves on tap now, so there is no leftover to restore. A fresh instance is still seeded from the **current route** in `attached` (top of `getCurrentPages()`, its `route` looked up in `list`), because it starts at `selected: 0` and the framework paints it before the page's own `onShow` can correct it.
    The two rest on the same sentence: **this instance is only seen while its own page is showing.** Equivalently, any state left on the instance after leaving is the first frame of the next visit.
    Separately, "the tab button switched but the page didn't": whether to switch used to be decided against bookkeeping (a cached `_live`), and any single desync with reality — a missed `onShow`, a rejected `switchTab`, a bad seeding moment in `attached` — made it answer "we're already there" **permanently**, so that tab stopped responding for the rest of the session. Now `commit()` **re-reads** the top route from `getCurrentPages()` (`routeIndex()`) and compares it against the target index: different → switch, same → do nothing (and if a fade-out was already under way, undo it). The predicate is always reality, so a desync can cost at most one tap and heals on the next one. When the route can't be identified it returns **-1 and is treated as "different"** — unknown must never count as "already here". The `_busy` lock and its 1200ms failsafe are gone too: a single pending timer means the last tap wins, there is no way to get stuck, and **every tap necessarily reaches `switchTab`** — which is the point of restoring the pre-capsule path.

33. **The changelog shows the latest 3 entries; older ones point at the repo** — the list exists to be skimmed, and a full one doesn't get read. `CHANGELOG` in `about.js` still records everything; the page renders `slice(0, CHANGELOG_LIMIT)` and adds a "更早的版本记录 ›" row when there's more. That row **deliberately does not expand** (it is not a "show all"): if the premise is "too many entries go unread", expanding puts the problem straight back. Tapping it **copies the repo URL**, the same way the developer section does — a mini program can't open external links (`web-view` only accepts business domains, which individual developers generally don't have), so this is the only shape any outbound link takes in this project.

29. **The calendar is a read-only overview with no tap target at all** — its only job is "which days this month have a check-in and which don't". The write entry point is the "打卡" button in the page header, and a single day's detail lives in the history list below. The cells used to carry `onCalDayTap`, so tapping today or a future day popped the check-in sheet — a panel that should have had no write path was acting as one. This also fixes a sign error: `monthCalendar` computed `isFuture: diff < 0`, but `diffDays(a, b)` returns `b - a`, so that `diff` is "date minus today" and **positive means future**. Inverted, every past day in the month was flagged as future — tapping yesterday said "还没到的日子" while tapping tomorrow opened the sheet, and the dimming style meant for future cells landed on historical dates instead. `scripts/test-utils.js` now pins "`isFuture` must equal a direct date comparison", deliberately with no clock-dependent assertion (which would go red on its own in a few months). The same cell's dim colour moved from `--surface-3` to `--text-3`: the former belongs to the background ramp and is near-white in the light theme, so on a white card it erased the date.

---

## 🛡️ Edge Cases

| Scenario | Handling |
| --- | --- |
| Delete habit | Cascade-delete records and report the count |
| Storage full | Catch quota errors, guide to "Storage" to back up and clean |
| Future date | Calendar dims the cell and ignores taps; heatmap blocks; sheet clamps to today and forbids writes |
| Calendar | Read-only overview, no tap target; pages back through months but never into the future (see #29) |
| Edit past check-in | Read-only; write entries not rendered and blocked in methods |
| Back-filling | Removed; no entry point or caption left |
| Period paging | Week / month / year can't page into the future; one shared predicate (see #24) |
| Theme switch | The dark tokens in `app.wxss` are the fallback, so even if `page-style` didn't apply the result is "no reskin", never a blank or transparent screen |
| Follow system | Repaints the moment the system switches; dropping `darkmode` from `app.json` degrades silently to "always dark" (see #27) |
| Tapping the current tab | Fades back in and switches nothing; an in-flight fade-out is cancelled rather than left half done (see #32) |
| Tab highlight | Only ever painted on a page that is already showing, so it can't be wrong on the first frame; drag removed, so there is no leftover state to restore (see #30 / #32) |
| Whole-page flash on switch | Fade out → `switchTab` → fade in, and `.page--out` defaults to on, so the frame the framework reveals before the new page's `onShow` is a transparent one (see #28) |
| A tab tap doing nothing | Every tap re-reads the real route and then necessarily reaches `switchTab`; no lock, no bookkeeping. A desync costs one tap at most (see #32) |
| Rapid tab taps | The pending timer is replaced, so the last tap wins; nothing can get stuck (see #32) |
| Changelog | The page renders the latest 3 entries only; older ones are not expanded — tapping "更早的版本记录" copies the repo URL (see #33) |
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