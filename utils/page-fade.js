/**
 * utils/page-fade.js —— 页面切换的淡出 / 淡入
 *
 * 机制只有一个：`fading` 这个布尔量。`true` = 这一页必须是透明的。
 *   - 淡出（1 → 0）：切换时给当前页置 `true`，0.2s ease-in；
 *   - 淡入（0 → 1）：目标页 onShow 时置 `false`，0.26s 对称曲线。
 * 两个方向和两条曲线都写在 app.wxss 的 `.page--fade` / `.page--out` 里，
 * 这里只负责翻那个布尔量。**不用 @keyframes**，所以没有「动画优先级高于过渡」
 * 「fill-mode 把 opacity 钉死」「animation-name 不换名字就不重播」那一串坑。
 *
 * ===================== 关键不变量（只有这一条） =====================
 *
 * **没在显示的页面必须是透明的。** 框架把目标页搬上台前、到它的 onShow 跑起来
 * 之间隔着至少一帧，那一帧的透明度不由我们决定 —— 页面当时是什么透明度，
 * 用户就看到什么。所以页面**离开时**（onHide）必须自己置 `true`，
 * 数据初值也得是 `true`：新实例的第一帧就带着 `.page--out` 被画出来，
 * 之后 onShow 再把它拉回不透明。这条做到了，框架那一帧露出来的就是「透明」，
 * 用户看到的是干净的淡入，而不是「先整页闪一下」。
 *
 * 反过来，**绝不能在页面可见的时候置 `true`** —— 唯一的例外是切换那一下，
 * 那是故意的：先淡出，140ms（LEAVE_MS）后才真的 switchTab（见 custom-tab-bar 的 commit）。
 *
 * ======================== 触发时机为什么分两个 ========================
 *
 * 首次进入用 `onReady`（初次渲染完成），复访用 `onShow`。原因：首次进入时
 * onShow 早于布局落定，页面还在做它的第一轮重活（onLoad 读数据、图表初始化），
 * 动画叠在这些之上就是「闪」。onReady 才是「初次渲染完成」，这时起动画才干净。
 * 复访时页面早就建好了，页面结构、图表都在，onShow 直接淡入即可。
 *
 * ============================ 用法 ============================
 *
 *   const pageFade = require('../../utils/page-fade.js')
 *
 *   Page({
 *     data: { ...pageFade.data },
 *     onShow()  { pageFade.show(this); ... },   // 复访：直接淡入
 *     onReady() { pageFade.ready(this) },       // 首访：等初次渲染完成
 *     onHide()  { pageFade.leave(this) }        // 离开：必须是透明的
 *   })
 *
 *   <view class="page page--fade {{fading ? 'page--out' : ''}}">
 *
 * 三件事必须成对：wxml 上有 `page--fade`、onShow 里调了 show、onHide 里调了 leave。
 * 少了 onHide 那一下，这一页第二次被搬上台时就不是透明的了，会闪。
 */

/**
 * 淡出时长，与 app.wxss 里 .page--out 的 transition 保持一致。
 * 底栏切 tab 也是照它等：先淡出，到期才 switchTab（见 custom-tab-bar 的 commit）。
 */
const LEAVE_MS = 140

module.exports = {
  LEAVE_MS,

  /**
   * 铺进页面 data 的初始值。
   * 初值就是 true（透明）：新实例的第一帧必须是透明的，见上面的不变量。
   * 写成 getter 而不是共享对象，免得几个页面共享同一份 data。
   */
  get data() {
    return { fading: true }
  },

  /** 变不透明（淡入）。重复调用无意义，所以带守卫 */
  enter(page) {
    if (page && page.data.fading !== false) page.setData({ fading: false })
  },

  /** 变透明（淡出）。带守卫，理由同上 */
  leave(page) {
    if (page && page.data.fading !== true) page.setData({ fading: true })
  },

  /**
   * onShow 里调。
   * 首访的 onShow 早于 onReady —— 那时页面还没加载完，先不淡入，
   * 交给 ready() 在初次渲染完成后接手（见上面的「触发时机」）。
   */
  show(page) {
    if (page && page._fadeReady) this.enter(page)
  },

  /** onReady 里调：首访的淡入时机，一辈子只触发一次 */
  ready(page) {
    if (!page) return
    page._fadeReady = true
    this.enter(page)
  }
}
