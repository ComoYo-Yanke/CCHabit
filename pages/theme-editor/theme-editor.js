/**
 * 自定义主题编辑页
 *
 * 为什么单独开一页而不是塞在「我的」里面：
 *   1. 这一页本身就是预览 —— 整页实时按你调的颜色重绘，比一个小色块直观得多；
 *   2. 可调项从三个涨到「五个颜色 + 两个透明度 + 背景图（模糊 / 淡化）」，
 *      铺在设置页里会把「外观」那一栏撑得比别的栏长出一大截。
 *
 * 三条约定：
 *   - **进这一页就等于选了自定义主题**（onLoad 里把 theme 写过去）。
 *     否则会出现「颜色改了、整机还是深色」，看着像没生效。
 *   - **改动即时生效**：调色板点一下、滑块松手，立刻写 storage。
 *     滑块拖动过程中（changing）只改本地预览不落盘，松手（change）才写 ——
 *     拖一次会触发几十次事件，每次都同步写一遍存储没有必要。
 *   - 这一页**不参与页面淡入**（没有 page--fade / onShow / onHide 那套）。
 *     页面里有原生组件（slider / image），它们不认祖先的 opacity，
 *     淡入时会出现「底片全透明、滑块已经杵在那儿」的怪相。
 *     这是一张 navigateTo 出来的子页，框架自己的入场动画已经够了。
 */
const storage = require('../../utils/storage.js')
const theme = require('../../utils/theme.js')

/** 可改的五个颜色。顺序就是界面上的顺序，从「大块」到「小字」 */
const FIELDS = [
  { key: 'bg', label: '整体背景色', desc: '页面底色，卡片深浅跟着它定' },
  { key: 'surface', label: '卡片 / 弹层底色', desc: '卡片、弹层、输入框的底色' },
  { key: 'accent', label: '按钮 / 开关颜色', desc: '主按钮、开关、选中态' },
  { key: 'text', label: '标签 / 文字颜色', desc: '标题与正文' },
  { key: 'text2', label: '次要文字颜色', desc: '说明文字、单位、时间' }
]

/**
 * 每项的候选色。
 * 小程序没有取色器控件，所以做成「预设色点选 + RGB 三根滑块」两条路：
 * 想省事的点色点，想调准的拖滑块，两边都能改到任意颜色。
 */
