import { DEFAULT_SEEK_STEP } from './audio-utils'

export const SEEK_STEP_MIN = 1
export const SEEK_STEP_MAX = 120

export { DEFAULT_SEEK_STEP }

export function normalizeSeekStep(input: unknown): number | null {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed === '') return null
    input = Number(trimmed)
  }
  if (typeof input !== 'number' || !Number.isFinite(input)) return null
  if (input < SEEK_STEP_MIN || input > SEEK_STEP_MAX) return null
  return input
}
