import { VOLUME_STEP, adjustVolume } from '../../shared/audio-utils'
import { nextTrackIndex, prevTrackIndex } from '../../shared/playlist-utils'
import { DurationProber } from './duration-prober'
import { Player } from './player'
import { Playlist } from './playlist'
import { initShortcuts, type ShortcutAction } from './shortcuts'
import { initPlayerBar } from './ui/player-bar'
import { renderPlaylist } from './ui/playlist-view'
import { showToast } from './ui/toast'

const player = new Player()
const playlist = new Playlist()
// 本轮连续播放失败记录，防止全部损坏时无限跳歌
const failedIds = new Set<string>()

const listEl = document.getElementById('playlist') as HTMLElement
const hintEl = document.getElementById('playlist-hint') as HTMLElement
const addBtn = document.getElementById('add-btn') as HTMLButtonElement
const removeBtn = document.getElementById('remove-btn') as HTMLButtonElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement

function render(): void {
  renderPlaylist(playlist, listEl, hintEl, (index) => void playIndex(index))
  removeBtn.disabled = playlist.currentIndex < 0
  clearBtn.disabled = playlist.items.length === 0
}

const prober = new DurationProber(() => render())

const playerBar = initPlayerBar(player, {
  onPrev: () => playPrev(),
  onNext: () => playNext(),
  onCycleLoop: () => playlist.cycleLoopMode()
})

async function playIndex(index: number): Promise<void> {
  const track = playlist.items[index]
  if (!track) return
  playlist.currentIndex = index
  render()
  try {
    await player.load(track.path)
    await player.play()
    failedIds.clear()
  } catch {
    // error 事件统一处理（提示 + 跳下一首）
  }
}

function findNextPlayable(from: number): number | null {
  let index = from
  for (let i = 0; i < playlist.items.length; i++) {
    const next = nextTrackIndex(index, playlist.items.length, playlist.loopMode)
    if (next === null) return null
    const candidate = playlist.items[next]
    if (candidate.playable && !failedIds.has(candidate.id)) return next
    index = next
    if (index === from) return null
  }
  return null
}

player.on('ended', () => {
  if (playlist.loopMode === 'single') {
    player.seekTo(0)
    void player.play()
    return
  }
  const next = nextTrackIndex(playlist.currentIndex, playlist.items.length, playlist.loopMode)
  if (next !== null) void playIndex(next)
})

player.on('error', () => {
  const track = playlist.current
  if (!track || failedIds.has(track.id)) return
  failedIds.add(track.id)
  track.playable = false
  const next = findNextPlayable(playlist.currentIndex)
  showToast(next !== null ? `「${track.name}」无法播放，已跳到下一首` : `「${track.name}」无法播放`)
  render()
  if (next !== null) void playIndex(next)
})

function playPrev(): void {
  const target = prevTrackIndex(playlist.currentIndex, playlist.items.length, playlist.loopMode)
  if (target >= 0 && target !== playlist.currentIndex) void playIndex(target)
}

function playNext(): void {
  const target = nextTrackIndex(playlist.currentIndex, playlist.items.length, playlist.loopMode)
  if (target !== null) void playIndex(target)
}

async function addFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const wasEmpty = playlist.currentIndex === -1
  const { added, duplicateCount, rejectedCount } = playlist.add(paths)
  if (rejectedCount > 0) showToast(`已忽略 ${rejectedCount} 个非 MP3 文件`)
  if (duplicateCount > 0) showToast(`已忽略 ${duplicateCount} 个重复文件`)
  if (added.length > 0) {
    await window.myPlayer.allowPaths(added.map((track) => track.path))
    prober.enqueue(added)
  }
  render()
  if (wasEmpty && added.length > 0) {
    void playIndex(playlist.items.length - added.length)
  }
}

async function openFiles(): Promise<void> {
  await addFiles(await window.myPlayer.openFiles())
}

function removeCurrent(): void {
  const result = playlist.removeAt(playlist.currentIndex)
  if (!result) return
  if (result.wasCurrent) player.unload()
  render()
}

function clearList(): void {
  if (playlist.items.length === 0) return
  playlist.clear()
  failedIds.clear()
  player.unload()
  render()
}

function togglePlay(): void {
  if (player.hasSource) {
    player.toggle()
    return
  }
  if (playlist.items.length > 0) void playIndex(Math.max(playlist.currentIndex, 0))
}

function changeVolume(delta: number): void {
  if (player.muted) player.toggleMute()
  player.setVolume(adjustVolume(player.volumePercent, delta))
}

function cycleLoopMode(): void {
  playerBar.updateLoopMode(playlist.cycleLoopMode())
}

initShortcuts((action: ShortcutAction) => {
  switch (action) {
    case 'togglePlay':
      togglePlay()
      break
    case 'seekBackward':
      player.seekBy(-player.seekStepSeconds)
      break
    case 'seekForward':
      player.seekBy(player.seekStepSeconds)
      break
    case 'volumeUp':
      changeVolume(VOLUME_STEP)
      break
    case 'volumeDown':
      changeVolume(-VOLUME_STEP)
      break
    case 'prevTrack':
      playPrev()
      break
    case 'nextTrack':
      playNext()
      break
    case 'toggleMute':
      player.toggleMute()
      break
    case 'cycleLoopMode':
      cycleLoopMode()
      break
    case 'openFiles':
      void openFiles()
      break
    case 'openSettings':
      // 设置弹窗在阶段 3 接入（FR-17）
      showToast('设置功能即将在下一阶段提供')
      break
  }
})

addBtn.addEventListener('click', () => void openFiles())
removeBtn.addEventListener('click', removeCurrent)
clearBtn.addEventListener('click', clearList)

window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => {
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths = files.map((file) => window.myPlayer.getPathForFile(file)).filter((p) => p.length > 0)
  void addFiles(paths)
})

render()
