import { DEFAULT_SEEK_STEP, clampSeekTime } from '../../shared/audio-utils'

export type PlayerEvent =
  | 'timeupdate'
  | 'statechange'
  | 'loadedmetadata'
  | 'ended'
  | 'error'
  | 'volumechange'

type Listener = () => void

export const MEDIA_URL_PREFIX = 'media://local/'

export class Player {
  private audio = document.createElement('audio')
  private listeners: Record<PlayerEvent, Listener[]> = {
    timeupdate: [],
    statechange: [],
    loadedmetadata: [],
    ended: [],
    error: [],
    volumechange: []
  }
  private seekStep = DEFAULT_SEEK_STEP

  constructor() {
    this.audio.preload = 'metadata'
    this.audio.addEventListener('timeupdate', () => this.emit('timeupdate'))
    this.audio.addEventListener('play', () => this.emit('statechange'))
    this.audio.addEventListener('pause', () => this.emit('statechange'))
    this.audio.addEventListener('loadedmetadata', () => this.emit('loadedmetadata'))
    this.audio.addEventListener('ended', () => this.emit('ended'))
    this.audio.addEventListener('error', () => this.emit('error'))
    this.audio.addEventListener('volumechange', () => this.emit('volumechange'))
  }

  on(event: PlayerEvent, listener: Listener): () => void {
    this.listeners[event].push(listener)
    return () => {
      this.listeners[event] = this.listeners[event].filter((l) => l !== listener)
    }
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners[event]) listener()
  }

  load(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (): void => {
        this.audio.removeEventListener('loadedmetadata', onLoaded)
        reject(new Error(`无法加载音频：${filePath}`))
      }
      const onLoaded = (): void => {
        this.audio.removeEventListener('error', onError)
        resolve()
      }
      this.audio.addEventListener('loadedmetadata', onLoaded, { once: true })
      this.audio.addEventListener('error', onError, { once: true })
      this.audio.src = MEDIA_URL_PREFIX + encodeURIComponent(filePath)
      this.audio.load()
    })
  }

  async play(): Promise<void> {
    await this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  toggle(): void {
    if (this.audio.paused) void this.play()
    else this.pause()
  }

  unload(): void {
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
  }

  seekBy(deltaSec: number): void {
    this.audio.currentTime = clampSeekTime(this.audio.currentTime, deltaSec, this.audio.duration)
    this.emit('timeupdate')
  }

  seekTo(timeSec: number): void {
    const duration = this.audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    this.audio.currentTime = Math.min(Math.max(timeSec, 0), duration)
    this.emit('timeupdate')
  }

  setVolume(percent: number): void {
    const clamped = Math.min(Math.max(Math.round(percent), 0), 100)
    this.audio.volume = clamped / 100
  }

  toggleMute(): boolean {
    this.audio.muted = !this.audio.muted
    return this.audio.muted
  }

  setRate(rate: number): void {
    this.audio.playbackRate = rate
  }

  setSeekStep(seconds: number): void {
    this.seekStep = seconds
  }

  get seekStepSeconds(): number {
    return this.seekStep
  }

  get currentTime(): number {
    return this.audio.currentTime
  }

  get duration(): number {
    return this.audio.duration
  }

  get paused(): boolean {
    return this.audio.paused
  }

  get volumePercent(): number {
    return Math.round(this.audio.volume * 100)
  }

  get muted(): boolean {
    return this.audio.muted
  }

  get rate(): number {
    return this.audio.playbackRate
  }

  get hasSource(): boolean {
    return this.audio.src !== ''
  }
}
