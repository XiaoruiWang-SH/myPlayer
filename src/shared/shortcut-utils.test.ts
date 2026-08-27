import { describe, expect, it } from 'vitest'
import { comboFromEvent } from './shortcut-utils'

describe('comboFromEvent（PRD §6 快捷键组合解析）', () => {
  it('普通键使用 code', () => {
    expect(comboFromEvent({ metaKey: false, code: 'Space' })).toBe('Space')
    expect(comboFromEvent({ metaKey: false, code: 'KeyM' })).toBe('KeyM')
    expect(comboFromEvent({ metaKey: false, code: 'ArrowLeft' })).toBe('ArrowLeft')
  })

  it('带 Meta 修饰键时生成 Meta+ 前缀', () => {
    expect(comboFromEvent({ metaKey: true, code: 'ArrowLeft' })).toBe('Meta+ArrowLeft')
    expect(comboFromEvent({ metaKey: true, code: 'KeyO' })).toBe('Meta+KeyO')
    expect(comboFromEvent({ metaKey: true, code: 'Comma' })).toBe('Meta+Comma')
  })
})
