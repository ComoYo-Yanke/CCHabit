/**
 * utils/storage.js —— 本地持久化层（唯一的数据出入口）
 *
 * ============================ 数据结构设计 ============================
 *
 * 存储 key（统一 `th:` 前缀，避免与第三方 SDK 冲突）：
 *
 *   th:meta     { version:Number, createdAt:Number, seeded:Boolean, appVersion:String }
 *               存储结构版本号，用于后续数据迁移；createdAt 为首次使用时间；
 *               appVersion 是用户**上次见过的**小程序版本号，用来判断「这是升级后第一次进入」，
 *               见 lastVersion / markVersion。
 *
 *   th:habits   Habit[]   习惯（打卡项）列表
 *
 *   th:records  { [habitId]: CheckinRecord[] }   打卡记录，按 habitId 分桶
 *
 *   th:settings { haptic:Boolean, theme:String }  用户偏好
 *               theme 取值 'light' | 'dark' | 'system'，见 utils/theme.js
 *
 * Habit（习惯）：
 *   {
 *     id:        String   唯一 id，形如 `h_lx3k2a`
 *     name:      String   习惯名称，如「背单词」
 *     unit:      String   数值单位，如「个 / 公里 / 毫升 / 次」，空串表示纯计数打卡
 *     icon:      String   表情图标，用于卡片展示
 *     color:     String   主题色（十六进制），用于卡片与图表
 *     target:    Number   每日目标值，0 表示不设目标
 *     step:      Number   快捷 +N 按钮的步长
 *     enabled:   Boolean  是否启用（关闭后不在首页展示、不计入连续统计）
 *     sort:      Number   排序权重，越小越靠前
 *     createdAt: Number   创建时间戳(ms)
 *     updatedAt: Number   最近更新时间戳(ms)
 *   }
 *
 * CheckinRecord（打卡记录）—— 使用短字段名以压缩存储体积：
 *   {
 *     id: String   唯一 id，形如 `r_lx3k2a`
 *     d:  String   日期 `YYYY-MM-DD`
 *     v:  Number   本次打卡的数值（纯计数习惯固定为 1）
 *     n:  String   备注，可为空串
 *     t:  Number   打卡时间戳(ms)
 *   }
 *
 *   同一天允许存在多条记录（需求：可重复多次打卡），
 *   按天聚合时 count = 记录条数，value = v 之和。
 *
 * ============================ 容量与边界 ============================
 *
 * 微信小程序 storage 单 key 上限 1MB、总量上限 10MB。
 * 一条记录序列化后约 70 字节，10MB 可容纳 10 万条以上，正常使用不会溢出。
 * 本模块对所有写入做 try/catch，捕获配额异常后抛出 `{ code: 'QUOTA_EXCEEDED' }`，
 * 由调用方决定提示文案；并提供 getUsage() 供设置页展示用量进度条。
 * ====================================================================
 */

const dayjs = require('./date.js')
const version = require('./version.js')

const KEYS = {
  META: 'th:meta',
  HABITS: 'th:habits',
  RECORDS: 'th:records',
  SETTINGS: 'th:settings'
}

/** 当前存储结构版本，升级结构时 +1 并在 migrate() 中补充迁移逻辑 */
const SCHEMA_VERSION = 1

/** 习惯卡片配色方案（暗色主题下对比度充足） */
const HABIT_COLORS = [
  '#5B8CFF', // 蓝
  '#37D0A0', // 绿
  '#FFB020', // 橙
  '#FF6B8A', // 粉
  '#A78BFA', // 紫
  '#22C5D6', // 青
  '#F97362', // 珊瑚
  '#8FD14F'  // 草绿
]

/** 常用单位预设，供添加习惯时快速选择 */
const UNIT_PRESETS = ['次', '个', '页', '公里', '毫升', '分钟', '组', '卡路里', '次提交']

/** 可选图标预设 */
const ICON_PRESETS = ['📖', '🏃', '💧', '🚴', '💪', '🧘', '🎯', '✍️', '🎸', '🌱', '💻', '🍎']

// ---------------------------------------------------------------------------
// 内存缓存：避免每次读统计都走一遍 wx.getStorageSync + JSON 解析。
// 所有写操作都会同步更新缓存，保证缓存与磁盘一致。
// ---------------------------------------------------------------------------
let _habitsCache = null
let _recordsCache = null

/** 生成带前缀的唯一 id（时间戳 36 进制 + 随机串，保证同一毫秒内不重复） */
function uid(prefix) {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 7)
  return prefix + '_' + t + r
}

