/**
 * 自定义主题编辑页
 *
 * 为什么单独开一页而不是塞在「我的」里面：
 *   1. 这一页本身就是预览 —— 整页实时按你调的颜色重绘，比一个小色块直观得多；
 *   2. 可调项从三个涨到「五个颜色 + 卡片透明度与毛玻璃 + 背景图取景」，
 *      铺在设置页里会把「外观」那一栏撑得比别的栏长出一大截。
 *
 * 四条约定：
 *   - **进这一页就等于选了自定义主题**（onLoad 里把 theme 写过去）。
 *     否则会出现「颜色改了、整机还是深色」，看着像没生效。
 *   - **改动即时生效**：调色板点一下、滑块松手、窗子拖完，立刻写 storage。
 *     拖动过程中（changing / touchmove）只改本地预览不落盘，松手才写 ——
 *     拖一次会触发几十次事件，每次都同步写一遍存储没有必要。
 *   - **取景是「挪窗子」，不是「调三个数」**：整张图摊开当舞台，上面盖一个屏幕比例的
 *     小窗，窗里的就是会显示的那块（见 utils/theme.js 的 frame）。拖动改 imagePosX/Y，
 *     旁边的滑块改 imageZoom —— 存的还是那三个老字段，所以真实页面的渲染一行没动。
 *     这套东西收在「调整背景图」弹窗里，页面上只看得到一颗按钮：整张图摊开占的
 *     地方太大，往下滑的时候手指极容易蹭到小窗，把取景拖歪了都不知道。
 *   - 这一页**不参与页面淡入**（没有 page--fade / onShow / onHide 那套）。
 *     页面里有原生组件（slider / image），它们不认祖先的 opacity，
 *     淡入时会出现「底片全透明、滑块已经杵在那儿」的怪相。
 *     这是一张 navigateTo 出来的子页，框架自己的入场动画已经够了。
 */
const storage = require('../../utils/storage.js')
const theme = require('../../utils/theme.js')

/**
 * 取景弹窗的入场 / 退场时长（ms），和 app.wxss 里 .modal 的 0.24s、
 * .mask 的 0.22s 过渡对应：退场要 ≥ 0.22s 才不至于「啪」地消失；
 * 入场后要等过渡走完再量舞台（途中量到的是缩放中的宽度）。
 */
const MODAL_ENTER_MS = 280
const MODAL_LEAVE_MS = 260

/** 能存几个预设。产品定的数字，顺手也当 nextPresetName 的编号上限 */
const PRESET_MAX = 3

/**
 * 一个预设存哪些项 —— 用户可以调的**全部**项目：五个颜色、卡片透明度与毛玻璃、
 * 背景图本体与它的几何（尺寸 / 取景位置 / 缩放 / 模糊 / 淡化）。
 * 一句话，`theme.DEFAULT_CUSTOM` 有哪些键就存哪些。
 *
 * 所以这里**由 DEFAULT_CUSTOM 直接推出来**，不再手抄一份清单：抄一份的后果是
 * 以后往调色板里加了新项，老预设会悄悄少掉那一项（切回去只觉得「哪儿不太一样」，
 * 说不上来），而这种漏只有真机上才看得出来。
 *
 * 背景图存进来是有代价的：它是本地文件（wxfile://usr/...），storage 里只放路径，
 * 而删文件的地方不止一处。所以「换一张图 / 移除背景图 / 恢复默认 / 删掉一个预设」
 * 都改走 storage.releaseImageFile —— 那张图还被别的预设指着就先留着，没人指着了才真删。
 * 没有这套引用计数，预设里留下的就是个死路径，切回去一片空白。
 */
