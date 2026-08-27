export const DEFAULT_SEEK_STEP = 5
export const VOLUME_STEP = 5
export const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export function clampSeekTime(currentTime: number, delta: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(Math.max(currentTime + delta, 0), duration)
}

export function adjustVolume(volume: number, delta: number): number {
  return Math.min(Math.max(Math.round(volume + delta), 0), 100)
}

export function nextSpeed(current: number): number {
  const index = SPEED_STEPS.indexOf(current as (typeof SPEED_STEPS)[number])
  return SPEED_STEPS[(index + 1) % SPEED_STEPS.length]
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
