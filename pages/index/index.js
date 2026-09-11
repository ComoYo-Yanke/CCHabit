/**
 * 首页仪表盘
 *
 * 结构：
 *   1. 顶部问候 + 今日概览（完成数 / 连续天数）
 *   2. 全部习惯的合并热力点阵（近 26 周）
 *   3. 习惯卡片列表（单卡自带近 12 周点阵、今日数值、连续天数）
 *   4. 右下角悬浮按钮：新建习惯
 *
 * 数据全部来自本地 storage，页面 onShow 时重新汇总。
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const stats = require('../../utils/stats.js')
const dayjs = require('../../utils/date.js')

/** 首页合并热力图展示的周数 */
const OVERVIEW_WEEKS = 26
/** 卡片内迷你热力图展示的周数 */
const CARD_WEEKS = 12

Page({
  data: {
    statusBarHeight: 20,

    // 今日概览
    dateLabel: '',
    greeting: '',
    todayDone: 0,
    todayTotal: 0,
    todayPercent: 0,
    maxStreak: 0,

    // 合并热力图
    overviewMap: {},
    overviewWeeks: OVERVIEW_WEEKS,

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
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      dateLabel: this.buildDateLabel(),
      greeting: this.buildGreeting()
    })
  },

  onShow() {
    this.refresh()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    // 从「我的 / 统计」页点「新建习惯」跳过来时，把编辑弹层直接打开，
    // 否则用户切到首页后只看到一个 + 按钮，会以为功能坏了
    if (app.consumePendingAction() === 'newHabit') this.onAddHabit()
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
   */
  refresh() {
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

      const target = Number(habit.target) || 0
      const todayValue = todayCell ? todayCell.value : 0

      return {
        habit,
        dayMap,
        done,
        todayCount: todayCell ? todayCell.count : 0,
        todayText: stats.fmtNum(todayValue),
        streak: streak.current,
        progress: target > 0 ? Math.min(100, Math.round((todayValue / target) * 100)) : 0,
        totalText: stats.fmtNum(all.totalValue),
        totalCount: all.totalCount
      }
    })

    this.setData({
      items,
      hasHabits: items.length > 0,
      overviewMap,
      todayDone,
      todayTotal: items.length,
      todayPercent: items.length ? Math.round((todayDone / items.length) * 100) : 0,
      maxStreak,
      dateLabel: this.buildDateLabel()
    })
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

  /** 打开打卡弹层 */
  onCardCheckin(e) {
    const habit = storage.getHabit(e.detail.id)
    if (!habit) return
    this.setData({ showCheckin: true, checkinHabit: habit, checkinDate: dayjs.today() })
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

    // 尊重「删除前二次确认」偏好
    if (!storage.getSettings().confirmDelete) {
      doDelete()
      return
    }

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
