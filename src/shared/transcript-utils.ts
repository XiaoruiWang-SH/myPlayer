import type { TranscriptSegment } from './types'

export interface TimedWord {
  text: string
  start: number
  end: number
}

export const SEGMENT_GAP_SECONDS = 2

const SENTENCE_END = /[.?!…]$/

export function wordsToSegments(words: readonly TimedWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  let current: { start: number; end: number; texts: string[] } | null = null

  const flush = (): void => {
    if (!current) return
    segments.push({ start: current.start, end: current.end, text: current.texts.join(' ') })
    current = null
  }

  for (const word of words) {
    const text = word.text.trim()
    if (text === '') continue
    if (current && word.start - current.end > SEGMENT_GAP_SECONDS) flush()
    if (!current) current = { start: word.start, end: word.end, texts: [] }
    current.texts.push(text)
    current.end = Math.max(current.end, word.end)
    if (SENTENCE_END.test(text)) flush()
  }
  flush()
  return segments
}

export async function transcriptCacheKey(
  filePath: string,
  size: number,
  mtimeMs: number
): Promise<string> {
  const data = new TextEncoder().encode(`${filePath}\n${size}\n${mtimeMs}`)
  const digest = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
