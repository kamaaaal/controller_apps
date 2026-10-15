/**
 * Input lock-out / release latch.
 *
 * After any screen transition (entering the result screen, opening/closing a
 * modal, changing route) a button that is still held — or the same press that
 * ended the game — must not immediately activate the newly focused control.
 *
 * The latch gates confirm/back edges until BOTH hold:
 *   1. the button has been observed released at least once since the transition, and
 *   2. a short cooldown has elapsed.
 *
 * Directional navigation is intentionally NOT gated — only confirm/back.
 * This module is pure so the timing logic can be unit-tested.
 */

/** Default cooldown after a transition before confirm/back may fire again. */
export const LOCKOUT_MS = 400

export interface LatchState {
  /** Time the latch was armed (performance.now() ms). */
  lockTime: number
  /** Whether the gated button has been seen released since arming. */
  released: boolean
}

/** Arm (or re-arm) the latch at `now`, requiring a fresh release + cooldown. */
export function armLatch(now: number): LatchState {
  return { lockTime: now, released: false }
}

/** Feed the current pressed state each frame; records the first release. */
export function observeRelease(state: LatchState, isPressed: boolean): void {
  if (!isPressed) state.released = true
}

/** True only once the button was released since arming AND the cooldown passed. */
export function canFire(state: LatchState, now: number, cooldownMs: number = LOCKOUT_MS): boolean {
  return state.released && now - state.lockTime >= cooldownMs
}
