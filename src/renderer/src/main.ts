import { VOLUME_STEP, adjustVolume } from '../../shared/audio-utils'
import { isPlayed } from '../../shared/library-utils'
import { isMp3Path, nextTrackIndex, prevTrackIndex, trackDisplayName } from '../../shared/playlist-utils'
import type { ImportResult, PlaybackState } from '../../shared/types'
import { DurationProber } from './duration-prober'
import { initMediaSession } from './media-session'
import { Player } from './player'
import { Playlist, type Track } from './playlist'
import { initShortcuts, type ShortcutAction } from './shortcuts'
import { initPlayerBar } from './ui/player-bar'
import { renderPlaylist, type PlaylistViewHandle } from './ui/playlist-view'
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
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement

let playlistView: PlaylistViewHandle = { beginRenameAt: () => {} }

function render(): void {
  playlistView = renderPlaylist(
    playlist,
    listEl,
    hintEl,
    (index) => void switchToTrack(index, !player.paused),
    (index, newName) => void renameTrack(index, newName),
    (index, path) => void openTrackMenu(index, path)
  )
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
  const current = playlist.current
  return {
    playlist: playlist.items.map((track) => ({
      id: track.id,
      path: track.path,
      importedFrom: track.importedFrom,
      addedAt: track.addedAt,
      position: track === current && !track.played ? player.currentTime : track.position,
      played: track.played
    })),
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
  const track = playlist.current
  if (track && !track.played && isPlayed(player.currentTime, player.duration)) {
    track.played = true
    track.position = 0
    render()
    persistNow()
  }
})

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

// 当前是否应处于播放状态：手动切歌按此保持状态，错误跳歌按此决定是否续播（FR-37）
let playIntent = false

async function switchToTrack(index: number, autoplay: boolean): Promise<void> {
  const track = playlist.items[index]
  if (!track) return
  playIntent = autoplay
  const prev = playlist.current
  if (prev && prev !== track && !prev.played) prev.position = player.currentTime
  playlist.currentIndex = index
  mediaSession.updateTrack(track)
  render()
  try {
    await player.load(track.path)
    if (track.position > 0) player.seekTo(track.position)
    if (autoplay) await player.play()
    failedIds.clear()
    persistNow()
  } catch {
    // error 事件统一处理（提示 + 跳下一首）
  }
}

// 播放按钮/空格等直接起播路径不经过 switchToTrack，用播放事件同步 playIntent
player.on('statechange', () => {
  if (!player.paused) playIntent = true
})

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
  const track = playlist.current
  if (track && !track.played) {
    track.played = true
    track.position = 0
    render()
    persistNow()
  }
  if (playlist.loopMode === 'single') {
    player.seekTo(0)
    void player.play()
    return
  }
  const next = nextTrackIndex(playlist.currentIndex, playlist.items.length, playlist.loopMode)
  if (next !== null) void switchToTrack(next, true)
})

player.on('error', () => {
  const track = playlist.current
  if (!track || failedIds.has(track.id)) return
  failedIds.add(track.id)
  track.playable = false
  const next = findNextPlayable(playlist.currentIndex)
  showToast(next !== null ? `「${track.name}」无法播放，已跳到下一首` : `「${track.name}」无法播放`)
  render()
  if (next !== null) void switchToTrack(next, playIntent)
})

function playPrev(): void {
  const target = prevTrackIndex(playlist.currentIndex, playlist.items.length, playlist.loopMode)
  if (target >= 0 && target !== playlist.currentIndex) void switchToTrack(target, !player.paused)
}

function playNext(): void {
  const target = nextTrackIndex(playlist.currentIndex, playlist.items.length, playlist.loopMode)
  if (target !== null) void switchToTrack(target, !player.paused)
}

async function addFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const mp3Paths = paths.filter(isMp3Path)
  const rejectedCount = paths.length - mp3Paths.length
  if (rejectedCount > 0) showToast(`已忽略 ${rejectedCount} 个非 MP3 文件`)
  const newSources = mp3Paths.filter((path) => !playlist.hasImportedSource(path))
  const duplicateCount = mp3Paths.length - newSources.length
  if (duplicateCount > 0) showToast(`已忽略 ${duplicateCount} 个重复文件`)
  if (newSources.length === 0) return

  showToast(`正在导入 ${newSources.length} 个音频…`)
  const results = await window.myPlayer.importToLibrary(newSources)
  const succeeded = results.filter((r): r is Extract<ImportResult, { ok: true }> => r.ok)
  const failedCount = results.length - succeeded.length
  if (failedCount > 0) showToast(`${failedCount} 个文件导入失败`)
  if (succeeded.length === 0) return

  const added = playlist.addImported(
    succeeded.map((result) => ({ sourcePath: result.sourcePath, libraryPath: result.libraryPath }))
  )
  await window.myPlayer.allowPaths(added.map((track) => track.path))
  prober.enqueue(added)
  persistNow()
  render()
}

async function openFiles(): Promise<void> {
  await addFiles(await window.myPlayer.openFiles())
}

