/**
 * utils/theme.js —— 主题（深色 / 浅色 / 跟随系统）
 *
 * ============================ 实现方式 ============================
 *
 * 主题**不是**靠两套 wxss 实现的，而是靠 CSS 自定义属性：
 * app.wxss 里 `page` 选择器下那批变量是深色的默认值；切到浅色时，页面把
 * 另一组值通过 `<page-meta page-style="--bg:#F3F4F7;--surface:#FFF;…">`
 * 写成 page 元素的内联样式 —— 内联样式优先级高于选择器规则，而自定义属性是
 * **继承**属性，会一路传到页面内每个节点和自定义组件（不管 styleIsolation 是什么）。
 * 于是「新增一个主题」= 往 THEMES 里加一份变量表，而不是复制一遍 wxss。
 *
 * 「自定义」主题是第四种：它没有写死的变量表，而是由用户选的三个颜色
 * （背景 / 按钮 / 文字）**现算**出整套变量（见 buildCustom）。用户只改三处，
 * 其余按底色深浅推出的方向自动生成，语义色照抄现成的那两套。
 *
 * 有两处**不跟随** page 变量，必须单独处理，本模块同时是它们的取值来源：
 *   1. custom-tab-bar —— 由框架独立挂载，不在页面的节点树里（见其 wxss 顶部注释）；
 *   2. canvas 图表 —— 颜色写在 uCharts 的配置对象里，走 JS 而不是 CSS。
 * 前者用到底色 / 描边 / 选中态填充三个值，后者由 opts.js 读取同一份变量表装配。
 *
 * 本模块刻意保持「纯数据 + 纯函数」：唯一的运行期依赖是 storage.getSettings()，
 * 且 wx 缺失时（Node 里跑 scripts/*）自动退回默认主题，不影响脚本。
 * ==================================================================
 */

const storage = require('./storage.js')

/** 没有设置过、或设备不支持时的兜底主题 */
const DEFAULT_THEME = 'dark'

/**
 * 设置项可选值。'system' 不是一种配色，而是「每次进入页面时重新问一次系统」；
 * 'custom' 也不是一份写死的调色板，而是「由用户那三个颜色现算出来的一整套」。
 */
const OPTIONS = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
  { key: 'system', label: '跟随系统' },
  { key: 'custom', label: '自定义' }
]

/**
 * 两套调色板。键名与 app.wxss 中 `page { … }` 下的变量名**逐字对应**，
 * 少一个键就会让那一处退回深色默认值（内联样式只覆盖写出来的那几个）。
 *
 * 深色这套就是 app.wxss 里原本的值，照抄是为了「切到深色时和以前一模一样」。
 * 浅色这套的取色原则：
 *   - 层级方向要反过来：深色是「越靠上越亮」，浅色是「越靠上越白」，
 *     所以 surface 比 bg 更白，而不是更灰；
 *   - --text-3 直接取 #6B7280，和各种 idle 图标的烘焙色一致（图标是 base64 SVG，
 *     颜色写死在里面，不跟着主题变，取同色才不会出现两种灰）；
 *   - --accent 两套都保持 #5B8CFF：选中态的图标同样是烘焙色，
 *     文字和它并排显示，换色就会立刻露馅；
 *   - --warn / --danger / --success 在白底上要压深，否则对比度不够（#FFB020 在纯白上只有 1.9:1）；
 *   - 热力色阶的方向也要反过来：深色是「越高频越亮」，浅色是「越高频越深」。
 */
