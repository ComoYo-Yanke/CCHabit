/**
 * html/ai.js —— 把统计摘要发给 AI 的那一层（纯函数 + fetch，**不碰 DOM**）
 *
 * 分工和 charts.js 一样：这里只管「怎么把话说出去、怎么把回话取出来」，
 * 界面在 app.js。
 *
 * ============================ 三件要紧的事 ============================
 *
 * 1. **Key 不进数据文件**。配置由 store.js 存在 IndexedDB 的一个独立 key 里，
 *    绝不写进 state.data —— 那份 JSON 是要回流到小程序、要备份、还可能进 git 的。
 *
 * 2. **发出去的是摘要，不是原始记录**。buildPrompt 只带区间汇总 + 各习惯的
 *    次数 / 活跃天数 / 连续天数 + 每格趋势，几 KB 封顶。原始打卡记录一条都不发。
 *
 * 3. **三种协议**，够覆盖云和本地：
 *    - openai     —— /chat/completions。OpenAI 自己、DeepSeek、通义、智谱、
 *                    硅基流动、One-API 自建，以及 LM Studio / vLLM 这些本地服务
 *                    全都说这套话，所以「云端」和「本地」其实是同一个分支
 *    - anthropic  —— /v1/messages，头是 x-api-key，还得多带一个
 *                    anthropic-dangerous-direct-browser-access（浏览器直连必须显式开）
 *    - ollama     —— /api/chat，默认没有鉴权，模型跑在自己机器上
 */
