import { useEffect, useRef, useState } from 'react'
import { NODE_META } from '../lib/nodeMeta'
import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  running: boolean
  onSend: (text: string) => void
  onStop: () => void
  onClear: () => void
}

export function ChatPanel({ messages, running, onSend, onStop, onClear }: Props) {
  const [draft, setDraft] = useState('')
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function submit() {
    const text = draft.trim()
    if (!text || running) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="chat">
      <div className="chat-head">
        <span>对话调试</span>
        <button className="ghost-btn" onClick={onClear} disabled={running}>
          清空
        </button>
      </div>

      <div className="chat-list" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>输入一句话，运行画布上编排好的流程</p>
            <div className="chat-samples">
              {['退货需要多久到账？', '我要投诉，转人工', '帮我算一下 (128+72)*0.85'].map(s => (
                <button key={s} onClick={() => setDraft(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-msg is-${msg.role}${msg.error ? ' is-error' : ''}`}>
            <div className="chat-bubble">
              {msg.content}
              {running && msg.role === 'assistant' && msg.content === '' && (
                <span className="caret" />
              )}
            </div>

            {msg.steps && msg.steps.length > 0 && (
              <div className="steps">
                <button
                  className="steps-toggle"
                  onClick={() =>
                    setOpenSteps(p => ({ ...p, [msg.id]: !p[msg.id] }))
                  }
                >
                  {openSteps[msg.id] ? '收起执行轨迹' : `查看执行轨迹（${msg.steps.length} 步）`}
                </button>

                {openSteps[msg.id] && (
                  <ol className="steps-list">
                    {msg.steps.map((s, i) => (
                      <li key={`${s.nodeId}-${i}`}>
                        <div className="step-head">
                          <span
                            className="step-dot"
                            style={{ background: NODE_META[s.kind].accent }}
                          />
                          <span className="step-title">{s.title}</span>
                          <span className="step-kind">{NODE_META[s.kind].label}</span>
                          {s.branch && (
                            <span className={`step-branch is-${s.branch}`}>
                              {s.branch === 'true' ? '是' : '否'}
                            </span>
                          )}
                          <span className="step-ms">{s.ms} ms</span>
                        </div>
                        {s.output && <pre className="step-out">{s.output}</pre>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          rows={2}
          value={draft}
          placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {running ? (
          <button className="stop-btn" onClick={onStop}>
            停止
          </button>
        ) : (
          <button className="send-btn" onClick={submit} disabled={!draft.trim()}>
            运行
          </button>
        )}
      </div>
    </section>
  )
}