const THEMES = {
  dark: {
    '--bg': '#0E1014',
    '--surface': '#171B24',
    '--surface-2': '#1E232E',
    '--surface-3': '#262C38',
    '--border': '#262C38',
    '--border-soft': '#1F242F',

    // 卡片毛玻璃的模糊半径（见 .card）。深 / 浅色两套的卡片是不透明的，
    // 所以这个值看不出来，写 16px 只是为了三套主题形状一致 —— 和 --popup-* 同理
    '--card-blur': '16px',

    '--text': '#EDF1F7',
    '--text-2': '#98A2B3',
    '--text-3': '#667085',

    '--accent': '#5B8CFF',
    '--accent-soft': 'rgba(91, 140, 255, 0.16)',
    '--success': '#37D0A0',
    '--success-soft': 'rgba(55, 208, 160, 0.16)',
    '--warn': '#FFB020',
    '--warn-soft': 'rgba(255, 176, 32, 0.16)',
    '--danger': '#FF5C5C',
    '--danger-soft': 'rgba(255, 92, 92, 0.16)',

    '--heat-0': '#21262F',
    /* 「没打卡」那一格用的底色。**不能**就等于 --heat-0：卡片现在半透明，底下的彩光
       透上来，实色是拿「卡片当时是什么底色」猜的，玻璃上猜不准（浅色下已经糊成一片）。
       半透明的白落在任何底色上都还在，网格才看得出形状。自定义主题仍取 --heat-0 */
    '--heat-empty': 'rgba(255, 255, 255, 0.10)',
    '--heat-1': '#2B4A7A',
    '--heat-2': '#3A6FB8',
    '--heat-3': '#4F8CE0',
    '--heat-4': '#7FB2FF',

    /*
      下面这几个没法只靠上面的色值拼出来，直接存整段值：
        --grad-top   页面顶部那道光晕（渐变淡出到透明，必须存整段：
                     渐变里的 transparent 是按 premultiplied 插值的，
                     终点颜色要和起点同色系才不会在中间发灰）
        --grad-card-* 卡片自身的斜向渐变（分成起止两色，好让各处角度各自保留）
        --inset-bg   卡片内部再嵌一层的底色
        --ring       选中项的描边环（深色底上用白、浅色底上必须转成深色）
        --nav-bg     自定义导航栏滚动后的半透明底色
    */
    '--grad-top': 'linear-gradient(180deg, #161C2B 0%, rgba(14, 16, 20, 0) 100%)',
    '--grad-card-from': '#1B2334',
    '--grad-card-to': '#171B24',
    '--inset-bg': 'rgba(0, 0, 0, 0.18)',
    '--ring': 'rgba(255, 255, 255, 0.7)',
    '--nav-bg': 'rgba(14, 16, 20, 0.92)',

    /*
     * 弹层（.sheet）专用的那一套底色，多出来的一份是为了**自定义主题**：
     * 卡片那几层会跟着 surfaceAlpha 变透明，弹层却必须始终实心（理由见 buildCustom）。
     * 深 / 浅色这两套里 surfaceAlpha 恒为 100%，本来就不透明，
     * 所以这里逐个照抄上面那五个值 —— 多写一遍只是为了让三套主题的形状一致，
     * 改动落在同一个位置上，不用去记「哪几个变量只有自定义主题才有」。
     */
    '--popup-surface': '#171B24',
    '--popup-surface-2': '#1E232E',
    '--popup-surface-3': '#262C38',
    '--popup-border': '#262C38',
    '--popup-border-soft': '#1F242F',
    /*
     * 液态玻璃（1.3.0）。
     *
     * 这一组**只有浅色 / 深色两套有**，buildCustom 不返回这些键 ——
     * 而 app.wxss 的 page{} 里把它们的默认值写成了「改动前的原值」
     * （--glass-card: var(--surface) 等），所以自定义主题取到的就是原来的
     * --surface / --surface-2，一个像素都不变。加玻璃只加在这里，别加进 buildCustom。
     *
     * 全部是「描边 + 内高光 + 半透明渐变」，不用 backdrop-filter 做真模糊：
     * 卡片本来就带一层 blur，其余面层再叠模糊，滚动时的合成开销不划算。
     */
    '--glass-card': 'linear-gradient(150deg, rgba(255, 255, 255, 0.145) 0%, rgba(255, 255, 255, 0.048) 100%)',
    '--glass-soft': 'linear-gradient(150deg, rgba(255, 255, 255, 0.105) 0%, rgba(255, 255, 255, 0.035) 100%)',
    '--glass-seg-on': 'linear-gradient(150deg, rgba(255, 255, 255, 0.21) 0%, rgba(255, 255, 255, 0.085) 100%)',
    '--glass-accent': 'linear-gradient(155deg, rgba(122, 166, 255, 0.94) 0%, rgba(74, 120, 230, 0.78) 100%)',
    /* 强调色按钮自己那圈辉光（演示里 primary 按钮的投影是带色的）。
       单独一个 token 而不是并进 --glass-shadow：那是卡片 / 选项块共用的，
       带色的话每张卡都会泛起蓝光 */
    '--glass-accent-shadow': '0 12rpx 34rpx rgba(74, 120, 230, 0.42), inset 0 1rpx 0 rgba(255, 255, 255, 0.62), inset 0 1rpx 2rpx rgba(255, 255, 255, 0.28), inset 0 -1rpx 2rpx rgba(0, 0, 0, 0.18)',
    /* 弹层要压着表单和文字，留得比卡片实一些 —— 玻璃感靠描边和高光给，不靠透 */
    '--glass-sheet': 'linear-gradient(180deg, rgba(32, 38, 50, 0.94) 0%, rgba(23, 27, 36, 0.97) 100%)',
    '--glass-edge': 'rgba(255, 255, 255, 0.17)',
    /* 外投影 + 顶面那道内高光。「玻璃的厚度」全在这条里 —— 按钮、卡片、选项块共用，
       所以各处只写 box-shadow: var(--glass-shadow)，别在规则里另写死 rgba */
    '--glass-shadow': '0 16rpx 40rpx rgba(0, 0, 0, 0.46), 0 2rpx 6rpx rgba(0, 0, 0, 0.30), inset 0 1rpx 0 rgba(255, 255, 255, 0.22), inset 0 -1rpx 0 rgba(0, 0, 0, 0.24)',
    /* 凹进去的那几处（输入框、分段槽）反过来用内阴影 */
    '--glass-inset': 'inset 0 2rpx 6rpx rgba(0, 0, 0, 0.30)',
    /* 页面底色之上那层彩色辉光，画在 .page::before 上（见 app.wxss）——
       玻璃要「有东西可透」才成立，所以是四团大半径的光斑而不是一层薄雾。
       静态渐变、无动画、无 filter，WebView 一次绘制缓存，滚动不重绘。 */
    /* ⚠️ 深色这套**没有**开得比浅色更亮，不是手误：深色下卡片只加 14% 的白，
       光斑一高，卡片上的次要文字（--text-3 那一级）就掉到 3:1 以下。
       0.34 的蓝斑已经足够看清「卡片后面有颜色」，再高就是拿可读性换观感 */
    '--glass-ambient': 'radial-gradient(52% 30% at 12% 2%, rgba(91, 140, 255, 0.34) 0%, rgba(91, 140, 255, 0) 70%), radial-gradient(48% 28% at 98% 14%, rgba(168, 108, 255, 0.30) 0%, rgba(168, 108, 255, 0) 68%), radial-gradient(56% 32% at 78% 96%, rgba(43, 205, 178, 0.20) 0%, rgba(43, 205, 178, 0) 72%), radial-gradient(46% 26% at 2% 82%, rgba(255, 122, 182, 0.16) 0%, rgba(255, 122, 182, 0) 70%)',
    /* 主页那张 hero 卡的底色。比普通卡片亮一点 —— 它是首页最大的一块玻璃 */
    '--glass-overview': 'linear-gradient(150deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.062) 60%)',
    /* 按下时「玻璃被压一下」的缩放系数，1 = 不动 */
    '--glass-press': '1.06',
    /* 大块（整张卡片）不能用 1.06：全宽卡片放大 6% 会顶出屏幕左右边距 */
    '--glass-press-card': '0.99',
    /* 卡片毛玻璃的饱和度（.card 的 backdrop-filter）。彩色底要「透上来」才像玻璃，
       所以比默认的 140% 高一些 —— 那一档是自定义主题的（它的卡片也能半透明） */
    '--glass-sat': '180%',
    /* 开关「关着」那条轨道。原来是走 --glass-soft 的，浅色下那是一层半透明白，
       落在浅底上等于没画（用户反馈关闭状态看不清），所以关态单独一个 token */
    '--glass-track': 'linear-gradient(150deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.07) 100%)',
    '--glass-track-edge': 'rgba(255, 255, 255, 0.16)',
    /* 会滑动的那块玻璃把**身后的底色扭一下**（演示里 .liquid.pressing 的
       blur(44px) saturate(220%)）。这里取小值：它跟着动画每帧重算一层，
       44px 那个量级在低端机上就是掉帧 —— 观感和帧率之间取这份 */
    '--glass-warp': 'blur(9px) saturate(190%) brightness(1.06)',

    // 非 CSS 变量：只有 custom-tab-bar 用得到（它拿不到 page 的变量）
    // 底栏是悬浮胶囊，压在内容之上，所以底色留一点透明度让底下透出来才像「浮着」。
    // 这里**不做毛玻璃**：backdrop-filter 会让固定的底栏变成独立合成层，
    // 页面滚动后命中区域会脱节、点不动，见 custom-tab-bar/index.wxss
    tabbarBg: 'rgba(18, 22, 30, 0.80)',
    tabbarBorder: '#1F242F',
    /** 选中项那枚胶囊的填充色 */
    tabbarActiveBg: 'rgba(91, 140, 255, 0.22)',
    // 底栏图标是**现拼颜色**的（见 tabbarVars / iconUrl），不走 icons.wxss 里
    // 那份烘焙好的 base64。深 / 浅色两套取的就是那份烘焙用的两个值，
    // 所以这两套下的观感和以前逐像素一致，只有自定义主题才真的会变
    tabbarIcon: '#6B7280',
    tabbarIconActive: '#5B8CFF'
  },

  light: {
    '--bg': '#F3F4F7',
    '--surface': '#FFFFFF',
    '--surface-2': '#F1F2F5',
    '--surface-3': '#E5E7EB',
    '--border': '#E5E7EB',
    '--border-soft': '#ECEEF1',

    // 见深色那份的注释
    '--card-blur': '16px',

    '--text': '#12151C',
    '--text-2': '#4A5261',
    '--text-3': '#6B7280',

    '--accent': '#5B8CFF',
    '--accent-soft': 'rgba(91, 140, 255, 0.14)',
    '--success': '#12A97D',
    '--success-soft': 'rgba(18, 169, 125, 0.14)',
    '--warn': '#C77700',
    '--warn-soft': 'rgba(199, 119, 0, 0.14)',
    '--danger': '#E03E3E',
    '--danger-soft': 'rgba(224, 62, 62, 0.12)',

    '--heat-0': '#EBEDF1',
    // 见深色那份的注释。浅色比深色更需要它：--heat-0 那个 #EBEDF1 本来就是照
    // **不透明白卡**挑的，卡一变玻璃就整片糊掉，格子直接看不见
    '--heat-empty': 'rgba(18, 21, 28, 0.10)',
    /* 比原来深一档（#C3D8F8）：它是「打过一次」的那一级，落在半透明卡片上
       原本只剩 1.2:1，等于和没打卡分不出来 */
    '--heat-1': '#B6CEF0',
    '--heat-2': '#93B7F0',
    '--heat-3': '#5B8CFF',
    '--heat-4': '#2F5FD0',

    // 见深色那份的注释。浅色下这几处全部反过来：顶部光晕改成白色微光，
    // 嵌入层和描边环换成浅灰 / 深色，否则在白底上等于没画
    '--grad-top': 'linear-gradient(180deg, #FFFFFF 0%, rgba(243, 244, 247, 0) 100%)',
    '--grad-card-from': '#FFFFFF',
    '--grad-card-to': '#F7F8FA',
    '--inset-bg': 'rgba(0, 0, 0, 0.045)',
    '--ring': 'rgba(18, 21, 28, 0.55)',
    '--nav-bg': 'rgba(243, 244, 247, 0.92)',

    // 见深色那份的注释：照抄上面那五个，弹层在这两套主题下和以前逐像素一致
    '--popup-surface': '#FFFFFF',
    '--popup-surface-2': '#F1F2F5',
    '--popup-surface-3': '#E5E7EB',
    '--popup-border': '#E5E7EB',
    '--popup-border-soft': '#ECEEF1',
    /* 液态玻璃 —— 见深色那一套上面的长注释，两边成对，改一处要改两处 */
    '--glass-card': 'linear-gradient(150deg, rgba(255, 255, 255, 0.76) 0%, rgba(255, 255, 255, 0.44) 100%)',
    '--glass-soft': 'linear-gradient(150deg, rgba(255, 255, 255, 0.68) 0%, rgba(255, 255, 255, 0.36) 100%)',
    '--glass-seg-on': 'linear-gradient(150deg, #FFFFFF 0%, rgba(255, 255, 255, 0.68) 100%)',
    /* 比深色那套实：浅底上 0.78 的蓝已经淡到白字过不了 4.5:1 了 */
    '--glass-accent': 'linear-gradient(155deg, rgba(110, 155, 255, 0.98) 0%, rgba(64, 108, 220, 0.94) 100%)',
    '--glass-accent-shadow': '0 12rpx 30rpx rgba(64, 108, 220, 0.30), inset 0 1rpx 0 rgba(255, 255, 255, 0.72), inset 0 1rpx 2rpx rgba(255, 255, 255, 0.34), inset 0 -1rpx 2rpx rgba(0, 0, 0, 0.10)',
    '--glass-sheet': 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.99) 100%)',
    '--glass-edge': 'rgba(255, 255, 255, 0.95)',
    /* 见深色那份的注释：外投影 + 顶面内高光，玻璃的厚度都在这一条里 */
    '--glass-shadow': '0 16rpx 40rpx rgba(16, 24, 40, 0.13), 0 2rpx 6rpx rgba(16, 24, 40, 0.07), inset 0 1rpx 0 rgba(255, 255, 255, 0.98), inset 0 -1rpx 0 rgba(16, 24, 40, 0.05)',
    '--glass-inset': 'inset 0 2rpx 6rpx rgba(16, 24, 40, 0.07)',
    '--glass-ambient': 'radial-gradient(52% 30% at 12% 2%, rgba(91, 140, 255, 0.34) 0%, rgba(91, 140, 255, 0) 70%), radial-gradient(48% 28% at 98% 14%, rgba(168, 108, 255, 0.28) 0%, rgba(168, 108, 255, 0) 68%), radial-gradient(56% 32% at 78% 96%, rgba(43, 205, 178, 0.20) 0%, rgba(43, 205, 178, 0) 72%), radial-gradient(46% 26% at 2% 82%, rgba(255, 122, 182, 0.16) 0%, rgba(255, 122, 182, 0) 70%)',
    '--glass-overview': 'linear-gradient(150deg, rgba(255, 255, 255, 0.86) 0%, rgba(255, 255, 255, 0.48) 60%)',
    '--glass-press': '1.06',
    '--glass-press-card': '0.99',
    '--glass-sat': '180%',
    /* 见深色那份的注释。浅色的关态是**一整条实灰轨**（半透明白在这里不成立），
       边上一道白高光是玻璃的顶面；深色反过来，轨道本来就是浅的 */
    '--glass-track': 'linear-gradient(150deg, #CBD1DC 0%, #A9B2C2 100%)',
    '--glass-track-edge': 'rgba(255, 255, 255, 0.85)',
    '--glass-warp': 'blur(9px) saturate(190%) brightness(1.06)',

    tabbarBg: 'rgba(255, 255, 255, 0.78)',
    tabbarBorder: '#E5E7EB',
    tabbarActiveBg: 'rgba(91, 140, 255, 0.20)',
    // 见深色那份的注释：这两套都照抄图标原本的烘焙色，
    // 浅色下图标本来就是按「白底上也看得清」挑的中性灰
    tabbarIcon: '#6B7280',
    tabbarIconActive: '#5B8CFF'
  }
}

