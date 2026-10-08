/**
 * 定时打卡任务页
 *
 * 从习惯详情页第一张卡片右上角的「定时任务」进来，管这一个习惯的自动打卡任务，
 * 每个习惯最多 storage.MAX_TASKS_PER_HABIT（5）个。
 *
 * 四种频率（用户的四条要求）：
 *   interval 间隔多久（时 / 分 / 秒）
 *   daily    每天的某个时刻
 *   weekly   每周的某几天 + 时刻
 *   monthly  每月的某天 + 时刻
 *
 * 关于「自动打卡」到底怎么落地：小程序没有后台执行能力，退出即停，所以真正的
 * 执行是**打开小程序时把错过的触发时刻补记上**，见 utils/scheduler.js 的开头。
 * 这一页只管编辑任务本身，补记是 app.js 在 onLaunch / onShow 里做的。
 *
 * 描述必填（用户要求：必须给自动任务添加描述）—— 它同时是补记出来的那笔记录的
 * 备注，用户在历史记录里一眼能看出「这条是几点那次的自动打卡」。
 */
const app = getApp()
const storage = require('../../utils/storage.js')
const pageFade = require('../../utils/page-fade.js')
const theme = require('../../utils/theme.js')
const quotes = require('../../utils/quotes.js')
const dayjs = require('../../utils/date.js')

/** 弹层退场过渡时长，和 app.wxss 里 .sheet 的 transition 对齐 */
const SHEET_LEAVE_MS = 260

/** 四种频率。顺序就是分段控制器上那四段的顺序，--seg-i 直接取下标 */
const KINDS = [
  { key: 'interval', label: '间隔' },
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'monthly', label: '每月' }
]

/** 间隔模式的三个时间单位（用户的「时分秒」） */
const UNITS = [
  { key: 'second', label: '秒' },
  { key: 'minute', label: '分' },
  { key: 'hour', label: '时' }
]

/** 星期。下标就是 Date.getDay() 的值（0=周日），和 storage 里 weekdays 存的口径一致 */
const WEEK = [
  { d: 0, cn: '日' },
  { d: 1, cn: '一' },
  { d: 2, cn: '二' },
  { d: 3, cn: '三' },
  { d: 4, cn: '四' },
  { d: 5, cn: '五' },
  { d: 6, cn: '六' }
]

/**
 * 给那 7 个格子标上「选中没有」。
 * 不写在 WXML 里是因为 WXML 的表达式**不支持函数调用**（`weekdays.indexOf(d)` 那种），
 * 只能在 JS 里算好了给过去。
 */
function weekPick(selected) {
  return WEEK.map((w) => ({ d: w.d, cn: w.cn, on: selected.indexOf(w.d) >= 0 }))
}

function pad2(n) {
  return dayjs.pad2(n)
}

function unitLabel(key) {
  const hit = UNITS.filter((u) => u.key === key)[0]
  return hit ? hit.label : '时'
}

/** 任务一句话说清「什么时候打」 */
function summaryOf(t) {
  const time = pad2(t.hh) + ':' + pad2(t.mm)
  if (t.kind === 'interval') return '每隔 ' + t.every + ' ' + unitLabel(t.unit)
  if (t.kind === 'daily') return '每天 ' + time
  if (t.kind === 'weekly') {
    const days = t.weekdays
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEK.filter((w) => w.d === d)[0].cn)
      .join('、')
    return '每周' + (days || '—') + ' ' + time
  }
  return '每月 ' + t.day + ' 号 ' + time
}

/** 视图层要用的那份：把能算的都算好，WXML 里不做逻辑 */
function decorate(t) {
  // 显示的是 lastFiredAt（真的触发过），不是 lastRunAt（每启动一次就推到现在的那道
  // 扫描位置）—— 后者拿来当「上次打卡」显示，会天天都写着今天
  let runText = '还没有自动打卡过'
  if (t.lastFiredAt) {
    const d = new Date(t.lastFiredAt)
    runText = '上次自动打卡 ' + dayjs.formatDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  }
  return Object.assign({}, t, {
    summary: summaryOf(t),
    runText: runText
  })
}

