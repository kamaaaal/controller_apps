/**
 * Input lock-out / release latch for screen transitions (iteration 13, fix 4a).
 *
 * When the app transitions between screens (a challenge entering `result`, the
 * settings dialog opening/closing, a route change) a button that is still held —
 * or the very press that was mid-flight — must not immediately activate the
 * focused control on the new screen. The latch is armed on every transition and
 * stays closed until *every* tracked action button has been observed released at
 * least once AND a short cooldown has elapsed. Only then are confirm/back
 * allowed through again.
 *
 * Pure timing/state logic — no DOM, no React — so it is unit-testable and can be
 * shared by the app shell and the navigation hook.
 */

/** Buttons whose held state can trigger confirm/back-style actions. */
export type LockableButton = 'a' | 'b' | 'back' | 'start'

export const LOCKABLE_BUTTONS: readonly LockableButton[] = ['a', 'b', 'back', 'start']

/** Cooldown applied on top of the release latch. */
export const DEFAULT_LOCKOUT_MS = 400

export class InputLockout {
  private readonly cooldownMs: number
  private armedAt: number | null = null
  private readonly released = new Set<LockableButton>()

  constructor(cooldownMs: number = DEFAULT_LOCKOUT_MS) {
    this.cooldownMs = cooldownMs
  }

  /** Arm the latch at time `now` (ms, same clock as the nav loop). */
  arm(now: number): void {
    this.armedAt = now
    this.released.clear()
  }

  /**
   * Feed the current per-button pressed state. Buttons observed in the released
   * position are marked as "has been released since arming". Calling this while
   * unarmed is a no-op. The set never shrinks: a release counts even if the
   * button is pressed again afterwards (that new press is a fresh, deliberate
   * edge and is allowed once the cooldown has elapsed).
   */
  update(now: number, pressed: Partial<Record<LockableButton, boolean>>): void {
    void now
    if (this.armedAt === null) return
    for (const button of LOCKABLE_BUTTONS) {
      if (!pressed[button]) this.released.add(button)
    }
  }

  /**
   * True while confirm/back must be ignored: during the cooldown, or until a
   * button that was held at arm time has been released at least once.
   */
  isLocked(now: number): boolean {
    if (this.armedAt === null) return false
    if (now - this.armedAt < this.cooldownMs) return true
    return LOCKABLE_BUTTONS.some((button) => !this.released.has(button))
  }
}