/**
 * 底栏那三枚图标的路径。
 *
 * 与 styles/icons.wxss 里 `ic-<name>-idle` / `ic-<name>-active` 画的是同一组线稿，
 * 但那边颜色是**烘焙**在 base64 里的，改不了。底栏偏偏两样都占：
 *   1. 它由框架独立挂载，拿不到 page 上的 CSS 变量，配色只能从 JS 喂；
 *   2. 自定义主题里主色是用户选的，图标再固定成 #5B8CFF 就会和选中胶囊打架。
 * 所以底栏这一处按颜色现拼一份。idle / active 两个类里的路径本来就是逐字相同的
 * （只有 stroke 不同），这里因此只留一份。
 *
 * 只服务底栏，不是「把图标改成动态的」那件事 —— 其余图标照旧烘焙（见 README 决策 11）。
 */
const TABBAR_ICON_PATHS = {
  home: '<path d="M3.5 10.6 12 3.4l8.5 7.2"/><path d="M5.6 9.6V20.6h12.8V9.6"/>',
  chart: '<path d="M4 20.5V13"/><path d="M10 20.5V4.2"/><path d="M16 20.5v-5.3"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.6 20.6c0-3.8 3.4-5.8 7.4-5.8s7.4 2 7.4 5.8"/>'
}

/**
 * 拼一枚图标的 background-image 值：内联 SVG，stroke 现填。
 * 用 URL 编码而不是 base64 —— 短得多，而且出问题时肉眼能看懂。
 * 认不出的名字返回空串，调用方不必先查表。
 */
function iconUrl(name, color) {
  const d = TABBAR_ICON_PATHS[name]
  if (!d) return ''
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
    color +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    d +
    '</svg>'
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
}

/**
 * 底栏要用的全部值（含三枚图标的两种状态）。
 *
 * 抽出来是为了让**底栏**和**自定义主题编辑页里那个胶囊预览**用同一份计算结果：
 * 底栏不在页面节点树里，整页换肤照不到它，编辑页靠 CSS 变量预览不到它 ——
 * 两边都只能走 JS，那就别各算各的。
 *
 * @param {Object} v theme.vars() 的结果
 */
