import { describe, expect, it } from 'vitest'
import {
  dedupeKey,
  isMp3Path,
  nextTrackIndex,
  prevTrackIndex,
  trackDisplayName
} from './playlist-utils'

describe('isMp3Path / dedupeKey（FR-13 去重、FR-14 格式过滤）', () => {
  it('仅接受 .mp3 后缀（大小写不敏感）', () => {
    expect(isMp3Path('/a/b.mp3')).toBe(true)
    expect(isMp3Path('/a/b.MP3')).toBe(true)
    expect(isMp3Path('/a/b.Mp3')).toBe(true)
    expect(isMp3Path('/a/b.flac')).toBe(false)
    expect(isMp3Path('/a/b.m4a')).toBe(false)
    expect(isMp3Path('/a/mp3')).toBe(false)
    expect(isMp3Path('/a/b.mp3.txt')).toBe(false)
  })

  it('去重键大小写不敏感', () => {
    expect(dedupeKey('/A/B.MP3')).toBe(dedupeKey('/a/b.mp3'))
    expect(dedupeKey('/a/b.mp3')).not.toBe(dedupeKey('/a/c.mp3'))
  })

  it('展示名去掉目录与扩展名', () => {
    expect(trackDisplayName('/Users/me/Music/歌名.MP3')).toBe('歌名')
    expect(trackDisplayName('solo.mp3')).toBe('solo')
  })
})

describe('nextTrackIndex（FR-07/FR-11 循环模式）', () => {
  it('列表循环：末尾回绕到第一首', () => {
    expect(nextTrackIndex(2, 3, 'list')).toBe(0)
    expect(nextTrackIndex(0, 3, 'list')).toBe(1)
  })

  it('单曲循环：保持当前', () => {
    expect(nextTrackIndex(1, 3, 'single')).toBe(1)
  })

  it('顺序播放：未到末尾前进，最后一首返回 null（停止）', () => {
    expect(nextTrackIndex(0, 3, 'sequential')).toBe(1)
    expect(nextTrackIndex(2, 3, 'sequential')).toBeNull()
  })

  it('空列表返回 null', () => {
    expect(nextTrackIndex(-1, 0, 'list')).toBeNull()
    expect(nextTrackIndex(-1, 0, 'sequential')).toBeNull()
  })

  it('未选中（-1）时从第一首开始', () => {
    expect(nextTrackIndex(-1, 3, 'list')).toBe(0)
    expect(nextTrackIndex(-1, 3, 'sequential')).toBe(0)
    expect(nextTrackIndex(-1, 3, 'single')).toBe(0)
  })
})

describe('prevTrackIndex（上一首边界，首尾行为按循环模式）', () => {
  it('列表循环：第一首回绕到末尾', () => {
    expect(prevTrackIndex(0, 3, 'list')).toBe(2)
    expect(prevTrackIndex(2, 3, 'list')).toBe(1)
  })

  it('顺序播放：第一首保持不动', () => {
    expect(prevTrackIndex(0, 3, 'sequential')).toBe(0)
    expect(prevTrackIndex(2, 3, 'sequential')).toBe(1)
  })

  it('单曲循环：保持当前', () => {
    expect(prevTrackIndex(1, 3, 'single')).toBe(1)
  })

  it('空列表返回 -1', () => {
    expect(prevTrackIndex(0, 0, 'list')).toBe(-1)
  })
})
