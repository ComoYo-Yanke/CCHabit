/*
 * 量弹层布局：确认按钮到底在不在可视区里。
 *
 * 为什么需要它：这个按钮一共「消失」过三次，每次都跟弹层高度有关，而每次
 * 都能在 Chromium 里量出来问题（第一版量出弹层只差 4px 就顶满了 max-height）。
 *
 * 第四版把确认按钮挪进了头部（`.sheet-acts` 绝对定位悬浮在「×」左边），于是它
 * 不再和主体抢空间 —— 头部是 flex-shrink:0，主体再怎么长也顶不掉它。要守的东西
 * 跟着从「余量够不够」变成了「位置对不对」：
 *
 *   ① 按钮完整落在视口里、落在 .sheet 盒子里（没被顶出去、没被 overflow:hidden 裁掉）
 *   ② 按钮在「×」左边且不压住它（right ≤ close.left）
 *   ③ 按钮没压住标题（`.sheet-head--acts > .sheet-title` 的 margin-right 避让生效）
 *   ④ 头部整块可见，两个按钮都落在头部里（top:0;bottom:0 的垂直居中没跑偏）
 *   ⑤ 主体真的收缩了 —— 内容比盒子高（scrollHeight > clientHeight），
 *      而且没塌成 0 高（那会退化成「只剩标题、内容全没了」）
 *   ⑥ 弹层占屏比 ≤ 70% —— 底部弹出层不该吃掉整屏，背景要留得出来
 *
 * ①②③④ 是这一版的新守卫。绝对定位的代价是「位置可能跑到别处去」，而不是
 * 「可能不显示」——所以才要量坐标，光看 DOM 里有没有这个节点是没用的。
 * ⑤ 留着，它守的是主体本身还健康（内容可滚动、不是被撑爆或被压扁）。
 * ⑥ 是「创建习惯的弹层划不动」那条反馈加的：主因是弹层几乎正好装得下，
 *   滚动行程短到看不出来。把上限收到 68vh 后每台机型的正常内容都会溢出，
 *   这条同时钉住「别再调回接近满屏的高度」。
 *
 * 每种机型都跑两遍：正常内容 + 5 倍压力内容。压力那一遍顶到 max-height，
 * 是「头部会不会被主体挤走」的真正守卫。
 *
 * ⚠️ 这个脚本量不出「真机上滑不滑得动」。
 * 主体已经从 view + overflow-y:auto 换成了 scroll-view（原因见 lint-structure 第 7 条：
 * 普通 view 的 overflow 滚动挂在 touchmove 上，会被遮罩的 catchtouchmove 吃掉）。
 * 而 scroll-view 是原生组件，浏览器里既没有原生滚动、也没有 touchmove 被吃这回事，
 * 那个 bug 在本脚本里**结构性地复现不出来**。这里能守的只是「盒子的尺寸关系没错」：
 * 主体有没有被内容撑爆、有没有塌成 0 —— 尺寸对了才轮得到讨论滚动。
 *
 * 为了让 scroll-view 量得出来，fixture 里给它补了 baseline 样式
 * （浏览器不认识这个标签，默认 display:inline，量出来全是 0）。
 *
 * 注意 rpx 不是浏览器认识的单位，Chromium 直接丢掉整条声明，所以先把 rpx 换算成 px。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

process.chdir(path.join(__dirname, '..'))

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => fs.existsSync(p))

if (!EDGE) {
  console.error('找不到 Edge，跳过弹层量测')
  process.exit(1)
}

/*
 * 只按**高度**区分机型。
 *
 * 宽度是量不出来差异的：无头 Edge 在本机有个约 496px 的最小窗口宽度，
 * 传 --window-size=320 进去，window.innerWidth 还是 496 —— 五台设备其实全都
 * 渲染成同一个宽度。既然宽度根本没法变，就别假装在测它。
 *
 * 好在宽度真的不影响结论：弹层内部尺寸全是 rpx，1rpx = W/750，
 * 整套布局在设计上是**等比缩放**的 —— 496px 宽的渲染就是任何一台真机的等比例版本，
 * 「按钮在 × 左边」「按钮不压标题」这类相对关系与宽度无关。
 * 唯一不看 rpx 的是 .sheet 的 max-height（68vh），它只看高度，所以高度必须真的换。
 *
 * 换算用的宽度由 calibrateChrome() 现场量出来（见下），不写死。
 */
