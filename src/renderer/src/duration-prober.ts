import { MEDIA_URL_PREFIX } from './player'
import type { Track } from './playlist'

const PROBE_TIMEOUT_MS = 5000

// 串行探测：避免同时创建大量 <audio> 元素（技术文档 §3.2）
export class DurationProber {
  private queue: Track[] = []
  private probing = false

  constructor(private onResolved: (track: Track) => void) {}

  enqueue(tracks: Track[]): void {
    this.queue.push(...tracks)
    this.next()
  }

  private next(): void {
    if (this.probing) return
    const track = this.queue.shift()
    if (!track) return
    this.probing = true
    this.probe(track)
  }

  private probe(track: Track): void {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    let settled = false

    const finish = (duration?: number): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      audio.removeAttribute('src')
      if (duration !== undefined && Number.isFinite(duration)) {
        track.duration = duration
      } else {
        track.playable = false
      }
      this.onResolved(track)
      this.probing = false
      this.next()
    }

    const timer = setTimeout(() => finish(), PROBE_TIMEOUT_MS)
    audio.addEventListener('loadedmetadata', () => finish(audio.duration))
    audio.addEventListener('error', () => finish())
    audio.src = MEDIA_URL_PREFIX + encodeURIComponent(track.path)
    audio.load()
  }
}
