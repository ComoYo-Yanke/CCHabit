/**
 * uCharts 配置装配（从 index.js 抽出来，便于被 scripts/test-charts.js 直接测试）
 *
 * 之所以单独成文件：默认配置里少一个 `extra.column` 就会让柱状图整个抛错，
 * 这类问题必须在 Node 里能跑测试才守得住。
 *
 * 颜色一律从 utils/theme.js 取，不写字面量 —— 图表画在 canvas 上，读不到 CSS 变量，
 * 只能由 JS 喂；从同一份表里取色才能保证它和周围的卡片、文字属于同一套主题，
 * 不会出现「页面切成浅色了，图表还是深色底」。
 *
 * ⚠️ 取的是 **chartVars() 而不是 vars()**：uCharts 内部那个 hexToRgb() 只认 3 / 6 位
 * 十六进制，而且匹配失败时直接取下标、**抛 TypeError**（提示框的底色 / 描边、
 * 面积图的描边与填充、柱状的渐变都走它）。自定义主题的派生值只要带透明度就是
 * `rgba(...)`，用 vars() 喂进去的表现是「一换成自定义主题，点图表就没有小提示框了」。
 * chartVars 把带 alpha 的值按卡片底色压平成十六进制，同时保留原来的观感。
 */

const theme = require('../../utils/theme.js')

/**
 * 估算一段文字的像素宽度：中日韩字符按 1em、其余（数字 / 字母 / 标点）按 0.55em。
 *
 * 不能按字数估：时间轴的标签是「9/17」「10月」这类，一个数字只有半个字宽，
 * 按字数估会把明明放得下的「9/15」判成太长而截成「9/…」。
 */
function textWidth(str, fontSize) {
  let w = 0
  for (let i = 0; i < str.length; i++) {
    w += str.charCodeAt(i) > 0x2e80 ? fontSize : fontSize * 0.55
  }
  return w
}

/**
 * 柱状图 X 轴类别名收缩器（uCharts 的 xAxis.formatter 钩子）。
 *
 * 为什么需要它：uCharts 的抽稀逻辑（drawXAxis 内）把 categories 每隔 ratio 个留一个，
 * 但**最后一个永远强制保留**：
 *     newCategories[cgLength - 1] = categories[cgLength - 1]
 * 于是倒数第二个被保留的标签和它之间只隔 1 个 eachSpacing。习惯一多，
 * 一格只剩二十几 px，就会出现「冥想」直接压住「早睡早起打卡」。
 * 而且抽稀挡不住它 —— 最后那个标签不受 ratio 约束，抽得再狠也照样挨着画。
 *
 * 唯一的出路是让文字本身短到能塞进一格：按「一格能放多宽」把过长的名字截断。
 * 折线图的类别本来就是固定宽度的日期 / 月份，不参与收缩。
 *
 * @param {*} val   类别文本（抽稀掉的槽位会传空串）
 * @param {*} index 类别下标
 * @param {*} opts  uCharts 的完整配置，用它拿画布宽 / 内边距 / 一屏格数
 */
function xCategoryFormatter(val, index, opts) {
  if (!val || !opts) return val
  // 只收缩柱状 / 条形图：横向排列的类别名才需要抢宽度
  if (opts.type !== 'column' && opts.type !== 'bar') return val

  const cats = opts.categories || []
  if (cats.length < 2) return val
  const xAxis = opts.xAxis || {}
  if (xAxis.rotateLabel) return val // 斜着画不会横向撞，不用动

  // 量纲必须和 uCharts 内部一致：它是拿 opts.width 减 opts.area 算绘图区的，
  // 而 area 被 `padding[j] * opts.pix` 放大过，所以这里也用 area（而不是 padding），
  // 字号同样乘 pix。三个量都在设备 px 上，比值才是对的。
  const pix = opts.pix || 1
  const area = opts.area || [0, 0, 0, 0]
  const plotWidth = (opts.width || 0) - (area[1] || 0) - (area[3] || 0)
  if (plotWidth <= 0) return val

  // 一格有多宽：滚动模式下一屏只显示 itemCount 格，所以格子是「屏宽 / itemCount」，
  // 不是「屏宽 / 类目总数」—— 后者会把格子算窄 itemCount 倍，于是月视图的「10月」
  // 被判成放不下而截掉半个字。0.9 是留给 Y 轴占位和左右边界的余量。
  const slots = opts.enableScroll && xAxis.itemCount ? Math.min(xAxis.itemCount, cats.length) : cats.length
  const maxWidth = (plotWidth / slots) * 0.9
  const fontSize = (xAxis.fontSize || opts.fontSize || 10) * pix
  if (textWidth(val, fontSize) <= maxWidth) return val

  // 一个字一个字往回退，退到加上省略号也放得下为止。
  // 一个字都放不下时干脆不截：截成「…」比压着隔壁格子更没用。
  let cut = val.length - 1
  while (cut > 0 && textWidth(val.slice(0, cut) + '…', fontSize) > maxWidth) cut -= 1
  return cut > 0 ? val.slice(0, cut) + '…' : val
}

/**
 * 指定主题下的默认图表配置，可被页面传入的 opts 深度覆盖。
 *
 * 故意写成工厂函数而不是常量对象：uCharts 内部对 yAxis.data 之类的字段是浅拷贝，
 * 若多个图表实例共享同一份默认配置，一个图的数据会串到另一个图上。
 * 每次调用返回全新字面量，从根上杜绝这类别名 bug。
 *
 * ⚠️ extra 里的 line / area / column / bar 四类**必须都给全**：
 * uCharts 只在少数几处用 `assign({}, 局部默认, opts.extra.xxx)` 兜底，
 * 而 fixColumeData() 是直接读 `opts.extra.column.seriesGap` 的，
 * 缺了 extra.column 会抛 TypeError，柱状图直接白屏。
 *
 * @param {string} [themeName] 'dark' | 'light' | 'custom'，缺省走深色
 */
