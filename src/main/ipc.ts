import { BrowserWindow, dialog, ipcMain } from 'electron'
import { access } from 'node:fs/promises'
import type { TranscriptResult } from '../shared/types'
import { allowMediaPath } from './protocol'
import {
  clearDeepgramApiKey,
  getApiKeyStatus,
  readPersistedState,
  readSettings,
  saveDeepgramApiKey,
  writePlaybackState,
  writeSettings
} from './store'
import { getTranscript } from './transcript'

export function setupIpc(): void {
  ipcMain.handle('files:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '打开音频文件',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'MP3', extensions: ['mp3'] }]
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return []
    for (const path of filePaths) allowMediaPath(path)
    return filePaths
  })

  ipcMain.handle('files:allow', (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return
    for (const path of paths) {
      if (typeof path === 'string' && path.length > 0) allowMediaPath(path)
    }
  })

  ipcMain.handle('files:filter-existing', async (_event, paths: unknown) => {
    const valid: string[] = []
    const missing: string[] = []
    if (!Array.isArray(paths)) return { valid, missing }
    for (const path of paths) {
      if (typeof path !== 'string' || path.length === 0) continue
      try {
        await access(path)
        allowMediaPath(path)
        valid.push(path)
      } catch {
        missing.push(path)
      }
    }
    return { valid, missing }
  })

  ipcMain.handle('state:load', () => readPersistedState())

  ipcMain.handle('state:save', (_event, state: unknown) => {
    writePlaybackState(state)
  })

  ipcMain.on('state:save-sync', (event, state: unknown) => {
    writePlaybackState(state)
    event.returnValue = null
  })

  ipcMain.handle('settings:get', () => readSettings())

  ipcMain.handle('settings:set', (_event, settings: unknown) => {
    writeSettings(settings)
  })

  ipcMain.handle('secrets:set-deepgram-key', (_event, key: unknown) => {
    if (typeof key !== 'string') throw new Error('API 密钥格式无效')
    saveDeepgramApiKey(key)
  })

  ipcMain.handle('secrets:clear-deepgram-key', () => {
    clearDeepgramApiKey()
  })

  ipcMain.handle('secrets:deepgram-key-status', () => getApiKeyStatus())

  ipcMain.handle('transcript:get', (_event, filePath: unknown, options: unknown): Promise<TranscriptResult> | TranscriptResult => {
    if (typeof filePath !== 'string' || filePath === '') {
      return { status: 'error', code: 'unknown', message: '无效的音频路径' }
    }
    const force =
      typeof options === 'object' && options !== null && (options as { force?: unknown }).force === true
    return getTranscript(filePath, force)
  })
}
