/**
 * 首页习惯卡片
 *
 * 一个圆角方形的小卡，两列并排（栅格在 pages/index 的 .habit-grid）。
 * 只画三样：图标 + 名称、当月热力图、连续天数与快捷打卡按钮。
 * 「今日打没打」交给热力图里今天那一格去说，不再单列一块文字。
 *
 * 数据由页面预先汇总成 item 传入，卡片本身不做任何计算，保持轻量。
 */
Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    /**
     * {
     *   habit: Habit,
     *   cal: Array,            当月热力图格子（**周日开头**、已裁成卡片要的几项，见 pages/index 的 cardCalendar）
     *   streak: Number,        当前连续天数
     *   done: Boolean          今日是否已打卡（卡片不画，页面挑「去打卡」的目标时用）
     * }
     */
    item: { type: Object, value: null },
    /**
     * 热力图顶上那一行周几，按列对应，**周日在前**（1 = 周日 … 7 = 周六，和日历一样）。
     * 这是卡片特有的：utils/date.js 的一周起点是周一，格子也在页面那边换成了周日起排。
     * 是阿拉伯数字 1~7 而不是「一~日」：这几个字是给格子定列的，
     * 不是给人读的词，窄窄一格（24rpx）里数字比汉字短一半。
     */
    weekdays: { type: Array, value: [] },
    /** 是否显示当月热力图 */
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
