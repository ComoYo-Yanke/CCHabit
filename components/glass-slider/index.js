/**
 * 玻璃滑块 —— 替掉原生 <slider>。
 *
 * 为什么自己画：和 <switch> 一样，原生 <slider> 是**原生组件**，WXSS 够不着，
 * 只有 activeColor / backgroundColor / block-size 几个属性，做不成演示里那种
 * 「凹玻璃轨道 + 强调色玻璃填充 + 一块会弹的玻璃把手」。
 *
 * 对外接口刻意照抄原生，页面那边只改标签名：
 *   - 属性 min / max / step / value / activeColor 与原生同名同义；
 *   - `changing` 拖动中连续抛、`change` 松手抛，都是 `e.detail.value`；
 *   - 组件节点上的 data-* 照样出现在 e.currentTarget.dataset 里。
 *
 * 拖动**不重新测量**每一帧：矩形在 touchstart 时量一次，整段拖动都用它 ——
 * 每帧一次 createSelectorQuery 会明显掉帧（那正是要避开的）。
 */
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim())
  if (!m) return ''
  return 'rgba(' + parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16) + ', ' + a + ')'
}

/** 把任意值夹到 [min, max] 并按 step 取整（浮点误差用 toFixed 收一下） */
function snap(v, min, max, step) {
  const s = step > 0 ? step : 1
  const n = Math.round((v - min) / s) * s + min
  const fixed = Math.round(n * 1000) / 1000
  return Math.min(max, Math.max(min, fixed))
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    min: { type: Number, value: 0 },
    max: { type: Number, value: 100 },
    step: { type: Number, value: 1 },
    value: { type: Number, value: 0 },
    /** 填充色，和原生同名。不给就退回主题主色 */
    activeColor: { type: String, value: '' },
    disabled: { type: Boolean, value: false }
  },

  data: {
    /** 把手与填充的位置（0~100），拖动时只改它 */
    percent: 0,
    fillStyle: '',
    thumbStyle: ''
  },

  observers: {
    'value, min, max, activeColor': function () {
      this.sync()
    }
  },

  lifetimes: {
    attached() {
      this.measure()
      /*
       * observers 在**首次赋值**时不一定跑（各基础库版本行为不一致），
       * 不补这一下，滑块一进来把手会停在最左边，要拖一下才归位。
       */
      this.sync()
    }
  },

  methods: {
    /** 按 value / min / max / activeColor 现算填充宽度与把手位置 */
    sync() {
      const { value, min, max, activeColor } = this.data
      const c = activeColor || '#5B8CFF'
      const span = max - min
      const p = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0
      this.setData({
        percent: p,
        fillStyle:
          'width: ' + p + '%; background: linear-gradient(90deg, ' + rgba(c, 0.55) + ' 0%, ' + rgba(c, 0.92) + ' 100%);' +
          ' box-shadow: 0 0 14rpx ' + rgba(c, 0.45) + ', inset 0 1rpx 0 rgba(255, 255, 255, 0.55);',
        thumbStyle: 'left: ' + p + '%;'
      })
    },

    /** 量轨道矩形。整段拖动只量这一次（见文件头） */
    measure() {
      this.createSelectorQuery()
        .select('.gslider')
        .boundingClientRect()
        .exec((res) => {
          if (res && res[0]) this._rect = res[0]
        })
    },

    /** 触点 → 数值。矩形没量到就直接放弃这一帧（下次 touchstart 会重量） */
    valueAt(clientX) {
      const r = this._rect
      if (!r || !r.width) return null
      const ratio = (clientX - r.left) / r.width
      const span = this.data.max - this.data.min
      return snap(this.data.min + Math.min(1, Math.max(0, ratio)) * span, this.data.min, this.data.max, this.data.step)
    },

    onStart(e) {
      if (this.data.disabled) return
      const t = e.touches && e.touches[0]
      if (!t) return
      this._dragging = true
      this._moved = false
      if (!this._rect) this.measure()
      const v = this.valueAt(t.clientX)
      if (v !== null) this.triggerEvent('changing', { value: v })
    },

    onMove(e) {
      if (!this._dragging || this.data.disabled) return
      const t = e.touches && e.touches[0]
      if (!t) return
      this._moved = true
      const v = this.valueAt(t.clientX)
      if (v !== null) this.triggerEvent('changing', { value: v })
    },

    onEnd(e) {
      if (!this._dragging) return
      this._dragging = false
      if (this.data.disabled) return
      const t = (e.changedTouches && e.changedTouches[0]) || null
      // 用的是**页面已经写回**的 value：拖动中页面在 changing 里存了值，这里只是收尾。
      // 拿不到 changedTouches 时按当前位置再算一次，兜个底
      const v = t ? this.valueAt(t.clientX) : null
      this.triggerEvent('change', { value: v === null ? this.data.value : v })
    },

    /** 点轨道直接跳过去（原生 slider 也是这个行为） */
    onTap(e) {
      if (this.data.disabled || this._dragging) return
      // 拖动过的那一下松手后框架仍可能补一个 tap，值跟刚抛出去的 change 一模一样 ——
      // 放过去就是白发一次 setData，这里吞掉
      if (this._moved) {
        this._moved = false
        return
      }
      const t = (e.changedTouches && e.changedTouches[0]) || (e.detail && { clientX: e.detail.x })
      if (!t || typeof t.clientX !== 'number') return
      const v = this.valueAt(t.clientX)
      if (v === null) return
      this.triggerEvent('changing', { value: v })
      this.triggerEvent('change', { value: v })
    },

    /** 吞掉拖动：手指在滑块上左右滑时页面不该跟着滚（原生 slider 也是这个行为） */
    noop() {}
  }
})
