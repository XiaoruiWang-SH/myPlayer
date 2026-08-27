import { comboFromEvent } from '../../shared/shortcut-utils'

export type ShortcutAction =
  | 'togglePlay'
  | 'seekBackward'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'prevTrack'
  | 'nextTrack'
  | 'toggleMute'
  | 'cycleLoopMode'
  | 'openFiles'
  | 'openSettings'

// PRD §6 快捷键表
const SHORTCUTS: Record<string, ShortcutAction> = {
  Space: 'togglePlay',
  ArrowLeft: 'seekBackward',
  ArrowRight: 'seekForward',
  ArrowUp: 'volumeUp',
  ArrowDown: 'volumeDown',
  'Meta+ArrowLeft': 'prevTrack',
  'Meta+ArrowRight': 'nextTrack',
  KeyM: 'toggleMute',
  KeyL: 'cycleLoopMode',
  'Meta+KeyO': 'openFiles',
  'Meta+Comma': 'openSettings'
}

// PRD §6：焦点在输入框内时仅豁免单字符类快捷键（空格、M、L）
const SINGLE_KEY_COMBOS = new Set(['Space', 'KeyM', 'KeyL'])

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

export function initShortcuts(dispatch: (action: ShortcutAction) => void): void {
  window.addEventListener('keydown', (event) => {
    const combo = comboFromEvent(event)
    const action = SHORTCUTS[combo]
    if (!action) return
    if (SINGLE_KEY_COMBOS.has(combo) && isEditableTarget(event.target)) return
    event.preventDefault()
    dispatch(action)
  })
}
