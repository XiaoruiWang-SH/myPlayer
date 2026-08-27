export type LoopMode = 'list' | 'single' | 'sequential'

export interface MyPlayerBridge {
  openFiles(): Promise<string[]>
  allowPaths(paths: string[]): Promise<void>
  getPathForFile(file: File): string
}
