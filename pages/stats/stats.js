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

Page({
  data: {
    statusBarHeight: 20,

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
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 })
  },

  onShow() {
    this.refresh()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  refresh() {
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
      canNext: dayjs.diffDays(rangeInfo.end, today) < 0,
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
    })
  },

  onSwitchRange(e) {
    const range = e.currentTarget.dataset.range
    if (range === this.data.range) return
    this.setData({ range, anchor: dayjs.today() }, () => this.refresh())
  },

  onShiftRange(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const { range } = this.data
    const next = dayjs.shiftRange(range, this.data.anchor || dayjs.today(), delta)
    if (dayjs.diffDays(dayjs.rangeOf(range, next).start, dayjs.today()) > 0) return
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
