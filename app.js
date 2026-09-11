/**
 * app.js —— 应用入口
 *
 * 本应用为纯本地小程序：无服务端、不发起任何网络请求，
 * 所有数据通过 utils/storage.js 持久化到 wx.storage。
 */
const storage = require('./utils/storage.js')

App({
  globalData: {
    /** 状态栏高度（px），自定义导航栏使用 */
    statusBarHeight: 20,
    /** 胶囊按钮区域信息，用于自定义导航栏对齐 */
    menuButton: null,
    /** 安全区底部高度（px），自定义 tabBar 使用 */
    safeBottom: 0,
    /** 屏幕宽度（px） */
    windowWidth: 375,
    /** 数据变更版本号：任一页面写入数据后 +1，其他页面 onShow 时据此判断是否需要刷新 */
    dataVersion: 0,
    /**
     * 跨 tab 的「待办动作」。
     * switchTab 不能带参数，所以「我的 / 统计」页里的「新建习惯」按钮
     * 只能先在这里打个标记，等首页 onShow 时再把编辑弹层弹出来。
     */
    pendingAction: ''
  },

  onLaunch() {
    this.initSystemInfo()
    // 首次启动时做一次存储结构初始化 / 版本迁移
    storage.ensureInit()
  },

  /**
   * 读取设备信息，计算自定义导航栏与底部安全区所需尺寸。
   * 使用新版 getWindowInfo / getMenuButtonBoundingClientRect（旧 API 已废弃）。
   */
  initSystemInfo() {
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect
        ? wx.getMenuButtonBoundingClientRect()
        : null

      this.globalData.statusBarHeight = win.statusBarHeight || 20
      this.globalData.windowWidth = win.windowWidth || 375
      this.globalData.menuButton = menu

      const safeArea = win.safeArea
      this.globalData.safeBottom = safeArea
        ? Math.max(0, (win.screenHeight || safeArea.bottom) - safeArea.bottom)
        : 0
    } catch (e) {
      // 读取失败时保留默认值，不影响主流程
      console.warn('[app] 获取系统信息失败', e)
    }
  },

  /**
   * 通知全局数据已变更，页面在 onShow 时比对版本号决定是否重新拉取数据。
   */
  bumpDataVersion() {
    this.globalData.dataVersion += 1
  },

  /**
   * 请求「切到首页并打开新建习惯弹层」。
   * 供「我的」「统计」这两个 tab 页的入口按钮调用，避免它们
   * 只做 switchTab、把用户丢到首页却什么都不弹。
   */
  requestNewHabit() {
    this.globalData.pendingAction = 'newHabit'
  },

  /** 首页消费一次待办动作（消费后即清空，避免重复弹出） */
  consumePendingAction() {
    const action = this.globalData.pendingAction
    this.globalData.pendingAction = ''
    return action
  }
})
