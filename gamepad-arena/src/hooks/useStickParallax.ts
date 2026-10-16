/**
 * Joystick-reactive background art (iteration 14).
 *
 * Samples the connected gamepad's left stick every frame, lerps toward the
 * deadzone-filtered target and exposes the smoothed vector as CSS custom
 * properties — `--joy-x`, `--joy-y` (parallax) and `--joy-m` (magnitude,
 * drives a glow) — on the given element. The `.bg-art` icon slots consume
 * these; purely decorative, never an input path.
 */

import { useEffect, useRef, type RefObject } from 'react'
import { PARALLAX_REST, lerpParallax, parallaxTarget, type ParallaxState } from '../utils/stickParallax'

const LERP_FACTOR = 0.14
const WRITE_EPSILON = 0.001

export function useStickParallax(
  ref: RefObject<HTMLElement | null>,
  gamepad: Gamepad | null,
  deadzone: number
): void {
  const stateRef = useRef<ParallaxState>(PARALLAX_REST)
  const writtenRef = useRef<ParallaxState | null>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        const target = gamepad
          ? parallaxTarget(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0, deadzone)
          : PARALLAX_REST
        const next = lerpParallax(stateRef.current, target, LERP_FACTOR)
        stateRef.current = next
        const last = writtenRef.current
        if (
          !last ||
          Math.abs(last.x - next.x) > WRITE_EPSILON ||
          Math.abs(last.y - next.y) > WRITE_EPSILON ||
          Math.abs(last.m - next.m) > WRITE_EPSILON
        ) {
          el.style.setProperty('--joy-x', next.x.toFixed(3))
          el.style.setProperty('--joy-y', next.y.toFixed(3))
          el.style.setProperty('--joy-m', next.m.toFixed(3))
          writtenRef.current = next
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ref, gamepad, deadzone])
}
