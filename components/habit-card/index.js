/**
 * 首页习惯卡片
 *
 * 展示单个习惯的：今日打卡状态、连续天数、近 N 周热力概览、目标进度。
 * 数据由页面预先汇总成 item 传入，卡片本身不做任何计算，保持轻量。
 */
Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    /**
     * {
     *   habit: Habit,
     *   dayMap: { 'YYYY-MM-DD': {count, value} },
     *   todayCount: Number,    今日打卡次数
     *   todayText: String,     今日累计数值（已格式化）
     *   streak: Number,        当前连续天数
     *   progress: Number,      0-100，未设目标时为 0
     *   done: Boolean          今日是否已打卡
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
