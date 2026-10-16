import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const MAX_BODY = 1_000_000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/api/health') {
    return json(res, 200, { ok: true, demo: true })
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    let payload
    try {
      payload = await readJson(req)
    } catch (err) {
      return json(res, 400, { error: { message: err.message } })
    }
    return handleChat(payload, res)
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: { message: '方法不允许' } })
  }

  return serveStatic(url.pathname, res)
})

async function handleChat(payload, res) {
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const model = String(payload.model || 'qwen-plus')
  const apiKey = String(payload.apiKey || '').trim()
  const baseUrl = String(payload.baseUrl || '').trim()
  const temperature = Number.isFinite(payload.temperature)
    ? payload.temperature
    : 0.7

  if (!apiKey) {
    return json(res, 400, {
      error: { message: 'DEMO_MODE: 演示模式由前端本地模拟，不应请求后端' }
    })
  }
  if (!baseUrl) {
    return json(res, 400, { error: { message: '请填写 Base URL' } })
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  let upstream
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature
      })
    })
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: { message: `无法连接上游接口：${err.message}` } })}\n\n`)
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    res.write(`data: ${JSON.stringify({ error: { message: parseUpstreamError(text, upstream.status) } })}\n\n`)
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  const reader = upstream.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  } catch {
    /* 客户端断开，忽略 */
  } finally {
    res.write('data: [DONE]\n\n')
    res.end()
  }
}

function parseUpstreamError(text, status) {
  try {
    const json = JSON.parse(text)
    return json?.error?.message || json?.message || `上游返回 ${status}`
  } catch {
    return `上游返回 ${status}${text ? '：' + text.slice(0, 160) : ''}`
  }
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'

  const target = path.join(DIST, rel)
  if (!target.startsWith(DIST)) {
    return json(res, 403, { error: { message: '禁止访问' } })
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      const fallback = path.join(DIST, 'index.html')
      if (!fs.existsSync(fallback)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('未找到构建产物，请先运行 npm run build')
      }
      return streamFile(res, fallback)
    }
    return streamFile(res, target)
  })
}

function streamFile(res, file) {
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  })
  fs.createReadStream(file).pipe(res)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  })
  res.end(text)
}

server.listen(PORT, HOST, () => {
  console.log(`Agent Studio 服务已启动: http://localhost:${PORT}`)
})