const PALETTES = {
  bg: ['#0E1014', '#12151C', '#1B1F2A', '#232733', '#2E2A3A', '#F3F4F7', '#FFFFFF', '#FAF7F2'],
  surface: ['#171B24', '#1E232E', '#262C38', '#2B3140', '#FFFFFF', '#F7F8FA', '#F1F2F5', '#EFEAF6'],
  accent: ['#5B8CFF', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981'],
  text: ['#EDF1F7', '#C9D1E0', '#12151C', '#2B3240', '#4A5261', '#FFFFFF', '#111827', '#374151'],
  text2: ['#98A2B3', '#8A94A6', '#6B7280', '#4A5261', '#C9D1E0', '#9CA3AF', '#64748B', '#78716C']
}

Page({
  data: {
    /** 当前配置（含背景图那三项），改一次存一次 */
    cfg: theme.DEFAULT_CUSTOM,
    /** 给 page-meta 的行内变量，由本地配置现算（滑块拖动时也要立刻变） */
    themeStyle: '',
    /** 背景图那一层；没图时为 null，整层不渲染 */
    bg: null,
    /**
     * 底栏胶囊的预览数据。它不出现在这份 page-style 里 —— 底栏由框架独立挂载、
     * 拿不到 CSS 变量，是靠 JS 喂色才活着的，所以整页换肤预览不到它，
     * 只能单独画一个（见 utils/theme.js 的 tabbarVars）
     */
    tabbar: theme.tabbarVars(theme.vars('dark')),

    fields: FIELDS,
    palettes: PALETTES,
    /** 当前展开了色板 / 滑块的那一项，空串表示都收着 */
    activeField: '',
    /** 展开项的三根滑块当前值，拖动时用 */
    rgb: { r: 0, g: 0, b: 0 }
  },

  onLoad() {
    // 进这一页 = 要用自定义主题（理由见文件头）
    storage.saveSettings({ theme: 'custom' })
    this.apply(theme.customConfig())
  },

  /**
   * 把一份配置落到界面上。**只改界面，不写 storage** ——
   * 落盘由 persist 负责，这样滑块拖动过程中可以放心地高频调用。
   */
  apply(cfg) {
    const p = theme.preview(cfg)
    this.setData({
      cfg,
      themeStyle: p.style + ';',
      bg: p.bg,
      tabbar: p.tabbar
    })
  },

  /** 写 storage + 刷新界面。theme 也一并写：能改到这里了，就是要在用 */
  persist(cfg) {
    storage.saveSettings({ theme: 'custom', customTheme: cfg })
    this.apply(cfg)
  },

  /** 改一个颜色（点色板或拖 RGB 滑块） */
  setColor(key, hex, persistIt) {
    const cfg = Object.assign({}, this.data.cfg, { [key]: hex })
    if (persistIt) this.persist(cfg)
    else this.apply(cfg)
  },

  onPickColor(e) {
    const key = this.data.activeField
    const color = e.currentTarget.dataset.color
    if (!key || !color) return
    this.setData({ rgb: toRgb(color) })
    this.setColor(key, color, true)
  },

  /** 展开某一项的调色区；展开时把滑块的值同步成当前色 */
  onToggleField(e) {
    const key = e.currentTarget.dataset.key
    if (this.data.activeField === key) {
      this.setData({ activeField: '' })
      return
    }
    const color = this.data.cfg[key] || '#000000'
    this.setData({ activeField: key, rgb: toRgb(color) })
  },

  /**
   * RGB 滑块。
   * bindchanging 是拖动中（一次拖动几十个事件）→ 只更新界面；
   * bindchange 是松手 → 这时才落盘。
   * 老版本基础库的 changing 事件给的是对象而不是数字，两种都接。
   */
  onRgbChanging(e) {
    this.onRgb(e, false)
  },

  onRgbChange(e) {
    this.onRgb(e, true)
  },

  onRgb(e, persistIt) {
    const key = this.data.activeField
    if (!key) return
    const ch = e.currentTarget.dataset.ch
    const raw = e.detail.value
    const value = typeof raw === 'object' && raw !== null ? raw.value : raw
    const rgb = Object.assign({}, this.data.rgb, { [ch]: Number(value) || 0 })
    this.setData({ rgb })
    this.setColor(key, toHex(rgb), persistIt)
  },

  /** 卡片 / 浮层透明度。同样是拖动中预览、松手落盘 */
  onSurfaceAlphaChanging(e) {
    this.onSurfaceAlpha(e, false)
  },

  onSurfaceAlphaChange(e) {
    this.onSurfaceAlpha(e, true)
  },

  onSurfaceAlpha(e, persistIt) {
    const raw = e.detail.value
    const value = typeof raw === 'object' && raw !== null ? raw.value : raw
    const cfg = Object.assign({}, this.data.cfg, { surfaceAlpha: Number(value) || 0 })
    if (persistIt) this.persist(cfg)
    else this.apply(cfg)
  },

  onImageBlurChanging(e) {
    this.onImageNum(e, 'imageBlur', false)
  },

  onImageBlurChange(e) {
    this.onImageNum(e, 'imageBlur', true)
  },

  onImageDimChanging(e) {
    this.onImageNum(e, 'imageDim', false)
  },

  onImageDimChange(e) {
    this.onImageNum(e, 'imageDim', true)
  },

  onImageNum(e, field, persistIt) {
    const raw = e.detail.value
    const value = typeof raw === 'object' && raw !== null ? raw.value : raw
    const cfg = Object.assign({}, this.data.cfg, { [field]: Number(value) || 0 })
    if (persistIt) this.persist(cfg)
    else this.apply(cfg)
  },

  // ---------------- 背景图 ----------------

  /**
   * 选一张图当背景。
   *
   * 拿到的是**临时路径**（微信会在某个时间点清掉），所以必须 saveFile 转成
   * 持久路径；而本地文件总量有 10MB 上限，相册原图动辄几 MB，所以先压一道。
   * 换图时把上一张删掉，否则会一直堆在本地文件里直到超限。
   */
  onPickImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        wx.compressImage({
          src: file.tempFilePath,
          quality: 60,
          success: (r) => this.saveImage(r.tempFilePath),
          // 压缩失败就用原图，不能因为压不动就选不了图
          fail: () => this.saveImage(file.tempFilePath)
        })
      }
    })
  },

  saveImage(tempFilePath) {
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: (r) => {
        const old = this.data.cfg.image
        this.persist(Object.assign({}, this.data.cfg, { image: r.savedFilePath }))
        // 换完再删旧的：先删万一保存失败，用户就两头空了
        if (old && old !== r.savedFilePath) this.removeFile(old)
        wx.showToast({ title: '背景已设置', icon: 'none' })
      },
      fail: () => {
        wx.showModal({
          title: '保存图片失败',
          content: '本地文件空间可能已满（小程序上限 10MB）。可以先在「存储管理」里清理数据，或换一张更小的图。',
          showCancel: false
        })
      }
    })
  },

  onRemoveImage() {
    const old = this.data.cfg.image
    this.persist(Object.assign({}, this.data.cfg, { image: '' }))
    this.removeFile(old)
  },

  /** 删掉不再使用的背景图文件；文件本来就不在时静默失败即可 */
  removeFile(path) {
    if (!path) return
    const fs = wx.getFileSystemManager()
    if (typeof fs.removeSavedFile !== 'function') return
    fs.removeSavedFile({ filePath: path, fail: () => {} })
  },

  /** 全部恢复成默认（深色那套），背景图也一并删掉 */
  onReset() {
    wx.showModal({
      title: '恢复默认配色',
      content: '五个颜色、透明度都会回到默认值，背景图会被移除。',
      confirmText: '恢复',
      success: (res) => {
        if (!res.confirm) return
        this.removeFile(this.data.cfg.image)
        this.setData({ activeField: '' })
        this.persist(Object.assign({}, theme.DEFAULT_CUSTOM))
        wx.showToast({ title: '已恢复默认', icon: 'none' })
      }
    })
  },

  noop() {}
})

/** '#RRGGBB' -> { r, g, b }，认不出来时返回黑色 */
function toRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function toHex(rgb) {
  const part = (n) => ('0' + Math.max(0, Math.min(255, Math.round(n || 0))).toString(16)).slice(-2)
  return ('#' + part(rgb.r) + part(rgb.g) + part(rgb.b)).toUpperCase()
}
