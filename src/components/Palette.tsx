import { NODE_META } from '../lib/nodeMeta'
import type { NodeKind } from '../types'

const DRAGGABLE: NodeKind[] = ['llm', 'kb', 'condition', 'tool', 'end']

interface Props {
  onAdd: (kind: NodeKind) => void
  disabled?: boolean
}

export function Palette({ onAdd, disabled }: Props) {
  return (
    <aside className="palette">
      <div className="palette-head">节点库</div>
      <p className="palette-hint">拖拽到画布，或点击快速添加</p>

      <div className="palette-list">
        {DRAGGABLE.map(kind => {
          const meta = NODE_META[kind]
          return (
            <div
              key={kind}
              className="palette-item"
              draggable={!disabled}
              onDragStart={e => {
                e.dataTransfer.setData('application/node-kind', kind)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => !disabled && onAdd(kind)}
              style={{ borderLeftColor: meta.accent }}
            >
              <div className="palette-item-title">{meta.label}</div>
              <div className="palette-item-desc">{meta.desc}</div>
            </div>
          )
        })}
      </div>

      <div className="palette-foot">
        <div className="palette-tip-title">画布操作</div>
        <ul>
          <li>按住节点卡片拖动，可移动位置</li>
          <li>从节点<strong>底部</strong>圆点拖到下一个节点，即连成一条线</li>
          <li>单击连线可删除</li>
          <li>选中节点后按 Delete 删除，或点右上角 ×</li>
        </ul>
      </div>
    </aside>
  )
}
