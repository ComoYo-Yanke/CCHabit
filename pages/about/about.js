/**
 * 关于页
 *
 * 基本上是静态页：
 *   1. 小程序自身信息（名称 / 版本 / 一句话介绍）
 *   2. 开屏更新公告的开关（**本页唯一一处读写 storage 的地方**）
 *   3. 数据与隐私说明（数据只在本机）
 *   4. 最近更新（更新日志）
 *   5. 开发者信息（名称 / 邮箱 / GitHub / 简介）
 *
 * 版本号与更新日志来自 utils/version.js，和「我的」页、首页的更新弹窗是同一份。
 *
 * 小程序没法直接跳外链（web-view 只认业务域名，个人开发者通常没有），
 * 所以 GitHub 走的是「复制地址」：复制完用户自己粘到浏览器里打开。
 */
const storage = require('../../utils/storage.js')
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

/**
 * 备案号与工信部官网。
 * 网址写全 https://，小程序里复制出去才好直接粘进浏览器。
 * （用户给的是 beian.miit,gov.cn，中间那个逗号是笔误，正式域名是 miit.gov.cn）
 */
const BEIAN = '蜀ICP备2026054876号'
const BEIAN_URL = 'https://beian.miit.gov.cn'

Page({
  data: {
    ...pageFade.data,
    version: APP_VERSION,
    changelog: CHANGELOG.slice(0, CHANGELOG_LIMIT),
    hasMoreLog: CHANGELOG.length > CHANGELOG_LIMIT,
    beian: BEIAN,
    // 主题：themeStyle 供 page-meta 换肤，themeName 是 app-bg 判断「还该不该显示背景图」的信号
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',
    /**
     * 「此次更新不再显示公告」的开关状态，即 storage 里的
     * `updateMuted === 当前版本号`。
     *
     * 不另存一个布尔量：那个值本来就是「这一个版本被压掉了」的意思，
     * 反推出来的开关和弹窗里那个勾选框天生一致 —— 在弹窗里勾一下、
     * 回到这一页开关自己就是开的，不需要任何同步代码。
     */
    updateMuted: false,
    /**
     * 原生 switch 拿不到 CSS 变量，颜色只能从 JS 给 ——
     * 所以这里取当前主题的主色，自定义主题下才跟着用户调的色走
     * （写死 #5B8CFF 的话，换成自定义主题这个开关就还是蓝的）。
     */
    accent: '#5B8CFF',
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
    // 在 onShow 里读：用户可能刚从首页那个弹窗上勾了「此次更新不再显示」再过来，
    // 状态得跟上（开关就是那个值反推的，见 data.updateMuted）
    const muted = storage.getSettings().updateMuted === APP_VERSION
    if (muted !== this.data.updateMuted) this.setData({ updateMuted: muted })
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
    // switch 的原生色：单拎出来比一次，换主题时不会因为上面那条提前返回而留在旧色上
    const accent = theme.vars(name)['--accent']
    if (accent && accent !== this.data.accent) this.setData({ accent })
  },

  /**
   * 「此次更新不再显示公告」开关。
   *
   * 写的和首页那个弹窗里的勾选框是**同一个字段**（storage 的 updateMuted），
   * 只是这里落地的是**当前版本号**。打开 = 记下当前版本号（于是下次启动不弹），
   * 关掉 = 清空（于是下次启动照弹）。
   */
  onToggleUpdateNotice(e) {
    const muted = !!(e.detail && e.detail.value)
    storage.saveSettings({ updateMuted: muted ? APP_VERSION : '' })
    this.setData({ updateMuted: muted })
    wx.showToast({
      title: muted ? '本次更新不再提示' : '恢复开屏更新公告',
      icon: 'none'
    })
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

  /** 「更早的版本记录」：进「版本记录」页看全部（那里底部另留了 GitHub 的复制入口） */
  onMoreLog() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  /**
   * 备案号。
   *
   * 这条记录按规矩要指向工信部官网，但小程序**打不开外链**（web-view 只认业务域名，
   * 个人开发者基本拿不到），所以退一步：点了复制地址，再提示用户去浏览器粘。
   * 和开发者那栏的 GitHub 是同一套处理 —— 是平台限制，不是偷懒。
   */
  onCopyBeian() {
    wx.setClipboardData({
      data: BEIAN_URL,
      success: () => wx.showToast({ title: '工信部网址已复制，粘到浏览器打开', icon: 'none' })
    })
  }
})
