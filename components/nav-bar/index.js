/**
 * 自定义顶部导航栏
 * - 适配状态栏高度与右上角胶囊按钮（navigationStyle: custom）
 * - 左侧可显示返回按钮；右侧留出胶囊按钮的避让空间
 */
const app = getApp()

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    /** 是否显示返回按钮 */
    back: { type: Boolean, value: false },
    /** true = 固定在顶部并带毛玻璃背景；false = 跟随内容滚动 */
    fixed: { type: Boolean, value: false },
    /** 固定模式下页面滚动后加深背景，由页面在 onPageScroll 中传入 */
    scrolled: { type: Boolean, value: false }
  },

  data: {
    statusBarHeight: 20,
    /** 导航栏内容区高度（px），与胶囊按钮对齐 */
    barHeight: 44,
    /** 右侧避让宽度：胶囊宽度 + 间距 */
    rightGutter: 100
  },

  lifetimes: {
    attached() {
      const g = (app && app.globalData) || {}
      const menu = g.menuButton
      const statusBarHeight = g.statusBarHeight || 20
      const windowWidth = g.windowWidth || 375

      // 内容区高度 = 胶囊高度 + 上下各 4px 呼吸位；拿不到胶囊信息时退回 44px
      const barHeight = menu && menu.height ? menu.height + 8 : 44
      const rightGutter = menu && menu.width ? windowWidth - menu.left + 8 : 100

      this.setData({ statusBarHeight, barHeight, rightGutter })
    }
  },

  methods: {
    onBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        // 直接从分享/扫码进入详情页时没有上一页，兜底回首页
        wx.switchTab({ url: '/pages/index/index' })
      }
    }
  }
})
