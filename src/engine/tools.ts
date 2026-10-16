import type { ToolName } from '../types'

const SEARCH_CORPUS: Array<{ kw: string[]; text: string }> = [
  {
    kw: ['广州', '跨境', '电商', '政策'],
    text: '[1] 广州跨境电商综试区 2026 年新政：对年交易额超 500 万美元的企业给予仓储补贴，南沙、白云机场综保区支持"先出后报"模式。'
  },
  {
    kw: ['前端', '岗位', '行情', '招聘'],
    text: '[1] 2026 上半年传统前端岗位需求同比 -52%，初级岗 -62%；同期 AI 应用开发岗新发量同比 +47%，起薪高出同级别传统开发约 40%。'
  },
  {
    kw: ['大模型', 'agent', '智能体', '编排'],
    text: '[1] 行业共识正从"单轮对话"转向"可编排的工作流"：LLM 节点 + 检索节点 + 工具节点 + 条件分支，用有向图描述任务，用流式输出保证体验。'
  }
]

export function runTool(name: ToolName, arg: string): string {
  switch (name) {
    case 'get_time':
      return new Date().toLocaleString('zh-CN', { hour12: false })
    case 'calculator':
      return safeCalc(arg)
    case 'mock_search':
      return mockSearch(arg)
    default:
      return '未知工具'
  }
}

/**
 * 计算器：先做白名单过滤再求值，杜绝任意代码执行。
 * 只保留数字、四则运算符、小数点与空格。
 */
function safeCalc(raw: string): string {
  const expr = raw.replace(/[^0-9+\-*/.\s]/g, '').slice(0, 120)
  if (!/\d/.test(expr)) return '未识别到可计算的表达式'
  if (!/^[0-9+\-*/. \t]+$/.test(expr)) return '表达式包含非法字符'
  try {
    const value = Function(`"use strict"; return (${expr})`)()
    if (typeof value !== 'number' || !Number.isFinite(value)) return '计算结果无效'
    return String(Math.round(value * 1e6) / 1e6)
  } catch {
    return '表达式解析失败'
  }
}

function mockSearch(query: string): string {
  const q = query.toLowerCase()
  const hit = SEARCH_CORPUS.filter(item => item.kw.some(k => q.includes(k.toLowerCase())))
  if (hit.length === 0) {
    return `未检索到与「${query}」高度相关的结果（演示数据源，仅内置 3 条样例）。`
  }
  return hit.map(h => h.text).join('\n')
}
