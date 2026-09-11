/**
 * 自定义 tabBar（深色主题，图标为内联 SVG，无需图片资源）
 *
 * 使用方式：页面 onShow 中调用
 *   if (typeof this.getTabBar === 'function' && this.getTabBar()) {
 *     this.getTabBar().setData({ selected: 0 })
 *   }
 */
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
    ]
  },

  methods: {
    onTap(e) {
      const index = e.currentTarget.dataset.index
      const path = this.data.list[index].pagePath
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
