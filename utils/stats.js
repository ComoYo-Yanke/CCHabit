/**
 * utils/stats.js —— 统计与图表数据计算
 *
 * 所有函数都是纯函数（输入记录数组 / 日期区间，输出计算结果），
 * 不直接读写 storage，方便单测与复用。
 *
 * 核心中间结构 dayMap：把「一天多条记录」聚合成「一天一条汇总」
 *   { 'YYYY-MM-DD': { count: 打卡次数, value: 数值合计, records: [] } }
 */

const dayjs = require('./date.js')

/**
 * 把记录数组按天聚合。
 * @param {Array<{d:string, v:number}>} records
 * @returns {Object} dayMap
 */
function buildDayMap(records) {
  const map = {}
  const list = records || []
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (!r || !r.d) continue
    let cell = map[r.d]
    if (!cell) {
      cell = map[r.d] = { count: 0, value: 0, records: [] }
    }
    cell.count += 1
    cell.value += Number(r.v) || 0
    cell.records.push(r)
  }
  return map
}

/**
 * 连续打卡天数统计。
 *
 * 规则（与 TapHabit 等主流 App 一致）：
 *  - 从今天往前回溯，只要某天有记录就 +1，遇到空白天中断；
 *  - 今天还没打卡时给一天宽限：若昨天有记录，连续天数仍按昨天为止计算，不清零；
 *  - 断签（昨天和今天都没有）则归零。
 *
 * @param {Object} dayMap
 * @param {string} [todayStr] 便于测试注入
 * @returns {{current:Number, longest:Number, lastDate:String, todayDone:Boolean, yesterdayDone:Boolean}}
 */
function computeStreak(dayMap, todayStr) {
  const today = todayStr || dayjs.today()
  const has = (d) => !!(dayMap[d] && dayMap[d].count > 0)

  const todayDone = has(today)
  const yesterday = dayjs.addDays(today, -1)
  const yesterdayDone = has(yesterday)

  // 当前连续天数
  let current = 0
  let cursor = todayDone ? today : yesterday
  if (todayDone || yesterdayDone) {
    while (has(cursor)) {
      current += 1
      cursor = dayjs.addDays(cursor, -1)
    }
  }

  // 历史最长连续天数：把所有有记录的日期排序后扫一遍
  const dates = Object.keys(dayMap)
    .filter((d) => dayMap[d] && dayMap[d].count > 0)
    .sort()
  let longest = 0
  let run = 0
  let prev = null
  for (let i = 0; i < dates.length; i++) {
    if (prev && dayjs.diffDays(prev, dates[i]) === 1) run += 1
    else run = 1
    if (run > longest) longest = run
    prev = dates[i]
  }
  if (longest === 0 && current > 0) longest = current

  const allDates = dates
  return {
    current,
    longest,
    lastDate: allDates.length ? allDates[allDates.length - 1] : '',
    todayDone,
    yesterdayDone
  }
}

/**
 * 时间区间内的汇总指标。
 * @param {Object} dayMap
 * @param {string} start
 * @param {string} end
 * @returns {{totalCount:Number, totalValue:Number, activeDays:Number, totalDays:Number, avgPerActiveDay:Number, avgPerDay:Number, maxDay:{date:String,value:Number}, minActiveDay:...}}
 */
function summarize(dayMap, start, end) {
  const days = dayjs.daysBetween(start, end)
  let totalCount = 0
  let totalValue = 0
  let activeDays = 0
  let maxDay = { date: '', value: 0, count: 0 }

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const cell = dayMap[d]
    if (!cell || cell.count === 0) continue
    activeDays += 1
    totalCount += cell.count
    totalValue += cell.value
    if (cell.value > maxDay.value) maxDay = { date: d, value: cell.value, count: cell.count }
  }

  const totalDays = days.length
  return {
    totalCount,
    totalValue,
    activeDays,
    totalDays,
    // 保留一位小数，避免图表/文案出现 3.3333333
    avgPerActiveDay: activeDays ? round1(totalValue / activeDays) : 0,
    avgPerDay: totalDays ? round1(totalValue / totalDays) : 0,
    completionRate: totalDays ? Math.round((activeDays / totalDays) * 100) : 0,
    maxDay
  }
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

/** 数值格式化：大数加千分位、小数最多保留一位，用于展示 */
function fmtNum(n) {
  const num = Number(n) || 0
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  }
  return Number.isInteger(num) ? String(num) : num.toFixed(1)
}

