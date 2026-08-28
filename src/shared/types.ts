export type LoopMode = 'list' | 'single' | 'sequential'

export type MediaCommand = 'play-pause' | 'next' | 'previous'

export interface Settings {
  seekStep: number
}

export interface Secrets {
  deepgramApiKey?: string
}

export interface ApiKeyStatus {
  configured: boolean
  maskedKey: string | null
}

export interface PlaybackState {
  playlist: string[]
  currentIndex: number
  currentTime: number
  volume: number
  muted: boolean
  rate: number
  loopMode: LoopMode
}

export interface PersistedData {
  settings: Settings
  secrets: Secrets
  playbackState: PlaybackState
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export type TranscriptResult =
  | { status: 'ok'; segments: TranscriptSegment[]; fromCache: boolean }
  | { status: 'no-key' }
  | { status: 'error'; code: 'unauthorized' | 'quota' | 'network' | 'unknown'; message: string }

export interface MyPlayerBridge {
  openFiles(): Promise<string[]>
  allowPaths(paths: string[]): Promise<void>
  getPathForFile(file: File): string
  loadState(): Promise<Omit<PersistedData, 'secrets'>>
  saveState(state: PlaybackState): Promise<void>
  saveStateSync(state: PlaybackState): void
  getSettings(): Promise<Settings>
  setSettings(settings: Settings): Promise<void>
  filterExisting(paths: string[]): Promise<{ valid: string[]; missing: string[] }>
  setDeepgramApiKey(key: string): Promise<void>
  clearDeepgramApiKey(): Promise<void>
  getDeepgramApiKeyStatus(): Promise<ApiKeyStatus>
  getTranscript(path: string, options?: { force?: boolean }): Promise<TranscriptResult>
  onMediaCommand(cb: (cmd: MediaCommand) => void): () => void
  onOpenSettings(cb: () => void): () => void
}
