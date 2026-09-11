/**
 * 热力点阵日历图（GitHub 贡献图样式）
 *
 * 输入 dayMap（stats.buildDayMap 的输出），输出按「周」分列的 7×N 格子。
 * 纯 WXML 渲染，不依赖 canvas，因此在列表/滚动场景下性能稳定。
 */
const stats = require('../../utils/stats.js')
const dayjs = require('../../utils/date.js')

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
    /** 主题色（暂用于图例文字） */
    color: { type: String, value: '#5B8CFF' },
    /** 紧凑模式（习惯卡片里的小图） */
    compact: { type: Boolean, value: false },
    /** 是否显示月份刻度 */
    showMonths: { type: Boolean, value: true },
    /** 是否显示底部图例 */
    showLegend: { type: Boolean, value: true },
    /** 是否可点击（触发 cellday 事件） */
    tappable: { type: Boolean, value: false }
  },

  data: {
    columns: [],
    monthSlots: [],
    maxValue: 0
  },

  observers: {
    'dayMap, weeks, target, endDate': function () {
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
      const { dayMap, weeks, target, endDate } = this.data
      const data = stats.heatmapData(dayMap || {}, endDate || dayjs.today(), weeks, target)

      // 把「第几列出现新月份」摊平成与列等长的数组，渲染时按列对齐
      const monthSlots = new Array(weeks).fill('')
      data.monthLabels.forEach((m) => {
        // 每列宽 7 天，前两列不标注以免被裁切
        if (m.index > 0 && m.index < weeks - 1) monthSlots[m.index] = m.label
      })

      this.setData({ columns: data.columns, monthSlots, maxValue: data.maxValue })
    },

    onCellTap(e) {
      if (!this.data.tappable) return
      const { date } = e.currentTarget.dataset
      if (!date) return
      this.triggerEvent('cellday', { date })
    }
  }
})
