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
  playlist: PersistedTrack[]
  currentIndex: number
  currentTime: number
  volume: number
  muted: boolean
  rate: number
  loopMode: LoopMode
}

export interface PersistedData {
  version?: number
  settings: Settings
  secrets: Secrets
  playbackState: PlaybackState
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

// v1.2：曲目持久化结构（不含运行时字段）
export interface PersistedTrack {
  id: string
  path: string
  importedFrom?: string
  addedAt: number
  position: number
  played: boolean
}

// v1.2：媒体库导入结果
export type ImportResult =
  | { sourcePath: string; ok: true; libraryPath: string }
  | { sourcePath: string; ok: false; reason: string }

// v1.3：条目右键菜单命令（主进程 → 渲染层）
export interface TrackMenuCommand {
  index: number
  action: 'rename' | 'delete'
}

// v1.3：危险操作确认对话框
export interface ConfirmOptions {
  title: string
  message: string
  detail?: string
  confirmLabel: string
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
  importToLibrary(sourcePaths: string[]): Promise<ImportResult[]>
  renameLibraryFile(path: string, newName: string): Promise<string>
  deleteLibraryFile(path: string, trackId: string): Promise<void>
  openTrackMenu(index: number, path: string): Promise<void>
  onTrackMenuCommand(cb: (cmd: TrackMenuCommand) => void): () => void
  confirmAction(options: ConfirmOptions): Promise<boolean>
  setDeepgramApiKey(key: string): Promise<void>
  clearDeepgramApiKey(): Promise<void>
  getDeepgramApiKeyStatus(): Promise<ApiKeyStatus>
  getTranscript(path: string, options: { id: string; force?: boolean }): Promise<TranscriptResult>
  onMediaCommand(cb: (cmd: MediaCommand) => void): () => void
  onOpenSettings(cb: () => void): () => void
}
