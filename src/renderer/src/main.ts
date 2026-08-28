import { VOLUME_STEP, adjustVolume } from '../../shared/audio-utils'
import { nextTrackIndex, prevTrackIndex } from '../../shared/playlist-utils'
import type { PlaybackState } from '../../shared/types'
import { DurationProber } from './duration-prober'
import { initMediaSession } from './media-session'
import { Player } from './player'
import { Playlist } from './playlist'
import { initShortcuts, type ShortcutAction } from './shortcuts'
import { initPlayerBar } from './ui/player-bar'
import { renderPlaylist } from './ui/playlist-view'
import { initSettingsDialog } from './ui/settings-dialog'
import { showToast } from './ui/toast'
import { initTranscriptView } from './ui/transcript-view'

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

const mediaSession = initMediaSession(player, {
  onPrev: () => playPrev(),
  onNext: () => playNext()
})

// ---- 状态落盘（FR-19/22）----

const PROGRESS_SAVE_INTERVAL_MS = 5000
let restoring = true
let lastProgressSave = 0

function snapshotState(): PlaybackState {
  return {
    playlist: playlist.items.map((track) => track.path),
    currentIndex: playlist.currentIndex,
    currentTime: player.currentTime,
    volume: player.volumePercent,
    muted: player.muted,
    rate: player.rate,
    loopMode: playlist.loopMode
  }
}

function persistNow(): void {
  if (restoring) return
  void window.myPlayer.saveState(snapshotState())
}

player.on('timeupdate', () => {
  if (player.paused) return
  const now = performance.now()
  if (now - lastProgressSave < PROGRESS_SAVE_INTERVAL_MS) return
  lastProgressSave = now
  persistNow()
})
player.on('volumechange', persistNow)
player.on('ratechange', persistNow)

window.addEventListener('beforeunload', () => {
  window.myPlayer.saveStateSync(snapshotState())
})

// ---- 播放编排 ----

async function playIndex(index: number): Promise<void> {
  const track = playlist.items[index]
  if (!track) return
  playlist.currentIndex = index
  mediaSession.updateTrack(track)
  render()
  try {
    await player.load(track.path)
    await player.play()
    failedIds.clear()
    persistNow()
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
    persistNow()
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
  if (result.wasCurrent) {
    player.unload()
    mediaSession.updateTrack(null)
    resetTranscript()
  }
  persistNow()
  render()
}

function clearList(): void {
  if (playlist.items.length === 0) return
  playlist.clear()
  failedIds.clear()
  player.unload()
  mediaSession.updateTrack(null)
  resetTranscript()
  persistNow()
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
  persistNow()
}

// ---- 设置（FR-16~18）----

const settingsDialog = initSettingsDialog({
  getCurrentStep: () => player.seekStepSeconds,
  applyStep: (step) => {
    player.setSeekStep(step)
    void window.myPlayer.setSettings({ seekStep: step })
  }
})

window.myPlayer.onOpenSettings(() => settingsDialog.open())

// ---- 转录文稿（FR-25~28）----

let transcriptForPath: string | null = null
let transcriptGeneration = 0

const transcriptView = initTranscriptView({
  getCurrentTime: () => player.currentTime,
  onSeek: (time) => player.seekTo(time),
  onRetry: () => {
    transcriptForPath = null
    void ensureTranscript()
  },
  onRetranscribe: () => void ensureTranscript(true),
  onOpenSettings: () => settingsDialog.open()
})

async function ensureTranscript(force = false): Promise<void> {
  const track = playlist.current
  if (!track) return
  if (!force && transcriptForPath === track.path) return
  transcriptForPath = track.path
  const generation = ++transcriptGeneration
  transcriptView.showLoading()
  const result = await window.myPlayer.getTranscript(track.path, { force })
  // 切歌后返回的过期结果直接丢弃（技术文档 §3.8）
  if (generation !== transcriptGeneration || playlist.current?.path !== track.path) return
  switch (result.status) {
    case 'ok':
      transcriptView.showSegments(result.segments)
      break
    case 'no-key':
      transcriptView.showNoKey()
      break
    case 'error':
      transcriptView.showError(result.message)
      break
  }
}

function resetTranscript(): void {
  transcriptGeneration++
  transcriptForPath = null
  transcriptView.showEmpty()
}

// 开始播放（含恢复播放、自动切歌）时确保当前曲目有转录；暂停态不触发
player.on('statechange', () => {
  if (!player.paused) void ensureTranscript()
})

player.on('timeupdate', () => transcriptView.updateHighlight(player.currentTime))

// ---- 启动恢复（FR-19~21）----

async function restoreState(): Promise<void> {
  try {
    const persisted = await window.myPlayer.loadState()
    player.setSeekStep(persisted.settings.seekStep)
    player.setVolume(persisted.playbackState.volume)
    if (persisted.playbackState.muted) player.toggleMute()
    player.setRate(persisted.playbackState.rate)
    playlist.loopMode = persisted.playbackState.loopMode
    playerBar.updateLoopMode(playlist.loopMode)

    const paths = persisted.playbackState.playlist
    if (paths.length > 0) {
      const { valid, missing } = await window.myPlayer.filterExisting(paths)
      if (missing.length > 0) showToast(`已跳过 ${missing.length} 个不再存在的文件`)
      if (valid.length > 0) {
        const validSet = new Set(valid)
        const survivors = paths
          .map((path, index) => ({ path, index }))
          .filter((entry) => validSet.has(entry.path))
        playlist.restore(valid)

        const oldIndex = persisted.playbackState.currentIndex
        let newIndex = -1
        if (oldIndex >= 0) {
          const pos = survivors.findIndex((entry) => entry.index >= oldIndex)
          newIndex = pos >= 0 ? pos : survivors.length - 1
        }
        playlist.currentIndex = newIndex
        prober.enqueue(playlist.items)

        // 加载当前曲目但保持暂停态（FR-20）
        const track = playlist.current
        if (track) {
          mediaSession.updateTrack(track)
          try {
            await player.load(track.path)
            player.seekTo(persisted.playbackState.currentTime)
          } catch {
            // 加载失败交给用户手动播放时的错误处理
          }
        }
      }
    }
  } finally {
    restoring = false
    render()
  }
}

// ---- 快捷键与交互 ----

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
      settingsDialog.open()
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
void restoreState()
