/**
 * Pure math for the joystick-reactive background art (iteration 14).
 *
 * Turns raw stick axes into a deadzone-filtered parallax vector plus a
 * clamped magnitude, and provides the exponential-smoothing step used to
 * ease the artwork toward that target each frame.
 */

import { applyDeadzone } from './input'

export interface ParallaxState {
  x: number
  y: number
  /** Stick magnitude, clamped to 0..1 (drives the glow intensity). */
  m: number
}

export const PARALLAX_REST: ParallaxState = { x: 0, y: 0, m: 0 }

/** Deadzone-filtered stick vector + clamped magnitude. */
export function parallaxTarget(ax: number, ay: number, deadzone: number): ParallaxState {
  const x = applyDeadzone(ax, deadzone)
  const y = applyDeadzone(ay, deadzone)
  const m = Math.min(1, Math.hypot(x, y))
  return { x, y, m }
}

/** Single exponential-smoothing step toward the target. */
export function lerpParallax(
  current: ParallaxState,
  target: ParallaxState,
  factor: number
): ParallaxState {
  return {
    x: current.x + (target.x - current.x) * factor,
    y: current.y + (target.y - current.y) * factor,
    m: current.m + (target.m - current.m) * factor,
  }
}
