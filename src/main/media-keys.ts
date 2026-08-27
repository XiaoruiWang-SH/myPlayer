import { BrowserWindow, globalShortcut } from 'electron'
import type { MediaCommand } from '../shared/types'

// MediaSession 实测不稳定时改为 true 启用兜底（技术文档 §3.5）；两条路径不同时启用
const FALLBACK_ENABLED = false

function broadcast(cmd: MediaCommand): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('media:command', cmd)
  }
}

export function setupMediaKeys(): void {
  if (!FALLBACK_ENABLED) return
  globalShortcut.register('MediaPlayPause', () => broadcast('play-pause'))
  globalShortcut.register('MediaNextTrack', () => broadcast('next'))
  globalShortcut.register('MediaPreviousTrack', () => broadcast('previous'))
}

export function teardownMediaKeys(): void {
  if (!FALLBACK_ENABLED) return
  globalShortcut.unregisterAll()
}
