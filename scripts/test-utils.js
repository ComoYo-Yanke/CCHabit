// 统一切到项目根目录，脚本可从任意位置调用
process.chdir(require('path').join(__dirname, '..'))

const d = require('../utils/date.js')
const s = require('../utils/stats.js')
let fail = 0
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', name, '=> got', JSON.stringify(a), 'want', JSON.stringify(b)) } else console.log('ok  ', name, JSON.stringify(a)) }

// --- date ---
eq('addDays', d.addDays('2026-09-11', 5), '2026-09-16')
eq('cross month', d.addDays('2026-08-31', 1), '2026-09-01')
eq('cross year', d.addDays('2025-12-31', 1), '2026-01-01')
eq('addMonths clamp', d.addMonths('2026-01-31', 1), '2026-02-28')
eq('addMonths leap', d.addMonths('2024-01-31', 1), '2024-02-29')
eq('addYears leap', d.addYears('2024-02-29', 1), '2025-02-28')
eq('weekday Mon', d.getWeekday('2026-09-07'), 0)
eq('weekday Sun', d.getWeekday('2026-09-13'), 6)
eq('startOfWeek', d.startOfWeek('2026-09-11'), '2026-09-07')
eq('endOfWeek', d.endOfWeek('2026-09-11'), '2026-09-13')
eq('endOfMonth leap', d.endOfMonth('2024-02-10'), '2024-02-29')
eq('diffDays', d.diffDays('2026-09-01', '2026-09-11'), 10)
eq('diffDays neg', d.diffDays('2026-09-11', '2026-09-01'), -10)
eq('diffDays DST-safe', d.diffDays('2026-03-01', '2026-04-01'), 31)
eq('validDateStr bad', d.isValidDateStr('2026-02-30'), false)
eq('validDateStr ok', d.isValidDateStr('2026-02-28'), true)
eq('daysBetween len', d.daysBetween('2026-09-07','2026-09-13').length, 7)
eq('rangeOf year', d.rangeOf('year','2026-09-11').start, '2026-01-01')
eq('rangeOf year end', d.rangeOf('year','2026-09-11').end, '2026-12-31')
eq('rangeOf year days', d.rangeOf('year','2026-09-11').days.length, 365)
eq('shiftRange week', d.shiftRange('week','2026-09-11',-1), '2026-09-04')
eq('friendly -2', d.friendlyLabel('2026-09-09','2026-09-11'), '前天')
eq('friendly cross-year', d.friendlyLabel('2025-09-11','2026-09-11'), '2025年9月11日')

// --- streak ---
const mk = (dates) => { const m = {}; dates.forEach(x => m[x] = {count:1, value:10, records:[]}); return m }
eq('streak 3', s.computeStreak(mk(['2026-09-09','2026-09-10','2026-09-11']), '2026-09-11').current, 3)
eq('streak grace', s.computeStreak(mk(['2026-09-09','2026-09-10']), '2026-09-11').current, 2)
eq('streak broken', s.computeStreak(mk(['2026-09-08','2026-09-09']), '2026-09-11').current, 0)
eq('streak longest', s.computeStreak(mk(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-09-11']), '2026-09-11').longest, 4)
eq('streak empty', s.computeStreak({}, '2026-09-11').current, 0)

// --- summarize / series ---
const dm = s.buildDayMap([
  {d:'2026-09-11', v:50}, {d:'2026-09-11', v:30}, {d:'2026-09-10', v:20}
])
eq('dayMap count', dm['2026-09-11'].count, 2)
eq('dayMap value', dm['2026-09-11'].value, 80)
const sum = s.summarize(dm, '2026-09-07', '2026-09-13')
eq('summary count', sum.totalCount, 3)
eq('summary value', sum.totalValue, 100)
eq('summary activeDays', sum.activeDays, 2)
eq('summary days', sum.totalDays, 7)
eq('summary maxDay', sum.maxDay.date, '2026-09-11')
const ds = s.dailySeries(dm, ['2026-09-09','2026-09-10','2026-09-11'])
eq('dailySeries fill', ds.map(x=>x.value), [0,20,80])
const yb = s.bucketSeries(dm, 'year', '2026-01-01', '2026-12-31')
eq('year buckets', yb.length, 12)
eq('year bucket sep', yb[8].value, 100)

// --- heatmap ---
const hm = s.heatmapData(dm, '2026-09-11', 4, 100)
eq('heat cols', hm.columns.length, 4)
eq('heat rows', hm.columns[0].length, 7)
const lastCol = hm.columns[3]
eq('heat sun future', lastCol[6].future, true)
eq('heat level target', lastCol[4].level, 3) // 80/100 = 0.8 -> 3
eq('heat level zero', lastCol[0].level, 0)

// --- calendar ---
const cal = s.monthCalendar(dm, '2026-09-11')
eq('cal monthLabel', cal.monthLabel, '2026年9月')
eq('cal cells %7', cal.cells.length % 7, 0)
eq('cal offset (Sep 1 2026 is Tue)', cal.cells.findIndex(c=>c.day===1), 1)
eq('cal done mark', cal.cells.find(c=>c.date==='2026-09-11').done, true)
eq('cal canNext', cal.canNext, false)

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS')
process.exit(fail ? 1 : 0)
