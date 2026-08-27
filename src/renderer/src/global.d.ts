import type { MyPlayerBridge } from '../../shared/types'

declare global {
  interface Window {
    myPlayer: MyPlayerBridge
  }
}

export {}
