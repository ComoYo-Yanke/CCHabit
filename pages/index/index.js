/**
 * 首页仪表盘
 *
 * 结构：
 *   1. 顶部问候 + 今日概览（完成数 / 连续天数）
 *   2. 全部习惯的合并热力点阵（铺满全部历史，可横向滑动回看）
 *   3. 习惯卡片列表（单卡自带近 12 周点阵、今日数值、连续天数）
 *   4. 右下角悬浮按钮：新建习惯
 *
 * 数据全部来自本地 storage，页面 onShow 时重新汇总。
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const stats = require('../../utils/stats.js')
const dayjs = require('../../utils/date.js')
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')

/** 首页合并热力图的**最少**周数；有更早的记录就一路往前铺，可以横向滑到底 */
const OVERVIEW_MIN_WEEKS = 26
/** 合并热力图的周数上限（约 5 年）：再多也只是把横向滚动条拉得更长，没有信息增量 */
const OVERVIEW_MAX_WEEKS = 260
/** 卡片内迷你热力图展示的周数 */
const CARD_WEEKS = 12
/**
 * 卡片上「打卡」按钮记录的数值。
 * 固定 1：这是「点一下就算今天打过卡」的快捷动作，不套用习惯的 step ——
 * step 是弹层里快捷档位的幅度，属于精细录入那条路。
 */
const QUICK_CHECKIN_VALUE = 1

