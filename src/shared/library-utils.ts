export const PLAYED_THRESHOLD = 0.98

export function isPlayed(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return false
  return position >= duration * PLAYED_THRESHOLD
}

// 冲突时加数字后缀：episode.mp3 → episode-1.mp3 → episode-2.mp3…
export function resolveImportName(fileName: string, takenNames: Iterable<string>): string {
  const taken = new Set(Array.from(takenNames, (name) => name.toLowerCase()))
  if (!taken.has(fileName.toLowerCase())) return fileName
  const ext = '.mp3'
  const stem = fileName.replace(/\.mp3$/i, '')
  for (let n = 1; ; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export type RenameValidation = { ok: true; fileName: string } | { ok: false; reason: string }

// existingNames 不含被重命名文件自身
export function validateRename(rawName: string, existingNames: Iterable<string>): RenameValidation {
  const name = rawName.trim()
  if (name === '') return { ok: false, reason: '名称不能为空' }
  if (name.includes('/')) return { ok: false, reason: '名称不能包含路径分隔符' }
  const fileName = /\.mp3$/i.test(name) ? name : `${name}.mp3`
  const taken = new Set(Array.from(existingNames, (n) => n.toLowerCase()))
  if (taken.has(fileName.toLowerCase())) return { ok: false, reason: '已存在同名文件' }
  return { ok: true, fileName }
}
