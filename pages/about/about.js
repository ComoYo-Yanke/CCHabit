/**
 * 关于页
 *
 * 纯静态页面，不含任何数据读写：
 *   1. 小程序自身信息（名称 / 版本 / 一句话介绍）
 *   2. 数据与隐私说明（数据只在本机）
 *   3. 最近更新（更新日志）
 *   4. 开发者信息（名称 / 邮箱 / GitHub / 简介）
 *
 * 版本号与更新日志来自 utils/version.js，和「我的」页、首页的更新弹窗是同一份。
 *
 * 小程序没法直接跳外链（web-view 只认业务域名，个人开发者通常没有），
 * 所以 GitHub 走的是「复制地址」：复制完用户自己粘到浏览器里打开。
 */
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')
// 版本号与更新日志的唯一一份定义（「我的」页和首页的更新弹窗读的是同一份）
const { APP_VERSION, CHANGELOG } = require('../../utils/version.js')

/**
 * 页面上最多铺几条版本记录。
 *
 * 只铺 **1 条**：这段叫「最近更新」，那它就该只讲最近这一版。铺三条时页面上会出现
 * 三个版本号和三组「修复了…」，读者一眼扫不出「这次更新了什么」——
 * 而这个栏目唯一的作用就是回答这一句。
 *
 * 更早的记录不在这里展开（包括不做「点开看全部」）—— 这个列表是给人扫一眼的，
 * 铺满了就没人看。想看历史的走 GitHub 仓库，和开发者那栏一样是复制地址。
 */
const CHANGELOG_LIMIT = 1

Page({
  data: {
    ...pageFade.data,
    version: APP_VERSION,
    changelog: CHANGELOG.slice(0, CHANGELOG_LIMIT),
    hasMoreLog: CHANGELOG.length > CHANGELOG_LIMIT,
    // 主题：themeStyle 供 page-meta 换肤，themeName 是 app-bg 判断「还该不该显示背景图」的信号
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',
    developer: {
      name: 'CoMoYo-Yanke',
      email: 'comoyoyanke@outlook.com',
      github: 'https://github.com/ComoYo-Yanke/CCHabit',
      intro: '独立开发者，喜欢把日常里反复出现的小麻烦做成顺手的工具。希望能帮到你。感兴趣或者有什么好的建议可以联系我或访问GitHub仓库'
    },
    features: [
      { icon: '📝', title: '极简打卡', desc: '一次点击记一笔，支持数值与备注' },
      { icon: '🔥', title: '连续天数', desc: '今天还没打卡时给一天宽限，不清零' },
      { icon: '📊', title: '趋势图表', desc: '周 / 月 / 年区间切换，折线与柱状对比' },
      { icon: '🗓️', title: '热力日历', desc: '从第一条记录铺到今天，左右滑动回看全部坚持' }
    ]
  },

  onLoad() {
    // 本页没有 tabBar，也没有图表，主题只需要落到 page-style 这一处
    this.syncTheme()
  },

  onShow() {
    pageFade.show(this)
    this.syncTheme()
  },

  /** 首访的淡入时机：等初次渲染完成再起动画（见 utils/page-fade.js） */
  onReady() {
    pageFade.ready(this)
  },

  syncTheme() {
    const name = theme.current()
    theme.applyWindow(name)
    const style = theme.cssVars(name) + ';'
    // 两个都得比：themeName 是 app-bg 判断「还该不该显示背景图」的信号，
    // 只看 style 的话名字的变化会被这次提前返回吞掉
    if (style !== this.data.themeStyle || name !== this.data.themeName) {
      this.setData({ themeName: name, themeStyle: style })
    }
  },

  /** 复制开发者邮箱，方便反馈问题 */
  onCopyEmail() {
    wx.setClipboardData({
      data: this.data.developer.email,
      success: () => wx.showToast({ title: '邮箱已复制', icon: 'none' })
    })
  },
  onCopyGithub() {
    wx.setClipboardData({
      data: this.data.developer.github,
      success: () => wx.showToast({ title: 'GitHub地址已复制！', icon: 'none' })
    })
  },

  /**
   * 「更多版本记录」。
   * 刻意不展开列表：小程序打不开外链（web-view 只认业务域名），
   * 所以把仓库地址复制给用户，让他自己粘到浏览器里看。
   */
  onMoreLog() {
    wx.setClipboardData({
      data: this.data.developer.github,
      success: () => wx.showToast({ title: '仓库地址已复制，粘到浏览器即可', icon: 'none' })
    })
  }
})