function tabbarVars(v) {
  const icons = {}
  // 底色亮度统一算一次：胶囊的影子、滑块的高光都按它分两套
  const light = luminance(toRgb(v['--bg'], DEFAULT_CUSTOM.bg)) >= 0.5
  Object.keys(TABBAR_ICON_PATHS).forEach((name) => {
    icons[name] = {
      idle: iconUrl(name, v.tabbarIcon),
      on: iconUrl(name, v.tabbarIconActive)
    }
  })
  return {
    bg: v.tabbarBg,
    border: v.tabbarBorder,
    active: v.tabbarActiveBg,
    /**
     * 实心主色，给底栏里那枚「新建习惯」圆钮用。
     * 不能拿 active 顶替：active 是选中胶囊那层**半透明**的主色，圆钮是个按钮，
     * 半透明地浮在底栏上看着像「被选中的第四个 tab」。
     * 三套主题里 --accent 都是六位十六进制（自定义那套由用户调出来，也是 hex），
     * 所以直接透传即可，不必像 chartVars 那样压平 alpha。
     */
    accent: v['--accent'],
    /**
     * 胶囊的投影，**按底色亮度分两套**。
     *
     * 深色主题（和自定义主题里用户把底色调深）下，原先那个纯黑的影子落在深色页面上
     * 等于没有 —— 胶囊是浮在内容之上的，没了影子边界就糊进背景里，可见度掉一档。
     * 所以深底不用黑影，改成「淡白光晕」：靠边缘**亮**一圈把胶囊分出来，
     * 顺带把那条同样很淡的描边也接上（深底上 #1F242F 的描边对比度本来就只有一点点）。
     * 浅底维持原来的黑影，浮起来的感觉靠它。
     *
     * 判据和 themeStyle 那处一样：拿底色算亮度。--bg 在三套主题里都在，
     * 所以浅色 / 深色 / 自定义走的是同一条逻辑，不靠主题名去猜。
     */
    shadow: light
      ? '0 10rpx 30rpx rgba(0, 0, 0, 0.16), 0 2rpx 8rpx rgba(0, 0, 0, 0.1)'
      : '0 0 0 1rpx rgba(255, 255, 255, 0.12), 0 10rpx 30rpx rgba(0, 0, 0, 0.45), 0 2rpx 10rpx rgba(255, 255, 255, 0.06)',
    /*
     * 选中滑块（1.3.0）。滑块是胶囊里独立的一层，颜色同样只能由 JS 喂进来，
     * 所以这几个值也走这里 —— 和 shadow 一样按**底色亮度**分两套，
     * 自定义主题于是自动拿到正确的一套，不用去动 buildCustom。
     */
    pillBorder: light ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.14)',
    pillShadow: light
      ? 'inset 0 1rpx 0 rgba(255, 255, 255, 0.9), 0 4rpx 12rpx rgba(16, 24, 40, 0.10)'
      : 'inset 0 1rpx 0 rgba(255, 255, 255, 0.18), 0 4rpx 14rpx rgba(0, 0, 0, 0.35)',
    icons
  }
}

/** 只保留 -- 开头的项，tabbarBg 这类是给 JS 用的，不能混进 CSS 字符串 */
function cssKeys(name) {
  return Object.keys(vars(name)).filter((k) => k.indexOf('--') === 0)
}

// ---------------------------------------------------------------------------
// 自定义主题：三个颜色进，整套变量出
// ---------------------------------------------------------------------------

/**
 * 用户没改过时的初值，取的就是深色那套，所以「切到自定义」不会先跳一下。
 * 各项含义见 pages/theme-editor（那是唯一改这份配置的地方）：
 *   bg / surface / accent / text / text2  五个颜色，其余色值由它们推
 *   surfaceAlpha  卡片的透明度（%）—— 调低了背景图能透上来。弹层不吃这一项，
 *                 它始终实心（见 buildCustom 里 --popup-* 那段）
 *   cardBlur      卡片毛玻璃的模糊半径（px），0 = 不糊。它和 surfaceAlpha 是一对：
 *                 深 / 浅色两套里卡片本来就不透明，糊的是它自己已经盖住的底色，
 *                 所以只有自定义主题把卡片调透了，这个值才看得出来
 *   image         背景图本地路径，空串表示没有
 *   imageW/H      原图宽高（px，选图时问出来的）。**只用来算「铺满」要多大** ——
 *                 想选择显示范围就得把整张没裁过的图装进盒子，而那需要知道宽高比
 *   imageBlur     背景图模糊（px）
 *   imageDim      底色压在背景图上的强度（%），越高图越淡、字越清楚
 *   imagePosX/Y   取景位置（%）。图按「铺满」缩放后总有溢出的一边（横屏图在竖屏上
 *                 溢出的是左右，竖屏图在横屏上溢出的是上下），这两个值决定**露出来的是
 *                 哪一块** —— 也就是用户说的「框选范围」。50 / 50 就是居中，和这一版
 *                 之前的表现完全一致，所以没动过它的人观感不会变
 *   imageZoom     取景缩放（%），100 = 刚铺满。用来把图推近一点，配合上面两个值取更小的范围
 */
const DEFAULT_CUSTOM = {
  bg: '#0E1014',
  surface: '#171B24',
  accent: '#5B8CFF',
  text: '#EDF1F7',
  text2: '#98A2B3',
  surfaceAlpha: 100,
  cardBlur: 16,
  image: '',
  imageW: 0,
  imageH: 0,
  imageBlur: 0,
  imageDim: 60,
  imagePosX: 50,
  imagePosY: 50,
  imageZoom: 100
}

/** '#RRGGBB' / '#RGB' -> [r,g,b]；认不出来时退回 fallback（同样接受 hex 串） */
function toRgb(hex, fallback) {
  const s = String(hex || '').trim()
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s)
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s)
  if (m3) return [parseInt(m3[1] + m3[1], 16), parseInt(m3[2] + m3[2], 16), parseInt(m3[3] + m3[3], 16)]
  if (m6) return [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)]
  return fallback ? toRgb(fallback) : [0, 0, 0]
}

function hex(rgb) {
  return '#' + rgb.map((n) => ('0' + Math.round(Math.max(0, Math.min(255, n))).toString(16)).slice(-2)).join('').toUpperCase()
}

/** 两色按 t 混合，t=0 取 a、t=1 取 b */
function mix(a, b, t) {
  return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
}

/**
 * 拼一个带透明度的颜色。**必须同时接受 [r,g,b] 和 '#RRGGBB'**：
 * mix() 返回的是十六进制串，toRgb() 返回的是数组，而这两种值都会被喂进来。
 *
 * 这里踩过一次，而且是不声不响的那种：只认数组时，把 '#1F232C' 当成数组取下标，
 * 拿到的是 '#', '1', 'F' 三个字符，拼出来是 `rgba(#, 1, F, 1)` —— 一句**非法 CSS**。
 * 小程序不会报错，只会把这条声明丢掉，于是那些变量悄悄退回 app.wxss 里
 * page 选择器下的深色默认值。表现是自定义主题**只有一部分生效**：
 * 浅色底上卡片、分段控件还是深色，底栏胶囊明明已经是浅色的，描边却是一圈深灰 ——
 * 看着就像「加了个边框」。所以别再假设调用方传的是哪种，两种都收。
 */
function rgba(color, alpha) {
  const c = typeof color === 'string' ? toRgb(color) : color
  return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + alpha + ')'
}

/** 感知亮度 0~1，只用来判定「用户选的这个底色算深还是算浅」 */
function luminance(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
}

