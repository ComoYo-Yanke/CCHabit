/**
 * 习惯编辑器（底部弹层）
 *
 * 同时承担「新建」与「编辑」两种模式：
 *   - 传入 habit 为空 => 新建
 *   - 传入 habit 对象 => 编辑（额外显示删除按钮）
 *
 * 提交时只抛出表单数据（submit 事件），由页面负责落库，
 * 组件不直接访问 storage，保证数据出入口唯一。
 */
const storage = require('../../utils/storage.js')

/** 新建时的默认表单 */
function emptyForm() {
  return {
    id: '',
    name: '',
    unit: '',
    icon: '🎯',
    color: storage.HABIT_COLORS[0],
    target: '',
    step: '1',
    enabled: true
  }
}

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    show: { type: Boolean, value: false },
    /** 传入已有习惯进入编辑模式 */
    habit: { type: Object, value: null }
  },

  data: {
    form: emptyForm(),
    isEdit: false,
    /** 自定义单位的输入框是否展开 */
    customUnit: false,
    /** 自定义图标的输入框是否展开（emoji / 字母 / 文字都走这里） */
    customIcon: false,
    icons: storage.ICON_PRESETS,
    colors: storage.HABIT_COLORS,
    units: storage.UNIT_PRESETS,
    nameError: ''
  },

  observers: {
    'show, habit': function (show, habit) {
      if (!show) return
      if (habit && habit.id) {
        this.setData({
          isEdit: true,
          nameError: '',
          customUnit: !!habit.unit && storage.UNIT_PRESETS.indexOf(habit.unit) < 0,
          // 图标不在预设里就是用户自己填的，把输入框直接展开，否则一进来
          // 会看不出图标是哪来的（格子里有值，但没有任何一个是选中态）
          customIcon: !!habit.icon && storage.ICON_PRESETS.indexOf(habit.icon) < 0,
          form: {
            id: habit.id,
            name: habit.name || '',
            unit: habit.unit || '',
            icon: habit.icon || '🎯',
            color: habit.color || storage.HABIT_COLORS[0],
            // 0 在表单里表示为空，避免用户看到无意义的 0
            target: habit.target ? String(habit.target) : '',
            step: String(habit.step || 1),
            enabled: habit.enabled !== false
          }
        })
      } else {
        this.setData({ isEdit: false, nameError: '', customUnit: false, customIcon: false, form: emptyForm() })
      }
    }
  },

  methods: {
    /** 阻止点击面板时冒泡到遮罩导致关闭 */
    noop() {},

    onClose() {
      this.triggerEvent('close')
    },

    /** 通用输入处理：data-field 指定写入哪个字段 */
    onInput(e) {
      const field = e.currentTarget.dataset.field
      const value = e.detail.value
      this.setData({ ['form.' + field]: value, nameError: field === 'name' ? '' : this.data.nameError })
    },

    /** 选中预设图标；选了预设就收起自定义输入框 */
    onPickIcon(e) {
      this.setData({ customIcon: false, 'form.icon': e.currentTarget.dataset.icon })
    },

    /** 切到自定义图标输入：清空让用户重新填 */
    onCustomIcon() {
      this.setData({ customIcon: true, 'form.icon': '' })
    },

    onPickColor(e) {
      this.setData({ 'form.color': e.currentTarget.dataset.color })
    },

    /** 选中预设单位；再次点击已选中的则取消 */
    onPickUnit(e) {
      const unit = e.currentTarget.dataset.unit
      this.setData({ customUnit: false, 'form.unit': this.data.form.unit === unit ? '' : unit })
    },

    /** 切到自定义单位输入 */
    onCustomUnit() {
      this.setData({ customUnit: true, 'form.unit': '' })
    },

    onToggleEnabled(e) {
      this.setData({ 'form.enabled': e.detail.value })
    },

    onSubmit() {
      const f = this.data.form
      const name = (f.name || '').trim()

      if (!name) {
        this.setData({ nameError: '请填写习惯名称' })
        return
      }
      if (name.length > 12) {
        this.setData({ nameError: '名称请控制在 12 个字以内' })
        return
      }

      // 目标与步长做数值归一：非法输入回落到默认值，避免 NaN 进入存储
      const target = Math.max(0, Number(f.target) || 0)
      const step = Math.max(0.01, Number(f.step) || 1)

      // 图标：自定义模式下用户可能什么都没填（或只敲了个空格），
      // 空图标在列表里就是一片空白，回落到默认的 🎯
      const icon = (f.icon || '').trim()

      this.triggerEvent('submit', {
        habit: {
          id: f.id || undefined,
          name,
          unit: (f.unit || '').trim().slice(0, 6),
          icon: icon || '🎯',
          color: f.color,
          target: Math.round(target * 100) / 100,
          step: Math.round(step * 100) / 100,
          enabled: f.enabled
        }
      })
    },

    onDelete() {
      const f = this.data.form
      if (!f.id) return
      this.triggerEvent('delete', { id: f.id, name: f.name })
    }
  }
})
