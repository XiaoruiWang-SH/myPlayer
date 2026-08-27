export type LoopMode = 'list' | 'single' | 'sequential'

export type MediaCommand = 'play-pause' | 'next' | 'previous'

export interface Settings {
  seekStep: number
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
  playbackState: PlaybackState
}

export interface MyPlayerBridge {
  openFiles(): Promise<string[]>
  allowPaths(paths: string[]): Promise<void>
  getPathForFile(file: File): string
  loadState(): Promise<PersistedData>
  saveState(state: PlaybackState): Promise<void>
  saveStateSync(state: PlaybackState): void
  getSettings(): Promise<Settings>
  setSettings(settings: Settings): Promise<void>
  filterExisting(paths: string[]): Promise<{ valid: string[]; missing: string[] }>
  onMediaCommand(cb: (cmd: MediaCommand) => void): () => void
  onOpenSettings(cb: () => void): () => void
}
