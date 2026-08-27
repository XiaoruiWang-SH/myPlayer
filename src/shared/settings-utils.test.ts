import { describe, expect, it } from 'vitest'
import { normalizeSeekStep } from './settings-utils'

describe('normalizeSeekStep', () => {
  it('接受范围内的数字', () => {
    expect(normalizeSeekStep(1)).toBe(1)
    expect(normalizeSeekStep(5)).toBe(5)
    expect(normalizeSeekStep(120)).toBe(120)
  })

  it('接受范围内数字字符串（含空白）', () => {
    expect(normalizeSeekStep('30')).toBe(30)
    expect(normalizeSeekStep(' 12 ')).toBe(12)
  })

  it('拒绝越界值', () => {
    expect(normalizeSeekStep(0)).toBeNull()
    expect(normalizeSeekStep(-5)).toBeNull()
    expect(normalizeSeekStep(121)).toBeNull()
  })

  it('拒绝非数字输入', () => {
    expect(normalizeSeekStep('abc')).toBeNull()
    expect(normalizeSeekStep('')).toBeNull()
    expect(normalizeSeekStep('  ')).toBeNull()
    expect(normalizeSeekStep(NaN)).toBeNull()
    expect(normalizeSeekStep(Infinity)).toBeNull()
    expect(normalizeSeekStep(undefined)).toBeNull()
    expect(normalizeSeekStep(null)).toBeNull()
  })
})