Page({
  data: {
    ...pageFade.data,
    statusBarHeight: 20,

    // 主题（见 utils/theme.js）：themeStyle 供 page-meta 换肤，themeName 给图表
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',

    // 今日概览
    dateLabel: '',
    greeting: '',
    todayDone: 0,
    todayTotal: 0,
    todayPercent: 0,
    maxStreak: 0,

    // 合并热力图（周数在 refresh 里按最早记录算，这里先给个下限占位）
    overviewMap: {},
    overviewWeeks: OVERVIEW_MIN_WEEKS,

    // 习惯列表
    items: [],
    hasHabits: false,

    // 弹层
    showEditor: false,
    editingHabit: null,
    showCheckin: false,
    checkinHabit: null,
    checkinDate: ''
  },

  onLoad() {
    this.syncTheme()
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      dateLabel: this.buildDateLabel(),
      greeting: this.buildGreeting()
    })
  },

  /**
   * 复访。这里只有一件事要小心：**淡入必须排在数据渲染之后**。
   *
   * 页面刚被搬上台时是透明的（fading 默认 true），setData 还要过一拍才落到视图层。
   * 如果在 refresh 之前就起动画，用户看到的是「空页面淡入 → 淡到一半数据突然长出来」，
   * 观感就是闪了一下。所以淡入挂在 refresh 的渲染回调里（setData 的回调就是
   * 「这批数据渲染完毕」），代价是淡入晚一两帧，换来的是动画全程内容都在。
   *
   * 首访不用管这里：onShow 时 _fadeReady 还是 false，show() 什么也不做，
   * 首访的淡入由 onReady 负责（见 utils/page-fade.js）。
   */
  onShow() {
    // 主题可能刚在「我的」里改过，也可能系统外观变了（跟随系统），每次回来重新解析
    this.syncTheme()
    this.syncTabBar()
    // 复访的淡入排在 refresh 的渲染回调里，也就是内容全部落定之后
    this.refresh(() => pageFade.show(this))
    // 从「我的 / 统计」页点「新建习惯」跳过来时，把编辑弹层直接打开，
    // 否则用户切到首页后只看到一个 + 按钮，会以为功能坏了
    if (app.consumePendingAction() === 'newHabit') this.onAddHabit()
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

  /** 读取当前主题并落到 page-style（真正换肤的一步，见 utils/theme.js） */
  syncTheme() {
    const name = theme.current()
    theme.applyWindow(name)
    const style = theme.cssVars(name) + ';'
    // 两个都得比：themeName 不只是图表的输入，也是 app-bg 判断「还该不该显示背景图」的信号。
    // 只看 style 的话，万一某次换主题风格串恰好没变，名字的变化就被这次提前返回吞掉了。
    if (style !== this.data.themeStyle || name !== this.data.themeName) {
      this.setData({ themeName: name, themeStyle: style })
    }
  },

  /** tabBar 不在页面的节点树里，配色要由页面推过去（见 custom-tab-bar/index.js） */
  syncTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tb = this.getTabBar()
    if (tb) tb.setActive(0)
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  /** 顶部日期：9月11日 周四 */
  buildDateLabel() {
    const t = dayjs.today()
    return dayjs.monthDayLabel(t) + ' ' + dayjs.weekdayFullCN(t)
  },

  /** 按时段生成问候语 */
  buildGreeting() {
    const h = new Date().getHours()
    if (h < 6) return '夜深了，早点休息'
    if (h < 11) return '早上好，开始今天的打卡'
    if (h < 14) return '中午好，别忘了打卡'
    if (h < 18) return '下午好，坚持就是胜利'
    return '晚上好，今天还差多少？'
  },

  /**
   * 汇总全部数据：今日概览 + 合并热力图 + 每张卡片的数据。
   * 一次性算完再 setData，避免多次渲染。
   *
   * @param {Function} [done] 本次渲染完成后的回调 —— onShow 用它把淡入排在内容落定之后
   */
  refresh(done) {
    const today = dayjs.today()
    const habits = storage.getEnabledHabits()
    const recordsMap = storage.getRecordsMap()

    // ---- 合并热力图：任一习惯当天有记录即算「活跃」 ----
    const enabledIds = {}
    habits.forEach((h) => {
      enabledIds[h.id] = true
    })
    const overviewMap = {}
    Object.keys(recordsMap).forEach((hid) => {
      // 停用的习惯不计入首页概览
      if (!enabledIds[hid]) return
      ;(recordsMap[hid] || []).forEach((r) => {
        if (!r || !r.d) return
        if (!overviewMap[r.d]) overviewMap[r.d] = { count: 0, value: 0 }
        overviewMap[r.d].count += 1
        overviewMap[r.d].value += Number(r.v) || 0
      })
    })

    // 概览热力图铺满全部历史：从最早的一条记录算起，向左一直能滑到头。
    // 日期是 YYYY-MM-DD 定长字符串，直接比大小就是比先后，不用转 Date。
    let earliest = today
    Object.keys(overviewMap).forEach((d) => {
      if (d < earliest) earliest = d
    })
    const spanWeeks = Math.ceil(dayjs.diffDays(earliest, today) / 7) + 1
    const overviewWeeks = Math.min(OVERVIEW_MAX_WEEKS, Math.max(OVERVIEW_MIN_WEEKS, spanWeeks))

    // ---- 每个习惯的卡片数据 ----
    let todayDone = 0
    let maxStreak = 0
    const items = habits.map((habit) => {
      const records = storage.getRecords(habit.id)
      const dayMap = stats.buildDayMap(records)
      const streak = stats.computeStreak(dayMap, today)
      const todayCell = dayMap[today]
      // 「累计」从该习惯第一条记录算起，而不是固定区间
      const all = stats.summarize(dayMap, this.firstDate(records), today)

      const done = !!(todayCell && todayCell.count > 0)
      if (done) todayDone += 1
      if (streak.current > maxStreak) maxStreak = streak.current

      const todayValue = todayCell ? todayCell.value : 0

      return {
        habit,
        dayMap,
        done,
        todayCount: todayCell ? todayCell.count : 0,
        todayText: stats.fmtNum(todayValue),
        streak: streak.current,
        totalText: stats.fmtNum(all.totalValue),
        totalCount: all.totalCount
      }
    })

    this.setData({
      items,
      hasHabits: items.length > 0,
      overviewMap,
      overviewWeeks,
      todayDone,
      todayTotal: items.length,
      todayPercent: items.length ? Math.round((todayDone / items.length) * 100) : 0,
      maxStreak,
      dateLabel: this.buildDateLabel()
    }, done)
  },

  /** 记录里最早的日期，用于「累计」统计的起点；无记录时退回今天 */
  firstDate(records) {
    return records.length ? records[0].d : dayjs.today()
  },

  // ---------------- 交互 ----------------

  /** 打开详情页 */
  onCardTap(e) {
    const id = e.detail.id
    wx.navigateTo({ url: '/pages/habit-detail/habit-detail?id=' + id })
  },

  /**
   * 卡片上的「打卡」= **快捷打卡**：直接记一笔，不打开弹层。
   *
   * 首页是「一屏扫过去、顺手点一下」的场景，为了记一次默认量的打卡而弹一个
   * 要读、要等、要关的面板，成本比动作本身还高。需要填数值 / 备注的时候，
   * 点卡片进详情、或用概览区的「去打卡」，走的是弹层那条精细路线。
   *
   * 记的数值固定是 1：这个动作的语义就是「今天打过卡了」，
   * 不套用 habit.step（那是弹层里快捷档位的幅度）。
   */
  onCardCheckin(e) {
    const habit = storage.getHabit(e.detail.id)
    if (!habit) return

    try {
      storage.addRecord(habit.id, dayjs.today(), QUICK_CHECKIN_VALUE, '')
    } catch (err) {
      this.handleStorageError(err)
      return
    }

    // 轻微震动反馈，和弹层里的打卡保持一致
    if (storage.getSettings().haptic) {
      wx.vibrateShort({ type: 'light', fail: () => {} })
    }

    app.bumpDataVersion()
    this.refresh()
    wx.showToast({ title: '已打卡', icon: 'none' })
  },

  /** 长按卡片 -> 编辑 */
  onCardLongPress(e) {
    const habit = storage.getHabit(e.detail.id)
    if (!habit) return
    this.setData({ showEditor: true, editingHabit: habit })
  },

  onOpenOverviewCheckin() {
    // 概览区的「去打卡」：优先打开第一个尚未打卡的习惯
    const pending = this.data.items.find((it) => !it.done) || this.data.items[0]
    if (!pending) {
      this.onAddHabit()
      return
    }
    this.setData({ showCheckin: true, checkinHabit: pending.habit, checkinDate: dayjs.today() })
  },

  onAddHabit() {
    this.setData({ showEditor: true, editingHabit: null })
  },

  onCloseEditor() {
    this.setData({ showEditor: false, editingHabit: null })
  },

  onCloseCheckin() {
    this.setData({ showCheckin: false, checkinHabit: null })
  },

  /** 编辑器提交：新建或更新习惯 */
  onSubmitHabit(e) {
    const payload = e.detail.habit
    try {
      storage.saveHabit(payload)
    } catch (err) {
      this.handleStorageError(err)
      return
    }
    app.bumpDataVersion()
    this.setData({ showEditor: false, editingHabit: null })
    this.refresh()
    wx.showToast({ title: payload.id ? '已保存' : '创建成功', icon: 'success' })
  },

  /** 编辑器删除 */
  onDeleteHabit(e) {
    const { id, name } = e.detail

    const doDelete = () => {
      const removed = storage.deleteHabit(id)
      app.bumpDataVersion()
      this.setData({ showEditor: false, editingHabit: null })
      this.refresh()
      wx.showToast({ title: '已删除 ' + removed + ' 条记录', icon: 'none' })
    }

    // 恒定二次确认，不提供开关：删习惯会级联删掉它全部打卡记录且不可恢复，
    // 没有「以后别问了」的合理场景
    wx.showModal({
      title: '删除「' + name + '」？',
      content: '该习惯下的全部打卡记录会一并删除，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#FF5C5C',
      success: (res) => {
        if (res.confirm) doDelete()
      }
    })
  },

  /** 打卡弹层数据变更后刷新首页 */
  onCheckinChange() {
    app.bumpDataVersion()
    this.refresh()
  },

  /** 一键载入示例数据，帮助新用户快速理解应用 */
  onSeedDemo() {
    wx.showModal({
      title: '载入示例数据',
      content: '将创建 4 个示例习惯和最近 30 天的模拟打卡记录，方便你先体验功能，随时可在「我的」里清空。',
      confirmText: '载入',
      success: (res) => {
        if (!res.confirm) return
        try {
          const r = storage.seedDemoData()
          app.bumpDataVersion()
          this.refresh()
          wx.showToast({ title: '已生成 ' + r.records + ' 条记录', icon: 'none' })
        } catch (err) {
          this.handleStorageError(err)
        }
      }
    })
  },

  /** 存储写满的统一处理 */
  handleStorageError(err) {
    if (err && err.code === 'QUOTA_EXCEEDED') {
      wx.showModal({
        title: '本地存储已满',
        content: '小程序本地空间上限为 10MB，当前已写满。请到「我的 - 存储管理」导出备份后清理历史数据。',
        showCancel: false
      })
    } else {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      console.error('[index] storage error', err)
    }
  }
})