/** 安全读取：任一异常都返回默认值，保证 App 不因脏数据白屏 */
function safeGet(key, fallback) {
  try {
    const val = wx.getStorageSync(key)
    return val === '' || val === null || val === undefined ? fallback : val
  } catch (e) {
    console.warn('[storage] 读取失败', key, e)
    return fallback
  }
}

/**
 * 安全写入：捕获配额超限。
 * @throws {{code:string, message:string}} 配额超限时抛出 QUOTA_EXCEEDED
 */
function safeSet(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {
    const msg = String((e && e.message) || e)
    // 微信在超限时抛出的文案包含 "exceed" / "quota" / "size"
    if (/exceed|quota|size|full/i.test(msg)) {
      const err = new Error('本地存储空间已满')
      err.code = 'QUOTA_EXCEEDED'
      err.raw = msg
      throw err
    }
    const err = new Error('本地存储写入失败：' + msg)
    err.code = 'WRITE_FAILED'
    throw err
  }
}

/** 首次启动初始化 / 结构版本迁移 */
function ensureInit() {
  const meta = safeGet(KEYS.META, null)
  if (!meta) {
    safeSet(KEYS.META, {
      version: SCHEMA_VERSION,
      createdAt: Date.now(),
      seeded: false,
      // 全新安装直接记成当前版本：这样「已更新至 vX」的弹窗只对**升级**上来的
      // 用户弹一次，第一次装的人一进来就被祝贺一遍「已更新」是很奇怪的
      appVersion: version.APP_VERSION
    })
    safeSet(KEYS.HABITS, [])
    safeSet(KEYS.RECORDS, {})
    return
  }
  migrate(meta)
}

/**
 * 用户上次见过的小程序版本号；从没有过（本版之前装的机子）时返回 null。
 *
 * 返回 null 而不是当前版本：老用户升上来正是**该**看到一次更新提示的那批人。
 */
function lastVersion() {
  const meta = safeGet(KEYS.META, null)
  return meta && meta.appVersion ? meta.appVersion : null
}

/** 记下「这个版本用户已经见过了」，下次进入不再弹更新提示 */
function markVersion(v) {
  const meta = safeGet(KEYS.META, { version: SCHEMA_VERSION, createdAt: Date.now() })
  meta.appVersion = v
  safeSet(KEYS.META, meta)
}

/** 版本迁移：低版本数据补齐新字段 */
function migrate(meta) {
  if (meta.version === SCHEMA_VERSION) return
  // 预留：后续版本在此按 meta.version 逐级升级
  meta.version = SCHEMA_VERSION
  safeSet(KEYS.META, meta)
}

// ---------------------------------------------------------------------------
// 习惯 CRUD
// ---------------------------------------------------------------------------

/** 读取全部习惯（已启用 + 已停用），按 sort 升序 */
function getHabits() {
  if (_habitsCache) return _habitsCache
  const list = safeGet(KEYS.HABITS, [])
  if (!Array.isArray(list)) {
    _habitsCache = []
    return _habitsCache
  }
  _habitsCache = list
    .filter((h) => h && h.id)
    .map(normalizeHabit)
    .sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
  return _habitsCache
}

/** 只取启用的习惯，首页与统计使用 */
function getEnabledHabits() {
  return getHabits().filter((h) => h.enabled)
}

/** 单个习惯 */
function getHabit(id) {
  return getHabits().find((h) => h.id === id) || null
}

/** 补齐历史数据缺失的字段，避免 undefined 扩散到视图层 */
function normalizeHabit(h) {
  return {
    id: h.id,
    name: h.name || '未命名习惯',
    unit: typeof h.unit === 'string' ? h.unit : '',
    icon: h.icon || '🎯',
    color: h.color || HABIT_COLORS[0],
    target: Number(h.target) || 0,
    step: Number(h.step) || 1,
    enabled: h.enabled !== false,
    sort: Number(h.sort) || 0,
    createdAt: h.createdAt || Date.now(),
    updatedAt: h.updatedAt || h.createdAt || Date.now()
  }
}

function saveHabits(list) {
  _habitsCache = null
  safeSet(KEYS.HABITS, list)
}

/**
 * 新增或更新习惯。
 * @param {Object} payload 习惯字段；带 id 且已存在则为更新
 * @returns {Object} 落库后的完整习惯对象
 */
