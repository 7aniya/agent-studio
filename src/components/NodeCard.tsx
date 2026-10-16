import { memo } from 'react'
import { NODE_H, NODE_W, NODE_META } from '../lib/nodeMeta'
import type { Branch, FlowNode } from '../types'

export type NodeStatus = 'idle' | 'running' | 'done'

interface Props {
  node: FlowNode
  selected: boolean
  status: NodeStatus
  onSelect: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onPortDown: (e: React.MouseEvent, id: string, branch?: Branch) => void
  onDelete: (id: string) => void
  onHover: (id: string | null) => void
}

function NodeCardBase({
  node,
  selected,
  status,
  onSelect,
  onDragStart,
  onPortDown,
  onDelete,
  onHover
}: Props) {
  const meta = NODE_META[node.kind]
  const isBranch = node.kind === 'condition'

  return (
    <div
      className={`node-card${selected ? ' is-selected' : ''}${status === 'running' ? ' is-running' : ''}${status === 'done' ? ' is-done' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        borderColor: selected ? meta.accent : undefined
      }}
      onMouseDown={() => onSelect(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="node-body"
        onMouseDown={e => onDragStart(e, node.id)}
        style={{ cursor: 'grab' }}
      >
        <span className="node-accent" style={{ background: meta.accent }} />
        <div className="node-text">
          <div className="node-title">{node.title}</div>
          <div className="node-kind">{meta.label}</div>
        </div>
      </div>

      {node.kind !== 'start' && (
        <span className="port port-in" title="输入" />
      )}

      {isBranch ? (
        <>
          <span
            className="port port-out port-true"
            title="条件成立"
            onMouseDown={e => {
              e.stopPropagation()
              onPortDown(e, node.id, 'true')
            }}
          />
          <span
            className="port port-out port-false"
            title="条件不成立"
            onMouseDown={e => {
              e.stopPropagation()
              onPortDown(e, node.id, 'false')
            }}
          />
          <span className="branch-label branch-true">是</span>
          <span className="branch-label branch-false">否</span>
        </>
      ) : (
        node.kind !== 'end' && (
          <span
            className="port port-out"
            title="拖出连线"
            onMouseDown={e => {
              e.stopPropagation()
              onPortDown(e, node.id)
            }}
          />
        )
      )}

      {selected && (
        <button
          className="node-del"
          title="删除节点"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onDelete(node.id)}
        >
          ×
        </button>
      )}
    </div>
  )
}

export const NodeCard = memo(NodeCardBase)
