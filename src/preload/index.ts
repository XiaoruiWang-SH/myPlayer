import { contextBridge, ipcRenderer } from 'electron'
import type { MyPlayerBridge } from '../shared/types'

const api: MyPlayerBridge = {
  openFiles: () => ipcRenderer.invoke('files:open')
}

contextBridge.exposeInMainWorld('myPlayer', api)
