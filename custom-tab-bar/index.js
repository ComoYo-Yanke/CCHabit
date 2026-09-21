/**
 * 自定义 tabBar —— 悬浮胶囊（图标为内联 SVG，无需图片资源）
 *
 * 切换逻辑就是最朴素的一条路：**点一下 → 淡出当前页 → switchTab**。
 * 没有任何「切得动 / 切不动」的前置判断之外的机关：没有忙标志、没有超时兜底、
 * 没有拖动状态机。这样每次点击都必然走到 switchTab，不存在被自家状态吞掉的点击。
 *
 * 为什么是 setActive 而不是直接 setData({selected})：
 * tabBar 由框架**独立挂载**，不在页面的节点树里，拿不到 page 上的 CSS 变量
 * （见 index.wxss 顶部注释），底色只能由 JS 用行内样式写。而每个 tab 页各有一个
 * 自己的 tabBar 实例，主题变了以后其它页面的实例并不会自己更新 ——
 * 所以把「选中项」和「配色」绑在同一个入口里：页面每次 onShow 都会调它，
 * 顺手就把主题同步了，不会出现「页面切浅色了、底栏还是黑的」。
 *
 * ======================== 高亮是一层不动的选中块 ========================
 *
 * 1.3.0 起，选中不是一个「各段自己的背景色」，而是胶囊里**独立的一层** .tab-pill，
 * 位置和宽度由 measure() 量出来写行内样式。
 *
 * ⚠️ **它是不会动的**：`.tab-pill` 上没有 transition，paint() 直接把目标格写下去。
 * 1.3.0 中途试过让它「滑过去」，三版都没做干净 —— 每个 tab 页各有一个 tabBar 实例，
 * 切页时老实例被整个丢掉，跨实例的动画必然在切页那一帧断掉；改成「滑完再切页」也只是
 * 把抽动摊长（见 CLAUDELOG）。**结论：不做移动效果**，选中块直接出现在目标段。
 * 别再加 transition / 别再加「先滑后切」的定时器，那是走过一遍的死路。
 *
 * 残留只需要操心「新实例的第一帧」：`selected` 初值是 0，第一次进「统计」会先画一帧
 * 「习惯」被选中。所以 attached 里按**当前路由**定初值。
 *
 * ============ 几何自己算，不假手页面 ============
 *
 * 模块作用域只有一份（三个实例共用），所以把 rects 放这儿：三段的几何，量一次长期有效
 * （位置只跟 padding 和图标宽度有关，跟选中哪一段无关 —— 选中块是绝对定位的，
 * 不参与 flex 布局，不会挤动别段）。新实例挂载时直接复用，不必重量。
 *
 * 页面那边只负责「告诉它该选中哪一段」（setActive），位置一概不问页面要。
 */
const theme = require('../utils/theme.js')
const pageFade = require('../utils/page-fade.js')
const storage = require('../utils/storage.js')

/**
 * 手滑容差（px，`clientX/Y` 就是 px）：起点到终点在这之内才算「点」。
 * 取 12 是「手指大致没动」的量级 —— 页面本身滑一下远不止这点距离。
 */
const TAP_SLOP = 12

/**
 * 三段 tab。提到模块级是因为**图标表也要由它生成** ——
 * data 的字面量里引用不到自己的 list，而初始那份配色得在 attach 之前就备好。
 */
const TABS = [
  { pagePath: '/pages/index/index', icon: 'home' },
  { pagePath: '/pages/stats/stats', icon: 'chart' },
  { pagePath: '/pages/settings/settings', icon: 'user' }
]

/*
 * 模块级：三个实例共用一份（理由见文件头）。
 */
/** 三段 tab 的几何（px，相对胶囊左边缘），量一次长期有效 */
let rects = null

/*
 * 配色也是模块级的，理由和几何一样：切页时新实例一上来就该有正确的配色。
 * 不缓存的话，每个新实例的 attached 都会把六枚内联 SVG 重新 setData 一遍 ——
 * 那一次 setData 正好落在切换的那一帧上，是「每次切都顿一下」的另一半原因。
 * 按主题名缓存：同一套主题下 tabbarVars 是纯函数，结果可以长期复用。
 */
