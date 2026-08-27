import type { Player } from './player'
import type { Track } from './playlist'

const POSITION_THROTTLE_MS = 1000

export interface MediaSessionActions {
  onPrev(): void
  onNext(): void
}

export interface MediaSessionHandle {
  updateTrack(track: Track | null): void
}

export function initMediaSession(player: Player, actions: MediaSessionActions): MediaSessionHandle {
  const session = navigator.mediaSession
  if (!session) return { updateTrack: () => {} }

  session.setActionHandler('play', () => {
    void player.play()
  })
  session.setActionHandler('pause', () => player.pause())
  session.setActionHandler('previoustrack', () => actions.onPrev())
  session.setActionHandler('nexttrack', () => actions.onNext())
  session.setActionHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') player.seekTo(details.seekTime)
  })

  player.on('statechange', () => {
    session.playbackState = !player.paused && player.hasSource ? 'playing' : 'paused'
  })

  let lastPositionUpdate = 0
  player.on('timeupdate', () => {
    const now = performance.now()
    if (now - lastPositionUpdate < POSITION_THROTTLE_MS) return
    lastPositionUpdate = now
    const duration = player.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    try {
      session.setPositionState({
        duration,
        playbackRate: player.rate,
        position: Math.min(player.currentTime, duration)
      })
    } catch {
      // position 超出 duration 等非法状态下会抛错，忽略即可
    }
  })

  function updateTrack(track: Track | null): void {
    session.metadata = track ? new MediaMetadata({ title: track.name }) : null
    session.playbackState = track ? 'paused' : 'none'
  }

  return { updateTrack }
}
