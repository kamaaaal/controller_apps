/**
 * Full-app gamepad control.
 *
 * Polls the connected gamepad once per frame, turns D-pad / left-stick into
 * navigation intents and A / B / Back / Start into actions, with edge detection
 * and hold-to-repeat, and hands everything to the provided callbacks.
 *
 * The hook is intentionally input-only: it knows nothing about focus or React
 * state, so the caller decides what "confirm" or "back" means per screen.
 */

import { useEffect, useRef } from 'react'
import { normalizeGamepadInput, type ControllerOverrides } from '../utils/input'
import { NAV_DIRECTIONS, type NavDirection } from '../utils/focusNavigation'
import type { InputLockout } from '../utils/inputLockout'
import type { NormalizedInput } from '../types'

/** Left-stick magnitude required before it counts as a directional press. */
const NAV_STICK_THRESHOLD = 0.5
/** Delay before a held direction starts auto-repeating. */
const HOLD_DELAY_MS = 380
/** Interval between auto-repeat steps. */
const REPEAT_MS = 120

interface NavState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  a: boolean
  b: boolean
  back: boolean
  start: boolean
}

function deriveState(input: NormalizedInput): NavState {
  const b = input.buttons

  // The D-pad arrives as a single vector (from buttons or from a hat switch
  // on an axis), so one code path covers every controller.
  const dpad = input.dpad
  let up = dpad.y < -0.5
  let down = dpad.y > 0.5
  let left = dpad.x < -0.5
  let right = dpad.x > 0.5

  const stick = input.axes.leftStick
  if (Math.hypot(stick.x, stick.y) > NAV_STICK_THRESHOLD) {
    if (Math.abs(stick.x) > Math.abs(stick.y)) {
      if (stick.x > 0) right = true
      else left = true
    } else {
      if (stick.y > 0) down = true
      else up = true
    }
  }

  return { up, down, left, right, a: b.a, b: b.b, back: b.back, start: b.start }
}

export interface GamepadNavigationOptions {
  gamepad: Gamepad | null
  /** When false (e.g. during gameplay) input is ignored but edge state is kept in sync. */
  enabled: boolean
  deadzone?: number
  /** Per-device overrides (button map, axis map, hat switch). */
  mapping?: ControllerOverrides
  /**
   * Optional transition lock-out (iteration 13, fix 4a). While the latch is
   * locked, confirm / back / start edges are swallowed; directions still work.
   * The latch's `update()` is fed every frame (even while disabled) so a button
   * held across a screen transition must be released before actions resume.
   */
  lockout?: InputLockout
  onDirection: (direction: NavDirection) => void
  onConfirm: () => void
  onBack: () => void
  onStart?: () => void
  onActivity?: () => void
}

export function useGamepadNavigation(options: GamepadNavigationOptions): void {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const prevRef = useRef<NavState>({
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    back: false,
    start: false,
  })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let holdDirection: NavDirection | null = null
    let holdTime = 0
    let repeatTime = 0

    const loop = (now: number) => {
      const dt = now - last
      last = now
      const opts = optionsRef.current

      if (opts.gamepad) {
        const input = normalizeGamepadInput(opts.gamepad, opts.deadzone ?? 0.15, opts.mapping)
        const state = deriveState(input)

        // Feed the release latch every frame, enabled or not, so a button held
        // across a transition is only "spent" once it has physically come up.
        opts.lockout?.update(now, state)

        if (opts.enabled) {
          const prev = prevRef.current
          const locked = opts.lockout?.isLocked(now) ?? false

          if (state.a && !prev.a && !locked) opts.onConfirm()
          if (((state.b && !prev.b) || (state.back && !prev.back)) && !locked) opts.onBack()
          if (state.start && !prev.start && !locked) opts.onStart?.()

          for (const direction of NAV_DIRECTIONS) {
            if (state[direction] && !prev[direction]) {
              opts.onDirection(direction)
              holdDirection = direction
              holdTime = 0
              repeatTime = 0
            }
          }

          if (holdDirection && state[holdDirection]) {
            holdTime += dt
            if (holdTime >= HOLD_DELAY_MS) {
              repeatTime += dt
              if (repeatTime >= REPEAT_MS) {
                repeatTime = 0
                opts.onDirection(holdDirection)
              }
            }
          } else if (holdDirection && !state[holdDirection]) {
            holdDirection = null
            holdTime = 0
            repeatTime = 0
          }

          if (
            state.a || state.b || state.back || state.start ||
            state.up || state.down || state.left || state.right
          ) {
            opts.onActivity?.()
          }
        } else {
          holdDirection = null
          holdTime = 0
          repeatTime = 0
        }

        prevRef.current = state
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}
