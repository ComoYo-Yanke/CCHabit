/**
 * utils/scheduler.js —— 定时打卡任务的「到点补记」
 *
 * ===================== 这里为什么是「补记」而不是「定时」 =====================
 *
 * 微信小程序**没有后台执行能力**：用户退出小程序，JS 就停了，没有常驻进程、
 * 没有后台定时器、也拿不到任何系统级的闹钟。所以「到点自动打卡」在小程序里
 * 唯一能成立的形态是：
 *
 *     每次打开（onLaunch / onShow）时，把**上一回打开到现在**之间错过的那些
 *     触发时刻，按当时的时刻补记成打卡记录。
 *
 * 换句话说，8 点该打的那一笔，你 9 点才打开小程序，它就带着 8:00 的时间戳
 * 补进去 —— 而不是不记，也不是记成 9 点。做不到「锁屏也照打」，这是平台限制，
 * 不是这里偷懒。
 *
 * ============================== 边界 ==============================
 *
 * - 最多往回找 MAX_LOOKBACK_MS（14 天）：装了很久没打开过也不能一口气铺几百条
 * - 每个任务一次最多补 MAX_CATCHUP 个触发点，超出的直接丢掉、只把位置推到当下。
 *   间隔设成「每 1 秒」再关两周，那是 120 万个触发点，不封顶能把 storage 写满
 * - 记录先写、位置后推：顺序反过来的话，写记录时一旦撞配额，那批触发时刻就
 *   永久丢了。反着来最多是「位置没记住、下次重复补一次」，重复好过丢失
 * ==================================================================
 */

const dayjs = require('./date.js')
const storage = require('./storage.js')

/** 一次最多补记几个触发点（不是记录条数 —— 一条任务一次触发还要乘 count） */
const MAX_CATCHUP = 30
/** 最多往回找多久：更早的错过就算了，不补 */
const MAX_LOOKBACK_MS = 14 * 24 * 3600000

const UNIT_MS = { second: 1000, minute: 60000, hour: 3600000 }

/** 这一天是不是这个任务的触发日（间隔模式不走这里，它按毫秒算） */
function matchesDay(task, day) {
  const dt = dayjs.parseDate(day)
  if (task.kind === 'weekly') {
    // getDay() 是 0=周日，任务里存的 weekdays 也是这个口径
    return task.weekdays.indexOf(dt.getDay()) >= 0
  }
  if (task.kind === 'monthly') {
    // 该月没有 31 号就把这个月那一次落在月末（和 date.js 的月末溢出是同一个处理）
    const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
    return dt.getDate() === Math.min(task.day, last)
  }
  return true
}

/**
 * 算出这个任务在 (from, to] 之间应该触发的那些时刻。
 *
 * 左开右闭：from 是上一次已经处理过的位置，本身不该再来一遍。
 *
 * @returns {Number[]} 时间戳数组，升序，最多 MAX_CATCHUP 个
 */
function fireTimes(task, from, to) {
  const out = []

  if (task.kind === 'interval') {
    const step = (task.every || 1) * (UNIT_MS[task.unit] || UNIT_MS.hour)
    // 相位锚在**创建时刻**上，不是上次补记的时刻：后者每轮都往后挪，
    // 「每 1 小时」会慢慢变成「从上一次打开算起 1 小时」
    const anchor = task.createdAt || 0
    let t = anchor + Math.floor(Math.max(0, from - anchor) / step + 1) * step
    while (t <= to && out.length < MAX_CATCHUP) {
      out.push(t)
      t += step
    }
    return out
  }

  // 每天 / 每周 / 每月：一天最多一个触发点，逐天走
  const lastDay = dayjs.formatDate(new Date(to))
  let day = dayjs.formatDate(new Date(from))
  // 400 是兜底：正常最多走 MAX_LOOKBACK_MS 那 14 天，加个上限防止脏数据把这里卡死
  for (let guard = 0; guard < 400 && out.length < MAX_CATCHUP; guard++) {
    if (matchesDay(task, day)) {
      const ts = dayjs.parseDate(day).getTime() + task.hh * 3600000 + task.mm * 60000
      if (ts > from && ts <= to) out.push(ts)
    }
    if (day >= lastDay) break
    day = dayjs.addDays(day, 1)
  }
  return out
}

/**
 * 把所有任务的错过触发点补成打卡记录。
 *
 * 在 app.onLaunch 与 app.onShow 里调用：前者管「冷启动」，后者管
 * 「切后台再回来」。重复调用是安全的 —— 每个任务的位置已经推到了当下，
 * 第二次进来时 (from, to] 是空区间。
 *
 * @param {Number} [now] 现在（毫秒），缺省取此刻；测试与调试时传得进来
 * @returns {Number} 这次补记了多少条记录
 */
function runDueTasks(now) {
  const at = Number(now) || Date.now()
  const floor = at - MAX_LOOKBACK_MS
  const map = Object.assign({}, storage.getTasksMap())
  let written = 0
  let dirty = false

  Object.keys(map).forEach((habitId) => {
    const habit = storage.getHabit(habitId)
    // 孤儿任务：习惯已经删了（deleteHabit 本来会一并收掉，这里是兜底）
    if (!habit) return
    const list = storage.getTasks(habitId)
    if (!list.length) return

    try {
      map[habitId] = list.map((task) => {
        // 上次真的触发在什么时候，和 lastRunAt（检查位置）分开记：
        // 后者每启动一次就推到当下，拿它当「上次打卡」显示是错的
        let firedAt = task.lastFiredAt || 0
        if (task.enabled) {
          const from = Math.max(task.lastRunAt || 0, task.createdAt || 0, floor)
          fireTimes(task, from, at).forEach((ts) => {
            const date = dayjs.formatDate(new Date(ts))
            // 数值取快捷步长：自动打卡不知道你想记多少，给一个和「快捷打卡」
            // 按钮一致的默认量，用户不满意可以去历史里改
            for (let i = 0; i < task.count; i++) {
              storage.addRecord(habitId, date, habit.step, task.desc, ts)
            }
            written += task.count
            firedAt = ts
          })
        }
        // 停用的任务也要把位置推到现在：不然停用一周再启用，
        // 那一周会被当成「错过的触发点」一次性补回来
        return Object.assign({}, task, { lastRunAt: at, lastFiredAt: firedAt })
      })
      dirty = true
    } catch (e) {
      // 多半是配额满了。已经补进去的留着，剩下的这一轮作罢 ——
      // 位置没推上去，下次打开会重扫，但不会把用户的数据写坏
      console.warn('[scheduler] 补记中断', habitId, e)
    }
  })

  if (!dirty) return written

  try {
    storage.touchTaskRuns(map)
  } catch (e) {
    // 位置没落盘，下次会重复补一遍。重复好过丢失，见文件头那段
    console.warn('[scheduler] 位置未落盘', e)
  }

  return written
}

module.exports = {
  MAX_CATCHUP,
  MAX_LOOKBACK_MS,
  fireTimes,
  runDueTasks
}
