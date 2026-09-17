/**
 * 首页习惯卡片
 *
 * 一个圆角方形的小卡，两列并排（栅格在 pages/index 的 .habit-grid）。
 * 只画三样：图标 + 名称、近 N 周圆点阵、连续天数与快捷打卡按钮。
 * 「今日打没打」交给点阵的最后一列去说，不再单列一块文字。
 *
 * 数据由页面预先汇总成 item 传入，卡片本身不做任何计算，保持轻量。
 */
Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    /**
     * {
     *   habit: Habit,
     *   dayMap: { 'YYYY-MM-DD': {count, value} },
     *   streak: Number,        当前连续天数
     *   done: Boolean          今日是否已打卡（卡片不画，页面挑「去打卡」的目标时用）
     * }
     */
    item: { type: Object, value: null },
    /** 卡片内热力图展示的周数 */
    weeks: { type: Number, value: 12 },
    /** 是否显示热力图 */
    showHeat: { type: Boolean, value: true }
  },

  methods: {
    onTapCard() {
      this.triggerEvent('tapcard', { id: this.data.item.habit.id })
    },

    onCheckin(e) {
      // 阻止冒泡到卡片，避免同时触发进入详情
      this.triggerEvent('checkin', { id: this.data.item.habit.id })
    },

    onLongPress() {
      this.triggerEvent('longpress', { id: this.data.item.habit.id })
    }
  }
})
