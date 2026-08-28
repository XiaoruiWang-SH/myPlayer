import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { MediaCommand, MyPlayerBridge } from '../shared/types'

const api: MyPlayerBridge = {
  openFiles: () => ipcRenderer.invoke('files:open'),
  allowPaths: (paths) => ipcRenderer.invoke('files:allow', paths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  saveStateSync: (state) => {
    ipcRenderer.sendSync('state:save-sync', state)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  filterExisting: (paths) => ipcRenderer.invoke('files:filter-existing', paths),
  importToLibrary: (sourcePaths) => ipcRenderer.invoke('library:import', sourcePaths),
  renameLibraryFile: (path, newName) => ipcRenderer.invoke('library:rename', path, newName),
  deleteLibraryFile: (path, trackId) => ipcRenderer.invoke('library:delete', path, trackId),
  setDeepgramApiKey: (key) => ipcRenderer.invoke('secrets:set-deepgram-key', key),
  clearDeepgramApiKey: () => ipcRenderer.invoke('secrets:clear-deepgram-key'),
  getDeepgramApiKeyStatus: () => ipcRenderer.invoke('secrets:deepgram-key-status'),
  getTranscript: (path, options) => ipcRenderer.invoke('transcript:get', path, options),
  onMediaCommand: (cb) => {
    const listener = (_event: IpcRendererEvent, cmd: MediaCommand): void => cb(cmd)
    ipcRenderer.on('media:command', listener)
    return () => {
      ipcRenderer.removeListener('media:command', listener)
    }
  },
  onOpenSettings: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:open-settings', listener)
    return () => {
      ipcRenderer.removeListener('menu:open-settings', listener)
    }
  }
}

contextBridge.exposeInMainWorld('myPlayer', api)
