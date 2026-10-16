/**
 * 轻量检索：无外部依赖、无 embedding 模型，用 bigram + IDF 加权打分。
 * 中文没有空格，二元切分（bigram）是不依赖分词词典时最实用的召回方案。
 */
export function retrieve(query: string, docs: string, topK = 3): string[] {
  const chunks = splitDocs(docs)
  if (chunks.length === 0) return []

  const qTokens = tokenize(query)
  if (qTokens.length === 0) return chunks.slice(0, topK)

  const docTokens = chunks.map(tokenize)
  const df = new Map<string, number>()
  for (const tokens of docTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = chunks.length

  const scored = chunks.map((chunk, i) => {
    const tf = new Map<string, number>()
    for (const t of docTokens[i]) tf.set(t, (tf.get(t) ?? 0) + 1)

    let score = 0
    for (const qt of new Set(qTokens)) {
      const idf = Math.log(1 + N / (1 + (df.get(qt) ?? 0)))
      score += (tf.get(qt) ?? 0) * idf
    }
    return { chunk, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.chunk)
}

export function splitDocs(docs: string): string[] {
  return docs
    .split(/\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 1)
}

function tokenize(input: string): string[] {
  const cleaned = input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
  const tokens: string[] = []

  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^[a-z0-9]+$/i.test(part)) {
      tokens.push(part)
      continue
    }
    for (let i = 0; i < part.length - 1; i++) tokens.push(part.slice(i, i + 2))
    if (part.length === 1) tokens.push(part)
  }
  return tokens
}
