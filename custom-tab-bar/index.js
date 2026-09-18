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
 * ======================== 高亮只在页面 onShow 时变 ========================
 *
 * 点 tab 时**不**去改高亮。高亮的唯一来源是各页面 onShow 里的 setActive，
 * 也就是「哪一页真的显示出来了，高亮才落到哪一段」。好处有二：
 *   1. 高亮和页面状态天然一致 —— 不会出现「按钮切了、页面没切」这种两边打架的观感；
 *   2. 每个实例只在它自己那页可见时才被看到，而它记的高亮永远是本页那一段，
 *      离开后不会留下任何需要擦除的残留状态。
 * 切换那 140ms 的即时反馈由「页面淡出」本身给，不需要高亮先跳过去。
 *
 * 唯一需要操心的残留是「新实例的第一帧」：`selected` 初值是 0，第一次进「统计」
 * 会先画一帧「习惯」被选中。所以 attached 里按**当前路由**定初值。
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
    c: theme.tabbarVars(theme.vars('dark'))
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
    },

    detached() {
      // 组件销毁时把待执行的切换取消掉，免得对着已消失的底栏切页
      clearTimeout(this._switchTimer)
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

    /** 页面 onShow 调用：切换选中态 + 跟随当前主题 */
    setActive(index) {
      this.syncTheme()
      if (this.data.selected !== index) this.setData({ selected: index })
    },

    syncTheme() {
      const c = theme.tabbarVars(theme.vars(theme.current()))
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

      // 立刻开始淡出。这时不改高亮 —— 见文件头：高亮等新页面 onShow 时落位
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