window.AI = (function () {
  /**
   * 服务商预设：只负责把「接口地址 + 模型名 + 协议」三样填好，
   * 用户要做的就只剩粘一个 Key（本地模型连 Key 都不用）。
   */
  const PRESETS = [
    { id: 'deepseek', label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'openai', label: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'anthropic', label: 'Anthropic Claude', kind: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
    { id: 'moonshot', label: 'Moonshot 月之暗面', kind: 'openai', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { id: 'dashscope', label: '通义千问', kind: 'openai', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'zhipu', label: '智谱 GLM', kind: 'openai', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'siliconflow', label: '硅基流动', kind: 'openai', base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
    { id: 'ollama', label: 'Ollama（本机，不用 Key）', kind: 'ollama', base: 'http://localhost:11434', model: 'qwen2.5:7b' },
    { id: 'lmstudio', label: 'LM Studio（本机，不用 Key）', kind: 'openai', base: 'http://localhost:1234/v1', model: 'local-model' },
    { id: 'custom', label: '自定义（OpenAI 兼容）…', kind: 'openai', base: '', model: '' }
  ]

  const DEFAULT_CONFIG = { presetId: '', kind: 'openai', base: '', model: '', key: '' }

  const DEFAULT_QUESTION = '帮我看看这段数据，指出做得好的地方和需要改进的地方，再给 3 条明天就能做到的具体建议。'

  /**
   * 系统提示。几条约束都是踩过才知道要写的：
   *  - 不许复述数据：模型很爱把汇总再抄一遍，抄完就没地方写分析了
   *  - 不许编：习惯名和数字都在提示里，它一联想就会冒出「你上周三…」这种没影的话
   *  - 建议要落到明天：不说这个，它会给出「保持良好习惯」这类等于没说的话
   */
  const SYSTEM_PROMPT = [
    '你是一个习惯养成教练，用户给你的是他自己记录的打卡统计摘要。',
    '要求：',
    '1. 用中文回答，直接给分析，不要复述原始数据。',
    '2. 先指出数据里最值得注意的一两点，做得好的和有问题的地方都要说。',
    '3. 再给 3 条具体、可执行的建议，每条要能落到「明天具体做什么」，尽量短。',
    '4. 只根据给到的数据说话，数据里没有的别编。',
    '5. 不要用 markdown 表格，用短段落和短句。'
  ].join('\n')

  // -------------------------------------------------------------------------
  // 配置
  // -------------------------------------------------------------------------

  function preset(id) {
    return PRESETS.filter((p) => p.id === id)[0] || null
  }

  /** 地址末尾的斜杠一律去掉：后面是拼字符串，多一个就是 `//chat/completions` */
  function cleanBase(base) {
    return String(base || '').trim().replace(/\/+$/, '')
  }

  /** 填到界面上的「当前接的是谁」，也用来判断配没配好 */
  function describe(cfg) {
    const base = cleanBase(cfg && cfg.base)
    const model = String((cfg && cfg.model) || '').trim()
    if (!base || !model) return ''
    const p = preset(cfg.presetId)
    const label = p && p.id !== 'custom' ? p.label : base.replace(/^https?:\/\//, '')
    return label + ' · ' + model
  }

  function isLocal(base) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(cleanBase(base))
  }

  // -------------------------------------------------------------------------
  // 提示词：把摘要写成一段人话
  // -------------------------------------------------------------------------

  /**
   * @param {Object} s 摘要，由 app.js 的 aiSnapshot() 现算
   * @param {String} question 用户自己写的问题，留空就用默认那句
   */
  function buildPrompt(s, question) {
    const L = []
    L.push('【统计区间】' + s.start + ' ~ ' + s.end + '（' + s.label + '；一格 = 1' + s.gran + '）')
    L.push('【今天】' + s.today)
    L.push('')
    L.push('【总体】')
    L.push('- 打卡总次数：' + s.summary.totalCount + ' 次')
    L.push(
      '- 有打卡的天数：' + s.summary.activeDays + ' / ' + s.summary.totalDays + ' 天（' + s.summary.completionRate + '%）'
    )
    L.push('- 活跃习惯：' + s.habits.filter((h) => h.count > 0).length + ' / ' + s.habits.length + ' 个')

    if (s.trend.length) {
      L.push('')
      L.push('【每' + s.gran + '打卡次数】')
      L.push(s.trend.map((t) => t.label + ' ' + t.count + ' 次').join('，'))
    }

    L.push('')
    L.push('【各习惯】（只含启用的习惯）')
    if (s.habits.length) {
      s.habits.forEach((h, i) => {
        const bits = [
          '打卡 ' + h.count + ' 次',
          '活跃 ' + h.activeDays + '/' + h.totalDays + ' 天',
          '完成率 ' + h.completionRate + '%',
          '当前连续 ' + h.streak + ' 天',
          '历史最长 ' + h.longest + ' 天'
        ]
        // 数值只在**单个**习惯里才有意义：各习惯单位不同（次 / 公里 / 毫升），不可加
        if (h.value) bits.splice(1, 0, '累计 ' + h.valueText + (h.unit || ''))
        const goal = h.target ? '，每日目标 ' + h.target + (h.unit || '') : ''
        L.push(i + 1 + '. ' + h.name + '（单位：' + (h.unit || '次') + goal + '）—— ' + bits.join('，'))
      })
    } else {
      L.push('（这个区间没有任何习惯）')
    }

    L.push('')
    L.push('【我的问题】')
    L.push(String(question || '').trim() || DEFAULT_QUESTION)
    return L.join('\n')
  }

  // -------------------------------------------------------------------------
  // 发请求
  // -------------------------------------------------------------------------

  function build(kind, base, model, key, prompt) {
    if (kind === 'anthropic') {
      return {
        // 有人填 https://api.anthropic.com，有人填 .../v1，两种都接住
        url: (/\/v1$/i.test(base) ? base : base + '/v1') + '/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          // 浏览器直连 Anthropic 必须显式打开这道门，否则 CORS 直接拦掉
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: { model: model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] }
      }
    }
    if (kind === 'ollama') {
      return {
        url: base + '/api/chat',
        headers: { 'content-type': 'application/json' },
        body: {
          model: model,
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ]
        }
      }
    }
    return {
      url: base + '/chat/completions',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: {
        model: model,
        stream: false,
        temperature: 0.6,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      }
    }
  }

  /** 从三种返回体里掏出正文 */
  function pick(kind, data) {
    if (kind === 'anthropic') {
      return (data.content || [])
        .filter((c) => c && c.type === 'text')
        .map((c) => c.text)
        .join('')
    }
    if (kind === 'ollama') return (data.message && data.message.content) || ''
    const choice = data.choices && data.choices[0]
    return (choice && choice.message && choice.message.content) || ''
  }

  /** 报错的原文也尽量给用户看：三家服务商的错误字段都不一样 */
  function errText(data, raw) {
    if (data) {
      if (data.error) {
        const e = data.error
        return typeof e === 'string' ? e : e.message || JSON.stringify(e)
      }
      if (data.message) return typeof data.message === 'string' ? data.message : JSON.stringify(data.message)
    }
    return String(raw || '').slice(0, 200)
  }

  function netHint(kind, base) {
    if (kind === 'ollama' || isLocal(base)) {
      return (
        '本地服务多半是被 CORS 挡了 —— Ollama 要先设 OLLAMA_ORIGINS=*（LM Studio 在设置里打开 CORS 开关），' +
        '或者用 `python -m http.server` 在项目里起个本地服务，再用 http://localhost 打开本页。'
      )
    }
    return '检查接口地址、网络，以及这个页面是不是从 file:// 直接打开的（浏览器对 file:// 的跨域更严）。'
  }

  /**
   * 问一次，返回正文。
   * @param {Object} cfg {kind, base, model, key}
   * @param {String} prompt 已经拼好的提示词
   * @param {AbortSignal} signal 用户点「停止」或超时用（由 app.js 持有）
   */
  async function ask(cfg, prompt, signal) {
    const kind = cfg.kind || 'openai'
    const base = cleanBase(cfg.base)
    const model = String(cfg.model || '').trim()
    if (!base) throw new Error('还没填接口地址')
    if (!model) throw new Error('还没填模型名')

    const req = build(kind, base, model, String(cfg.key || '').trim(), prompt)

    let res
    try {
      res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: signal
      })
    } catch (e) {
      if (e && e.name === 'AbortError') throw e
      throw new Error('连不上 ' + req.url + '。' + netHint(kind, base))
    }

    const raw = await res.text()
    let data = null
    try {
      data = JSON.parse(raw)
    } catch (e) {
      /* 不是 JSON 也没关系，下面统一处理 */
    }

    if (!res.ok) throw new Error('接口返回 ' + res.status + '：' + errText(data, raw))
    if (!data) throw new Error('接口没返回 JSON：' + String(raw).slice(0, 200))

    const out = String(pick(kind, data) || '').trim()
    if (!out) throw new Error('返回里没有正文：' + String(raw).slice(0, 200))
    return out
  }

  return {
    PRESETS: PRESETS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    DEFAULT_QUESTION: DEFAULT_QUESTION,
    preset: preset,
    describe: describe,
    isLocal: isLocal,
    buildPrompt: buildPrompt,
    ask: ask
  }
})()
