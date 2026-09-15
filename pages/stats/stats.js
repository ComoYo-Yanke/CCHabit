/**
 * 统计总览页
 *
 * 支持 周 / 月 / 年 三维度切换，展示：
 *   1. 全局汇总指标（打卡总次数、打卡天数、完成率、覆盖习惯数）
 *   2. 折线图：每日打卡次数趋势（跨全部习惯）
 *   3. 柱状图：各习惯在本区间的打卡次数对比
 *   4. 排行榜：逐习惯的明细（次数 / 累计数值 / 连续天数 / 完成率）
 *
 * 注意：不同习惯的「数值单位」不同（个、公里、毫升…），
 * 因此全局层只汇总「次数」这类可比指标，数值一律回到单个习惯内展示。
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const stats = require('../../utils/stats.js')
const dayjs = require('../../utils/date.js')
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')

Page({
  data: {
    ...pageFade.data,
    statusBarHeight: 20,

    // 主题：themeStyle 供 page-meta 换肤，themeName 给 canvas 图表（它读不到 CSS 变量）
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',

    range: 'week',
    anchor: '',
    rangeLabel: '',
    canNext: false,

    summary: null,
    lineData: null,
    barData: null,
    lineOpts: null,
    barOpts: null,

    ranking: [],
    hasHabits: false
  },

  onLoad() {
    this.syncTheme()
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 })
  },

  /**
   * 复访。淡入必须排在数据渲染之后：页面刚被搬上台时是透明的，而 setData
   * 还要过一拍才落到视图层 —— 先起动画就会看到「空页面淡入、淡到一半长出内容」。
   * 所以挂在 refresh 的渲染回调里。首访由 onReady 负责（此时 _fadeReady 还是 false）。
   * 详见 pages/index/index.js 里同一处的长注释。
   */
  onShow() {
    // 主题可能刚在「我的」里改过，也可能系统外观变了（跟随系统）
    this.syncTheme()
    this.syncTabBar()
    this.refresh(() => pageFade.show(this))
  },

  /**
   * 首访的淡入时机：等初次渲染完成再起动画。
   * onShow 早于布局落定，页面还在做第一轮重活（读数据、图表初始化），
   * 动画叠在上面就是「闪」（见 utils/page-fade.js 的「触发时机」）。
   */
  onReady() {
    pageFade.ready(this)
  },

  /** 离开时必须把自己变透明，否则下次被搬上台的那一帧会整页闪一下（见 utils/page-fade.js） */
  onHide() {
    pageFade.leave(this)
  },

  /** 读取当前主题并落到 page-style；themeName 变化会让图表组件自己重绘 */
  syncTheme() {
    const name = theme.current()
    theme.applyWindow(name)
    const style = theme.cssVars(name) + ';'
    // 两个都得比：themeName 不只是图表的输入，也是 app-bg 判断「还该不该显示背景图」的信号
    if (style !== this.data.themeStyle || name !== this.data.themeName) {
      this.setData({ themeName: name, themeStyle: style })
    }
  },

  syncTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tb = this.getTabBar()
    if (tb) tb.setActive(1)
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  /**
   * @param {Function} [done] 本次渲染完成后的回调 —— onShow 用它把淡入排在内容落定之后
   */
  refresh(done) {
    const { range } = this.data
    const today = dayjs.today()
    const anchor = this.data.anchor || today
    const rangeInfo = dayjs.rangeOf(range, anchor)

    const habits = storage.getEnabledHabits()
    const recordsMap = storage.getRecordsMap()

    // ---- 合并出「全部习惯」的 dayMap，用于全局趋势 ----
    const merged = {}
    habits.forEach((h) => {
      const list = recordsMap[h.id] || []
      list.forEach((r) => {
        if (!r || !r.d) return
        if (!merged[r.d]) merged[r.d] = { count: 0, value: 0, records: [] }
        merged[r.d].count += 1
        merged[r.d].records.push(r)
      })
    })

    const summary = stats.summarize(merged, rangeInfo.start, rangeInfo.end)

    // ---- 折线：每日打卡次数（跨习惯合计） ----
    const series = stats.dailySeries(merged, rangeInfo.days)
    const lineSource =
      range === 'year'
        ? stats.bucketSeries(merged, 'year', rangeInfo.start, rangeInfo.end).map((b) => ({
            label: b.label,
            count: b.count
          }))
        : series.map((s) => ({ label: s.label, count: s.count }))

    const lineData = {
      categories: lineSource.map((p) => p.label),
      series: [{ name: '打卡次数', color: '#5B8CFF', data: lineSource.map((p) => p.count) }]
    }

    // ---- 逐习惯明细 ----
    // 跨习惯比较时只能比「次数」（各习惯单位不同，数值不可加），
    // 所以这里覆盖 compareHabits 默认的按数值排序
    const ranking = stats
      .compareHabits(habits, recordsMap, rangeInfo.start, rangeInfo.end)
      .sort((a, b) => b.summary.totalCount - a.summary.totalCount || b.summary.activeDays - a.summary.activeDays)
      .map((row) => ({
      id: row.habit.id,
      name: row.habit.name,
      icon: row.habit.icon,
      color: row.habit.color,
      unit: row.habit.unit || '次',
      count: row.summary.totalCount,
      valueText: stats.fmtNum(row.summary.totalValue),
      activeDays: row.summary.activeDays,
      totalDays: row.summary.totalDays,
      completionRate: row.summary.completionRate,
      streak: row.streak.current,
      longest: row.streak.longest
    }))

    // ---- 柱状：各习惯打卡次数对比 ----
    const barData = {
      categories: ranking.map((r) => r.name),
      series: [
        {
          name: '打卡次数',
          color: '#37D0A0',
          data: ranking.map((r) => r.count)
        }
      ]
    }

    this.setData({
      anchor,
      rangeLabel: rangeInfo.label,
      canNext: !!this.shiftedAnchor(1),
      hasHabits: habits.length > 0,
      summary: Object.assign({}, summary, {
        habitCount: habits.length,
        activeHabitCount: ranking.filter((r) => r.count > 0).length,
        avgPerDayText: stats.fmtNum(summary.avgPerDay)
      }),
      lineData,
      barData,
      ranking,
      lineOpts: { xAxis: { labelCount: 5, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } },
      barOpts: { xAxis: { labelCount: 6, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } }
    }, done)
  },

  onSwitchRange(e) {
    const range = e.currentTarget.dataset.range
    if (range === this.data.range) return
    this.setData({ range, anchor: dayjs.today() }, () => this.refresh())
  },

  /**
   * 按 delta 平移区间，返回新的锚点；越界时返回 null（整段都在今天之后，没有数据可看）。
   *
   * 这里的方向曾经写反过：「左」按钮点了没反应，只能往「右」翻、还能一直翻到未来去。
   * 原来那句是 `diffDays(nextStart, today) > 0`，即「区间起点在过去」——
   * 而上一周 / 上一月 / 上一年的起点**必然**在过去，于是往回翻被全线挡死；
   * 往未来翻反而没人拦。判据应该是「下一段的起点落在今天之后」，
   * 也就是这一整段还没发生。
   *
   * 日期是 YYYY-MM-DD 定长字符串，直接比大小就是比先后，不用转 Date。
   */
  shiftedAnchor(delta) {
    const { range } = this.data
    const today = dayjs.today()
    const next = dayjs.shiftRange(range, this.data.anchor || today, delta)
    return dayjs.rangeOf(range, next).start > today ? null : next
  },

  onShiftRange(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const next = this.shiftedAnchor(delta)
    if (!next) return
    this.setData({ anchor: next }, () => this.refresh())
  },

  onBackToday() {
    this.setData({ anchor: dayjs.today() }, () => this.refresh())
  },

  onRankTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/habit-detail/habit-detail?id=' + id })
  },

  onGoCreate() {
    // 同样地：切到首页的同时让首页把「新建习惯」弹层打开
    app.requestNewHabit()
    wx.switchTab({ url: '/pages/index/index' })
  }
})
