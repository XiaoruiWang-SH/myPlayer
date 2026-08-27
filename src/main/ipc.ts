import { BrowserWindow, dialog, ipcMain } from 'electron'
import { allowMediaPath } from './protocol'

export function setupIpc(): void {
  ipcMain.handle('files:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '打开音频文件',
      properties: ['openFile'],
      filters: [{ name: 'MP3', extensions: ['mp3'] }]
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return []
    for (const path of filePaths) allowMediaPath(path)
    return filePaths
  })
}