function saveHabit(payload) {
  const list = getHabits().slice()
  const now = Date.now()
  const idx = payload.id ? list.findIndex((h) => h.id === payload.id) : -1

  if (idx >= 0) {
    const merged = normalizeHabit(Object.assign({}, list[idx], payload, { updatedAt: now }))
    list[idx] = merged
    saveHabits(list)
    return merged
  }

  const habit = normalizeHabit(
    Object.assign({}, payload, {
      id: payload.id || uid('h'),
      createdAt: now,
      updatedAt: now,
      // 新习惯排在最后
      sort: typeof payload.sort === 'number' ? payload.sort : list.length
    })
  )
  list.push(habit)
  saveHabits(list)
  return habit
}

/**
 * 删除习惯，并级联删除它的全部打卡记录（需求边界：删除习惯同步删除记录）。
 * @returns {number} 一并删除的记录条数
 */
function deleteHabit(id) {
  const list = getHabits().filter((h) => h.id !== id)
  saveHabits(list)

  const records = Object.assign({}, getRecordsMap())
  const removed = (records[id] || []).length
  delete records[id]
  saveRecordsMap(records)
  return removed
}

/** 启用 / 停用习惯 */
function setHabitEnabled(id, enabled) {
  return saveHabit({ id, enabled: !!enabled })
}

/** 按传入的 id 顺序重排 sort */
function reorderHabits(orderedIds) {
  const map = {}
  orderedIds.forEach((id, i) => {
    map[id] = i
  })
  const list = getHabits().map((h) => Object.assign({}, h, { sort: map[h.id] != null ? map[h.id] : h.sort }))
  saveHabits(list)
}

// ---------------------------------------------------------------------------
// 打卡记录 CRUD
// ---------------------------------------------------------------------------

/** 全部记录桶：{ habitId: CheckinRecord[] } */
function getRecordsMap() {
  if (_recordsCache) return _recordsCache
  const map = safeGet(KEYS.RECORDS, {})
  _recordsCache = map && typeof map === 'object' && !Array.isArray(map) ? map : {}
  return _recordsCache
}

function saveRecordsMap(map) {
  _recordsCache = map
  try {
    safeSet(KEYS.RECORDS, map)
  } catch (e) {
    // 写入失败时丢弃缓存，避免内存与磁盘不一致导致后续读取到脏数据
    _recordsCache = null
    throw e
  }
}

/** 某习惯的全部记录，按日期升序、同日内按时间升序 */
function getRecords(habitId) {
  const list = getRecordsMap()[habitId]
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => r && r.d)
    .map(normalizeRecord)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t))
}

function normalizeRecord(r) {
  return {
    id: r.id || uid('r'),
    d: r.d,
    v: Number(r.v) || 0,
    n: typeof r.n === 'string' ? r.n : '',
    t: Number(r.t) || Date.now()
  }
}

/**
 * 新增一条打卡记录（同一天可多条）。
 * @throws QUOTA_EXCEEDED 存储写满时
 */
function addRecord(habitId, date, value, note) {
  const map = Object.assign({}, getRecordsMap())
  const list = Array.isArray(map[habitId]) ? map[habitId].slice() : []
  const record = normalizeRecord({
    id: uid('r'),
    d: date,
    v: value,
    n: note || '',
    t: Date.now()
  })
  list.push(record)
  map[habitId] = list
  saveRecordsMap(map)
  return record
}

/** 修改某条记录（数值 / 备注 / 日期） */
function updateRecord(habitId, recordId, patch) {
  const map = Object.assign({}, getRecordsMap())
  const list = (map[habitId] || []).slice()
  const idx = list.findIndex((r) => r.id === recordId)
  if (idx < 0) return null
  list[idx] = normalizeRecord(Object.assign({}, list[idx], patch))
  map[habitId] = list
  saveRecordsMap(map)
  return list[idx]
}

/** 删除单条记录 */
function deleteRecord(habitId, recordId) {
  const map = Object.assign({}, getRecordsMap())
  const list = (map[habitId] || []).filter((r) => r.id !== recordId)
  if (list.length) map[habitId] = list
  else delete map[habitId]
  saveRecordsMap(map)
}

/** 清空某习惯某一天的全部记录 */
function clearRecordsOfDay(habitId, date) {
  const map = Object.assign({}, getRecordsMap())
  const list = (map[habitId] || []).filter((r) => r.d !== date)
  if (list.length) map[habitId] = list
  else delete map[habitId]
  saveRecordsMap(map)
}

/**
 * 一次性取出某天所有习惯的记录，首页按日汇总时避免 N 次遍历。
 * @returns {{ [habitId]: CheckinRecord[] }}
 */
