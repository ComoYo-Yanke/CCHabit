/**
 * utils/achievements.js —— 成就系统
 *
 * 设计：
 *   - 成就不单独记录「进度」，而是每次从**现有数据**里现算有没有达成。
 *     好处是新装 / 老用户升级时不用补一段迁移逻辑：第一次调用 evaluate()
 *     就会把「按已有数据已经满足」的成就一次性解锁（需求里的「马上算完成」）。
 *   - 每条成就只持久化两样东西：**首次完成日期** firstAt 和**完成次数** count。
 *     次数取历史最大值 —— 删记录、金币年度重置都不会让已经拿到的次数倒退。
 *   - 解锁（或次数增加）的那一刻推进 pending 队列，页面 onShow / 动作结束后
 *     takePending() 取走，用顶部那条弹窗提示。
 *
 * 次数的口径（「成就可记录次数」）：
 *   - 连续类：每满 7 天 / 365 天记一次（连续 14 天 = ×2）；
 *   - 累计类：每个达到 30 天的习惯记一次；
 *   - 补签：补过的次数；回来看看：两次打卡间隔超过 15 天的次数；
 *   - 门槛类（习惯数 / 任务数 / 金币）：只要跨过门槛就是 1 次；
 *   - 真的吗：一天各条记录数值之和 > 10000 的天数；
 *   - 早起的鸟儿：连续 7 天每天都有 8 点前打卡，每满 7 天记一次；
 *   - 挑灯夜战：1-5 点打卡的记录条数；
 *   - 所以我放弃了xxx：事件型，删一个连续坚持 > 30 天的习惯记一次（见 noteHabitDeleted）。
 */
const storage = require('./storage.js')
const dayjs = require('./date.js')
const coins = require('./coins.js')

/**
 * 成就定义。顺序就是成就页上的展示顺序。
 * 没完成的**不展示**（需求），所以这里只管「是什么」。
 */
const DEFS = [
  { key: 'rookie', icon: '🌱', name: '初出茅庐', desc: '首次添加习惯并完成打卡' },
  { key: 'streak7', icon: '🔥', name: '小试牛刀', desc: '一个习惯连续打卡 7 天' },
  { key: 'habit10', icon: '📅', name: '档期排满', desc: '添加超过 10 个习惯' },
  { key: 'auto1', icon: '⚙️', name: '全自动', desc: '添加第一个定时任务' },
  { key: 'auto10', icon: '🤖', name: '自动化时代', desc: '添加超过 10 个定时任务' },
  { key: 'days30', icon: '💪', name: '坚持不懈', desc: '一个习惯累计打卡 30 天' },
  { key: 'compensate1', icon: '🩹', name: '勤能补拙', desc: '使用补签一次' },
  { key: 'streak365', icon: '🏔️', name: '从未放弃', desc: '一个习惯连续打卡 365 天' },
  { key: 'coin30', icon: '🪙', name: '小康', desc: '积攒 30 枚金币' },
  { key: 'coin50', icon: '💰', name: '小财主', desc: '积攒 50 枚金币' },
  { key: 'coin100', icon: '💎', name: '大富豪', desc: '积攒 100 枚金币' },
  { key: 'coin500', icon: '👑', name: '首富', desc: '积攒 500 枚金币' },
  { key: 'comeback', icon: '👋', name: '哟，还知道回来啊', desc: '一个习惯两次打卡间隔超过 15 天' },
  // 看数值，不是看「打了多少次卡」：同一天的多条记录按数值加起来算
  { key: 'bigvalue', icon: '🤯', name: '真的吗', desc: '一天打卡的数值超过 10000' },
  // 事件型：习惯删掉之后记录就没了，只能在删除前记下来（见 noteHabitDeleted）
  { key: 'abandon30', icon: '🏳️', name: '所以我放弃了xxx', desc: '删除一个坚持超过 30 天的习惯' },
  { key: 'early7', icon: '🐦', name: '早起的鸟儿...', desc: '连续 7 天有早上 8 点前的打卡' },
  { key: 'night1', icon: '🌙', name: '挑灯夜战！', desc: '凌晨 1-5 点打卡一次' }
]

