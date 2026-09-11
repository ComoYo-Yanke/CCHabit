/*
 * 打卡日期锁的自测：把 checkin-sheet 组件本体加载进来，直接驱动它的方法。
 *
 * 为什么要真加载组件而不是查源码字符串：
 * 「只能打卡当天」这件事的约束力不在于界面上少了几个按钮，而在于
 * onSubmit / onEditRecord / onDeleteRecord 开头那道 blockedByReadonly()。
 * 界面藏按钮只能防住正常点击，防不住残留状态、防不住零点跨天。
 * 只有真的调一遍这些方法、再看 storage 有没有被写，才算测到了约束本身。
 *
 * 另外还要守住「未来日期夹回今天」：日历/热力图虽然已经拦了未来，
 * 但组件是公开的，不能指望调用方永远传对。
 */
const path = require('path')
process.chdir(path.join(__dirname, '..'))

// ---------------- 假 wx ----------------
const store = {}
const toasts = []
const modals = []
global.wx = {
  getStorageSync: (k) => (k in store ? JSON.parse(JSON.stringify(store[k])) : ''),
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)) },
  removeStorageSync: (k) => { delete store[k] },
  getStorageInfoSync: () => ({
    keys: Object.keys(store),
    currentSize: Math.round(JSON.stringify(store).length / 1024),
    limitSize: 10240
  }),
  showToast: (o) => { toasts.push(o && o.title) },
  showModal: (o) => { modals.push(o) },
  vibrateShort: () => {}
}

// ---------------- 加载组件定义 ----------------
const defs = []
global.Component = (d) => { defs.push(d) }
require('../components/checkin-sheet/index.js')
if (defs.length !== 1) {
  console.error('期望 checkin-sheet 只注册一个组件，实际 ' + defs.length)
  process.exit(1)
}
const def = defs[0]

const storage = require('../utils/storage.js')
const dayjs = require('../utils/date.js')

let fail = 0
const ok = (name, cond, extra) => {
  if (cond) console.log('ok   ' + name)
  else { fail++; console.log('FAIL ' + name + '  ' + (extra !== undefined ? JSON.stringify(extra) : '')) }
}

// ---------------- 组件实例 ----------------
/** 造一个够用的组件实例：data / setData / triggerEvent / 全部 methods */
function makeInstance() {
  const inst = {
    data: JSON.parse(JSON.stringify(def.data)),
    setData(patch, cb) {
      Object.assign(this.data, patch)
      if (cb) cb()
    },
    triggerEvent() {}
  }
  Object.keys(def.methods).forEach((k) => { inst[k] = def.methods[k].bind(inst) })
  return inst
}

/** 模拟 setData({show:true, habit, date}) 触发 observers 的那条路径 */
function open(habit, date) {
  toasts.length = 0
  modals.length = 0
  const inst = makeInstance()
  // 真机上 properties 先落到 data 上，observers 才被触发；这里手工补上这一步
  inst.data.show = true
  inst.data.habit = habit
  def.observers['show, habit, date'].call(inst, true, habit, date)
  return inst
}

// ---------------- 造数据 ----------------
storage.ensureInit()
const habit = storage.saveHabit({ name: '背单词', unit: '个', icon: '书', target: 50, step: 10 })

const TODAY = dayjs.today()
const YESTERDAY = dayjs.addDays(TODAY, -1)
const LONG_AGO = dayjs.addDays(TODAY, -30)
const TOMORROW = dayjs.addDays(TODAY, 1)

storage.addRecord(habit.id, TODAY, 50, '今天第一条')
storage.addRecord(habit.id, YESTERDAY, 30)
storage.addRecord(habit.id, LONG_AGO, 10)

const reload = () => storage.getRecords(habit.id).length

console.log('== 1. 打开今天：可编辑 ==')
{
  const inst = open(habit, TODAY)
  ok('activeDate 是今天', inst.data.activeDate === TODAY, inst.data.activeDate)
  ok('readonly 为 false', inst.data.readonly === false)
  ok('当天记录已载入', inst.data.dayCount === 1, inst.data.dayCount)
  ok('日期标签是「今天」', inst.data.dateLabel === '今天', inst.data.dateLabel)
}

