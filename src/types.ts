export type NodeKind = 'start' | 'llm' | 'kb' | 'condition' | 'tool' | 'end'

export type Branch = 'true' | 'false'

export interface NodeConfig {
  prompt?: string
  model?: string
  temperature?: number
  tool?: ToolName
  expression?: string
  topK?: number
  docs?: string
  outputKey?: string
  systemPrompt?: string
}

export interface FlowNode {
  id: string
  kind: NodeKind
  title: string
  x: number
  y: number
  config: NodeConfig
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  branch?: Branch
}

export interface Flow {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type ToolName = 'get_time' | 'calculator' | 'mock_search'

export interface RunEvent {
  type: 'node:start' | 'node:chunk' | 'node:end' | 'error' | 'done'
  nodeId?: string
  text?: string
  message?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: StepTrace[]
  error?: boolean
}

export interface StepTrace {
  nodeId: string
  title: string
  kind: NodeKind
  output: string
  ms: number
  branch?: Branch
}

export interface Settings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface NodeMeta {
  kind: NodeKind
  label: string
  desc: string
  accent: string
  hasInput: boolean
  outputs: Branch[] | []
}