/** 本次启动 / 本页还没弹出来的新成就 */
let pending = []

/** 一串已排序的日期里，每一段连续打卡各有多长（单日也算一段） */
function runsOf(dates) {
  const runs = []
  let run = 0
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || dayjs.diffDays(dates[i - 1], dates[i]) === 1) {
      run += 1
    } else {
      runs.push(run)
      run = 1
    }
  }
  if (run) runs.push(run)
  return runs
}

/** 单个习惯的日期统计：去重、连续段、间隔、补签次数、单日数值、时段 */
function statsOfHabit(records) {
  const seen = {}
  const early = {}
  const valueByDay = {}
  let compensate = 0
  let night = 0

  records.forEach((r) => {
    if (!r || !r.d) return
    seen[r.d] = 1
    // 「一天打卡的数值」是当天各条记录的数值之和，不是打卡条数
    valueByDay[r.d] = (valueByDay[r.d] || 0) + (Number(r.v) || 0)
    if (r.n === '补签') compensate += 1

    // 时段看记录的 t（定时任务补记时存的是触发时刻，不是补记那一刻）。
    // 没有 t 的老记录 / 外来备份不参与，不拿当前时间冒充
    const ts = Number(r.t)
    if (ts > 0) {
      const h = new Date(ts).getHours()
      if (h >= 1 && h <= 5) night += 1
      if (h < 8) early[r.d] = 1
    }
  })

  const dates = Object.keys(seen).sort()

  let gaps = 0
  for (let i = 1; i < dates.length; i++) {
    // 两次打卡之间隔了超过 15 天（第 15 天不算，第 16 天才算）
    if (dayjs.diffDays(dates[i - 1], dates[i]) > 15) gaps += 1
  }

  let bigDays = 0
  Object.keys(valueByDay).forEach((d) => {
    if (valueByDay[d] > 10000) bigDays += 1
  })

  return {
    days: dates.length,
    runs: runsOf(dates),
    gaps: gaps,
    compensate: compensate,
    bigDays: bigDays,
    night: night,
    earlyRuns: runsOf(Object.keys(early).sort())
  }
}

/** 从现有数据算出每条成就在此刻的「完成次数」（0 = 没完成） */
function compute() {
  const habits = storage.getHabits()
  const recordsMap = storage.getRecordsMap()
  const tasksMap = storage.getTasksMap()
  const balance = coins.snapshot().balance

  let anyRecord = 0
  let streak7 = 0
  let streak365 = 0
  let days30 = 0
  let compensate1 = 0
  let comeback = 0
  let bigvalue = 0
  let early7 = 0
  let night1 = 0

  habits.forEach((h) => {
    const records = recordsMap[h.id] || []
    if (records.length) anyRecord = 1
    const s = statsOfHabit(records)
    s.runs.forEach((n) => {
      streak7 += Math.floor(n / 7)
      streak365 += Math.floor(n / 365)
    })
    // 连续 7 天「每天都有 8 点前的打卡」，每满 7 天记一次
    s.earlyRuns.forEach((n) => {
      early7 += Math.floor(n / 7)
    })
    if (s.days >= 30) days30 += 1
    compensate1 += s.compensate
    comeback += s.gaps
    bigvalue += s.bigDays
    night1 += s.night
  })

  let taskCount = 0
  Object.keys(tasksMap).forEach((hid) => {
    taskCount += (tasksMap[hid] || []).length
  })

  return {
    rookie: anyRecord,
    streak7: streak7,
    habit10: habits.length > 10 ? 1 : 0,
    auto1: taskCount >= 1 ? 1 : 0,
    auto10: taskCount > 10 ? 1 : 0,
    days30: days30,
    compensate1: compensate1,
    streak365: streak365,
    coin30: balance >= 30 ? 1 : 0,
    coin50: balance >= 50 ? 1 : 0,
    coin100: balance >= 100 ? 1 : 0,
    coin500: balance >= 500 ? 1 : 0,
    comeback: comeback,
    bigvalue: bigvalue,
    early7: early7,
    night1: night1
    // abandon30 不在这里：习惯删掉之后记录也没了，算不出来，只能在删除前记（见 noteHabitDeleted）
  }
}

