import { describe, it, expect } from 'vitest'
import { PARALLAX_REST, lerpParallax, parallaxTarget } from './stickParallax'

describe('parallaxTarget', () => {
  it('zeros axes inside the deadzone', () => {
    const t = parallaxTarget(0.1, -0.05, 0.15)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
    expect(t.m).toBe(0)
  })

  it('rescales axes outside the deadzone to 0..1', () => {
    const t = parallaxTarget(1, 0, 0.25)
    expect(t.x).toBeCloseTo(1)
    const mid = parallaxTarget(0.625, 0, 0.25)
    expect(mid.x).toBeCloseTo(0.5)
  })

  it('clamps magnitude to 1 for full diagonal deflection', () => {
    const t = parallaxTarget(1, 1, 0)
    expect(t.m).toBe(1)
  })

  it('magnitude tracks a partial deflection', () => {
    const t = parallaxTarget(0.6, 0.8, 0)
    expect(t.m).toBeCloseTo(1)
    const small = parallaxTarget(0.3, 0, 0)
    expect(small.m).toBeCloseTo(0.3)
  })
})

describe('lerpParallax', () => {
  it('returns the current state at factor 0 and the target at factor 1', () => {
    const cur = { x: -0.5, y: 0.25, m: 0.5 }
    const target = { x: 1, y: -1, m: 1 }
    expect(lerpParallax(cur, target, 0)).toEqual(cur)
    expect(lerpParallax(cur, target, 1)).toEqual(target)
  })

  it('converges toward the target over repeated steps', () => {
    let state = PARALLAX_REST
    const target = { x: 1, y: 0, m: 1 }
    for (let i = 0; i < 200; i++) state = lerpParallax(state, target, 0.14)
    expect(state.x).toBeCloseTo(1)
    expect(state.m).toBeCloseTo(1)
  })

  it('decays back to rest when the target is released', () => {
    let state = { x: 1, y: -1, m: 1 }
    for (let i = 0; i < 200; i++) state = lerpParallax(state, PARALLAX_REST, 0.14)
    expect(state.x).toBeCloseTo(0)
    expect(state.y).toBeCloseTo(0)
    expect(state.m).toBeCloseTo(0)
  })
})
