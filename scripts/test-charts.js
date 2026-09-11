/**
 * 图表配置冒烟测试
 *
 * 在 Node 里用假的 canvas 2d context 真正实例化并渲染一次 uCharts，
 * 覆盖「折线」与「柱状」两种我们实际用到的类型。
 *
 * 之所以要这么测：uCharts 只在少数几处用 `assign({}, 局部默认, opts.extra.xxx)` 兜底，
 * 而 fixColumeData() 是直接读 `opts.extra.column.seriesGap` 的，
 * 少给一个 extra.column 就会抛 TypeError，柱状图整块空白 —— 这种错误
 * 静态检查扫不出来，只能靠真跑一遍。
 *
 * 另一个关键点：uCharts 的首次绘制挂在 Animation 的 setTimeout 上（哪怕 duration=0），
 * 所以这里必须等异步回调跑完，同步 try/catch 是抓不到错的。
 *
 * 运行：node scripts/test-charts.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

process.chdir(path.join(__dirname, '..'))

const chartOpts = require('../components/qiun-charts/opts.js')

let passed = 0
const failures = []

function ok(name, cond, detail) {
  if (cond) passed++
  else failures.push(name + (detail ? ' —— ' + detail : ''))
}

// ---------------------------------------------------------------- 加载 uCharts
/**
 * uCharts 是 ES module，这里把 `export default` 换成 CJS 导出后用 vm 跑。
 * setTimeout 被包了一层，把动画回调里抛出的异常收集起来——
 * 否则它会变成 uncaughtException 直接掀掉测试进程，看不到是哪一项挂的。
 */
function loadUCharts(asyncErrors) {
  const src = fs
    .readFileSync(path.join(__dirname, '../lib/ucharts/u-charts.js'), 'utf8')
    .replace(/export\s+default\s+uCharts;?/, 'module.exports = uCharts;')

  const sandbox = {
    module: { exports: {} },
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    setTimeout: (fn, ms) =>
      setTimeout(() => {
        try {
          fn()
        } catch (e) {
          asyncErrors.push(e)
        }
      }, ms),
    clearTimeout,
    setInterval,
    clearInterval
  }
  sandbox.exports = sandbox.module.exports
  sandbox.global = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  return sandbox.module.exports
}

// ---------------------------------------------------------------- 加载组件本体
const COMPONENT_DIR = path.join(__dirname, '../components/qiun-charts')

/**
 * 直接加载 components/qiun-charts/index.js 并驱动它，而不是在测试里手抄一遍组件的流程。
 *
 * 这一点是上一版测试的致命漏洞：测试自己组装 opts 时喂了 categories / series，
 * 组件里却没喂，于是真机上 `new uCharts()` 内部跑 drawCharts -> fillSeries(undefined)
 * 抛 "Cannot read property 'length' of undefined"，图表全空白，而测试全绿。
 * 只有让测试跑组件真正的代码，这类偏差才守得住。
 */
function loadComponent(uCharts, asyncErrors) {
  const src = fs
    .readFileSync(path.join(COMPONENT_DIR, 'index.js'), 'utf8')
    .replace(/^import\s+uCharts\s+from\s+['"][^'"]+['"];?/m, 'const uCharts = __uCharts')

  // 组件把初始化异常吞进了 console.error，UI 上只表现为「一片空白」。
  // 真机上用户看到的就是这行日志，所以测试必须盯着它。
  const logs = []
  const record = (level) => (...args) => logs.push(level + ': ' + args.map(String).join(' '))
  const recConsole = {
    log: record('log'),
    warn: record('warn'),
    error: record('error'),
    info: record('info')
  }

  let def = null
  const sandbox = {
    __uCharts: uCharts,
    Component: (d) => {
      def = d
    },
    // 组件里的 require('./opts.js') 必须解析到同一个真实文件
    require: (p) => require(path.resolve(COMPONENT_DIR, p)),
    wx: null, // 每个用例单独注入
    console: recConsole,
    setTimeout: (fn, ms) =>
      setTimeout(() => {
        try {
          fn()
        } catch (e) {
          asyncErrors.push(e)
        }
      }, ms),
    clearTimeout,
    setInterval,
    clearInterval,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error
  }
  sandbox.global = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)

  if (!def) throw new Error('未能从 index.js 中取出 Component 定义')
  return { def, sandbox, logs }
}

