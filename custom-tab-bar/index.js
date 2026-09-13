/**
 * 自定义 tabBar（图标为内联 SVG，无需图片资源）
 *
 * 使用方式：页面 onShow 中调用
 *   if (typeof this.getTabBar === 'function' && this.getTabBar()) {
 *     this.getTabBar().setActive(0)
 *   }
 *
 * 为什么是 setActive 而不是直接 setData({selected})：
 * tabBar 由框架**独立挂载**，不在页面的节点树里，拿不到 page 上的 CSS 变量
 * （见 index.wxss 顶部注释），底色只能由 JS 用行内样式写。而每个 tab 页各有一个
 * 自己的 tabBar 实例，主题变了以后其它页面的实例并不会自己更新 ——
 * 所以把「选中项」和「配色」绑在同一个入口里：页面每次 onShow 都会调它，
 * 顺手就把主题同步了，不会出现「页面切浅色了、底栏还是黑的」。
 */
const theme = require('../utils/theme.js')

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '习惯', icon: 'home' },
      { pagePath: '/pages/stats/stats', text: '统计', icon: 'chart' },
      { pagePath: '/pages/settings/settings', text: '我的', icon: 'user' }
    ],
    /** 行内样式用的色值，初值即深色，attach 后立刻按当前主题改写 */
    c: { bg: theme.vars('dark').tabbarBg, border: theme.vars('dark').tabbarBorder }
  },

  lifetimes: {
    attached() {
      this.syncTheme()
    }
  },

  methods: {
    /** 页面 onShow 调用：切换选中态 + 跟随当前主题 */
    setActive(index) {
      this.setData({ selected: index })
      this.syncTheme()
    },

    syncTheme() {
      const v = theme.vars(theme.current())
      const c = { bg: v.tabbarBg, border: v.tabbarBorder }
      if (c.bg !== this.data.c.bg || c.border !== this.data.c.border) this.setData({ c })
    },

    onTap(e) {
      const index = e.currentTarget.dataset.index
      const path = this.data.list[index].pagePath
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
