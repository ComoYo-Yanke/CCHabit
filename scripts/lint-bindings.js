/*
 * 二期静态检查：WXML 里 {{}} 绑定的顶层标识符，是否在对应 JS 中出现过。
 * 判据是「整个 JS 文件里出现过这个名字」（含 data 键、setData 键、properties、局部变量），
 * 所以只会命中真正的拼写错误，不会误报作用域问题。
 */
const fs = require('fs')
const path = require('path')

// 统一切到项目根目录，脚本可从任意位置调用
process.chdir(path.join(__dirname, '..'))

let problems = 0
const report = (m) => { problems++; console.log('  ! ' + m) }

function walk(dir, out) {
  out = out || []
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) {
      if (['node_modules', '.git', '.claude', 'lib'].indexOf(f) >= 0) return
      walk(p, out)
    } else out.push(p.replace(/\\/g, '/'))
  })
  return out
}

// WXML 表达式里的内置关键字/工具，不算数据引用
const BUILTIN = new Set(['true', 'false', 'null', 'undefined', 'item', 'index', 'true', 'Math', 'JSON', 'String', 'Number', 'Boolean', 'Array', 'Object'])

/*
 * data 里可能有 `...pageFade.data` 这种展开：这些键在被 require 的模块里定义，
 * 本文件里连名字都没出现过，只扫本文件会把它们全报成「找不到」。
 * 所以把所有「被展开进本文件」的本地模块也并进搜索文本。
 */
function buildSearchable(js, jsPath) {
  let out = js
  const reqRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g
  let m
  while ((m = reqRe.exec(js))) {
    const name = m[1]
    const rel = m[2]
    // 只关心真的被展开进来的（`...name`），普通调用不引入新的绑定名
    if (!new RegExp('\\.\\.\\.\\s*' + name + '\\b').test(js)) continue
    for (const cand of [rel, rel + '.js', path.join(rel, 'index.js')]) {
      const target = path.resolve(path.dirname(jsPath), cand)
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        out += '\n' + fs.readFileSync(target, 'utf8')
        break
      }
    }
  }
  return out
}

walk('.').filter((f) => f.endsWith('.wxml')).forEach((wxml) => {
  const jsPath = wxml.replace(/\.wxml$/, '.js')
  const js = fs.readFileSync(jsPath, 'utf8')
  const searchable = buildSearchable(js, jsPath)
  const src = fs.readFileSync(wxml, 'utf8')

  // 收集本文件内 wx:for-item / wx:for-index 别名
  const aliases = new Set(['item', 'index'])
  let am
  const are = /wx:for-(?:item|index)\s*=\s*"([^"]+)"/g
  while ((am = are.exec(src))) aliases.add(am[1].trim())

  // 抽取所有 {{ }} 中的表达式
  const exprs = []
  let em
  const ere = /\{\{([\s\S]*?)\}\}/g
  while ((em = ere.exec(src))) exprs.push(em[1])

  const bad = new Set()
  exprs.forEach((expr) => {
    // 去掉字符串字面量，避免中文/文本被当成标识符
    const cleaned = expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
    // 只取「成员访问链的根标识符」：前面不是 . 也不是字母数字下划线
    const re = /(^|[^A-Za-z0-9_$.])([A-Za-z_$][A-Za-z0-9_$]*)/g
    let m
    while ((m = re.exec(cleaned))) {
      const id = m[2]
      if (BUILTIN.has(id) || aliases.has(id)) continue
      if (new RegExp('(^|[^A-Za-z0-9_$.])' + id + '\\b').test(searchable)) continue
      bad.add(id)
    }
  })

  bad.forEach((id) => report(wxml + ': 绑定变量 "' + id + '" 在同名 js 中找不到'))
})

console.log(problems ? '\n发现 ' + problems + ' 个可疑绑定' : '\n数据绑定检查通过')
process.exit(problems ? 1 : 0)