/**
 * 造一个组件实例：properties 的默认值填进 data，methods 挂到实例上。
 * setData 同步写回 this.data —— 微信也是同步更新 this.data、异步渲染。
 */
function makeInstance(def, props) {
  const data = Object.assign({}, def.data)
  Object.keys(def.properties || {}).forEach((k) => {
    data[k] = def.properties[k].value
  })
  Object.assign(data, props)

  const inst = {
    data,
    setData(patch, cb) {
      Object.assign(this.data, patch)
      if (cb) cb()
    }
  }
  Object.keys(def.methods).forEach((k) => {
    inst[k] = def.methods[k]
  })
  // 属性变化的回调，手动触发以模拟数据在 ready 之后才到达
  inst.fireObserver = () => def.observers['chartData, opts, type'].call(inst)
  return inst
}

/**
 * 假 wx：createSelectorQuery 同步回调一个 canvas 节点。
 * 返回的 node 会被组件写入物理分辨率，用例可以回头检查。
 */
function fakeWx(ctx, size) {
  const s = size || { width: 320, height: 220, left: 0, top: 0 }
  const node = { width: 0, height: 0, getContext: () => ctx }
  return {
    node,
    api: {
      getWindowInfo: () => ({ pixelRatio: SIZE.dpr, windowWidth: 375 }),
      createSelectorQuery: () => ({
        in: () => ({
          select: () => ({
            fields: () => ({
              exec: (cb) => cb([Object.assign({ node }, s)])
            })
          })
        })
      })
    }
  }
}

// ---------------------------------------------------------------- 假 canvas 上下文
const DRAWN = ['fill', 'stroke', 'fillText', 'rect', 'arc', 'moveTo', 'lineTo', 'clearRect']

/** 只统计绘制调用，不做真实绘制；任意未知属性都返回空函数 */
function fakeContext() {
  const calls = {}
  DRAWN.forEach((k) => {
    calls[k] = 0
  })
  const target = {
    canvas: { width: 750, height: 420 },
    measureText: (t) => ({ width: String(t == null ? '' : t).length * 6 })
  }
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key]
      return (...args) => {
        if (calls[key] !== undefined) calls[key]++
        if (key === 'createLinearGradient' || key === 'createCircularGradient') {
          return { addColorStop() {} }
        }
        return undefined
      }
    },
    set(t, key, value) {
      t[key] = value
      return true
    }
  })
  return { ctx, calls }
}

function drawnTotal(calls) {
  return DRAWN.reduce((n, k) => n + (calls[k] || 0), 0)
}

// ------------------------------------------------- 记录坐标的假上下文（布局断言用）
/**
 * 逐字估算文本宽度：CJK ≈ 1em，ASCII ≈ 0.55em，省略号 ≈ 0.5em。
 * 比真实字体略宽，宁可在测试里判「挤」，也不要在真机上压字。
 */
function textWidth(s, font) {
  let w = 0
  for (const ch of String(s)) {
    if (/[一-鿿　-〿＀-￯]/.test(ch)) w += 1
    else if (ch === '…') w += 0.5
    else w += 0.55
  }
  return w * font
}

/**
 * 除了统计调用次数，还记录真实绘制坐标：
 *   texts -> 每次 fillText 的 { t, x, y, font }（x 是文字**左边缘**）
 *   pts   -> 所有落笔点，用来判断图形有没有铺满画布
 */
