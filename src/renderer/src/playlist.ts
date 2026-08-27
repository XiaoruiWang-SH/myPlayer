import { dedupeKey, isMp3Path, trackDisplayName } from '../../shared/playlist-utils'
import type { LoopMode } from '../../shared/types'

export interface Track {
  id: string
  path: string
  name: string
  duration?: number
  playable: boolean
}

export interface AddResult {
  added: Track[]
  duplicateCount: number
  rejectedCount: number
}

export class Playlist {
  items: Track[] = []
  currentIndex = -1
  loopMode: LoopMode = 'list'
  private seen = new Set<string>()

  get current(): Track | null {
    return this.currentIndex >= 0 && this.currentIndex < this.items.length
      ? this.items[this.currentIndex]
      : null
  }

  add(paths: string[]): AddResult {
    const added: Track[] = []
    let duplicateCount = 0
    let rejectedCount = 0
    for (const path of paths) {
      if (!isMp3Path(path)) {
        rejectedCount++
        continue
      }
      const key = dedupeKey(path)
      if (this.seen.has(key)) {
        duplicateCount++
        continue
      }
      this.seen.add(key)
      added.push({ id: crypto.randomUUID(), path, name: trackDisplayName(path), playable: true })
    }
    this.items.push(...added)
    return { added, duplicateCount, rejectedCount }
  }

  removeAt(index: number): { removed: Track; wasCurrent: boolean } | null {
    if (index < 0 || index >= this.items.length) return null
    const [removed] = this.items.splice(index, 1)
    this.seen.delete(dedupeKey(removed.path))
    const wasCurrent = index === this.currentIndex
    if (wasCurrent) {
      this.currentIndex = -1
    } else if (index < this.currentIndex) {
      this.currentIndex--
    }
    return { removed, wasCurrent }
  }

  clear(): void {
    this.items = []
    this.seen.clear()
    this.currentIndex = -1
  }

  cycleLoopMode(): LoopMode {
    const order: LoopMode[] = ['list', 'single', 'sequential']
    this.loopMode = order[(order.indexOf(this.loopMode) + 1) % order.length]
    return this.loopMode
  }
}
