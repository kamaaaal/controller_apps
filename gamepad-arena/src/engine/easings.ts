/**
 * Pure easing functions (iteration 15).
 *
 * Each maps normalised time `t` in [0, 1] to an eased progress value. Used by
 * the FX tween system and anything else that needs cheap, testable motion
 * curves without a dependency.
 */

export type Easing = (t: number) => number

export const linear: Easing = (t) => t

export const quadIn: Easing = (t) => t * t

export const quadOut: Easing = (t) => t * (2 - t)

export const quadInOut: Easing = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)

export const cubicOut: Easing = (t) => 1 + --t * t * t

export const backOut: Easing = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export const elasticOut: Easing = (t) => {
  if (t === 0 || t === 1) return t
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}
