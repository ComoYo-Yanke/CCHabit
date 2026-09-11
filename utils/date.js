/**
 * utils/date.js —— 日期工具集
 *
 * 约定：
 *  1. 全应用内部统一用「本地日期字符串」`YYYY-MM-DD` 作为一天的唯一标识，
 *     避免 Date 对象在不同时区/跨端下的解析差异（new Date('2026-09-11') 会按 UTC 解析，
 *     东八区会退回到前一天，因此必须手工解析）。
 *  2. 一周从「周一」开始（周一 = 0，周日 = 6），符合中文用户习惯。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAY_FULL_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 数字补零到两位 */
function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/** Date 对象 -> 'YYYY-MM-DD'（使用本地时间字段，不走 toISOString） */
function formatDate(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

/**
 * 'YYYY-MM-DD' -> 本地零点的 Date 对象。
 * 手工拆分字符串而非 new Date(str)，避免 UTC 解析偏差。
 */
function parseDate(str) {
  if (str instanceof Date) return new Date(str.getFullYear(), str.getMonth(), str.getDate())
  const parts = String(str).split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

/** 今天的日期字符串 */
function today() {
  return formatDate(new Date())
}

/** 是否为合法的 YYYY-MM-DD */
function isValidDateStr(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
  const d = parseDate(str)
  return formatDate(d) === str // 排除 2026-02-30 这类非法日期
}

/** 日期字符串加减天数 */
function addDays(str, n) {
  const d = parseDate(str)
  d.setDate(d.getDate() + n)
  return formatDate(d)
}

/**
 * 日期字符串加减月份。遇到月末溢出时向「本月最后一天」收敛，
 * 例如 1月31日 + 1月 => 2月28/29日，而不是滚到 3 月。
 */
function addMonths(str, n) {
  const d = parseDate(str)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return formatDate(d)
}

/** 日期字符串加减年份（2月29日 -> 2月28日） */
function addYears(str, n) {
  return addMonths(str, n * 12)
}

/** b - a 的天数差（正数表示 b 在 a 之后） */
function diffDays(a, b) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS_PER_DAY)
}

/** 星期几：周一 = 0 ... 周日 = 6 */
function getWeekday(str) {
  return (parseDate(str).getDay() + 6) % 7
}

/** 当周周一 */
function startOfWeek(str) {
  return addDays(str, -getWeekday(str))
}

/** 当周周日 */
function endOfWeek(str) {
  return addDays(startOfWeek(str), 6)
}

/** 当月第一天 */
function startOfMonth(str) {
  const d = parseDate(str)
  return formatDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** 当月最后一天 */
function endOfMonth(str) {
  const d = parseDate(str)
  return formatDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** 当年第一天 */
function startOfYear(str) {
  return parseDate(str).getFullYear() + '-01-01'
}

/** 当年最后一天 */
function endOfYear(str) {
  return parseDate(str).getFullYear() + '-12-31'
}

/** 两个日期字符串之间（含首尾）的全部日期 */
function daysBetween(startStr, endStr) {
  const out = []
  const total = diffDays(startStr, endStr)
  for (let i = 0; i <= total; i++) out.push(addDays(startStr, i))
  return out
}

/** 某月共多少天 */
function daysInMonth(str) {
  return parseDate(endOfMonth(str)).getDate()
}

/** 某个月首日对应的星期偏移（周一=0），用于日历排布前置空格 */
function monthStartOffset(str) {
  return getWeekday(startOfMonth(str))
}

/** 中文星期简称，如 '一' */
function weekdayCN(str) {
  return WEEKDAY_CN[getWeekday(str)]
}

/** 中文星期全称，如 '周一' */
function weekdayFullCN(str) {
  return WEEKDAY_FULL_CN[getWeekday(str)]
}

/** 'YYYY-MM-DD' -> '9月11日' */
function monthDayLabel(str) {
  const d = parseDate(str)
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}

/** 'YYYY-MM-DD' -> '2026年9月' */
function yearMonthLabel(str) {
  const d = parseDate(str)
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月'
}

/**
 * 计算某个统计维度（周/月/年）对应的时间区间。
 * @param {'week'|'month'|'year'} type
 * @param {string} anchor 区间内的任意一天
 * @returns {{start:string, end:string, days:string[], label:string}}
 */
function rangeOf(type, anchor) {
  const a = anchor || today()
  if (type === 'week') {
    const start = startOfWeek(a)
    const end = endOfWeek(a)
    return { start, end, days: daysBetween(start, end), label: monthDayLabel(start) + ' - ' + monthDayLabel(end) }
  }
  if (type === 'month') {
    const start = startOfMonth(a)
    const end = endOfMonth(a)
    return { start, end, days: daysBetween(start, end), label: yearMonthLabel(a) }
  }
  const start = startOfYear(a)
  const end = endOfYear(a)
  return { start, end, days: daysBetween(start, end), label: parseDate(a).getFullYear() + '年' }
}

/**
 * 相对当前区间按粒度平移，返回新的锚点日期。
 * @param {'week'|'month'|'year'} type
 * @param {string} anchor 当前锚点
 * @param {number} delta 平移量（-1 上一区间 / +1 下一区间）
 */
function shiftRange(type, anchor, delta) {
  if (type === 'week') return addDays(anchor, delta * 7)
  if (type === 'month') return addMonths(anchor, delta)
  return addYears(anchor, delta)
}

/**
 * 友好日期标签：今天 / 昨天 / 明天 / 9月11日 / 2025年9月11日（跨年时带年份）
 */
function friendlyLabel(str, base) {
  const ref = base || today()
  const d = diffDays(ref, str)
  if (d === 0) return '今天'
  if (d === -1) return '昨天'
  if (d === 1) return '明天'
  if (d === -2) return '前天'
  const dt = parseDate(str)
  const sameYear = dt.getFullYear() === parseDate(ref).getFullYear()
  return (sameYear ? '' : dt.getFullYear() + '年') + (dt.getMonth() + 1) + '月' + dt.getDate() + '日'
}

/**
 * 该区间相对「今天」是否为未来 / 是否包含今天，用于禁用「下一区间」按钮。
 */
function isFutureRange(type, anchor) {
  const t = today()
  return parseDate(rangeOf(type, anchor).start).getTime() > parseDate(t).getTime()
}

module.exports = {
  MS_PER_DAY,
  WEEKDAY_CN,
  WEEKDAY_FULL_CN,
  pad2,
  formatDate,
  parseDate,
  today,
  isValidDateStr,
  addDays,
  addMonths,
  addYears,
  diffDays,
  getWeekday,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  daysBetween,
  daysInMonth,
  monthStartOffset,
  weekdayCN,
  weekdayFullCN,
  monthDayLabel,
  yearMonthLabel,
  rangeOf,
  shiftRange,
  friendlyLabel,
  isFutureRange
}
