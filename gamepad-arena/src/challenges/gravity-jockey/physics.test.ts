import { describe, it, expect } from 'vitest'
import {
  BOUNCE,
  FRAGMENTS_PER_SHIP,
  MAX_SPEED,
  SHIP_RADIUS,
  bounceOff,
  collidesWith,
  gravityAccelAt,
  makeArena,
  minePosition,
  nearMiss,
  stepShip,
  type Planet,
  type Ship,
} from './physics'

const PLANET: Planet = { x: 100, y: 100, r: 30, gm: 30 * 30 * 26 }

describe('gravityAccelAt', () => {
  it('points toward the planet and weakens with distance', () => {
    const near = gravityAccelAt(160, 100, [PLANET])
    expect(near.x).toBeLessThan(0) // pulled left, toward the planet
    expect(near.y).toBeCloseTo(0)
    const far = gravityAccelAt(400, 100, [PLANET])
    expect(Math.abs(far.x)).toBeLessThan(Math.abs(near.x))
  })

  it('is capped near the surface (no infinite wells)', () => {
    const surface = gravityAccelAt(131, 100, [PLANET])
    expect(Math.hypot(surface.x, surface.y)).toBeLessThanOrEqual(900)
  })
})

describe('stepShip', () => {
  it('keeps gliding with momentum when thrust stops', () => {
    const ship: Ship = { x: 600, y: 400, vx: 200, vy: 0 }
    const planets: Planet[] = []
    const before = ship.vx
    stepShip(ship, { x: 0, y: 0 }, planets, 1 / 60)
    expect(ship.x).toBeGreaterThan(600)
    expect(ship.vx).toBeLessThanOrEqual(before) // only damping acts
    expect(ship.vx).toBeGreaterThan(before * 0.9) // barely slowed in one frame
  })

  it('thrust accelerates along the stick vector', () => {
    const ship: Ship = { x: 600, y: 400, vx: 0, vy: 0 }
    for (let i = 0; i < 60; i++) stepShip(ship, { x: 1, y: 0 }, [], 1 / 60)
    expect(ship.vx).toBeGreaterThan(0)
    expect(Math.abs(ship.vy)).toBeLessThan(1)
  })

  it('clamps speed', () => {
    const ship: Ship = { x: 600, y: 400, vx: 5000, vy: 0 }
    stepShip(ship, { x: 0, y: 0 }, [], 1 / 60)
    expect(Math.hypot(ship.vx, ship.vy)).toBeLessThanOrEqual(MAX_SPEED + 0.01)
  })
})

describe('collision + bounce', () => {
  it('detects overlap and near-miss halo, not both', () => {
    const deep: Ship = { x: 128, y: 100, vx: 0, vy: 0 }
    expect(collidesWith(deep, PLANET)).toBe(true)
    expect(nearMiss(deep, PLANET)).toBe(false)

    const halo: Ship = { x: 100 + 30 + SHIP_RADIUS + 10, y: 100, vx: 0, vy: 0 }
    expect(collidesWith(halo, PLANET)).toBe(false)
    expect(nearMiss(halo, PLANET)).toBe(true)

    const far: Ship = { x: 400, y: 100, vx: 0, vy: 0 }
    expect(nearMiss(far, PLANET)).toBe(false)
  })

  it('bounce pushes out and reflects with restitution', () => {
    const ship: Ship = { x: 125, y: 100, vx: -100, vy: 0 }
    bounceOff(ship, PLANET)
    expect(ship.x).toBeGreaterThanOrEqual(100 + 30 + SHIP_RADIUS)
    expect(ship.vx).toBeGreaterThan(0) // reversed
    expect(ship.vx).toBeLessThanOrEqual(100 * BOUNCE + 0.01)
  })
})

describe('mine orbit', () => {
  it('is deterministic and stays on its circle', () => {
    const mine = { cx: 300, cy: 300, orbitR: 120, period: 9, r: 13, phase: 0.5 }
    const a = minePosition(mine, 3.2)
    const b = minePosition(mine, 3.2)
    expect(a).toEqual(b)
    expect(Math.hypot(a.x - 300, a.y - 300)).toBeCloseTo(120)
  })
})

describe('makeArena', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = makeArena(21, 1280, 720)
    const b = makeArena(21, 1280, 720)
    expect(a).toEqual(b)
    expect(makeArena(22, 1280, 720)).not.toEqual(a)
  })

  it('places all fragments inside the arena and clear of wells', () => {
    const arena = makeArena(5, 1280, 720)
    const all = [...arena.leftFragments, ...arena.rightFragments]
    expect(all).toHaveLength(FRAGMENTS_PER_SHIP * 2)
    for (const f of all) {
      expect(f.x).toBeGreaterThan(0)
      expect(f.x).toBeLessThan(1280)
      expect(f.y).toBeGreaterThan(0)
      expect(f.y).toBeLessThan(720)
      for (const p of arena.planets) {
        expect(Math.hypot(f.x - p.x, f.y - p.y)).toBeGreaterThan(p.r)
      }
    }
  })
})