/**
 * 解析**本模块自己吐出去**的颜色串：'#RRGGBB' 或 'rgba(r, g, b, a)'。
 *
 * 和 toRgb 的分工要说清楚：toRgb 认的是**用户输入**（编辑页里那五个颜色，一定是 hex），
 * 这里认的是**变量表里的值**（可能是 hex，也可能是 rgba() —— 凡是跟透明度沾边的都是）。
 * 早先想直接拿 toRgb 处理后者，那是行不通的：它只认 hex，喂给它 'rgba(...)' 会**静默**
 * 返回黑色，而不是报错。
 *
 * @returns {{rgb:number[], a:number}} a 认不出来时按 1 算
 */
function parseColor(color) {
  const s = String(color || '').trim()
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s)
  if (m) {
    return {
      rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
      a: m[4] === undefined ? 1 : Number(m[4])
    }
  }
  return { rgb: toRgb(s), a: 1 }
}

/**
 * 把一个带透明度的颜色**压平**成六位十六进制：按 base 底色合成后的等效不透明色。
 *
 * 合成公式就是 mix(base, c, a) —— 颜色 c 以 alpha a 盖在 base 上，混出来的正是这个值。
 * 不认识 alpha 的场景（见 chartVars）需要一个确定的颜色，而「先丢掉 alpha 留 rgb」
 * 是错的：那不叫压平，叫把描边 / 网格线凭空加深，浅色主题上会突然冒出一堆深灰线。
 */
function flatten(color, baseRgb) {
  const c = parseColor(color)
  if (c.a >= 1) return hex(c.rgb)
  return mix(baseRgb, c.rgb, c.a)
}

/**
 * 给图表用的色值，**一律是六位十六进制**。
 *
 * 为什么不能直接把 vars() 丢给 uCharts：它内部有个 hexToRgb()，只认 3 / 6 位十六进制，
 * 而且匹配失败时不做任何校验 —— 直接 `rgb[1]`，喂进 'rgba(31, 35, 44, 1)' 会先 exec 出
 * null 再取下标，**抛 TypeError**。偏偏提示框的底色和描边（bgColor / borderColor）、
 * 面积图的描边与填充、柱状图的渐变全都走这条路。
 *
 * 深 / 浅色两套里这些值本来就都是十六进制，所以一直没暴露；自定义主题的派生值
 * 只要跟透明度沾边就是 rgba()，一换过去**提示框就整个画不出来** —— 不是颜色不对，
 * 是那一下直接抛错。（同样是「喂给外部库的值也要当输出校验」，见决策 34 那一串。）
 *
 * base 取卡片 / 弹层的实心底色（--popup-surface）：图表都画在卡片里，
 * 那个颜色才是网格线、次要文字真正的背板 —— 拿页面底色压平会偏一档。
 */
function chartVars(name) {
  const v = vars(name)
  const base = parseColor(v['--popup-surface']).rgb
  const solid = (c) => flatten(c, base)
  return {
    /**
     * 多系列时的兜底调色板（本项目的图表每种只有一个系列，且页面大多会自己指定颜色）。
     * 只取语义色，不自己造颜色：uCharts 取色是 `config.color[index % length]`，
     * 越界会绕回来，所以少给几个也不会崩。
     */
    series: ['--accent', '--success', '--warn', '--danger'].map((k) => solid(v[k])),
    text: solid(v['--text']),
    text2: solid(v['--text-2']),
    text3: solid(v['--text-3']),
    accent: solid(v['--accent']),
    /** 网格线 / 坐标轴描边 / 提示框描边 */
    grid: solid(v['--border']),
    /** 提示框底色：用实心的那层，不能跟着 surfaceAlpha 一起透，否则读数看不清 */
    tooltipBg: solid(v['--popup-surface']),
    tooltipBorder: solid(v['--border'])
  }
}

/**
 * 由用户那份配置现算出一整套变量。
 *
 * 用户能改的只有配置里那几项（见 DEFAULT_CUSTOM），其余全部按「深色 / 浅色」
 * 的方向推出来：
 *   - 先看底色的亮度决定方向。深色底是「越靠上越亮」，浅色底是「越靠上越白」，
 *     方向反了卡片就会陷进背景里；
 *   - 语义色（成功 / 警告 / 危险）和它们的浅底**不推算**，直接取现成两套里
 *     对应的那一套 —— 这几个值需要对比度保证，推出来的未必达标；
 *   - 热力色阶必须在两个方向上都反过来，否则高频格子会比低频格子还浅；
 *   - 卡片那几层的透明度跟着 surfaceAlpha 走：调低之后背景图能透上来，
 *     这也是「让背景图看得见」的唯一途径（页面的 --bg 始终不透明，
 *     背景图是画在它上面、内容下面的一层，见 components/app-bg）。
 */
