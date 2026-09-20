/**
 * 全部版本记录
 *
 * 从「关于」页那张卡片底部的「更早的版本记录」进来，铺开 utils/version.js 的**整份**
 * CHANGELOG —— 关于页那边只留最近一版（它的栏目就叫「最近更新」，铺满就没人看），
 * 想看历史的都在这一页。
 *
 * 为什么单独一页而不是在关于页「点开看全部」：整份日志有十几版、上百条，
 * 展开在关于页会把那一页撑得极长，把隐私说明和开发者信息挤到很下面。
 *
 * 页面底部保留 GitHub 那一行（和开发者那栏同一个地址）：
 * 这一页记的是「更新了什么」，仓库里还有 diff、issue 和更细的说明，值得留个入口。
 * 但小程序打不开外链（web-view 只认业务域名），所以走的还是「复制地址」，
 * 复制完用户自己粘到浏览器 —— 和关于页的处理一致。
 */
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')
const quotes = require('../../utils/quotes.js')
const { APP_VERSION, CHANGELOG } = require('../../utils/version.js')

/**
 * 仓库地址。和 pages/about 的 developer.github 是同一个 ——
 * 两处都是「复制地址」的入口，改地址记得两边一起改。
 */
const GITHUB = 'https://github.com/ComoYo-Yanke/CCHabit'

Page({
  data: {
    ...pageFade.data,
    version: APP_VERSION,
    /**
     * 整份日志（新的在最上面，version.js 里的顺序就是展示顺序）。
     * 不再 slice：这一页存在的意义就是不截断。
     */
    changelog: CHANGELOG,
    count: CHANGELOG.length,
    github: GITHUB,
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',
    /** 顶上那行名言，由 onShow 填（见 utils/quotes.js） */
    quote: null
  },

  onLoad() {
    this.syncTheme()
  },

  onShow() {
    pageFade.show(this)
    this.syncTheme()
    // 每次进来翻一句（和其它页共用同一份顺序，见 utils/quotes.js）
    this.setData({ quote: quotes.next() })
  },

  onReady() {
    pageFade.ready(this)
  },

  syncTheme() {
    const name = theme.current()
    theme.applyWindow(name)
    const style = theme.cssVars(name) + ';'
    if (style !== this.data.themeStyle || name !== this.data.themeName) {
      this.setData({ themeName: name, themeStyle: style })
    }
  },

  /** 复制仓库地址（小程序打不开外链，只能这样给） */
  onCopyGithub() {
    wx.setClipboardData({
      data: this.data.github,
      success: () => wx.showToast({ title: 'GitHub地址已复制！', icon: 'none' })
    })
  }
})