console.log('== 2. 打开过去的日子：只读，但看得到记录 ==')
{
  const inst = open(habit, YESTERDAY)
  ok('activeDate 保留为过去那天', inst.data.activeDate === YESTERDAY, inst.data.activeDate)
  ok('readonly 为 true', inst.data.readonly === true)
  ok('仍然载入了那天的记录', inst.data.dayCount === 1 && inst.data.records[0].value === '30', inst.data.records)
  ok('标签是「昨天」', inst.data.dateLabel === '昨天', inst.data.dateLabel)
  ok('快捷档位没有残留录入态', inst.data.editingId === '' && inst.data.value === '')
}

console.log('== 3. 未来日期 / 非法日期一律夹回今天 ==')
{
  const future = open(habit, TOMORROW)
  ok('未来 -> 今天', future.data.activeDate === TODAY, future.data.activeDate)
  ok('未来 -> 可编辑（就是今天）', future.data.readonly === false)

  ok('非法日期 2026-02-30 -> 今天', open(habit, '2026-02-30').data.activeDate === TODAY)
  ok('空字符串 -> 今天', open(habit, '').data.activeDate === TODAY)
  ok('undefined -> 今天', open(habit, undefined).data.activeDate === TODAY)
  ok('乱码 -> 今天', open(habit, 'yesterday').data.activeDate === TODAY)
}

console.log('== 4. 只读状态下所有写入口都写不进 storage ==')
{
  const inst = open(habit, YESTERDAY)
  const before = reload()

  inst.setValue('99')
  inst.onSubmit()
  ok('onSubmit 没写库', reload() === before, { before, after: reload() })
  ok('onSubmit 给了提示', toasts.indexOf('只能打卡当天') >= 0, toasts)

  toasts.length = 0
  inst.onDeleteRecord({ currentTarget: { dataset: { id: inst.data.records[0].id } } })
  ok('onDeleteRecord 没写库', reload() === before)
  ok('onDeleteRecord 连确认框都没弹', modals.length === 0, modals.length)
  ok('onDeleteRecord 给了提示', toasts.indexOf('只能打卡当天') >= 0, toasts)

  const id = inst.data.records[0].id
  inst.onEditRecord({ currentTarget: { dataset: { id } } })
  ok('onEditRecord 进不了修改模式', inst.data.editingId === '', inst.data.editingId)
}

console.log('== 5. 今天照常能打卡 / 能改 / 能删 ==')
{
  const inst = open(habit, TODAY)
  const before = reload()

  inst.setValue('25')
  inst.onSubmit()
  ok('onSubmit 写入了新记录', reload() === before + 1, { before, after: reload() })

  const fresh = open(habit, TODAY)
  const target = fresh.data.records[fresh.data.records.length - 1]
  fresh.onEditRecord({ currentTarget: { dataset: { id: target.id } } })
  ok('onEditRecord 进入了修改模式', fresh.data.editingId === target.id, fresh.data.editingId)

  fresh.setValue('77')
  fresh.onSubmit()
  const edited = storage.getRecords(habit.id).filter((r) => r.id === target.id)[0]
  ok('修改落库', Number(edited.v) === 77, edited.v)

  modals.length = 0
  fresh.onDeleteRecord({ currentTarget: { dataset: { id: target.id } } })
  ok('删除弹了确认框', modals.length === 1)
  modals[0].success({ confirm: true })
  ok('删除落库', storage.getRecords(habit.id).filter((r) => r.id === target.id).length === 0)
}

console.log('== 6. 弹层开着跨过零点：不能把新一天的记录写到昨天 ==')
{
  // 打开时是今天，之后把 activeDate 退一天 —— 这正是「23:59 打开、00:01 提交」
  // 在组件里留下的状态。守卫必须重新和时钟比，不能信 data.readonly。
  const inst = open(habit, TODAY)
  inst.setData({ activeDate: YESTERDAY, readonly: false }) // 故意把 stale 的 readonly 塞回去
  const before = reload()

  inst.setValue('5')
  inst.onSubmit()
  ok('跨零点后写不进昨天', reload() === before, { before, after: reload() })
  ok('跨零点后给了提示', toasts.indexOf('只能打卡当天') >= 0, toasts)
}

console.log('== 7. 组件不再提供任何切日期的入口 ==')
{
  const names = Object.keys(def.methods)
  ;['onPrevDay', 'onNextDay', 'onDatePick', 'shiftDate'].forEach((m) => {
    ok('已移除 ' + m, names.indexOf(m) < 0)
  })
}

console.log(fail ? '\n发现 ' + fail + ' 个问题' : '\n✓ 打卡日期锁测试全部通过')
process.exit(fail ? 1 : 0)
