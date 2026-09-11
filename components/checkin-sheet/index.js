/**
 * 打卡弹层
 *
 * 负责单个习惯在**当天**的打卡操作：
 *   - 填写数值 / 备注，支持同一天重复打卡（多条记录）
 *   - 支持修改、删除当天已存在的记录
 *
 * 日期不可切换：打卡只能记在当天。改过去的数据等于伪造历史，未来更是无从谈起。
 * 过去的日子仍可从日历 / 热力图 / 历史记录点进来，但那样进来时 `readonly` 为 true ——
 * 录入区整块不渲染，记录只能看，底部按钮变成「关闭」。
 *
 * 只读不是靠界面藏几个按钮撑着的：所有写入口（提交 / 改记录 / 删记录）
 * 在方法开头都有一道 `if (this.data.readonly) return`。界面是提示，这道判断才是约束。
 *
 * 组件内部直接读写 storage（打卡是高频操作，避免每次都由页面透传数据），
 * 每次变更后抛出 `change` 事件，由页面重新汇总统计。
 */
const storage = require('../../utils/storage.js')
const dayjs = require('../../utils/date.js')

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    show: { type: Boolean, value: false },
    habit: { type: Object, value: null },
    /**
     * 要查看/打卡的日期，留空则用今天。
     * 传过去的日子进来就是只读回看（见文件头注释），传未来日子会被夹回今天。
     */
    date: { type: String, value: '' }
  },

  data: {
    activeDate: '',
    dateLabel: '',
    /** true = 这一天不是今天，整个弹层只读 */
    readonly: false,
    value: '',
    note: '',
    noteOpen: false,
    records: [],
    dayCount: 0,
    dayTotal: 0,
    dayTotalText: '0',
    /** 非空表示正在修改某条记录，提交时走更新逻辑 */
    editingId: '',
    quickList: [],
    /** { [档位值]: true } —— 供 WXML 判断快捷按钮选中态，避免在模板里做数值比较 */
    isQuickOn: {},
    progress: 0,
    progressText: ''
  },

  observers: {
    'show, habit, date': function (show, habit, date) {
      if (!show || !habit) return
      // 未来的日期一律夹回今天：只读还能说是「回看」，看未来就是纯粹的错误状态
      this.setData(
        {
          activeDate: this.normalizeDate(date),
          editingId: '',
          value: '',
          note: '',
          noteOpen: false,
          quickList: this.buildQuickList(habit)
        },
        () => this.refresh()
      )
    }
  },

  methods: {
    /** 快捷按钮：按步长生成本次打卡的常用数值档位 */
    buildQuickList(habit) {
      const step = Number(habit.step) || 1
      const target = Number(habit.target) || 0
      const list = [step, step * 2, step * 5]
      // 设了目标值就把目标档位也放进来，方便「一次打满」
      if (target > 0 && list.indexOf(target) < 0) list.push(target)
      return list
        .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
        .slice(0, 4)
        .map((v) => ({ value: v, label: '+' + trimNum(v) }))
    },

    /**
     * 把外部传进来的日期收敛成合法值：
     * 非法格式 / 空 -> 今天；未来日期 -> 今天；过去日期原样保留（只读回看用）。
     */
    normalizeDate(date) {
      const t = dayjs.today()
      if (!date || !dayjs.isValidDateStr(date)) return t
      return dayjs.diffDays(t, date) > 0 ? t : date
    },

    /** 重新读取当天记录并刷新汇总 */
    refresh() {
      const { habit, activeDate } = this.data
      if (!habit || !habit.id) return

      const readonly = activeDate !== dayjs.today()
      const records = storage.getRecords(habit.id).filter((r) => r.d === activeDate)
      let total = 0
      records.forEach((r) => {
        total += Number(r.v) || 0
      })

      const target = Number(habit.target) || 0
      const progress = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0

      // 快捷档位的选中态跟着当前输入值走，刷新时一并重算，
      // 这样清空/切日期/编辑记录等入口都不需要各自维护它
      const isQuickOn = {}
      const curValue = this.data.value
      this.data.quickList.forEach((q) => {
        if (trimNum(q.value) === curValue) isQuickOn[q.value] = true
      })

      this.setData({
        readonly,
        // 只读时顺手把录入态清干净：从今天点开某条记录进入修改模式、
        // 再切到过去的日子，残留的 editingId / value 会让「今天」那一屏回来时是脏的
        editingId: readonly ? '' : this.data.editingId,
        noteOpen: readonly ? false : this.data.noteOpen,
        isQuickOn,
        records: records.map((r) => ({
          id: r.id,
          value: trimNum(r.v),
          unit: habit.unit || '',
          time: fmtTime(r.t),
          note: r.n || '',
          raw: r.v
        })),
        dayCount: records.length,
        dayTotal: total,
        dayTotalText: trimNum(total),
        dateLabel: dayjs.friendlyLabel(activeDate),
        progress,
        progressText: target > 0 ? trimNum(total) + ' / ' + trimNum(target) + (habit.unit || '') : ''
      })
    },

    onClose() {
      this.triggerEvent('close')
    },

    noop() {},

    /**
     * 只读守卫：所有写操作的第一道闸，返回 true 表示这次操作被拦下了。
     *
     * 这里不看 data.readonly，而是重新和时钟比一次。两者在正常路径上等价，
     * 但弹层开着不动、日期跨过零点时，data.readonly 还是打开那一刻算出来的旧值，
     * 拿它做判断就会把新的一天的记录写到昨天去。
     */
    blockedByReadonly() {
      if (this.data.activeDate === dayjs.today()) return false
      wx.showToast({ title: '只能打卡当天', icon: 'none' })
      return true
    },

    // ---------------- 数值输入 ----------------

    /** 统一写 value 并同步快捷按钮的选中态 */
    setValue(value) {
      const isQuickOn = {}
      this.data.quickList.forEach((q) => {
        if (trimNum(q.value) === value) isQuickOn[q.value] = true
      })
      this.setData({ value, isQuickOn })
    },

    onValueInput(e) {
      this.setValue(e.detail.value)
    },

    /** 快捷档位：直接设定数值（再次点击同一个档位取消选择） */
    onQuickPick(e) {
      const v = e.currentTarget.dataset.value
      const str = trimNum(v)
      this.setValue(this.data.value === str ? '' : str)
    },

    /** 把当前输入值追加到已有数值上（连续录入场景） */
    onAppendStep(e) {
      const step = Number(e.currentTarget.dataset.step) || 1
      const cur = Number(this.data.value) || 0
      this.setValue(trimNum(cur + step))
    },

    onToggleNote() {
      this.setData({ noteOpen: !this.data.noteOpen })
    },

    onNoteInput(e) {
      this.setData({ note: e.detail.value })
    },

    // ---------------- 提交 ----------------
    onSubmit() {
      const { habit, activeDate, value, note, editingId } = this.data
      if (!habit || !habit.id) return
      if (this.blockedByReadonly()) return

      // 未填数值时按「1 次」计，支持纯计数类习惯一键打卡
      const num = value === '' ? 1 : Number(value)
      if (isNaN(num) || num <= 0) {
        wx.showToast({ title: '请输入大于 0 的数值', icon: 'none' })
        return
      }

      try {
        if (editingId) {
          storage.updateRecord(habit.id, editingId, { v: num, n: note, d: activeDate })
        } else {
          storage.addRecord(habit.id, activeDate, num, note)
        }
      } catch (err) {
        this.handleStorageError(err)
        return
      }

      // 轻微震动反馈，让打卡有「落地感」
      if (storage.getSettings().haptic) {
        wx.vibrateShort({ type: 'light', fail: () => {} })
      }

      this.setData({ value: '', note: '', noteOpen: false, editingId: '' })
      this.refresh()
      this.triggerEvent('change', { habitId: habit.id, date: activeDate, added: !editingId })
    },

    /** 点击已有记录 -> 载入到表单进入修改模式（只读时不可进） */
    onEditRecord(e) {
      if (this.blockedByReadonly()) return
      const id = e.currentTarget.dataset.id
      const rec = this.data.records.find((r) => r.id === id)
      if (!rec) return
      this.setData({ editingId: id, value: String(rec.raw), note: rec.note, noteOpen: !!rec.note }, () => this.refresh())
    },

    onCancelEdit() {
      this.setData({ editingId: '', value: '', note: '', noteOpen: false }, () => this.refresh())
    },

    onDeleteRecord(e) {
      if (this.blockedByReadonly()) return
      const id = e.currentTarget.dataset.id
      const { habit, activeDate } = this.data
      wx.showModal({
        title: '删除这条记录？',
        content: '删除后无法恢复',
        confirmColor: '#FF5C5C',
        success: (res) => {
          if (!res.confirm) return
          storage.deleteRecord(habit.id, id)
          if (this.data.editingId === id) this.setData({ editingId: '', value: '', note: '' })
          this.refresh()
          this.triggerEvent('change', { habitId: habit.id, date: activeDate, removed: true })
        }
      })
    },

    /** 存储写满时给出可执行的引导，而不是一个干巴巴的报错 */
    handleStorageError(err) {
      if (err && err.code === 'QUOTA_EXCEEDED') {
        wx.showModal({
          title: '本地存储已满',
          content: '打卡记录已占满小程序 10MB 本地空间。请到「我的 - 存储管理」清理旧数据后再试。',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
        console.error('[checkin] 写入失败', err)
      }
    }
  }
})

/** 数值展示：去掉多余的小数尾巴（50.0 -> 50） */
function trimNum(n) {
  const num = Number(n) || 0
  return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100)
}

/** 时间戳 -> HH:mm */
function fmtTime(ts) {
  const d = new Date(ts)
  return dayjs.pad2(d.getHours()) + ':' + dayjs.pad2(d.getMinutes())
}
