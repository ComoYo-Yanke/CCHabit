/**
 * 自定义主题的背景图那一层。
 *
 * 为什么是个组件：五张页面都要有它，复制五遍迟早漏一处；而且它只读主题、
 * 不参与任何页面逻辑，做成组件之后页面那边只需要把主题名传进来。
 *
 * 什么时候重读配置，一共三个口子，缺一个都会留下一种「图赖着不走」的情况：
 *   attached           —— 首访；
 *   pageLifetimes.show —— 复访。用户在「自定义主题」里换图 / 调模糊后返回，
 *                         这一页的名字没变（前后都是 custom），只有这条路径管得着；
 *   themeName 变化      —— 主题在**本页正显示着**的时候被改掉。
 *                         「我的」页是唯一能改主题的地方，改完不离开页面，
 *                         上面两条都不会触发；少了这条，把主题从自定义切到
 *                         跟随系统 / 深浅色时，背景图会继续盖在已经不透明的页面上。
 *
 * 它必须放在 `.page` 的**第一个子节点**，而且自己是 position: fixed：
 *   - 放在 .page 里面，才能跟着页面的淡出一起淡出（不然切页时背景图会留在原地）；
 *   - fixed 而不是 absolute，是为了让图不跟着内容滚（滚起来图不动才像「壁纸」）；
 *   - z-index: -1 把它压到内容之下。.page 自己不带背景色，所以它盖得住
 *     page 元素那层底色，又不会挡住任何内容。
 *   - 只有背景图存在时才渲染，没有图就整层不出现，零开销。
 */
const theme = require('../../utils/theme.js')

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  /**
   * 页面当前的主题名。**只用来当「该重新读一次配置了」的信号**，值本身不参与渲染 ——
   * 颜色仍由 CSS 变量负责，这里只需要知道「是不是还轮得到背景图出场」。
   *
   * 为什么非要有它：`attached` 和 `pageLifetimes.show` 只管得着「进页面」这一刻，
   * 而主题是能在页面**正显示着**的时候被改掉的 —— 「我的」页就是唯一能改它的地方。
   * 少了这个属性，在那页把主题从「自定义」切走，背景图会一直留在屏幕上
   * （`theme.background()` 明明已经返回 null 了，只是没人再去问它）。
   */
  properties: {
    themeName: { type: String, value: '' }
  },

  data: {
    src: '',
    /** <image> 的 mode。取景算得出几何时是 scaleToFill（盒子就是原图比例），未知时退回 aspectFill */
    mode: 'aspectFill',
    /** 图那一层的几何（尺寸 / 位置 / 模糊），由 utils/theme.js 的 bgLayer 算好 */
    imgStyle: '',
    scrim: ''
  },

  observers: {
    themeName() {
      this.sync()
    }
  },

  lifetimes: {
    attached() {
      this.sync()
    }
  },

  pageLifetimes: {
    // 复访：用户可能刚在「自定义主题」里换了图 / 调了模糊
    show() {
      this.sync()
    }
  },

  methods: {
    sync() {
      const bg = theme.background()
      if (!bg) {
        if (this.data.src) this.setData({ src: '', mode: 'aspectFill', imgStyle: '', scrim: '' })
        return
      }
      // 逐项比较：这个组件挂在每张页面上，onShow 每次都会走到这里，
      // 没有变化时不该产生任何渲染。
      // imgStyle 里带着尺寸和位移，所以这里比一次字符串就等于比了整套取景参数
      if (
        bg.src !== this.data.src ||
        bg.mode !== this.data.mode ||
        bg.style !== this.data.imgStyle ||
        bg.scrim !== this.data.scrim
      ) {
        this.setData({ src: bg.src, mode: bg.mode, imgStyle: bg.style, scrim: bg.scrim })
      }
    }
  }
})