/**
 * 事件型成就：靠「刚才发生了一件事」而不是靠现存数据。
 * 直接落盘并把次数 +1，同时推进待弹队列。
 */
function bump(key, by) {
  const def = DEFS.filter((d) => d.key === key)[0]
  if (!def) return null
  const raw = storage.getAchievements()
  const state = raw && typeof raw === 'object' ? raw : {}
  const prev = state[key]
  const prevCount = Number(prev && prev.count) || 0
  const count = prevCount + (by || 1)
  const firstAt = (prev && prev.firstAt) || dayjs.today()
  state[key] = { firstAt: firstAt, count: count }
  storage.saveAchievements(state)
  const item = Object.assign({}, def, { firstAt: firstAt, count: count })
  pending = pending.concat([item])
  return item
}

/**
 * 删除习惯**之前**调用：这个习惯最长连续打卡超过 30 天，就记一次「所以我放弃了xxx」。
 * 必须在 deleteHabit 之前调 —— 它会级联删掉打卡记录，删完就再也判断不出来了。
 */
function noteHabitDeleted(habitId) {
  const records = storage.getRecords(habitId)
  if (!records.length) return null
  const seen = {}
  const dates = []
  records.forEach((r) => {
    if (!r || !r.d || seen[r.d]) return
    seen[r.d] = 1
    dates.push(r.d)
  })
  dates.sort()
  const longest = runsOf(dates).reduce((max, n) => (n > max ? n : max), 0)
  // 「坚持超过 30 天」按最长连续打卡算，和「小试牛刀」「从未放弃」同一口径
  if (longest <= 30) return null
  return bump('abandon30', 1)
}

/**
 * 重算一遍。新解锁 / 次数上涨的成就推进 pending。
 * @returns {Array} 本次新解锁的成就
 */
function evaluate() {
  const now = compute()
  const raw = storage.getAchievements()
  const state = raw && typeof raw === 'object' ? raw : {}
  const fresh = []
  let dirty = false

  DEFS.forEach((def) => {
    const n = Number(now[def.key]) || 0
    if (n <= 0) return
    const prev = state[def.key]
    if (!prev) {
      // 首次完成：记下日期，这就是成就页要展示的「第一次完成」
      state[def.key] = { firstAt: dayjs.today(), count: n }
      fresh.push(Object.assign({}, def, { firstAt: state[def.key].firstAt, count: n }))
      dirty = true
      return
    }
    if (n > (Number(prev.count) || 0)) {
      // 次数涨了（又来了一次）：首次日期不动，只把次数抬上去
      state[def.key] = { firstAt: prev.firstAt || dayjs.today(), count: n }
      fresh.push(Object.assign({}, def, { firstAt: state[def.key].firstAt, count: n }))
      dirty = true
    }
  })

  if (dirty) storage.saveAchievements(state)
  if (fresh.length) pending = pending.concat(fresh)
  return fresh
}

/**
 * 页面来这里取「要弹的成就」。先重算，保证既有的老数据也能立刻解锁。
 * 取走即清空 —— 同一条不会在两个页面上各弹一次。
 */
function takePending() {
  evaluate()
  const list = pending
  pending = []
  return list
}

/** 成就页用：只返回已完成的，按定义顺序 */
function listCompleted() {
  const raw = storage.getAchievements()
  const state = raw && typeof raw === 'object' ? raw : {}
  return DEFS.filter((d) => state[d.key]).map((d) =>
    Object.assign({}, d, {
      firstAt: state[d.key].firstAt || '',
      count: Number(state[d.key].count) || 1
    })
  )
}

function countCompleted() {
  return listCompleted().length
}

/** 清空数据时把还没弹出来的那批也丢掉，免得紧接着弹一个已经没有意义的成就 */
function reset() {
  pending = []
}

module.exports = {
  DEFS,
  evaluate,
  takePending,
  listCompleted,
  countCompleted,
  noteHabitDeleted,
  reset
}