const PRESET_KEYS = Object.keys(theme.DEFAULT_CUSTOM)

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
    /** 当前配置（含背景图那几项），改一次存一次 */
    cfg: theme.DEFAULT_CUSTOM,
    /** 给 page-meta 的行内变量，由本地配置现算（滑块拖动时也要立刻变） */
    themeStyle: '',
    /** 背景图那一层；没图时为 null，整层不渲染 */
    bg: null,
    /**
     * 取景台的几何（舞台 + 小窗），由 theme.frame 算好。没图、或原图宽高还不知道时
     * 为 null，那一段不渲染 —— 见 utils/theme.js 的 frame
     */
    frame: null,
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
    rgb: { r: 0, g: 0, b: 0 },

    /** 「调整背景图」弹窗的两级挂载状态（见 app.wxss 的 .mask） */
    frameMounted: false,
    frameOn: false,

    /** 存下来的主题预设（最多 presetMax 个，存整页能调的全部，见 PRESET_KEYS） */
    presets: [],
    presetMax: PRESET_MAX,
    /** 当前配色正好等于哪个预设 —— 拿它的 id 在列表里标「使用中」，空串表示都不是 */
    activePresetId: ''
  },

  onLoad() {
    // 进这一页 = 要用自定义主题（理由见文件头）
    storage.saveSettings({ theme: 'custom' })
    const cfg = theme.customConfig()
    this.apply(cfg)
    this.loadPresets()
    // 老配置（这一版之前设的图）没有尺寸，补问一次，取景滑块才有得算
    this.probeImageSize(cfg)
  },

  /**
   * 问出原图的宽高，补进配置。
   *
   * 为什么非要尺寸：「选择显示范围」要求元素里装的是**整张没裁过的图**，而那要按原图
   * 宽高比算「铺满」要多大（见 theme.bgLayer）。新选的图在 saveImage 里就问过了，
   * 这里管的是这一版之前设的图 —— 打开这一页补一次，之后不会再缺。
   *
   * 拿不到就保持 0：图层会退回「铺满 + 居中」，也就是这一版之前的表现，
   * 不会因为问不到尺寸就把图拉歪。
   */
  probeImageSize(cfg) {
    if (!cfg.image || cfg.imageW) return
    wx.getImageInfo({
      src: cfg.image,
      success: (r) => {
        if (!r || !r.width || !r.height) return
        // 问的这段时间里用户可能又换了一张，那就别把旧图的尺寸写进去
        if (this.data.cfg.image !== cfg.image) return
        this.persist(Object.assign({}, this.data.cfg, { imageW: r.width, imageH: r.height }))
      },
      fail: () => {}
    })
  },

  /**
   * 把一份配置落到界面上。**只改界面，不写 storage** ——
   * 落盘由 persist 负责，这样滑块拖动过程中可以放心地高频调用。
   */
  apply(cfg) {
    const p = theme.preview(cfg)
    // 舞台的宽度不在这里量：取景台现在只住在弹窗里（打开时量，见 onOpenFrame），
    // 而 apply 大部分时候是在弹窗关着的情况下被调的（改颜色、拖透明度），
    // 那时 .fx-stage 根本不在节点树上
    this.setData({
      cfg,
      themeStyle: p.style + ';',
      bg: p.bg,
      frame: p.frame,
      tabbar: p.tabbar,
      /**
       * 「使用中」的标记跟着配置一起重算。
       * 原来只在 onLoad 里算一次（loadPresets），于是切完预设、或改了一个颜色之后，
       * 列表上那两处按钮要退出这一页再进来才变 —— 说的和看到的是两回事。
       * 这里只查已加载的那份 presets，**不读 storage**：拖动取景时 apply 会被高频调用。
       */
      activePresetId: matchPreset(this.data.presets, cfg)
    })
  },

  /**
   * 拖动取景小窗时走这条：只推和取景有关的那几项。
   *
   * 不直接调 apply 是因为它连着 themeStyle 和 tabbar 一起 setData —— 底栏那份
   * 带三枚内联 SVG（好几 KB），拖一次会推几十遍，手感会发飘。调色板这几项在
   * 拖动期间根本不会变（笔在动的是窗子，不是颜色），松手后 persist 会把整套补齐。
   * 几何仍然只有一个来源（theme.preview），这里只是少推几个字段。
   */
  dragApply(cfg) {
    const p = theme.preview(cfg)
    this.setData({ cfg, frame: p.frame, bg: p.bg })
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

  /**
   * 数值型滑块共用的入口：背景图那三项（取景缩放 / 模糊 / 淡化）+ 卡片毛玻璃。
   * 改哪一项由 data-field 带过来 —— 它们形状完全一样，为每项各写一对 handler
   * 只是把同一段代码抄好几遍。
   */
  onNumChanging(e) {
    this.onNum(e, false)
  },

  onNumChange(e) {
    this.onNum(e, true)
  },

  onNum(e, persistIt) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    const raw = e.detail.value
    const value = typeof raw === 'object' && raw !== null ? raw.value : raw
    const cfg = Object.assign({}, this.data.cfg, { [field]: Number(value) || 0 })
    if (persistIt) this.persist(cfg)
    else this.apply(cfg)
  },

  // ---------------- 取景弹窗 ----------------

  /**
   * 打开「调整背景图」。
   *
   * 两级挂载的理由见 app.wxss 的 .mask：滑块是**原生组件**，只认「在不在」，
   * 收起时必须整棵子树 display:none，否则会在页面上留下半透明的残影。
   */
  onOpenFrame() {
    if (!this.data.cfg.image || this.data.frameMounted) return
    // 舞台宽度作废重量：它现在住在弹窗里，面板宽和当初卡片宽不是一回事，
    // 拿旧数去把手指的 px 换算成百分比会拖不准
    this._stageW = 0
    this.setData({ frameMounted: true })
    // 下一拍再加 --on：遮罩得先落到 display:flex，过渡才有起点
    wx.nextTick(() => {
      this.setData({ frameOn: true })
      // 量两次：这一次让拖动立刻能用，等展开动画走完再量一次 ——
      // 面板是从 scale(0.94) 弹到原位的，动画途中量到的是缩放后的宽度，差 6%
      this.measureStage()
      this._frameTimer = setTimeout(() => this.measureStage(), MODAL_ENTER_MS)
    })
  },

  onCloseFrame() {
    if (!this.data.frameMounted || !this.data.frameOn) return
    this.setData({ frameOn: false })
    // 先摘 --on 播完退场，延迟一下再摘 --mounted 落到 display:none
    this._frameTimer = setTimeout(() => this.setData({ frameMounted: false }), MODAL_LEAVE_MS)
  },

  onUnload() {
    if (this._frameTimer) clearTimeout(this._frameTimer)
  },

  /**
   * 量一次舞台的宽度，缓存起来。**只有拖动需要它** —— 手指走的是 px，而配置里存的是
   * 百分比，换算要一个真实的长度。舞台的高度由 CSS 撑（padding-bottom = 原图宽高比），
   * 所以量到宽度就够了，高度按 frame.pad 折算，不必两处分头算。
   *
   * 量不到（弹窗没开、或还没渲染出来）时静默跳过：`_stageW` 保持 0，
   * onFrameStart 会因此拒绝开始拖动 —— 宁可不响应，也好过用错误的宽度乱拖。
   */
  measureStage() {
    wx.createSelectorQuery()
      .select('.fx-stage')
      .boundingClientRect((r) => {
        if (r && r.width) this._stageW = r.width
      })
      .exec()
  },

  onFrameStart(e) {
    const t = e.touches && e.touches[0]
    if (!t || !this._stageW) return
    // 记住手指和小窗的起点，之后按位移量推窗子（而不是让窗子跳到手指下面 ——
    // 那样一按下去窗子就飞了）
    this._drag = {
      x: t.clientX,
      y: t.clientY,
      posX: this.data.cfg.imagePosX,
      posY: this.data.cfg.imagePosY
    }
  },

  onFrameMove(e) {
    const d = this._drag
    const f = this.data.frame
    const t = e.touches && e.touches[0]
    if (!d || !f || !t || !this._stageW) return

    // 窗子能走的行程 = 舞台里没被它占掉的那部分。某一轴上窗子已经占满
    // （横屏图调左右那种「拉不动」的情况）时行程是 0，除法得挡住
    const stageH = this._stageW * f.pad / 100
    const travelX = (100 - f.win.width) / 100 * this._stageW
    const travelY = (100 - f.win.height) / 100 * stageH
    const posX = travelX > 0 ? d.posX + (t.clientX - d.x) / travelX * 100 : d.posX
    const posY = travelY > 0 ? d.posY + (t.clientY - d.y) / travelY * 100 : d.posY

    // 拖动中只改界面，松手才落盘（和滑块一个规矩：拖一次几十个事件）
    this.dragApply(
      Object.assign({}, this.data.cfg, {
        imagePosX: Math.round(clamp(posX, 0, 100)),
        imagePosY: Math.round(clamp(posY, 0, 100))
      })
    )
  },

  onFrameEnd() {
    if (!this._drag) return
    this._drag = null
    this.persist(this.data.cfg)
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
        // 尺寸先清零：换图之后旧图的尺寸就不再成立了，取景必须重新算。
        // 新尺寸由紧随其后的 probeImageSize 补上（问的是文件所在的路径）
        this.persist(Object.assign({}, this.data.cfg, { image: r.savedFilePath, imageW: 0, imageH: 0 }))
        this.probeImageSize(this.data.cfg)
        // 换完再放旧的：先删万一保存失败，用户就两头空了。
        // 走 releaseImageFile 而不是直接删文件 —— 某个预设可能还存着这张图
        if (old && old !== r.savedFilePath) storage.releaseImageFile(old)
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
    // 尺寸跟着图一起清掉，免得留下的两个数字被下一张图误用
    this.persist(Object.assign({}, this.data.cfg, { image: '', imageW: 0, imageH: 0 }))
    // persist 之后才判得准还有没有别人用这张图（见 storage.releaseImageFile）
    storage.releaseImageFile(old)
  },

  // ---------------- 主题预设 ----------------

  /**
   * 存下来的配色预设，最多 3 个。
   *
   * 存在 settings 里（th:settings.themePresets），因为它必须能活过「进这一页」——
   * 预设的意义就是「下次不用重调」。存的是**快照**而不是「指向当前配置的引用」：
   * 存下来之后再改颜色，改的是当前配色，预设里那份不动，
   * 这正是「随时切回来」的前提。
   */
  loadPresets() {
    const presets = storage.getSettings().themePresets || []
    this.setData({ presets, activePresetId: matchPreset(presets, this.data.cfg) })
  },

  /** 把当前配色存成一个预设 */
  onSavePreset() {
    const list = this.data.presets || []
    if (list.length >= PRESET_MAX) {
      wx.showToast({ title: '最多存 ' + PRESET_MAX + ' 个预设', icon: 'none' })
      return
    }
    const preset = {
      id: storage.uid('p'),
      name: nextPresetName(list),
      cfg: pickPreset(this.data.cfg)
    }
    this.savePresets(list.concat([preset]))
    wx.showToast({ title: '已存为「' + preset.name + '」', icon: 'none' })
  },

  /**
   * 切到某个预设：配色和背景图一起换回去（预设存的就是整套）。
   *
   * 合并到当前配置上而不是整体替换 cfg：PRESET_KEYS 覆盖的正是用户能调的那些项，
   * 但 cfg 里还有别的字段（比如这一版之后新加的），整体替换会把它们抹掉。
   */
  onApplyPreset(e) {
    const p = this.findPreset(e.currentTarget.dataset.id)
    if (!p) return
    const old = this.data.cfg.image
    // 收掉展开的色板：换完整套颜色，某个色板还开着会指着一项已经变了的颜色
    this.setData({ activeField: '' })
    this.persist(Object.assign({}, this.data.cfg, p.cfg))
    // 换下来的那张图可能就没人用了（persist 之后才判得准，见 storage.releaseImageFile）
    if (old && old !== this.data.cfg.image) storage.releaseImageFile(old)
  },

  onDeletePreset(e) {
    const p = this.findPreset(e.currentTarget.dataset.id)
    if (!p) return
    // 和「恢复默认」一样恒定二次确认：预设是用户自己一点点调出来的，误删就得重调
    wx.showModal({
      title: '删除「' + p.name + '」？',
      content: '只删这个预设，当前正在用的配色和背景图都不受影响。',
      confirmText: '删除',
      confirmColor: '#FF5C5C',
      success: (res) => {
        if (!res.confirm) return
        // 先落盘再释放：这个预设不再引用它那张图了，之后才判得准还有没有别人用
        this.savePresets((this.data.presets || []).filter((x) => x.id !== p.id))
        storage.releaseImageFile(p.cfg.image)
      }
    })
  },

  findPreset(id) {
    return (this.data.presets || []).find((p) => p.id === id)
  },

  /**
   * 写回 settings 并刷新列表。
   * 「使用中」那一项要跟着重算 —— 存/删都会让这个判断的答案变。
   */
  savePresets(list) {
    storage.saveSettings({ themePresets: list })
    this.setData({ presets: list, activePresetId: matchPreset(list, this.data.cfg) })
  },

  /** 全部恢复成默认（深色那套），背景图也一并移除 */
  onReset() {
    wx.showModal({
      title: '恢复默认配色',
      content: '五个颜色、透明度都会回到默认值，背景图会被移除。存下来的预设不受影响。',
      confirmText: '恢复',
      success: (res) => {
        if (!res.confirm) return
        const old = this.data.cfg.image
        this.setData({ activeField: '' })
        this.persist(Object.assign({}, theme.DEFAULT_CUSTOM))
        // 顺序反了会误删：先落盘（当前配置不再用它了），再问一句还有没有别的持有者
        storage.releaseImageFile(old)
        wx.showToast({ title: '已恢复默认', icon: 'none' })
      }
    })
  },

  noop() {}
})

