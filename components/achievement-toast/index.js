/**
 * 成就解锁提示 —— 从屏幕最上方滑下来的一条小卡片。
 *
 * 页面**不需要写任何逻辑**：组件自己在 pageLifetimes.show 里取一次待弹队列
 * （utils/achievements.js 的 takePending），进页面 / 切回页面就会把
 * 这一轮新解锁的成就依次弹出来。页内动作（打卡、补签、加任务）完成之后，
 * 想让当页立刻弹，调一下 this.selectComponent('#ach-toast').pull() 即可。
 *
 * 队列在这里而不是在页面里：一次可能同时解锁好几条（老用户第一次升级尤其明显），
 * 逐条弹、每条自己退场，页面不用管「弹完一条再弹下一条」。
 */
const achievements = require('../../utils/achievements.js')

/** 每条停留多久（用户点一下可以提前收走） */
const HOLD_MS = 2800
/** 退场动画时长，和 wxss 里的 transition 对齐 */
const LEAVE_MS = 260

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  data: {
    show: false,
    current: null
  },

  lifetimes: {
    attached() {
      this._queue = []
      this._holdTimer = null
      this._leaveTimer = null
    },
    detached() {
      clearTimeout(this._holdTimer)
      clearTimeout(this._leaveTimer)
    }
  },

  pageLifetimes: {
    // 每次页面显示都来看一眼：老数据在第一次 evaluate() 时就会被算成已完成，
    // 所以这里也是「补算历史成就」的触发点
    show() {
      this.pull()
    }
  },

  methods: {
    /** 取走待弹的成就，追加到队列末尾开始播 */
    pull() {
      const list = achievements.takePending()
      if (!list.length) return
      this._queue = (this._queue || []).concat(list)
      if (!this.data.show) this.next()
    },

    next() {
      clearTimeout(this._holdTimer)
      clearTimeout(this._leaveTimer)
      if (!this._queue || !this._queue.length) return
      const item = this._queue.shift()
      this.setData({ current: item, show: true })
      this._holdTimer = setTimeout(() => this.dismiss(), HOLD_MS)
    },

    dismiss() {
      clearTimeout(this._holdTimer)
      if (!this.data.show) return
      // 先播退场，收完再放下一张 —— 直接换 current 会看不出「又来了一个」
      this.setData({ show: false })
      this._leaveTimer = setTimeout(() => {
        if (this._queue && this._queue.length) {
          this.next()
        } else {
          this.setData({ current: null })
        }
      }, LEAVE_MS)
    },

    onTap() {
      this.dismiss()
    },

    noop() {}
  }
})
