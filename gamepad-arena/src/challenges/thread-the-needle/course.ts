/**
 * Thread the Needle — pure course generation and predicates (iteration 16).
 *
 * The course is two vertical weaving corridors (seeded double-sine centrelines)
 * with gates punched across them. Simulation-free on purpose: the challenge
 * owns movement; this module owns geometry, so corridor/gate logic is unit
 * testable and deterministic per seed.
 *
 * World space: y increases UPWARD (distance climbed). Screen mapping lives in
 * the challenge.
 */

import { mulberry32, rngRange, type Rng } from '../../utils/rng'

export const ORB_RADIUS = 9

export interface RouteParams {
  baseX: number
  amp1: number
  freq1: number
  phase1: number
  amp2: number
  freq2: number
  phase2: number
}

export type GateKind = 'normal' | 'pair'

export interface GateDef {
  index: number
  side: 'left' | 'right'
  y: number
  /** Gap centre offset from this route's centreline at y. */
  gapOffset: number
  /** Half width of the opening. */
  gapHalf: number
  kind: GateKind
  /** Pair gates: offset of the charge ring on the OTHER route (same y). */
  chargeOffset: number
}

export interface Course {
  left: RouteParams
  right: RouteParams
  gates: GateDef[]
}

/** Vertical climb speed (world px/s) — constant; the sticks steer laterally. */
export const CLIMB_SPEED = 95
/** Lateral full-deflection speed (world px/s). */
export const LATERAL_SPEED = 300
/** Stick-y influence on climb (world px/s at full deflection, ±). */
export const CLIMB_NUDGE = 55
/** Gate spacing along y (world px). */
export const GATE_SPACING = 300

export function centreline(route: RouteParams, y: number): number {
  return (
    route.baseX +
    route.amp1 * Math.sin(route.freq1 * y + route.phase1) +
    route.amp2 * Math.sin(route.freq2 * y + route.phase2)
  )
}

/** Corridor half-width narrows 90 → 60 px with run progress (0..1). */
export function corridorHalfWidth(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return 90 - 30 * p
}

/** Gate openings narrow 48 → 32 px half-width as the course advances. */
export function gapHalfForGate(index: number): number {
  return Math.max(32, 48 - index * 0.4)
}

export function gateSide(index: number): 'left' | 'right' {
  return index % 2 === 0 ? 'left' : 'right'
}

export function isPairGate(index: number): boolean {
  return index % 4 === 3
}

function makeRoute(rng: Rng, baseX: number): RouteParams {
  return {
    baseX,
    amp1: rngRange(rng, 70, 110),
    freq1: rngRange(rng, 0.0026, 0.0038),
    phase1: rngRange(rng, 0, Math.PI * 2),
    amp2: rngRange(rng, 22, 40),
    freq2: rngRange(rng, 0.009, 0.014),
    phase2: rngRange(rng, 0, Math.PI * 2),
  }
}

/** Generate the deterministic course for a seed. */
export function makeCourse(seed: number, arenaWidth: number): Course {
  const rng = mulberry32(seed)
  const left = makeRoute(rng, arenaWidth * 0.3)
  const right = makeRoute(rng, arenaWidth * 0.7)

  const gates: GateDef[] = []
  const count = 220 // enough for any 60s run at CLIMB_SPEED with headroom
  for (let i = 0; i < count; i++) {
    const side = gateSide(i)
    gates.push({
      index: i,
      side,
      y: 500 + i * GATE_SPACING,
      gapOffset: rngRange(rng, -58, 58),
      gapHalf: gapHalfForGate(i),
      kind: isPairGate(i) ? 'pair' : 'normal',
      chargeOffset: rngRange(rng, -50, 50),
    })
  }
  return { left, right, gates }
}

export function routeOf(course: Course, side: 'left' | 'right'): RouteParams {
  return side === 'left' ? course.left : course.right
}

/** True when the orb centre is inside its corridor at world y. */
export function withinCorridor(course: Course, side: 'left' | 'right', y: number, x: number, halfWidth: number): boolean {
  return Math.abs(x - centreline(routeOf(course, side), y)) <= halfWidth
}

/** True when world y crossed gate y moving upward this step. */
export function gateCrossed(prevY: number, curY: number, gateY: number): boolean {
  return prevY < gateY && curY >= gateY
}

export interface GateEval {
  passed: boolean
  perfect: boolean
  charged: boolean
}

/** Evaluate an orb crossing its gate. Pair gates need the other orb inside
 *  its charge ring (|dy| < 40 and |lateral offset| < 40). */
export function evaluateGateCrossing(
  course: Course,
  gate: GateDef,
  orb: { side: 'left' | 'right'; y: number; x: number },
  other: { y: number; x: number }
): GateEval {
  const line = centreline(routeOf(course, gate.side), gate.y)
  const gapCentre = line + gate.gapOffset

  let charged = true
  if (gate.kind === 'pair') {
    const otherSide = gate.side === 'left' ? 'right' : 'left'
    const otherLine = centreline(routeOf(course, otherSide), gate.y)
    charged =
      Math.abs(other.y - gate.y) < 40 &&
      Math.abs(other.x - (otherLine + gate.chargeOffset)) < 40
  }

  const lateral = Math.abs(orb.x - gapCentre)
  const passed = charged && lateral <= gate.gapHalf - ORB_RADIUS * 0.5
  const perfect = passed && lateral < 12
  return { passed, perfect, charged }
}
