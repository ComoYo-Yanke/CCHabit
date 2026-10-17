/**
 * utils/coins.js —— 金币系统
 *
 * 规则（来自需求，写死在这里，别散到页面里）：
 *   - 一个习惯**一周七天全打卡**，得 1 枚金币；
 *   - 一周从周日开始、周六结算（日历就是这么排的），所以只有周六那一笔
 *     把七天凑齐时才算数；
 *   - **只看当周**：过去已经结束的周不追发（升级前的老数据也一并照此处理，
 *     因为发放只发生在「今天这一笔打卡之后」这个事件上）；
 *   - 金币每年重置 —— 跨年第一次读到时余额清零，已发过的周记录也清空；
 *   - 5 枚金币补签一次（直接扣，不经过「补签券」那道中转）。
 *
 * 「这一周是不是全勤」要查记录，所以本模块依赖 storage；页面只调这里的函数，
 * 不自己判断。
 */
const storage = require('./storage.js')
const dayjs = require('./date.js')

/** 一个完美周给几枚金币 */
const REWARD = 1
/** 补签一次要几枚金币 */
const COMPENSATE_COST = 5

function yearNow() {
  return new Date().getFullYear()
}

function fresh() {
  return { year: yearNow(), balance: 0, weeks: {} }
}

/**
 * 读出当前状态，顺手做年度重置。
 * `weeks` 形如 { [habitId]: ['2026-10-11', ...] }，值是那一周的**周日**日期。
 */
function state() {
  const raw = storage.getCoinState()
  const s = raw && typeof raw === 'object' ? raw : fresh()
  if (Number(s.year) !== yearNow()) {
    // 跨年：金币与「已经发过哪几周」一起清零
    const next = fresh()
    storage.saveCoinState(next)
    return next
  }
  return {
    year: Number(s.year) || yearNow(),
    balance: Number(s.balance) || 0,
    weeks: s.weeks && typeof s.weeks === 'object' ? s.weeks : {}
  }
}

/** 当前给页面的那份（余额 / 年度重置后的值） */
function snapshot() {
  const s = state()
  return { balance: s.balance, year: s.year }
}

/** 周日是这一周的第一天。JS 的 getDay() 里周日就是 0，直接往回退几天 */
function weekStart(dateStr) {
  return dayjs.addDays(dateStr, -dayjs.parseDate(dateStr).getDay())
}

/** 这一周七天是不是每天都有记录 */
function weekComplete(habitId, start) {
  const got = {}
  storage.getRecords(habitId).forEach((r) => {
    got[r.d] = 1
  })
  for (let i = 0; i < 7; i++) {
    if (!got[dayjs.addDays(start, i)]) return false
  }
  return true
}

/**
 * 打完这一笔之后调用：如果它刚好把**当周**凑成完美一周，发金币。
 * @param   {string} habitId
 * @param   {string} date    刚写入记录的那一天 YYYY-MM-DD
 * @returns {number} 这次发了几枚（0 或 1）
 */
function rewardForCheckin(habitId, date) {
  const today = dayjs.today()
  // 补记（定时任务 / 补签）不结算当周：结算只认「今天这一笔」
  if (date !== today) return 0
  const start = weekStart(date)
  // 周六结算：一周还没走完就谈不上「七天全勤」
  if (dayjs.addDays(start, 6) !== today) return 0

  const s = state()
  const got = s.weeks[habitId] || []
  // 同一周只发一次：周六当天再补一条记录也不会重复给
  if (got.indexOf(start) >= 0) return 0
  if (!weekComplete(habitId, start)) return 0

  storage.saveCoinState(
    Object.assign({}, s, {
      balance: s.balance + REWARD,
      weeks: Object.assign({}, s.weeks, { [habitId]: got.concat([start]) })
    })
  )
  return REWARD
}

/**
 * 扣 5 枚金币补一次签。不够时返回 false，页面提示「金币不够」。
 * 先扣再写记录：写失败要调 refundCompensation() 退回来，不能扣了没补上。
 */
function spendForCompensation() {
  const s = state()
  if (s.balance < COMPENSATE_COST) return false
  storage.saveCoinState(Object.assign({}, s, { balance: s.balance - COMPENSATE_COST }))
  return true
}

/** 把补签扣掉的金币退回去（记录没写成功时用） */
function refundCompensation() {
  const s = state()
  storage.saveCoinState(Object.assign({}, s, { balance: s.balance + COMPENSATE_COST }))
}

module.exports = {
  REWARD,
  COMPENSATE_COST,
  state,
  snapshot,
  weekStart,
  rewardForCheckin,
  spendForCompensation,
  refundCompensation
}
