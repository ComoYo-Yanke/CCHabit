/**
 * 统计总览页
 *
 * 支持 日 / 周 / 月 / 年 四维度切换，展示：
 *   1. 全局汇总指标（打卡总次数、打卡天数、完成率、覆盖习惯数）
 *   2. 折线图：打卡次数趋势（跨全部习惯），单位**就是**当前区间 ——
 *      选日一天一格、选周一周一格、选月一月一格、选年一年一格，可横向滑动回看
 *   3. 柱状图：各习惯在本窗口的打卡次数对比（横轴是习惯名，与时间单位无关）
 *   4. 排行榜：逐习惯的明细（次数 / 累计数值 / 连续天数 / 完成率）
 *
 * 每一档铺开的是一个**窗口**（日 30 天 / 周 26 周 / 月 12 个月 / 年 5 年），
 * 一屏画不下，靠横向滑动看；两头的箭头平移整个窗口。
 * 汇总指标和排行榜算的就是这个窗口，和图上画的那一片是同一段时间。
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
    /** 折线图标题：每{{天/周/月/年}}打卡趋势，跟着 range 变（见 refresh） */
    lineTitle: '',
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
    // 窗口而不是单个单位：汇总 / 排行 / 图表算的都是同一片，
    // 拿 rangeOf（单个单位）的话，图上 26 根柱子配的是一周的指标
    const rangeInfo = dayjs.windowOf(range, anchor)

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

    // 图表颜色跟着主题走。这里不能再写 '#5B8CFF' 这种字面量 ——
    // canvas 读不到 CSS 变量，颜色全靠 JS 喂，写死了就永远不跟主题变
    // （见 utils/theme.js 的 chartVars，取的是十六进制，uCharts 只认这个）
    const chart = theme.chartVars(this.data.themeName)

    // ---- 折线：打卡次数趋势（跨习惯合计） ----
    // 出桶单位**就是**当前区间（见 stats.granOfRange）：选周就是一周一格，
    // 一格对应一次翻页，和头顶那个分段控件说的是同一件事。
    // 结构交给 barChartData 拼：折线和柱状要的都是 { categories, series }，
    // 只是取 count 这一个字段，没必要在这里再手写一遍映射
    const buckets = stats.bucketSeries(merged, stats.granOfRange(range), rangeInfo.start, rangeInfo.end)
    const lineData = stats.barChartData(buckets, { color: chart.accent, field: 'count' })

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
          color: chart.success,
          data: ranking.map((r) => r.count)
        }
      ]
    }

    this.setData({
      anchor,
      rangeLabel: rangeInfo.label,
      // 图的单位跟着区间走，标题得跟着改，否则月视图里写着「每日」而横轴是月份
      lineTitle: '每' + stats.granLabel(range) + '打卡趋势',
      canNext: !!this.shiftedAnchor(1),
      hasHabits: habits.length > 0,
      summary: Object.assign({}, summary, {
        habitCount: habits.length,
        activeHabitCount: ranking.filter((r) => r.count > 0).length
      }),
      lineData,
      barData,
      ranking,
      // 折线是时间轴：一屏 itemCount 格，多出来的横向滑动看（scroll 属性配 itemCount，
      // 见 components/qiun-charts）。不配 labelCount —— 一屏才 6~10 格，
      // 每格的标签都放得下，再抽稀只会把「10月」抽掉一半。
      // 对比柱状图的横轴是习惯名，和时间无关，
      // 同样一屏 itemCount 个、多出来的横向滑动（scroll + scrollStart="left"，见 stats.wxml）
      lineOpts: { xAxis: { itemCount: stats.chartItemCount(range), fontSize: 10 }, yAxis: { data: [{ min: 0 }] } },
      /**
       * 对比柱状图。
       *
       * **不加 labelCount** —— 这是「习惯多的时候名字不显示」的根因，不是显示问题：
       * uCharts 的抽稀（u-charts.js 的 drawXAxis）是拿 labelCount 当「一屏想放几个」
       * 去算 maxXAxisListLength 的，而它**不看 enableScroll**。于是不滚动时
       * labelCount: 6 会变成 maxXAxisListLength = 6 - 1 = 5、ratio = ceil(n/5)，
       * 习惯一到 6 个就每隔一个名字抹白一个，10 个以上只剩两三行有字。
       * 不配它，maxXAxisListLength 默认取 categories.length、ratio 恒为 1，一个都不抽。
       * 而「放不下」交给滚动解决：itemCount 5 是滚动时每屏的格数，
       * 习惯不超过 5 个时 dataCount 就等于 categories.length，和不开滚动完全一样
       * （见 u-charts.js 的 getXAxisPoints），所以这个 5 对小数据量是安全的。
       */
      barOpts: { xAxis: { itemCount: 5, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } }
    }, done)
  },

  onSwitchRange(e) {
    const range = e.currentTarget.dataset.range
    if (range === this.data.range) return
    this.setData({ range, anchor: dayjs.today() }, () => this.refresh())
  },

  /**
   * 按 delta 平移窗口，返回新的锚点；越界时返回 null（最后一格落在今天之后，没有数据可看）。
   *
   * 一次平移的是**整个窗口**（day 30 天 / week 26 周 / month 12 月 / year 5 年），
   * 不是一格 —— 一格一格挪的话，窗口里绝大多数格子原地不动，翻页等于没翻。
   *
   * 这里的方向曾经写反过：「左」按钮点了没反应，只能往「右」翻、还能一直翻到未来去。
   * 原来那句是 `diffDays(nextStart, today) > 0`，即「区间起点在过去」——
   * 而上一周 / 上一月 / 上一年的起点**必然**在过去，于是往回翻被全线挡死；
   * 往未来翻反而没人拦。判据应该是「下一屏还没发生」，也就是它的最后一格
   * 落在今天所在的那一格之后。
   *
   * 日期是 YYYY-MM-DD 定长字符串，直接比大小就是比先后，不用转 Date。
   */
  shiftedAnchor(delta) {
    const { range } = this.data
    const today = dayjs.today()
    const step = dayjs.windowPeriods(range)
    const next = dayjs.shiftRange(range, this.data.anchor || today, delta * step)
    // 比的是各自的**单位起点**，不是 next 这个日期本身：next 只是落在最后一格里的
    // 某一天（月视图里是 17 号，而窗口是从 1 号铺的），直接跟今天比大小会误判 ——
    // 往前翻一屏后仍可能「比今天小」，于是箭头亮着，按下去窗口却摆回原处
    return dayjs.rangeOf(range, next).start > dayjs.rangeOf(range, today).start ? null : next
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