const DEVICES = [
  { name: 'iPhone SE    ', h: 568 },
  { name: 'iPhone 8     ', h: 667 },
  { name: 'iPhone 12    ', h: 844 },
  { name: 'iPhone 15 Pro', h: 852 },
  { name: 'Android 大屏 ', h: 926 }
]

/** 底部安全区（iPhone X 之后是 34px，这里取最坏情况） */
const SAFE_INSET = 34

/** rpx -> px；同时把 CSS 注释去掉，免得注释里的 rpx 干扰 */
function rpx2px(css, width) {
  const k = width / 750
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(-?\d+(?:\.\d+)?)rpx/g, (m, n) => parseFloat(n) * k + 'px')
}

const appWxss = fs.readFileSync('app.wxss', 'utf8')
const editorWxss = fs.readFileSync('components/habit-editor/index.wxss', 'utf8')

/** 从 app.wxss 里确认主体确实挂了 flex 收缩，量出来的结论才有意义 */
function assertFlexRule() {
  const raw = appWxss.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = /(?:^|[}\s])\.sheet-body\s*\{([^}]*)\}/m.exec(raw)
  if (!m) throw new Error('app.wxss 里找不到 .sheet-body 规则')
  if (!/(?:^|[;{\s])flex\s*:\s*1/.test(m[1])) throw new Error('.sheet-body 没有 flex: 1')
  if (!/(?:^|[;{\s])min-height\s*:\s*0/.test(m[1])) throw new Error('.sheet-body 没有 min-height: 0')
}

/**
 * 头部必须是定位基准。
 *
 * `.sheet-acts` 是 position: absolute：`.sheet-head` 一旦没写 position: relative，
 * 它就改挂到最近的定位祖先上（这里会一路找到 .mask 的 fixed），
 * 于是按钮跑到**整个遮罩**的右上角，而不是弹层头部的右上角 —— 单独看弹层还「有按钮」，
 * 位置却错了。这条没法靠量出来的数值反推（量出来的就是错的），所以静态守住。
 */
function assertHeadRule() {
  const raw = appWxss.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = /(?:^|[}\s])\.sheet-head\s*\{([^}]*)\}/m.exec(raw)
  if (!m) throw new Error('app.wxss 里找不到 .sheet-head 规则')
  if (!/(?:^|[;{\s])position\s*:\s*relative/.test(m[1])) {
    throw new Error('.sheet-head 没有 position: relative —— .sheet-acts 会脱离弹层定位')
  }
  const a = /(?:^|[}\s])\.sheet-acts\s*\{([^}]*)\}/m.exec(raw)
  if (!a) throw new Error('app.wxss 里找不到 .sheet-acts 规则')
  if (!/(?:^|[;{\s])position\s*:\s*absolute/.test(a[1])) throw new Error('.sheet-acts 不是绝对定位')
  if (!/(?:^|[;{\s])right\s*:/.test(a[1])) throw new Error('.sheet-acts 没有 right 偏移，会飘到左边去')
}

/**
 * 构造与 habit-editor 一致的 DOM：
 * .mask(fixed, 满屏, flex column, justify-content:flex-end)
 *   .sheet(max-height 68vh, flex column, overflow hidden)
 *     .sheet-head(position:relative, flex-shrink:0)
 *       .sheet-title / .sheet-acts(position:absolute, 悬浮) / .sheet-close
 *     scroll-view.sheet-body(flex:1, min-height:0, max-height:60vh) / .sheet-safe
 *
 * @param {number} stress 内容倍数：1 = 正常表单，5 = 压力测试
 */
function buildHtml(device, stress, w) {
  const h = device.h
  const css = rpx2px(appWxss + '\n' + editorWxss, w)

  const field = (label, inner) => `<view class="field">
      <view class="field-label">${label}<text class="field-hint">选填</text></view>
      ${inner}
    </view>`

  const fields = [
    field('名称', '<input class="field-input" placeholder="例如：背单词">'),
    field('图标', `<view class="icon-grid">${'<view class="icon-cell">📖</view>'.repeat(12)}</view>`),
    field('主题色', `<view class="color-row">${'<view class="color-cell"></view>'.repeat(8)}</view>`),
    field('数值单位', `<view class="chip-row">${'<view class="chip">次</view>'.repeat(9)}</view>`),
    field('快捷步长', '<input class="field-input" placeholder="如 10">'),
    `<view class="switch-row"><view class="flex-1"><view class="switch-title">启用该习惯</view>
       <view class="switch-desc">关闭后不在首页展示，也不计入统计</view></view>
       <switch checked="true"></switch></view>`
  ]
  const body = []
  for (let i = 0; i < stress; i++) body.push(...fields)

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  ${css}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${w}px; height: ${h}px; background: #12151C; }
  /* 真机上 env(safe-area-inset-bottom) 最多约 34px，这里一律按最坏情况算 */
  :root { --safe: ${SAFE_INSET}px; }
  .sheet-safe { height: var(--safe) !important; }
  .rule { display: none; }
  /*
   * scroll-view 的 baseline。
   * 浏览器不认识这个标签（它是微信的原生组件），未知元素默认 display:inline ——
   * 那样它就当不成 flex 项目，量出来高 0，整份 fixture 全废。
   * 这里只补「让它像个块级盒子」所需的部分：原生滚动行为浏览器给不了，
   * 也不需要 —— 本脚本量的只是尺寸关系（见文件头说明）。
   */
  scroll-view { display: block; overflow: hidden; }
</style></head><body>
<view class="mask mask--mounted mask--on">
  <view class="sheet">
    <view class="sheet-head sheet-head--acts">
      <!-- 用 12 个字的标题（习惯名上限）。
           说明：这条 fixture 量的是 habit-editor 的标题，而它只有 4 个字（「新建习惯」），
           离按钮还差 75px 以上，所以「按钮不压标题」在这里其实是**宽松**的。
           真正会被压的是 checkin-sheet 头部的 .ci-habit —— 它是 flex: 1，会被拉伸到填满整行，
           盒子的右边缘直接顶到按钮底下（习惯名最长 12 字）。
           把标题放到 12 字是在这条 fixture 里能做到的最接近的近似；要精确覆盖
           .ci-habit 得再引入 checkin-sheet 的 wxss 和一套头部标记，暂不展开。
           两边用的是同一条规则（.sheet-head--acts > ... 的 margin-right 避让），
           所以这条断言至少能守住「避让被整条删掉」。 -->
      <text class="sheet-title ellipsis">每天早起背单词不间断打卡</text>
      <view class="sheet-acts">
        <view class="sheet-ok sheet-ok--danger">删除</view>
        <view class="sheet-ok">创建</view>
      </view>
      <view class="sheet-close press"><view class="ic ic-close-idle"></view></view>
    </view>
    <scroll-view class="sheet-body" scroll-y>
      ${body.join('\n')}
      <view class="sheet-gap"></view>
    </scroll-view>
    <view class="sheet-safe"></view>
  </view>
</view>
<pre id="out" style="position:fixed;left:0;top:0;color:#0f0;font:10px monospace;z-index:99999"></pre>
<script>
function R(el) { var r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; }
var sheet = document.querySelector('.sheet');
var body = document.querySelector('.sheet-body');
var head = document.querySelector('.sheet-head');
var title = document.querySelector('.sheet-title');
var acts = document.querySelector('.sheet-acts');
var close = document.querySelector('.sheet-close');
var btn = document.querySelector('.sheet-ok:not(.sheet-ok--danger)');
var del = document.querySelector('.sheet-ok--danger');

var sr = R(sheet), br = R(body), hr = R(head), tr = R(title), cr = R(close), nr = R(btn), dr = R(del);
var vw = window.innerWidth, vh = window.innerHeight;

var out = {
  viewportW: vw,
  viewportH: vh,
  sheetTop: Math.round(sr.top),
  sheetBottom: Math.round(sr.bottom),
  sheetH: Math.round(sr.h),
  sheetMaxH: parseFloat(getComputedStyle(sheet).maxHeight),
  bodyH: Math.round(br.h),
  bodyScrollH: body.scrollHeight,
  headTop: Math.round(hr.top),
  headH: Math.round(hr.h),
  btnText: btn.textContent.trim(),
  btnRect: [Math.round(nr.left), Math.round(nr.top), Math.round(nr.right), Math.round(nr.bottom)],
  // ① 按钮完整落在视口里（没被顶出去）
  btnFullyVisible: nr.top >= -0.5 && nr.bottom <= vh + 0.5 && nr.left >= -0.5 && nr.right <= vw + 0.5,
  // ② 按钮完整落在 .sheet 盒子里（没被 overflow:hidden 裁掉）
  btnInsideSheet: nr.bottom <= sr.bottom + 0.5 && nr.top >= sr.top - 0.5 && nr.right <= sr.right + 0.5,
  // ③ 按钮在「×」左边，不压住关闭按钮
  btnClearOfClose: nr.right <= cr.left + 0.5,
  // ④ 按钮没压住标题（.sheet-head--acts 的 margin-right 避让生效）
  btnClearOfTitle: nr.left >= tr.right - 0.5,
  // ⑤ 头部整块可见（头部是 flex-shrink:0，压力内容下也必须完整）
  headFullyVisible: hr.top >= sr.top - 0.5 && hr.bottom <= vh + 0.5,
  // ⑥ 两个按钮都在头部里，且垂直居中对齐（top/bottom: 0 的效果）
  actsInsideHead: R(acts).top >= hr.top - 0.5 && R(acts).bottom <= hr.bottom + 0.5,
  // ⑦ 主体真的收缩了：内容比盒子高
  bodyShrank: body.scrollHeight > br.h + 1,
  // ⑧ 主体没塌成 0 高
  bodySane: br.h > 40,
  // ⑨ 弹层占屏比：底部弹出层不该吃掉整屏，背景得留得出来
  sheetCoverage: sr.h / vh
};
document.getElementById('out').textContent = 'RESULT' + JSON.stringify(out);
</script></body></html>`
}

/** 跑一次无头浏览器，返回页面写进 #out 的 RESULT */
function run(html, file, windowW, windowH) {
  fs.writeFileSync(file, html, 'utf8')
  const dom = execFileSync(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=1500',
      '--window-size=' + windowW + ',' + windowH,
      '--dump-dom',
      'file:///' + file.replace(/\\/g, '/')
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
  const m = /RESULT(\{[\s\S]*?\})<\/pre>/.exec(dom)
  if (!m) throw new Error('没拿到测量结果，DOM 里找不到 RESULT 标记')
  return JSON.parse(m[1])
}

/*
 * --window-size 给的是**窗口**尺寸，不是视口，两者差着窗口边框（本机高 93px）。
 * 不校准的话，所有 vh 都会按一个更矮的视口算 —— 量出来的弹层比真机矮，
 * 等于在一个比真机更宽松的场景下做断言，会漏掉真机上的问题。
 *
 * 宽度同理但要反过来用：窗口窄于平台最小值时会被顶回去（本机是 496px），
 * 所以量出来的 innerWidth 就是「这台机器能渲染出的最窄视口」。rpx 换算一律按它来，
 * 而不是按 DEVICES 里那个拿不到的宽度 —— 按后者换算出来的 px 和实际渲染的视口对不上，
 * 量出来的坐标就是错的（这个 bug 真发生过：320px 的机型量出 x=455 的按钮）。
 */
function calibrateChrome() {
  const probeH = 800
  const probeW = 400
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<pre id="out">RESULT{"h":0}</pre>
<script>document.getElementById('out').textContent='RESULT'+JSON.stringify({w:window.innerWidth,h:window.innerHeight})</script>
</body></html>`
  const r = run(html, path.join(os.tmpdir(), 'th-cal.html'), probeW, probeH)
  return { chromeH: probeH - r.h, width: r.w }
}

function measure(device, stress, chrome) {
  return run(
    buildHtml(device, stress, chrome.width),
    path.join(os.tmpdir(), 'th-sheet-h' + device.h + '-x' + stress + '.html'),
    chrome.width,
    device.h + chrome.chromeH
  )
}

assertFlexRule()
assertHeadRule()

const CHROME = calibrateChrome()

/** 内容少到弹层根本顶不到上限，就测不出「头部会不会被挤走」，压力倍数要够大 */
const STRESS = 5

/** 一遍测量里所有必须成立的断言，返回不成立的说明数组 */
function failures(r, tag) {
  const bad = []
  if (!r.btnFullyVisible) bad.push('确认按钮超出视口')
  if (!r.btnInsideSheet) bad.push('确认按钮超出弹层盒子，被 overflow:hidden 裁掉了')
  if (!r.btnClearOfClose) bad.push('确认按钮压住了「×」（右侧没留出 96rpx）')
  if (!r.btnClearOfTitle) bad.push('确认按钮压住了标题（.sheet-head--acts 的避让没生效）')
  if (!r.headFullyVisible) bad.push('头部被顶出可视区')
  if (!r.actsInsideHead) bad.push('悬浮按钮跑出头部（垂直居中基准错了，或头部没 position: relative）')
  if (!r.bodySane) bad.push('主体高度接近 0，退化成「只剩标题」')
  // ⑨ 弹层不能吃掉整屏。上限是 .sheet 的 max-height: 68vh，留 2% 给取整误差。
  // 超了说明上限被调大（或丢了），底部弹出层会变成全屏页，背景完全看不见。
  if (r.sheetCoverage > 0.7) {
    bad.push('弹层占了 ' + Math.round(r.sheetCoverage * 100) + '% 的屏幕，底部弹出层不该吃掉整屏')
  }
  if (r.btnText !== '创建') bad.push('确认按钮文案不对：' + r.btnText)
  return bad.map((s) => tag + '：' + s)
}

let bad = 0
console.log('每台设备跑两遍，两遍都要求确认按钮位置正确、头部完整可见：')
console.log('  · 正常内容：内容放得下，弹层自己长到合适高度')
console.log('  · 压力内容：内容放不下，弹层顶到 max-height —— 这时头部必须原封不动')
console.log('  （宽度按平台能渲染出的最窄视口 ' + String(CHROME.width) + 'px 换算 rpx，机型只换高度）\n')

DEVICES.forEach((d) => {
  const normal = measure(d, 1, CHROME)
  const stress = measure(d, STRESS, CHROME)

  // 压力那一遍必须真的顶到上限，否则这轮什么也没测到
  const stressAtMax = stress.sheetH >= stress.sheetMaxH - 1
  // 主体必须比内容矮 —— 说明内容真的溢出了、在滚，而不是把弹层撑爆
  const bodyYielded = stress.bodyScrollH > stress.bodyH + 1

  const fails = [].concat(failures(normal, '正常'), failures(stress, '压力'))
  const okAll = !fails.length && stressAtMax && bodyYielded
  if (!okAll) bad++

  console.log(
    d.name + '  高 ' + String(d.h) +
    '  视口 ' + String(normal.viewportW) + '×' + String(normal.viewportH) + '  ' + (okAll ? '✓' : '✗')
  )
  console.log(
    '              正常  弹层 ' + String(normal.sheetH) + '（上限 ' + String(normal.sheetMaxH) + '）' +
    '  头部 ' + String(normal.headH) +
    '  主体 ' + String(normal.bodyH) + '（内容 ' + String(normal.bodyScrollH) + '）' +
    '  按钮 ' + JSON.stringify(normal.btnRect)
  )
  console.log(
    '              压力×' + String(STRESS) + '  弹层 ' + String(stress.sheetH) +
    '（上限 ' + String(stress.sheetMaxH) + '）' +
    '  头部 ' + String(stress.headH) +
    '  主体 ' + String(stress.bodyH) + '（内容 ' + String(stress.bodyScrollH) + '）' +
    '  按钮 ' + JSON.stringify(stress.btnRect)
  )

  if (!stressAtMax) console.log('              ! 压力内容没能顶到 max-height，这轮没测到东西（把 STRESS 调大）')
  if (!bodyYielded) {
    console.log('              ! 主体没有收缩：内容 ' + String(stress.bodyScrollH) +
      ' 全塞进了 ' + String(stress.bodyH) + ' 的盒子里 —— 高度由内容决定，弹层迟早被撑爆')
  }
  fails.forEach((s) => console.log('              ! ' + s))
})

console.log(bad
  ? '\n发现 ' + bad + ' 个问题'
  : '\n✓ 所有设备上确认按钮都完整可见、不压「×」也不压标题；内容顶满时头部原封不动')
process.exit(bad ? 1 : 0)
