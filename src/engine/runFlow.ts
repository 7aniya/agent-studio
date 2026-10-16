import { streamChat, type ChatMsg } from '../lib/llm'
import { runTool } from './tools'
import { retrieve } from './retrieve'
import type { Branch, Flow, FlowNode, RunEvent, Settings, StepTrace } from '../types'

export interface RunResult {
  text: string
  steps: StepTrace[]
}

const MAX_STEPS = 40

type Ctx = Record<string, string>

/**
 * 有向图执行引擎：从 start 出发，按边逐节点推进，直到 end 或无后继。
 * 全程以事件流形式向外吐状态，UI 层据此渲染流式结果与执行轨迹。
 */
export async function runFlow(
  flow: Flow,
  input: string,
  settings: Settings,
  emit: (e: RunEvent) => void,
  signal?: AbortSignal
): Promise<RunResult> {
  const steps: StepTrace[] = []
  const ctx: Ctx = { input, prev: '' }

  const start = flow.nodes.find(n => n.kind === 'start')
  if (!start) {
    emit({ type: 'error', message: '流程缺少「开始」节点' })
    return { text: '', steps }
  }

  let current: FlowNode | undefined = start
  let guard = 0
  let finalText = ''
  let branch: Branch | undefined

  while (current && guard < MAX_STEPS) {
    guard += 1
    const t0 = performance.now()
    emit({ type: 'node:start', nodeId: current.id })

    let output = ''
    branch = undefined

    try {
      const res = await execNode(current, ctx, settings, emit, signal)
      output = res.output
      branch = res.branch
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emit({ type: 'error', nodeId: current.id, message })
      return { text: '', steps }
    }

    ctx.prev = output
    if (current.config.outputKey) ctx[current.config.outputKey] = output

    const step: StepTrace = {
      nodeId: current.id,
      title: current.title,
      kind: current.kind,
      output,
      ms: Math.round(performance.now() - t0)
    }
    if (branch) step.branch = branch
    steps.push(step)

    emit({ type: 'node:end', nodeId: current.id, text: output })

    if (current.kind === 'end') {
      finalText = output
      break
    }

    const outgoing = flow.edges.filter(e => e.source === current!.id)
    const nextEdge = branch
      ? outgoing.find(e => e.branch === branch) ?? outgoing.find(e => !e.branch)
      : outgoing[0]

    if (!nextEdge) {
      finalText = output
      break
    }
    current = flow.nodes.find(n => n.id === nextEdge.target)
  }

  if (guard >= MAX_STEPS) {
    emit({ type: 'error', message: '执行步数超过上限，流程可能存在环路' })
  }

  emit({ type: 'done', text: finalText })
  return { text: finalText, steps }
}

async function execNode(
  node: FlowNode,
  ctx: Ctx,
  settings: Settings,
  emit: (e: RunEvent) => void,
  signal?: AbortSignal
): Promise<{ output: string; branch?: Branch }> {
  switch (node.kind) {
    case 'start':
      return { output: ctx.input }

    case 'llm': {
      const prompt = interpolate(node.config.prompt, ctx)
      const messages: ChatMsg[] = []
      if (node.config.systemPrompt?.trim()) {
        messages.push({ role: 'system', content: node.config.systemPrompt })
      }
      messages.push({ role: 'user', content: prompt })

      let acc = ''
      await streamChat(
        messages,
        { ...settings, model: node.config.model || settings.model },
        delta => {
          acc += delta
          emit({ type: 'node:chunk', nodeId: node.id, text: delta })
        },
        signal
      )
      return { output: acc }
    }

    case 'kb': {
      const raw = node.config.expression?.trim()
      const query = raw ? interpolate(raw, ctx) : ctx.prev || ctx.input
      const hits = retrieve(query, node.config.docs ?? '', node.config.topK ?? 3)
      return {
        output: hits.length
          ? hits.map((h, i) => `[${i + 1}] ${h}`).join('\n')
          : '未召回相关内容，请检查知识库或调整关键词'
      }
    }

    case 'tool': {
      const arg = interpolate(node.config.expression || '{{input}}', ctx)
      return { output: runTool(node.config.tool ?? 'get_time', arg) }
    }

    case 'condition': {
      const text = ctx.prev || ctx.input
      return { output: text, branch: evalCondition(node.config.expression ?? '', text) }
    }

    case 'end': {
      const tpl = node.config.prompt?.trim()
      return { output: tpl ? interpolate(tpl, ctx) : ctx.prev }
    }

    default:
      return { output: '' }
  }
}

/** 变量插值：把 {{input}} {{prev}} 等占位符替换为上下文中的值 */
export function interpolate(tpl: string | undefined, ctx: Ctx): string {
  if (!tpl) return ''
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => ctx[key] ?? '')
}

/**
 * 分支判定规则（不消耗 token，纯本地规则引擎）：
 *   "投诉|人工|退款"   →  包含任一关键词则走 true
 *   "!满意"            →  取反
 *   "len>50"           →  长度判断
 *   "re:^\\d+$"        →  正则匹配
 */
export function evalCondition(rule: string, text: string): Branch {
  const r = rule.trim()
  if (!r) return 'true'

  const negated = r.startsWith('!')
  const body = negated ? r.slice(1).trim() : r
  const result = match(body, text)

  return negated ? (result ? 'false' : 'true') : result ? 'true' : 'false'
}

function match(body: string, text: string): boolean {
  if (body.startsWith('re:')) {
    try {
      return new RegExp(body.slice(3), 'i').test(text)
    } catch {
      return false
    }
  }
  if (body.startsWith('len>')) {
    return text.length > Number(body.slice(4) || 0)
  }
  const lower = text.toLowerCase()
  return body
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .some(t => lower.includes(t.toLowerCase()))
}