/**
 * 按天展开成序列，缺失的日期补 0 —— 折线图/柱状图需要连续的时间轴。
 * @returns {Array<{date:string, label:string, value:Number, count:Number}>}
 */
function dailySeries(dayMap, days) {
  return days.map((d) => {
    const cell = dayMap[d]
    return {
      date: d,
      label: dayjs.parseDate(d).getDate() + '',
      fullLabel: dayjs.monthDayLabel(d),
      value: cell ? cell.value : 0,
      count: cell ? cell.count : 0
    }
  })
}

/**
 * 把窗口按**单位**分桶：选日就是一天一桶、选周一周一桶、选月一月一桶、选年一年一桶。
 *
 * 这里原来是一把「比区间细一档」的梯子（周里看天、月里看周、年里看月），
 * 理由是「区间就是一整个该单位，用区间名出桶只会得到一根柱子」。理由成立，
 * 解法却把图和控件说拧了：用户点的是「周」，横轴上却是一天一根柱子，
 * 一排 7 根柱子全落在同一个区间里，翻一页也说不清是第几周。
 * 现在粒度**就是**区间本身 —— 单位与区间一一对应，图上每一格 = 一次翻页 ——
 * 而「只有一根柱子」的问题改由 windowOf 铺一串同类单位解决（见 utils/date.js）。
 *
 * @param {Object} dayMap
 * @param {'day'|'week'|'month'|'year'} gran 桶的单位
 * @param {string} start 窗口起点（落在单位边界上，见 date.windowOf）
 * @param {string} end 窗口终点
 * @returns {Array<{label:string, value:Number, count:Number, activeDays:Number}>}
 */
function bucketSeries(dayMap, gran, start, end) {
  const buckets = []
  let cur = ''

  if (gran === 'week') {
    // 标签用这一周周一的日期：一周一格时，「第几周」没有绝对含义，
    // 而起点日期是唯一的（跨月、跨年都不会歧义）
    cur = dayjs.startOfWeek(start)
    while (cur <= end) {
      pushBucket(buckets, dayjs.shortDateLabel(cur), cur, dayjs.addDays(cur, 6), dayMap)
      cur = dayjs.addDays(cur, 7)
    }
    return buckets
  }

  if (gran === 'month') {
    cur = dayjs.startOfMonth(start)
    while (cur <= end) {
      pushBucket(buckets, dayjs.parseDate(cur).getMonth() + 1 + '月', cur, dayjs.endOfMonth(cur), dayMap)
      cur = dayjs.addMonths(cur, 1)
    }
    return buckets
  }

  if (gran === 'year') {
    cur = dayjs.startOfYear(start)
    while (cur <= end) {
      pushBucket(buckets, dayjs.parseDate(cur).getFullYear() + '年', cur, dayjs.endOfYear(cur), dayMap)
      cur = dayjs.addYears(cur, 1)
    }
    return buckets
  }

  // 缺省按天
  dayjs.daysBetween(start, end).forEach((d) => {
    pushBucket(buckets, dayjs.shortDateLabel(d), d, d, dayMap)
  })
  return buckets
}

/**
 * 一个日期区间的汇总桶。
 *
 * 逐日往前推（addDays 一个游标），而不是先把区间铺成日期数组再遍历：
 * 年窗口的桶各有 365 天，铺数组会白造一万多个字符串。
 */
function pushBucket(buckets, label, start, end, dayMap) {
  let value = 0
  let count = 0
  let activeDays = 0
  const total = dayjs.diffDays(start, end)
  for (let i = 0; i <= total; i++) {
    const cell = dayMap[dayjs.addDays(start, i)]
    if (!cell || !cell.count) continue
    value += cell.value
    count += cell.count
    activeDays += 1
  }
  buckets.push({ label, value, count, activeDays })
}

/**
 * 区间 -> 出桶单位。**两者是同一个东西**：选日看每天、选周看每周、
 * 选月看每月、选年看每年。
 *
 * 之所以还留着这张表而不是让调用方直接用 range：粒度这个概念在别处还要用
 * （图表标题「每周」、副标题「按周」），有一处显名映射，改了单位不会漏改文案。
 */
const RANGE_GRAN = { day: 'day', week: 'week', month: 'month', year: 'year' }

/** 单位对应的中文单字，用来拼「每天 / 每周 / 每月 / 每年」这类文案 */
const GRAN_LABEL = { day: '天', week: '周', month: '月', year: '年' }

