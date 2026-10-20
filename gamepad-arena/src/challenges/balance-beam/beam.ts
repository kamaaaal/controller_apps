/**
 * Balance Beam — beam and ball physics (pure logic).
 *
 * The beam is a spring-damper driven by an analog tilt signal, and the ball
 * rolls along it under gravity. Everything is expressed in beam-local
 * coordinates (x along the beam, 0 = centre) so the rendering layer only has
 * to place the beam on screen.
 *
 * Sign convention: a positive tilt lowers the RIGHT end, so the ball
 * accelerates towards +x. Pressing RT therefore rolls the ball right.
 */

export const MAX_TILT = 0.38 // radians at full tilt
export const BEAM_HALF_LENGTH = 260 // pixels from centre to either end
export const BEAM_STIFFNESS = 180 // spring constant pulling the beam to target
export const BEAM_DAMPING = 20 // angular damping (ζ ≈ 0.75: settles fast, tiny overshoot)
export const GRAVITY = 900 // px/s²
export const ROLL_FRICTION = 0.7 // linear damping on the ball
export const ORB_RADIUS = 18
export const ORB_MIN_GAP = 70

export interface BeamState {
  /** Current tilt in radians (positive = right end down). */
  angle: number
  /** Angular velocity in rad/s. */
  angularVelocity: number
}

export interface BallState {
  /** Position along the beam. */
  x: number
  /** Velocity along the beam. */
  vx: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Tilt signal from the two analog triggers: RT positive, LT negative. */
export function tiltFromTriggers(leftTrigger: number, rightTrigger: number): number {
  return clamp(rightTrigger - leftTrigger, -1, 1)
}

/**
 * Advance the beam towards `tilt` (-1 … 1) with a spring-damper.
 *
 * The spring is what makes the control feel analog rather than binary: the
 * beam eases into position instead of snapping, so tiny trigger pressure
 * produces tiny tilt.
 */
export function stepBeam(beam: BeamState, tilt: number, dt: number): BeamState {
  const target = clamp(tilt, -1, 1) * MAX_TILT
  const accel = (target - beam.angle) * BEAM_STIFFNESS - beam.angularVelocity * BEAM_DAMPING
  const angularVelocity = beam.angularVelocity + accel * dt
  const angle = beam.angle + angularVelocity * dt
  return { angle, angularVelocity }
}

/** Roll the ball along a beam tilted by `beamAngle`. */
export function stepBall(ball: BallState, beamAngle: number, dt: number): BallState {
  const acceleration = GRAVITY * Math.sin(beamAngle)
  let vx = ball.vx + acceleration * dt
  vx -= vx * ROLL_FRICTION * dt
  const x = ball.x + vx * dt
  return { x, vx }
}

/** True once the ball has rolled off the end of the beam. */
export function isOffBeam(ball: BallState): boolean {
  return Math.abs(ball.x) > BEAM_HALF_LENGTH
}

/** True when the ball is touching an orb at `orbX`. */
export function collectOrb(ballX: number, orbX: number): boolean {
  return Math.abs(ballX - orbX) <= ORB_RADIUS
}

/**
 * A valid orb position: on the beam, and far enough from `previousX` that
 * the player has to actually move the ball.
 */
export function nextOrbX(rng: () => number, previousX: number): number {
  const margin = 40
  const span = BEAM_HALF_LENGTH - margin
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = (rng() * 2 - 1) * span
    if (Math.abs(x - previousX) >= ORB_MIN_GAP) return x
  }
  // Fallback: the far side of the beam from the previous orb.
  return previousX >= 0 ? -span : span
}

/** True when a trigger reading looks analog rather than fully on/off. */
export function isAnalogReading(value: number): boolean {
  return value > 0.05 && value < 0.95
}
