/* 静态检查：WXML 里的组件引用 / 事件处理函数 / 图片资源是否都能解析 */
const fs = require('fs')
const path = require('path')

// 统一切到项目根目录，脚本可从任意位置调用
process.chdir(path.join(__dirname, '..'))

let problems = 0
const report = (msg) => { problems++; console.log('  ! ' + msg) }

function walk(dir, out) {
  out = out || []
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) {
      if (f === 'node_modules' || f === '.git' || f === '.claude' || f === 'lib') return
      walk(p, out)
    } else out.push(p)
  })
  return out
}

const files = walk('.').map((p) => p.replace(/\\/g, '/'))
const wxmls = files.filter((f) => f.endsWith('.wxml'))
const JSBUILTIN = ['if', 'elif', 'else', 'for', 'for-item', 'for-index', 'key', 'when']

console.log('== 1. WXML 组件引用 vs 页面 json usingComponents ==')
wxmls.forEach((wxml) => {
  const jsonPath = wxml.replace(/\.wxml$/, '.json')
  const src = fs.readFileSync(wxml, 'utf8')
  let using = {}
  if (fs.existsSync(jsonPath)) using = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).usingComponents || {}
  const tags = new Set()
  const re = /<([a-z][a-z0-9-]*)[\s/>]/g
  let m
  while ((m = re.exec(src))) tags.add(m[1])
  // 小程序内置组件白名单
  const BUILTIN = ['view', 'text', 'block', 'image', 'scroll-view', 'swiper', 'swiper-item', 'button', 'input',
    'textarea', 'picker', 'picker-view', 'switch', 'slider', 'checkbox', 'radio', 'label', 'form', 'navigator',
    'canvas', 'video', 'audio', 'map', 'cover-view', 'cover-image', 'icon', 'progress', 'rich-text', 'movable-area',
    'movable-view', 'open-data', 'web-view', 'ad', 'camera', 'live-player', 'live-pusher', 'functional-page-navigator',
    'official-account', 'page-meta', 'navigation-bar', 'keyboard-accessory', 'match-media', 'page-container',
    'share-element', 'slider', 'editor', 'root-portal', 'grid-view', 'list-view', 'sticky-section', 'sticky-header',
    'snapshot', 'channel-live', 'channel-video', 'voip-room', 'inline-payment-panel', 'slot', 'template', 'import', 'include', 'wxs']
  tags.forEach((t) => {
    if (BUILTIN.indexOf(t) >= 0) return
    if (!using[t]) report(wxml + ': 使用了 <' + t + '> 但 json 未声明 usingComponents')
  })
})

console.log('== 2. 组件路径是否存在 ==')
files.filter((f) => f.endsWith('.json')).forEach((jsonPath) => {
  let j
  try { j = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) } catch (e) { return }
  const using = j.usingComponents || {}
  Object.keys(using).forEach((name) => {
    const target = path.join(path.dirname(jsonPath), using[name]).replace(/\\/g, '/')
    if (!fs.existsSync(target + '.js')) report(jsonPath + ': 组件 ' + name + ' -> ' + using[name] + ' 不存在')
  })
})

console.log('== 3. WXML 事件绑定的处理函数是否存在于同名 js ==')
wxmls.forEach((wxml) => {
  const jsPath = wxml.replace(/\.wxml$/, '.js')
  if (!fs.existsSync(jsPath)) return
  const js = fs.readFileSync(jsPath, 'utf8')
  const src = fs.readFileSync(wxml, 'utf8')
  const re = /\b(?:bind|catch|capture-bind|capture-catch):?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g
  let m
  const seen = new Set()
  while ((m = re.exec(src))) {
    const handler = m[2].trim()
    if (!handler || seen.has(handler)) continue
    seen.add(handler)
    // 处理函数可能写成 `foo(` / `foo:` / `foo =` / 简写 foo,
    const defined = new RegExp('(^|[\\s,{])' + handler + '\\s*[(:]', 'm').test(js)
    if (!defined) report(wxml + ': 绑定了 ' + handler + '，但 ' + path.basename(jsPath) + ' 中未定义')
  }
})

console.log('== 4. WXML 引用的本地图片资源是否存在 ==')
files.filter((f) => f.endsWith('.wxml') || f.endsWith('.wxss')).forEach((f) => {
  const src = fs.readFileSync(f, 'utf8')
  const re = /(?:src\s*=\s*"|url\(['"]?)(\.\.?\/[^"')]+|assets\/[^"')]+|\/images\/[^"')]+)/g
  let m
  while ((m = re.exec(src))) {
    const p = m[1]
    if (/^(data:|https?:)/.test(p)) continue
    const target = path.join(path.dirname(f), p).replace(/\\/g, '/')
    if (!fs.existsSync(target)) report(f + ': 引用了不存在的资源 ' + p)
  }
})

