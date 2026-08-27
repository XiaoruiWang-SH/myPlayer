import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MyPlayerBridge } from '../shared/types'

const api: MyPlayerBridge = {
  openFiles: () => ipcRenderer.invoke('files:open'),
  allowPaths: (paths) => ipcRenderer.invoke('files:allow', paths),
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('myPlayer', api)
