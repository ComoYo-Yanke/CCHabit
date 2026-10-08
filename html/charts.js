/**
 * html/charts.js —— 三张图（折线 / 柱状 / 环比），Canvas 2D 手写
 *
 * 为什么不用现成的库：这里要画的就这几张，而仓库里那份 uCharts 是给
 * 小程序 canvas 2d 接口写的（它的入口要吃小程序那套 canvas 节点/上下文），
 * 塞进浏览器得先搭一层适配。手写这两张反而更短、更好调，也没有依赖。
 *
 * 几条和外观有关的约定：
 *  - 颜色**从 CSS 变量里读**，不写死十六进制。写死的话换主题时图和页面就分了家
 *    （小程序那边是反过来的：canvas 读不到 CSS 变量，颜色只能由 JS 喂 —— 见
 *    `utils/theme.js` 的 chartVars。网页这边反而能直接读，就别多一层映射了）
 *  - 画布按 devicePixelRatio 放大，否则高分屏上图是糊的
 *  - 格子太密时**按需抽稀横轴标签**，而不是换个更小的字号硬塞
 */
window.Charts = (function () {
  /** 一个横轴标签至少要有这么多像素，否则隔几个画一个 */
  const MIN_LABEL = 54

  /** 读一个 CSS 变量的当前值 —— 主题一变，图跟着变 */
  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback || ''
  }

  /**
   * 把画布按 dpr 铺好，返回 {ctx, w, h}（w/h 是 CSS 像素）。
   *
   * 宽度**只取外层盒子的宽度**，不给下限。格子再多也照样塞进去：
   * 每一格变窄、横轴标签按 labelStep 抽稀（那本来就是为这件事准备的），
   * 而不是让画布伸出盒子外面去横向滚动。图永远是一屏看全的。
   */
  function prepare(canvas) {
    const box = canvas.parentElement
    const w = Math.max(1, box.clientWidth - 2)
    const h = box.clientHeight || 260
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    return { ctx: ctx, w: w, h: h }
  }

  /** 取一个「整齐」的纵轴上限：1 / 2 / 5 / 10 的整数倍，别让刻度出现 37.333 */
  function niceMax(v) {
    if (!(v > 0)) return 1
    const exp = Math.floor(Math.log10(v))
    const base = Math.pow(10, exp)
    const n = v / base
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
    return step * base
  }

  function fmtTick(v) {
    if (v >= 10000) return (v / 10000).toFixed(v % 10000 ? 1 : 0) + 'w'
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
  }

  /** 横轴标签太密就隔 k 个画一个；最后一个永远画（它是最新/最右那一格） */
  function labelStep(count, plotW) {
    const fit = Math.max(1, Math.floor(plotW / MIN_LABEL))
    return Math.max(1, Math.ceil(count / fit))
  }

  /** 画坐标网格 + 纵轴刻度，返回绘图区几何 */
  function drawFrame(ctx, w, h, max, pad) {
    const plotW = w - pad.left - pad.right
    const plotH = h - pad.top - pad.bottom
    const line = css('--line', 'rgba(255,255,255,0.1)')
    const text3 = css('--text-3', '#8A93A6')

    ctx.font = '11px system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH * i) / 4
      ctx.strokeStyle = line
      ctx.lineWidth = 1
      ctx.beginPath()
      // +0.5 让 1px 的线落在像素中心，不然是两条浅灰的糊线
      ctx.moveTo(pad.left, Math.round(y) + 0.5)
      ctx.lineTo(pad.left + plotW, Math.round(y) + 0.5)
      ctx.stroke()

      ctx.fillStyle = text3
      ctx.fillText(fmtTick((max * (4 - i)) / 4), pad.left - 8, y)
    }
    return { plotW: plotW, plotH: plotH }
  }

  /**
   * 折线图。一条或多条（多条的用法见统计页的「两习惯对比」）。
   *
   * 多条时**不画面积**：两块面积互相压着，谁也读不出来 —— 那是单条趋势专用的装饰。
   *
   * @param {HTMLCanvasElement} canvas
   * @param {Object} o {labels, values, color} 单条；{labels, series:[{values, color}]} 多条
   */
  function line(canvas, o) {
    const list = (o.series && o.series.length ? o.series : [{ values: o.values || [], color: o.color }]).filter(
      (s) => s && s.values && s.values.length
    )
    const n = list.length ? list[0].values.length : 0
    const labels = o.labels || (list.length ? list[0].labels : []) || []
    const geo = prepare(canvas)
    const ctx = geo.ctx
    if (!n) return

    const pad = { left: 46, right: 14, top: 16, bottom: 26 }
    const all = []
    list.forEach((s) => s.values.forEach((v) => all.push(Number(v) || 0)))
    const max = niceMax(Math.max.apply(null, all.concat([0])))
    const frame = drawFrame(ctx, geo.w, geo.h, max, pad)
    const { plotW, plotH } = frame

    const xOf = (i) => (n === 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (n - 1))
    const yOf = (v) => pad.top + plotH - (plotH * (Number(v) || 0)) / max
    const step = n > 1 ? plotW / (n - 1) : plotW

    list.forEach((s, si) => {
      const color = s.color || css('--accent', '#5B8CFF')

      if (list.length === 1) {
        // 面积：从线到基线的一层渐变，比一根光秃秃的线更像「趋势」
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH)
        grad.addColorStop(0, hexA(color, 0.34))
        grad.addColorStop(1, hexA(color, 0.02))
        ctx.beginPath()
        ctx.moveTo(xOf(0), pad.top + plotH)
        s.values.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)))
        ctx.lineTo(xOf(n - 1), pad.top + plotH)
        ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()
      }

      ctx.beginPath()
      s.values.forEach((v, i) => (i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v))))
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      // 第二条走虚线：两个习惯挑到相近的颜色是常事，光靠色相分不开
      ctx.setLineDash(si && list.length > 1 ? [5, 4] : [])
      ctx.stroke()
      ctx.setLineDash([])

      // 点只在疏的时候画：30 天视图上每格一个点会连成一条珠子
      if (step > 9) {
        ctx.fillStyle = color
        s.values.forEach((v, i) => {
          ctx.beginPath()
          ctx.arc(xOf(i), yOf(v), 2.5, 0, Math.PI * 2)
          ctx.fill()
        })
      }
    })

    drawXLabels(ctx, labels, xOf, n, plotW, geo.h, pad)
  }

  /**
   * 环形图（占比）。切片上**不标字** —— 数字和百分比统一放在图旁边的图例里
   * （见 index.html 的 #pieLegend）：画在切片上要么糊，要么和习惯色撞在一起看不清。
   *
   * @param {HTMLCanvasElement} canvas
   * @param {Object} o { items: [{ label, value, color }] }
   */
  function pie(canvas, o) {
    const items = (o.items || []).filter((it) => Number(it.value) > 0)
    const geo = prepare(canvas)
    const ctx = geo.ctx
    const total = items.reduce((a, it) => a + (Number(it.value) || 0), 0)
    const cx = geo.w / 2
    const cy = geo.h / 2
    const R = Math.max(12, Math.min(geo.w, geo.h) / 2 - 4)
    const inner = R * 0.58

    if (!total) {
      // 空环：什么都没有时留个圈，比一块空白更像「这儿本来有东西」
      ctx.beginPath()
      ctx.arc(cx, cy, (R + inner) / 2, 0, Math.PI * 2)
      ctx.strokeStyle = css('--surface-3', '#262B37')
      ctx.lineWidth = R - inner
      ctx.stroke()
      return
    }

    let a0 = -Math.PI / 2
    items.forEach((it) => {
      const a1 = a0 + (Math.PI * 2 * (Number(it.value) || 0)) / total
      ctx.beginPath()
      ctx.arc(cx, cy, R, a0, a1)
      ctx.arc(cx, cy, inner, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = it.color
      ctx.fill()
      // 描一道底色缝：两个习惯颜色接近时，不然就糊成一整块
      ctx.strokeStyle = css('--surface', '#171A22')
      ctx.lineWidth = 2
      ctx.stroke()
      a0 = a1
    })
  }

  /**
   * 柱状图。横轴是习惯名之类的**类目**，不是时间轴。
   * @param {Object} o {labels, values, color}
   */
  function bar(canvas, o) {
    const n = o.values.length
    const geo = prepare(canvas)
    const ctx = geo.ctx
    if (!n) return

    const pad = { left: 46, right: 14, top: 16, bottom: 30 }
    const max = niceMax(Math.max.apply(null, o.values.concat([0])))
    const frame = drawFrame(ctx, geo.w, geo.h, max, pad)
    const { plotW, plotH } = frame
    const color = o.color || css('--accent', '#5B8CFF')
    const slot = plotW / n
    const bw = Math.min(slot * 0.62, 46)
    const r = Math.min(6, bw / 2)

    o.values.forEach((v, i) => {
      const hh = max ? (plotH * (Number(v) || 0)) / max : 0
      if (hh <= 0) return
      const x = pad.left + slot * i + (slot - bw) / 2
      const y = pad.top + plotH - hh
      // 顶部圆角、底部方角：柱子是「立」在基线上的，下面圆了会飘
      ctx.beginPath()
      ctx.moveTo(x, y + hh)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.lineTo(x + bw - r, y)
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + r)
      ctx.lineTo(x + bw, y + hh)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
    })

    // 柱状图的标签一格一个、居中在柱子上（和折线的时间轴不一样）
    const k = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 62))))
    const text2 = css('--text-2', '#C7CEDB')
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    ctx.fillStyle = text2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    o.labels.forEach((label, i) => {
      if (i % k !== 0 && i !== n - 1) return
      const x = pad.left + slot * i + slot / 2
      ctx.fillText(clip(ctx, label, slot - 4), x, pad.top + plotH + 8)
    })
  }

  /** 折线图的横轴标签：贴在刻度上、按需抽稀、两头贴边对齐 */
  function drawXLabels(ctx, labels, xOf, n, plotW, h, pad) {
    const k = labelStep(n, plotW)
    const text3 = css('--text-3', '#8A93A6')
    const baseY = pad.top + (h - pad.top - pad.bottom) + 8
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif'
    ctx.fillStyle = text3
    ctx.textBaseline = 'top'
    for (let i = 0; i < n; i++) {
      if (i % k !== 0 && i !== n - 1) continue
      const x = Math.min(Math.max(xOf(i), pad.left), pad.left + plotW)
      ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center'
      ctx.fillText(labels[i], x, baseY)
    }
  }

  /** 太长就在末尾加省略号（画布不认 CSS 的 text-overflow） */
  function clip(ctx, text, maxW) {
    let s = String(text == null ? '' : text)
    if (ctx.measureText(s).width <= maxW) return s
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
    return s + '…'
  }

  /** hex + alpha -> rgba()。图上的颜色只可能是 hex（习惯色 / 主题色都是） */
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
    if (!m) return hex
    const num = parseInt(m[1], 16)
    return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + a + ')'
  }

  return { line: line, bar: bar, pie: pie, css: css, hexA: hexA }
})()
