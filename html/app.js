/**
 * html/app.js —— 网页统计台的界面
 *
 * 分工：
 *   store.js   数据（格式 = 小程序那一份）
 *   charts.js  折线 / 柱状 / 环比
 *   app.js     就是这一层：把统计页那套口径画出来，外加打卡 / 习惯 / 数据三块
 *
 * 统计的口径**照抄 pages/stats/stats.js**，一处不另起炉灶：
 *   窗口 = dayjs.windowOf(range, anchor)  → 汇总、排行、四张图用的是同一片时间
 *   出桶 = stats.bucketSeries(..., granOfRange(range), ...)  → 粒度就是区间
 *   排行 = stats.compareHabits(...) 再按**打卡次数**排序（各习惯单位不同，数值不可加）
 * 这些函数本身就是小程序的 utils/date.js、utils/stats.js（见 index.html 的加载器），
 * 所以网页和小程序算出来的数永远对得上。
 */
;(function () {
  const dayjs = window.__mods && window.__mods['./date.js']
  const stats = window.__mods && window.__mods['./stats.js']
  const Store = window.Store
  const Charts = window.Charts
  const AI = window.AI

  /** 热力图的周数上限：和小程序首页那个合并热力图一致（约 5 年） */
  const HEAT_MAX_WEEKS = 260
  /**
   * 占比环图最多画几片，其余并成「其他」。
   * 一是切片细过 5% 就只是一圈噪点，二是图例那一列不滚（见 styles.css），
   * 条数得封住才不会把卡片顶得比旁边的环还高。
   */
  const PIE_TOP = 6

  const state = {
    tab: 'stats',
    range: 'week',
    anchor: '',
    /** 热力图看哪个习惯：'' = 全部（按次数），否则按该习惯的数值 */
    heatFilter: '',
    /** 「两习惯对比」选中的两个习惯 */
    cmpA: '',
    cmpB: '',
    /** 详情弹窗里正在看的习惯 */
    detailId: '',
    /** 习惯编辑弹窗里正在编的习惯（null = 新建） */
    editingId: null,
    /** 编辑弹窗里那几个还没落库的字段 */
    draft: null,
    /** AI 正在跑时的 AbortController（点「停止」和超时都用它） */
    aiRun: null,
    aiTimer: null,
    toast: '',
    toastTimer: null
  }

  /** 一次 AI 请求最多等多久：云端慢起来是真慢，但也不能一直挂着 */
  const AI_TIMEOUT_MS = 120000

  // -------------------------------------------------------------------------
  // 小工具
  // -------------------------------------------------------------------------

  const $ = (sel) => document.querySelector(sel)

  /** 用户数据（习惯名、备注）会进 innerHTML，必须转义 —— 一个 `<` 就能把版面拆了 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function toast(text) {
    state.toast = text
    const el = $('#toast')
    if (el) {
      el.textContent = text
      el.classList.add('toast--on')
    }
    clearTimeout(state.toastTimer)
    state.toastTimer = setTimeout(() => {
      const t = $('#toast')
      if (t) t.classList.remove('toast--on')
    }, 2400)
  }

  /** 当前主题：dark / light。'system' 看系统，其余直接落 dark —— 网页只做深浅两套 */
  function currentTheme() {
    const setting = (Store.state.data.settings || {}).theme
    if (setting === 'light') return 'light'
    if (setting === 'system') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    return 'dark'
  }

  function applyTheme() {
    document.documentElement.dataset.theme = currentTheme()
  }

  // -------------------------------------------------------------------------
  // 统计页
  // -------------------------------------------------------------------------

  /** 合并出「全部习惯」的 dayMap。跨习惯只累加**次数**：单位不同，数值加不到一起 */
  function mergedDayMap(habits, recordsMap) {
    const map = {}
    habits.forEach((h) => {
      ;(recordsMap[h.id] || []).forEach((r) => {
        if (!r || !r.d) return
        if (!map[r.d]) map[r.d] = { count: 0, value: 0, records: [] }
        map[r.d].count += 1
        map[r.d].value += Number(r.v) || 0
        map[r.d].records.push(r)
      })
    })
    return map
  }

  /** 当前窗口（日 30 天 / 周 26 周 / 月 12 月 / 年 5 年），汇总与两张图共用 */
  function windowInfo() {
    const anchor = state.anchor || dayjs.today()
    const info = dayjs.windowOf(state.range, anchor)
    return { anchor: anchor, info: info, gran: stats.granOfRange(state.range) }
  }

  /** 往前 / 往后平移整屏。越界的判据和小程序一模一样：下一屏的最后一格还没发生 */
  function shiftedAnchor(delta) {
    const today = dayjs.today()
    const anchor = state.anchor || today
    const step = dayjs.windowPeriods(state.range)
    const next = dayjs.shiftRange(state.range, anchor, delta * step)
    return dayjs.rangeOf(state.range, next).start > dayjs.rangeOf(state.range, today).start ? null : next
  }

  /**
   * 排行榜那一份数据：汇总 / 排行 / 柱状图 / 占比环图都吃它。
   * 排序按**打卡次数**降序（各习惯单位不同，数值不可加）。
   */
  function computeRanking(habits, recordsMap, w) {
    return stats
      .compareHabits(habits, recordsMap, w.info.start, w.info.end)
      .sort((a, b) => b.summary.totalCount - a.summary.totalCount || b.summary.activeDays - a.summary.activeDays)
      .map((row) => ({
        id: row.habit.id,
        name: row.habit.name,
        icon: row.habit.icon,
        color: row.habit.color,
        unit: row.habit.unit || '次',
        target: row.habit.target,
        count: row.summary.totalCount,
        value: row.summary.totalValue,
        valueText: stats.fmtNum(row.summary.totalValue),
        activeDays: row.summary.activeDays,
        totalDays: row.summary.totalDays,
        completionRate: row.summary.completionRate,
        streak: row.streak.current,
        longest: row.streak.longest
      }))
  }

  function renderStats() {
    const w = windowInfo()
    const habits = Store.enabledHabits()
    const recordsMap = Store.recordsMap()
    const merged = mergedDayMap(habits, recordsMap)

    // ---- 汇总 ----
    const summary = stats.summarize(merged, w.info.start, w.info.end)
    const ranking = computeRanking(habits, recordsMap, w)
    const activeHabits = ranking.filter((r) => r.count > 0).length

    $('#rangeLabel').textContent = w.info.label
    $('#rangeLabel').title = '点击回到今天'
    const nextOk = !!shiftedAnchor(1)
    $('#shiftNext').disabled = !nextOk

    $('#tiles').innerHTML = [
      tile(summary.totalCount, '打卡总次数'),
      tile(summary.activeDays + ' / ' + summary.totalDays, '打卡天数'),
      tile(summary.completionRate + '%', '完成率'),
      tile(activeHabits + ' / ' + habits.length, '活跃习惯')
    ].join('')

    // ---- 折线：每（天/周/月/年）打卡趋势 ----
    const buckets = stats.bucketSeries(merged, w.gran, w.info.start, w.info.end)
    const lineTitle = '每' + stats.granLabel(state.range) + '打卡趋势'
    $('#lineTitle').textContent = lineTitle
    $('#lineSub').textContent = habits.length ? '全部习惯合计 · 共 ' + buckets.length + ' 格' : ''
    Charts.line($('#lineChart'), {
      labels: buckets.map((b) => b.label),
      values: buckets.map((b) => b.count),
      color: Charts.css('--accent', '#5B8CFF')
    })

    // ---- 柱状：各习惯次数对比 ----
    Charts.bar($('#barChart'), {
      labels: ranking.map((r) => r.name),
      values: ranking.map((r) => r.count),
      color: Charts.css('--success', '#37D0A0')
    })

    // ---- 排行 ----
    $('#ranking').innerHTML = ranking.length
      ? ranking
          .map(
            (r, i) =>
              '<div class="rank" data-act="detail" data-id="' + r.id + '">' +
              '<div class="rank-icon" style="background:' + Charts.hexA(r.color, 0.16) + ';border-color:' + Charts.hexA(r.color, 0.34) + '">' + esc(r.icon) + '</div>' +
              '<div class="rank-main">' +
              '<div class="rank-name"><span class="rank-no">' + (i + 1) + '</span>' + esc(r.name) + '</div>' +
              '<div class="rank-sub">连续 ' + r.streak + ' 天 · 最长 ' + r.longest + ' 天 · ' + r.activeDays + '/' + r.totalDays + ' 天</div>' +
              '<div class="bar"><i style="width:' + r.completionRate + '%;background:' + r.color + '"></i></div>' +
              '</div>' +
              '<div class="rank-num" style="color:' + r.color + '">' + r.count + '<small>次</small></div>' +
              '</div>'
          )
          .join('')
      : '<p class="empty">这个区间还没有打卡记录。</p>'

    // ---- 两个习惯对比 + 占比圆环 ----
    pickCompare(habits)
    drawCompare(w)
    drawPie(ranking)

    renderHeatmap(habits, recordsMap)
  }

  function tile(value, label) {
    return '<div class="tile"><div class="tile-value">' + esc(value) + '</div><div class="tile-label">' + esc(label) + '</div></div>'
  }

  /**
   * 名字单独裹一层 span：位置不够时只截断名字，把后面的次数 / 百分比保住。
   * 直接写文本节点没有盒子，text-overflow 是落不上去的。
   */
  function legendItem(color, label, note) {
    return (
      '<span class="legend-item"><i style="background:' + color + '"></i>' +
      '<span class="legend-name">' + esc(label) + '</span>' +
      '<em>' + esc(note) + '</em></span>'
    )
  }

  /**
   * 两个下选框：默认挑前两个，省得进来先点两下才看得见东西。
   * 习惯被删掉 / 停用后这一格会落空，在这儿捞回来。
   */
  function pickCompare(habits) {
    const ids = habits.map((h) => h.id)
    if (!ids.length) {
      state.cmpA = ''
      state.cmpB = ''
      $('#cmpA').innerHTML = ''
      $('#cmpB').innerHTML = ''
      return
    }
    if (ids.indexOf(state.cmpA) < 0) state.cmpA = ids[0]
    if (ids.indexOf(state.cmpB) < 0 || state.cmpB === state.cmpA) {
      state.cmpB = ids.filter((id) => id !== state.cmpA)[0] || state.cmpA
    }
    const options = (cur) =>
      habits
        .map((h) => '<option value="' + h.id + '"' + (h.id === cur ? ' selected' : '') + '>' + esc(h.icon + ' ' + h.name) + '</option>')
        .join('')
    $('#cmpA').innerHTML = options(state.cmpA)
    $('#cmpB').innerHTML = options(state.cmpB)
  }

  /** 两个习惯各自的每格**次数** —— 跨习惯只有次数可比（单位不同，数值不可加） */
  function compareSeries(w) {
    return [state.cmpA, state.cmpB]
      .filter((id, i, arr) => id && arr.indexOf(id) === i)
      .map((id) => {
        const h = Store.habit(id)
        if (!h) return null
        const buckets = stats.bucketSeries(stats.buildDayMap(Store.records(id)), w.gran, w.info.start, w.info.end)
        return {
          name: h.icon + ' ' + h.name,
          color: h.color,
          labels: buckets.map((b) => b.label),
          values: buckets.map((b) => b.count)
        }
      })
      .filter(Boolean)
  }

  function drawCompare(w) {
    const series = compareSeries(w)
    Charts.line($('#cmpChart'), { labels: series.length ? series[0].labels : [], series: series })
    $('#cmpLegend').innerHTML = series.length
      ? series
          .map((s) => legendItem(s.color, s.name, s.values.reduce((a, b) => a + b, 0) + ' 次'))
          .join('')
      : '<span class="dim">还没有可对比的习惯。</span>'
  }

  /**
   * 占比环图。习惯一多切片就细得没法看，所以只画前几名（PIE_TOP），
   * 剩下的并成一格「其他」—— 环上少一圈噪点，图例也短。
   */
  function drawPie(ranking) {
    const all = ranking
      .filter((r) => r.count > 0)
      .map((r) => ({ label: r.icon + ' ' + r.name, value: r.count, color: r.color }))
    const items = all.length > PIE_TOP
      ? all.slice(0, PIE_TOP).concat([
          { label: '其他 ' + (all.length - PIE_TOP) + ' 个', value: all.slice(PIE_TOP).reduce((a, b) => a + b.value, 0), color: Charts.css('--text-3', '#7E8798') }
        ])
      : all
    const total = all.reduce((a, b) => a + b.value, 0)

    Charts.pie($('#pieChart'), { items: items })
    $('#pieLegend').innerHTML = total
      ? items.map((it) => legendItem(it.color, it.label, it.value + ' 次 · ' + ((it.value * 100) / total).toFixed(1) + '%')).join('')
      : '<span class="dim">这个区间还没有打卡记录。</span>'
  }

  // -------------------------------------------------------------------------
  // AI 分析（统计页右栏）
  //
  // 配置的存取在 store.js（走的是一格独立的 IndexedDB，**不进** state.data），
  // 怎么发请求在 ai.js。这里只管表单、按钮和结果。
  // -------------------------------------------------------------------------

  /**
   * 把配置写回表单 + 顶上的状态行。
   * **只在「刚载入 / 刚保存 / 刚清除」时调用**，不跟着 renderStats 走 ——
   * 换区间就看一眼统计是很平常的事，那会儿把用户正在敲的地址覆盖掉最恼人。
   */
  function renderAiCard() {
    const cfg = Store.getAi()
    $('#aiPreset').innerHTML =
      '<option value="">选择服务商…</option>' +
      AI.PRESETS.map(
        (p) => '<option value="' + p.id + '"' + (cfg.presetId === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'
      ).join('')
    $('#aiBase').value = cfg.base || ''
    $('#aiModel').value = cfg.model || ''
    $('#aiKey').value = cfg.key || ''

    const who = AI.describe(cfg)
    $('#aiTag').textContent = who || '未接入'
    $('#aiHint').innerHTML = who
      ? '接到 <b>' + esc(who) + '</b>' + (AI.isLocal(cfg.base) ? '（跑在你自己机器上）' : '') +
        '。只把这段统计汇总发过去，原始打卡记录一条都不发。'
      : '还没接入。展开下面的「接入设置」，选个服务商、粘上自己的 API Key 就能用；' +
        '不想把数据发给云端的话，本机装个 <b>Ollama</b> 选它就行，连 Key 都不用。'
  }

  /** 发给 AI 的那份摘要 —— 全是汇总，原始记录一条不带 */
  function aiSnapshot() {
    const w = windowInfo()
    const habits = Store.enabledHabits()
    const recordsMap = Store.recordsMap()
    const merged = mergedDayMap(habits, recordsMap)
    return {
      start: w.info.start,
      end: w.info.end,
      label: w.info.label,
      gran: stats.granLabel(state.range),
      today: dayjs.today(),
      summary: stats.summarize(merged, w.info.start, w.info.end),
      habits: computeRanking(habits, recordsMap, w),
      trend: stats.bucketSeries(merged, w.gran, w.info.start, w.info.end).map((b) => ({ label: b.label, count: b.count }))
    }
  }

  function setAiBusy(busy) {
    $('#aiRunBtn').disabled = busy
    $('#aiRunBtn').textContent = busy ? '分析中…' : '开始分析'
    $('#aiStopBtn').hidden = !busy
  }

  function runAi() {
    if (state.aiRun) return
    const cfg = Store.getAi()
    if (!AI.describe(cfg)) {
      $('#aiCfg').open = true
      toast('先在「接入设置」里选服务商、填好地址和模型')
      return
    }
    // 本地服务不鉴权；云端少了 Key 只会换来一个 401，不如先说清楚
    if (!AI.isLocal(cfg.base) && !String(cfg.key || '').trim()) {
      $('#aiCfg').open = true
      toast('这个服务商要 API Key，先在「接入设置」里填上')
      return
    }
    if (!Store.enabledHabits().length) {
      toast('还没有习惯，先去「习惯」页建一个，或到「数据」页载入示例数据')
      return
    }

    const prompt = AI.buildPrompt(aiSnapshot(), $('#aiQ').value)
    const ctrl = new AbortController()
    const started = Date.now()
    state.aiRun = ctrl
    $('#aiErr').hidden = true
    $('#aiOut').hidden = true
    setAiBusy(true)
    // 秒表：云端一次二三十秒是常事，光转圈会让人以为卡死了
    state.aiTimer = setInterval(() => {
      $('#aiRunBtn').textContent = '分析中… ' + Math.round((Date.now() - started) / 1000) + 's'
    }, 1000)
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS)

    AI.ask(cfg, prompt, ctrl.signal)
      .then((text) => {
        showAiText(text)
        toast('分析完成')
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') {
          const timedOut = Date.now() - started >= AI_TIMEOUT_MS - 500
          showAiErr(timedOut ? '等太久了（超过 ' + AI_TIMEOUT_MS / 1000 + ' 秒），已经停掉。换个更快的模型试试。' : '已停止。')
        } else {
          showAiErr((err && err.message) || String(err))
        }
      })
      .finally(() => {
        clearTimeout(timer)
        clearInterval(state.aiTimer)
        state.aiTimer = null
        state.aiRun = null
        setAiBusy(false)
      })
  }

  function stopAi() {
    if (state.aiRun) state.aiRun.abort()
  }

  /** 模型输出是外来的，一律 textContent —— 一个 < 就能把右栏拆了 */
  function showAiText(text) {
    const el = $('#aiOut')
    el.textContent = text
    el.hidden = false
  }

  function showAiErr(msg) {
    const el = $('#aiErr')
    el.textContent = msg
    el.hidden = false
  }

  function saveAi() {
    const base = ($('#aiBase').value || '').trim()
    const model = ($('#aiModel').value || '').trim()
    if (!base || !model) {
      toast('接口地址和模型名都要填')
      return
    }
    const p = AI.preset($('#aiPreset').value)
    const cfg = Store.getAi()
    const patch = {
      presetId: $('#aiPreset').value || 'custom',
      kind: p ? p.kind : cfg.kind || 'openai',
      base: base,
      model: model,
      key: ($('#aiKey').value || '').trim()
    }
    Store.setAi(patch).then((r) => {
      if (!r.ok) {
        toast('保存失败：' + r.message)
        return
      }
      renderAiCard()
      toast('已保存 —— 只存在这个浏览器里，不会写进导出的 JSON')
    })
  }

  /**
   * 全部历史热力图。铺满从最早一条记录到今天的每一周，不够宽就横向滑动 ——
   * 这正是「存储无限制」看得见的地方：小程序那边得靠自动清理腾空间，
   * 这里几万条记录也就一张长图。
   */
  function renderHeatmap(habits, recordsMap) {
    const today = dayjs.today()
    const sel = $('#heatFilter')
    const options = ['<option value="">全部习惯（按次数）</option>'].concat(
      Store.habits().map((h) => '<option value="' + h.id + '"' + (state.heatFilter === h.id ? ' selected' : '') + '>' + esc(h.icon + ' ' + h.name) + '</option>')
    )
    sel.innerHTML = options.join('')

    const target = state.heatFilter ? Store.habit(state.heatFilter) : null
    const list = target ? recordsMap[target.id] || [] : null
    const dayMap = target ? stats.buildDayMap(list) : mergedDayMap(habits, recordsMap)

    let earliest = today
    Object.keys(dayMap).forEach((d) => {
      if (dayMap[d].count > 0 && d < earliest) earliest = d
    })
    const weeks = Math.min(HEAT_MAX_WEEKS, Math.max(2, Math.ceil(dayjs.diffDays(earliest, today) / 7) + 1))
    const data = stats.heatmapData(dayMap, today, weeks, target ? target.target : 0)

    const rows = []
    rows.push('<div class="hm-grid" style="--hm-cols:' + weeks + '">')
    // 第一行是月份刻度：和格子同处一个 grid 的一列里，天然对齐
    for (let w = 0; w < weeks; w++) {
      const mark = data.monthLabels.filter((m) => m.index === w)[0]
      rows.push('<i class="hm-month">' + (mark ? esc(mark.label) : '') + '</i>')
    }
    // 第二到第八行：周一到周日
    for (let r = 0; r < 7; r++) {
      for (let w = 0; w < weeks; w++) {
        const cell = data.columns[w][r]
        const unit = target ? target.unit || '' : '次'
        const tip = cell.date + ' · ' + cell.count + ' 次' + (target ? ' · ' + stats.fmtNum(cell.value) + unit : '')
        rows.push(
          '<i class="hm-cell l' + (cell.future ? 'f' : cell.level) + '" data-act="heat" title="' + esc(tip) + '" data-date="' + cell.date + '"></i>'
        )
      }
    }
    rows.push('</div>')
    $('#heatmap').innerHTML = rows.join('')
  }

  // -------------------------------------------------------------------------
  // 习惯页
  // -------------------------------------------------------------------------

  function renderHabits() {
    const list = Store.habits()
    const today = dayjs.today()

    $('#habitList').innerHTML = list.length
      ? list
          .map((h) => {
            const dayMap = stats.buildDayMap(Store.records(h.id))
            const streak = stats.computeStreak(dayMap, today)
            const todayCell = dayMap[today]
            const done = !!(todayCell && todayCell.count > 0)
            const value = todayCell ? stats.fmtNum(todayCell.value) : '0'
            return (
              '<div class="hcard' + (h.enabled === false ? ' hcard--off' : '') + '" style="--hc:' + h.color + '">' +
              '<div class="hcard-icon">' + esc(h.icon) + '</div>' +
              '<div class="hcard-main">' +
              '<div class="hcard-name">' + esc(h.name) + (h.enabled === false ? '<small class="tag">已停用</small>' : '') + '</div>' +
              '<div class="hcard-sub">今天 ' + value + esc(h.unit || '次') +
              (h.target ? ' / 目标 ' + stats.fmtNum(h.target) + esc(h.unit || '') : '') +
              ' · 连续 ' + streak.current + ' 天 · 最长 ' + streak.longest + ' 天</div>' +
              '</div>' +
              '<div class="hcard-acts">' +
              '<button class="btn btn--primary" data-act="quick" data-id="' + h.id + '" title="记一笔 ' + h.step + esc(h.unit || '') + '">+' + h.step + '</button>' +
              (done ? '<button class="btn btn--ghost" data-act="undo" data-id="' + h.id + '">撤销今天</button>' : '') +
              '<button class="btn btn--ghost" data-act="detail" data-id="' + h.id + '">详情</button>' +
              '<button class="btn btn--ghost" data-act="edit" data-id="' + h.id + '">编辑</button>' +
              '<button class="btn btn--ghost btn--danger" data-act="del" data-id="' + h.id + '">删除</button>' +
              '</div></div>'
            )
          })
          .join('')
      : '<p class="empty">还没有习惯。点上面的「新建习惯」，或者去「数据」页载入示例数据看看。</p>'
  }

  // -------------------------------------------------------------------------
  // 数据页
  // -------------------------------------------------------------------------

  function renderData() {
    const o = Store.overview()
    const st = Store.state.status

    $('#dataTiles').innerHTML = [
      tile(o.habitCount + ' 个', '习惯'),
      tile(o.recordCount + ' 条', '打卡记录'),
      tile(o.earliest || '—', '最早记录'),
      tile(o.bytes > 1024 * 1024 ? (o.bytes / 1024 / 1024).toFixed(2) + ' MB' : Math.max(1, Math.round(o.bytes / 1024)) + ' KB', '数据体积')
    ].join('')

    const where = o.connected
      ? '<b class="ok">已绑定文件</b> ' + esc(o.fileName) + '（和本页同目录）'
      : Store.state.handle
      ? '<b class="warn">文件权限断开了</b> ' + esc(o.fileName) + '，点「重新连接」'
      : '<b class="warn">还没有绑定文件</b>，数据暂时存在浏览器里（IndexedDB，容量按磁盘走）'

    $('#fileState').innerHTML =
      where +
      '<br><span class="dim">当前数据来自：' +
      ({ file: '同目录的 JSON 文件', idb: '浏览器的 IndexedDB', memory: '内存（还没落盘）' }[o.source] || o.source) +
      ' · ' + esc(st.text) + '</span>' +
      (o.supported ? '' : '<br><span class="warn">这个浏览器不支持 File System Access API（Chrome / Edge 才有），只能用「下载 / 导入 JSON」手动搬。</span>')
  }

  // -------------------------------------------------------------------------
  // 详情弹窗
  // -------------------------------------------------------------------------

  function openDetail(id) {
    state.detailId = id
    const h = Store.habit(id)
    if (!h) return
    const today = dayjs.today()
    $('#detailTitle').textContent = h.icon + ' ' + h.name
    const box = $('#detailBody')
    box.dataset.habit = id

    const dayMap = stats.buildDayMap(Store.records(id))
    const w = windowInfo()
    const sum = stats.summarize(dayMap, w.info.start, w.info.end)
    const streak = stats.computeStreak(dayMap, today)
    const unit = h.unit || '次'

    // 单个习惯看的是**数值**（有自己的单位），跨习惯才只能比次数
    const buckets = stats.bucketSeries(dayMap, w.gran, w.info.start, w.info.end)

    const rows = Store.records(id)
      .slice()
      .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b.t || 0) - (a.t || 0)))
      .slice(0, 20)

    box.innerHTML =
      '<div class="tiles tiles--4">' +
      tile(sum.count, '本期次数') +
      tile(stats.fmtNum(sum.totalValue) + unit, '本期累计') +
      tile(sum.activeDays + '/' + sum.totalDays, '打卡天数') +
      tile(streak.current + ' / ' + streak.longest, '连续 / 最长') +
      '</div>' +
      '<h3 class="h3">每' + stats.granLabel(state.range) + '趋势（' + esc(w.info.label) + '）</h3>' +
      '<div class="canvas-wrap canvas-wrap--sm"><canvas id="detailChart"></canvas></div>' +
      '<h3 class="h3">记一笔</h3>' +
      '<div class="form-row">' +
      '<label>日期<input type="date" id="recDate" value="' + today + '" max="' + today + '"></label>' +
      '<label>数值<input type="number" id="recValue" value="' + (Number(h.step) || 1) + '" min="0" step="any"></label>' +
      '<label class="grow">备注<input type="text" id="recNote" placeholder="可留空" maxlength="30"></label>' +
      '<button class="btn btn--primary" data-act="addrec" data-id="' + id + '">记下</button>' +
      '</div>' +
      '<p class="dim">网页版允许补记过去的日期（小程序里只能记当天）—— 桌面端多半就是拿来补账的。</p>' +
      '<h3 class="h3">最近记录</h3>' +
      '<div class="recs">' +
      (rows.length
        ? rows
            .map(
              (r) =>
                '<div class="rec">' +
                '<span class="rec-d">' + r.d + '</span>' +
                '<span class="rec-v">' + stats.fmtNum(r.v) + esc(unit) + '</span>' +
                '<span class="rec-n">' + (r.n ? esc(r.n) : '<i class="dim">无备注</i>') + '</span>' +
                (r.d === today
                  ? '<button class="rec-del" data-act="delrec" data-hid="' + id + '" data-id="' + r.id + '" title="删除这条">×</button>'
                  : '<span class="rec-ro dim" title="过去的日子只读">只读</span>') +
                '</div>'
            )
            .join('')
        : '<p class="empty">还没有记录。</p>') +
      '</div>'

    Charts.line($('#detailChart'), {
      labels: buckets.map((b) => b.label),
      values: buckets.map((b) => b.value),
      color: h.color
    })

    openModal('#detailModal')
  }

  // -------------------------------------------------------------------------
  // 习惯编辑弹窗
  // -------------------------------------------------------------------------

  function openEditor(id) {
    const base = id
      ? Object.assign({}, Store.habit(id))
      : { name: '', unit: '次', icon: '🎯', color: Store.HABIT_COLORS[0], target: 0, step: 1, enabled: true }
    state.editingId = id || null
    state.draft = base
    $('#editorTitle').textContent = id ? '编辑习惯' : '新建习惯'
    drawEditor()
    openModal('#habitModal')
    setTimeout(() => $('#fName').focus(), 60)
  }

  function drawEditor() {
    const d = state.draft
    $('#editorBody').innerHTML =
      '<div class="form-row"><label class="grow">名称<input id="fName" type="text" maxlength="12" value="' + esc(d.name) + '" placeholder="比如「背单词」"></label></div>' +
      '<div class="form-row">' +
      '<label>单位<input id="fUnit" type="text" maxlength="6" value="' + esc(d.unit) + '" placeholder="可为空"></label>' +
      '<label>每日目标<input id="fTarget" type="number" min="0" step="any" value="' + (Number(d.target) || 0) + '"></label>' +
      '<label>快捷步长<input id="fStep" type="number" min="0" step="any" value="' + (Number(d.step) || 1) + '"></label>' +
      '</div>' +
      '<div class="pick-row">常用单位：' +
      Store.UNIT_PRESETS.map((u) => '<button class="pick" data-act="pickunit" data-v="' + esc(u) + '">' + esc(u) + '</button>').join('') +
      '</div>' +
      '<div class="pick-row">图标：' +
      Store.ICON_PRESETS.map((i2) => '<button class="pick pick--icon' + (d.icon === i2 ? ' pick--on' : '') + '" data-act="pickicon" data-v="' + i2 + '">' + i2 + '</button>').join('') +
      '</div>' +
      '<div class="pick-row">颜色：' +
      Store.HABIT_COLORS.map((c) => '<button class="pick pick--color' + (d.color === c ? ' pick--on' : '') + '" data-act="pickcolor" data-v="' + c + '" style="background:' + c + '"></button>').join('') +
      '<input id="fColor" type="color" value="' + esc(d.color) + '" title="自定义颜色">' +
      '</div>' +
      '<label class="check"><input id="fEnabled" type="checkbox"' + (d.enabled !== false ? ' checked' : '') + '> 启用（停用后不计入统计）</label>'
  }

  // -------------------------------------------------------------------------
  // 弹窗开关
  // -------------------------------------------------------------------------

  function openModal(sel) {
    const el = $(sel)
    el.hidden = false
    requestAnimationFrame(() => el.classList.add('modal--on'))
  }

  function closeModal(sel) {
    const el = $(sel)
    if (!el) return
    el.classList.remove('modal--on')
    setTimeout(() => {
      el.hidden = true
    }, 180)
  }

  function closeAllModals() {
    closeModal('#detailModal')
    closeModal('#habitModal')
  }

  // -------------------------------------------------------------------------
  // 交互
  // -------------------------------------------------------------------------

  function setTab(tab) {
    state.tab = tab
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('tab--on', b.dataset.tab === tab))
    document.querySelectorAll('.pane').forEach((p) => {
      p.hidden = p.id !== 'pane-' + tab
    })
    render()
  }

  /** 图都画在 canvas 上，DOM 重排不会自动重画 —— 窗口一动就得自己来一遍 */
  function redrawCharts() {
    if (state.tab === 'stats') {
      const w = windowInfo()
      const habits = Store.enabledHabits()
      const recordsMap = Store.recordsMap()
      const merged = mergedDayMap(habits, recordsMap)
      const buckets = stats.bucketSeries(merged, w.gran, w.info.start, w.info.end)
      Charts.line($('#lineChart'), {
        labels: buckets.map((b) => b.label),
        values: buckets.map((b) => b.count),
        color: Charts.css('--accent', '#5B8CFF')
      })
      const ranking = computeRanking(habits, recordsMap, w)
      Charts.bar($('#barChart'), {
        labels: ranking.map((r) => r.name),
        values: ranking.map((r) => r.count),
        color: Charts.css('--success', '#37D0A0')
      })
      drawCompare(w)
      drawPie(ranking)
    }
    if (state.detailId && !$('#detailModal').hidden) openDetail(state.detailId)
  }

  /** 顶栏那行小字：数据现在落在哪儿、上次保存成没成 —— 三个 tab 都要看得见 */
  function updateTopFile() {
    const o = Store.overview()
    const el = $('#topFile')
    if (!el) return
    el.textContent = o.connected ? '📄 ' + o.fileName : '🖥 浏览器存储（未绑定文件）'
    el.className = 'filestate ' + (Store.state.status.ok ? '' : 'filestate--bad')
    el.title = Store.state.status.text
  }

  function render() {
    updateTopFile()
    if (state.tab === 'stats') renderStats()
    if (state.tab === 'habits') renderHabits()
    if (state.tab === 'data') renderData()
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]')
    if (e.target.closest('#segRange [data-range]')) {
      const range = e.target.closest('[data-range]').dataset.range
      if (range !== state.range) {
        state.range = range
        state.anchor = ''
        document.querySelectorAll('#segRange [data-range]').forEach((b) => b.classList.toggle('seg-item--on', b.dataset.range === range))
        render()
      }
      return
    }
    if (e.target.closest('[data-shift]')) {
      const delta = Number(e.target.closest('[data-shift]').dataset.shift)
      const next = shiftedAnchor(delta)
      if (next) {
        state.anchor = next
        render()
      }
      return
    }
    if (e.target.closest('#rangeLabel')) {
      state.anchor = ''
      render()
      return
    }
    if (e.target.closest('.modal-close') || e.target.classList.contains('modal-mask')) {
      closeAllModals()
      return
    }
    if (!btn) return

    const act = btn.dataset.act
    const id = btn.dataset.id

    if (act === 'quick') {
      const h = Store.habit(id)
      if (!h) return
      Store.addRecord(id, dayjs.today(), Number(h.step) || 1, '')
      toast('已记下 ' + (Number(h.step) || 1) + (h.unit || '') + ' · ' + h.name)
      render()
    } else if (act === 'undo') {
      const n = Store.clearRecordsOfDay(id, dayjs.today())
      toast(n ? '已撤销今天的 ' + n + ' 条记录' : '今天本来就没有记录')
      render()
    } else if (act === 'detail') {
      openDetail(id)
    } else if (act === 'edit') {
      openEditor(id)
    } else if (act === 'del') {
      const h = Store.habit(id)
      const n = Store.records(id).length
      if (!confirm('删除「' + h.name + '」？它的 ' + n + ' 条打卡记录会一起删掉，且无法撤销。')) return
      Store.deleteHabit(id)
      toast('已删除「' + h.name + '」，连带 ' + n + ' 条记录')
      render()
    } else if (act === 'new') {
      openEditor(null)
    } else if (act === 'cancel') {
      closeModal('#habitModal')
    } else if (act === 'home') {
      state.anchor = ''
      setTab('stats')
    } else if (act === 'pickicon' || act === 'pickcolor' || act === 'pickunit') {
      if (act === 'pickicon') state.draft.icon = btn.dataset.v
      if (act === 'pickcolor') state.draft.color = btn.dataset.v
      if (act === 'pickunit') state.draft.unit = btn.dataset.v
      drawEditor()
    } else if (act === 'savehabit') {
      saveEditor()
    } else if (act === 'addrec') {
      const h = Store.habit(id)
      const date = $('#recDate').value || dayjs.today()
      const value = Number($('#recValue').value)
      const note = $('#recNote').value || ''
      if (!value || value <= 0) {
        toast('数值要大于 0')
        return
      }
      if (date > dayjs.today()) {
        toast('还没到的日子记不了')
        return
      }
      Store.addRecord(id, date, value, note)
      toast('已记下 ' + date + ' · ' + stats.fmtNum(value) + (h.unit || ''))
      if (state.tab === 'stats') render()
      renderHabits()
      openDetail(id)
    } else if (act === 'delrec') {
      Store.deleteRecord(btn.dataset.hid, id)
      toast('已删除这条记录')
      if (state.tab === 'stats') render()
      renderHabits()
      openDetail(btn.dataset.hid)
    } else if (act === 'bindnew') {
      doFile('bindNew')
    } else if (act === 'bindopen') {
      doFile('bindExisting')
    } else if (act === 'reconnect') {
      doFile('reconnect')
    } else if (act === 'reload') {
      if (!confirm('重新读取 ' + (Store.state.handle ? Store.state.handle.name : '文件') + '？浏览器里的改动会以文件为准被覆盖。')) return
      Store.reloadFromFile()
        .then((info) => {
          toast('已从文件读回 ' + info.habits + ' 个习惯 / ' + info.records + ' 条记录')
          render()
        })
        .catch((err) => alert(err.message))
    } else if (act === 'download') {
      downloadJson()
    } else if (act === 'copy') {
      copyJson()
    } else if (act === 'import') {
      $('#importFile').click()
    } else if (act === 'clear') {
      if (!confirm('清空全部习惯与打卡记录？建议先导出备份。')) return
      Store.clearAll()
      toast('已清空')
      state.detailId = ''
      render()
    } else if (act === 'seed') {
      if (!confirm('载入示例数据？当前数据会被整份替换（先导出备份更稳妥）。')) return
      Store.seedDemo()
      toast('已载入示例数据')
      render()
    } else if (act === 'airun') {
      runAi()
    } else if (act === 'aistop') {
      stopAi()
    } else if (act === 'aisave') {
      saveAi()
    } else if (act === 'aiclear') {
      if (!confirm('清除 AI 配置？存着的 API Key 会一起删掉。')) return
      Store.setAi({ presetId: '', kind: 'openai', base: '', model: '', key: '' }).then(() => {
        renderAiCard()
        // 结果也不用留着了
        $('#aiOut').hidden = true
        $('#aiErr').hidden = true
        toast('已清除 AI 配置')
      })
    } else if (act === 'theme') {
      const next = currentTheme() === 'light' ? 'dark' : 'light'
      Store.updateSettings({ theme: next })
      applyTheme()
      render()
    } else if (act === 'heat') {
      // 热力图上的格子：只做「跳到那天所在的统计区间」这一件事，够用了
      state.anchor = btn.dataset.date
      state.tab = 'stats'
      setTab('stats')
    }
  }

  function saveEditor() {
    const name = ($('#fName').value || '').trim()
    if (!name) {
      toast('名字不能为空')
      return
    }
    const payload = {
      id: state.editingId || undefined,
      name: name.slice(0, 12),
      unit: ($('#fUnit').value || '').trim().slice(0, 6),
      icon: state.draft.icon,
      color: $('#fColor').value || state.draft.color,
      target: Number($('#fTarget').value) || 0,
      step: Number($('#fStep').value) || 1,
      enabled: $('#fEnabled').checked
    }
    Store.saveHabit(payload)
    closeModal('#habitModal')
    toast(state.editingId ? '已保存' : '已新建「' + payload.name + '」')
    render()
  }

  function doFile(method) {
    if (!Store.fileSupported()) {
      alert('这个浏览器不支持直接写本地文件。请用「下载 JSON」把文件存到 html/ 目录里，下次「导入 JSON」再选回来。')
      return
    }
    Store[method]()
      .then(() => {
        applyTheme()
        render()
        toast('文件已接上，之后的每次改动都会写进 ' + (Store.state.handle ? Store.state.handle.name : ''))
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return
        alert('没接上文件：' + ((err && err.message) || err))
      })
  }

  function downloadJson() {
    const blob = new Blob([Store.exportText()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = Store.FILE_HINT
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    toast('已下载 ' + Store.FILE_HINT + '（小程序里可「导入」，本页也能再导回来）')
  }

  /** 复制走的那段 JSON 可以直接粘进小程序的「存储管理 → 导入」 */
  function copyJson() {
    const text = Store.exportText()
    const done = () => toast('已复制 ' + Math.max(1, Math.round(text.length / 1024)) + ' KB，可粘进小程序的导入框')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done))
    } else {
      fallbackCopy(text, done)
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      done()
    } catch (e) {
      alert('复制失败，请改用「下载 JSON」')
    }
    document.body.removeChild(ta)
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        // paste=true 时数据不动，只解析一遍给用户看
        const info = Store.importText(String(reader.result))
        toast('导入完成：' + info.habits + ' 个习惯 / ' + info.records + ' 条记录')
        closeAllModals()
        state.detailId = ''
        state.anchor = ''
        applyTheme()
        render()
      } catch (err) {
        alert('导入失败：' + err.message + '（原有数据没有动）')
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  // -------------------------------------------------------------------------
  // 启动
  // -------------------------------------------------------------------------

  function boot() {
    if (!dayjs || !stats) {
      document.body.innerHTML =
        '<div class="fatal">找不到 <code>../utils/date.js</code> 与 <code>../utils/stats.js</code>。' +
        '本页要和小程序共用同一套日期 / 统计实现，所以必须待在项目的 <code>html/</code> 里（不能单独把这个文件夹拖出去）。</div>'
      return
    }

    document.addEventListener('click', onClick)
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)))
    $('#importFile').addEventListener('change', onImportFile)
    $('#heatFilter').addEventListener('change', (e) => {
      state.heatFilter = e.target.value
      renderStats()
    })
    $('#cmpA').addEventListener('change', (e) => {
      state.cmpA = e.target.value
      renderStats()
    })
    $('#cmpB').addEventListener('change', (e) => {
      state.cmpB = e.target.value
      renderStats()
    })
    $('#aiPreset').addEventListener('change', (e) => {
      // 换服务商就把地址和模型一并填好；Key 留着不动（在几家之间来回换时省事）
      const p = AI.preset(e.target.value)
      if (p && p.id !== 'custom') {
        $('#aiBase').value = p.base
        $('#aiModel').value = p.model
      }
    })
    $('#editorBody').addEventListener('input', (e) => {
      if (e.target.id === 'fColor') {
        state.draft.color = e.target.value
      }
    })

    let resizeTimer = null
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(redrawCharts, 120)
    })
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if ((Store.state.data.settings || {}).theme === 'system') {
        applyTheme()
        render()
      }
    })

    Store.onChange(() => {
      // 数据变了就把「数据」页那几个数刷新一下（其它页在动作里已经重画过）
      if (state.tab === 'data') renderData()
    })

    Store.init().then(() => {
      applyTheme()
      // AI 配置也是 init 里异步读出来的，得等它读完才能填表
      renderAiCard()
      const settings = Store.state.data.settings || {}
      document.querySelectorAll('#segRange [data-range]').forEach((b) => b.classList.toggle('seg-item--on', b.dataset.range === state.range))
      setTab('stats')
      if (!Store.state.data.habits.length) render()
      if (Store.state.handle && !Store.state.connected) {
        toast('文件 ' + Store.state.handle.name + ' 需要重新授权：去「数据」页点「重新连接」')
      }
    })
  }

  document.addEventListener('DOMContentLoaded', boot)
})()
