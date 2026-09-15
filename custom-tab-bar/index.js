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

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  data: {
    selected: 0,
    /** 只保留图标：文字去掉后胶囊矮了一截，见 index.wxss 顶部的高度构成 */
    list: [
      { pagePath: '/pages/index/index', icon: 'home' },
      { pagePath: '/pages/stats/stats', icon: 'chart' },
      { pagePath: '/pages/settings/settings', icon: 'user' }
    ],
    /** 行内样式用的色值，初值即深色，attach 后立刻按当前主题改写 */
    c: {
      bg: theme.vars('dark').tabbarBg,
      border: theme.vars('dark').tabbarBorder,
      active: theme.vars('dark').tabbarActiveBg
    }
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
      const v = theme.vars(theme.current())
      const c = { bg: v.tabbarBg, border: v.tabbarBorder, active: v.tabbarActiveBg }
      if (c.bg !== this.data.c.bg || c.border !== this.data.c.border || c.active !== this.data.c.active) {
        this.setData({ c })
      }
    },

    onTap(e) {
      this.commit(Number(e.currentTarget.dataset.index))
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
