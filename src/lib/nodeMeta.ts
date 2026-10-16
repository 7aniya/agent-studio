import type { Branch, NodeKind, NodeMeta, ToolName } from '../types'

export const NODE_META: Record<NodeKind, NodeMeta> = {
  start: {
    kind: 'start',
    label: '开始',
    desc: '流程入口，接收用户输入',
    accent: '#5F5E5A',
    hasInput: false,
    outputs: []
  },
  llm: {
    kind: 'llm',
    label: 'LLM 推理',
    desc: '调用大模型，支持流式输出',
    accent: '#534AB7',
    hasInput: true,
    outputs: []
  },
  kb: {
    kind: 'kb',
    label: '知识库检索',
    desc: '从文档中召回相关片段',
    accent: '#0F6E56',
    hasInput: true,
    outputs: []
  },
  condition: {
    kind: 'condition',
    label: '条件分支',
    desc: '按规则判定走向 true / false',
    accent: '#854F0B',
    hasInput: true,
    outputs: ['true', 'false']
  },
  tool: {
    kind: 'tool',
    label: '工具调用',
    desc: '执行内置函数获取结果',
    accent: '#185FA5',
    hasInput: true,
    outputs: []
  },
  end: {
    kind: 'end',
    label: '结束',
    desc: '输出最终结果',
    accent: '#993C1D',
    hasInput: true,
    outputs: []
  }
}

export const TOOL_LABEL: Record<ToolName, string> = {
  get_time: '获取当前时间',
  calculator: '四则运算计算器',
  mock_search: '模拟联网搜索'
}

export const NODE_W = 210
export const NODE_H = 76

/** 条件节点两个分支输出口的水平占比 */
const BRANCH_RATIO: Record<Branch, number> = { true: 0.3, false: 0.7 }

/**
 * 画布采用自上而下的流向：入口在节点顶部，出口在节点底部。
 * 分支节点有两个出口，按比例左右分开，避免连线重叠。
 */
export function portOutPos(node: { x: number; y: number }, branch?: Branch) {
  if (branch) {
    return {
      x: node.x + NODE_W * BRANCH_RATIO[branch],
      y: node.y + NODE_H
    }
  }
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H }
}

export function portInPos(node: { x: number; y: number }) {
  return { x: node.x + NODE_W / 2, y: node.y }
}

/** 垂直方向的三次贝塞尔连线 */
export function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = Math.max(38, Math.abs(y2 - y1) * 0.5)
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
}