function clamp(n, lo, hi) {
  const v = Number(n)
  return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v))
}

/** 从一份完整配置里摘出预设要存的那几项（见 PRESET_KEYS） */
function pickPreset(cfg) {
  const c = cfg || {}
  const out = {}
  PRESET_KEYS.forEach((k) => {
    out[k] = c[k]
  })
  return out
}

/** 一份配色的指纹，只取预设真正存的那几项 —— 两边用同一个函数，比的时候不会各比各的 */
function presetSig(cfg) {
  const c = cfg || {}
  return PRESET_KEYS.map((k) => c[k]).join('|')
}

/**
 * 当前这套正好等于哪个预设（返回它的 id，都不等则空串），用来在列表里标「使用中」。
 *
 * 比的是**存进预设的那几项**（也就是 PRESET_KEYS 那些），不是整份 cfg：
 * cfg 里另有几项不属于用户能调的范围，拿整份去比会永远对不上。
 */
function matchPreset(presets, cfg) {
  const sig = presetSig(cfg)
  const hit = (presets || []).find((p) => presetSig(p.cfg) === sig)
  return hit ? hit.id : ''
}

/**
 * 给新预设起个不重名的名字：「预设 1」「预设 2」……取第一个还空着的编号。
 *
 * 不用「列表长度 + 1」：删掉中间那个之后新加的会和剩下的撞名，
 * 列表里出现两个「预设 2」，用户分不清哪个是哪个。
 */
function nextPresetName(list) {
  const used = {}
  ;(list || []).forEach((p) => {
    used[p.name] = true
  })
  for (let i = 1; i <= PRESET_MAX; i++) {
    const name = '预设 ' + i
    if (!used[name]) return name
  }
  // 理论上到不了（上限就是 PRESET_MAX 个），兜个底免得出现 undefined 名字
  return '预设 ' + ((list || []).length + 1)
}

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