console.log('== 5. app.json 中的页面文件是否齐全 ==')
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'))
appJson.pages.forEach((p) => {
  ;['js', 'wxml', 'json'].forEach((ext) => {
    if (!fs.existsSync(p + '.' + ext)) report('app.json 声明了 ' + p + ' 但缺少 ' + ext)
  })
})
if (appJson.tabBar && appJson.tabBar.custom) {
  ;['js', 'wxml', 'wxss', 'json'].forEach((ext) => {
    if (!fs.existsSync('custom-tab-bar/index.' + ext)) report('开启了自定义 tabBar 但缺少 custom-tab-bar/index.' + ext)
  })
}
appJson.tabBar.list.forEach((t) => {
  if (appJson.pages.indexOf(t.pagePath) < 0) report('tabBar 中的 ' + t.pagePath + ' 不在 pages 列表里')
})

console.log('== 6. wxss 里用到的 CSS 变量是否都在 app.wxss 定义 ==')
const appWxss = fs.readFileSync('app.wxss', 'utf8')
const defined = new Set()
let vm
const vre = /(--[a-z0-9-]+)\s*:/g
while ((vm = vre.exec(appWxss))) defined.add(vm[1])
files.filter((f) => f.endsWith('.wxss')).forEach((f) => {
  const src = fs.readFileSync(f, 'utf8')
  let um
  const ure = /var\((--[a-z0-9-]+)/g
  const missing = new Set()
  while ((um = ure.exec(src))) if (!defined.has(um[1])) missing.add(um[1])
  missing.forEach((v) => report(f + ': 使用了未定义的变量 ' + v))
})

console.log('== 7. 弹层主体必须是 view + flex 收缩，不能是 scroll-view ==')
/*
 * 这条规则踩着三个真实故障定下来，三版做法都试过了，别再走回头路：
 *
 * 故障 A（scroll-view + flex:1）：scroll-view 在微信里不参与 flex 收缩，
 *   会被内容撑高，超过 .sheet 的 max-height: 88vh 后由 overflow:hidden 把
 *   .sheet-foot（确认按钮）整块裁掉 —— 表单都在，就是没有确认按钮。
 *
 * 故障 B（外套 view 用 flex 收缩 + scroll-view 绝对定位）：那层 wrap 的
 *   flex:1 在微信里会塌成 0 高，scroll-view 跟着 0 高 —— 整个弹层只剩标题，
 *   内容和按钮全没了，比故障 A 更糟。
 *
 * 故障 C（scroll-view + height: calc(78vh - 240rpx)）：把一个弹层的可见性
 *   吊在一条声明上。calc() 里混用 vh 和 rpx 正是各基础库解析行为不一致的地方，
 *   这条一旦被丢掉就退回故障 A。浏览器量着是好的（check-sheet.js 量过），
 *   真机复发 —— 「浏览器认得这条声明」和「微信认得这条声明」是两件事。
 *
 * 正解：主体是 view，flex:1 + min-height:0，让位给 flex-shrink:0 的 .sheet-foot。
 * 没有手算高度，就没有能算错、能被解析器丢掉的东西。
 *
 * 这几个 bug 在 Chromium 里都复现不出来（scroll-view 被当成普通元素，
 * 而且浏览器认得那条 calc），只能靠静态检查盯住。
 */
const appWxssRaw = fs.readFileSync('app.wxss', 'utf8')
{
  // 前面可能是 } 也可能是注释结尾的换行，所以用 \s 而不是只认 }
  const m = /(?:^|[}\s])\.sheet-body\s*\{([^}]*)\}/m.exec(appWxssRaw)
  if (!m) {
    report('app.wxss: 找不到 .sheet-body 规则')
  } else {
    const rule = m[1]
    // min-height:0 是关键：不写它 min-height 就是 auto，主体会被内容撑到满高、收缩不下去
    if (!/(?:^|[;{\s])min-height\s*:\s*0/.test(rule)) {
      report('app.wxss: .sheet-body 缺少 min-height: 0（主体会被内容撑开，把确认按钮顶出可视区）')
    }
    if (!/(?:^|[;{\s])flex\s*:\s*1/.test(rule)) {
      report('app.wxss: .sheet-body 缺少 flex: 1（主体不会收缩）')
    }
  }
  // 手算高度是故障 A/C 的源头，一律不许回来
  if (/scroll-view\.sheet-body\s*\{[^}]*(?:^|[;{\s])height\s*:/.test(appWxssRaw)) {
    report('app.wxss: 又给 scroll-view.sheet-body 手算高度了（见 lint 第 7 项：会退回「没有确认按钮」）')
  }
  if (appWxssRaw.indexOf('.sheet-body-wrap') >= 0) {
    report('app.wxss: 存在 .sheet-body-wrap（该包裹层的 flex:1 会塌成 0 高，导致弹层内容全空）')
  }
}
// scroll-view 在这个位置上不被 flex 收缩，是故障 A/C 的共同根源，直接禁掉
wxmls.forEach((wxml) => {
  const src = fs.readFileSync(wxml, 'utf8')
  if (/<scroll-view\b[^>]*class\s*=\s*"[^"]*\bsheet-body\b/.test(src)) {
    report(wxml + ': 弹层主体用了 scroll-view（它在微信里不参与 flex 收缩，会把确认按钮顶出可视区），改成 view')
  }
  if (src.indexOf('sheet-body-wrap') >= 0) {
    report(wxml + ': 用了会塌陷的 .sheet-body-wrap 包裹弹层主体')
  }
})

console.log('== 8. WXML 里静态书写的 class 是否在某个 wxss 里定义过 ==')
const definedClasses = new Set()
files.filter((f) => f.endsWith('.wxss')).forEach((f) => {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const cre = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g
  let cm
  while ((cm = cre.exec(src))) definedClasses.add(cm[1])
})
wxmls.forEach((wxml) => {
  const src = fs.readFileSync(wxml, 'utf8')
  const cre = /\bclass\s*=\s*"([^"]*)"/g
  let cm
  const missing = new Set()
  while ((cm = cre.exec(src))) {
    // 把 {{...}} 换成一个不可能出现在类名里的哨兵再分词：
    //   - 整段丢掉，避免 `{{cond ? 'x' : ''}}` 里的表达式 token 被当成类名
    //     （wx:for 的 item / index 尤其常见）
    //   - 但保留「边界」。像 `class="ic ic-{{item.icon}}-{{...}}"` 这种拼接，
    //     直接删掉会留下 `ic-` 这种半截 token；带哨兵就能整段跳过。
    const literal = cm[1].replace(/\{\{[\s\S]*?\}\}/g, '@')
    literal.split(/\s+/).forEach((tok) => {
      if (tok.indexOf('@') >= 0) return
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(tok)) return
      if (!definedClasses.has(tok)) missing.add(tok)
    })
  }
  missing.forEach((c) => report(wxml + ': class "' + c + '" 在任何 wxss 里都没有定义'))
})

