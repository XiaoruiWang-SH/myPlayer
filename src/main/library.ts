import { app, shell } from 'electron'
import { copyFile, mkdir, readdir, rename, unlink } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { resolveImportName, validateRename } from '../shared/library-utils'
import { isMp3Path } from '../shared/playlist-utils'
import type { ImportResult } from '../shared/types'

export function getLibraryDir(): string {
  return join(app.getPath('music'), 'myPlayer')
}

async function ensureLibraryDir(): Promise<string> {
  const dir = getLibraryDir()
  await mkdir(dir, { recursive: true })
  return dir
}

export function assertLibraryPath(path: string): string {
  const dir = resolve(getLibraryDir())
  const target = resolve(path)
  if (target !== dir && !target.startsWith(dir + '/')) {
    throw new Error('路径不在媒体库目录内')
  }
  return target
}

export function revealLibraryFile(path: string): void {
  shell.showItemInFolder(assertLibraryPath(path))
}

async function listLibraryNames(): Promise<string[]> {
  try {
    return await readdir(getLibraryDir())
  } catch {
    return []
  }
}

export async function importToLibrary(sourcePaths: string[]): Promise<ImportResult[]> {
  const dir = await ensureLibraryDir()
  const taken = new Set((await listLibraryNames()).map((name) => name.toLowerCase()))
  const results: ImportResult[] = []
  for (const sourcePath of sourcePaths) {
    if (!isMp3Path(sourcePath)) {
      results.push({ sourcePath, ok: false, reason: '仅支持 MP3 文件' })
      continue
    }
    try {
      const fileName = resolveImportName(basename(sourcePath), taken)
      const libraryPath = join(dir, fileName)
      await copyFile(sourcePath, libraryPath)
      taken.add(fileName.toLowerCase())
      results.push({ sourcePath, ok: true, libraryPath })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const reason = code === 'ENOSPC' ? '磁盘空间不足' : '拷贝失败，文件可能已被移动或损坏'
      results.push({ sourcePath, ok: false, reason })
    }
  }
  return results
}

export async function renameLibraryFile(oldPath: string, rawNewName: string): Promise<string> {
  const from = assertLibraryPath(oldPath)
  const others = (await listLibraryNames()).filter((name) => name.toLowerCase() !== basename(from).toLowerCase())
  const validation = validateRename(rawNewName, others)
  if (!validation.ok) throw new Error(validation.reason)
  const to = join(getLibraryDir(), validation.fileName)
  await rename(from, to)
  return to
}

export async function deleteLibraryFile(path: string): Promise<void> {
  const target = assertLibraryPath(path)
  await unlink(target)
}