let themeCache = null
function tabbarVars() {
  const key = theme.current()
  if (!themeCache || themeCache.key !== key) {
    themeCache = { key, c: theme.tabbarVars(theme.vars(key)) }
  }
  return themeCache.c
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  data: {
    selected: 0,
    /** 只保留图标：文字去掉后胶囊矮了一截，见 index.wxss 顶部的高度构成 */
    list: TABS,
    /**
     * 行内样式要用的全部值，初值即深色，attach 后立刻按当前主题改写。
     * 里面连图标都是现拼的内联 SVG —— 底栏拿不到 CSS 变量，图标颜色也只能走 JS
     * （见 utils/theme.js 的 tabbarVars）。
     */
    c: tabbarVars(),
    /**
     * 选中块的几何（px，相对胶囊左边缘）。
     * ready 为 false 时不渲染 —— 位置还没量出来，先画会看到它在最左边闪一下。
     */
    pill: { left: 0, width: 0, ready: false }
  },

  lifetimes: {
    attached() {
      this.syncTheme()
      // 按当前路由定初值，避免第一帧把高亮画在第一段上。
      // onShow 有可能先于 attached 跑过（框架在部分机型 / 版本上就是这个顺序），
      // 那样 selected 已经是对的，不覆盖
      if (this.data.selected === 0) {
        const i = this.routeIndex()
        if (i > 0) this.setData({ selected: i })
      }
      // 几何已经在手上（模块级缓存）就**立刻**画出来，不等异步测量 ——
      // 等的话，切页后头几帧胶囊里是空的，选中块要闪一下才出现
      if (rects) this.paint(this.data.selected)
      // 仍然量一次：换机型 / 横竖屏时几何会变（见 measure）
      wx.nextTick(() => this.measure())
    },

    detached() {
      // 组件销毁时把待执行的切换取消掉，免得对着已消失的底栏切页
      clearTimeout(this._switchTimer)
    }
  },

  /**
   * 页面重新显示时补量一次几何。
   *
   * 从别的页面（详情 / 主题编辑那些非 tab 页）退回来时，底栏可能刚被框架重新挂载，
   * 那一帧还没布局 —— attached 里的第一次量测会量到一堆 0，被 measure 丢掉，
   * 选中块就再也不出现了。放在这里量，那时布局一定已经落定。
   * 量到的跟缓存的几何一样就什么都不做（paint 自己会跳过），所以这不算额外开销。
   */
  pageLifetimes: {
    show() {
      wx.nextTick(() => this.measure())
    }
  },

  methods: {
    /**
     * 当前页面在 list 里的下标 —— **现读** `getCurrentPages()`，不走任何缓存。
     * 认不出来时返回 -1（不是 0）：调用方据此区分「就在这一页」和「不知道在哪一页」，
     * 后者必须当作「不一样」去切，绝不能误判成「已经在这一页了」。
     */
    routeIndex() {
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      const route = cur && cur.route ? '/' + cur.route : ''
      return this.data.list.map((t) => t.pagePath).indexOf(route)
    },

    /** 栈顶页面，也就是这个实例所属的那一页 */
    currentPage() {
      const pages = getCurrentPages()
      return pages[pages.length - 1]
    },

    /**
     * 页面 onShow 调用：切换选中态 + 跟随当前主题。
     * 页面**只给「该选中哪一段」这一条信息**，滑块怎么挪由下面自己定。
     */
    setActive(index) {
      this.syncTheme()
      if (this.data.selected !== index) this.setData({ selected: index })
      this.paint(index)
    },

    /**
     * 量出三段 tab 相对胶囊左边缘的位置与宽度，存进**模块级**的 rects。
     *
     * 量一次就够，而且量到的结果三个实例共用：位置只跟 padding 和图标宽度有关，
     * 跟「选中哪一段」无关（滑块是绝对定位的，不参与 flex 布局，选中态不会挤动别段），
     * 也不跟页面走。所以新实例不必重量，直接把上一次的滑块接过来。
     *
     * 真正第一次量（rects 还是 null）时不做动画：那时没有「上一段」可言，
     * 冷启动直接落位，否则从深链直接进「统计」页会先看到它从「习惯」滑过来。
     */
    measure() {
      this.createSelectorQuery()
        .select('.tabbar')
        .boundingClientRect()
        .selectAll('.tab')
        .boundingClientRect()
        .exec((res) => {
          const bar = res && res[0]
          const tabs = (res && res[1]) || []
          if (!bar || !tabs.length) return
          const next = tabs.map((t) => ({ left: t.left - bar.left, width: t.width }))
          /*
           * ⚠️ 量到 0 宽就**整批丢掉**：从别的页面退回来时底栏是重新挂载的，
           * 这一帧还没布局，量出来全是 0。照着画就是「选中块没了、胶囊最左边多一条线」
           * —— width: 0 的方块只剩那 1rpx 描边。
           * 缓存里有上一次的有效几何就继续用（三段的相对位置没变过）；
           * 一次都没有（冷启动第一帧）就下一帧再来一次，最多三次。
           */
          if (!bar.width || next.some((r) => !r.width)) {
            const tries = this._measureTries || 0
            if (!rects && tries < 3) {
              this._measureTries = tries + 1
              wx.nextTick(() => this.measure())
            }
            return
          }
          this._measureTries = 0
          rects = next
          this.paint(this.data.selected)
        })
    },

    /**
     * 把选中块**直接**放到第 index 段 —— 没有任何动画（见文件头）。
     * 已经在那一格就什么都不做：页面 onShow 会重复调它。
     */
    paint(index) {
      const to = rects && rects[index]
      // 0 宽的量测结果等同于没量到（见 measure），绝不能拿去画
      if (!to || !to.width) return
      const cur = this.data.pill
      if (cur.ready && cur.left === to.left && cur.width === to.width) return
      this.setData({ pill: { left: to.left, width: to.width, ready: true } })
    },

    syncTheme() {
      // 走模块级缓存：同一套主题下拿到的是**同一个对象**，下面的指纹比对必然相等，
      // 于是每个新实例都不必再 setData 一次（见文件头）
      const c = tabbarVars()
      const prev = this.data.c
      // 拿「三个色值 + 一枚图标的两种状态」当指纹就够了，不必逐枚比对六个长 data URI。
      // ⚠️ 但不能只比那三个色值：图标是从 tabbarIcon / tabbarIconActive 单独拼的，
      // 自定义主题里「次要文字色」只改图标、完全不参与 bg / border / active 的计算，
      // 少比这一项就会出现「文字色改了、底栏图标没跟上」。
      if (
        c.bg !== prev.bg ||
        c.border !== prev.border ||
        c.active !== prev.active ||
        // accent 是那枚「新建习惯」圆钮的实心底色，和上面三个色值各走各的计算
        // （它取的就是 --accent 本身）。漏比这一项，「改主色 → 胶囊里圆钮不变色」
        c.accent !== prev.accent ||
        // shadow 按**底色**的亮度算，而 bg 是「卡片色」调出来的，两者不是一回事：
        // 只改底色不改卡片色时，上面的 bg 比不出来，影子会留在旧的那一套
        c.shadow !== prev.shadow ||
        // 滑块的高光 / 描边是另外算的（也按底色亮度分两套），漏比就会出现
        // 「底色换了、滑块还是旧的那圈边」
        c.pillBorder !== prev.pillBorder ||
        c.pillShadow !== prev.pillShadow ||
        c.icons.home.idle !== prev.icons.home.idle ||
        c.icons.home.on !== prev.icons.home.on
      ) {
        this.setData({ c })
      }
    },

    /**
     * 点击的判定**不看 `tap`，看 `touchend`** —— 这是「滑动过页面之后底栏点不动」的修复。
     *
     * `tap` 是框架在 touchend 之后二次加工出来的事件：它带一个「手指基本没动、
     * 时间不太长」的判定。页面刚被滑动过（WebView 还在收尾 / 橡皮筋回弹）时，
     * 这一层判定会把点击吃掉，于是要点好几次才生效。touchend 是原始触摸事件，
     * 一定会送到，所以把判定握在自己手里：起点记下来，终点在容差内就当点击。
     *
     * `tap` 仍然保留作兜底（哪个先到都能用），靠 _touchHandled 去重，
     * 否则一次点击会切两次、震两下。
     */
    onTouchStart(e) {
      const t = e.touches && e.touches[0]
      this._start = t ? { x: t.clientX, y: t.clientY } : null
      this._touchHandled = false
    },

    onTouchEnd(e) {
      const start = this._start
      this._start = null
      const t = e.changedTouches && e.changedTouches[0]
      if (start && t && (Math.abs(t.clientX - start.x) > TAP_SLOP || Math.abs(t.clientY - start.y) > TAP_SLOP)) {
        // 手指明显移动过：当成滑动，不切页
        return
      }
      this._touchHandled = true
      this.dispatch(e.currentTarget.dataset)
    },

    onTap(e) {
      // touchend 已经处理过就不重复切
      if (this._touchHandled) {
        this._touchHandled = false
        return
      }
      this.dispatch(e.currentTarget.dataset)
    },

    /**
     * 一次点击落到哪儿。胶囊里现在有两类目标：三个 tab（data-index）和
     * 「新建习惯」圆钮（data-act="add"），它们**共用上面那一套 touchend 判定** ——
     * 「页面滑动过之后底栏点不动」那个坑对 + 号一模一样成立，它就在同一个胶囊里，
     * 而且创建习惯本来就是个低频动作，点两次没反应更容易被当成坏了。
     */
    dispatch(ds) {
      if (ds.act === 'add') this.onAdd()
      else this.commit(Number(ds.index))
    },

    /**
     * 胶囊里的「新建习惯」圆钮（在「主页」左边）。
     *
     * 它从首页右下角那个悬浮按钮搬过来，配色也照搬：实心主色（c.accent，
     * 见 utils/theme.js 的 tabbarVars）。搬家的理由：创建习惯是全应用的动作，
     * 不该只贴在首页上；而且底部这个位置拇指够得着。
     */
    onAdd() {
      this.vibrate()

      // 已经在首页：**直接**调页面的 onAddHabit 开弹层。
      // 这里绝不能图省事走 switchTab —— 切到当前 tab 框架不会重跑首页的 onShow，
      // 那个 pending 标记就会一直躺在全局里，等用户哪天切到别的 tab 再回来时
      // 突然自己弹出新建弹层。
      if (this.routeIndex() === 0) {
        const page = this.currentPage()
        if (page && typeof page.onAddHabit === 'function') page.onAddHabit()
        return
      }

      // 在别的 tab 上：走「我的 / 统计」页里那个按钮的同一条路 ——
      // 打全局标记，首页 onShow 时消费掉、把弹层弹出来
      getApp().requestNewHabit()
      pageFade.leave(this.currentPage())
      clearTimeout(this._switchTimer)
      this._switchTimer = setTimeout(() => {
        this._switchTimer = null
        wx.switchTab({ url: this.data.list[0].pagePath })
      }, pageFade.LEAVE_MS)
    },

    /** 只用来吞掉 touchmove：底栏自己不滚动，拖动不该漏到底下的页面 */
    noop() {},

    /** 点击反馈：和打卡那两处共用「震动反馈」开关（见 README 决策 31） */
    vibrate() {
      if (!storage.getSettings().haptic) return
      wx.vibrateShort({ type: 'light', fail: () => {} })
    },

    /**
     * 切页：先让当前页淡出，140ms 后再 switchTab（时长与 app.wxss 的 .page--out 一致）。
     *
     * 判据是**现读**的当前路由，不是任何缓存。缓存和现实脱节一次就会永久判成
     * 「已经在这一页了」，此后再点这个 tab 都没反应 —— 那正是「点了切换、下方按钮
     * 也变了、页面却没切换」。现读的判据永远等于现实，脱节最多影响一次点击。
     * 认不出路由（-1）时当作「不一样」去切：未知绝不能算作「已经在这一页」。
     *
     * 连点两次由「后一次说了算」处理：重设定时器即可，没有忙标志所以不会锁死。
     */
    commit(index) {
      const live = this.routeIndex()

      if (live >= 0 && index === live) {
        // 点的就是本页：撤销还没执行的切换（可能刚点了别的 tab 又点回来），
        // 并把淡出到一半的页面拉回来
        clearTimeout(this._switchTimer)
        this._switchTimer = null
        pageFade.enter(this.currentPage())
        return
      }

      // 点击反馈：只在实际要切页时震，点的是本页那一下不震
      this.vibrate()

      // 选中块**在这里**就挪过去（不带动画，直接出现在目标段，理由见文件头）
      this.setActive(index)

      // 立刻开始淡出；淡完（LEAVE_MS）才真的切页
      pageFade.leave(this.currentPage())

      // 后一次点击说了算：重设定时器，上一次待执行的切换作废。
      // 不用忙标志 / 超时兜底那一套：定时器一定会到期，switchTab 一定会被调到
      clearTimeout(this._switchTimer)
      this._switchTimer = setTimeout(() => {
        this._switchTimer = null
        wx.switchTab({ url: this.data.list[index].pagePath })
      }, pageFade.LEAVE_MS)
    }
  }
})
