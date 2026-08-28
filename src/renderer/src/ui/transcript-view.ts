import type { TranscriptSegment } from '../../../shared/types'

export interface TranscriptViewOptions {
  getCurrentTime(): number
  onSeek(time: number): void
  onRetry(): void
  onRetranscribe(): void
  onOpenSettings(): void
}

export interface TranscriptViewHandle {
  showEmpty(): void
  showLoading(): void
  showNoKey(): void
  showSegments(segments: TranscriptSegment[]): void
  showError(message: string, options?: { withSettingsLink?: boolean }): void
  updateHighlight(time: number): void
}

export function initTranscriptView(options: TranscriptViewOptions): TranscriptViewHandle {
  const body = document.getElementById('transcript-body') as HTMLElement
  const retranscribeBtn = document.getElementById('retranscribe-btn') as HTMLButtonElement
  retranscribeBtn.addEventListener('click', () => options.onRetranscribe())

  let segmentEls: HTMLElement[] = []
  let segments: TranscriptSegment[] = []
  let highlightIndex = -1

  function renderPlaceholder(text: string, action?: { label: string; onClick(): void }): void {
    segmentEls = []
    segments = []
    highlightIndex = -1
    retranscribeBtn.disabled = true
    body.textContent = ''
    const p = document.createElement('p')
    p.className = 'transcript-placeholder'
    p.textContent = text
    body.append(p)
    if (action) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'transcript-action'
      btn.textContent = action.label
      btn.addEventListener('click', action.onClick)
      body.append(btn)
    }
  }

  function updateHighlight(time: number): void {
    if (segments.length === 0) return
    let index = -1
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= time) index = i
      else break
    }
    if (index === highlightIndex) return
    if (highlightIndex >= 0) segmentEls[highlightIndex]?.classList.remove('current')
    highlightIndex = index
    if (index >= 0) {
      const el = segmentEls[index]
      el.classList.add('current')
      el.scrollIntoView({ block: 'center' })
    }
  }

  const handle: TranscriptViewHandle = {
    showEmpty() {
      renderPlaceholder('开始播放后，这里会显示同步文稿')
    },
    showLoading() {
      renderPlaceholder('正在转录中…\n首次转录约需 1 分钟，播放不受影响')
    },
    showNoKey() {
      renderPlaceholder('尚未配置 Deepgram API 密钥', {
        label: '去设置…',
        onClick: () => options.onOpenSettings()
      })
    },
    showError(message: string, opts?: { withSettingsLink?: boolean }) {
      renderPlaceholder(message, { label: '重试', onClick: () => options.onRetry() })
      if (opts?.withSettingsLink) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'transcript-action'
        btn.textContent = '去设置…'
        btn.addEventListener('click', () => options.onOpenSettings())
        body.append(btn)
      }
    },
    showSegments(list: TranscriptSegment[]) {
      segments = list
      segmentEls = []
      highlightIndex = -1
      retranscribeBtn.disabled = segments.length === 0
      body.textContent = ''
      if (segments.length === 0) {
        renderPlaceholder('未识别到语音内容')
        return
      }
      const ol = document.createElement('ol')
      ol.className = 'transcript-list'
      for (const seg of segments) {
        const li = document.createElement('li')
        li.className = 'transcript-seg'
        li.textContent = seg.text
        li.title = '点击跳转到此句'
        li.addEventListener('click', () => {
          // 拖选产生的非空选区视为选择操作，不触发跳转（FR-40）
          const selection = window.getSelection()
          if (selection && !selection.isCollapsed) return
          options.onSeek(seg.start)
        })
        ol.append(li)
        segmentEls.push(li)
      }
      body.append(ol)
      updateHighlight(options.getCurrentTime())
    },
    updateHighlight
  }
  handle.showEmpty()
  return handle
}