/** 区间 -> 出桶单位，未知区间按天 */
function granOfRange(range) {
  return RANGE_GRAN[range] || 'day'
}

/** 区间 -> 单位的中文单字（天 / 周 / 月 / 年），用来拼图表标题与副标题 */
function granLabel(range) {
  return GRAN_LABEL[granOfRange(range)] || GRAN_LABEL.day
}

/**
 * 时间轴图表一屏画几格（滚动模式下的 xAxis.itemCount）。
 *
 * 数字是排版问题不是数学问题：格里的标签是「9/17」「10月」这种短字，
 * 一屏 10 格时每格还有一百多设备像素，再多就该挤了。
 * 四个值都小于对应的窗口格数（见 date.WINDOW_PERIODS），
 * 只有年视图两者相等 —— 一屏正好装下整个窗口，滑不动，也就不必滑。
 */
const CHART_ITEM_COUNT = { day: 10, week: 8, month: 6, year: 5 }

/** 区间 -> 图表一屏的格数 */
function chartItemCount(range) {
  const n = CHART_ITEM_COUNT[range]
  return typeof n === 'number' ? n : CHART_ITEM_COUNT.day
}

/**
 * 热力点阵图数据（GitHub 贡献图样式）。
 *
 * 输出按「列」组织，每列 7 天（周一到周日），可直接用 flex 横向排布渲染。
 *
 * @param {Object} dayMap
 * @param {string} endDate 最后一列所在周（通常是今天）
 * @param {Number} weeks 展示多少周
 * @param {Number} target 每日目标值，>0 时用它作为色阶基准；否则用区间最大值
 * @returns {{columns:Array<Array<Cell>>, maxValue:Number, monthLabels:Array}}
 */
function heatmapData(dayMap, endDate, weeks, target) {
  const end = endDate || dayjs.today()
  const weekCount = weeks || 20
  const lastColStart = dayjs.startOfWeek(end)
  const firstColStart = dayjs.addDays(lastColStart, -(weekCount - 1) * 7)

  // 先扫描一遍拿到最大值，作为色阶分母
  let maxValue = 0
  for (let i = 0; i < weekCount * 7; i++) {
    const d = dayjs.addDays(firstColStart, i)
    if (dayjs.diffDays(d, end) < 0) break
    const cell = dayMap[d]
    if (cell && cell.value > maxValue) maxValue = cell.value
  }
  // 有目标值时以目标为基准，达标即最深色，视觉上更有「进度感」
  const base = target > 0 ? target : maxValue

  const columns = []
  const monthLabels = []
  let lastMonth = -1

  for (let w = 0; w < weekCount; w++) {
    const col = []
    for (let r = 0; r < 7; r++) {
      const date = dayjs.addDays(firstColStart, w * 7 + r)
      const future = dayjs.diffDays(date, end) < 0
      const cell = dayMap[date]
      const value = cell ? cell.value : 0
      const count = cell ? cell.count : 0
      col.push({
        date,
        value,
        count,
        future,
        day: dayjs.parseDate(date).getDate(),
        level: future ? -1 : levelOf(value, base)
      })
    }
    columns.push(col)

    // 该列出现了新的月份就在顶部打一个月份刻度
    const firstDay = dayjs.parseDate(dayjs.addDays(firstColStart, w * 7))
    const m = firstDay.getMonth() + 1
    if (m !== lastMonth) {
      monthLabels.push({ index: w, label: m + '月' })
      lastMonth = m
    }
  }

  return { columns, maxValue, monthLabels }
}

/** 数值 -> 0~4 的热力等级 */
function levelOf(value, base) {
  if (!value) return 0
  if (!base || base <= 0) return 1
  const ratio = value / base
  if (ratio >= 1) return 4
  if (ratio >= 0.66) return 3
  if (ratio >= 0.33) return 2
  return 1
}

/**
 * 月历数据（习惯详情页的「日历视图」，用于点选日期打卡）。
 * @param {Object} dayMap
 * @param {string} anchor 该月任意一天
 * @returns {{cells:Array, monthLabel:String, prevAnchor:String, nextAnchor:String, canNext:Boolean}}
 */
