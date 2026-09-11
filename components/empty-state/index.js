/** 通用空状态占位 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    icon: { type: String, value: '🎯' },
    title: { type: String, value: '暂无数据' },
    desc: { type: String, value: '' },
    /** 主按钮文案，为空则不渲染按钮 */
    action: { type: String, value: '' },
    /** 次按钮文案 */
    subAction: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    },
    onSubAction() {
      this.triggerEvent('subaction')
    }
  }
})
