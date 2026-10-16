import { useCallback, useEffect, useRef, useState } from 'react'
import { Palette } from './components/Palette'
import { Canvas } from './components/Canvas'
import { ConfigPanel } from './components/ConfigPanel'
import { ChatPanel } from './components/ChatPanel'
import type { NodeStatus } from './components/NodeCard'
import { runFlow } from './engine/runFlow'
import { DEFAULT_FLOW, defaultConfig } from './lib/defaultFlow'
import { NODE_H, NODE_META, NODE_W } from './lib/nodeMeta'
import type { Branch, ChatMessage, Flow, FlowNode, NodeKind, Settings } from './types'

const FLOW_KEY = 'agent-studio.flow.v1'
const SETTINGS_KEY = 'agent-studio.settings.v1'

const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  model: 'qwen-plus'
}

let seq = 0
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export default function App() {
  const [flow, setFlow] = useState<Flow>(() => load(FLOW_KEY, DEFAULT_FLOW))
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...load<Partial<Settings>>(SETTINGS_KEY, {})
  }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({})
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => {
    localStorage.setItem(FLOW_KEY, JSON.stringify(flow))
  }, [flow])

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ baseUrl: settings.baseUrl, model: settings.model })
    )
  }, [settings.baseUrl, settings.model])

  /** 用 rAF 把高频 token 合并成一帧一次 setState，避免每个字符触发一次整列表重渲染 */
  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const chunk = pendingRef.current
      pendingRef.current = ''
      const id = activeIdRef.current
      if (!id || !chunk) return
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: m.content + chunk } : m)))
    })
  }, [])

  const finishFlush = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const chunk = pendingRef.current
    pendingRef.current = ''
    const id = activeIdRef.current
    if (!id || !chunk) return
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: m.content + chunk } : m)))
  }, [])

  const addNode = useCallback((kind: NodeKind, x?: number, y?: number) => {
    const id = uid(kind)
    const node: FlowNode = {
      id,
      kind,
      title: NODE_META[kind].label,
      x: x ?? 120 + Math.round(Math.random() * 160),
      y: y ?? 120 + Math.round(Math.random() * 160),
      config: defaultConfig(kind)
    }
    setFlow(f => ({ ...f, nodes: [...f.nodes, node] }))
    setSelectedId(id)
  }, [])

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setFlow(f => ({
      ...f,
      nodes: f.nodes.map(n => (n.id === id ? { ...n, x, y } : n))
    }))
  }, [])

  const addEdge = useCallback((source: string, target: string, branch?: Branch) => {
    setFlow(f => {
      const dup = f.edges.some(
        e => e.source === source && e.target === target && e.branch === branch
      )
      if (source === target || dup) return f
      return {
        ...f,
        edges: [...f.edges, { id: uid('e'), source, target, branch }]
      }
    })
  }, [])

  const deleteEdge = useCallback((id: string) => {
    setFlow(f => ({ ...f, edges: f.edges.filter(e => e.id !== id) }))
  }, [])

  const deleteNode = useCallback((id: string) => {
    setFlow(f => ({
      nodes: f.nodes.filter(n => n.id !== id),
      edges: f.edges.filter(e => e.source !== id && e.target !== id)
    }))
    setSelectedId(prev => (prev === id ? null : prev))
  }, [])

  const patchNode = useCallback((id: string, patch: Partial<FlowNode>) => {
    setFlow(f => ({
      ...f,
      nodes: f.nodes.map(n => (n.id === id ? { ...n, ...patch } : n))
    }))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const el = e.target as HTMLElement | null
        if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return
        e.preventDefault()
        deleteNode(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, deleteNode])

  async function handleSend(text: string) {
    if (running) return

    const userMsg: ChatMessage = { id: uid('u'), role: 'user', content: text }
    const botId = uid('a')
    const botMsg: ChatMessage = { id: botId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, botMsg])
    setRunning(true)
    setStatuses({})
    activeIdRef.current = botId

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await runFlow(
        flow,
        text,
        settings,
        ev => {
          if (ev.type === 'node:start' && ev.nodeId) {
            setActiveNodeId(ev.nodeId)
            setStatuses(p => ({ ...p, [ev.nodeId!]: 'running' }))
          } else if (ev.type === 'node:chunk' && ev.text) {
            pendingRef.current += ev.text
            scheduleFlush()
          } else if (ev.type === 'node:end' && ev.nodeId) {
            setStatuses(p => ({ ...p, [ev.nodeId!]: 'done' }))
          } else if (ev.type === 'error') {
            throw new Error(ev.message || '执行失败')
          }
        },
        controller.signal
      )

      finishFlush()
      setMessages(prev =>
        prev.map(m =>
          m.id === botId ? { ...m, content: result.text, steps: result.steps } : m
        )
      )
    } catch (err) {
      finishFlush()
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      const message = aborted
        ? '已停止'
        : err instanceof Error
          ? err.message
          : '执行失败'
      setMessages(prev =>
        prev.map(m =>
          m.id === botId
            ? {
                ...m,
                content: m.content ? m.content + `\n\n[中断] ${message}` : message,
                error: !aborted
              }
            : m
        )
      )
    } finally {
      setRunning(false)
      setActiveNodeId(null)
      abortRef.current = null
      pendingRef.current = ''
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function resetFlow() {
    if (running) return
    setFlow(DEFAULT_FLOW)
    setSelectedId(null)
    setStatuses({})
  }

  function exportFlow() {
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'agent-flow.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const selected = flow.nodes.find(n => n.id === selectedId) ?? null
  const isDemo = !settings.apiKey.trim()

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">AS</span>
          <div>
            <div className="brand-name">Agent Studio</div>
            <div className="brand-sub">可视化智能体编排 · 流式执行</div>
          </div>
        </div>

        <div className="topbar-right">
          <span className={`badge ${isDemo ? 'is-demo' : 'is-live'}`}>
            {isDemo ? '演示模式（无需 API Key）' : `已接入 ${settings.model || '模型'}`}
          </span>
          <button className="ghost-btn" onClick={resetFlow} disabled={running}>
            重置示例
          </button>
          <button className="ghost-btn" onClick={exportFlow}>
            导出 JSON
          </button>
          <button className="ghost-btn" onClick={() => setShowSettings(true)}>
            连接设置
          </button>
        </div>
      </header>

      <main className="workspace">
        <Palette onAdd={kind => addNode(kind)} disabled={running} />
        <Canvas
          nodes={flow.nodes}
          edges={flow.edges}
          selectedId={selectedId}
          statusMap={statuses}
          activeNodeId={activeNodeId}
          onSelect={setSelectedId}
          onMoveNode={moveNode}
          onAddEdge={addEdge}
          onDeleteEdge={deleteEdge}
          onDeleteNode={deleteNode}
          onDropNew={addNode}
        />
        <div className="right-rail">
          <ConfigPanel node={selected} onChange={patchNode} />
          <ChatPanel
            messages={messages}
            running={running}
            onSend={handleSend}
            onStop={handleStop}
            onClear={() => setMessages([])}
          />
        </div>
      </main>

      {showSettings && (
        <div className="modal-mask" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>连接设置</span>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-note">
                留空 API Key 即使用内置演示模式：后端会按剧本逐字生成回复，
                用于完整体验编排与流式链路。填入 Key 后走真实模型。
                Key 只保存在浏览器本地、随请求转发，不会写入前端产物。
              </p>

              <label className="field">
                <span>Base URL（OpenAI 兼容）</span>
                <input
                  value={settings.baseUrl}
                  onChange={e => setSettings(s => ({ ...s, baseUrl: e.target.value }))}
                  placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                />
              </label>

              <label className="field">
                <span>API Key</span>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
                  placeholder="sk-..."
                />
              </label>

              <label className="field">
                <span>默认模型</span>
                <input
                  value={settings.model}
                  onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                  placeholder="qwen-plus"
                />
              </label>
            </div>

            <div className="modal-foot">
              <button
                className="ghost-btn"
                onClick={() => setSettings(s => ({ ...s, apiKey: '' }))}
              >
                切回演示模式
              </button>
              <button className="primary-btn" onClick={() => setShowSettings(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
