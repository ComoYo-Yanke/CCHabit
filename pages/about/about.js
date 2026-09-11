/**
 * 关于页
 *
 * 纯静态页面，不含任何数据读写：
 *   1. 小程序自身信息（名称 / 版本 / 一句话介绍）
 *   2. 数据与隐私说明（数据只在本机）
 *   3. 开发者信息（名称 / 邮箱 / 简介）
 *
 * 版本号与「我的」页保持同一份定义，改这里记得同步 settings.js。
 */
const APP_VERSION = '1.0.1'

Page({
  data: {
    version: APP_VERSION,
    developer: {
      name: 'CoMoYo-Yanke',
      email: 'comoyoyanke@outlook.com',
      github: 'https://github.com/ComoYo-Yanke/CCHabit',
      intro: '独立开发者，喜欢把日常里反复出现的小麻烦做成顺手的工具。习惯打卡也是出于自己「总记不住坚持了几天」的困扰而写，希望它同样能帮到你。感兴趣或者有什么好的建议可以联系我. 开源仓库：github.com/ComoYo-Yanke/CCHabit 开源精神万岁「饿死之前的幻想罢了」'
    },
    features: [
      { icon: '📝', title: '极简打卡', desc: '一次点击记一笔，支持数值与备注' },
      { icon: '🔥', title: '连续天数', desc: '今天还没打卡时给一天宽限，不清零' },
      { icon: '📊', title: '趋势图表', desc: '周 / 月 / 年区间切换，折线与柱状对比' },
      { icon: '🗓️', title: '热力日历', desc: '近 26 周完成情况，一眼看出坚持的痕迹' }
    ]
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
  
})