function monthCalendar(dayMap, anchor) {
  const monthStart = dayjs.startOfMonth(anchor)
  const total = dayjs.daysInMonth(anchor)
  const offset = dayjs.monthStartOffset(anchor)
  const todayStr = dayjs.today()

  const cells = []
  // 月初对齐用的占位格
  for (let i = 0; i < offset; i++) {
    cells.push({ key: 'pad-' + i, empty: true })
  }
  // 该月的 'YYYY-MM' 前缀，拼日期时直接用，避免再做一次 Date 运算
  const ym = monthStart.slice(0, 7)
  for (let d = 1; d <= total; d++) {
    const date = ym + '-' + dayjs.pad2(d)
    const cell = dayMap[date]
    // diffDays(a, b) 算的是 b - a，所以这里拿到的是「date 减今天」：正数才是未来。
    // 这行原来写的是 diff < 0，把方向弄反了 —— 过去的日子被标成未来，
    // 于是日历上点昨天会提示「还没到的日子」，点明天反而能打开打卡层。
    const diff = dayjs.diffDays(todayStr, date)
    cells.push({
      key: date,
      empty: false,
      date,
      day: d,
      value: cell ? cell.value : 0,
      count: cell ? cell.count : 0,
      done: !!(cell && cell.count),
      isToday: date === todayStr,
      isFuture: diff > 0
    })
  }
  // 末尾补齐到整周，保持网格规整
  const tail = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < tail; i++) {
    cells.push({ key: 'tail-' + i, empty: true })
  }

  const prevAnchor = dayjs.addMonths(monthStart, -1)
  const nextAnchor = dayjs.addMonths(monthStart, 1)
  const nextMonthStart = dayjs.startOfMonth(nextAnchor)

  return {
    cells,
    monthLabel: dayjs.yearMonthLabel(anchor),
    prevAnchor,
    nextAnchor,
    // 不允许翻到未来月份
    canNext: dayjs.diffDays(nextMonthStart, todayStr) >= 0
  }
}

/**
 * 折线图数据：转成 uCharts 的 { categories, series } 结构。
 * @param {Object} dayMap
 * @param {string[]} days
 * @param {Object} opts { name, color, decimals }
 */
function lineChartData(dayMap, days, opts) {
  const o = opts || {}
  const series = dailySeries(dayMap, days)
  return {
    categories: series.map((s) => s.date),
    series: [
      {
        name: o.name || '数值',
        color: o.color || '#5B8CFF',
        data: series.map((s) => s.value)
      }
    ],
    raw: series
  }
}

/**
 * 柱状图数据：把 bucketSeries 的结果转成 uCharts 结构。
 * @param {Array} buckets bucketSeries 的输出
 * @param {Object} opts { name, color, field }
 *        field = 'value'（数值合计，默认）| 'count'（打卡次数）
 */
function barChartData(buckets, opts) {
  const o = opts || {}
  const field = o.field === 'count' ? 'count' : 'value'
  return {
    categories: buckets.map((b) => b.label),
    series: [
      {
        name: o.name || (field === 'count' ? '打卡次数' : '数值'),
        color: o.color || '#5B8CFF',
        data: buckets.map((b) => b[field] || 0)
      }
    ],
    raw: buckets,
    field
  }
}

/**
 * 多习惯横向对比：用于统计总览页的排行榜 / 对比柱状图。
 * @param {Array<Habit>} habits
 * @param {Object} recordsMap
 * @param {string} start
 * @param {string} end
 * @returns {Array<{habit, dayMap, summary, streak}>}
 */
function compareHabits(habits, recordsMap, start, end) {
  return habits
    .map((habit) => {
      const dayMap = buildDayMap(recordsMap[habit.id] || [])
      return {
        habit,
        dayMap,
        summary: summarize(dayMap, start, end),
        streak: computeStreak(dayMap)
      }
    })
    .sort((a, b) => b.summary.totalValue - a.summary.totalValue || b.summary.activeDays - a.summary.activeDays)
}

/** 首页概览：今天有几个习惯完成了、整体连续情况 */
function dailyOverview(habits, recordsOfToday) {
  let done = 0
  let totalValue = 0
  habits.forEach((h) => {
    const list = recordsOfToday[h.id]
    if (list && list.length) {
      done += 1
      totalValue += list.reduce((s, r) => s + (Number(r.v) || 0), 0)
    }
  })
  return {
    done,
    total: habits.length,
    pending: Math.max(0, habits.length - done),
    totalValue
  }
}

module.exports = {
  buildDayMap,
  computeStreak,
  summarize,
  round1,
  fmtNum,
  dailySeries,
  bucketSeries,
  granOfRange,
  granLabel,
  chartItemCount,
  heatmapData,
  levelOf,
  monthCalendar,
  lineChartData,
  barChartData,
  compareHabits,
  dailyOverview
}
