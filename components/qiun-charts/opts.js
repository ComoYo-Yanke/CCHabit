/**
 * uCharts 配置装配（从 index.js 抽出来，便于被 scripts/test-charts.js 直接测试）
 *
 * 之所以单独成文件：默认配置里少一个 `extra.column` 就会让柱状图整个抛错，
 * 这类问题必须在 Node 里能跑测试才守得住。
 */

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
 * 唯一的出路是让文字本身短到能塞进一格：按「一格能放几个字」把过长的名字截断。
 * 折线图的类别是日期 / 月份，本来就是固定宽度，不参与收缩。
 *
 * @param {*} val   类别文本（抽稀掉的槽位会传空串）
 * @param {*} index 类别下标
 * @param {*} opts  uCharts 的完整配置，用它拿画布宽 / 内边距 / 类目数
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

  const fontSize = (xAxis.fontSize || opts.fontSize || 10) * pix
  // 一格 = 一个类别的横向宽度。0.9 是留给 Y 轴占位和左右边界的余量，
  // 中文按 1em 估宽（比实际略宽，宁可截短也不要压字）。
  const maxChars = Math.floor(((plotWidth / cats.length) * 0.9) / fontSize)
  if (maxChars >= 2 && val.length > maxChars) {
    // 截到 maxChars-1 再补省略号，总宽 ≈ maxChars - 0.5 字，仍在一格之内
    return val.slice(0, maxChars - 1) + '…'
  }
  return val
}

/**
 * 暗色主题下的默认图表配置，可被页面传入的 opts 深度覆盖。
 *
 * 故意写成工厂函数而不是常量对象：uCharts 内部对 yAxis.data 之类的字段是浅拷贝，
 * 若多个图表实例共享同一份默认配置，一个图的数据会串到另一个图上。
 * 每次调用返回全新字面量，从根上杜绝这类别名 bug。
 *
 * ⚠️ extra 里的 line / area / column / bar 四类**必须都给全**：
 * uCharts 只在少数几处用 `assign({}, 局部默认, opts.extra.xxx)` 兜底，
 * 而 fixColumeData() 是直接读 `opts.extra.column.seriesGap` 的，
 * 缺了 extra.column 会抛 TypeError，柱状图直接白屏。
 */
function defaultOpts() {
  return {
    background: 'transparent',
    padding: [16, 16, 0, 8],
    fontSize: 11,
    fontColor: '#98A2B3',
    legend: { show: false },
    dataLabel: false,
    dataPointShape: false,
    animation: true,
    duration: 600,
    color: ['#5B8CFF', '#37D0A0', '#FFB020', '#FF6B8A', '#A78BFA'],
    xAxis: {
      disableGrid: true,
      axisLine: false,
      fontColor: '#667085',
      fontSize: 10,
      scrollShow: false,
      rotateLabel: false,
      boundaryGap: 'center',
      // 类别名过长时自动截断，见 xCategoryFormatter 的注释。
      // 这里配在默认值里，页面不用（也无法）自己传函数：函数过不了 setData 的序列化。
      formatter: xCategoryFormatter
      // ⚠️ 不要给 xAxis 配 itemCount：它是**滚动模式**下的单屏数量，
      // 配合 enableScroll:false 使用时只会污染 uCharts 的抽稀算式
      //   maxXAxisListLength = ceil(categories.length / itemCount * labelCount) - 1
      // 让本该怎么抽的月份/年份标签全挤在一起（月视图 30 天能画出 16 个标签）。
      // 不设置时 maxXAxisListLength 直接等于 labelCount，抽稀才是对的。
    },
    yAxis: {
      gridType: 'dash',
      dashLength: 3,
      gridColor: '#262C38',
      fontColor: '#667085',
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
        meterFillColor: '#262C38',
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
        borderColor: '#262C38',
        bgColor: '#1E232E',
        bgOpacity: 1,
        fontColor: '#EDF1F7',
        labelFontColor: '#5B8CFF',
        gridColor: '#262C38',
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
 * 组装最终配置：默认暗色主题 <- 页面传入的 opts <- 运行时参数。
 * 分层覆盖，页面只需要写自己关心的那几项。
 */
function buildChartOpts(pageOpts, runtime) {
  return mergeDeep(mergeDeep(defaultOpts(), pageOpts), runtime)
}

module.exports = {
  defaultOpts,
  mergeDeep,
  buildChartOpts,
  xCategoryFormatter
}
