import { readFile } from 'node:fs/promises'
import { wordsToSegments, type TimedWord } from '../shared/transcript-utils'
import type { TranscriptResult, TranscriptSegment } from '../shared/types'

const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true'
const TRANSCRIBE_TIMEOUT_MS = 5 * 60 * 1000

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
