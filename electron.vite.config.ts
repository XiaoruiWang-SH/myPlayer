import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: 'src/renderer/',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    }
  }
})
