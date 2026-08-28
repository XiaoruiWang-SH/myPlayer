import { dedupeKey, trackDisplayName } from '../../shared/playlist-utils'
import type { LoopMode } from '../../shared/types'

export interface Track {
  id: string
  path: string
  name: string
  duration?: number
  playable: boolean
  importedFrom?: string
  addedAt: number
  position: number
  played: boolean
}

export interface ImportedEntry {
  sourcePath: string
  libraryPath: string
}

export class Playlist {
  items: Track[] = []
  currentIndex = -1
  loopMode: LoopMode = 'list'
  private seen = new Set<string>()
  private seenSources = new Set<string>()

  get current(): Track | null {
    return this.currentIndex >= 0 && this.currentIndex < this.items.length
      ? this.items[this.currentIndex]
      : null
  }

  hasImportedSource(sourcePath: string): boolean {
    return this.seenSources.has(dedupeKey(sourcePath))
  }

  addImported(entries: ImportedEntry[]): Track[] {
    const added: Track[] = []
    for (const entry of entries) {
      const key = dedupeKey(entry.libraryPath)
      if (this.seen.has(key)) continue
      this.seen.add(key)
      this.seenSources.add(dedupeKey(entry.sourcePath))
      added.push({
        id: crypto.randomUUID(),
        path: entry.libraryPath,
        name: trackDisplayName(entry.libraryPath),
        playable: true,
        importedFrom: entry.sourcePath,
        addedAt: Date.now(),
        position: 0,
        played: false
      })
    }
    this.items.push(...added)
    return added
  }

  removeAt(index: number): { removed: Track; wasCurrent: boolean } | null {
    if (index < 0 || index >= this.items.length) return null
    const [removed] = this.items.splice(index, 1)
    this.seen.delete(dedupeKey(removed.path))
    if (removed.importedFrom) this.seenSources.delete(dedupeKey(removed.importedFrom))
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
    this.seenSources.clear()
    this.currentIndex = -1
  }

  restore(paths: string[]): void {
    this.items = paths.map((path) => ({
      id: crypto.randomUUID(),
      path,
      name: trackDisplayName(path),
      playable: true,
      addedAt: Date.now(),
      position: 0,
      played: false
    }))
    this.seen = new Set(paths.map(dedupeKey))
    this.currentIndex = -1
  }

  cycleLoopMode(): LoopMode {
    const order: LoopMode[] = ['list', 'single', 'sequential']
    this.loopMode = order[(order.indexOf(this.loopMode) + 1) % order.length]
    return this.loopMode
  }
}
