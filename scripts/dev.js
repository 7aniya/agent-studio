import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const viteBin = path.join(ROOT, 'node_modules', '.bin', isWin ? 'vite.cmd' : 'vite')

const children = [
  spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    stdio: 'inherit'
  }),
  spawn(viteBin, [], { cwd: ROOT, stdio: 'inherit', shell: isWin })
]

function shutdown() {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM')
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

for (const c of children) {
  c.on('exit', code => {
    if (code !== 0 && code !== null) shutdown()
  })
}
