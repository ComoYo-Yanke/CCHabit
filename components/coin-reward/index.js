/**
 * 完美一周的金币奖励弹窗。
 *
 * 只在**真的发出金币**那一刻显示，所以不做「挂载 / 退场」那一套延迟卸载 ——
 * 它跟着页面常驻，show 一开就是进场动画，关掉就回到 display: none。
 *
 * 动效全在 WXSS 里（弹一下 + 转一圈光 + 金币扫光），这里只管数据。
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    show: { type: Boolean, value: false },
    /** 这次发了几枚 */
    amount: { type: Number, value: 1 },
    /** 哪个习惯挣到的，写进文案 */
    habitName: { type: String, value: '' }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    noop() {}
  }
})