console.log('== 9. 全屏遮罩必须 catchtouchmove（否则滑动会穿透到背景页） ==')
/*
 * `.mask` 是 position:fixed 铺满全屏的，但它本身并不会阻止触摸事件冒泡到页面。
 * 少了 catchtouchmove 时，手指在弹层上拖（拖头部、拖底部按钮、
 * 或 scroll-view 已经滑到头还继续拖）滚动的是背后那一屏，弹层纹丝不动。
 * 这个只有真机能感觉到，浏览器里复现不出来，所以在结构上钉死。
 */
wxmls.forEach((wxml) => {
  const src = fs.readFileSync(wxml, 'utf8')
  const re = /<view\b[^>]*class\s*=\s*"[^"]*\bmask\b[^"]*"[^>]*>/g
  let m
  while ((m = re.exec(src))) {
    if (!/catchtouchmove\s*=/.test(m[0])) {
      report(wxml + ': 全屏遮罩 class="mask" 上没有 catchtouchmove，滑动会穿透到背景页')
    }
  }
})

console.log('== 10. 打卡弹层不得提供切换日期的入口 ==')
/*
 * 打卡只能记在当天。日期选择器（picker mode="date"）和前一天/后一天按钮
 * 一旦溜回来，用户就能往过去甚至未来写数据 —— 后者尤其糟：它会让「连续天数」
 * 出现一个永远补不齐的缺口。
 *
 * 这条只做「入口有没有溜回来」的静态兜底；真正的约束在组件方法的守卫上，
 * 由 scripts/test-checkin-lock.js 真调用一遍来守。
 */
const CHECKIN_WXML = 'components/checkin-sheet/index.wxml'
const CHECKIN_JS = 'components/checkin-sheet/index.js'
if (fs.existsSync(CHECKIN_WXML)) {
  const src = fs.readFileSync(CHECKIN_WXML, 'utf8')
  if (/mode\s*=\s*"date"/.test(src)) {
    report(CHECKIN_WXML + ': 出现了日期选择器，打卡日期不允许切换')
  }
  if (/\bbindtap\s*=\s*"(onPrevDay|onNextDay|onDatePick)"/.test(src)) {
    report(CHECKIN_WXML + ': 出现了切换日期的按钮，打卡日期不允许切换')
  }
}
if (fs.existsSync(CHECKIN_JS)) {
  const src = fs.readFileSync(CHECKIN_JS, 'utf8')
  const re = /^\s{4}(onPrevDay|onNextDay|onDatePick|shiftDate)\s*\(/gm
  let m
  while ((m = re.exec(src))) {
    report(CHECKIN_JS + ': 残留了切日期方法 ' + m[1] + '(），打卡日期不允许切换')
  }
}

console.log(problems ? '\n发现 ' + problems + ' 个问题' : '\n静态检查通过，无问题')
process.exit(problems ? 1 : 0)
