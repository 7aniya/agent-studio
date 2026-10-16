import type { Settings } from '../types'
import { mockStreamChat } from './mock'

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 通过自建后端代理以 SSE 方式读取大模型输出。
 * 不直连厂商接口，避免浏览器 CORS 限制与 Key 暴露在前端构建产物里。
 */
export async function streamChat(
  messages: ChatMsg[],
  settings: Settings,
  onDelta: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // 未配置 Key 时切到本地模拟，保证任何人打开都能看到完整链路
  if (!settings.apiKey?.trim()) {
    return mockStreamChat(messages, onDelta, signal)
  }

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, ...settings }),
    signal
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(pickError(text, res.status))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue

      let json: any
      try {
        json = JSON.parse(payload)
      } catch {
        continue
      }
      if (json.error) throw new Error(json.error.message || '上游接口返回错误')

      const delta = json?.choices?.[0]?.delta?.content ?? ''
      if (delta) {
        full += delta
        onDelta(delta)
      }
    }
  }

  return full
}

function pickError(text: string, status: number): string {
  try {
    const json = JSON.parse(text)
    return json?.error?.message || json?.message || `请求失败 (${status})`
  } catch {
    return text?.slice(0, 200) || `请求失败 (${status})`
  }
}