async function renameTrack(index: number, rawName: string): Promise<void> {
  const track = playlist.items[index]
  if (!track) return
  try {
    const newPath = await window.myPlayer.renameLibraryFile(track.path, rawName)
    track.path = newPath
    track.name = trackDisplayName(newPath)
    await window.myPlayer.allowPaths([newPath])
    if (index === playlist.currentIndex && player.hasSource) {
      // media:// 白名单按路径生效，改名后必须重新加载才能继续播放
      const wasPaused = player.paused
      const position = player.currentTime
      await player.load(newPath)
      player.seekTo(position)
      if (!wasPaused) await player.play()
      mediaSession.updateTrack(track)
    }
    persistNow()
    render()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '重命名失败')
  }
}

async function deleteLibraryTracks(tracks: Track[]): Promise<void> {
  for (const track of tracks) {
    try {
      await window.myPlayer.deleteLibraryFile(track.path, track.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '文件删除失败')
    }
  }
}

function deleteTrackAt(index: number): void {
  const result = playlist.removeAt(index)
  if (!result) return
  if (result.wasCurrent) {
    player.unload()
    mediaSession.updateTrack(null)
    resetTranscript()
  }
  void deleteLibraryTracks([result.removed])
  persistNow()
  render()
}

// 记录弹出菜单时的条目，命令回传时校验，防止菜单弹出期间列表变化导致错位（技术文档 §3.10）
let pendingMenuTrackId: string | null = null

async function openTrackMenu(index: number, path: string): Promise<void> {
  const track = playlist.items[index]
  if (!track) return
  pendingMenuTrackId = track.id
  try {
    await window.myPlayer.openTrackMenu(index, path)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '无法打开菜单')
  }
}

window.myPlayer.onTrackMenuCommand(({ index, action }) => {
  const track = playlist.items[index]
  if (!track || track.id !== pendingMenuTrackId) return
  pendingMenuTrackId = null
  if (action === 'rename') playlistView.beginRenameAt(index)
  else deleteTrackAt(index)
})

async function clearList(): Promise<void> {
  if (playlist.items.length === 0) return
  const confirmed = await window.myPlayer.confirmAction({
    title: '清空列表',
    message: '确定清空播放列表吗？',
    detail: '列表条目及专属目录中的音频副本都会被删除，且无法恢复。',
    confirmLabel: '清空'
  })
  if (!confirmed) return
  const removed = [...playlist.items]
  playlist.clear()
  failedIds.clear()
  player.unload()
  mediaSession.updateTrack(null)
  resetTranscript()
  void deleteLibraryTracks(removed)
  persistNow()
  render()
}

function togglePlay(): void {
  if (player.hasSource) {
    player.toggle()
    return
  }
  if (playlist.items.length > 0) void switchToTrack(Math.max(playlist.currentIndex, 0), true)
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

let transcriptForId: string | null = null
let transcriptGeneration = 0

const transcriptView = initTranscriptView({
  getCurrentTime: () => player.currentTime,
  onSeek: (time) => player.seekTo(time),
  onRetry: () => {
    transcriptForId = null
    void ensureTranscript()
  },
  onRetranscribe: () => void ensureTranscript(true),
  onOpenSettings: () => settingsDialog.open()
})

async function ensureTranscript(force = false): Promise<void> {
  const track = playlist.current
  if (!track) return
  if (!force && transcriptForId === track.id) return
  transcriptForId = track.id
  const generation = ++transcriptGeneration
  transcriptView.showLoading()
  const result = await window.myPlayer.getTranscript(track.path, { id: track.id, force })
  // 切歌后返回的过期结果直接丢弃（技术文档 §3.8）
  if (generation !== transcriptGeneration || playlist.current?.id !== track.id) return
  switch (result.status) {
    case 'ok':
      transcriptView.showSegments(result.segments)
      break
    case 'no-key':
      transcriptView.showNoKey()
      break
    case 'error':
      transcriptView.showError(result.message, {
        withSettingsLink: result.code === 'unauthorized'
      })
      break
  }
}

function resetTranscript(): void {
  transcriptGeneration++
  transcriptForId = null
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

    const tracks = persisted.playbackState.playlist
    if (tracks.length > 0) {
      const { valid, missing } = await window.myPlayer.filterExisting(tracks.map((track) => track.path))
      if (missing.length > 0) showToast(`已跳过 ${missing.length} 个不再存在的文件`)
      if (valid.length > 0) {
        const validSet = new Set(valid)
        const survivorsWithIndex = tracks
          .map((track, index) => ({ track, index }))
          .filter((entry) => validSet.has(entry.track.path))
        playlist.restoreTracks(survivorsWithIndex.map((entry) => entry.track))

        const oldIndex = persisted.playbackState.currentIndex
        let newIndex = -1
        if (oldIndex >= 0) {
          const pos = survivorsWithIndex.findIndex((entry) => entry.index >= oldIndex)
          newIndex = pos >= 0 ? pos : survivorsWithIndex.length - 1
        }
        playlist.currentIndex = newIndex
        prober.enqueue(playlist.items)

        // 加载当前曲目但保持暂停态（FR-20）
        const track = playlist.current
        if (track) {
          mediaSession.updateTrack(track)
          try {
            await player.load(track.path)
            player.seekTo(track.position)
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
clearBtn.addEventListener('click', () => void clearList())

window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => {
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths = files.map((file) => window.myPlayer.getPathForFile(file)).filter((p) => p.length > 0)
  void addFiles(paths)
})

render()
void restoreState()
