import { app, BrowserWindow, Menu } from 'electron'

export function createMenu(): void {
  const openSettings = (): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('menu:open-settings')
    }
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