function getRecordsOfDate(date) {
  const map = getRecordsMap()
  const out = {}
  Object.keys(map).forEach((hid) => {
    const list = (map[hid] || []).filter((r) => r && r.d === date)
    if (list.length) out[hid] = list.map(normalizeRecord)
  })
  return out
}

// ---------------------------------------------------------------------------
// 用户偏好
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  /** 打卡成功时是否震动反馈 */
  haptic: true,
  /**
   * 主题。默认深色：这是应用原本的样子，老用户升级后不该被换掉配色。
   * 删除习惯的二次确认**不设开关**了 —— 删习惯会级联删掉它全部记录且不可恢复，
   * 这种事没有「免确认」的合理场景，所以恒定确认（从默认值里删掉了 confirmDelete）。
   */
  theme: 'dark',
  /**
   * 自定义主题的配置（theme === 'custom' 时才起作用），在
   * pages/theme-editor 里改。只存用户改的那几项，整套色值由 utils/theme.js
   * 现算 —— 存整套变量的话，以后往调色板里加一个变量，老用户存的旧表就会缺那一项。
   * 这里是 null 而不是一份默认值：默认值放在 theme.js 的 DEFAULT_CUSTOM
   * （theme.js 依赖本模块，反向 require 会成环），缺省字段由那边补齐。
   */
  customTheme: null,
  /**
   * 自定义主题的预设，最多 3 个，在 pages/theme-editor 里存 / 切。
   * 每项形如 { id, name, cfg }，`cfg` 是一份**完整的**自定义主题配置（含背景图那几项）。
   *
   * 背景图是本地文件、storage 里只存路径，于是它现在有**多个持有者**：当前配置一份，
   * 每个预设各一份。「换一张图 / 移除背景图 / 恢复默认 / 删掉一个预设」都不能看见
   * 路径就删文件了 —— 别的预设可能还指着同一张（见 releaseImageFile 的引用计数）。
   * 只有「整份设置都要没了」的场合（清空数据 / 导入覆盖）才整批收掉，
   * 见 releaseBackgroundImage。
   *
   * 上限 3 是产品定的（多了这一栏会顶掉整页预览的意义），不存在这里，见 theme-editor。
   */
  themePresets: [],
  /**
   * 「此次更新不再显示」勾过的那一个版本号。
   * 只压制**这一个版本**的更新提示：下次改版本号，值对不上，又会弹
   * （见 pages/index 的 maybeShowUpdate）。
   *
   * 两处写它，说的是同一件事，所以只有这一个字段：
   *   - 弹窗里那个勾选框（关掉弹窗时落盘，见 pages/index 的 onCloseUpdate）
   *   - 「关于」页那个开关（见 pages/about 的 onToggleUpdateNotice）
   * 「关于」页是拿 `updateMuted === 当前版本号` 反推开关状态的 ——
   * 所以在弹窗里勾一下，回到「关于」页开关自己就是开的，不用另外同步。
   * 代价是换版本号之后开关会自己回到「关」：这正是这一项的含义
   * （「这一个版本别弹了」），不是 bug。
   */
  updateMuted: ''
}

function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, safeGet(KEYS.SETTINGS, {}))
}

/** 删一个本地文件；文件本来就不在、或低版本基础库没这个接口时静默作罢 */
function removeSavedFile(path) {
  if (!path) return
  try {
    const fs = wx.getFileSystemManager()
    // 低版本基础库没有 removeSavedFile，此时只能作罢，不影响调用方要做的事
    if (typeof fs.removeSavedFile !== 'function') return
    fs.removeSavedFile({ filePath: path, fail: () => {} })
  } catch (e) {
    // 文件本来就不在、或接口不可用，静默即可
  }
}

/**
 * 删掉自定义主题用过的**全部**背景图：当前那张 + 每个预设里那张。
 *
 * 背景图存在**本地文件**里，不在 storage 里（相册原图几 MB，storage 只有 10MB），
 * storage 里只留一个路径。于是「清空数据 / 导入覆盖」这类动作一旦丢掉
 * customTheme 和 themePresets，那几份文件就再没人指着它们了：空间照占，
 * 界面上也没有入口能删它们（编辑页的「移除」按钮读的正是被丢掉的那个路径）。
 * 所以每次丢弃设置之前先收掉。
 *
 * 只用在「整份设置都要没了」的场合。日常那种「换一张图 / 删一个预设」的删除
 * 走 releaseImageFile —— 那时候还有别的持有者，不能见一个删一个。
 */
