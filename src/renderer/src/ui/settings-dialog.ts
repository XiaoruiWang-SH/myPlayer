import { SEEK_STEP_MAX, SEEK_STEP_MIN, normalizeSeekStep } from '../../../shared/settings-utils'

export interface SettingsDialogOptions {
  getCurrentStep(): number
  applyStep(step: number): void
}

export interface SettingsDialogHandle {
  open(): void
}

export function initSettingsDialog(options: SettingsDialogOptions): SettingsDialogHandle {
  const overlay = document.createElement('div')
  overlay.className = 'settings-overlay'

  const dialog = document.createElement('div')
  dialog.className = 'settings-dialog'
  dialog.innerHTML = `
    <h2>设置</h2>
    <label class="settings-field">
      <span>快进 / 快退步长（${SEEK_STEP_MIN}–${SEEK_STEP_MAX} 秒）</span>
      <input type="number" min="${SEEK_STEP_MIN}" max="${SEEK_STEP_MAX}" step="1" />
    </label>
    <div class="settings-field">
      <span>Deepgram API 密钥（转录功能，可选）</span>
      <div class="settings-key-row">
        <input type="password" class="settings-key-input" placeholder="填入或替换密钥" autocomplete="off" />
        <button type="button" class="settings-key-save">保存</button>
        <button type="button" class="settings-key-clear">清除</button>
      </div>
      <span class="settings-key-status"></span>
    </div>
    <p class="settings-error" role="alert"></p>
    <div class="settings-actions">
      <button type="button" class="settings-cancel">取消</button>
      <button type="button" class="settings-save">保存</button>
    </div>
  `
  overlay.append(dialog)
  document.body.append(overlay)

  const input = dialog.querySelector('input[type="number"]') as HTMLInputElement
  const keyInput = dialog.querySelector('.settings-key-input') as HTMLInputElement
  const keySaveBtn = dialog.querySelector('.settings-key-save') as HTMLButtonElement
  const keyClearBtn = dialog.querySelector('.settings-key-clear') as HTMLButtonElement
  const keyStatus = dialog.querySelector('.settings-key-status') as HTMLElement
  const errorEl = dialog.querySelector('.settings-error') as HTMLElement
  const saveBtn = dialog.querySelector('.settings-save') as HTMLButtonElement
  const cancelBtn = dialog.querySelector('.settings-cancel') as HTMLButtonElement

  function close(): void {
    overlay.hidden = true
    document.removeEventListener('keydown', onKeyDown, true)
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }

  function save(): void {
    const step = normalizeSeekStep(input.value)
    if (step === null) {
      errorEl.textContent = `请输入 ${SEEK_STEP_MIN}–${SEEK_STEP_MAX} 之间的数字`
      input.focus()
      input.select()
      return
    }
    errorEl.textContent = ''
    options.applyStep(step)
    close()
  }

  async function refreshKeyStatus(): Promise<void> {
    const status = await window.myPlayer.getDeepgramApiKeyStatus()
    keyStatus.textContent = status.configured
      ? `已配置（${status.maskedKey ?? ''}）`
      : '未配置'
  }

  async function saveKey(): Promise<void> {
    const key = keyInput.value.trim()
    if (key === '') {
      errorEl.textContent = '请输入 Deepgram API 密钥'
      keyInput.focus()
      return
    }
    try {
      await window.myPlayer.setDeepgramApiKey(key)
      keyInput.value = ''
      errorEl.textContent = ''
      await refreshKeyStatus()
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : '密钥保存失败'
    }
  }

  async function clearKey(): Promise<void> {
    await window.myPlayer.clearDeepgramApiKey()
    keyInput.value = ''
    errorEl.textContent = ''
    await refreshKeyStatus()
  }

  function open(): void {
    input.value = String(options.getCurrentStep())
    keyInput.value = ''
    errorEl.textContent = ''
    void refreshKeyStatus()
    overlay.hidden = false
    document.addEventListener('keydown', onKeyDown, true)
    input.focus()
    input.select()
  }

  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close()
  })
  cancelBtn.addEventListener('click', close)
  saveBtn.addEventListener('click', save)
  keySaveBtn.addEventListener('click', () => void saveKey())
  keyClearBtn.addEventListener('click', () => void clearKey())
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save()
  })
  keyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void saveKey()
  })

  overlay.hidden = true
  return { open }
}
