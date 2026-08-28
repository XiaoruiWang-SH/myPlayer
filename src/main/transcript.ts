import { app } from 'electron'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { wordsToSegments, type TimedWord } from '../shared/transcript-utils'
import type { TranscriptResult, TranscriptSegment } from '../shared/types'
import { getDecryptedApiKey } from './store'

const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true'
const TRANSCRIBE_TIMEOUT_MS = 5 * 60 * 1000
const CACHE_VERSION = 1
// 缓存文件名即曲目 id；限制字符集防止路径穿越
const TRACK_ID_PATTERN = /^[A-Za-z0-9-]+$/

interface DeepgramWord {
  word: string
  punctuated_word?: string
  start: number
  end: number
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ words?: DeepgramWord[] }>
    }>
  }
}

function errorResult(
  code: 'unauthorized' | 'quota' | 'network' | 'unknown',
  message: string
): TranscriptResult {
  return { status: 'error', code, message }
}

function extractSegments(payload: DeepgramResponse): TranscriptSegment[] {
  const words = payload.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
  const timed: TimedWord[] = []
  for (const w of words) {
    const text = (w.punctuated_word ?? w.word ?? '').trim()
    if (text === '') continue
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) continue
    timed.push({ text, start: w.start, end: w.end })
  }
  return wordsToSegments(timed)
}

export async function requestTranscription(
  filePath: string,
  apiKey: string
): Promise<TranscriptResult> {
  let audio: Buffer
  try {
    audio = await readFile(filePath)
  } catch {
    return errorResult('unknown', '音频文件读取失败')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS)
  try {
    const response = await fetch(DEEPGRAM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/mpeg'
      },
      body: new Uint8Array(audio),
      signal: controller.signal
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return errorResult('unauthorized', 'Deepgram 密钥无效，请在设置中检查')
      }
      if (response.status === 429) {
        return errorResult('quota', 'Deepgram 额度或频率受限，请稍后再试')
      }
      return errorResult('unknown', `Deepgram 返回错误（HTTP ${response.status}）`)
    }
    let payload: DeepgramResponse
    try {
      payload = (await response.json()) as DeepgramResponse
    } catch {
      return errorResult('unknown', 'Deepgram 响应解析失败')
    }
    return { status: 'ok', segments: extractSegments(payload), fromCache: false }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errorResult('network', '转录请求超时，请检查网络后重试')
    }
    return errorResult('network', '网络异常，转录失败')
  } finally {
    clearTimeout(timer)
  }
}

interface CachedTranscript {
  version: number
  transcribedAt: string
  source: { path: string; size: number; mtimeMs: number }
  segments: TranscriptSegment[]
}

function transcriptsDir(): string {
  return path.join(app.getPath('userData'), 'transcripts')
}

function cacheFileFor(trackId: string): string {
  return path.join(transcriptsDir(), `${trackId}.json`)
}

export async function deleteTranscriptCache(trackId: string): Promise<void> {
  if (!TRACK_ID_PATTERN.test(trackId)) return
  try {
    await unlink(cacheFileFor(trackId))
  } catch {
    // 缓存不存在视为已清理
  }
}

async function readCache(cacheFile: string): Promise<TranscriptSegment[] | null> {
  try {
    const parsed = JSON.parse(await readFile(cacheFile, 'utf8')) as CachedTranscript
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.segments)) return null
    return parsed.segments
  } catch {
    return null
  }
}

async function writeCache(
  cacheFile: string,
  source: CachedTranscript['source'],
  segments: TranscriptSegment[]
): Promise<void> {
  await mkdir(transcriptsDir(), { recursive: true })
  const payload: CachedTranscript = {
    version: CACHE_VERSION,
    transcribedAt: new Date().toISOString(),
    source,
    segments
  }
  await writeFile(cacheFile, JSON.stringify(payload), 'utf8')
}

const inFlight = new Map<string, Promise<TranscriptResult>>()

export function getTranscript(
  filePath: string,
  options: { id: string; force?: boolean }
): Promise<TranscriptResult> {
  const { id, force = false } = options
  if (!TRACK_ID_PATTERN.test(id)) {
    return Promise.resolve(errorResult('unknown', '无效的曲目 ID'))
  }
  if (!force) {
    const existing = inFlight.get(id)
    if (existing) return existing
  }
  const task = runTranscription(filePath, id, force)
  inFlight.set(id, task)
  void task.finally(() => {
    if (inFlight.get(id) === task) inFlight.delete(id)
  })
  return task
}

async function runTranscription(
  filePath: string,
  trackId: string,
  force: boolean
): Promise<TranscriptResult> {
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return errorResult('unknown', '音频文件不存在或无法读取')
  }
  const source = { path: filePath, size: fileStat.size, mtimeMs: fileStat.mtimeMs }

  const cacheFile = cacheFileFor(trackId)
  if (!force) {
    const cached = await readCache(cacheFile)
    if (cached) return { status: 'ok', segments: cached, fromCache: true }
  }

  const apiKey = getDecryptedApiKey()
  if (!apiKey) return { status: 'no-key' }

  const result = await requestTranscription(filePath, apiKey)
  if (result.status === 'ok') {
    try {
      await writeCache(cacheFile, source, result.segments)
    } catch {
      // 缓存写入失败不影响本次转录结果
    }
  }
  return result
}
