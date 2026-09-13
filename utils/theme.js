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
 * 有两处**不跟随** page 变量，必须单独处理，本模块同时是它们的取值来源：
 *   1. custom-tab-bar —— 由框架独立挂载，不在页面的节点树里（见其 wxss 顶部注释）；
 *   2. canvas 图表 —— 颜色写在 uCharts 的配置对象里，走 JS 而不是 CSS。
 * 前者只用到底色/描边，后者由 opts.js 读取同一份变量表装配。
 *
 * 本模块刻意保持「纯数据 + 纯函数」：唯一的运行期依赖是 storage.getSettings()，
 * 且 wx 缺失时（Node 里跑 scripts/*）自动退回默认主题，不影响脚本。
 * ==================================================================
 */

const storage = require('./storage.js')

/** 没有设置过、或设备不支持时的兜底主题 */
const DEFAULT_THEME = 'dark'

/**
 * 设置项可选值。'system' 不是一种配色，而是「每次进入页面时重新问一次系统」。
 */
const OPTIONS = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
  { key: 'system', label: '跟随系统' }
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

    // 非 CSS 变量：只有 custom-tab-bar 用得到（它拿不到 page 的变量）
    tabbarBg: '#161A22',
    tabbarBorder: '#1F242F'
  },

  light: {
    '--bg': '#F3F4F7',
    '--surface': '#FFFFFF',
    '--surface-2': '#F1F2F5',
    '--surface-3': '#E5E7EB',
    '--border': '#E5E7EB',
    '--border-soft': '#ECEEF1',

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
    '--heat-1': '#C3D8F8',
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

    tabbarBg: '#FFFFFF',
    tabbarBorder: '#E5E7EB'
  }
}

/** 只保留 -- 开头的项，tabbarBg 这类是给 JS 用的，不能混进 CSS 字符串 */
function cssKeys(name) {
  return Object.keys(vars(name)).filter((k) => k.indexOf('--') === 0)
}

/**
 * 取某套主题的变量表（含 tabbar* 这类非 CSS 项）。
 * 传入未知主题名时退回默认主题，保证永远有值可用。
 */
function vars(name) {
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
  if (setting === 'light' || setting === 'dark') return setting
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
  if (setting === 'light' || setting === 'dark') return setting
  return system()
}

/** 设置项的中文名，用于「当前：跟随系统（深色）」这类文案 */
function labelOf(setting) {
  const hit = OPTIONS.filter((o) => o.key === setting)[0]
  return hit ? hit.label : OPTIONS[OPTIONS.length - 1].label
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
  if (typeof wx === 'undefined' || _appliedWindow === name) return
  const v = vars(name)
  try {
    wx.setBackgroundColor({
      backgroundColor: v['--bg'],
      backgroundColorTop: v['--bg'],
      backgroundColorBottom: v['--bg']
    })
    wx.setBackgroundTextStyle({ textStyle: name === 'light' ? 'dark' : 'light' })
    _appliedWindow = name
  } catch (e) {
    // 低版本基础库没有这两个接口，忽略即可，不影响主题本身。
    // 不记缓存：记了就等于宣称已经设过，万一接口是后补上的，会一直不再尝试
  }
}

module.exports = {
  DEFAULT_THEME,
  OPTIONS,
  THEMES,
  vars,
  cssVars,
  system,
  resolve,
  current,
  labelOf,
  applyWindow
}
