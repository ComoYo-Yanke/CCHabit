/**
 * utils/page-fade.js —— 底部 tab 切页时的淡入
 *
 * 底部 tab 走的是 switchTab：三个页面从头到尾都活着，切换只是把目标页从幕后
 * 搬到台前（onShow 会触发，但 DOM 没有任何节点被重建）。所以
 * 「给 .page 挂一条 CSS animation」是没用的 —— 它只播第一次，之后每次切页
 * 都纹丝不动。唯一能让动画重播的办法是让 animation-name 变成另一个名字：
 * 名字没变，浏览器就认为「还是那个动画」，不会重头开始。
 *
 * 于是 app.wxss 里备了两个内容完全相同的 @keyframes（pageFadeInA / pageFadeInB），
 * 这里维护一个在 'A' / 'B' 之间来回翻的键，每次 onShow 翻一次 —— 名字换一次，
 * 动画就重播一次。不用定时器，也不依赖 setData 的时序。
 *
 * 用法（三个 tab 页面各三行）：
 *
 *   const pageFade = require('../../utils/page-fade.js')
 *
 *   Page({
 *     data: { ...pageFade.data },
 *     onShow() { pageFade.play(this); ... }
 *   })
 *
 *   <view class="page page--fade" style="animation-name: pageFadeIn{{fadeKey}}">
 */
module.exports = {
  /**
   * 铺进页面 data 的初始值。
   * 写成 getter 而不是共享对象：几个页面都直接展开它，共享同一个对象字面量
   * 会让「一个页面改了、别的页面跟着变」这种事有发生的可能。
   */
  get data() {
    return { fadeKey: 'A' }
  },

  /** 在页面的 onShow 里调用，重播一次淡入 */
  play(page) {
    page.setData({ fadeKey: page.data.fadeKey === 'A' ? 'B' : 'A' })
  }
}
