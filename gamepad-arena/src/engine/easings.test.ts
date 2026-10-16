import { describe, it, expect } from 'vitest'
import {
  linear,
  quadIn,
  quadOut,
  quadInOut,
  cubicOut,
  backOut,
  elasticOut,
} from './easings'

const EASINGS = { linear, quadIn, quadOut, quadInOut, cubicOut, backOut, elasticOut }

describe('easings', () => {
  it.each(Object.entries(EASINGS))('%s maps 0 → 0 and 1 → 1', (_name, ease) => {
    expect(ease(0)).toBeCloseTo(0, 5)
    expect(ease(1)).toBeCloseTo(1, 5)
  })

  it('linear is the identity', () => {
    expect(linear(0.42)).toBeCloseTo(0.42)
  })

  it('quadIn is below linear mid-way (slow start)', () => {
    expect(quadIn(0.5)).toBeLessThan(0.5)
  })

  it('quadOut is above linear mid-way (fast start)', () => {
    expect(quadOut(0.5)).toBeGreaterThan(0.5)
  })

  it('quadInOut meets at the midpoint', () => {
    expect(quadInOut(0.5)).toBeCloseTo(0.5)
  })

  it('cubicOut is above quadOut mid-way (stronger ease-out)', () => {
    expect(cubicOut(0.5)).toBeGreaterThan(quadOut(0.5))
  })

  it('backOut overshoots before settling', () => {
    const values = [0.2, 0.4, 0.6].map(backOut)
    expect(Math.max(...values)).toBeGreaterThan(1)
  })

  it('elasticOut oscillates but converges at the end', () => {
    expect(elasticOut(0.999)).toBeCloseTo(1, 2)
    const mid = [0.3, 0.5, 0.7].map(elasticOut)
    expect(mid.some((v) => v > 1)).toBe(true)
    expect(mid.some((v) => v < 1)).toBe(true)
  })
})
