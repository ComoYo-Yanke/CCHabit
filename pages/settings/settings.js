/**
 * 个人设置 / 数据管理页
 *
 * 包含：
 *   1. 数据概览（习惯数、记录数、使用天数）
 *   2. 存储管理（用量进度条 + 导出 / 导入 / 清空）
 *   3. 习惯管理（启停开关、进入详情编辑）
 *   4. 偏好设置（震动反馈、删除确认）
 *   5. 关于（数据仅存本地，不上云）
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const dayjs = require('../../utils/date.js')

Page({
  data: {
    statusBarHeight: 20,

    habitCount: 0,
    recordCount: 0,
    usedDays: 0,

    usage: { currentSize: 0, limitSize: 10240, percent: 0, level: 'ok' },
    usageText: '',

    settings: { haptic: true, confirmDelete: true },

    habits: [],

    // 导入弹层
    showImport: false,
    importText: '',

    version: '1.0.1'
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 })
  },

  onShow() {
    this.refresh()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  refresh() {
    const habits = storage.getHabits()
    const recordsMap = storage.getRecordsMap()
    const usage = storage.getUsage()
    const settings = storage.getSettings()

    let recordCount = 0
    Object.keys(recordsMap).forEach((hid) => {
      recordCount += (recordsMap[hid] || []).length
    })

    // 使用天数：从首次打开小程序算起（含今天）
    const meta = wx.getStorageSync(storage.KEYS.META) || {}
    const created = meta.createdAt ? dayjs.formatDate(new Date(meta.createdAt)) : dayjs.today()
    const usedDays = Math.max(1, dayjs.diffDays(created, dayjs.today()) + 1)

    this.setData({
      habits: habits.map((h) => ({
        id: h.id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        unit: h.unit,
        enabled: h.enabled,
        count: (recordsMap[h.id] || []).length
      })),
      habitCount: habits.length,
      recordCount,
      usedDays,
      usage,
      usageText: usage.currentSize + ' KB / ' + (usage.limitSize / 1024).toFixed(0) + ' MB',
      settings
    })
  },

  // ---------------- 存储管理 ----------------

  /** 导出：把全部数据复制到剪贴板，用户可粘贴到备忘录留存 */
  onExport() {
    const text = storage.exportData()
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '导出成功',
          content: '全部数据（' + this.data.habitCount + ' 个习惯 / ' + this.data.recordCount + ' 条记录）已复制到剪贴板，粘贴到备忘录即可备份。',
          showCancel: false
        })
      },
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    })
  },

  onOpenImport() {
    this.setData({ showImport: true, importText: '' })
  },

  onCloseImport() {
    this.setData({ showImport: false })
  },

  noop() {},

  onImportInput(e) {
    this.setData({ importText: e.detail.value })
  },

  onImportConfirm() {
    const text = (this.data.importText || '').trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴备份数据', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认导入？',
      content: '导入会覆盖当前的全部习惯与打卡记录，且无法撤销。建议先导出备份。',
      confirmText: '覆盖导入',
      confirmColor: '#FF5C5C',
      success: (res) => {
        if (!res.confirm) return
        try {
          const r = storage.importData(text)
          app.bumpDataVersion()
          this.setData({ showImport: false })
          this.refresh()
          wx.showModal({
            title: '导入完成',
            content: '已导入 ' + r.habits + ' 个习惯、' + r.records + ' 条打卡记录。',
            showCancel: false
          })
        } catch (err) {
          if (err && err.code === 'INVALID_JSON') {
            wx.showModal({ title: '数据格式有误', content: err.message, showCancel: false })
          } else if (err && err.code === 'QUOTA_EXCEEDED') {
            wx.showModal({ title: '存储空间不足', content: '数据量超出小程序 10MB 本地上限，请先清空再导入。', showCancel: false })
          } else {
            wx.showToast({ title: '导入失败', icon: 'none' })
            console.error('[settings] import error', err)
          }
        }
      }
    })
  },

  /** 清空全部数据：两步确认，避免误触 */
  onClearAll() {
    wx.showModal({
      title: '清空全部数据',
      content: '将删除所有习惯与打卡记录，且无法恢复。确定继续吗？',
      confirmText: '继续',
      confirmColor: '#FF5C5C',
      success: (res) => {
        if (!res.confirm) return
        wx.showModal({
          title: '再次确认',
          content: '这是最后一次确认，点击「清空」后数据立即消失。',
          confirmText: '清空',
          confirmColor: '#FF5C5C',
          success: (res2) => {
            if (!res2.confirm) return
            storage.clearAll()
            app.bumpDataVersion()
            this.refresh()
            wx.showToast({ title: '已清空', icon: 'none' })
          }
        })
      }
    })
  },

  // ---------------- 习惯管理 ----------------

  onToggleHabit(e) {
    const id = e.currentTarget.dataset.id
    const enabled = e.detail.value
    storage.setHabitEnabled(id, enabled)
    app.bumpDataVersion()
    this.refresh()
    wx.showToast({ title: enabled ? '已启用' : '已停用', icon: 'none' })
  },

  onHabitTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/habit-detail/habit-detail?id=' + id })
  },

  onAddHabit() {
    // switchTab 不支持传参，先把「要新建习惯」记到全局，首页 onShow 时弹编辑层
    app.requestNewHabit()
    wx.switchTab({ url: '/pages/index/index' })
  },

  // ---------------- 偏好 ----------------

  onToggleSetting(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    storage.saveSettings({ [field]: value })
    this.setData({ ['settings.' + field]: value })
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  }
})
