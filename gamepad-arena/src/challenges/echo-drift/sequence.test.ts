import { describe, it, expect } from 'vitest'
import {
  BEAT,
  SECTOR_RAD,
  TIMING_MAX_S,
  TIMING_PERFECT_S,
  angularDistance,
  dirFromAngle,
  directionScore,
  generateRound,
  stickAngle,
  timingScore,
} from './sequence'

describe('direction math', () => {
  it('maps stick vectors to 8 directions (screen y-down)', () => {
    expect(dirFromAngle(stickAngle(1, 0))).toBe(0) // right
    expect(dirFromAngle(stickAngle(0, -1))).toBe(2) // up
    expect(dirFromAngle(stickAngle(-1, 0))).toBe(4) // left
    expect(dirFromAngle(stickAngle(0, 1))).toBe(6) // down
  })

  it('angular distance wraps around the circle', () => {
    expect(angularDistance(0, 0)).toBe(0)
    expect(angularDistance(Math.PI * 0.99, 0)).toBeCloseTo(Math.PI * 0.99)
    // -162° is 0.9π away from 0° — no wrap needed.
    expect(angularDistance(-Math.PI * 0.9, 0)).toBeCloseTo(Math.PI * 0.9)
    // dir 4 = π; a vector at 0.1 rad is π - 0.1 away — requires wrapping.
    expect(angularDistance(0.1, 4)).toBeCloseTo(Math.PI - 0.1)
  })
})

describe('scoring', () => {
  it('timing: perfect inside 80 ms, zero at/after 300 ms, symmetric', () => {
    expect(timingScore(0)).toBe(100)
    expect(timingScore(TIMING_PERFECT_S)).toBe(100)
    expect(timingScore(-TIMING_PERFECT_S)).toBe(100)
    expect(timingScore(TIMING_MAX_S)).toBe(0)
    expect(timingScore(-TIMING_MAX_S)).toBe(0)
    const mid = timingScore(0.19)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(100)
    expect(timingScore(-0.19)).toBeCloseTo(mid)
  })

  it('direction: peaks at centre, drops off within the sector', () => {
    const centre = directionScore(0, 1, 0)
    expect(centre).toBe(100)
    const edge = directionScore(SECTOR_RAD * 0.9, 1, 0)
    expect(edge).toBeLessThan(centre)
    expect(edge).toBeGreaterThan(0)
    const opposite = directionScore(Math.PI, 1, 0)
    expect(opposite).toBe(0)
  })

  it('direction: weak sticks score lower (magnitude matters)', () => {
    expect(directionScore(0, 0.6, 0)).toBeLessThan(directionScore(0, 1, 0))
  })
})

describe('generateRound', () => {
  it('is deterministic per seed and differs across seeds/rounds', () => {
    const a = generateRound(2, 42)
    const b = generateRound(2, 42)
    expect(a).toEqual(b)
    expect(generateRound(2, 43)).not.toEqual(a)
    expect(generateRound(3, 42)).not.toEqual(a)
  })

  it('rounds 0–1 use only the left channel and grow in length', () => {
    const r0 = generateRound(0, 1)
    const r1 = generateRound(1, 1)
    expect(r0.length).toBe(3)
    expect(r1.length).toBe(4)
    expect(r1.left).toHaveLength(4)
    expect(r1.right).toHaveLength(0)
  })

  it('alternating rounds split notes across channels', () => {
    const r2 = generateRound(2, 7)
    expect(r2.left.length + r2.right.length).toBe(5)
    expect(r2.left.length).toBeGreaterThan(0)
    expect(r2.right.length).toBeGreaterThan(0)
    expect(r2.simultaneous).toBe(false)
  })

  it('every 4th round from 3 is simultaneous with a halved beat', () => {
    const r3 = generateRound(3, 9)
    expect(r3.simultaneous).toBe(true)
    expect(r3.beat).toBeCloseTo(BEAT / 2)
    expect(r3.left.length).toBeGreaterThan(0)
    expect(r3.right.length).toBeGreaterThan(0)
  })

  it('never repeats a direction consecutively within a channel plan', () => {
    const plan = generateRound(8, 3) // 10 notes, alternating channels
    for (const list of [plan.left, plan.right]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i].dir).not.toBe(list[i - 1].dir)
      }
    }
  })
})
