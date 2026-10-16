import { NODE_META, TOOL_LABEL } from '../lib/nodeMeta'
import type { FlowNode, ToolName } from '../types'

interface Props {
  node: FlowNode | null
  onChange: (id: string, patch: Partial<FlowNode>) => void
}

const MODEL_PRESETS = ['qwen-plus', 'qwen-max', 'deepseek-chat', 'gpt-4o-mini']

export function ConfigPanel({ node, onChange }: Props) {
  if (!node) {
    return (
      <section className="config">
        <div className="config-head">节点配置</div>
        <div className="config-empty">选中画布中的任意节点，在这里配置它的行为</div>
      </section>
    )
  }

  const meta = NODE_META[node.kind]
  const cfg = node.config

  function setConfig(patch: Partial<typeof cfg>) {
    onChange(node!.id, { config: { ...cfg, ...patch } })
  }

  return (
    <section className="config">
      <div className="config-head">
        <span className="config-dot" style={{ background: meta.accent }} />
        节点配置
      </div>

      <label className="field">
        <span>节点名称</span>
        <input
          value={node.title}
          onChange={e => onChange(node.id, { title: e.target.value })}
        />
      </label>

      {(node.kind === 'llm' || node.kind === 'kb' || node.kind === 'tool') && (
        <label className="field">
          <span>输出变量名（可选）</span>
          <input
            placeholder="answer"
            value={cfg.outputKey ?? ''}
            onChange={e => setConfig({ outputKey: e.target.value })}
          />
          <em>填写后其他节点可用 {'{{'}变量名{'}}'} 引用这一步的结果</em>
        </label>
      )}

      {node.kind === 'llm' && (
        <>
          <label className="field">
            <span>System 提示词</span>
            <textarea
              rows={3}
              placeholder="你是…"
              value={cfg.systemPrompt ?? ''}
              onChange={e => setConfig({ systemPrompt: e.target.value })}
            />
          </label>
          <label className="field">
            <span>用户提示词</span>
            <textarea
              rows={5}
              placeholder="用户问题：{{input}}&#10;参考资料：{{prev}}"
              value={cfg.prompt ?? ''}
              onChange={e => setConfig({ prompt: e.target.value })}
            />
            <em>支持 {'{{'}input{'}}'} 原始输入、{'{{'}prev{'}}'} 上一步输出</em>
          </label>
          <label className="field">
            <span>模型</span>
            <input
              list="model-presets"
              value={cfg.model ?? ''}
              placeholder="留空则使用全局设置"
              onChange={e => setConfig({ model: e.target.value })}
            />
            <datalist id="model-presets">
              {MODEL_PRESETS.map(m => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>温度 {(cfg.temperature ?? 0.7).toFixed(1)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={cfg.temperature ?? 0.7}
              onChange={e => setConfig({ temperature: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {node.kind === 'kb' && (
        <>
          <label className="field">
            <span>知识库内容（每行一段）</span>
            <textarea
              rows={8}
              placeholder="退货政策：7 天无理由…"
              value={cfg.docs ?? ''}
              onChange={e => setConfig({ docs: e.target.value })}
            />
          </label>
          <label className="field">
            <span>检索词表达式</span>
            <input
              placeholder="{{input}}"
              value={cfg.expression ?? ''}
              onChange={e => setConfig({ expression: e.target.value })}
            />
            <em>留空则使用上一步输出或原始输入</em>
          </label>
          <label className="field">
            <span>召回条数 {cfg.topK ?? 3}</span>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={cfg.topK ?? 3}
              onChange={e => setConfig({ topK: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {node.kind === 'condition' && (
        <label className="field">
          <span>判定规则</span>
          <input
            placeholder="投诉|人工|退款"
            value={cfg.expression ?? ''}
            onChange={e => setConfig({ expression: e.target.value })}
          />
          <em>
            用 | 分隔多个关键词，命中任一走「是」；加 ! 取反；也支持 len&gt;50、re:^正则$
          </em>
        </label>
      )}

      {node.kind === 'tool' && (
        <>
          <label className="field">
            <span>选择工具</span>
            <select
              value={cfg.tool ?? 'get_time'}
              onChange={e => setConfig({ tool: e.target.value as ToolName })}
            >
              {(Object.keys(TOOL_LABEL) as ToolName[]).map(t => (
                <option key={t} value={t}>
                  {TOOL_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>入参表达式</span>
            <input
              placeholder="{{input}}"
              value={cfg.expression ?? ''}
              onChange={e => setConfig({ expression: e.target.value })}
            />
          </label>
        </>
      )}

      {node.kind === 'end' && (
        <label className="field">
          <span>输出模板</span>
          <textarea
            rows={4}
            placeholder="{{answer}}"
            value={cfg.prompt ?? ''}
            onChange={e => setConfig({ prompt: e.target.value })}
          />
          <em>留空则直接输出上一步结果</em>
        </label>
      )}

      {node.kind === 'start' && (
        <div className="config-note">开始节点是流程入口，无需额外配置。</div>
      )}

      <div className="config-type">{meta.desc}</div>
    </section>
  )
}
