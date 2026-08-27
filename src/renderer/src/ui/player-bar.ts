import { formatTime, nextSpeed } from '../../../shared/audio-utils'
import type { LoopMode } from '../../../shared/types'
import type { Player } from '../player'

const TIMEUPDATE_THROTTLE_MS = 250

export const LOOP_LABELS: Record<LoopMode, string> = {
  list: '列表循环',
  single: '单曲循环',
  sequential: '顺序播放'
}

export interface PlayerBarActions {
  onPrev(): void
  onNext(): void
  onCycleLoop(): LoopMode
}

export interface PlayerBarHandle {
  updateLoopMode(mode: LoopMode): void
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`缺少界面元素：#${id}`)
  return el
}

function $svg(id: string): SVGElement {
  return $(id) as unknown as SVGElement
}

function show(el: SVGElement, visible: boolean): void {
  el.style.display = visible ? '' : 'none'
}

export function initPlayerBar(player: Player, actions: PlayerBarActions): PlayerBarHandle {
  const playBtn = $('play-btn') as HTMLButtonElement
  const prevBtn = $('prev-btn') as HTMLButtonElement
  const nextBtn = $('next-btn') as HTMLButtonElement
  const loopBtn = $('loop-btn') as HTMLButtonElement
  const iconPlay = $svg('icon-play')
  const iconPause = $svg('icon-pause')
  const seekBar = $('seek-bar') as HTMLInputElement
  const currentTimeLabel = $('current-time')
  const durationLabel = $('duration')
  const muteBtn = $('mute-btn') as HTMLButtonElement
  const iconVolume = $svg('icon-volume')
  const iconMuted = $svg('icon-muted')
  const volumeBar = $('volume-bar') as HTMLInputElement
  const rateBtn = $('rate-btn') as HTMLButtonElement

  let seeking = false
  let lastUiUpdate = 0

  function renderPlayState(): void {
    const playing = !player.paused && player.hasSource
    show(iconPlay, !playing)
    show(iconPause, playing)
    playBtn.disabled = !player.hasSource
  }

  function renderVolumeState(): void {
    show(iconVolume, !player.muted)
    show(iconMuted, player.muted)
    volumeBar.value = String(player.volumePercent)
  }

  function renderRate(): void {
    const rate = player.rate
    rateBtn.textContent = rate % 1 === 0 ? `${rate.toFixed(1)}x` : `${rate}x`
  }

  function renderProgress(): void {
    const duration = player.duration
    if (Number.isFinite(duration) && duration > 0) {
      seekBar.disabled = false
      seekBar.max = String(duration)
      durationLabel.textContent = formatTime(duration)
    } else {
      seekBar.disabled = true
      seekBar.max = '0'
      seekBar.value = '0'
      durationLabel.textContent = '00:00'
    }
    currentTimeLabel.textContent = formatTime(player.currentTime)
    if (!seeking) seekBar.value = String(player.currentTime)
  }

  player.on('statechange', renderPlayState)
  player.on('loadedmetadata', () => {
    renderPlayState()
    renderProgress()
  })
  player.on('volumechange', renderVolumeState)
  player.on('timeupdate', () => {
    const now = performance.now()
    if (now - lastUiUpdate < TIMEUPDATE_THROTTLE_MS) return
    lastUiUpdate = now
    renderProgress()
  })

  const updateLoopMode = (mode: LoopMode): void => {
    loopBtn.textContent = LOOP_LABELS[mode]
  }

  playBtn.addEventListener('click', () => player.toggle())
  prevBtn.addEventListener('click', () => actions.onPrev())
  nextBtn.addEventListener('click', () => actions.onNext())
  loopBtn.addEventListener('click', () => updateLoopMode(actions.onCycleLoop()))

  seekBar.addEventListener('pointerdown', () => {
    seeking = true
  })
  seekBar.addEventListener('pointerup', () => {
    seeking = false
  })
  seekBar.addEventListener('input', () => {
    player.seekTo(Number(seekBar.value))
    currentTimeLabel.textContent = formatTime(player.currentTime)
  })

  muteBtn.addEventListener('click', () => player.toggleMute())

  volumeBar.addEventListener('input', () => {
    if (player.muted) player.toggleMute()
    player.setVolume(Number(volumeBar.value))
  })

  rateBtn.addEventListener('click', () => {
    player.setRate(nextSpeed(player.rate))
    renderRate()
  })

  renderPlayState()
  renderVolumeState()
  renderRate()
  renderProgress()

  return { updateLoopMode }
}
