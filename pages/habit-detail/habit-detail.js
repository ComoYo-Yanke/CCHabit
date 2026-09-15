/**
 * 习惯详情页
 *
 * 包含：
 *   1. 头部信息 + 打卡 / 编辑入口
 *   2. 日历视图（只读一览：当月哪几天打了卡、哪几天没打，可往前翻月份，不可翻到未来）
 *   3. 周 / 月 / 年 区间切换的汇总指标
 *   4. 折线图：区间内每日数值变化
 *   5. 柱状图：区间内打卡次数对比
 *   6. 热力点阵：完成情况，铺满全部历史，横向可滑动
 *   7. 历史打卡记录（当天可改可删，过去只读回看）
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const stats = require('../../utils/stats.js')
const dayjs = require('../../utils/date.js')
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')

/** 记录列表一次渲染的条数，避免超长列表卡顿 */
const HISTORY_PAGE_SIZE = 20
/** 热力图最少展示的周数（记录少时不至于只画一小条） */
const HEAT_MIN_WEEKS = 26
/** 热力图周数上限（约 5 年）：再多只是把横向滚动条拉得更长，没有信息增量 */
const HEAT_MAX_WEEKS = 260

Page({
  data: {
    ...pageFade.data,
    habitId: '',
    habit: null,

    // 主题：themeStyle 供 page-meta 换肤，themeName 给 canvas 图表（它读不到 CSS 变量）
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',

    // 顶部概览
    todayText: '0',
    todayCount: 0,
    streak: 0,
    longest: 0,
    totalText: '0',
    totalCount: 0,

    // 区间统计
    range: 'week',
    /** 区间锚点，空串表示跟随今天 */
    anchor: '',
    rangeLabel: '',
    canNext: false,
    summary: null,

    // 图表
    lineData: null,
    barData: null,
    chartOpts: null,
    barOpts: null,

    // 热力图
    dayMap: {},
    heatWeeks: HEAT_MIN_WEEKS,

    // 日历
    calCells: [],
    calLabel: '',
    calPrev: '',
    calNext: '',
    calCanNext: false,

    // 历史记录
    history: [],
    historyTotal: 0,
    historyShown: 0,

    // 弹层
    showCheckin: false,
    checkinDate: '',
    showEditor: false,
    scrolled: false
  },

  onLoad(options) {
    const id = (options && options.id) || ''
    // 先落地主题再渲染：晚一步会先按深色画一帧再跳成浅色
    this.syncTheme()
    this.setData({ habitId: id, checkinDate: dayjs.today() })
    this.loadHabit()
  },

  /** 首访的淡入时机：等初次渲染完成再起动画（见 utils/page-fade.js） */
  onReady() {
    pageFade.ready(this)
  },

  /**
   * 复访。淡入排在数据渲染之后：页面刚被搬上台时是透明的，而 setData 还要过一拍
   * 才落到视图层 —— 先起动画就会看到「空页面淡入、淡到一半长出内容」。
   * 所以挂在 loadHabit 的渲染回调里。首访由 onReady 负责。
   * 详见 pages/index/index.js 里同一处的长注释。
   */
  onShow() {
    // 主题可能刚在「我的」里改过，也可能系统外观变了（跟随系统）
    this.syncTheme()
    // 从编辑弹层或其它页面返回时刷新
    if (this.data.habitId) this.loadHabit(() => pageFade.show(this))
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

  onPageScroll(e) {
    // 滚动超过 40px 时给固定导航栏加上背景
    const scrolled = e.scrollTop > 40
    if (scrolled !== this.data.scrolled) this.setData({ scrolled })
  },

  onPullDownRefresh() {
    this.loadHabit()
    wx.stopPullDownRefresh()
  },

  /**
   * 习惯不存在（被删除 / 链接失效）时的兜底
   * @param {Function} [done] 本次渲染完成后的回调，见 onShow
   */
  loadHabit(done) {
    const habit = storage.getHabit(this.data.habitId)
    if (!habit) {
      wx.showModal({
        title: '习惯不存在',
        content: '该习惯可能已被删除。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    this.setData({ habit })
    this.refreshAll(done)
  },

  /**
   * 全量重算（数据量小，直接整页刷新最简单也最不容易出错）
   * @param {Function} [done] 整串 setData 渲染完成后的回调
   */
  refreshAll(done) {
    const { habit } = this.data
    if (!habit) return

    const today = dayjs.today()
    const records = storage.getRecords(habit.id)
    const dayMap = stats.buildDayMap(records)
    const streak = stats.computeStreak(dayMap, today)
    const todayCell = dayMap[today]
    const first = records.length ? records[0].d : today
    const lifetime = stats.summarize(dayMap, first, today)

    // 热力图铺满全部历史：从第一条记录算起，向左能一直滑到头。
    // 日期是 YYYY-MM-DD 定长字符串，直接比大小就是比先后，不用转 Date。
    const spanWeeks = Math.ceil(dayjs.diffDays(first, today) / 7) + 1
    const heatWeeks = Math.min(HEAT_MAX_WEEKS, Math.max(HEAT_MIN_WEEKS, spanWeeks))

    this.records = records
    this.setData({
      dayMap,
      heatWeeks,
      todayText: stats.fmtNum(todayCell ? todayCell.value : 0),
      todayCount: todayCell ? todayCell.count : 0,
      streak: streak.current,
      longest: streak.longest,
      totalText: stats.fmtNum(lifetime.totalValue),
      totalCount: lifetime.totalCount
    })

    this.refreshRange(dayMap)
    this.refreshCalendar(this.calAnchor || today, dayMap)
    this.refreshHistory(records, done)
  },

  /**
   * 按当前 range 计算区间汇总与两张图表。
   * @param {Object} [cachedDayMap] 已算好的 dayMap，缺省时自行读取
   */
  refreshRange(cachedDayMap) {
    const { habit, range } = this.data
    const today = dayjs.today()
    const activeAnchor = this.data.anchor || today
    const rangeInfo = dayjs.rangeOf(range, activeAnchor)
    const dayMap = cachedDayMap || stats.buildDayMap(storage.getRecords(habit.id))

    const summary = stats.summarize(dayMap, rangeInfo.start, rangeInfo.end)
    const inRangeStreak = stats.computeStreak(filterDayMap(dayMap, rangeInfo.days), today)

    // 折线：年视图按天会挤成 365 个点，退化为按月聚合；周/月视图保持按日
    const lineSource =
      range === 'year'
        ? buildMonthlyLine(dayMap, rangeInfo)
        : stats.dailySeries(dayMap, rangeInfo.days)

    const lineData = {
      categories: lineSource.map((p) => p.label),
      series: [{ name: habit.unit || '数值', color: habit.color, data: lineSource.map((p) => p.value) }]
    }

    // 柱状：打卡次数对比（周=7 天 / 月=第 N 周 / 年=12 个月）
    const gran = range === 'week' ? 'day' : range === 'month' ? 'weekOfMonth' : 'year'
    const buckets = stats.bucketSeries(dayMap, gran, rangeInfo.start, rangeInfo.end)
    const barData = stats.barChartData(buckets, {
      name: '打卡次数',
      color: habit.color,
      field: 'count'
    })

    this.setData({
      anchor: activeAnchor,
      rangeLabel: rangeInfo.label,
      canNext: !!this.shiftedAnchor(1, activeAnchor),
      summary: Object.assign({}, summary, {
        totalValueText: stats.fmtNum(summary.totalValue),
        avgText: stats.fmtNum(summary.avgPerActiveDay),
        maxDayText: stats.fmtNum(summary.maxDay.value),
        streakInRange: inRangeStreak.longest
      }),
      lineData,
      barData,
      // labelCount 控制 x 轴标签抽稀后的数量，避免柱/点密集时文字重叠
      chartOpts: { xAxis: { labelCount: 5, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } },
      barOpts: { xAxis: { labelCount: 7, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } }
    })
  },

  onSwitchRange(e) {
    const range = e.currentTarget.dataset.range
    if (range === this.data.range) return
    // 切换粒度时把锚点重置回今天，避免停留在未来区间
    this.setData({ range, anchor: dayjs.today() }, () => this.refreshRange())
  },

  /**
   * 按 delta 平移区间，返回新的锚点；越界时返回 null（整段都在今天之后，没有数据可看）。
   *
   * 这里的方向曾经写反过，和统计页是同一个 bug：「左」按钮点了没反应，
   * 只能往「右」翻、还能一直翻到未来去。原来那句是 `diffDays(nextStart, today) > 0`，
   * 即「区间起点在过去」—— 而上一周 / 上一月 / 上一年的起点**必然**在过去，
   * 于是往回翻被全线挡死，往未来翻反而没人拦。判据应该是
   * 「下一段的起点落在今天之后」，也就是这一整段还没发生。
   *
   * canNext 也复用同一个判断，避免「箭头亮着但点了没用」这种自相矛盾的状态。
   *
   * @param {number} delta -1 往前 / 1 往后
   * @param {string} [fromAnchor] 以哪个锚点起算，缺省用 data.anchor
   */
  shiftedAnchor(delta, fromAnchor) {
    const { range } = this.data
    const today = dayjs.today()
    const anchor = fromAnchor || this.data.anchor || today
    const next = dayjs.shiftRange(range, anchor, delta)
    return dayjs.rangeOf(range, next).start > today ? null : next
  },

  onShiftRange(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const next = this.shiftedAnchor(delta)
    if (!next) return
    this.setData({ anchor: next }, () => this.refreshRange())
  },

  // ---------------- 日历 ----------------
  /**
   * @param {string} anchor 要展示的月份
   * @param {Object} [cachedDayMap] 已算好的 dayMap
   */
  refreshCalendar(anchor, cachedDayMap) {
    const { habit } = this.data
    const dayMap = cachedDayMap || stats.buildDayMap(storage.getRecords(habit.id))
    const cal = stats.monthCalendar(dayMap, anchor || dayjs.today())

    this.calAnchor = anchor || dayjs.today()
    this.setData({
      calCells: cal.cells.map((c) => {
        if (c.empty) return c
        return Object.assign({}, c, {
          valueText: stats.fmtNum(c.value),
          // 打卡过的日子用习惯主题色标记
          mark: c.done ? habit.color : ''
        })
      }),
      calLabel: cal.monthLabel,
      calPrev: cal.prevAnchor,
      calNext: cal.nextAnchor,
      calCanNext: cal.canNext
    })
  },

  onCalPrev() {
    this.refreshCalendar(this.data.calPrev)
  },

  onCalNext() {
    if (!this.data.calCanNext) {
      wx.showToast({ title: '已经是本月了', icon: 'none' })
      return
    }
    this.refreshCalendar(this.data.calNext)
  },

  /**
   * 点热力图某一天 -> 打开该天的打卡弹层。
   *
   * 和日历保持一致：过去的日子进去是**只读回看**（弹层自己按日期判定，
   * 见 components/checkin-sheet），未来的日子没有记录也不该点开。
   */
  onHeatDayTap(e) {
    const date = e.detail.date
    if (!date) return
    // 日期是 YYYY-MM-DD 定长字符串，直接比大小就是比先后
    if (date > dayjs.today()) {
      wx.showToast({ title: '还没到的日子', icon: 'none' })
      return
    }
    this.setData({ showCheckin: true, checkinDate: date })
  },

  // ---------------- 历史记录 ----------------
  /**
   * @param {Array}    [records] 已读到的记录，缺省自行读取
   * @param {Function} [done]    本次渲染完成后的回调（refreshAll 那一串的最后一步）
   */
  refreshHistory(records, done) {
    const list = records || storage.getRecords(this.data.habitId)
    const { habit } = this.data
    // 倒序：最新的在前
    const desc = list.slice().reverse()
    const shown = Math.min(this.data.historyShown || HISTORY_PAGE_SIZE, desc.length)

    this._historyRaw = desc
    this.setData({
      historyTotal: desc.length,
      historyShown: shown,
      history: desc.slice(0, shown).map((r) => ({
        id: r.id,
        date: r.d,
        dateLabel: dayjs.friendlyLabel(r.d),
        weekday: dayjs.weekdayFullCN(r.d),
        valueText: stats.fmtNum(r.v),
        unit: habit.unit || '',
        note: r.n || '',
        time: fmtTime(r.t)
      }))
    }, done)
  },

  onLoadMoreHistory() {
    const desc = this._historyRaw || []
    const shown = Math.min(this.data.historyShown + HISTORY_PAGE_SIZE, desc.length)
    const { habit } = this.data
    this.setData({
      historyShown: shown,
      history: desc.slice(0, shown).map((r) => ({
        id: r.id,
        date: r.d,
        dateLabel: dayjs.friendlyLabel(r.d),
        weekday: dayjs.weekdayFullCN(r.d),
        valueText: stats.fmtNum(r.v),
        unit: habit.unit || '',
        note: r.n || '',
        time: fmtTime(r.t)
      }))
    })
  },

  /** 点历史记录 -> 打开那一天；是今天就还能改，过去的日子只读 */
  onHistoryTap(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    this.setData({ showCheckin: true, checkinDate: date })
  },

  // ---------------- 弹层 ----------------
  onOpenCheckin() {
    this.setData({ showCheckin: true, checkinDate: dayjs.today() })
  },

  onCloseCheckin() {
    this.setData({ showCheckin: false })
  },

  onCheckinChange() {
    app.bumpDataVersion()
    this.setData({ historyShown: HISTORY_PAGE_SIZE })
    this.refreshAll()
  },

  onOpenEditor() {
    this.setData({ showEditor: true })
  },

  onCloseEditor() {
    this.setData({ showEditor: false })
  },

  onSubmitHabit(e) {
    try {
      storage.saveHabit(e.detail.habit)
    } catch (err) {
      this.handleStorageError(err)
      return
    }
    app.bumpDataVersion()
    this.setData({ showEditor: false })
    this.loadHabit()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onDeleteHabit() {
    const { habit } = this.data
    if (!habit) return

    const doDelete = () => {
      storage.deleteHabit(habit.id)
      app.bumpDataVersion()
      this.setData({ showEditor: false })
      wx.showToast({ title: '已删除', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
    }

    // 恒定二次确认，不提供开关：删习惯会级联删掉它全部打卡记录且不可恢复，
    // 没有「以后别问了」的合理场景
    wx.showModal({
      title: '删除「' + habit.name + '」？',
      content: '该习惯下的全部打卡记录会一并删除，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#FF5C5C',
      success: (res) => {
        if (res.confirm) doDelete()
      }
    })
  },

  handleStorageError(err) {
    if (err && err.code === 'QUOTA_EXCEEDED') {
      wx.showModal({
        title: '本地存储已满',
        content: '请到「我的 - 存储管理」导出备份后清理历史数据。',
        showCancel: false
      })
    } else {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      console.error('[habit-detail] storage error', err)
    }
  }
})

/** 只保留区间内的日期，用于计算「区间内最长连续」 */
function filterDayMap(dayMap, days) {
  const out = {}
  days.forEach((d) => {
    if (dayMap[d]) out[d] = dayMap[d]
  })
  return out
}

/** 年视图折线：按月聚合，返回 [{label:'1月', value}] */
function buildMonthlyLine(dayMap, rangeInfo) {
  const buckets = stats.bucketSeries(dayMap, 'year', rangeInfo.start, rangeInfo.end)
  return buckets.map((b) => ({ label: b.label, value: b.value }))
}

/** 时间戳 -> HH:mm */
function fmtTime(ts) {
  const d = new Date(ts)
  return dayjs.pad2(d.getHours()) + ':' + dayjs.pad2(d.getMinutes())
}
