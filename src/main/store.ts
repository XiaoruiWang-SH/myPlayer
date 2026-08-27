import type Store from 'electron-store'
import { DEFAULT_SEEK_STEP, SPEED_STEPS } from '../shared/audio-utils'
import { normalizeSeekStep } from '../shared/settings-utils'
import type { LoopMode, PersistedData, PlaybackState, Settings } from '../shared/types'

const LOOP_MODES: readonly LoopMode[] = ['list', 'single', 'sequential']

const DEFAULTS: PersistedData = {
  settings: { seekStep: DEFAULT_SEEK_STEP },
  playbackState: {
    playlist: [],
    currentIndex: -1,
    currentTime: 0,
    volume: 100,
    muted: false,
    rate: 1,
    loopMode: 'list'
  }
}

// electron-store 是 ESM-only 包，主进程 CJS 产物只能动态 import
let store: Store<PersistedData> | null = null

export async function initStore(): Promise<void> {
  if (store) return
  const { default: StoreCtor } = await import('electron-store')
  store = new StoreCtor<PersistedData>({ defaults: DEFAULTS })
}

function getStore(): Store<PersistedData> {
  if (!store) throw new Error('Store 尚未初始化（需先调用 initStore）')
  return store
}

export function sanitizePlaybackState(input: unknown): PlaybackState {
  const fallback = DEFAULTS.playbackState
  if (typeof input !== 'object' || input === null) return { ...fallback, playlist: [] }
  const raw = input as Partial<PlaybackState>

  const playlist = Array.isArray(raw.playlist)
    ? raw.playlist.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : []
  let currentIndex = Number.isInteger(raw.currentIndex) ? (raw.currentIndex as number) : -1
  if (currentIndex < -1 || currentIndex >= playlist.length) currentIndex = -1
  const currentTime =
    typeof raw.currentTime === 'number' && Number.isFinite(raw.currentTime) && raw.currentTime >= 0
      ? raw.currentTime
      : 0
  const volume =
    typeof raw.volume === 'number' && Number.isFinite(raw.volume)
      ? Math.min(Math.max(Math.round(raw.volume), 0), 100)
      : fallback.volume
  const rate = SPEED_STEPS.includes(raw.rate as (typeof SPEED_STEPS)[number])
    ? (raw.rate as number)
    : fallback.rate
  const loopMode = LOOP_MODES.includes(raw.loopMode as LoopMode)
    ? (raw.loopMode as LoopMode)
    : fallback.loopMode

  return {
    playlist,
    currentIndex,
    currentTime,
    volume,
    muted: raw.muted === true,
    rate,
    loopMode
  }
}

export function sanitizeSettings(input: unknown): Settings {
  const fallback = DEFAULTS.settings
  if (typeof input !== 'object' || input === null) return { ...fallback }
  const raw = input as Partial<Settings>
  const seekStep = normalizeSeekStep(raw.seekStep)
  return { seekStep: seekStep ?? fallback.seekStep }
}

export function readPersistedState(): PersistedData {
  try {
    const s = getStore()
    return {
      settings: sanitizeSettings(s.get('settings')),
      playbackState: sanitizePlaybackState(s.get('playbackState'))
    }
  } catch {
    return { settings: { ...DEFAULTS.settings }, playbackState: { ...DEFAULTS.playbackState, playlist: [] } }
  }
}

export function writePlaybackState(input: unknown): void {
  getStore().set('playbackState', sanitizePlaybackState(input))
}

export function readSettings(): Settings {
  return sanitizeSettings(getStore().get('settings'))
}

export function writeSettings(input: unknown): Settings {
  const settings = sanitizeSettings(input)
  getStore().set('settings', settings)
  return settings
}
