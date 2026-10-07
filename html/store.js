/**
 * html/store.js —— 网页版的数据层
 *
 * ============================ 与小程序的关系 ============================
 *
 * **数据格式完全就是小程序的那一份**，一个字都不改：
 *
 *   Habit   { id, name, unit, icon, color, target, step, enabled, sort, createdAt, updatedAt }
 *   Record  { id, d:'YYYY-MM-DD', v:Number, n:String, t:Number }   按 habitId 分桶
 *   File    { app:'TapHabit', schema:1, exportedAt, habits, records, settings }
 *
 * 所以：网页「导出」出来的文件能直接喂给小程序的「我的 → 存储管理 → 导入」，
 * 小程序导出的备份也能原样丢给网页（见 importText，校验逻辑照着
 * `utils/storage.js` 的 importData 抄：孤儿记录丢弃、背景图路径抹掉）。
 *
 * ============================ 存在哪儿 ============================
 *
 * 三份，优先级从高到低：
 *   1. **同目录的 JSON 文件**（`taphabit-data.json`）—— 走 File System Access API。
 *      这是「存在本地（同目录）」那一条：文件就在 html/ 里，能直接看、能直接备份、
 *      能丢进 git。句柄存进 IndexedDB，下次打开还能接着用。
 *   2. **IndexedDB** —— 没绑文件（或浏览器不支持）时的落脚点。选它不是随便挑的：
 *      localStorage 只有 5MB，和「存储无限制」矛盾；IndexedDB 是配额制
 *      （通常按磁盘剩余的一大截给），几万条记录连个零头都算不上。
 *   3. 内存 —— 页面关了就没了，所以任何一次改动都会同时写 1 + 2。
 *
 * 浏览器不允许「不问自取」地写本地文件：绑文件这一步必须由用户点一下
 * （showSaveFilePicker / showOpenFilePicker），之后句柄才能长期复用。
 * 刷新后重新拿权限也常常需要一次点击，见 reconnect()。
 */
