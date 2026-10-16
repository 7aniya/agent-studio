import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NodeCard, type NodeStatus } from './NodeCard'
import { bezierPath, NODE_H, NODE_W, portInPos, portOutPos } from '../lib/nodeMeta'
import type { Branch, FlowEdge, FlowNode, NodeKind } from '../types'

interface Props {
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedId: string | null
  statusMap: Record<string, NodeStatus>
  activeNodeId: string | null
  onSelect: (id: string | null) => void
  onMoveNode: (id: string, x: number, y: number) => void
  onAddEdge: (source: string, target: string, branch?: Branch) => void
  onDeleteEdge: (id: string) => void
  onDeleteNode: (id: string) => void
  onDropNew: (kind: NodeKind, x: number, y: number) => void
}

interface DragState {
  id: string
  dx: number
  dy: number
}

interface LinkState {
  source: string
  branch?: Branch
  x: number
  y: number
}

const clampScale = (v: number) => Math.min(1.5, Math.max(0.4, Math.round(v * 100) / 100))

export function Canvas(props: Props) {
  const {
    nodes,
    edges,
    selectedId,
    statusMap,
    activeNodeId,
    onSelect,
    onMoveNode,
    onAddEdge,
    onDeleteEdge,
    onDeleteNode,
    onDropNew
  } = props

  const hostRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [link, setLink] = useState<LinkState | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const didFit = useRef(false)

  const contentW = useMemo(
    () => Math.max(600, ...nodes.map(n => n.x + NODE_W + 140)),
    [nodes]
  )
  const contentH = useMemo(
    () => Math.max(600, ...nodes.map(n => n.y + NODE_H + 140)),
    [nodes]
  )

  const fit = useCallback(() => {
    const el = hostRef.current
    if (!el) return
    const s = Math.min(el.clientWidth / contentW, el.clientHeight / contentH, 1)
    setScale(clampScale(s))
  }, [contentW, contentH])

  // 首次进入自动缩放到刚好容纳整张流程图，避免"打开只看得见一半"
  useEffect(() => {
    if (didFit.current || nodes.length === 0) return
    const el = hostRef.current
    if (!el || el.clientWidth === 0) return
    fit()
    didFit.current = true
  }, [nodes.length, fit])

  /** 屏幕坐标 → 画布逻辑坐标（补偿缩放） */
  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      const rect = innerRef.current?.getBoundingClientRect()
      return {
        x: (clientX - (rect?.left ?? 0)) / scale,
        y: (clientY - (rect?.top ?? 0)) / scale
      }
    },
    [scale]
  )

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (drag) {
        const p = toLocal(e.clientX, e.clientY)
        onMoveNode(drag.id, Math.max(0, p.x - drag.dx), Math.max(0, p.y - drag.dy))
      } else if (link) {
        const p = toLocal(e.clientX, e.clientY)
        setLink({ ...link, x: p.x, y: p.y })
      }
    }

    function onUp() {
      if (link && hoverId && hoverId !== link.source) {
        onAddEdge(link.source, hoverId, link.branch)
      }
      setDrag(null)
      setLink(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, link, hoverId, onMoveNode, onAddEdge, toLocal])

  const handleDragStart = useCallback(
    (e: React.MouseEvent, id: string) => {
      const node = nodes.find(n => n.id === id)
      if (!node) return
      const p = toLocal(e.clientX, e.clientY)
      setDrag({ id, dx: p.x - node.x, dy: p.y - node.y })
    },
    [nodes, toLocal]
  )

  const handlePortDown = useCallback(
    (e: React.MouseEvent, id: string, branch?: Branch) => {
      const node = nodes.find(n => n.id === id)
      if (!node) return
      const start = portOutPos(node, branch)
      void e
      setLink({ source: id, branch, x: start.x, y: start.y })
    },
    [nodes]
  )

  const linkSource = link ? nodes.find(n => n.id === link.source) : undefined

  return (
    <div className="canvas-wrap">
      <div
        className="canvas"
        ref={hostRef}
        onMouseDown={e => {
          const t = e.target as HTMLElement
          if (t === hostRef.current || t === innerRef.current) onSelect(null)
        }}
        onDragOver={e => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={e => {
          e.preventDefault()
          const kind = e.dataTransfer.getData('application/node-kind') as NodeKind
          if (!kind) return
          const p = toLocal(e.clientX, e.clientY)
          onDropNew(kind, Math.max(0, p.x - NODE_W / 2), Math.max(0, p.y - NODE_H / 2))
        }}
      >
        <div
          className="canvas-inner"
          ref={innerRef}
          style={{
            width: contentW,
            height: contentH,
            transform: `scale(${scale})`,
            transformOrigin: '0 0'
          }}
        >
          <svg className="canvas-edges" width={contentW} height={contentH}>
            {edges.map(edge => {
              const src = nodes.find(n => n.id === edge.source)
              const tgt = nodes.find(n => n.id === edge.target)
              if (!src || !tgt) return null
              const a = portOutPos(src, edge.branch)
              const b = portInPos(tgt)
              const d = bezierPath(a.x, a.y, b.x, b.y)
              const active = activeNodeId === edge.source || activeNodeId === edge.target
              return (
                <g key={edge.id} className={`edge${active ? ' is-active' : ''}`}>
                  <path className="edge-hit" d={d} onClick={() => onDeleteEdge(edge.id)} />
                  <path className="edge-line" d={d} />
                  {edge.branch && (
                    <text
                      className="edge-tag"
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 8}
                      textAnchor="middle"
                    >
                      {edge.branch === 'true' ? '是' : '否'}
                    </text>
                  )}
                </g>
              )
            })}

            {link && linkSource && (
              <path
                className="edge-draft"
                d={bezierPath(
                  portOutPos(linkSource, link.branch).x,
                  portOutPos(linkSource, link.branch).y,
                  link.x,
                  link.y
                )}
              />
            )}
          </svg>

          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              status={statusMap[node.id] ?? 'idle'}
              onSelect={onSelect}
              onDragStart={handleDragStart}
              onPortDown={handlePortDown}
              onDelete={onDeleteNode}
              onHover={setHoverId}
            />
          ))}

          {nodes.length === 0 && (
            <div className="canvas-empty">从左侧节点库拖一个节点到这里开始编排</div>
          )}
        </div>
      </div>

      <div className="zoom-bar">
        <button onClick={() => setScale(s => clampScale(s - 0.1))} title="缩小">
          −
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => clampScale(s + 0.1))} title="放大">
          +
        </button>
        <button onClick={fit} title="适应画布">
          适应
        </button>
      </div>
    </div>
  )
}