function buildCustom(raw) {
  const cfg = Object.assign({}, DEFAULT_CUSTOM, raw || {})
  const bg = toRgb(cfg.bg, DEFAULT_CUSTOM.bg)
  const surface = toRgb(cfg.surface, DEFAULT_CUSTOM.surface)
  const accent = toRgb(cfg.accent, DEFAULT_CUSTOM.accent)
  const text = toRgb(cfg.text, DEFAULT_CUSTOM.text)
  const text2 = toRgb(cfg.text2, DEFAULT_CUSTOM.text2)
  const dark = luminance(bg) < 0.5
  const W = [255, 255, 255]
  const K = [0, 0, 0]
  const base = dark ? THEMES.dark : THEMES.light

  // 卡片那几层：用户选了底色，往上再分三级。深色往白里加、浅色往黑里加。
  //
  // 这几个系数是照着手调的深 / 浅色那两套**反推**出来的（见 THEMES 里的对应项），
  // 不是随手取的。最初按 0.06 / 0.12 / 0.2 取，出来的描边是 #454950，
  // 而深色主题手调的是 #262C38 —— 亮了一倍多，卡片全像被框了起来，
  // 底栏胶囊那条描边（走 lineSoft）同样显眼。
  // 浅色一侧还要再放大一点：同一个观感差，黑压在白底上比白浮在黑底上更「实」。
  const k = dark ? 1 : 1.3
  const step = dark ? W : K
  const sA = Math.max(0, Math.min(1, Number(cfg.surfaceAlpha) / 100))
  const surf = rgba(surface, sA)
  const surf2 = rgba(mix(surface, step, 0.035 * k), sA)
  const surf3 = rgba(mix(surface, step, 0.075 * k), sA)
  // 描边不能跟着一起变透明，否则卡片边界会先消失 —— 比卡片本身更实一点
  const line = rgba(mix(surface, step, 0.075 * k), Math.min(1, sA + 0.25))
  const lineSoft = rgba(mix(surface, step, 0.04 * k), Math.min(1, sA + 0.15))

  // 弹层（.sheet）那套底色**不跟 surfaceAlpha 走**，三套主题里都始终实心。
  //
  // 卡片变透明是**目的** —— 背景图只有这一条路能透上来（页面的 --bg 恒不透明，
  // 背景图是画在它上面、内容下面的一层，见 components/app-bg）。弹层变透明却
  // 什么也换不来：它底下垫着一层 60% 黑的遮罩，页面本来就一点看不见，
  // 透出来的只有遮罩的黑。于是同一个 sA 在弹层上的效果是**越透越暗**，
  // 面板上的正文和表单跟着一起糊 —— 拖这根滑块是为了调卡片，
  // 不该顺手把弹层里的字也调没。
  //
  // 顺带把整套 ramp 一起覆写（见 app.wxss 的 .sheet）：内侧那些块用的是
  // --surface-2 / --surface-3，不跟着实心的话，它们和面板本身都是同一个 sA，
  // 叠在同一个背板上差值会被 sA 直接压掉，层级糊成一片、分不出块。
  const pSurf = rgba(surface, 1)
  const pSurf2 = rgba(mix(surface, step, 0.035 * k), 1)
  const pSurf3 = rgba(mix(surface, step, 0.075 * k), 1)
  const pLine = rgba(mix(surface, step, 0.075 * k), 1)
  const pLineSoft = rgba(mix(surface, step, 0.04 * k), 1)

  // 三级文字：用户给两级，最淡的一级由次要文字再往底色退一点。
  // 往底色退的比例（0.24）比深 / 浅色那两套反推出来的（0.34）小一档：
  // 这一级管的是说明文字、单位、滑块读数，退太多在真机上就是「看得见但读不清」。
  // 用户改不了它（编辑页只给到次要文字那一级），所以偏暗只能在这里调。
  const text3 = mix(text2, bg, 0.24)

  // 热力色阶：0 是「没有记录」的格子（贴着底色），4 是最密的
  const heat0 = rgba(mix(surface, step, 0.045 * k), Math.max(sA, 0.5))
  const heat1 = mix(bg, accent, dark ? 0.34 : 0.22)
  const heat2 = mix(bg, accent, dark ? 0.54 : 0.45)
  const heat3 = mix(bg, accent, dark ? 0.76 : 0.68)
  const heat4 = dark ? mix(accent, W, 0.28) : mix(accent, K, 0.26)

  return {
    '--bg': cfg.bg,
    '--surface': surf,
    '--surface-2': surf2,
    '--surface-3': surf3,
    '--border': line,
    '--border-soft': lineSoft,

    // 卡片毛玻璃：用户直接调半径，不推算（它是观感项，不是配色项）。
    // 上限 40px 再往上就整块糊成一片纯色，还不如把卡片调实一点
    '--card-blur': clamp(cfg.cardBlur, 0, 40) + 'px',

    // 弹层那一套：同样的推导，只是不吃 sA（见上）
    '--popup-surface': pSurf,
    '--popup-surface-2': pSurf2,
    '--popup-surface-3': pSurf3,
    '--popup-border': pLine,
    '--popup-border-soft': pLineSoft,

    '--text': cfg.text,
    '--text-2': cfg.text2,
    '--text-3': text3,

    '--accent': cfg.accent,
    '--accent-soft': rgba(accent, dark ? 0.16 : 0.14),
    '--success': base['--success'],
    '--success-soft': base['--success-soft'],
    '--warn': base['--warn'],
    '--warn-soft': base['--warn-soft'],
    '--danger': base['--danger'],
    '--danger-soft': base['--danger-soft'],

    '--heat-0': heat0,
    '--heat-1': heat1,
    '--heat-2': heat2,
    '--heat-3': heat3,
    '--heat-4': heat4,

    // 顶部光晕的终点必须和起点同色系（渐变里的 transparent 是按预乘插值的），
    // 所以这里用 rgba(底色, 0) 而不是字面量 transparent。
    // 有背景图时这一层要收掉，否则图的上半截会被蒙住
    '--grad-top': cfg.image
      ? 'linear-gradient(180deg, ' + rgba(bg, 0.5) + ' 0%, ' + rgba(bg, 0) + ' 100%)'
      : 'linear-gradient(180deg, ' + (dark ? mix(bg, W, 0.05) : mix(bg, W, 0.9)) + ' 0%, ' + rgba(bg, 0) + ' 100%)',
    '--grad-card-from': dark ? rgba(mix(surface, W, 0.05), sA) : surf,
    '--grad-card-to': surf,
    '--inset-bg': dark ? 'rgba(0, 0, 0, 0.18)' : 'rgba(0, 0, 0, 0.045)',
    '--ring': dark ? 'rgba(255, 255, 255, 0.7)' : rgba(text, 0.55),
    '--nav-bg': rgba(bg, 0.92),

    // 底栏压在内容之上，透明度不跟 surfaceAlpha 走低：它下面就是内容，
    // 太透会看不清，所以给一个下限
    tabbarBg: rgba(surface, Math.max(0.86, sA)),
    tabbarBorder: lineSoft,
    tabbarActiveBg: rgba(accent, dark ? 0.18 : 0.14),
    // 图标跟主题走：置灰态用最淡的那级文字，选中态用用户选的主色 ——
    // 固定成 #5B8CFF 会和选中胶囊（填充就是主色）当场打架，这正是自定义主题下
    // 底栏最违和的一处
    tabbarIcon: text3,
    tabbarIconActive: cfg.accent
  }
}

/**
 * 自定义那套变量的缓存。
 * 配色没变就不重算 —— `vars()` 会被每个页面的 onShow、以及图表组件反复调到，
 * 每次都读一次 storage 再算三十来个色值没有意义。
 * 缓存键只看**会影响色值**的字段：背景图的路径、模糊、淡化不参与算色，
 * 那几个由 customConfig() 直接读，改了也不会让这里的缓存失效。
 */
let _customKey = ''
let _customVars = null

/** 读设置里的自定义配置，补齐缺省字段 */
function customConfig() {
  return Object.assign({}, DEFAULT_CUSTOM, storage.getSettings().customTheme || {})
}

/** 按当前配置算出整套变量（带缓存） */
function customVars() {
  const c = customConfig()
  // 进 key 的必须是**所有**会影响 buildCustom 输出的字段，漏一个就会命中旧缓存：
  // 滑块拖到新值、界面却还是上一个值的样子（cardBlur 就是这种，很容易漏）
  const key = [c.bg, c.surface, c.accent, c.text, c.text2, c.surfaceAlpha, c.cardBlur, c.image ? 1 : 0].join('|')
  if (key !== _customKey) {
    _customVars = buildCustom(c)
    _customKey = key
  }
  return _customVars
}

function clamp(n, lo, hi) {
  const v = Number(n)
  return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v))
}

/**
 * 背景图的基础放大倍数。
 *
 * 模糊（filter: blur）会让图四周溢出一圈半透明的边，图本身放大一点点把它推到屏幕外，
 * 靠 .app-bg 的 overflow: hidden 裁掉。1.08 是原 image + scale 那版就在用的值。
 */
const BLUR_BLEED = 1.08

/** 屏幕逻辑尺寸（px）。wx 缺失时（Node 里跑 scripts/*）给 0，由调用方走降级分支 */
function viewSize() {
  if (typeof wx === 'undefined' || typeof wx.getWindowInfo !== 'function') return { width: 0, height: 0 }
  try {
    const w = wx.getWindowInfo()
    return { width: w.windowWidth || 0, height: w.windowHeight || 0 }
  } catch (e) {
    return { width: 0, height: 0 }
  }
}

/**
 * 背景图那一层的**几何**：图放多大、摆在哪儿。
 *
 * 为什么不能简单让 `<image mode="aspectFill">` 铺满整屏：那样图会被**居中裁切**，
 * 露出来的永远是正中那一块。裁切在元素自己绘制的这一步就发生了，之后无论怎么
 * translate / scale 都只是搬动、放大那块已经裁好的图 —— 横屏图的两侧永远看不到。
 * 想「选择显示范围」，元素里就必须装着**整张没裁过的图**，再靠外层裁出要看的那一段。
 * 而「整张图」装进一个盒子，前提是知道图的宽高比 —— 于是尺寸得存在配置里
 * （imageW / imageH，选图时用 wx.getImageInfo 问出来）。
 *
 * ⚠️ 不能改用 background-image + background-size: cover 那套写法（那样一行 CSS 就能
 * 盖住并取景，根本不用算）：**小程序里 background-image 不认 wxfile:// 这类本地路径**，
 * 行内 style 也照样不认（WXSS 的 url() 是编译期解析的），真机上就是一片空白。
 * 这条踩过一次就够，别走回头路。
 *
 * 尺寸未知时（老配置里的图，或导入来的）退回「铺满 + 居中」：和这一版之前的表现一致，
 * 宁可不给取景，也不能拿猜的比例去拉图（猜错就是拉伸或留白，而且说不清是谁的错）。
 */
