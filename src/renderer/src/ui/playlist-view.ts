import { formatTime } from '../../../shared/audio-utils'
import type { Playlist } from '../playlist'

export function renderPlaylist(
  playlist: Playlist,
  listEl: HTMLElement,
  hintEl: HTMLElement,
  onSelect: (index: number) => void,
  onRename: (index: number, newName: string) => void
): void {
  listEl.replaceChildren()
  const empty = playlist.items.length === 0
  hintEl.style.display = empty ? '' : 'none'
  listEl.style.display = empty ? 'none' : ''
  if (empty) return

  playlist.items.forEach((track, index) => {
    const li = document.createElement('li')
    li.className = 'track'
    if (index === playlist.currentIndex) li.classList.add('current')
    if (!track.playable) li.classList.add('unplayable')
    if (track.played) li.classList.add('played')

    const marker = document.createElement('span')
    marker.className = 'track-marker'
    marker.textContent = index === playlist.currentIndex ? '▶' : String(index + 1)

    const name = document.createElement('span')
    name.className = 'track-name'
    name.textContent = track.name
    name.title = track.path

    const duration = document.createElement('span')
    duration.className = 'track-duration'
    duration.textContent = !track.playable
      ? '无法播放'
      : track.duration !== undefined
        ? formatTime(track.duration)
        : '…'

    // 单击选中延迟触发，给双击重命名留出取消窗口；否则单击引发的重渲染会销毁行元素导致 dblclick 丢失
    let clickTimer: ReturnType<typeof setTimeout> | undefined
    li.addEventListener('click', () => {
      if (li.querySelector('.rename-input')) return
      clearTimeout(clickTimer)
      clickTimer = setTimeout(() => onSelect(index), 200)
    })
    li.addEventListener('dblclick', () => {
      clearTimeout(clickTimer)
      beginRename()
    })

    function beginRename(): void {
      if (li.querySelector('.rename-input')) return
      const input = document.createElement('input')
      input.className = 'rename-input'
      input.value = track.name
      input.spellcheck = false
      let finished = false
      const finish = (): void => {
        if (finished) return
        finished = true
        input.replaceWith(name)
      }
      input.addEventListener('keydown', (event) => {
        // 阻止冒泡到 window 级快捷键（编辑框内方向键不应触发快进/音量）
        event.stopPropagation()
        if (event.key === 'Enter') {
          const value = input.value
          finish()
          onRename(index, value)
        } else if (event.key === 'Escape') {
          finish()
        }
      })
      input.addEventListener('blur', finish)
      name.replaceWith(input)
      input.focus()
      input.select()
    }

    li.append(marker, name, duration)
    listEl.appendChild(li)
  })
}
