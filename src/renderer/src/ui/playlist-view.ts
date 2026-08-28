import { formatTime } from '../../../shared/audio-utils'
import type { Playlist } from '../playlist'

export function renderPlaylist(
  playlist: Playlist,
  listEl: HTMLElement,
  hintEl: HTMLElement,
  onSelect: (index: number) => void
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

    li.append(marker, name, duration)
    li.addEventListener('click', () => onSelect(index))
    listEl.appendChild(li)
  })
}