function bgLayer(c) {
  const blur = clamp(c.imageBlur, 0, 40)
  // 模糊写在图自己身上（不能写在外层，否则压在图上的那层底色也跟着糊）
  const filter = 'filter: blur(' + blur + 'px); -webkit-filter: blur(' + blur + 'px)'

  const view = viewSize()
  const iw = Number(c.imageW) || 0
  const ih = Number(c.imageH) || 0
  if (!iw || !ih || !view.width || !view.height) {
    return {
      mode: 'aspectFill',
      style: 'left: 0; top: 0; width: 100%; height: 100%; ' + filter
    }
  }

  // 「铺满」= 两个方向上都要至少盖住屏幕，取较大的那个倍数；用户的缩放乘在它上面。
  // 于是总有**且只有一边**溢出（横屏图溢出左右、竖屏图溢出上下），溢出的那条边就是
  // 取景的可用行程，另一边只能是 0 —— 所以 50% 永远等于居中。
  const zoom = clamp(c.imageZoom, 100, 300) / 100
  const s = Math.max(view.width / iw, view.height / ih) * zoom * BLUR_BLEED
  const boxW = iw * s
  const boxH = ih * s
  const ox = Math.max(0, boxW - view.width)
  const oy = Math.max(0, boxH - view.height)

  // 盒子的宽高比 = 原图宽高比，所以 mode 用 scaleToFill 也不会变形 ——
  // 它就是「把整张图原样画进这个盒子」，裁切留给外层。
  return {
    mode: 'scaleToFill',
    style:
      'left: ' + (-ox * clamp(c.imagePosX, 0, 100) / 100).toFixed(1) + 'px; ' +
      'top: ' + (-oy * clamp(c.imagePosY, 0, 100) / 100).toFixed(1) + 'px; ' +
      'width: ' + boxW.toFixed(1) + 'px; ' +
      'height: ' + boxH.toFixed(1) + 'px; ' + filter
  }
}

/**
 * 取景台：编辑页里那套「整张图摊开 + 一个屏幕比例的小窗」的几何。
 *
 * 为什么要有它：两个位置滑块只能表达「往左一点」，说不出「露出来的是哪一块」。
 * 这里把整张图按原比例摊开当舞台，再盖一个**屏幕比例**的小窗 —— 窗里就是最终会
 * 显示的那一块，窗外压暗加糊表示看不到。小窗能拖（改 imagePosX / imagePosY）、
 * 能缩（改 imageZoom），于是取景变成「挪窗子」而不是「调三个数」。
 *
 * ⚠️ 它和 bgLayer 必须给出同一个答案，否则编辑页就是在骗人。两者吃同一份配置，
 * 只是各算各的那一半：bgLayer 算「图要放大到多大、摆在屏幕哪儿」，frame 算
 * 「铺满时露出来的是图上哪一块」。小窗的宽高比 = 屏幕宽高比，所以窗里看到的
 * 逐像素等于真机上看到的 —— 这不是巧合，是那个「最大内接矩形」的定义。
 * （唯一的差是真实那层多乘了一个 BLUR_BLEED 出血，所以真机上会比你框的稍微多露
 * 一点点；那是防模糊露边用的，不是这里算错。）
 *
 * 返回值全是**百分比**，因为舞台的尺寸交给 CSS 撑（padding-bottom 写成原图宽高比），
 * 于是整个取景台不需要量 DOM 就能画出来：
 *   pad      舞台高度，直接当 padding-bottom 的百分比用（= 原图高 / 宽）
 *   outBlur  窗外那层额外的模糊（px），叠在用户设的 imageBlur 之上
 *   win      小窗在舞台里的位置与大小。left / width 是舞台**宽**的百分比，
 *            top / height 是舞台**高**的百分比（CSS 的百分比偏移就是这么解析的）
 *   inner    窗里那张图的位置与大小，相对**小窗**自身 —— 靠负偏移把该露的那一格挪进窗子
 *
 * 拿不到原图宽高（老配置还没问出来）时返回 null，编辑页不画取景台、只留滑块：
 * 没有宽高比，任何一格都算不出来。
 */
function frame(c) {
  const cfg = Object.assign({}, DEFAULT_CUSTOM, c || {})
  const iw = Number(cfg.imageW) || 0
  const ih = Number(cfg.imageH) || 0
  if (!iw || !ih) return null

  const view = viewSize()
  // 屏幕宽高比。量不到时按 1:2 走：这一页只跑在真机上，这里只要别算出 0 或负数，
  // 让 Node 里跑 scripts/* 的那点调用不至于炸就行
  const r = view.width && view.height ? view.width / view.height : 0.5

  // 小窗最大能多大 = 图里能装下的最大的屏幕比例矩形。这一步和 bgLayer 里
  // `Math.max(view.width / iw, view.height / ih)` 是同一件事的两面：
  // 那边问「图要放大几倍才铺满屏幕」，这边问「铺满时屏幕上露出来的是图上的哪块」
  const maxW = Math.min(iw, ih * r)
  const maxH = maxW / r
  const zoom = clamp(cfg.imageZoom, 100, 300) / 100
  const winW = maxW / zoom
  const winH = maxH / zoom

  // 舞台：整张图。宽取 100 个单位、高按原图比例折算，于是舞台自身也是一个
  // 「原图比例」的盒子，图 mode 用 scaleToFill 铺进去不会变形
  const SW = 100
  const SH = 100 * ih / iw

  // 小窗能挪的行程 = 溢出舞台的那部分。只有一边会有（横屏图溢左右、竖屏图溢上下），
  // 另一边恒为 0，所以 50% 永远等于居中；和 bgLayer 的 ox / oy 是同一个量
  const ox = Math.max(0, iw - winW)
  const oy = Math.max(0, ih - winH)
  const left = ox * clamp(cfg.imagePosX, 0, 100) / 100 / iw * SW
  const top = oy * clamp(cfg.imagePosY, 0, 100) / 100 / ih * SH
  const ww = winW / iw * SW
  const wh = winH / ih * SH

  const pct = (n) => Number(n.toFixed(3))
  return {
    pad: pct(SH),
    // 窗外比窗内多糊一档：窗里是「会显示的那块」，窗外只是给眼睛一个「这块不要」的印象
    outBlur: clamp(cfg.imageBlur, 0, 40) + 8,
    win: {
      left: pct(left / SW * 100),
      top: pct(top / SH * 100),
      width: pct(ww / SW * 100),
      height: pct(wh / SH * 100)
    },
    inner: {
      left: pct(-left / ww * 100),
      top: pct(-top / wh * 100),
      width: pct(SW / ww * 100),
      height: pct(SH / wh * 100)
    }
  }
}

