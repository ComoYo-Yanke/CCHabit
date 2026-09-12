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

console.log('== 6. wxss 里用到的 CSS 变量是否定义过 ==')
/*
 * 定义处有两个来源：
 *   1. app.wxss 的全局调色板（page 选择器下那一坨）
 *   2. **同一个文件内**自己声明的局部变量
 * 第 2 类是完全合法的 CSS —— 自定义属性就是普通属性，跟着选择器层叠。
 * heatmap 的 --heat-month-h 就是这种：定义在 .heat 上，给后代 .heat-weekdays 用。
 * 早先只扫 app.wxss，会把这类局部变量误报成「未定义」。
 */
const appWxss = fs.readFileSync('app.wxss', 'utf8')
const globalDefined = new Set()
let vm
const vre = /(--[a-z0-9-]+)\s*:/g
while ((vm = vre.exec(appWxss))) globalDefined.add(vm[1])
files.filter((f) => f.endsWith('.wxss')).forEach((f) => {
  const src = fs.readFileSync(f, 'utf8')
  const localDefined = new Set(globalDefined)
  let dm
  const dre = /(--[a-z0-9-]+)\s*:/g
  while ((dm = dre.exec(src))) localDefined.add(dm[1])
  let um
  const ure = /var\((--[a-z0-9-]+)/g
  const missing = new Set()
  while ((um = ure.exec(src))) if (!localDefined.has(um[1])) missing.add(um[1])
  missing.forEach((v) => report(f + ': 使用了未定义的变量 ' + v))
})

console.log('== 7. 弹层主体必须是 scroll-view + flex 收缩 ==')
/*
 * 这条规则翻过一次案，把两件事分清楚了再定下来，别再走回头路。
 *
 * 【被推翻的旧结论】「确认按钮不见了」曾被归因到 scroll-view 上，结论是
 *   「scroll-view 在微信里不参与 flex 收缩，会被内容撑高，把 .sheet-foot 裁掉」，
 *   于是主体改成 view + overflow-y:auto。按钮确实回来了，但换出一个新毛病：
 *   **真机上弹层滑不动，反而是背景那一屏在滚。**
 *
 * 【真正的病因】普通 view 的 overflow 滚动，是挂在 WebView 的 touchmove 上的；
 *   而遮罩 .mask 为了挡住穿透绑了 catchtouchmove（见第 9 条），
 *   这个 catch 正好把 touchmove 吃掉 —— 滚动手势还没轮到主体就已经没了。
 *   开发者工具里用鼠标滚轮是 wheel 事件，不受影响，所以这个 bug 浏览器里看不见。
 *
 * 【正解】主体用 scroll-view：它走**原生滚动**，手指按下的那一刻手势就被原生层
 *   接管了，根本不会冒泡到遮罩的 catchtouchmove。同时补上当年缺的那句
 *   min-height: 0 —— 那才是「被内容撑高」的真正原因：
 *   flex 项目的 min-height 默认是 auto，不写 0 就压不下去，与是不是 scroll-view 无关。
 *
 * 现在「确认按钮被顶出可视区」没有发生的物理条件了：按钮在 .sheet-head 里
 * （flex-shrink: 0，和主体是兄弟节点），主体怎么长都够不着它。
 *
 * 手算高度仍然是错的（calc 里混用 vh/rpx，各基础库解析行为不一致，
 * 那条声明一被丢掉整个弹层就塌），一并禁掉。
 * 这几个 bug 在 Chromium 里都复现不出来，只能靠静态检查盯住。
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
      report('app.wxss: .sheet-body 缺少 min-height: 0（flex 项目的 min-height 默认 auto，主体压不下去）')
    }
    if (!/(?:^|[;{\s])flex\s*:\s*1/.test(rule)) {
      report('app.wxss: .sheet-body 缺少 flex: 1（主体不会收缩）')
    }
  }
  // 手算高度是各基础库行为不一致的地方，一律不许回来
  if (/scroll-view\.sheet-body\s*\{[^}]*(?:^|[;{\s])height\s*:/.test(appWxssRaw)) {
    report('app.wxss: 给 scroll-view.sheet-body 手算高度了（calc 里混用 vh/rpx，声明被丢掉弹层就塌）')
  }
  if (appWxssRaw.indexOf('.sheet-body-wrap') >= 0) {
    report('app.wxss: 存在 .sheet-body-wrap（该包裹层的 flex:1 会塌成 0 高，导致弹层内容全空）')
  }
}
wxmls.forEach((wxml) => {
  const src = fs.readFileSync(wxml, 'utf8')
  // 主体必须走原生滚动，否则滚动手势会被遮罩的 catchtouchmove 吃掉
  if (/<view\b[^>]*class\s*=\s*"[^"]*\bsheet-body\b/.test(src)) {
    report(wxml + ': 弹层主体用了 view（它的 overflow 滚动挂在 touchmove 上，会被遮罩的 catchtouchmove 吃掉，真机滑不动），改成 scroll-view')
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

console.log('== 9b. 遮罩收起时必须 display:none，不能只靠 opacity/visibility ==')
/*
 * 弹层收起后「不完全可见」的那个 bug：主页偶尔冒出来的「背单词」字样。
 * 那是 habit-editor 名称输入框的 placeholder（「例如：背单词」）。
 *
 * 原因是 input / textarea / switch 属于**原生组件** —— 它们由客户端原生控件
 * 画在 WebView 之上，只认「在不在渲染树里」，不认 opacity / visibility 这类
 * 绘制层属性。遮罩写 opacity:0 时，WebView 那一层确实透明了，
 * 但浮在上面的原生输入框照样画出来。
 *
 * 只有 display:none（整棵子树不参与渲染）在所有平台、所有基础库下都成立。
 * 配合组件的 mounted/active 两级状态：收起先摘 --on 播动画，260ms 后摘 --mounted。
 */
{
  const mm = /(?:^|[}\s])\.mask\s*\{([^}]*)\}/m.exec(appWxssRaw)
  if (!mm) {
    report('app.wxss: 找不到 .mask 规则')
  } else if (!/(?:^|[;{\s])display\s*:\s*none/.test(mm[1])) {
    report('app.wxss: .mask 收起态不是 display:none（原生组件 input/textarea/switch 不认 opacity，会留在屏幕上）')
  } else if (/(?:^|[;{\s])visibility\s*:\s*hidden/.test(mm[1])) {
    // visibility:hidden 是上一版的做法，留着会让人以为它有用
    report('app.wxss: .mask 上残留 visibility:hidden（对原生组件无效，收起靠 display:none）')
  }
}

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
