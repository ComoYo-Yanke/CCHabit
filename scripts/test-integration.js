/* 集成自测：模拟 wx.storage，跑通「建习惯 -> 打卡 -> 统计 -> 删除」全链路 */
const store = {}
let quotaBytes = Infinity
global.wx = {
  getStorageSync: (k) => (k in store ? JSON.parse(JSON.stringify(store[k])) : ''),
  setStorageSync: (k, v) => {
    const size = JSON.stringify(v).length
    if (size > quotaBytes) throw new Error('setStorageSync:fail exceed storage max size')
    store[k] = JSON.parse(JSON.stringify(v))
  },
  removeStorageSync: (k) => { delete store[k] },
  getStorageInfoSync: () => ({
    keys: Object.keys(store),
    currentSize: Math.round(JSON.stringify(store).length / 1024),
    limitSize: 10240
  })
}

let fail = 0
const ok = (name, cond, extra) => {
  if (cond) console.log('ok   ' + name)
  else { fail++; console.log('FAIL ' + name + ' ' + (extra !== undefined ? JSON.stringify(extra) : '')) }
}

const storage = require('../utils/storage.js')
const stats = require('../utils/stats.js')
const dayjs = require('../utils/date.js')

// ---------- 初始化 ----------
storage.ensureInit()
ok('init habits empty', storage.getHabits().length === 0)

// ---------- 新建习惯 ----------
const h1 = storage.saveHabit({ name: '背单词', unit: '个', icon: '书', target: 50, step: 10 })
const h2 = storage.saveHabit({ name: '骑行', unit: '公里', step: 5 })
ok('habit created id', /^h_/.test(h1.id), h1.id)
ok('habit count 2', storage.getHabits().length === 2)
ok('sort order', storage.getHabits()[0].id === h1.id)
ok('unit kept', storage.getHabit(h2.id).unit === '公里')

// ---------- 打卡（含同日多条） ----------
const today = dayjs.today()
storage.addRecord(h1.id, today, 50, '第1章')
storage.addRecord(h1.id, today, 30)
storage.addRecord(h1.id, dayjs.addDays(today, -1), 60)
storage.addRecord(h1.id, dayjs.addDays(today, -2), 40)
storage.addRecord(h2.id, today, 12.5)

const r1 = storage.getRecords(h1.id)
ok('h1 records 4', r1.length === 4, r1.length)
ok('same-day multi', r1.filter((r) => r.d === today).length === 2)
ok('records sorted asc', r1[0].d <= r1[3].d)

const dm = stats.buildDayMap(r1)
ok('dayMap sum', dm[today].value === 80, dm[today])
ok('dayMap count', dm[today].count === 2)
ok('decimal preserved', stats.buildDayMap(storage.getRecords(h2.id))[today].value === 12.5)

// ---------- 连续天数 ----------
const st = stats.computeStreak(dm, today)
ok('streak 3', st.current === 3, st.current)
ok('todayDone', st.todayDone === true)

// ---------- 按日取记录 ----------
const ofDay = storage.getRecordsOfDate(today)
ok('records of today: 2 habits', Object.keys(ofDay).length === 2)

// ---------- 修改 / 删除记录 ----------
const rec = storage.getRecords(h1.id)[0]
storage.updateRecord(h1.id, rec.id, { v: 999 })
ok('update record', storage.getRecords(h1.id).find((r) => r.id === rec.id).v === 999)
storage.deleteRecord(h1.id, rec.id)
ok('delete record', storage.getRecords(h1.id).length === 3)

// ---------- 停用 ----------
storage.setHabitEnabled(h2.id, false)
ok('disabled excluded', storage.getEnabledHabits().length === 1)
storage.setHabitEnabled(h2.id, true)

// ---------- 导出 / 导入 ----------
const backup = storage.exportData()
ok('export parses', !!JSON.parse(backup).habits)
storage.clearAll()
ok('cleared', storage.getHabits().length === 0 && storage.getRecords(h1.id).length === 0)
const res = storage.importData(backup)
ok('import habits', res.habits === 2, res)
ok('import records', res.records === 4, res)
ok('records restored', storage.getRecords(h1.id).length === 3)

let threw = ''
try { storage.importData('not json') } catch (e) { threw = e.code }
ok('invalid json rejected', threw === 'INVALID_JSON', threw)

