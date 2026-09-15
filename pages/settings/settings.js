/**
 * 个人设置 / 数据管理页
 *
 * 包含：
 *   1. 数据概览（习惯数、记录数、使用天数）
 *   2. 存储管理（用量进度条 + 导出 / 导入 / 清空）
 *   3. 习惯管理（启停开关、进入详情编辑）
 *   4. 外观（浅色 / 深色 / 跟随系统）
 *   5. 偏好设置（震动反馈）
 *   6. 关于（数据仅存本地，不上云）
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const dayjs = require('../../utils/date.js')
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')

/** 导入弹层的退场过渡时长，与 app.wxss 里 .sheet 的 transform transition 保持一致 */
const SHEET_LEAVE_MS = 260

Page({
  data: {
    ...pageFade.data,
    statusBarHeight: 20,

    habitCount: 0,
    recordCount: 0,
    usedDays: 0,

    usage: { currentSize: 0, limitSize: 10240, percent: 0, level: 'ok' },
    usageText: '',

    settings: { haptic: true, theme: theme.DEFAULT_THEME },

    // ---- 外观 ----
    themeOptions: theme.OPTIONS,
    /** 解析后的实际主题名 'dark' | 'light'，也是给图表组件传的值 */
    themeName: theme.DEFAULT_THEME,
    /** 给 page-meta 的 page-style，整页换肤靠它（见 wxml 顶部注释） */
    themeStyle: '',
    /** 段落右上角的状态说明 */
    themeHint: '',

    habits: [],

    // 导入弹层
    showImport: false,
    importText: '',
    /** 弹层是否已挂载到 DOM（false = display:none，整棵子树不渲染） */
    importMounted: false,
    /** 弹层是否已展开（驱动入场 / 退场过渡） */
    importActive: false,

    version: '1.0.4'
  },

  onLoad() {
    // 先把设置读进来再落地主题：syncTheme 读的是 data.settings.theme，
    // 而 onLoad 时 data 里还只是默认值。顺序反了就会先按深色画一帧再跳成浅色。
    this.setData({ settings: storage.getSettings() })
    this.syncTheme()
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 })
  },

  onUnload() {
    clearTimeout(this._unmountTimer)
  },

  onShow() {
    // 复访：页面早就建好了，直接淡入（首访交给 onReady，见 utils/page-fade.js）
    pageFade.show(this)
    this.refresh()
    // 系统主题可能在离开期间变过，「跟随系统」要重新解析一次
    this.syncTheme()
    this.syncTabBar()
  },

  /**
   * 首访的淡入时机：等初次渲染完成再起动画。
   * onShow 早于布局落定，页面还在做第一轮重活（读数据、重绘），
   * 动画叠在上面就是「闪」（见 utils/page-fade.js 的「触发时机」）。
   */
  onReady() {
    pageFade.ready(this)
  },

  /** 离开时必须把自己变透明，否则下次被搬上台的那一帧会整页闪一下（见 utils/page-fade.js） */
  onHide() {
    pageFade.leave(this)
  },

  /** tabBar 在页面的节点树之外，主题得由页面主动推过去（见 custom-tab-bar/index.js） */
  syncTabBar() {
    if (typeof this.getTabBar !== 'function') return
    const tb = this.getTabBar()
    if (tb) tb.setActive(2)
  },

  /**
   * 把当前主题落到三个地方，缺一不可：
   *   themeStyle —— 写进 page 的行内样式，重写 CSS 变量，这是真正换肤的一步；
   *   themeName  —— 解析后的主题名，给 canvas 图表用（它读不到 CSS 变量）；
   *   themeHint  —— 段落右上角的状态文案。
   */
  syncTheme() {
    const setting = this.data.settings.theme || theme.DEFAULT_THEME
    const name = theme.resolve(setting, theme.system())
    // labelOf 取的是选项文案；解析出来的 'light' / 'dark' 恰好也是这两个选项，
    // 所以同一个函数两处都能用，不必再维护第二份中英对照
    const cn = theme.labelOf(name)
    theme.applyWindow(name)
    this.setData({
      themeName: name,
      themeStyle: theme.cssVars(name) + ';',
      themeHint: setting === 'system' ? theme.labelOf(setting) + ' · 当前' + cn : '始终' + cn
    })
  },

  onPickTheme(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.settings.theme) return
    storage.saveSettings({ theme: key })
    // 先改设置再 syncTheme：后者读的是 data 里的值
    this.setData({ 'settings.theme': key }, () => {
      this.syncTheme()
      this.syncTabBar()
    })
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
    clearTimeout(this._unmountTimer)
    // 先挂载成「收起姿态」，下一帧再展开，入场过渡才有起点
    this.setData({ showImport: true, importText: '', importMounted: true })
    wx.nextTick(() => {
      if (this.data.showImport) this.setData({ importActive: true })
    })
  },

  onCloseImport() {
    if (!this.data.importMounted) return
    // 先摘 --on 播完退场动画，过渡走完再摘挂载落到 display:none
    this.setData({ showImport: false, importActive: false })
    this._unmountTimer = setTimeout(() => this.setData({ importMounted: false }), SHEET_LEAVE_MS)
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
          // 走 onCloseImport 而不是直接 setData：弹层是「挂载 + 展开」两级状态，
          // 只把 showImport 置 false 会留下一块已经展开但没人收的遮罩
          this.onCloseImport()
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