function defaultOpts(themeName) {
  const c = theme.chartVars(themeName)
  return {
    background: 'transparent',
    padding: [16, 16, 0, 8],
    fontSize: 11,
    fontColor: c.text2,
    legend: { show: false },
    dataLabel: false,
    dataPointShape: false,
    animation: true,
    duration: 600,
    // 让图表跟着主题走的**兜底**调色板：页面通常会给每个系列自己指定颜色
    // （见 utils/stats.js 的 lineChartData / barChartData），这里管的是没指定的情况。
    // 取语义色而不是写死一串，否则「自定义主题改成暖色调、图上还是一片蓝」。
    color: c.series,
    xAxis: {
      disableGrid: true,
      axisLine: false,
      fontColor: c.text3,
      fontSize: 10,
      scrollShow: false,
      rotateLabel: false,
      boundaryGap: 'center',
      // 类别名过长时自动截断，见 xCategoryFormatter 的注释。
      // 这里配在默认值里，页面不用（也无法）自己传函数：函数过不了 setData 的序列化。
      formatter: xCategoryFormatter
      // ⚠️ itemCount 是**滚动模式**下的单屏格数，只在 enableScroll:true 时由页面传
      // （时间轴那几张图，见 components/qiun-charts 的 scroll 属性）。
      // 不滚动时千万别配它：它会污染 uCharts 的抽稀算式
      //   maxXAxisListLength = ceil(categories.length / itemCount * labelCount) - 1
      // 让本该怎么抽的标签全挤在一起。不设置时 maxXAxisListLength 直接等于 labelCount，
      // 抽稀才是对的。
      // 时间轴那几张图同理也**不配 labelCount**：一屏本来就只有 6~10 格，
      // 每格的标签都放得下，再按 labelCount 抽一遍只会把「10月」抽掉一半。
    },
    yAxis: {
      gridType: 'dash',
      dashLength: 3,
      gridColor: c.grid,
      fontColor: c.text3,
      fontSize: 10,
      data: [{ min: 0 }],
      showTitle: false
    },
    extra: {
      line: {
        type: 'curve',
        width: 2,
        activeType: 'hollow',
        linearType: 'none',
        onShadow: false,
        animation: 'vertical'
      },
      area: {
        type: 'curve',
        opacity: 0.18,
        addLine: true,
        width: 1,
        gradient: false,
        activeType: 'none'
      },
      // 折线图的「点击高亮竖条」用的是 extra.column，不是 extra.line
      column: {
        type: 'group',
        width: 14,
        seriesGap: 2,
        categoryGap: 3,
        meterBorder: 4,
        // 不能用八位色值：uCharts 的 hexToRgb 只认 3 / 6 位，
        // 传 '#00000000' 会让它的正则匹配失败、rgb 为 null，再取 rgb[1] 直接抛错。
        // 「透明」一律用六位色值 + Opacity 表达。
        meterFillColor: c.grid,
        barBorderCircle: false,
        barBorderRadius: [],
        linearType: 'custom',
        linearOpacity: 0.9,
        customColor: [],
        colorStop: 0,
        labelPosition: 'outside',
        // 点击折线/柱状时的高亮竖条底色：六位黑色 + Opacity 0 = 完全透明。
        // hexToRgb 会在绘图时解析这个值，八位色值会让它抛错（见 meterFillColor 的注释），
        // 而且这条路径只在**点击图表时**才走到，所以表现为「一碰对比图就崩」。
        activeBgColor: '#000000',
        activeBgOpacity: 0
      },
      bar: {
        type: 'group',
        width: 14,
        seriesGap: 2,
        categoryGap: 3,
        linearType: 'custom',
        linearOpacity: 0.9,
        customColor: [],
        // 同上：必须是六位色值。透明度写在这里，别指望八位色值
        activeBgColor: '#000000',
        activeBgOpacity: 0
      },
      tooltip: {
        showBox: true,
        showArrow: false,
        showCategory: true,
        borderRadius: 10,
        borderWidth: 1,
        // 这三个（bgColor / borderColor）单独走 hexToRgb，必须是十六进制，
        // 见文件头那段注释 —— 它们就是「自定义主题下提示框不见了」的那一处
        borderColor: c.tooltipBorder,
        bgColor: c.tooltipBg,
        bgOpacity: 1,
        fontColor: c.text,
        labelFontColor: c.accent,
        gridColor: c.grid,
        dashLength: 3,
        boxPadding: 6,
        fontSize: 11,
        lineHeight: 18
      }
    }
  }
}

/** 简易深合并：数组直接覆盖，普通对象递归合并 */
function mergeDeep(target, source) {
  const out = Object.assign({}, target)
  if (!source) return out
  Object.keys(source).forEach((key) => {
    const sv = source[key]
    if (
      sv &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = mergeDeep(out[key], sv)
    } else {
      out[key] = sv
    }
  })
  return out
}

/**
 * 组装最终配置：主题默认值 <- 页面传入的 opts <- 运行时参数。
 * 分层覆盖，页面只需要写自己关心的那几项。
 *
 * @param {Object} pageOpts 页面级覆盖
 * @param {Object} runtime  运行时参数（尺寸 / series 等），优先级最高
 * @param {string} [themeName] 'dark' | 'light'
 */
function buildChartOpts(pageOpts, runtime, themeName) {
  return mergeDeep(mergeDeep(defaultOpts(themeName), pageOpts), runtime)
}

module.exports = {
  defaultOpts,
  mergeDeep,
  buildChartOpts,
  xCategoryFormatter
}