function recordingContext(w, h) {
  const base = fakeContext()
  const texts = []
  const pts = []
  let font = 10
  const rec = {}
  const target = base.ctx
  target.canvas = { width: w || 750, height: h || 420 }
  target.measureText = (t) => ({ width: textWidth(t == null ? '' : t, font) })
  target.fillText = (t, x, y) => { texts.push({ t: String(t), x, y, font }) }
  target.moveTo = (x, y) => pts.push([x, y])
  target.lineTo = (x, y) => pts.push([x, y])
  target.fillRect = (x, y, w2, h2) => pts.push([x + w2, y + h2])

  const ctx = new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key]
      if (key === 'setFontSize') return (v) => { font = v }
      if (key === 'createLinearGradient' || key === 'createCircularGradient') {
        return () => ({ addColorStop() {} })
      }
      return (...args) => {
        if (base.calls[key] !== undefined) base.calls[key]++
        return undefined
      }
    },
    set(t, key, value) {
      if (key === 'font') {
        const m = /(\d+(?:\.\d+)?)px/.exec(String(value))
        if (m) font = parseFloat(m[1])
      }
      t[key] = value
      return true
    }
  })
  rec.ctx = ctx
  rec.calls = base.calls
  rec.texts = texts
  rec.pts = pts
  return rec
}

/**
 * X 轴标签是否互相压字。
 * fillText 的 x 是文字左边缘（offset = -measureText/2 + eachSpacing/2），
 * 所以 a 的右边缘 = x + 宽度，越过 b 的左边缘就是重叠。
 */
function worstLabelOverlap(texts) {
  if (!texts.length) return null
  const maxY = Math.max.apply(null, texts.map((t) => t.y))
  // 抽稀掉的槽位会画空字符串，占位但不可见，比较时要排除
  const row = texts
    .filter((t) => t.y === maxY && t.t !== '')
    .map((t) => ({ t: t.t, x: t.x, w: textWidth(t.t, t.font) }))
    .sort((a, b) => a.x - b.x)
  let worst = null
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1]
    const b = row[i]
    const overlap = a.x + a.w - b.x
    if (overlap > 0 && (!worst || overlap > worst.overlap)) {
      worst = { a: a.t, b: b.t, overlap: Math.round(overlap) }
    }
  }
  return worst
}

/** 绘图内容的最右边界，用来判断图形有没有铺满整块画布 */
function drawnRightEdge(pts) {
  let mx = 0
  pts.forEach((p) => {
    if (typeof p[0] === 'number' && isFinite(p[0])) mx = Math.max(mx, p[0])
  })
  return mx
}

// ---------------------------------------------------------------- 用例数据
const CATEGORIES = ['1', '2', '3', '4', '5', '6', '7']
const SERIES = [{ name: '打卡次数', color: '#5B8CFF', data: [0, 2, 1, 3, 0, 4, 2] }]
const SIZE = { width: 320, height: 200, dpr: 3 }

/**
 * 复刻组件里的构建流程：默认配置 <- 页面 opts <- 运行时参数。
 * animation 关掉，让渲染在一个 17ms 的 tick 内完成，测试不用干等 600ms。
 *
 * width / height 传**设备 px**（逻辑 × dpr），和组件的 chartSize() 一致。
 * legacyWidth 用来复现修复前的写法，见第 9 节。
 */
function makeOpts(uCharts, type, pageOpts, baseFactory, ctxOpts) {
  const rec = ctxOpts || fakeContext()
  const { ctx, calls } = rec
  const base = baseFactory ? baseFactory() : chartOpts.defaultOpts()
  const lw = ctxOpts && ctxOpts.legacyWidth
  const opts = chartOpts.mergeDeep(chartOpts.mergeDeep(base, pageOpts), {
    type,
    context: ctx,
    canvas2d: true,
    pixelRatio: SIZE.dpr,
    width: lw ? SIZE.width : SIZE.width * SIZE.dpr,
    height: lw ? SIZE.height : SIZE.height * SIZE.dpr,
    rotate: false,
    enableScroll: false,
    animation: false,
    categories: CATEGORIES,
    series: SERIES
  })
  return { chart: new uCharts(opts), calls, rec }
}

/** 等 uCharts 的动画 tick 跑完 */
function settle(ms) {
  return new Promise((r) => setTimeout(r, ms || 60))
}

/** 修复前 index.js 里的 extra：只有 line / area / bar / tooltip */
function legacyOptsFactory() {
  const full = chartOpts.defaultOpts()
  full.extra = {
    line: full.extra.line,
    area: full.extra.area,
    bar: full.extra.bar,
    tooltip: full.extra.tooltip
  }
  return full
}

