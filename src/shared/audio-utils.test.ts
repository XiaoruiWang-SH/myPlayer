import { describe, expect, it } from 'vitest'
import { clampSeekTime, formatTime } from './audio-utils'

describe('clampSeekTime（FR-03 快进/快退钳制）', () => {
  it('正常前进', () => {
    expect(clampSeekTime(10, 5, 100)).toBe(15)
  })

  it('正常后退', () => {
    expect(clampSeekTime(10, -5, 100)).toBe(5)
  })

  it('后退越过起点时取 0', () => {
    expect(clampSeekTime(3, -5, 100)).toBe(0)
    expect(clampSeekTime(0, -5, 100)).toBe(0)
  })

  it('前进超过总时长时取总时长', () => {
    expect(clampSeekTime(98, 5, 100)).toBe(100)
    expect(clampSeekTime(100, 5, 100)).toBe(100)
  })

  it('无有效时长（NaN/Infinity/0）时返回 0', () => {
    expect(clampSeekTime(10, 5, Number.NaN)).toBe(0)
    expect(clampSeekTime(10, -5, Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampSeekTime(10, 5, 0)).toBe(0)
  })
})

describe('formatTime（FR-02 时间显示 mm:ss）', () => {
  it('常规秒数', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(83)).toBe('01:23')
    expect(formatTime(3661)).toBe('61:01')
  })

  it('向下取整且不越界', () => {
    expect(formatTime(59.9)).toBe('00:59')
  })

  it('非法值按 0 处理', () => {
    expect(formatTime(Number.NaN)).toBe('00:00')
    expect(formatTime(-3)).toBe('00:00')
  })
})
