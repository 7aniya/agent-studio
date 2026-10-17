import type { Flow, NodeConfig, NodeKind } from '../types'

const KB_DOCS = `退货政策：支持 7 天无理由退货，商品需保持完好、配件齐全，退货运费由买家承担，定制类商品不支持无理由退货。
退款时效：仓库签收退货后 1-3 个工作日内发起退款，款项原路退回，到账时间取决于支付渠道，通常为 3-7 个工作日。
物流时效：国内仓 48 小时内出库，保税仓 3-5 天送达，海外直邮 7-15 天，节假日顺延。
发票说明：可在订单详情页申请电子发票，开票周期 3 个工作日，跨境订单仅支持开具形式发票。
关税说明：跨境订单行邮税由平台代缴，结算页展示预估税费，实际金额以海关核定为准。
客服时间：每日 9:00-21:00，非工作时间留言将在次日 10:00 前回复。`

/**
 * 默认示例：跨境电商智能客服。
 * 布局采用自上而下的流向，保证在常见屏幕上一屏能看到全貌。
 */
export const DEFAULT_FLOW: Flow = {
  nodes: [
    { id: 'start', kind: 'start', title: '用户提问', x: 350, y: 40, config: {} },
    {
      id: 'kb',
      kind: 'kb',
      title: '知识库召回',
      x: 350,
      y: 180,
      config: { expression: '{{input}}', topK: 3, docs: KB_DOCS, outputKey: 'context' }
    },
    {
      id: 'llm',
      kind: 'llm',
      title: '生成客服答复',
      x: 350,
      y: 320,
      config: {
        systemPrompt:
          '你是跨境电商平台的客服助手。只依据【知识库内容】回答，不要编造信息；若知识库没有相关内容，如实说明并引导联系人工客服。回答简洁、友好、分点。',
        prompt: '【用户问题】\n{{input}}\n\n【知识库内容】\n{{context}}\n\n请给出答复：',
        temperature: 0.4,
        outputKey: 'answer'
      }
    },
    {
      id: 'cond',
      kind: 'condition',
      title: '是否需要升级人工',
      x: 350,
      y: 460,
      config: { expression: '投诉|人工|差评|维权' }
    },
    {
      id: 'tool',
      kind: 'tool',
      title: '登记工单',
      x: 110,
      y: 620,
      config: { tool: 'get_time', expression: '{{input}}', outputKey: 'ticket_time' }
    },
    {
      id: 'end_ticket',
      kind: 'end',
      title: '答复 + 工单回执',
      x: 110,
      y: 760,
      config: {
        prompt:
          '{{answer}}\n\n（已为您登记工单，受理时间：{{prev}}，人工客服将在 2 小时内联系您。）'
      }
    },
    {
      id: 'end_normal',
      kind: 'end',
      title: '直接答复',
      x: 590,
      y: 620,
      config: { prompt: '{{answer}}' }
    }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'kb' },
    { id: 'e2', source: 'kb', target: 'llm' },
    { id: 'e3', source: 'llm', target: 'cond' },
    { id: 'e4', source: 'cond', target: 'tool', branch: 'true' },
    { id: 'e5', source: 'tool', target: 'end_ticket' },
    { id: 'e6', source: 'cond', target: 'end_normal', branch: 'false' }
  ]
}

export function defaultConfig(kind: NodeKind): NodeConfig {
  switch (kind) {
    case 'llm':
      return {
        systemPrompt: '你是一个专业的助手，回答简洁、准确。',
        prompt: '【问题】\n{{input}}\n\n【参考资料】\n{{prev}}\n\n请回答：',
        temperature: 0.7
      }
    case 'kb':
      return { expression: '{{input}}', topK: 3, docs: '' }
    case 'condition':
      return { expression: '投诉|人工' }
    case 'tool':
      return { tool: 'get_time', expression: '{{input}}' }
    case 'end':
      return { prompt: '' }
    default:
      return {}
  }
}