function releaseBackgroundImage() {
  const s = getSettings()
  const paths = []
  if (s.customTheme && s.customTheme.image) paths.push(s.customTheme.image)
  ;(s.themePresets || []).forEach((p) => {
    if (p && p.cfg && p.cfg.image) paths.push(p.cfg.image)
  })
  paths.forEach(removeSavedFile)
}

/**
 * 删掉一张**不再被引用**的背景图文件。
 *
 * 背景图现在有多个持有者（见 themePresets），所以「换一张图 / 移除背景图 /
 * 恢复默认配色 / 删掉一个预设」都不能看见路径就删 —— 别的预设可能还指着同一张，
 * 删了它再切回去就是一片空白。
 *
 * 判据读的是**当前已经落盘的设置**，所以调用方必须**先 persist 再 release**：
 * 先把「谁还引用它」这个新事实写下去，这里再据此决定删不删。
 * （theme-editor 里的删除动作都是这个次序。）
 *
 * @param {String} path 待释放的文件路径
 * @returns {Boolean} 是不是真的删了 —— 还被引用时返回 false
 */
function releaseImageFile(path) {
  if (!path) return false
  const s = getSettings()
  if (s.customTheme && s.customTheme.image === path) return false
  const stillUsed = (s.themePresets || []).some((p) => p && p.cfg && p.cfg.image === path)
  if (stillUsed) return false
  removeSavedFile(path)
  return true
}

function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch)
  safeSet(KEYS.SETTINGS, next)
  return next
}

// ---------------------------------------------------------------------------
// 容量 / 导入导出 / 清空
// ---------------------------------------------------------------------------

/**
 * 存储用量。
 * @returns {{currentSize:Number, limitSize:Number, percent:Number, level:'ok'|'warn'|'danger'}}
 *          体积单位为 KB
 */
function getUsage() {
  try {
    const info = wx.getStorageInfoSync()
    const currentSize = info.currentSize || 0
    const limitSize = info.limitSize || 10240
    const percent = limitSize ? Math.min(100, Math.round((currentSize / limitSize) * 100)) : 0
    const level = percent >= 90 ? 'danger' : percent >= 70 ? 'warn' : 'ok'
    return { currentSize, limitSize, percent, level }
  } catch (e) {
    return { currentSize: 0, limitSize: 10240, percent: 0, level: 'ok' }
  }
}

/** 导出全部数据为 JSON 字符串（用于备份 / 迁移到新手机） */
function exportData() {
  return JSON.stringify(
    {
      app: 'TapHabit',
      schema: SCHEMA_VERSION,
      exportedAt: Date.now(),
      habits: getHabits(),
      records: getRecordsMap(),
      settings: getSettings()
    },
    null,
    2
  )
}

/**
 * 从 JSON 字符串导入数据（全量覆盖）。
 * 会做结构校验，脏数据一律跳过而不是整体失败。
 * @returns {{habits:Number, records:Number}} 导入成功的数量
 * @throws {{code:'INVALID_JSON'|'QUOTA_EXCEEDED'}}
 */
function importData(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    const err = new Error('数据格式不是合法 JSON')
    err.code = 'INVALID_JSON'
    throw err
  }
  if (!parsed || !Array.isArray(parsed.habits)) {
    const err = new Error('缺少 habits 字段，不是本应用导出的数据')
    err.code = 'INVALID_JSON'
    throw err
  }

  const habits = parsed.habits.filter((h) => h && h.id).map(normalizeHabit)
  const validIds = {}
  habits.forEach((h) => {
    validIds[h.id] = true
  })

  const records = {}
  let recordCount = 0
  const rawRecords = parsed.records && typeof parsed.records === 'object' ? parsed.records : {}
  Object.keys(rawRecords).forEach((hid) => {
    // 孤儿记录（对应习惯已不存在）直接丢弃，避免脏数据堆积
    if (!validIds[hid] || !Array.isArray(rawRecords[hid])) return
    records[hid] = rawRecords[hid].filter((r) => r && r.d).map(normalizeRecord)
    recordCount += records[hid].length
  })

  // 先写记录再写习惯：任一步失败都会抛错，由调用方提示用户
  saveRecordsMap(records)
  saveHabits(habits)
  if (parsed.settings) {
    // 备份里那条背景图路径指的是**导出那台手机**上的文件，换台机器打开就是坏的
    // （路径形如 wxfile://usr/xxx，每台设备各自一套）。所以只搬颜色、不搬图。
    // 本机原来那张也要一并收掉：它马上就会被这份设置覆盖成一个失效路径，
    // 之后编辑页的「移除」就再也删不掉它了
    releaseBackgroundImage()
    const next = Object.assign({}, parsed.settings)
    if (next.customTheme) next.customTheme = Object.assign({}, next.customTheme, { image: '' })
    // 预设里那张图同理，而且是**每一个**预设各有一张
    if (Array.isArray(next.themePresets)) {
      next.themePresets = next.themePresets.map((p) =>
        p && p.cfg ? Object.assign({}, p, { cfg: Object.assign({}, p.cfg, { image: '' }) }) : p
      )
    }
    saveSettings(next)
  }

  return { habits: habits.length, records: recordCount }
}

