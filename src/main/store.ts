import type Store from 'electron-store'
import { app, safeStorage } from 'electron'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SEEK_STEP, SPEED_STEPS } from '../shared/audio-utils'
import { normalizeSeekStep } from '../shared/settings-utils'
import type {
  ApiKeyStatus,
  LoopMode,
  PersistedData,
  PersistedTrack,
  PlaybackState,
  Settings
} from '../shared/types'

const LOOP_MODES: readonly LoopMode[] = ['list', 'single', 'sequential']
export const SCHEMA_VERSION = 2

const DEFAULTS: PersistedData = {
  settings: { seekStep: DEFAULT_SEEK_STEP },
  secrets: {},
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
  await migrateToSchemaV2()
}

// v1.2（FR-36）：旧列表指向库外路径，清空重来；保留设置与密钥
async function migrateToSchemaV2(): Promise<void> {
  const s = getStore()
  if (s.get('version') === SCHEMA_VERSION) return
  s.set('playbackState', { ...DEFAULTS.playbackState, playlist: [] })
  s.set('version', SCHEMA_VERSION)
  try {
    await rm(path.join(app.getPath('userData'), 'transcripts'), { recursive: true, force: true })
  } catch {
    // 旧缓存清理失败不影响启动
  }
}

function getStore(): Store<PersistedData> {
  if (!store) throw new Error('Store 尚未初始化（需先调用 initStore）')
  return store
}

function sanitizeTrack(input: unknown): PersistedTrack | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Partial<PersistedTrack>
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (typeof raw.path !== 'string' || raw.path === '') return null
  return {
    id: raw.id,
    path: raw.path,
    importedFrom:
      typeof raw.importedFrom === 'string' && raw.importedFrom !== '' ? raw.importedFrom : undefined,
    addedAt:
      typeof raw.addedAt === 'number' && Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
    position:
      typeof raw.position === 'number' && Number.isFinite(raw.position) && raw.position >= 0
        ? raw.position
        : 0,
    played: raw.played === true
  }
}

export function sanitizePlaybackState(input: unknown): PlaybackState {
  const fallback = DEFAULTS.playbackState
  if (typeof input !== 'object' || input === null) return { ...fallback, playlist: [] }
  const raw = input as Partial<PlaybackState>

  const playlist = Array.isArray(raw.playlist)
    ? raw.playlist
        .map(sanitizeTrack)
        .filter((track): track is PersistedTrack => track !== null)
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

export function readPersistedState(): Omit<PersistedData, 'secrets'> {
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

export function saveDeepgramApiKey(plainKey: string): void {
  const key = plainKey.trim()
  if (key === '') throw new Error('API 密钥不能为空')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统不支持密钥加密存储')
  getStore().set('secrets', { deepgramApiKey: safeStorage.encryptString(key).toString('base64') })
}

export function clearDeepgramApiKey(): void {
  getStore().set('secrets', {})
}

export function getDecryptedApiKey(): string | null {
  const cipher = getStore().get('secrets').deepgramApiKey
  if (typeof cipher !== 'string' || cipher === '') return null
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  } catch {
    return null
  }
}

export function getApiKeyStatus(): ApiKeyStatus {
  const key = getDecryptedApiKey()
  if (!key) return { configured: false, maskedKey: null }
  const tail = key.length >= 4 ? key.slice(-4) : key
  return { configured: true, maskedKey: `••••••••${tail}` }
}
