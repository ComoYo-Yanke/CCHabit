/**
 * uCharts 图表封装组件（Canvas 2D 版）
 *
 * 对外只暴露「图表类型 + {categories, series} 数据 + 少量样式覆盖」，
 * 内部负责：查询 canvas 节点、按 devicePixelRatio 设置物理分辨率、
 * 合并暗色主题默认配置、触摸事件转坐标调用 showToolTip。
 *
 * 数据格式（与 uCharts 官方一致，由 utils/stats.js 的
 * lineChartData / barChartData 生成）：
 *   {
 *     categories: ['2026-09-01', '2026-09-02', ...],
 *     series: [{ name: '数值', color: '#5B8CFF', data: [1, 2, 3] }]
 *   }
 */
import uCharts from '../../lib/ucharts/u-charts.js'

// 配置装配单独成模块（CJS 导出），这样 scripts/test-charts.js 能直接 require 到同一份默认值
const { buildChartOpts } = require('./opts.js')

/** canvas 节点查询失败后的重试间隔与次数 */
const INIT_RETRY_DELAY = 60
const MAX_INIT_RETRY = 5

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /** 图表类型：line / area / column / bar / ring / pie ... */
    type: { type: String, value: 'line' },
    /** uCharts 数据 { categories, series } */
    chartData: { type: Object, value: null },
    /** 覆盖默认配置 */
    opts: { type: Object, value: null },
    canvasId: { type: String, value: 'chartCanvas' },
    /** CSS 高度（rpx），宽度自适应容器 */
    height: { type: Number, value: 460 },
    /** 是否开启触摸提示 */
    touch: { type: Boolean, value: true },
    /** 提示框数值单位后缀 */
    unit: { type: String, value: '' },
    /**
     * 上层有弹层/遮罩时置 true —— 让图表整个不渲染。
     *
     * canvas 是**原生组件**：即使写了 type="2d"（同层渲染），在没有启用同层渲染的
     * 环境里它由客户端原生控件绘制，层级天然高于 WebView 里的所有普通组件，
     * z-index / position 一律作用不到它。结果就是「弹层打开了，图表还浮在最上面」。
     *
     * 官方给的解法只有两条：用 cover-view 盖（能力残缺，且不支持 background-image /
     * SVG / base64，本项目的图标全是 base64 SVG，用不了），或者**让它不渲染**。
     * 这里走第二条：display:none 之后原生控件不存在，也就谈不上盖住谁，
     * 在任何基础库、任何平台（含开发者工具）上都成立。
     */
    hidden: { type: Boolean, value: false }
  },

  data: {
    /** 无数据时展示占位文案，避免画布空白 */
    hasData: false,
    ready: false
  },

  observers: {
    'chartData, opts, type': function () {
      // 数据变化时重绘。
      // 若 this.chart 还不存在，说明 ready 阶段的节点查询没拿到 canvas
      // （组件当时被 wx:if 挡着、或首个 setData 早于布局完成），
      // 这里必须重新查一次节点，否则图表会一直空着 —— 只更新 hasData 是不够的。
      if (this.chart) this.render()
      else this.initCanvas()
    },

    'hidden': function (hidden) {
      // 重新显示时必须重建，不能只 render()：
      // display:none 期间 canvas 节点量出来的宽高是 0，后备缓冲也被重置过，
      // 直接重绘等于往一个 0×0 的画布上画，图表会一片空白。
      if (!hidden) this.initCanvas()
    }
  },

  lifetimes: {
    ready() {
      this.initCanvas()
    },
    detached() {
      // 停止未完成的入场动画，避免组件销毁后仍持有旧的绘图上下文
      if (this.chart) this.chart.stopAnimation()
      this.chart = null
      this._size = null
    }
  },

  methods: {
    buildOpts(runtime) {
      return buildChartOpts(this.data.opts, runtime)
    },

    /** 是否已有可绘制的数据（纯判断，不依赖 setData 的时序） */
    hasChartData() {
      const d = this.data.chartData
      return !!(d && d.series && d.series.length && d.series[0].data && d.series[0].data.length)
    },

    updateHasData() {
      const has = this.hasChartData()
      if (has !== this.data.hasData) this.setData({ hasData: has })
    },

    /**
     * 查询 canvas 节点、设置物理分辨率、实例化 uCharts。
     *
     * 节点没查到时会在若干帧后自动重试：组件在 wx:if 里被首次创建时，
     * ready 有可能早于布局完成，此时 select 拿到的是 null。
     * 单次失败就放弃的话，图表会永久空白。
     */
    initCanvas(retry) {
      if (this._pending) return

      // 被遮住期间不查节点：display:none 下量出来的宽高是 0，
      // 查询必然失败并触发重试，白白刷一串警告。等 hidden 变回 false 时再走一遍
      // （hidden 的 observer 会调本方法）。
      if (this.data.hidden) return

      this.updateHasData()

      // 没有数据就不建实例。
      // uCharts 的构造函数会立刻跑一遍 drawCharts()，其中第一句是
      // `var series = opts.series`，紧接着 fillSeries() 就取 series.length。
      // 构造时不给 series（哪怕后面 updateData 会给），这里就是
      // TypeError: Cannot read property 'length' of undefined —— 图表直接空白。
      // 数据到位后 observers 会再调一次本方法，那时才真正创建。
      if (!this.hasChartData()) return

      const attempt = retry || 0

      wx.createSelectorQuery()
        .in(this)
        .select('#' + this.data.canvasId)
        .fields({ node: true, size: true, rect: true })
        .exec((res) => {
          const info = res && res[0]
          if (!info || !info.node) {
            if (attempt >= MAX_INIT_RETRY) {
              console.warn('[qiun-charts] 重试 ' + attempt + ' 次仍未获取到 canvas 节点：' + this.data.canvasId)
              return
            }
            // 排队重试期间不再重复发起，避免数据频繁变更时堆积查询
            this._pending = true
            setTimeout(() => {
              this._pending = false
              this.initCanvas(attempt + 1)
            }, INIT_RETRY_DELAY)
            return
          }

          // 尺寸没量出来（宽为 0）同样重试，否则会建出一个 0 宽的图表
          const width = info.width || wx.getWindowInfo().windowWidth
          if (!width && attempt < MAX_INIT_RETRY) {
            this._pending = true
            setTimeout(() => {
              this._pending = false
              this.initCanvas(attempt + 1)
            }, INIT_RETRY_DELAY)
            return
          }

          const canvas = info.node

          // 用组件自身的 CSS 高度（rpx -> px）而不是节点高度，
          // 因为元素高度由 style 决定，避免首帧高度为 0 导致图表被压扁
          const height = this.rpx2px(this.data.height)

          this._rect = { left: info.left || 0, top: info.top || 0 }

          const dpr = wx.getWindowInfo().pixelRatio || 1
          canvas.width = width * dpr
          canvas.height = height * dpr

          const ctx = canvas.getContext('2d')
          this._size = { width, height, dpr }
          const size = this.chartSize()
          // 构造时必须带上当前数据：drawCharts 在构造函数里就会执行一次，
          // 少了 categories / series 会直接抛错（见上面的注释）
          const d = this.data.chartData || { categories: [], series: [] }
          // 重建前先停掉旧实例的入场动画：hidden 切换会走到这里，
          // 不停的话旧实例的 setTimeout 回调会继续对着已经被重置的画布绘制
          if (this.chart) {
            this.chart.stopAnimation()
            this.chart = null
          }
          try {
            this.chart = new uCharts(
              this.buildOpts({
                type: this.data.type,
                context: ctx,
                canvas2d: true,
                pixelRatio: dpr,
                width: size.width,
                height: size.height,
                rotate: false,
                enableScroll: false,
                categories: d.categories || [],
                series: d.series || []
              })
            )
          } catch (err) {
            // 配置写错（例如漏了 extra.column）时 uCharts 会在构造函数或首个动画帧里抛错，
            // 这里显式记下来，避免表现成「图表莫名其妙空白」
            console.error('[qiun-charts] 初始化图表失败', err)
            return
          }
          this.setData({ ready: true })
          this.render()
        })
    },

    rpx2px(rpx) {
      return (rpx / 750) * (wx.getWindowInfo().windowWidth || 375)
    },

    /**
     * uCharts 的坐标系是 **canvas 后备缓冲的像素**（= 逻辑 px × dpr），不是 CSS 逻辑 px。
     *
     * 依据在 uCharts 自己的取点函数里：
     *     getTouches() -> x = touches.x * opts.pix
     * 触点坐标是逻辑 px，乘完 pix 才拿去和图形比较；而 area / 字号在内部
     * 也都是 `padding[j] * opts.pix`、`fontSize * opts.pix`。也就是说它把
     * width / height 和 area / 字号当成同一个量纲，只有 width 也传设备 px，
     * 这套算式才自洽。
     *
     * 传逻辑宽会怎样：图形只铺满画布左上角 1/dpr（dpr=3 时就是左上九分之一），
     * 字号相对绘图区大 dpr 倍 —— 表现为「图表挤在左上角一小块 + 轴标签全糊在一起」。
     * 触摸也会失灵：触点乘过 pix 落在设备 px 空间，而图形只占这个空间的前 1/dpr。
     */
    chartSize() {
      const s = this._size
      return { width: s.width * s.dpr, height: s.height * s.dpr }
    },

    /**
     * 合并配置后重绘。
     * updateData 内部是 `assign({}, this.opts, data)`（顶层浅合并）并触发重绘，
     * 因此这里要把 categories / series 以及尺寸一并带上。
     */
    render() {
      if (!this.chart || !this._size) return
      this.updateHasData()

      // 空数据直接清屏并返回：uCharts 在 categories 为空时算出的间距是 Infinity，
      // 会画出一堆 NaN 坐标的点，既不美观也可能抛错
      if (!this.data.hasData) {
        this.chart.context.clearRect(0, 0, this._size.width * this._size.dpr, this._size.height * this._size.dpr)
        return
      }

      const d = this.data.chartData || { categories: [], series: [] }
      const size = this.chartSize()
      const chartOpts = this.buildOpts({
        type: this.data.type,
        canvas2d: true,
        pixelRatio: this._size.dpr,
        width: size.width,
        height: size.height,
        rotate: false,
        enableScroll: false,
        categories: d.categories || [],
        series: d.series || []
      })
      // context 必须沿用首次创建的绘图上下文，不能被 mergeDeep 产生的副本覆盖，
      // 否则 uCharts 会对着一个没有绑定 canvas 的上下文绘制（图表全白）
      chartOpts.context = this.chart.opts.context
      this.chart.updateData(chartOpts)
    },

    // ------------------------------------------------------------------
    // 触摸：把事件坐标归一化成 {x, y}（画布内坐标），
    // 直接传给 uCharts；之所以不传原始事件，是因为 uCharts 的 getTouches
    // 在检测到 clientX 时会走 pageY - offsetTop 的分支，在自定义导航栏
    // + 滚动容器里 offsetTop 并不等于页面偏移，会导致提示框错位。
    // ------------------------------------------------------------------
    normalizeTouch(e) {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
      if (!t) return null
      let x = t.x
      let y = t.y
      if (typeof x !== 'number' && typeof t.clientX === 'number') {
        // 兜底：用初始化时缓存的画布位置换算
        x = t.clientX - (this._rect ? this._rect.left : 0)
        y = t.clientY - (this._rect ? this._rect.top : 0)
      }
      if (typeof x !== 'number' || typeof y !== 'number') return null
      return { changedTouches: [{ x, y, identifier: t.identifier || 0 }] }
    },

    onTouchStart(e) {
      if (!this.chart || !this.data.touch || !this.data.hasData) return
      const ev = this.normalizeTouch(e)
      if (!ev) return
      this.chart.touchLegend(ev)
      this.showTip(ev)
    },

    onTouchMove(e) {
      if (!this.chart || !this.data.touch || !this.data.hasData) return
      const ev = this.normalizeTouch(e)
      if (!ev) return
      this.showTip(ev)
    },

    onTouchEnd() {
      // 未开启滚动（enableScroll: false）时无需 scrollEnd
    },

    showTip(ev) {
      if (!this.data.hasData) return
      const unit = this.data.unit || ''
      this.chart.showToolTip(ev, {
        // 提示框文案：`分类名` + `系列名: 数值单位`
        formatter: (item) => {
          if (!item || !item.name) return ''
          return item.name + ' : ' + item.data + unit
        }
      })
    },

    /** 供页面主动调用：重新查询尺寸并重绘（例如从隐藏状态切回） */
    refresh() {
      if (!this.chart) return this.initCanvas()
      this.render()
      return null
    }
  }
})
