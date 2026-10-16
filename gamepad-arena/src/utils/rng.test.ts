import { describe, it, expect } from 'vitest'
import { mulberry32, rngInt, rngPick, rngRange } from './rng'

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    for (let i = 0; i < 50; i++) expect(a()).toBe(b())
  })

  it('differs for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 10 }, a)
    const seqB = Array.from({ length: 10 }, b)
    expect(seqA).not.toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('helpers', () => {
  it('rngRange stays within bounds', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const v = rngRange(rng, -5, 5)
      expect(v).toBeGreaterThanOrEqual(-5)
      expect(v).toBeLessThan(5)
    }
  })

  it('rngInt covers the inclusive range', () => {
    const rng = mulberry32(11)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rngInt(rng, 0, 3))
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })

  it('rngPick only returns members', () => {
    const rng = mulberry32(5)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 100; i++) expect(items).toContain(rngPick(rng, items))
  })
})
