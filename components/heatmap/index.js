/**
 * 热力点阵日历图（GitHub 贡献图样式）
 *
 * 输入 dayMap（stats.buildDayMap 的输出），输出按「周」分列的 7×N 格子。
 * 纯 WXML 渲染，不依赖 canvas，因此在列表/滚动场景下性能稳定。
 */
const stats = require('../../utils/stats.js')
const dayjs = require('../../utils/date.js')

/**
 * 滚动模式下每列占的宽度（rpx）= 格子 26rpx + 列间距 6rpx。
 * 与 components/heatmap/index.wxss 里 .heat--scroll 的列宽严格对应，改一处要改两处。
 */
const COL_W = 32

/**
 * 单格的填充色。
 *
 * 色阶模式（默认）按 level 取那五档变量：0 是「没记录」，贴着底色。
 * 圆点模式**只分有没有**，有记录一律实心 —— 首页小卡上的格子只有十几 rpx，
 * 四档深浅在那么小的面积上根本分不出来，只会把「哪几天打了卡」说糊。
 * 颜色优先用调用方给的主题色（习惯色），没给就退回当前主题的主色。
 *
 * 「没记录」那一格用的是 --heat-empty 而**不是** --heat-0：卡片是半透明的，
 * 底下的彩光透上来，--heat-0 那种照「卡片当时是什么底色」挑的实色会糊在玻璃里
 * （浅色下整片网格直接看不见）。半透明的那一档落在什么底色上都还在。
 * 自定义主题没有这个键，退回 --heat-0 —— 它的卡片不透明，本来就是对的。
 */
function fillOf(cell, dot, color) {
  if (dot) return cell.count > 0 ? color || 'var(--accent)' : 'var(--heat-empty)'
  return cell.level === 0 ? 'var(--heat-empty)' : 'var(--heat-' + cell.level + ')'
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /** { 'YYYY-MM-DD': { count, value } } */
    dayMap: { type: Object, value: {} },
    /** 展示多少周 */
    weeks: { type: Number, value: 20 },
    /** 每日目标值，>0 时作为色阶基准 */
    target: { type: Number, value: 0 },
    /** 最后一个格子所在日期，默认今天 */
    endDate: { type: String, value: '' },
    /**
     * 圆点模式下「有记录」那种格子的颜色（习惯详情页传习惯色、首页卡片传习惯色）。
     * 默认空串 = 用当前主题的主色（--accent）：首页的打卡总览是「全部习惯合计」，
     * 不属于任何一个习惯，也就没有习惯色可用。
     */
    color: { type: String, value: '' },
    /** 紧凑模式（习惯卡片里的小图） */
    compact: { type: Boolean, value: false },
    /**
     * 圆点模式（首页卡片）：格子画成圆，且不显示深浅，只分「打过 / 没打过」。
     * 见 fillOf 与 index.wxss 的 .heat-cell--dot。
     */
    dot: { type: Boolean, value: false },
    /** 是否显示月份刻度 */
    showMonths: { type: Boolean, value: true },
    /** 是否显示底部图例 */
    showLegend: { type: Boolean, value: true },
    /** 是否可点击（触发 cellday 事件） */
    tappable: { type: Boolean, value: false },
    /**
     * 横向滚动模式（首页的打卡总览用）。
     * 打开后每列改成固定宽度，整块网格可以比容器宽，向左拖就能一直看到更早的记录；
     * 关闭时每列 flex:1 等分容器（习惯卡片里的迷你图就是这种）。
     */
    scroll: { type: Boolean, value: false }
  },

  data: {
    columns: [],
    monthSlots: [],
    maxValue: 0,
    /** 滚动模式下整块网格的宽度（rpx），写在 .heat-inner 上 */
    gridWidth: 0,
    /** scroll-view 的初始位置（px）：直接顶到最右，让今天先入眼 */
    scrollLeft: 0
  },

  observers: {
    'dayMap, weeks, target, endDate': function () {
      this.rebuild()
    },
    'scroll': function () {
      // 切换模式会改变列宽的算法，整块重算一遍（并重新靠右）
      this.rebuild()
    },
    // 每一格的颜色是 rebuild 里算好的（见 fillOf），这两项变了得重算一遍
    'dot, color': function () {
      this.rebuild()
    }
  },

  lifetimes: {
    attached() {
      this.rebuild()
    }
  },

  methods: {
    rebuild() {
      const { dayMap, weeks, target, endDate, scroll, dot, color } = this.data
      const data = stats.heatmapData(dayMap || {}, endDate || dayjs.today(), weeks, target)

      // 把「第几列出现新月份」摊平成与列等长的数组，渲染时按列对齐
      const monthSlots = new Array(weeks).fill('')
      data.monthLabels.forEach((m) => {
        // 每列宽 7 天，前两列不标注以免被裁切
        if (m.index > 0 && m.index < weeks - 1) monthSlots[m.index] = m.label
      })

      const gridWidth = scroll ? weeks * COL_W : 0

      // 填充色在这里算，不写在 wxml 的表达式里：色阶和圆点是两套完全不同的规则，
      // 塞进一个属性里就是两层三元表达式叠着，谁也读不出来
      const columns = data.columns.map((col) =>
        col.map((cell) => Object.assign({}, cell, { bg: fillOf(cell, dot, color) }))
      )

      this.setData({
        columns,
        monthSlots,
        maxValue: data.maxValue,
        gridWidth,
        // 初始位置直接给一个「比内容还宽」的值，scroll-view 会自己夹到最大滚动量，
        // 效果就是稳稳停在最右（最新的一周）。值跟着 weeks 变，历史变长时也会重新贴右。
        scrollLeft: scroll ? this.rpx2px(gridWidth) : 0
      })
    },

    /** rpx -> px（scroll-left / scroll-into-view 这类属性只认 px） */
    rpx2px(rpx) {
      return Math.round((rpx / 750) * (wx.getWindowInfo().windowWidth || 375))
    },

    onCellTap(e) {
      if (!this.data.tappable) return
      const { date } = e.currentTarget.dataset
      if (!date) return
      this.triggerEvent('cellday', { date })
    }
  }
})
