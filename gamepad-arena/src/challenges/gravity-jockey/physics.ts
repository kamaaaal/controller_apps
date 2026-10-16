/**
 * Gravity Jockey — pure physics and layouts (iteration 16).
 *
 * Deterministic Newtonian toy physics: gravity wells (GM/r², capped near the
 * surface), thrust, exponential damping and a speed clamp. No physics library —
 * simple integration + circle geometry is exactly the right tool here, and
 * keeping it pure makes trajectories unit-testable.
 *
 * World space = screen space (no camera); y increases downward.
 */

import { mulberry32, rngRange, type Rng } from '../../utils/rng'

export interface Vec {
  x: number
  y: number
}

export interface Ship {
  x: number
  y: number
  vx: number
  vy: number
}

export interface Planet {
  x: number
  y: number
  r: number
  gm: number
}

export interface Mine {
  cx: number
  cy: number
  orbitR: number
  period: number
  r: number
  phase: number
}

export const SHIP_RADIUS = 8
export const THRUST = 340 // px/s² at full stick deflection
export const DAMPING = 0.4 // exponential damping per second
export const MAX_SPEED = 520 // px/s — keeps control with momentum
export const NEAR_MISS_HALO = 24 // px beyond surface counted as slingshot
export const BOUNCE = 0.55 // restitution on planet collision

const MAX_WELL_ACCEL = 900 // px/s² cap so surfaces stay survivable

/** Net gravity acceleration at a point. Bodies need only position + gm. */
export function gravityAccelAt(
  x: number,
  y: number,
  planets: readonly { x: number; y: number; gm: number }[]
): Vec {
  let ax = 0
  let ay = 0
  for (const p of planets) {
    const dx = p.x - x
    const dy = p.y - y
    const d2 = Math.max(1, dx * dx + dy * dy)
    const d = Math.sqrt(d2)
    const a = Math.min(MAX_WELL_ACCEL, p.gm / d2)
    ax += (dx / d) * a
    ay += (dy / d) * a
  }
  return { x: ax, y: ay }
}

/** Integrate one ship: thrust (stick vector, -1..1) + gravity + damping + clamp. */
export function stepShip(
  ship: Ship,
  thrust: Vec,
  planets: readonly { x: number; y: number; gm: number }[],
  dt: number
): void {
  const g = gravityAccelAt(ship.x, ship.y, planets)
  ship.vx += (g.x + thrust.x * THRUST) * dt
  ship.vy += (g.y + thrust.y * THRUST) * dt

  const damp = Math.exp(-DAMPING * dt)
  ship.vx *= damp
  ship.vy *= damp

  const speed = Math.hypot(ship.vx, ship.vy)
  if (speed > MAX_SPEED) {
    const k = MAX_SPEED / speed
    ship.vx *= k
    ship.vy *= k
  }

  ship.x += ship.vx * dt
  ship.y += ship.vy * dt
}

export function distanceTo(ship: Ship, body: { x: number; y: number; r: number }): number {
  return Math.hypot(ship.x - body.x, ship.y - body.y)
}

export function collidesWith(ship: Ship, body: { x: number; y: number; r: number }): boolean {
  return distanceTo(ship, body) < body.r + SHIP_RADIUS
}

/** Close flyby halo — the slingshot window. */
export function nearMiss(ship: Ship, body: { x: number; y: number; r: number }): boolean {
  const d = distanceTo(ship, body)
  return d >= body.r + SHIP_RADIUS && d < body.r + SHIP_RADIUS + NEAR_MISS_HALO
}

/** Push a ship out of a body and reflect its velocity (lossy bounce). */
export function bounceOff(ship: Ship, body: { x: number; y: number; r: number }): void {
  const dx = ship.x - body.x
  const dy = ship.y - body.y
  const d = Math.max(0.001, Math.hypot(dx, dy))
  const nx = dx / d
  const ny = dy / d
  ship.x = body.x + nx * (body.r + SHIP_RADIUS + 1)
  ship.y = body.y + ny * (body.r + SHIP_RADIUS + 1)
  const vn = ship.vx * nx + ship.vy * ny
  if (vn < 0) {
    ship.vx = (ship.vx - 2 * vn * nx) * BOUNCE
    ship.vy = (ship.vy - 2 * vn * ny) * BOUNCE
  }
}

export function minePosition(mine: Mine, time: number): { x: number; y: number; r: number } {
  const angle = mine.phase + (time / mine.period) * Math.PI * 2
  return {
    x: mine.cx + Math.cos(angle) * mine.orbitR,
    y: mine.cy + Math.sin(angle) * mine.orbitR,
    r: mine.r,
  }
}

// ---- Seeded layouts ---------------------------------------------------------

export interface ArenaLayout {
  planets: Planet[]
  mine: Mine
  leftFragments: Vec[]
  rightFragments: Vec[]
  leftSwitch: Vec
  rightSwitch: Vec
  exit: { x: number; y: number; r: number }
}

export const FRAGMENTS_PER_SHIP = 4

function placeFragments(rng: Rng, planets: Planet[], avoid: Vec[], w: number, h: number): Vec[] {
  const out: Vec[] = []
  while (out.length < FRAGMENTS_PER_SHIP) {
    const p = planets[Math.floor(rng() * planets.length)]
    const angle = rngRange(rng, 0, Math.PI * 2)
    const dist = p.r + rngRange(rng, 42, 130)
    const candidate = {
      x: Math.min(w - 50, Math.max(50, p.x + Math.cos(angle) * dist)),
      y: Math.min(h - 70, Math.max(70, p.y + Math.sin(angle) * dist)),
    }
    if (avoid.some((v) => Math.hypot(v.x - candidate.x, v.y - candidate.y) < 90)) continue
    if (out.some((v) => Math.hypot(v.x - candidate.x, v.y - candidate.y) < 90)) continue
    out.push(candidate)
  }
  return out
}

/** Deterministic arena for a seed: three wells, one orbiting mine, fragments
 *  tucked around the wells, switches in opposite corners, central exit. */
export function makeArena(seed: number, w: number, h: number): ArenaLayout {
  const rng = mulberry32(seed)
  const planets: Planet[] = [
    { x: w * 0.38, y: h * 0.42, r: 62, gm: 62 * 62 * 26 },
    { x: w * 0.68, y: h * 0.32, r: 44, gm: 44 * 44 * 26 },
    { x: w * 0.58, y: h * 0.72, r: 34, gm: 34 * 34 * 26 },
  ]
  const mine: Mine = {
    cx: planets[0].x,
    cy: planets[0].y,
    orbitR: planets[0].r + 96,
    period: rngRange(rng, 8, 11),
    r: 13,
    phase: rngRange(rng, 0, Math.PI * 2),
  }
  const leftSwitch = { x: w * 0.12, y: h * 0.2 }
  const rightSwitch = { x: w * 0.88, y: h * 0.82 }
  const leftFragments = placeFragments(rng, planets, [leftSwitch], w, h)
  const rightFragments = placeFragments(rng, planets, [rightSwitch, ...leftFragments], w, h)
  return {
    planets,
    mine,
    leftFragments,
    rightFragments,
    leftSwitch,
    rightSwitch,
    exit: { x: w * 0.5, y: h * 0.5, r: 34 },
  }
}