Page({
  data: {
    ...pageFade.data,
    habitId: '',
    habit: null,

    themeName: theme.DEFAULT_THEME,
    themeStyle: '',
    quote: null,

    kinds: KINDS,
    units: UNITS,
    weekPick: weekPick([]),
    max: storage.MAX_TASKS_PER_HABIT,

    tasks: [],
    /** 还能再加几个 —— 到 0 就把「新增任务」收起来 */
    remain: storage.MAX_TASKS_PER_HABIT,

    // ---------------- 编辑弹层 ----------------
    sheetMounted: false,
    sheetActive: false,
    isEdit: false,
    kindIndex: 0,
    form: emptyForm(),
    error: ''
  },

  onLoad(options) {
    this.syncTheme()
    this.setData({ habitId: (options && options.id) || '' })
  },

  onShow() {
    pageFade.show(this)
    this.syncTheme()
    this.setData({ quote: quotes.next() })
    this.refresh()
  },

  onReady() {
    pageFade.ready(this)
  },

  syncTheme() {
    const name = theme.current()
    theme.applyWindow(name)
    const style = theme.cssVars(name) + ';'
    if (style !== this.data.themeStyle || name !== this.data.themeName) {
      this.setData({ themeName: name, themeStyle: style })
    }
  },

  refresh() {
    const habit = storage.getHabit(this.data.habitId)
    if (!habit) {
      // 习惯在读出来之前被删了（比如从别的页面删完退回来），给一句提示再退出去，
      // 否则这一页会显示成「一个没有主人的任务列表」
      wx.showModal({
        title: '习惯已删除',
        content: '这个习惯已经不存在了，定时任务也一并删掉了。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    const tasks = storage.getTasks(habit.id).map(decorate)
    this.setData({
      habit: habit,
      tasks: tasks,
      remain: Math.max(0, storage.MAX_TASKS_PER_HABIT - tasks.length)
    })
  },

  // ------------------------------------------------------------------
  // 弹层开关
  // ------------------------------------------------------------------

  onAdd() {
    if (this.data.remain <= 0) {
      wx.showToast({ title: '最多 ' + this.data.max + ' 个定时任务', icon: 'none' })
      return
    }
    this.setData({
      isEdit: false,
      kindIndex: 1,
      form: emptyForm(),
      weekPick: weekPick([]),
      error: '',
      sheetMounted: true
    })
    wx.nextTick(() => {
      if (this.data.sheetMounted) this.setData({ sheetActive: true })
    })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const task = this.data.tasks.filter((t) => t.id === id)[0]
    if (!task) return
    const kindIndex = Math.max(0, KINDS.map((k) => k.key).indexOf(task.kind))
    this.setData({
      isEdit: true,
      kindIndex: kindIndex,
      error: '',
      form: {
        id: task.id,
        kind: task.kind,
        every: String(task.every),
        unit: task.unit,
        timeValue: pad2(task.hh) + ':' + pad2(task.mm),
        weekdays: task.weekdays.slice(),
        day: String(task.day),
        count: String(task.count),
        desc: task.desc
      },
      weekPick: weekPick(task.weekdays),
      sheetMounted: true
    })
    wx.nextTick(() => {
      if (this.data.sheetMounted) this.setData({ sheetActive: true })
    })
  },

  onCloseSheet() {
    if (!this.data.sheetMounted) return
    this.setData({ sheetActive: false })
    this._unmountTimer = setTimeout(() => this.setData({ sheetMounted: false }), SHEET_LEAVE_MS)
  },

  /** 挡住点击面板时冒泡到遮罩导致关闭 */
  noop() {},

  onUnload() {
    clearTimeout(this._unmountTimer)
  },

  // ------------------------------------------------------------------
  // 表单
  // ------------------------------------------------------------------

  onPickKind(e) {
    const kind = e.currentTarget.dataset.kind
    const kindIndex = Math.max(0, KINDS.map((k) => k.key).indexOf(kind))
    // 从「每周」切走时把选中的星期清掉：切回来还留着上一轮的选择会让人以为没生效。
    // 反过来进「每周」时如果一天都没选，默认勾上今天那一格，省得先报一次错
    let weekdays = []
    if (kind === 'weekly') weekdays = this.data.form.weekdays.length ? this.data.form.weekdays : [new Date().getDay()]
    this.setData({
      kindIndex: kindIndex,
      error: '',
      weekPick: weekPick(weekdays),
      'form.kind': kind,
      'form.weekdays': weekdays
    })
  },

  onPickUnit(e) {
    this.setData({ 'form.unit': e.currentTarget.dataset.unit })
  },

  onToggleWeek(e) {
    const d = Number(e.currentTarget.dataset.day)
    const list = this.data.form.weekdays.slice()
    const i = list.indexOf(d)
    if (i >= 0) list.splice(i, 1)
    else list.push(d)
    this.setData({ 'form.weekdays': list, weekPick: weekPick(list), error: '' })
  },

  onTimeChange(e) {
    this.setData({ 'form.timeValue': e.detail.value })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const patch = {}
    patch['form.' + field] = e.detail.value
    patch.error = ''
    this.setData(patch)
  },

  onSubmit() {
    const f = this.data.form
    const time = (f.timeValue || '08:00').split(':')
    const payload = {
      id: f.id,
      kind: f.kind,
      every: f.every,
      unit: f.unit,
      hh: Number(time[0]),
      mm: Number(time[1]),
      weekdays: f.kind === 'weekly' ? f.weekdays : [],
      day: f.day,
      count: f.count,
      desc: (f.desc || '').trim(),
      enabled: true
    }

    if (!payload.desc) {
      this.setData({ error: '请填写任务描述' })
      return
    }

    try {
      storage.saveTask(this.data.habitId, payload)
    } catch (err) {
      this.handleError(err)
      return
    }
    app.bumpDataVersion()
    this.onCloseSheet()
    this.refresh()
    wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success' })
  },

  // ------------------------------------------------------------------
  // 列表项上的操作
  // ------------------------------------------------------------------

  onToggleEnabled(e) {
    const id = e.currentTarget.dataset.id
    try {
      storage.setTaskEnabled(this.data.habitId, id, e.detail.value)
    } catch (err) {
      this.handleError(err)
      return
    }
    app.bumpDataVersion()
    this.refresh()
  },

  onDelete(e) {
    this.doDelete(e.currentTarget.dataset.id)
  },

  /**
   * 删一条任务。列表和弹层里的删除都走这里，只是收尾不同（弹层那个还要关弹层）。
   * 恒定二次确认：删掉之后那段没打上的卡不会补回来，属于不可撤销。
   */
  doDelete(id, done) {
    const task = this.data.tasks.filter((t) => t.id === id)[0]
    if (!task) return
    wx.showModal({
      title: '删除这个定时任务？',
      content: '「' + task.desc + '」会停止自动打卡，已经记下的记录不受影响。',
      confirmText: '删除',
      confirmColor: '#FF5C5C',
      success: (res) => {
        if (!res.confirm) return
        storage.deleteTask(this.data.habitId, id)
        app.bumpDataVersion()
        this.refresh()
        if (done) done()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  /** 弹层头部的「删除」—— 删的正是当前在编的那一条 */
  onDeleteFromSheet() {
    const id = this.data.form.id
    if (!id) return
    this.doDelete(id, () => this.onCloseSheet())
  },

  /** 弹层里出错：能改的就写在表单里让用户改，其余的弹一句 */
  handleError(err) {
    const code = err && err.code
    if (code === 'TASK_DESC_REQUIRED' || code === 'TASK_WEEKDAY_REQUIRED' || code === 'TASK_LIMIT') {
      this.setData({ error: err.message })
      return
    }
    if (code === 'QUOTA_EXCEEDED') {
      wx.showModal({
        title: '本地存储已满',
        content: '请到「我的 - 存储管理」导出备份后清理历史数据。',
        showCancel: false
      })
      return
    }
    console.error('[schedule] storage error', err)
    wx.showToast({ title: '保存失败，请重试', icon: 'none' })
  }
})

/** 新建时的空表单：默认「每天 08:00 记 1 条」，这是最常见的那种定时打卡 */
function emptyForm() {
  return {
    id: '',
    kind: 'daily',
    every: '1',
    unit: 'hour',
    timeValue: '08:00',
    weekdays: [],
    day: '1',
    count: '1',
    desc: ''
  }
}
