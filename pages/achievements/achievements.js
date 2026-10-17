/**
 * 成就页 —— 从「我的」进来。
 *
 * 只列**已完成**的成就：没拿到的不显示（需求），所以这里不画灰头像、不画进度条。
 * 每条记着**第一次完成**的日期和累计次数（次数口径见 utils/achievements.js 顶部的注释）。
 *
 * 页面本身不判断达成条件：进来时 refresh() 先让 achievements.evaluate() 把现有数据
 * 现算一遍，再取 listCompleted()。这样老用户第一次打开这一页就能看到该有的那些。
 */
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')
const quotes = require('../../utils/quotes.js')
const achievements = require('../../utils/achievements.js')

/** 'YYYY-MM-DD' -> '2026年10月17日' */
function dateLabel(str) {
  const parts = String(str || '').split('-')
  if (parts.length !== 3) return ''
  return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日'
}

Page({
  data: {
    ...pageFade.data,
    themeName: theme.DEFAULT_THEME,
    themeStyle: '',
    quote: null,
    list: [],
    doneCount: 0
  },

  onLoad() {
    this.syncTheme()
  },

  onShow() {
    this.syncTheme()
    this.setData({ quote: quotes.next() })
    this.refresh(() => pageFade.show(this))
  },

  onReady() {
    pageFade.ready(this)
  },

  /** 复访也要先回到透明（见 utils/page-fade.js） */
  onHide() {
    pageFade.leave(this)
  },

  syncTheme() {
    const name = theme.current()
    theme.applyWindow(name)
    const style = theme.cssVars(name) + ';'
    if (style !== this.data.themeStyle || name !== this.data.themeName) {
      this.setData({ themeName: name, themeStyle: style })
    }
  },

  refresh(done) {
    // 先算一遍：老数据里的成就会在这一步被解锁（见 utils/achievements.js）
    achievements.evaluate()
    const list = achievements.listCompleted().map((item) =>
      Object.assign({}, item, { dateText: dateLabel(item.firstAt) })
    )
    this.setData({ list, doneCount: list.length }, done)
  }
})