storage.importData(JSON.stringify({ habits: [h1], records: { [h1.id]: [{ d: today, v: 1 }], ghost: [{ d: today, v: 1 }] } }))
ok('orphan records dropped', storage.getRecords('ghost').length === 0)

// ---------- 删除习惯级联 ----------
storage.importData(backup)
const removed = storage.deleteHabit(h1.id)
ok('cascade delete count', removed === 3, removed)
ok('records gone', storage.getRecords(h1.id).length === 0)
ok('records map key gone', storage.getRecordsMap()[h1.id] === undefined)
ok('other habit intact', storage.getRecords(h2.id).length === 1)

// ---------- 配额超限 ----------
quotaBytes = 10
let qerr = ''
try { storage.addRecord(h2.id, today, 1) } catch (e) { qerr = e.code }
quotaBytes = Infinity
ok('quota error code', qerr === 'QUOTA_EXCEEDED', qerr)

storage.importData(backup)
const before = storage.getRecords(h2.id).length
quotaBytes = 10
try { storage.addRecord(h2.id, today, 1) } catch (e) {}
quotaBytes = Infinity
ok('cache intact after failed write', storage.getRecords(h2.id).length === before, storage.getRecords(h2.id).length)

// ---------- 示例数据 ----------
storage.clearAll()
const seeded = storage.seedDemoData()
ok('seed habits', seeded.habits === 4)
ok('seed records > 20', seeded.records > 20, seeded.records)
ok('hasSeeded flag', storage.hasSeeded() === true)

// ---------- 页面级计算冒烟 ----------
const habits = storage.getEnabledHabits()
const recordsMap = storage.getRecordsMap()
const t = dayjs.today()

const overview = {}
habits.forEach((h) => (recordsMap[h.id] || []).forEach((r) => {
  if (!overview[r.d]) overview[r.d] = { count: 0, value: 0 }
  overview[r.d].count++
  overview[r.d].value += r.v
}))
const ov = stats.dailyOverview(habits, storage.getRecordsOfDate(t))
ok('overview done <= total', ov.done <= ov.total, ov)

const heat = stats.heatmapData(overview, t, 26, 0)
ok('home heatmap 26 cols', heat.columns.length === 26)
ok('home heatmap levels valid', heat.columns.every((c) => c.every((cell) => cell.level >= -1)))

const RANGES = ['week', 'month', 'year']
RANGES.forEach((range) => {
  const ri = dayjs.rangeOf(range, t)
  const h = habits[0]
  const dmap = stats.buildDayMap(recordsMap[h.id] || [])
  const sum = stats.summarize(dmap, ri.start, ri.end)
  // 出桶单位就是区间本身（见 utils/stats.js 的 RANGE_GRAN）
  const gran = range
  const buckets = stats.bucketSeries(dmap, gran, ri.start, ri.end)
  const bar = stats.barChartData(buckets, { field: 'count' })
  const line = range === 'year'
    ? stats.bucketSeries(dmap, 'year', ri.start, ri.end).map((b) => b.value)
    : stats.dailySeries(dmap, ri.days).map((p) => p.value)
  const cal = stats.monthCalendar(dmap, t)
  const nums = [sum.totalCount, sum.totalValue, sum.activeDays, sum.totalDays, sum.completionRate]
  ok(range + ': summary finite', nums.every((n) => typeof n === 'number' && !isNaN(n)), nums)
  ok(range + ': bar aligned', bar.categories.length === bar.series[0].data.length && bar.categories.length === buckets.length)
  ok(range + ': line finite', line.every((v) => typeof v === 'number' && isFinite(v)))
  ok(range + ': calendar aligned', cal.cells.length % 7 === 0, cal.cells.length)
  ok(range + ': bucket labels non-empty', buckets.every((b) => b.label !== ''), buckets.map((b) => b.label))
})

const ri2 = dayjs.rangeOf('month', t)
const rank = stats.compareHabits(habits, recordsMap, ri2.start, ri2.end)
ok('ranking length', rank.length === habits.length)
ok('ranking sorted desc', rank.every((r, i) => i === 0 || rank[i - 1].summary.totalValue >= r.summary.totalValue))

const usage = storage.getUsage()
ok('usage shape', typeof usage.percent === 'number' && ['ok', 'warn', 'danger'].indexOf(usage.level) >= 0, usage)

console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS')
process.exit(fail ? 1 : 0)
