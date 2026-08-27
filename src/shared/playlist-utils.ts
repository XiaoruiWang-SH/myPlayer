import type { LoopMode } from './types'

export function isMp3Path(path: string): boolean {
  return /\.mp3$/i.test(path)
}

export function dedupeKey(path: string): string {
  return path.toLowerCase()
}

export function trackDisplayName(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.mp3$/i, '')
}

// 返回 null 表示「应当停止」（顺序播放播完最后一首）
export function nextTrackIndex(current: number, count: number, mode: LoopMode): number | null {
  if (count === 0) return null
  if (mode === 'single') return current >= 0 && current < count ? current : 0
  if (mode === 'sequential') return current + 1 < count ? current + 1 : null
  return (current + 1) % count
}

export function prevTrackIndex(current: number, count: number, mode: LoopMode): number {
  if (count === 0) return -1
  if (mode === 'single') return current >= 0 && current < count ? current : 0
  if (current <= 0) return mode === 'list' ? count - 1 : 0
  return current - 1
}
