import { describe, expect, it } from 'vitest'
import { isPlayed, PLAYED_THRESHOLD, resolveImportName, validateRename } from './library-utils'

describe('isPlayed', () => {
  it('进度达到总时长 98% 判定为已播放', () => {
    expect(isPlayed(3600 * PLAYED_THRESHOLD, 3600)).toBe(true)
    expect(isPlayed(3600, 3600)).toBe(true)
  })

  it('进度不足 98% 判定为未播放', () => {
    expect(isPlayed(3600 * PLAYED_THRESHOLD - 1, 3600)).toBe(false)
    expect(isPlayed(0, 3600)).toBe(false)
  })

  it('时长无效时不判定为已播放', () => {
    expect(isPlayed(10, 0)).toBe(false)
    expect(isPlayed(10, NaN)).toBe(false)
    expect(isPlayed(NaN, 100)).toBe(false)
  })
})

describe('resolveImportName', () => {
  it('无冲突时保留原名', () => {
    expect(resolveImportName('episode.mp3', [])).toBe('episode.mp3')
    expect(resolveImportName('episode.mp3', ['other.mp3'])).toBe('episode.mp3')
  })

  it('冲突时依次加数字后缀', () => {
    expect(resolveImportName('episode.mp3', ['episode.mp3'])).toBe('episode-1.mp3')
    expect(resolveImportName('episode.mp3', ['episode.mp3', 'episode-1.mp3'])).toBe('episode-2.mp3')
  })

  it('比较时忽略大小写，加后缀时扩展名规范为小写', () => {
    expect(resolveImportName('Episode.MP3', ['episode.mp3'])).toBe('Episode-1.mp3')
  })
})

describe('validateRename', () => {
  it('合法名称直接通过', () => {
    expect(validateRename('新歌', [])).toEqual({ ok: true, fileName: '新歌.mp3' })
    expect(validateRename('新歌.mp3', [])).toEqual({ ok: true, fileName: '新歌.mp3' })
  })

  it('两端空白会被去除', () => {
    expect(validateRename('  新歌  ', [])).toEqual({ ok: true, fileName: '新歌.mp3' })
  })

  it('空名称被拒绝', () => {
    expect(validateRename('', [])).toEqual({ ok: false, reason: '名称不能为空' })
    expect(validateRename('   ', [])).toEqual({ ok: false, reason: '名称不能为空' })
  })

  it('含路径分隔符被拒绝', () => {
    expect(validateRename('a/b', [])).toEqual({ ok: false, reason: '名称不能包含路径分隔符' })
  })

  it('与其他文件重名被拒绝（忽略大小写）', () => {
    expect(validateRename('existing', ['existing.mp3'])).toEqual({ ok: false, reason: '已存在同名文件' })
    expect(validateRename('EXISTING.MP3', ['existing.mp3'])).toEqual({ ok: false, reason: '已存在同名文件' })
  })
})
