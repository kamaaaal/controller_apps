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
import { normalizeGamepadInput } from '../utils/input'
import { NAV_DIRECTIONS, type NavDirection } from '../utils/focusNavigation'
import { armLatch, observeRelease, canFire, type LatchState } from '../utils/inputLatch'
import type { ButtonMapping, NormalizedInput } from '../types'

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
  let up = b.dpadUp
  let down = b.dpadDown
  let left = b.dpadLeft
  let right = b.dpadRight

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
  mapping?: ButtonMapping
  onDirection: (direction: NavDirection) => void
  onConfirm: () => void
  onBack: () => void
  onStart?: () => void
  onActivity?: () => void
  /**
   * Changes on every screen/route transition (e.g. `${route}:${gameState}:${modal}`).
   * When it changes, the confirm/back release-latch re-arms so a held button
   * cannot bleed an action across the transition.
   */
  lockKey?: string | number
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
    let lockKey = optionsRef.current.lockKey
    let confirmLatch: LatchState = armLatch(last)
    let backLatch: LatchState = armLatch(last)

    const loop = (now: number) => {
      const dt = now - last
      last = now
      const opts = optionsRef.current

      if (opts.gamepad) {
        const input = normalizeGamepadInput(opts.gamepad, opts.deadzone ?? 0.15, opts.mapping)
        const state = deriveState(input)

        if (opts.enabled) {
          const prev = prevRef.current

          // Re-arm the release-latch whenever the screen/route changes.
          if (opts.lockKey !== lockKey) {
            lockKey = opts.lockKey
            confirmLatch = armLatch(now)
            backLatch = armLatch(now)
          }
          observeRelease(confirmLatch, state.a)
          observeRelease(backLatch, state.b || state.back)

          if (state.a && !prev.a && canFire(confirmLatch, now)) opts.onConfirm()
          if (((state.b && !prev.b) || (state.back && !prev.back)) && canFire(backLatch, now)) opts.onBack()
          if (state.start && !prev.start) opts.onStart?.()

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