/**
 * 用一份**还没落盘**的配置算出渲染要用的东西，不读 storage。
 * 「自定义主题」编辑页靠它做实时预览：滑块还在拖的时候配置还没存，
 * 但页面得立刻跟着变。
 *
 * @returns {{style:string, bg:Object|null, frame:Object|null, tabbar:Object}}
 *   style  可直接塞进 page-style；
 *   bg     给背景图层，没设图时为 null。`style` / `mode` 一并给全：**编辑页的预览层和
 *          各页面上的真实图层用的是同一份**，两边不各算各的，也就不会「预览里对、真机上偏」
 *   frame  取景台的几何（见 frame）。没图或尺寸未知时为 null，编辑页据此决定画不画
 *   tabbar 底栏胶囊那几项 —— 它不在页面节点树里，上面那份 style 照不到它，
 *          所以单独给出来（编辑页的胶囊预览要用，见 tabbarVars）
 */
function preview(cfg) {
  const c = Object.assign({}, DEFAULT_CUSTOM, cfg || {})
  const vars = buildCustom(c)
  const style = Object.keys(vars)
    .filter((k) => k.indexOf('--') === 0)
    .map((k) => k + ':' + vars[k])
    .join(';')
  const layer = c.image ? bgLayer(c) : null
  const bg = layer
    ? {
      src: c.image,
      mode: layer.mode,
      style: layer.style,
      // 压在图上的是**底色**：dim 越高图越淡、字越清楚
      scrim: rgba(toRgb(c.bg, DEFAULT_CUSTOM.bg), clamp(c.imageDim, 0, 100) / 100)
    }
    : null
  return { style, bg, frame: frame(c), tabbar: tabbarVars(vars) }
}

/**
 * 背景图那一层要用的值（components/app-bg 读它）。
 * 做成一个组件而不是写进每个页面：五张页面都要有这层，复制五遍迟早漏一处。
 * 不是自定义主题时返回 null —— 深色 / 浅色两套本来就没有背景图。
 */
function background() {
  if (storage.getSettings().theme !== 'custom') return null
  return preview(customConfig()).bg
}

/**
 * 取某套主题的变量表（含 tabbar* 这类非 CSS 项）。
 * 传入未知主题名时退回默认主题，保证永远有值可用。
 */
function vars(name) {
  if (name === 'custom') return customVars()
  return THEMES[name] || THEMES[DEFAULT_THEME]
}

/**
 * 拼成可以直接塞进 page-style / style 属性的字符串。
 * `page-style` 是同名属性整体覆盖，所以调用方若还要写别的声明（例如弹层打开时的
 * overflow: hidden），得自己拼在后面 —— 见各页面的 themeStyle()。
 */
function cssVars(name) {
  const v = vars(name)
  return cssKeys(name)
    .map((k) => k + ':' + v[k])
    .join(';')
}

/**
 * 当前系统主题。设备不支持（或跑在 Node 里）时返回默认主题。
 *
 * ⚠️ `theme` 这个字段**只有在 app.json 里配了 `"darkmode": true` 时才会返回**。
 * 少了那行配置，它恒为 undefined，这里就会一路退回 DEFAULT_THEME ——
 * 表现是「跟随系统」安静地永远等于深色，看着像功能根本没做。
 * 所以 app.json 里那一行是这个功能的前提，不是可选装饰。
 *
 * 实时性由 app.js 的 wx.onThemeChange 负责：系统一切换就调栈顶页面的 syncTheme()，
 * 后者再走回这里读一次。这样「系统主题」始终只有一个来源，
 * 不必在事件参数和同步读取之间挑一个信。
 */
function system() {
  if (typeof wx === 'undefined') return DEFAULT_THEME
  try {
    // theme 现在挂在 getAppBaseInfo 上，老基础库只有 getSystemInfoSync
    const info = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    return info && info.theme === 'light' ? 'light' : DEFAULT_THEME
  } catch (e) {
    return DEFAULT_THEME
  }
}

/**
 * 把设置值解析成真正要用的主题名。
 * @param {string} setting 'light' | 'dark' | 'system'，其余值当作跟随系统
 * @param {string} [sys]   已取到的系统主题，省一次 getSystemInfoSync
 */
function resolve(setting, sys) {
  // 'custom' 和明确的浅 / 深色一样，是「已经定了」，不需要再问系统
  if (setting === 'light' || setting === 'dark' || setting === 'custom') return setting
  return sys || system()
}

/**
 * 读设置并解析出当前该用的主题名。
 *
 * 刻意不写成 `resolve(getSettings().theme, system())`：那样即使设置是明确的
 * 浅色 / 深色，也会先把 system() 求值一遍，凭空多一次 getSystemInfoSync ——
 * 这是个同步阻塞的桥调用，而 current() 每个页面 onShow 都要走一次。
 */
function current() {
  const setting = storage.getSettings().theme
  if (setting === 'light' || setting === 'dark' || setting === 'custom') return setting
  return system()
}

/** 设置项的中文名，用于「当前：跟随系统（深色）」这类文案 */
function labelOf(setting) {
  const hit = OPTIONS.filter((o) => o.key === setting)[0]
  return hit ? hit.label : OPTIONS[OPTIONS.length - 1].label
}

/**
 * 这套主题算不算「亮底」。
 * 'light' / 'dark' 看名字，'custom' 只能看用户选的那个底色的亮度 ——
 * 下拉刷新圆点、窗口背景文字这些没有 CSS 变量的地方要用它做二选一。
 */
function themeIsLight(name) {
  if (name === 'custom') {
    return luminance(toRgb(vars('custom')['--bg'], DEFAULT_CUSTOM.bg)) >= 0.5
  }
  return name === 'light'
}

/** 上一次设过窗口背景的主题，避免每次 onShow 都重复发两个桥调用 */
let _appliedWindow = ''

/**
 * 让页面外的区域也跟着换色。
 *
 * page 的 background 只覆盖页面本身，下拉刷新时露出来的那截、以及 iOS 上
 * 橡皮筋回弹露出的底色，属于窗口背景，只能用 wx.setBackgroundColor 改。
 * 下拉刷新的三个小圆点同理，用 setBackgroundTextStyle 切成深/浅。
 *
 * 幂等：主题没变就什么都不做（两个都是同步桥调用，页面每次 onShow 都会经过这里）。
 */
function applyWindow(name) {
  if (typeof wx === 'undefined') return
  const v = vars(name)
  // 缓存键要带上底色本身，不能只用主题名：自定义主题的名字永远是 'custom'，
  // 但用户改一次背景色就是换了一次色，只用名字当键会永远不再下发
  const key = name + '|' + v['--bg']
  if (_appliedWindow === key) return
  try {
    wx.setBackgroundColor({
      backgroundColor: v['--bg'],
      backgroundColorTop: v['--bg'],
      backgroundColorBottom: v['--bg']
    })
    wx.setBackgroundTextStyle({ textStyle: themeIsLight(name) ? 'dark' : 'light' })
    _appliedWindow = key
  } catch (e) {
    // 低版本基础库没有这两个接口，忽略即可，不影响主题本身。
    // 不记缓存：记了就等于宣称已经设过，万一接口是后补上的，会一直不再尝试
  }
}

module.exports = {
  DEFAULT_THEME,
  DEFAULT_CUSTOM,
  OPTIONS,
  THEMES,
  themeIsLight,
  customConfig,
  background,
  preview,
  // 拖动取景小窗时只推它，不重算整套配色（见 theme-editor 的 dragApply）
  frame,
  tabbarVars,
  chartVars,
  vars,
  cssVars,
  system,
  resolve,
  current,
  labelOf,
  applyWindow
}
