import { describe, it, expect } from 'vitest'
import { DEFAULT_LOCKOUT_MS, InputLockout, LOCKABLE_BUTTONS } from './inputLockout'

function pressedState(pressed: string[]): Record<string, boolean> {
  return Object.fromEntries(LOCKABLE_BUTTONS.map((b) => [b, pressed.includes(b)]))
}

describe('InputLockout', () => {
  it('starts unlocked', () => {
    const lock = new InputLockout()
    expect(lock.isLocked(1000)).toBe(false)
  })

  it('is locked for the whole cooldown even when nothing is held', () => {
    const lock = new InputLockout()
    lock.arm(0)
    lock.update(0, pressedState([]))
    expect(lock.isLocked(DEFAULT_LOCKOUT_MS - 1)).toBe(true)
    expect(lock.isLocked(DEFAULT_LOCKOUT_MS)).toBe(false)
  })

  it('stays locked past the cooldown while a button has never been released', () => {
    const lock = new InputLockout()
    lock.arm(0)
    lock.update(0, pressedState(['a']))
    lock.update(300, pressedState(['a']))
    // Long past the cooldown, but A was held when the latch armed and never came up.
    expect(lock.isLocked(5_000)).toBe(true)
    lock.update(5_100, pressedState([]))
    expect(lock.isLocked(5_200)).toBe(false)
  })

  it('allows a fresh press after the held button has been released once', () => {
    const lock = new InputLockout()
    lock.arm(0)
    lock.update(0, pressedState(['a']))
    lock.update(100, pressedState([])) // release observed
    expect(lock.isLocked(DEFAULT_LOCKOUT_MS)).toBe(false)
    // Pressing again later is a deliberate new press — the latch stays open.
    lock.update(600, pressedState(['a']))
    expect(lock.isLocked(600)).toBe(false)
  })

  it('tracks every action button (a, b, back, start), not just A', () => {
    const lock = new InputLockout()
    lock.arm(0)
    lock.update(0, pressedState(['start', 'back']))
    lock.update(200, pressedState(['back']))
    expect(lock.isLocked(5_000)).toBe(true) // start still held
    lock.update(5_100, pressedState([]))
    expect(lock.isLocked(5_200)).toBe(false)
  })

  it('re-arming re-latches', () => {
    const lock = new InputLockout()
    lock.arm(0)
    lock.update(0, pressedState([]))
    expect(lock.isLocked(DEFAULT_LOCKOUT_MS)).toBe(false)
    lock.arm(1_000)
    lock.update(1_000, pressedState([]))
    expect(lock.isLocked(1_000 + DEFAULT_LOCKOUT_MS - 1)).toBe(true)
    expect(lock.isLocked(1_000 + DEFAULT_LOCKOUT_MS)).toBe(false)
  })

  it('is a no-op to update while unarmed', () => {
    const lock = new InputLockout()
    expect(() => lock.update(0, pressedState(['a']))).not.toThrow()
    expect(lock.isLocked(0)).toBe(false)
  })

  it('ignores an unknown/empty pressed map (buttons default to released)', () => {
    const lock = new InputLockout()
    lock.arm(0)
    lock.update(0, {})
    expect(lock.isLocked(DEFAULT_LOCKOUT_MS)).toBe(false)
  })
})