async function main() {
  const asyncErrors = []
  const uCharts = loadUCharts(asyncErrors)
  ok('uCharts 模块可加载', typeof uCharts === 'function')

  // ------------------------------------------------------------ 1. 回归复现
  // 修复前 extra 里没有 column，fixColumeData 会读 undefined.seriesGap
  let legacyChart = null
  try {
    legacyChart = makeOpts(uCharts, 'column', null, legacyOptsFactory).chart
  } catch (e) {
    asyncErrors.push(e)
  }
  await settle()
  const legacyErr = asyncErrors[0]
  ok(
    '回归复现：缺 extra.column 的柱状图确实抛错',
    !!legacyErr && /seriesGap/.test(String(legacyErr.message)),
    legacyErr ? '实际抛出：' + legacyErr.message : '竟然没报错，说明复现前提不成立'
  )
  ok('回归复现：抛错发生在异步绘制阶段（所以同步 try/catch 抓不到）', !!legacyChart)

  // ------------------------------------------------------------ 2. 折线图
  asyncErrors.length = 0
  const linePageOpts = { xAxis: { labelCount: 5, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } }
  const line = makeOpts(uCharts, 'line', linePageOpts)
  await settle()
  ok('折线图渲染不抛错', asyncErrors.length === 0, asyncErrors[0] && asyncErrors[0].message)
  ok('折线图有实际绘制动作', drawnTotal(line.calls) > 0, '绘制调用数=' + drawnTotal(line.calls))
  ok('折线图清屏一次', line.calls.clearRect >= 1)
  ok(
    '折线图尺寸按设备 px 传入（uCharts 的坐标系 = canvas 后备缓冲）',
    line.chart.opts.width === SIZE.width * SIZE.dpr && line.chart.opts.height === SIZE.height * SIZE.dpr,
    'width=' + line.chart.opts.width
  )

  // ------------------------------------------------------------ 3. 柱状图
  asyncErrors.length = 0
  const barPageOpts = { xAxis: { labelCount: 6, fontSize: 10 }, yAxis: { data: [{ min: 0 }] } }
  const column = makeOpts(uCharts, 'column', barPageOpts)
  await settle()
  ok('柱状图渲染不抛错', asyncErrors.length === 0, asyncErrors[0] && asyncErrors[0].message)
  ok('柱状图有实际绘制动作', drawnTotal(column.calls) > 0, '绘制调用数=' + drawnTotal(column.calls))

  // ------------------------------------------------------------ 4. 单值 / 全 0 等边界
  const cases = [
    { name: '单个分类', categories: ['1'], data: [3] },
    { name: '全部为 0', categories: CATEGORIES, data: [0, 0, 0, 0, 0, 0, 0] },
    { name: '含小数', categories: ['1', '2'], data: [1.5, 2.25] }
  ]
  for (const c of cases) {
    asyncErrors.length = 0
    const { ctx } = fakeContext()
    try {
      new uCharts(
        chartOpts.mergeDeep(chartOpts.defaultOpts(), {
          type: 'column',
          context: ctx,
          canvas2d: true,
          pixelRatio: 2,
          width: 320,
          height: 200,
          animation: false,
          categories: c.categories,
          series: [{ name: 'x', color: '#37D0A0', data: c.data }]
        })
      )
    } catch (e) {
      asyncErrors.push(e)
    }
    await settle()
    ok('柱状图边界：' + c.name, asyncErrors.length === 0, asyncErrors[0] && asyncErrors[0].message)
  }

  // ------------------------------------------------------------ 5. 多实例互不串台
  const a = makeOpts(uCharts, 'line', null)
  const b = makeOpts(uCharts, 'line', null)
  await settle()
  a.chart.opts.yAxis.data[0].min = 999
  ok(
    '两个图表实例的 yAxis.data 相互独立',
    b.chart.opts.yAxis.data[0].min === 0,
    '实例 B 的 min 被污染成 ' + b.chart.opts.yAxis.data[0].min
  )

  // ------------------------------------------------------------ 6. 触摸坐标归一化
  const touch = makeOpts(uCharts, 'line', null)
  await settle()
  asyncErrors.length = 0
  try {
    touch.chart.showToolTip({ changedTouches: [{ x: 100, y: 60, identifier: 0 }] }, { formatter: (it) => it.name })
    touch.chart.touchLegend({ changedTouches: [{ x: 10, y: 10, identifier: 0 }] })
  } catch (e) {
    asyncErrors.push(e)
  }
  ok('showToolTip / touchLegend 接受画布内坐标 {x,y}', asyncErrors.length === 0, asyncErrors[0] && asyncErrors[0].message)

  // ------------------------------------------------------------ 7. 组件本体
  // 这一段跑的是 components/qiun-charts/index.js 的真实代码

  // 7a. 先复现真机上报的错：构造时不带 categories / series
  let rawErr = null
  try {
    const { ctx } = fakeContext()
    const d = chartOpts.defaultOpts()
    new uCharts(
      chartOpts.mergeDeep(d, {
        type: 'line',
        context: ctx,
        canvas2d: true,
        pixelRatio: SIZE.dpr,
        width: SIZE.width,
        height: SIZE.height,
        animation: false
      })
    )
  } catch (e) {
    rawErr = e
  }
  ok(
    '回归复现：构造时不给 series 会抛 length 错误',
    !!rawErr && /length/.test(String(rawErr.message)),
    rawErr ? '实际抛出：' + rawErr.message : '竟然没报错，说明复现前提不成立'
  )
  ok('回归复现：这个错是同步抛的（所以组件的 try/catch 能兜住并打日志）', !!rawErr)

  const compErrors = []
  const { def, sandbox, logs } = loadComponent(uCharts, compErrors)
  /** 组件内的错误日志（它就靠这个把异常吞掉了，真机上只表现为图表空白） */
  const errLogs = () => logs.filter((l) => l.indexOf('error:') === 0)
  const noErrLog = () => {
    const es = errLogs()
    return es.length === 0 ? '' : es[0]
  }

  ok('组件 index.js 可加载并注册 Component', !!def && !!def.methods && !!def.methods.initCanvas)
  ok(
    '组件确实注册了 chartData 的 observers',
    !!def.observers && typeof def.observers['chartData, opts, type'] === 'function'
  )

  // 7b. 没有数据时调 initCanvas：不能建实例，不能抛错，也不能打错误日志。
  // 「不能打错误日志」是关键断言：组件会把 uCharts 的异常 catch 掉再 console.error，
  // 只断言「没抛出来」的话，修复前的代码照样全绿。
  const f1 = fakeWx(fakeContext().ctx)
  sandbox.wx = f1.api
  const instEmpty = makeInstance(def, { chartData: null, type: 'line' })
  let emptyErr = null
  try {
    instEmpty.initCanvas()
  } catch (e) {
    emptyErr = e
  }
  await settle()
  ok('组件：无数据时 initCanvas 不抛错', !emptyErr, emptyErr && emptyErr.message)
  ok('组件：无数据时不创建图表实例', !instEmpty.chart)
  ok('组件：无数据时 hasData 为 false', instEmpty.data.hasData === false)
  ok('组件：无数据时不打错误日志', !noErrLog(), noErrLog())

  // 7c. 有数据时调 initCanvas：必须建出实例并真的画东西
  const c2 = fakeContext()
  const f2 = fakeWx(c2.ctx)
  sandbox.wx = f2.api
  const inst = makeInstance(def, {
    chartData: { categories: CATEGORIES, series: SERIES },
    type: 'line'
  })
  let initErr = null
  try {
    inst.initCanvas()
  } catch (e) {
    initErr = e
  }
  await settle()
  ok('组件：有数据时 initCanvas 建出图表实例', !!inst.chart, initErr && initErr.message)
  ok('组件：实例化后确实发生绘制', drawnTotal(c2.calls) > 0, '绘制调用数=' + drawnTotal(c2.calls))
  ok(
    '组件：canvas 物理分辨率 = 逻辑尺寸 × dpr',
    f2.node.width === 320 * SIZE.dpr && f2.node.height > 0,
    'canvas.width=' + f2.node.width
  )
  ok('组件：有数据时 hasData 为 true', inst.data.hasData === true)
  ok(
    '组件：图表实例拿到的 series 就是传入的数据',
    !!inst.chart &&
      !!inst.chart.opts.series &&
      !!inst.chart.opts.series[0] &&
      inst.chart.opts.series[0].data.length === SERIES[0].data.length
  )
  ok('组件：实例化过程无错误日志', !noErrLog(), noErrLog())

  // 7d. 真实路径：ready 时还没有数据，数据稍后才到（observers 触发）
  const c3 = fakeContext()
  const f3 = fakeWx(c3.ctx)
  sandbox.wx = f3.api
  const instLate = makeInstance(def, { chartData: null, type: 'column' })
  instLate.initCanvas()
  await settle()
  ok('组件：ready 阶段无数据 -> 不建实例', !instLate.chart)

  instLate.setData({ chartData: { categories: CATEGORIES, series: SERIES } })
  let lateErr = null
  try {
    instLate.fireObserver()
  } catch (e) {
    lateErr = e
  }
  await settle()
  ok('组件：数据迟到后 observers 能补建图表', !!instLate.chart, lateErr && lateErr.message)
  ok('组件：补建后柱状图有绘制动作', drawnTotal(c3.calls) > 0, '绘制调用数=' + drawnTotal(c3.calls))
  ok('组件：补建过程无异常', compErrors.length === 0, compErrors[0] && compErrors[0].message)
  ok('组件：补建过程无错误日志', !noErrLog(), noErrLog())

  // 7e. 已有实例后数据再变，应走 updateData 而不是重建
  const before = inst.chart
  inst.setData({ chartData: { categories: CATEGORIES, series: [{ name: 'x', color: '#FFB020', data: [1, 1, 1, 1, 1, 1, 1] }] } })
  inst.fireObserver()
  await settle()
  ok('组件：已有实例时数据变更复用同一实例', inst.chart === before)
  ok('组件：updateData 后无异常', compErrors.length === 0, compErrors[0] && compErrors[0].message)
  ok('组件：updateData 后无错误日志', !noErrLog(), noErrLog())

  // ------------------------------------------------------------ 8. 色值格式
  // uCharts 的 hexToRgb 只认 3 位和 6 位十六进制：
  //   var rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  // 传八位色值（如 '#00000000'）时 rgb 为 null，紧接着 rgb[1] 直接抛
  // "Cannot read properties of null (reading '1')"。
  // 最阴的是 activeBgColor 只在**点击图表**时才会被解析，
  // 所以表现成「图表能看，一碰就崩」。
  // 这里把所有字符串色值都扫一遍，钉死格式。
  const HEX_COLOR = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/
  const badColors = []
  ;(function scan(node, trail) {
    if (!node || typeof node !== 'object') return
    Object.keys(node).forEach((k) => {
      const v = node[k]
      const p = trail ? trail + '.' + k : k
      if (typeof v === 'string' && /^#/.test(v)) {
        if (!HEX_COLOR.test(v)) badColors.push(p + ' = ' + v)
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => {
          if (typeof item === 'string' && /^#/.test(item) && !HEX_COLOR.test(item)) {
            badColors.push(p + '[' + i + '] = ' + item)
          }
        })
      } else if (v && typeof v === 'object') {
        scan(v, p)
      }
    })
  })(chartOpts.defaultOpts(), '')

  ok(
    '默认配置里没有 uCharts 解析不了的色值（只允许 3 / 6 位十六进制）',
    badColors.length === 0,
    badColors.join('；')
  )
  ok(
    'extra.column / extra.bar 的高亮底色是可解析的六位色值',
    HEX_COLOR.test(chartOpts.defaultOpts().extra.column.activeBgColor) &&
      HEX_COLOR.test(chartOpts.defaultOpts().extra.bar.activeBgColor)
  )

  // ------------------------------------------------------------ 9. 坐标量纲
  // uCharts 的坐标系是 **canvas 后备缓冲的像素**（逻辑 px × dpr），不是 CSS 逻辑 px。
  // 依据在它自己的取点函数里：getTouches() -> `x = touches.x * opts.pix`，
  // 而 area / 字号在内部也都是 `padding[j] * opts.pix`、`fontSize * opts.pix`。
  // 也就是说 width / height 必须和它们同量纲（设备 px），这套算式才自洽。
  //
  // 传逻辑宽会怎样（修复前的真实状态）：图形只铺满画布左上角 1/dpr
  // （dpr=3 即 28% 宽），而字号仍是设备 px，相对绘图区大 dpr 倍 ——
  // 表现为「图表缩在左上角 + X 轴标签全糊在一起」，触摸也会整体错位。
  const good = makeOpts(uCharts, 'column', barPageOpts, null, recordingContext(SIZE.width * SIZE.dpr, SIZE.height * SIZE.dpr))
  const badRec = recordingContext(SIZE.width * SIZE.dpr, SIZE.height * SIZE.dpr)
  badRec.legacyWidth = true
  const bad = makeOpts(uCharts, 'column', barPageOpts, null, badRec)
  await settle()

  const fullW = SIZE.width * SIZE.dpr
  const goodFill = drawnRightEdge(good.rec.pts) / fullW
  const badFill = drawnRightEdge(bad.rec.pts) / fullW
  ok(
    '图形铺满画布（width 传设备 px）',
    goodFill > 0.85,
    '实际铺满 ' + (goodFill * 100).toFixed(0) + '%'
  )
  ok(
    '对照：width 传逻辑 px 时只铺满约 1/dpr，探针确实抓得住这个 bug',
    badFill > 0 && badFill < 0.5,
    '实际铺满 ' + (badFill * 100).toFixed(0) + '%'
  )
  ok(
    '组件交给 uCharts 的 width 是设备 px',
    !!inst.chart && inst.chart.opts.width === 320 * SIZE.dpr,
    'width=' + (inst.chart && inst.chart.opts.width)
  )

  // ------------------------------------------------------------ 10. X 轴标签不压字
  // uCharts 抽稀时**最后一个标签永远强制保留**：
  //   newCategories[cgLength - 1] = categories[cgLength - 1]
  // 于是倒数第二个被保留的标签和它之间只隔 1 个 eachSpacing，
  // 习惯一多就会互相压住。xCategoryFormatter 负责把过长的名字截短到一格以内。
  const habitNames = ['背单词', '跑步', '喝水', '阅读', '冥想', '早睡早起打卡', '俯卧撑', '写日记']
  const nameList = (n) => Array.from({ length: n }, (_, i) => habitNames[i % habitNames.length] + (i >= habitNames.length ? '计划' : ''))
  const chartSeries = (n) => [{ name: '打卡次数', color: '#37D0A0', data: Array.from({ length: n }, (_, i) => (i % 5) + 1) }]

  for (const dpr of [1, 3]) {
    for (let n = 1; n <= 12; n++) {
      const rec = recordingContext(SIZE.width * dpr, SIZE.height * dpr)
      const cats = nameList(n)
      const opts = chartOpts.mergeDeep(chartOpts.mergeDeep(chartOpts.defaultOpts(), barPageOpts), {
        type: 'column', context: rec.ctx, canvas2d: true, pixelRatio: dpr,
        width: SIZE.width * dpr, height: SIZE.height * dpr, rotate: false, enableScroll: false,
        animation: false, categories: cats, series: chartSeries(n)
      })
      // eslint-disable-next-line no-new
      new uCharts(opts)
      await settle()
      const worst = worstLabelOverlap(rec.texts)
      ok(
        '柱状图 ' + n + ' 个习惯 dpr' + dpr + ' 时 X 轴标签不重叠',
        !worst,
        worst ? '"' + worst.a + '" 压住 "' + worst.b + '" ' + worst.overlap + 'px' : ''
      )
    }
  }

  // 折线图：周 / 月 / 年三种粒度都不能压字。
  // 这里守的是 xAxis.itemCount —— 它是**滚动模式**下的单屏数量，
  // 一旦配上（即便 enableScroll 是 false），uCharts 的抽稀算式就变成
  //   maxXAxisListLength = ceil(categories.length / itemCount * labelCount) - 1
  // 月视图 30 天会被算出 16 个标签，直接糊成一片。
  const monthCats = Array.from({ length: 30 }, (_, i) => '9/' + (i + 1))
  const yearCats = Array.from({ length: 12 }, (_, i) => (i + 1) + '月')
  const weekCats = Array.from({ length: 7 }, (_, i) => '9/' + (i + 5))
  const lineCases = [['周', weekCats], ['月', monthCats], ['年', yearCats]]
  for (const [tag, cats] of lineCases) {
    const rec = recordingContext(SIZE.width * SIZE.dpr, SIZE.height * SIZE.dpr)
    const opts = chartOpts.mergeDeep(chartOpts.mergeDeep(chartOpts.defaultOpts(), linePageOpts), {
      type: 'line', context: rec.ctx, canvas2d: true, pixelRatio: SIZE.dpr,
      width: SIZE.width * SIZE.dpr, height: SIZE.height * SIZE.dpr, rotate: false, enableScroll: false,
      animation: false, categories: cats, series: chartSeries(cats.length)
    })
    // eslint-disable-next-line no-new
    new uCharts(opts)
    await settle()
    const worst = worstLabelOverlap(rec.texts)
    ok(
      '折线图 ' + tag + '视图 X 轴标签不重叠（' + cats.length + ' 个点抽稀后）',
      !worst,
      worst ? '"' + worst.a + '" 压住 "' + worst.b + '" ' + worst.overlap + 'px' : ''
    )
  }
  ok(
    '默认配置没有 xAxis.itemCount（滚动模式专用，会污染抽稀算式）',
    chartOpts.defaultOpts().xAxis.itemCount === undefined,
    '实际值=' + chartOpts.defaultOpts().xAxis.itemCount
  )

  // 折线图的类别是日期 / 月份，固定宽度，不能被截断
  const dateCats = ['9/1', '9/9', '9/17', '9/25', '9/30']
  ok(
    'formatter 不截断折线图的日期标签',
    chartOpts.xCategoryFormatter('9/25', 3, { type: 'line', categories: dateCats, width: 960, pix: 3, area: [0, 0, 0, 0], xAxis: { fontSize: 10 } }) === '9/25'
  )
  ok(
    'formatter 对短名字原样返回',
    chartOpts.xCategoryFormatter('跑步', 0, { type: 'column', categories: nameList(4), width: 960, pix: 3, area: [0, 0, 0, 0], xAxis: { fontSize: 10 } }) === '跑步'
  )
  ok(
    'formatter 对超长名字截断并补省略号',
    /…$/.test(chartOpts.xCategoryFormatter('早睡早起打卡', 0, { type: 'column', categories: nameList(8), width: 960, pix: 3, area: [0, 0, 0, 0], xAxis: { fontSize: 10 } }))
  )
  // 类目越多，一格越窄，能放的字越少
  const maxCharsAt = (n) => {
    const s = chartOpts.xCategoryFormatter('一二三四五六七八九十', 0, {
      type: 'column', categories: nameList(n), width: 960, pix: 3, area: [0, 0, 0, 0], xAxis: { fontSize: 10 }
    })
    return s.length
  }
  ok(
    'formatter 的截断长度随类目数增加而收紧',
    maxCharsAt(12) < maxCharsAt(4),
    '4 个习惯放 ' + maxCharsAt(4) + ' 字，12 个只放 ' + maxCharsAt(12) + ' 字'
  )

  // ------------------------------------------------------------ 汇总
  console.log('')
  if (failures.length) {
    console.log('✗ 图表测试失败 ' + failures.length + ' 项：')
    failures.forEach((f) => console.log('   - ' + f))
    process.exit(1)
  }
  console.log('✓ 图表测试全部通过（' + passed + ' 项）')
}

main()
