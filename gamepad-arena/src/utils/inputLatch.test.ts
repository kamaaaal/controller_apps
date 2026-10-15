import { describe, it, expect } from 'vitest'
import { armLatch, observeRelease, canFire, LOCKOUT_MS } from './inputLatch'

describe('inputLatch', () => {
  it('blocks firing until the button is released at least once', () => {
    const l = armLatch(0)
    // Button still held well past the cooldown — must stay blocked.
    expect(canFire(l, LOCKOUT_MS + 100)).toBe(false)
    observeRelease(l, true) // still pressed
    expect(canFire(l, LOCKOUT_MS + 200)).toBe(false)
    observeRelease(l, false) // released
    expect(canFire(l, LOCKOUT_MS + 300)).toBe(true)
  })

  it('blocks firing until the cooldown has elapsed, even after release', () => {
    const l = armLatch(1000)
    observeRelease(l, false) // released immediately
    expect(canFire(l, 1000 + LOCKOUT_MS - 1)).toBe(false) // cooldown not yet passed
    expect(canFire(l, 1000 + LOCKOUT_MS)).toBe(true)
  })

  it('requires both release and cooldown together', () => {
    const l = armLatch(0)
    expect(canFire(l, LOCKOUT_MS)).toBe(false) // cooldown ok, not released
    observeRelease(l, false)
    expect(canFire(l, LOCKOUT_MS)).toBe(true) // now both satisfied
  })

  it('re-arming resets the latch (new transition blocks a held button again)', () => {
    const l = armLatch(0)
    observeRelease(l, false)
    expect(canFire(l, LOCKOUT_MS)).toBe(true)
    const l2 = armLatch(5000) // a new transition
    expect(canFire(l2, 5000 + LOCKOUT_MS)).toBe(false) // must release again first
    observeRelease(l2, false)
    expect(canFire(l2, 5000 + LOCKOUT_MS)).toBe(true)
  })

  it('honours a custom cooldown', () => {
    const l = armLatch(0)
    observeRelease(l, false)
    expect(canFire(l, 150, 200)).toBe(false)
    expect(canFire(l, 200, 200)).toBe(true)
  })
})