/** 清空全部数据（保留 meta，标记为已使用过） */
function clearAll() {
  // 必须在删 SETTINGS 之前：路径就在里面，删完就找不到那张图了
  releaseBackgroundImage()
  _habitsCache = null
  _recordsCache = null
  wx.removeStorageSync(KEYS.HABITS)
  wx.removeStorageSync(KEYS.RECORDS)
  wx.removeStorageSync(KEYS.SETTINGS)
  safeSet(KEYS.HABITS, [])
  safeSet(KEYS.RECORDS, {})
}

/** 是否已写入过示例数据 */
function hasSeeded() {
  const meta = safeGet(KEYS.META, {})
  return !!(meta && meta.seeded)
}

function markSeeded() {
  const meta = safeGet(KEYS.META, { version: SCHEMA_VERSION, createdAt: Date.now() })
  meta.seeded = true
  safeSet(KEYS.META, meta)
}

/**
 * 写入一批示例习惯与最近 30 天的随机打卡记录，方便用户直观了解应用。
 * 仅在用户主动点击「载入示例数据」时调用。
 */
function seedDemoData() {
  const todayStr = dayjs.today()
  const defs = [
    { name: '背单词', unit: '个', icon: '📖', color: HABIT_COLORS[0], target: 50, step: 10 },
    { name: '喝水', unit: '毫升', icon: '💧', color: HABIT_COLORS[5], target: 2000, step: 250 },
    { name: '骑行', unit: '公里', icon: '🚴', color: HABIT_COLORS[1], target: 10, step: 5 },
    { name: '健身', unit: '组', icon: '💪', color: HABIT_COLORS[3], target: 5, step: 1 }
  ]

  const habits = defs.map((d, i) => saveHabit(Object.assign({}, d, { sort: i })))
  const records = {}
  habits.forEach((h, hi) => {
    const list = []
    // 越靠后的习惯打卡越稀疏，让热力图呈现自然的深浅层次
    const density = 0.9 - hi * 0.15
    for (let i = 29; i >= 0; i--) {
      const date = dayjs.addDays(todayStr, -i)
      if (Math.random() > density) continue
      // 每天 1~2 条记录，模拟「可重复打卡」
      const times = Math.random() > 0.75 ? 2 : 1
      for (let k = 0; k < times; k++) {
        const base = h.target || 10
        const value = Math.max(1, Math.round(base * (0.6 + Math.random() * 0.7)))
        list.push(
          normalizeRecord({ id: uid('r'), d: date, v: value, n: '', t: dayjs.parseDate(date).getTime() + k * 3600000 })
        )
      }
    }
    if (list.length) records[h.id] = list
  })

  saveRecordsMap(records)
  markSeeded()
  return { habits: habits.length, records: Object.keys(records).reduce((s, k) => s + records[k].length, 0) }
}

module.exports = {
  KEYS,
  SCHEMA_VERSION,
  HABIT_COLORS,
  UNIT_PRESETS,
  ICON_PRESETS,
  DEFAULT_SETTINGS,
  uid,
  ensureInit,
  getHabits,
  getEnabledHabits,
  getHabit,
  saveHabit,
  deleteHabit,
  setHabitEnabled,
  reorderHabits,
  getRecords,
  getRecordsMap,
  getRecordsOfDate,
  addRecord,
  updateRecord,
  deleteRecord,
  clearRecordsOfDay,
  getSettings,
  saveSettings,
  // 释放一张不再被引用的背景图（引用计数）。整批收掉的那个只在模块内用 ——
  // 「清空数据 / 导入覆盖」都在本模块里，外面没有这个场合
  releaseImageFile,
  getUsage,
  exportData,
  importData,
  clearAll,
  hasSeeded,
  lastVersion,
  markVersion,
  seedDemoData
}
