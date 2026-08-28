import { describe, expect, it } from 'vitest'
import { SEGMENT_GAP_SECONDS, transcriptCacheKey, wordsToSegments } from './transcript-utils'

describe('wordsToSegments', () => {
  it('空输入返回空数组', () => {
    expect(wordsToSegments([])).toEqual([])
  })

  it('按句末标点切分句子', () => {
    const segments = wordsToSegments([
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'world.', start: 0.6, end: 1.2 },
      { text: 'How', start: 1.3, end: 1.5 },
      { text: 'are', start: 1.6, end: 1.8 },
      { text: 'you?', start: 1.9, end: 2.2 },
    ])
    expect(segments).toEqual([
      { start: 0, end: 1.2, text: 'Hello world.' },
      { start: 1.3, end: 2.2, text: 'How are you?' },
    ])
  })

  it('无标点时按停顿（>2 秒）切分', () => {
    const segments = wordsToSegments([
      { text: 'first', start: 0, end: 0.5 },
      { text: 'part', start: 0.6, end: 1 },
      { text: 'second', start: 1 + SEGMENT_GAP_SECONDS + 0.1, end: 4 },
    ])
    expect(segments).toHaveLength(2)
    expect(segments[0].text).toBe('first part')
    expect(segments[1].text).toBe('second')
  })

  it('间隔不超过 2 秒时不切分', () => {
    const segments = wordsToSegments([
      { text: 'a', start: 0, end: 0.5 },
      { text: 'b', start: 0.5 + SEGMENT_GAP_SECONDS, end: 3 },
    ])
    expect(segments).toEqual([{ start: 0, end: 3, text: 'a b' }])
  })

  it('混合标点与停顿切分，片段起止时间取首尾词', () => {
    const segments = wordsToSegments([
      { text: 'Welcome.', start: 1, end: 1.8 },
      { text: 'Next', start: 10, end: 10.4 },
      { text: 'topic!', start: 10.5, end: 11 },
    ])
    expect(segments).toEqual([
      { start: 1, end: 1.8, text: 'Welcome.' },
      { start: 10, end: 11, text: 'Next topic!' },
    ])
  })

  it('忽略空白词', () => {
    const segments = wordsToSegments([
      { text: ' ', start: 0, end: 0.1 },
      { text: 'ok.', start: 0.2, end: 0.6 },
    ])
    expect(segments).toEqual([{ start: 0.2, end: 0.6, text: 'ok.' }])
  })

  it('结尾无标点的剩余词语收束为最后一个片段', () => {
    const segments = wordsToSegments([
      { text: 'no', start: 0, end: 0.3 },
      { text: 'ending', start: 0.4, end: 0.9 },
    ])
    expect(segments).toEqual([{ start: 0, end: 0.9, text: 'no ending' }])
  })
})

describe('transcriptCacheKey', () => {
  it('相同输入产出稳定的 40 位十六进制键', async () => {
    const key = await transcriptCacheKey('/music/a.mp3', 1234, 1700000000000)
    expect(key).toMatch(/^[0-9a-f]{40}$/)
    await expect(transcriptCacheKey('/music/a.mp3', 1234, 1700000000000)).resolves.toBe(key)
  })

  it('路径、大小、修改时间任一变化都会改变键', async () => {
    const base = await transcriptCacheKey('/music/a.mp3', 1234, 1700000000000)
    await expect(transcriptCacheKey('/music/b.mp3', 1234, 1700000000000)).resolves.not.toBe(base)
    await expect(transcriptCacheKey('/music/a.mp3', 1235, 1700000000000)).resolves.not.toBe(base)
    await expect(transcriptCacheKey('/music/a.mp3', 1234, 1700000000001)).resolves.not.toBe(base)
  })
})
