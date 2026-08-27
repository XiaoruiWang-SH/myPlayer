import { formatTime, nextSpeed } from '../../../shared/audio-utils'
import type { Player } from '../player'

const TIMEUPDATE_THROTTLE_MS = 250

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

export function initPlayerBar(player: Player): void {
  const playBtn = $('play-btn') as HTMLButtonElement
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

  function renderMuteState(): void {
    show(iconVolume, !player.muted)
    show(iconMuted, player.muted)
  }

  function renderRate(): void {
    const rate = player.rate
    rateBtn.textContent = rate % 1 === 0 ? `${rate.toFixed(1)}x` : `${rate}x`
  }

  function renderProgress(): void {
    const duration = player.duration
    if (Number.isFinite(duration) && duration > 0) {
      seekBar.max = String(duration)
      durationLabel.textContent = formatTime(duration)
    }
    currentTimeLabel.textContent = formatTime(player.currentTime)
    if (!seeking) seekBar.value = String(player.currentTime)
  }

  player.on('statechange', renderPlayState)
  player.on('loadedmetadata', () => {
    seekBar.disabled = false
    renderProgress()
  })
  player.on('timeupdate', () => {
    const now = performance.now()
    if (now - lastUiUpdate < TIMEUPDATE_THROTTLE_MS) return
    lastUiUpdate = now
    renderProgress()
  })

  playBtn.addEventListener('click', () => player.toggle())

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

  muteBtn.addEventListener('click', () => {
    player.toggleMute()
    renderMuteState()
  })

  volumeBar.addEventListener('input', () => {
    if (player.muted) {
      player.toggleMute()
      renderMuteState()
    }
    player.setVolume(Number(volumeBar.value))
  })

  rateBtn.addEventListener('click', () => {
    player.setRate(nextSpeed(player.rate))
    renderRate()
  })

  renderPlayState()
  renderMuteState()
  renderRate()
  renderProgress()
}
