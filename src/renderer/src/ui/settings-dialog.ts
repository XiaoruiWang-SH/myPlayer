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
    <p class="settings-error" role="alert"></p>
    <div class="settings-actions">
      <button type="button" class="settings-cancel">取消</button>
      <button type="button" class="settings-save">保存</button>
    </div>
  `
  overlay.append(dialog)
  document.body.append(overlay)

  const input = dialog.querySelector('input') as HTMLInputElement
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

  function open(): void {
    input.value = String(options.getCurrentStep())
    errorEl.textContent = ''
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
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save()
  })

  overlay.hidden = true
  return { open }
}
