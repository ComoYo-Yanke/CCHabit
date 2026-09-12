/**
 * 关于页
 *
 * 纯静态页面，不含任何数据读写：
 *   1. 小程序自身信息（名称 / 版本 / 一句话介绍）
 *   2. 数据与隐私说明（数据只在本机）
 *   3. 最近更新（更新日志）
 *   4. 开发者信息（名称 / 邮箱 / GitHub / 简介）
 *
 * 版本号与「我的」页保持同一份定义，改这里记得同步 settings.js。
 *
 * 小程序没法直接跳外链（web-view 只认业务域名，个人开发者通常没有），
 * 所以 GitHub 走的是「复制地址」：复制完用户自己粘到浏览器里打开。
 */
const APP_VERSION = '1.0.2'

/** 更新日志：新的在最上面，版本号与 APP_VERSION 对得上即可 */
const CHANGELOG = [
  {
    version: '1.0.2',
    date: '2026-09-12',
    items: [
      '打卡总览可以左右滑动，从头翻到第一条记录',
      '首页习惯卡片上的「打卡」改为快捷打卡：点一下直接记一笔，不再弹窗',
      '修掉了弹层收起后仍有残留（主页偶尔冒出「背单词」等字样）的问题',
      '修掉了弹层打开时滑不动、反而滚动背景页面的问题',
      '修掉了统计页「上一周 / 上一月 / 上一年」点不动的问题',
      '弹层不再占满屏幕（最多 68%），创建习惯时可以下滑看到全部内容',
      '底部标签切换加了淡入过渡',
      '移除了每日目标与进度条，打卡就是记个数'
    ]
  },
  {
    version: '1.0.1',
    date: '2026-09-11',
    items: [
      '修复部分已知 bug',
      '弹层确认按钮移到标题栏，不再被内容挤出可视区',
      '图表在弹层打开时不再浮在最上层'
    ]
  }
]

Page({
  data: {
    version: APP_VERSION,
    changelog: CHANGELOG,
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
      { icon: '🗓️', title: '热力日历', desc: '从第一条记录铺到今天，左右滑动回看全部坚持' }
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