window.Store = (function () {
  /* 小程序那两个纯函数模块（见 index.html 顶部的加载器）。算 dayMap 这种账
     和小程序共用一份实现，网页和小程序的口径才不会有一天对不上 */
  const stats = window.__mods['./stats.js']
  const dayjs = window.__mods['./date.js']

  /** 默认文件名。放在 html/ 里，和小程序那个 taphabit 是同一套数据 */
  const FILE_HINT = 'taphabit-data.json'
  const IDB_NAME = 'taphabit-web'
  const IDB_STORE = 'kv'
  const KEY_DATA = 'data'
  const KEY_HANDLE = 'fileHandle'
  /**
   * AI 接入配置（含 API Key）**单独一格**，故意不放进 state.data。
   *
   * 为什么不放进 data：那份 JSON 是要**导出、备份、回流到小程序**的（还能丢进 git），
   * Key 跟着走一路就等于泄露一路。分开存之后，导出的文件里连这几个字段都没有。
   * 代价是换台机器要重填一次 —— 这本就该重填。
   */
  const KEY_AI = 'ai'

  const SCHEMA_VERSION = 1

  /** 和小程序 storage.js 的 HABIT_COLORS / ICON_PRESETS / UNIT_PRESETS 同源 */
  const HABIT_COLORS = ['#5B8CFF', '#37D0A0', '#FFB020', '#FF6B8A', '#A78BFA', '#22C5D6', '#F97362', '#8FD14F']
  const UNIT_PRESETS = ['次', '个', '页', '公里', '毫升', '分钟', '组', '卡路里']
  const ICON_PRESETS = ['📖', '🏃', '💧', '🚴', '💪', '🧘', '🎯', '✍️', '🎸', '🌱', '💻', '🍎']

  const DEFAULT_SETTINGS = {
    haptic: true,
    theme: 'dark',
    customTheme: null,
    themePresets: [],
    updateMuted: ''
  }

  const state = {
    data: emptyData(),
    handle: null,
    /** 有没有接上那份 JSON 文件 */
    connected: false,
    /** 'idb' | 'file' | 'memory' */
    source: 'memory',
    /** 最近一次落盘的结果，给界面显示 */
    status: { ok: true, text: '未载入', at: 0 },
    listeners: []
  }

  // -------------------------------------------------------------------------
  // 基础工具（与小程序 storage.js 同款：uid / normalize）
  // -------------------------------------------------------------------------

  function uid(prefix) {
    const t = Date.now().toString(36)
    const r = Math.random().toString(36).slice(2, 7)
    return prefix + '_' + t + r
  }

  function emptyData() {
    return { version: 1, createdAt: Date.now(), seeded: false, habits: [], records: {}, settings: {} }
  }

  function normalizeHabit(h) {
    return {
      id: h.id || uid('h'),
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

  function normalizeRecord(r) {
    return {
      id: r.id || uid('r'),
      d: r.d,
      v: Number(r.v) || 0,
      n: typeof r.n === 'string' ? r.n : '',
      t: Number(r.t) || Date.now()
    }
  }

  // -------------------------------------------------------------------------
  // IndexedDB：一个 key-value 抽屉，够用就行
  // -------------------------------------------------------------------------

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async function idbSet(key, value) {
    const db = await idb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  }

  async function idbGet(key) {
    const db = await idb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  // -------------------------------------------------------------------------
  // 文件：绑定 / 读 / 写
  // -------------------------------------------------------------------------

  function fileSupported() {
    return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function'
  }

  async function permission(handle, request) {
    if (!handle || !handle.queryPermission) return 'granted'
    const opts = { mode: 'readwrite' }
    const cur = await handle.queryPermission(opts)
    if (cur === 'granted') return cur
    if (!request) return cur
    return handle.requestPermission(opts)
  }

  /** 绑一份**新的**文件（同目录，文件名固定），已有的同名文件会被覆盖 */
  async function bindNew() {
    const handle = await window.showSaveFilePicker({
      suggestedName: FILE_HINT,
      types: [{ description: 'TapHabit 数据', accept: { 'application/json': ['.json'] } }]
    })
    return adopt(handle, { writeNow: true })
  }

  /** 绑一份**已有**的文件（导入 + 绑定一次做完） */
  async function bindExisting() {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'TapHabit 数据', accept: { 'application/json': ['.json'] } }]
    })
    return adopt(handle, { readFirst: true })
  }

  /** 刷新后用存下来的句柄重连：浏览器多半要一次用户手势才给权限 */
  async function reconnect() {
    const handle = await idbGet(KEY_HANDLE).catch(() => null)
    if (!handle) throw new Error('没有可重连的文件')
    return adopt(handle, { readFirst: true })
  }

  /**
   * 把一份文件句柄接上。
   * @param {Object} opts {readFirst} 先读文件内容（浏览器里那份是真身）
   *                         {writeNow} 先用内存里的数据写一遍（新建文件时）
   */
  async function adopt(handle, opts) {
    const o = opts || {}
    const grant = await permission(handle, true)
    if (grant !== 'granted') throw new Error('没有拿到文件读写权限')
    state.handle = handle
    state.connected = true
    await idbSet(KEY_HANDLE, handle).catch(() => {})

    if (o.readFirst) {
      const text = await (await handle.getFile()).text()
      if (text.trim()) {
        importText(text, { silent: true })
        state.source = 'file'
        state.status = { ok: true, text: '已接上文件', at: Date.now() }
        emit()
        return { read: true }
      }
    }
    // 文件是空的：把手上这份写进去，别让用户以为数据没了
    await persist(true)
    state.source = 'file'
    state.status = { ok: true, text: '已绑定文件', at: Date.now() }
    emit()
    return { read: false }
  }

  /** 把当前数据写成文件。没绑文件时什么也不做（IndexedDB 那份照样写） */
  async function writeFile() {
    if (!state.handle) return false
    const grant = await permission(state.handle, false)
    if (grant !== 'granted') {
      state.connected = false
      throw new Error('文件权限已失效，请在「数据」页重新连接')
    }
    const w = await state.handle.createWritable()
    await w.write(exportText())
    await w.close()
    return true
  }

  // -------------------------------------------------------------------------
  // 落盘：任何改动都走这里
  // -------------------------------------------------------------------------

  let saveTimer = null

  function touch() {
    emit()
    clearTimeout(saveTimer)
    // 防抖：连续打卡十来下不该写十几次盘
    saveTimer = setTimeout(() => persist(), 250)
  }

  async function persist(force) {
    clearTimeout(saveTimer)
    try {
      await idbSet(KEY_DATA, state.data)
      let fileOk = false
      if (state.handle) fileOk = await writeFile()
      state.connected = !!state.handle && fileOk !== false
      state.status = {
        ok: true,
        text: state.handle ? '已保存到文件' : '已保存到浏览器',
        at: Date.now()
      }
    } catch (e) {
      state.status = { ok: false, text: (e && e.message) || '保存失败', at: Date.now() }
    }
    if (force) emit()
    return state.status
  }

  // -------------------------------------------------------------------------
  // 读
  // -------------------------------------------------------------------------

  function habits() {
    return state.data.habits
      .slice()
      .sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
  }

  function enabledHabits() {
    return habits().filter((h) => h.enabled !== false)
  }

  function habit(id) {
    return state.data.habits.filter((h) => h.id === id)[0] || null
  }

  function recordsMap() {
    return state.data.records
  }

  function records(habitId) {
    return state.data.records[habitId] || []
  }

  function recordsOfDate(date) {
    const out = {}
    Object.keys(state.data.records).forEach((hid) => {
      out[hid] = (state.data.records[hid] || []).filter((r) => r.d === date)
    })
    return out
  }

  function toDayMap(list) {
    return stats.buildDayMap(list)
  }

  // -------------------------------------------------------------------------
  // 写（全部走 touch()，保证文件 + IndexedDB 一起落）
  // -------------------------------------------------------------------------

  function saveHabit(payload) {
    const now = Date.now()
    const list = state.data.habits
    const idx = payload.id ? list.findIndex((h) => h.id === payload.id) : -1
    if (idx >= 0) {
      const merged = normalizeHabit(Object.assign({}, list[idx], payload, { updatedAt: now }))
      list[idx] = merged
      touch()
      return merged
    }
    const maxSort = list.reduce((m, h) => Math.max(m, h.sort || 0), 0)
    const created = normalizeHabit(Object.assign({}, payload, { id: uid('h'), sort: maxSort + 1, createdAt: now, updatedAt: now }))
    list.push(created)
    touch()
    return created
  }

  function setHabitEnabled(id, enabled) {
    const h = habit(id)
    if (!h) return
    h.enabled = !!enabled
    h.updatedAt = Date.now()
    touch()
  }

  /** 删习惯 = 连它的记录一起删（和小程序一致） */
  function deleteHabit(id) {
    const before = records(id).length
    state.data.habits = state.data.habits.filter((h) => h.id !== id)
    delete state.data.records[id]
    touch()
    return before
  }

  function addRecord(habitId, date, value, note) {
    const list = state.data.records[habitId] || (state.data.records[habitId] = [])
    const record = normalizeRecord({ id: uid('r'), d: date, v: value, n: note || '', t: Date.now() })
    list.push(record)
    touch()
    return record
  }

  function deleteRecord(habitId, recordId) {
    const list = state.data.records[habitId]
    if (!list) return false
    const next = list.filter((r) => r.id !== recordId)
    if (next.length === list.length) return false
    state.data.records[habitId] = next
    touch()
    return true
  }

  /** 删掉某个习惯某天的全部记录 —— 「取消今天的打卡」用的就是它 */
  function clearRecordsOfDay(habitId, date) {
    const list = state.data.records[habitId] || []
    const next = list.filter((r) => r.d !== date)
    const removed = list.length - next.length
    if (removed) {
      state.data.records[habitId] = next
      touch()
    }
    return removed
  }

  function clearAll() {
    state.data = emptyData()
    touch()
  }

  function updateSettings(patch) {
    state.data.settings = Object.assign({}, state.data.settings, patch)
    touch()
  }

  // -------------------------------------------------------------------------
  // AI 配置 —— 唯一一份不进 state.data、也不进 JSON 文件的数据
  // -------------------------------------------------------------------------

  let aiConfig = Object.assign({}, window.AI ? window.AI.DEFAULT_CONFIG : {})

  function getAi() {
    return Object.assign({}, aiConfig)
  }

  /** 存的时候**不**走 touch()：它不该触发写数据文件 */
  async function setAi(patch) {
    aiConfig = Object.assign({}, aiConfig, patch)
    try {
      await idbSet(KEY_AI, aiConfig)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: (e && e.message) || '浏览器拒绝了这次保存' }
    }
  }

  // -------------------------------------------------------------------------
  // 导入 / 导出 —— 这一节是「完全兼容」的落点
  // -------------------------------------------------------------------------

  /**
   * 导出成小程序那份文件格式。
   * 字段名、嵌套、schema 都照抄 `utils/storage.js` 的 exportData：
   * 多一个字段都可能是小程序那边导入时的意外，少一个就是读不出来。
   */
  function exportText() {
    return JSON.stringify(
      {
        app: 'TapHabit',
        schema: SCHEMA_VERSION,
        exportedAt: Date.now(),
        habits: habits(),
        records: state.data.records,
        settings: state.data.settings || {}
      },
      null,
      2
    )
  }

  /**
   * 导入。校验逻辑照抄 storage.js 的 importData：
   *  - 不是合法 JSON / 没有 habits 数组 → 报错，原数据一个字不动
   *  - 孤儿记录（习惯已经不在了）直接丢
   *  - 背景图路径一律抹掉：那是导出那台设备上的本地文件，换台机器就是个坏路径
   * @returns {{habits:Number, records:Number, settings:Boolean}}
   */
  function importText(text, opts) {
    const o = opts || {}
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      throw new Error('数据格式不是合法 JSON')
    }
    if (!parsed || !Array.isArray(parsed.habits)) {
      throw new Error('缺少 habits 字段，不是本应用导出的数据')
    }

    const nextHabits = parsed.habits.filter((h) => h && h.id).map(normalizeHabit)
    const valid = {}
    nextHabits.forEach((h) => {
      valid[h.id] = true
    })

    const nextRecords = {}
    let recordCount = 0
    const raw = parsed.records && typeof parsed.records === 'object' ? parsed.records : {}
    Object.keys(raw).forEach((hid) => {
      if (!valid[hid] || !Array.isArray(raw[hid])) return
      nextRecords[hid] = raw[hid].filter((r) => r && r.d).map(normalizeRecord)
      recordCount += nextRecords[hid].length
    })

    let settings = parsed.settings && typeof parsed.settings === 'object' ? Object.assign({}, parsed.settings) : {}
    if (settings.customTheme) settings.customTheme = Object.assign({}, settings.customTheme, { image: '' })
    if (Array.isArray(settings.themePresets)) {
      settings.themePresets = settings.themePresets.map((p) =>
        p && p.cfg ? Object.assign({}, p, { cfg: Object.assign({}, p.cfg, { image: '' }) }) : p
      )
    }

    state.data = Object.assign(emptyData(), {
      version: Number(parsed.version) || 1,
      createdAt: state.data.createdAt || Date.now(),
      habits: nextHabits,
      records: nextRecords,
      settings: Object.assign({}, DEFAULT_SETTINGS, settings)
    })

    if (!o.silent) touch()
    return { habits: nextHabits.length, records: recordCount, settings: !!parsed.settings }
  }

  // -------------------------------------------------------------------------
  // 载入
  // -------------------------------------------------------------------------

  async function init() {
    // 0. AI 配置（和打卡数据无关，读不到也照常往下走）
    try {
      const savedAi = await idbGet(KEY_AI)
      if (savedAi && typeof savedAi === 'object') aiConfig = Object.assign({}, aiConfig, savedAi)
    } catch (e) {
      /* 没有就没有，界面上让用户重填 */
    }

    // 1. IndexedDB 那份先垫上，界面不至于空着
    try {
      const saved = await idbGet(KEY_DATA)
      if (saved && Array.isArray(saved.habits)) {
        state.data = saved
        state.source = 'idb'
        state.status = { ok: true, text: '已从浏览器载入', at: Date.now() }
      }
    } catch (e) {
      state.status = { ok: false, text: '浏览器存储不可用', at: Date.now() }
    }

    // 2. 之前绑过文件、且权限还在的话，文件说了算（它才是「同目录」那份真身）
    try {
      const handle = await idbGet(KEY_HANDLE)
      if (handle && (await permission(handle, false)) === 'granted') {
        state.handle = handle
        const text = await (await handle.getFile()).text()
        if (text.trim()) {
          importText(text, { silent: true })
          state.connected = true
          state.source = 'file'
          state.status = { ok: true, text: '已接上文件 ' + handle.name, at: Date.now() }
        }
      }
    } catch (e) {
      /* 权限没了 / 文件被挪走：退回 IndexedDB 那份，界面上给个「重新连接」 */
    }
    emit()
    return state
  }

  /** 把文件里的内容重新读一遍（在别的编辑器里改过文件之后用） */
  async function reloadFromFile() {
    if (!state.handle) throw new Error('还没有绑定文件')
    const text = await (await state.handle.getFile()).text()
    if (!text.trim()) throw new Error('文件是空的')
    const info = importText(text, { silent: true })
    await persist(true)
    return info
  }

  // -------------------------------------------------------------------------
  // 示例数据 / 汇总
  // -------------------------------------------------------------------------

  /** 载入一串演示数据：和小程序的「载入示例数据」用途一样，方便先看看统计长什么样 */
  function seedDemo() {
    const today = dayjs.today()
    const demo = [
      { name: '背单词', unit: '个', icon: '📖', color: '#5B8CFF', target: 50, step: 10 },
      { name: '跑步', unit: '公里', icon: '🏃', color: '#37D0A0', target: 5, step: 1 },
      { name: '喝水', unit: '毫升', icon: '💧', color: '#22C5D6', target: 2000, step: 250 },
      { name: '阅读', unit: '页', icon: '📚', color: '#FFB020', target: 30, step: 10 }
    ]
    const habits = demo.map((d, i) => normalizeHabit(Object.assign({}, d, { id: uid('h'), sort: i + 1 })))
    const records = {}
    habits.forEach((h, hi) => {
      const list = []
      // 往前铺 120 天，周末和每 7 天留点空档，看着像真的
      for (let i = 0; i < 120; i++) {
        const d = dayjs.addDays(today, -i)
        const wd = dayjs.getWeekday(d)
        if (i % 7 === 3 && hi % 2 === 0) continue
        if (wd >= 6 && hi === 1) continue
        const times = 1 + ((i + hi) % 3 === 0 ? 1 : 0)
        for (let k = 0; k < times; k++) {
          list.push(
            normalizeRecord({
              id: uid('r'),
              d,
              v: h.step * (1 + ((i + k) % 2)),
              n: '',
              t: dayjs.parseDate(d).getTime() + 8 * 3600 * 1000 + k * 60000
            })
          )
        }
      }
      records[h.id] = list
    })
    state.data = Object.assign(emptyData(), {
      seeded: true,
      habits,
      records,
      settings: state.data.settings || {}
    })
    touch()
  }

  /** 数据概况：习惯数 / 记录数 / 最早一天 / 体积 —— 「数据」页顶上那一排 */
  function overview() {
    const map = state.data.records
    let count = 0
    let earliest = ''
    let value = 0
    Object.keys(map).forEach((hid) => {
      ;(map[hid] || []).forEach((r) => {
        count += 1
        value += Number(r.v) || 0
        if (r.d && (!earliest || r.d < earliest)) earliest = r.d
      })
    })
    const text = exportText()
    return {
      habitCount: state.data.habits.length,
      enabledCount: enabledHabits().length,
      recordCount: count,
      totalValue: value,
      earliest,
      bytes: new Blob([text]).size,
      source: state.source,
      connected: !!state.handle && state.connected,
      fileName: state.handle ? state.handle.name : '',
      supported: fileSupported()
    }
  }

  // -------------------------------------------------------------------------
  // 订阅：界面只管重新画，不管谁改了数据
  // -------------------------------------------------------------------------

  function onChange(fn) {
    state.listeners.push(fn)
  }

  function emit() {
    state.listeners.forEach((fn) => fn(state))
  }

  return {
    FILE_HINT,
    HABIT_COLORS,
    UNIT_PRESETS,
    ICON_PRESETS,
    DEFAULT_SETTINGS,
    state,
    init,
    onChange,
    fileSupported,
    bindNew,
    bindExisting,
    reconnect,
    reloadFromFile,
    persist,
    habits,
    enabledHabits,
    habit,
    recordsMap,
    records,
    recordsOfDate,
    toDayMap,
    saveHabit,
    setHabitEnabled,
    deleteHabit,
    addRecord,
    deleteRecord,
    clearRecordsOfDay,
    clearAll,
    updateSettings,
    getAi,
    setAi,
    exportText,
    importText,
    seedDemo,
    overview
  }
})()
