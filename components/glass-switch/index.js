/**
 * 玻璃开关 —— 替掉原生 <switch>。
 *
 * 为什么自己画：原生 <switch> 是**原生组件**，WXSS 完全够不着它（只能通过 color /
 * activeColor 两个属性改两个色值），做不成演示里那种「玻璃轨道 + 弹性旋钮」。
 *
 * 对外接口刻意做成和原生一样，页面那边一行都不用改：
 *   - 属性 checked / color 与原生同名同义（color 不给就跟着主题的主色走）；
 *   - 抛 `change` 事件，`e.detail.value` 就是新值 —— 页面里 `e.detail.value` 照旧能读；
 *   - 组件节点上的 `data-*` 仍然会出现在父级处理函数的 `e.currentTarget.dataset` 里。
 *
 * 动效照演示（液态玻璃参考.html 的 .toggle）：
 *   - 旋钮位移 0.55s cubic-bezier(.2, 1.6, .4, 1.2) —— 带过冲的弹性缓动，会「弹」一下；
 *   - 轨道底色 0.4s ease 从灰过渡到彩色；
 *   - 按下整体 scale(1.06)，和其它玻璃面一致。
 */
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim())
  if (!m) return ''
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')'
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    checked: { type: Boolean, value: false },
    /** 打开时的轨道色。不给就空着，由 wxss 退回主题的主色 */
    color: { type: String, value: '' }
  },

  data: {
    /** 按下时整体放大一点点（和 .btn / .press 同一套手感） */
    pressing: false,
    /** 打开时的行内底色 / 辉光；关着时是空串，走 wxss 里那套凹玻璃 */
    onStyle: ''
  },

  observers: {
    'checked, color': function () {
      this.sync()
    }
  },

  lifetimes: {
    /*
     * observers 在**首次赋值**时不一定跑（各基础库版本行为不一致），
     * 不补这一下，页面一进来若是「开着」的状态，轨道会是关着那套灰色。
     */
    attached() {
      this.sync()
    }
  },

  methods: {
    /** 按 checked / color 现算「打开」那一档的行内样式；关着是空串，走 wxss 那套凹玻璃 */
    sync() {
      const c = this.data.color || '#5B8CFF'
      const on = this.data.checked
        ? 'background: linear-gradient(145deg, ' + rgba(c, 0.95) + ' 0%, ' + rgba(c, 0.74) + ' 100%);' +
          ' box-shadow: 0 6rpx 20rpx ' + rgba(c, 0.35) + ', inset 0 1rpx 2rpx rgba(0, 0, 0, 0.12),' +
          ' inset 0 -1rpx 0 rgba(255, 255, 255, 0.25);'
        : ''
      if (on !== this.data.onStyle) this.setData({ onStyle: on })
    },

    onDown() {
      if (!this.data.pressing) this.setData({ pressing: true })
    },

    onUp() {
      if (this.data.pressing) this.setData({ pressing: false })
    },

    /**
     * 点一下翻转。**不吃外部传进来的 checked** —— 由页面在 change 里改 checked 再传回来，
     * 和原生 <switch> 一样是「受控」的：页面不认账就不会动，不会出现两边各说各话。
     */
    onTap() {
      this.triggerEvent('change', { value: !this.data.checked })
    }
  }
})
