import type { ChatMsg } from './llm'

/**
 * 演示模式的本地模拟引擎。
 *
 * 放在前端的理由：模拟回复需要拿到完整上下文（原始输入、上一步输出、知识库内容），
 * 这些数据本来就在前端。走一圈网络既慢又拿不到上下文。
 * 真实模式依然走后端代理，Key 不会出现在前端产物里。
 */

const SCRIPTS: Array<{ test: RegExp; reply: string[] }> = [
  {
    test: /投诉|维权|差评|举报/,
    reply: [
      '非常抱歉给您带来了不愉快的体验，我们已记录您的反馈。',
      '',
      '处理结果：已为您升级至人工客服，将在 2 小时内主动联系您。',
      '若情况属实，平台将依据规则为您办理退款或相应补偿。'
    ]
  },
  {
    test: /退货|退款|到账|多久|退换/,
    reply: [
      '为您查询到相关规则：',
      '',
      '1. 退货政策：支持 7 天无理由退货，商品需保持完好、配件齐全；退货运费由买家承担，定制类商品除外。',
      '2. 退款时效：仓库签收退货后 1-3 个工作日内发起退款，款项原路退回。',
      '3. 到账时间：取决于支付渠道，通常为 3-7 个工作日。',
      '',
      '如需加急处理，可在订单详情页提交申请。'
    ]
  },
  {
    test: /物流|发货|几天|送达|快递/,
    reply: [
      '物流时效说明：',
      '',
      '· 国内仓：48 小时内出库',
      '· 保税仓：3-5 天送达',
      '· 海外直邮：7-15 天',
      '',
      '节假日可能顺延，具体以物流轨迹为准。'
    ]
  },
  {
    test: /发票|关税|税费|开票/,
    reply: [
      '关于票据与税费：',
      '',
      '· 电子发票：可在订单详情页申请，开票周期 3 个工作日',
      '· 跨境订单：仅支持开具形式发票',
      '· 行邮税：由平台代缴，结算页展示预估税费，实际以海关核定为准'
    ]
  },
  {
    test: /[+\-*/]/,
    reply: [
      '已为您调用计算器工具。',
      '',
      '计算过程由「工具调用」节点完成，结果会写入变量供后续节点引用，',
      '这一步不消耗模型 token。'
    ]
  }
]

const FALLBACK = [
  '演示模式下，回复由本地剧本生成，用于完整展示编排与流式链路。',
  '',
  '你可以试试这几类问题：退货退款时效、物流送达时间、发票与关税、投诉转人工。',
  '在右上角「连接设置」中填入 OpenAI 兼容的 Base URL 与 API Key，即可切换为真实模型。'
]

export async function mockStreamChat(
  messages: ChatMsg[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const last = [...messages].reverse().find(m => m.role === 'user')
  const question = (last?.content ?? '').trim()

  const hit = question ? SCRIPTS.find(s => s.test.test(question)) : undefined
  const lines = hit ? [...hit.reply, '', '（演示模式：内置剧本回复）'] : FALLBACK
  const reply = lines.join('\n')

  let full = ''
  for (const piece of chunkify(reply)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await sleep(pick(16, 44))
    full += piece
    onDelta(piece)
  }
  return full
}

function chunkify(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const size = pick(1, 3)
    out.push(text.slice(i, i + size))
    i += size
  }
  return out
}

function pick(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
