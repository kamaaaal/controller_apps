/**
 * Thread the Needle (iteration 16) — precision + smoothness + anticipation.
 *
 * Two orbs climb two weaving neon corridors (left stick = left orb, right
 * stick = right orb). Stick x steers laterally with magnitude-proportional
 * speed (smoothed), stick y nudges the climb for gate timing. Gates punch
 * bars across the corridors; every 4th gate is a PAIR gate that only opens
 * while the other orb holds its charge ring — hold one, thread the other.
 *
 * Difficulty: corridors narrow and gate gaps shrink with progress — spatial
 * complexity instead of raw speed. Wall scrapes are forgiving (clamp + streak
 * reset), never instant death.
 */

import type { Application, Container, Graphics, Text, TextStyleOptions } from 'pixi.js'
import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { playSfx } from '../../engine/audio'
import { BurstPool, PulseRing, Trail, computeShake, type PixiModules } from '../../engine/pixiFx'
import { TIMING } from '../../config/timing'
import { getMoveVector } from '../../utils/input'
import {
  CLIMB_NUDGE,
  CLIMB_SPEED,
  LATERAL_SPEED,
  ORB_RADIUS,
  centreline,
  corridorHalfWidth,
  evaluateGateCrossing,
  gateCrossed,
  makeCourse,
  routeOf,
  type Course,
  type GateDef,
} from './course'

const LEFT_COLOR = 0x9bf00b // Xbox neon
const RIGHT_COLOR = 0x1e8fff // PS blue
const WALL_DIM = 0x2a3848
const GATE_COLOR = 0x2fd4c8
const PAIR_CLOSED = 0xff3b45
const PAIR_OPEN = 0x39d353
const CHARGE_COLOR = 0xffd23f
const ORB_RADIUS_PX = ORB_RADIUS

interface OrbState {
  x: number
  y: number
  vx: number
  vy: number
  prevY: number
  wallCooldown: number
  flash: number
  sideNext: number
}

export class ThreadTheNeedleChallenge implements Challenge {
  id = 'thread-the-needle'
  name = 'Thread the Needle'
  description = 'Twin orbs, twin corridors — thread every gate without touching the walls'
  duration = TIMING.challengeDurations['thread-the-needle']
  renderMode = 'pixi' as const

  private app: Application | null = null
  private pixi: PixiModules | null = null
  private ready = false

  private course: Course | null = null
  private left: OrbState = this.freshOrb()
  private right: OrbState = this.freshOrb()

  private sessionTime = 0
  private score = 0
  private streak = 0
  private maxStreak = 0
  private gatesPassed = 0
  private perfects = 0
  private syncs = 0
  private shakeTime = 0
  private banner = { text: '', color: 0xffffff, life: 0 }

  // Display objects
  private world: Container | null = null
  private wallsGfx: Graphics | null = null
  private gatesGfx: Graphics | null = null
  private chargeGfx: Graphics | null = null
  private orbsGfx: { left: Graphics; right: Graphics } | null = null
  private trails: { left: Trail; right: Trail } | null = null
  private bursts: BurstPool | null = null
  private pulses: PulseRing | null = null
  private hud: { score: Text; time: Text; streak: Text; left: Text; right: Text } | null = null

  private freshOrb(): OrbState {
    return { x: 0, y: 300, vx: 0, vy: 0, prevY: 300, wallCooldown: 0, flash: 0, sideNext: 0 }
  }

  setupPixi(app: Application, _gamepad: Gamepad | null): void {
    this.app = app
    this.ready = false
    void this.buildScene()
  }

  private async buildScene(): Promise<void> {
    const app = this.app
    if (!app) return
    const pixi = await import('pixi.js')
    if (this.app !== app) return
    this.pixi = pixi

    const world = new pixi.Container()
    app.stage.addChild(world)
    this.world = world

    this.wallsGfx = new pixi.Graphics()
    this.gatesGfx = new pixi.Graphics()
    this.chargeGfx = new pixi.Graphics()
    world.addChild(this.wallsGfx, this.gatesGfx, this.chargeGfx)

    const orbOf = (color: number) => {
      const g = new pixi.Graphics()
      g.circle(0, 0, ORB_RADIUS_PX + 6).fill({ color, alpha: 0.14 })
      g.circle(0, 0, ORB_RADIUS_PX).fill({ color, alpha: 0.9 })
      g.circle(0, 0, 3).fill({ color: 0xffffff })
      world.addChild(g)
      return g
    }
    this.orbsGfx = { left: orbOf(LEFT_COLOR), right: orbOf(RIGHT_COLOR) }

    this.trails = {
      left: new Trail(pixi, world, { color: LEFT_COLOR }),
      right: new Trail(pixi, world, { color: RIGHT_COLOR }),
    }
    this.bursts = new BurstPool(pixi, world)
    this.pulses = new PulseRing(pixi, world)

    const mkText = (style: TextStyleOptions, x: number, y: number) => {
      const t = new pixi.Text({ text: '', style: { fontFamily: '"JetBrains Mono", monospace', ...style } })
      t.position.set(x, y)
      app.stage.addChild(t)
      return t
    }
    this.hud = {
      score: mkText({ fontSize: 20, fill: 0xeef7ec }, 16, 12),
      time: mkText({ fontSize: 20, fill: 0xeef7ec }, app.screen.width / 2, 12),
      streak: mkText({ fontSize: 14, fill: 0xa7bcae }, 16, 40),
      left: mkText({ fontSize: 14, fill: LEFT_COLOR }, 16, app.screen.height - 30),
      right: mkText({ fontSize: 14, fill: RIGHT_COLOR }, app.screen.width - 150, app.screen.height - 30),
    }
    this.hud.time.anchor.set(0.5, 0)
    this.hud.left.text = 'L-STICK = GREEN ORB'
    this.hud.right.text = 'R-STICK = BLUE ORB'

    this.ready = true
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    if (!this.course || !this.app) return { progress: 0, score: this.score, metadata: {} }
    this.sessionTime += dt
    const progress = Math.min(1, this.sessionTime / this.duration)
    const course = this.course
    const halfW = corridorHalfWidth(progress)

    this.stepOrb(this.left, getMoveVector(input, 'left'), 'left', course, halfW, dt)
    this.stepOrb(this.right, getMoveVector(input, 'right'), 'right', course, halfW, dt)

    this.checkGates('left', course)
    this.checkGates('right', course)

    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)

    // Trail and particle simulation advance on the fixed timestep, not on the
    // draw rate, so effects age at the same speed on every display.
    for (const side of ['left', 'right'] as const) {
      const orb = side === 'left' ? this.left : this.right
      const trail = side === 'left' ? this.trails?.left : this.trails?.right
      trail?.push(orb.x, this.screenY(orb.y))
      trail?.update(dt)
    }
    this.bursts?.update(dt)
    this.pulses?.update(dt)

    return {
      progress,
      score: this.score,
      metadata: { streak: this.streak, gates: this.gatesPassed },
    }
  }

  private stepOrb(
    orb: OrbState,
    stick: { x: number; y: number },
    side: 'left' | 'right',
    course: Course,
    halfW: number,
    dt: number
  ): void {
    if (orb.wallCooldown > 0) orb.wallCooldown = Math.max(0, orb.wallCooldown - dt)
    if (orb.flash > 0) orb.flash = Math.max(0, orb.flash - dt)

    // Smoothed lateral velocity: magnitude-proportional, no diagonal boost.
    const targetVx = stick.x * LATERAL_SPEED
    orb.vx += (targetVx - orb.vx) * Math.min(1, dt * 10)
    orb.vy = CLIMB_SPEED + stick.y * CLIMB_NUDGE

    orb.prevY = orb.y
    orb.x += orb.vx * dt
    orb.y += orb.vy * dt

    // Wall scrape: clamp + feedback, never death.
    const line = centreline(routeOf(course, side), orb.y)
    const limit = halfW - ORB_RADIUS_PX
    const dx = orb.x - line
    if (Math.abs(dx) > limit) {
      orb.x = line + Math.sign(dx) * limit
      orb.vx = 0
      if (orb.wallCooldown === 0) {
        orb.wallCooldown = 0.4
        orb.flash = 0.35
        this.onWallHit(orb)
      }
    }
  }

  private onWallHit(orb: OrbState): void {
    this.streak = 0
    this.score = Math.max(0, this.score - 25)
    this.shakeTime = 0.25
    this.setBanner('SCRAPE!  −25', PAIR_CLOSED)
    playSfx('crash')
    this.bursts?.spawn(orb.x, this.screenY(orb.y), { color: PAIR_CLOSED, count: 10, speed: 140 })
  }

  private checkGates(side: 'left' | 'right', course: Course): void {
    const orb = side === 'left' ? this.left : this.right
    const other = side === 'left' ? this.right : this.left
    const stride = side === 'left' ? 2 : 1

    while (true) {
      const gate = course.gates[orb.sideNext * stride + (side === 'right' ? 1 : 0)]
      if (!gate || gate.y > orb.y) break
      orb.sideNext++
      if (!gateCrossed(orb.prevY, orb.y, gate.y)) continue
      this.resolveGate(gate, course, orb, other, side)
    }
  }

  private resolveGate(gate: GateDef, course: Course, orb: OrbState, other: OrbState, side: 'left' | 'right'): void {
    const result = evaluateGateCrossing(course, gate, { side, y: gate.y, x: orb.x }, { y: other.y, x: other.x })
    const sy = this.screenY(gate.y)
    const line = centreline(routeOf(course, gate.side), gate.y)
    const gapX = line + gate.gapOffset

    if (!result.passed) {
      this.streak = 0
      this.score = Math.max(0, this.score - 25)
      this.shakeTime = 0.22
      this.setBanner(result.charged ? 'MISSED GATE  −25' : 'GATE LOCKED — HOLD THE OTHER ORB IN THE RING', PAIR_CLOSED)
      playSfx('miss')
      this.bursts?.spawn(gapX, sy, { color: PAIR_CLOSED, count: 12, speed: 160 })
      return
    }

    this.gatesPassed++
    this.streak++
    this.maxStreak = Math.max(this.maxStreak, this.streak)
    const mult = Math.min(3, 1 + this.streak * 0.1)
    let points = Math.round(100 * mult)
    if (result.perfect) {
      this.perfects++
      points *= 2
      this.setBanner('PERFECT ×2', CHARGE_COLOR)
      playSfx('perfect')
    } else {
      this.setBanner(`+${points}`, GATE_COLOR)
      playSfx(this.streak > 0 && this.streak % 5 === 0 ? 'combo' : 'hit')
    }
    if (gate.kind === 'pair') {
      this.syncs++
      points += 250
      this.setBanner(`SYNC! +${points}`, PAIR_OPEN)
      playSfx('sync')
    }
    this.score += points
    this.pulses?.fire(gapX, sy, { color: result.perfect ? CHARGE_COLOR : GATE_COLOR, to: 64 })
    this.bursts?.spawn(gapX, sy, { color: result.perfect ? CHARGE_COLOR : GATE_COLOR, count: 14 })
  }

  private setBanner(text: string, color: number): void {
    this.banner = { text, color, life: 0.9 }
  }

  // ---- Display -----------------------------------------------------------

  /** World y at the top edge of the climb (both orbs stay visible). */
  private cameraY(): number {
    return Math.max(0, Math.min(this.left.y, this.right.y) - 240)
  }

  private screenY(worldY: number): number {
    const h = this.app?.screen.height ?? 600
    return h - 90 - (worldY - this.cameraY())
  }

  private screenToWorldY(sy: number, height: number): number {
    return this.cameraY() + (height - 90 - sy)
  }

  drawPixi(): void {
    if (!this.ready || !this.app || !this.course || !this.world || !this.pixi) return
    const { height } = this.app.screen
    const progress = Math.min(1, this.sessionTime / this.duration)
    const halfW = corridorHalfWidth(progress)
    const course = this.course

    // Walls: glow under-stroke + neon core, sampled from the seeded centrelines.
    const walls = this.wallsGfx!
    walls.clear()
    for (const side of ['left', 'right'] as const) {
      const route = routeOf(course, side)
      const color = side === 'left' ? LEFT_COLOR : RIGHT_COLOR
      for (const edge of [-1, 1] as const) {
        const sample = (stroke: { width: number; color: number; alpha: number }) => {
          let first = true
          for (let sy = -40; sy <= height + 40; sy += 24) {
            const wx = centreline(route, this.screenToWorldY(sy, height)) + edge * halfW
            if (first) {
              walls.moveTo(wx, sy)
              first = false
            } else {
              walls.lineTo(wx, sy)
            }
          }
          walls.stroke(stroke)
        }
        sample({ width: 9, color: WALL_DIM, alpha: 0.35 })
        sample({ width: 2.5, color, alpha: 0.8 })
      }
    }

    // Gates: draw the next few of each side.
    const gates = this.gatesGfx!
    gates.clear()
    const charge = this.chargeGfx!
    charge.clear()
    for (const side of ['left', 'right'] as const) {
      const orb = side === 'left' ? this.left : this.right
      const other = side === 'left' ? this.right : this.left
      const stride = side === 'left' ? 2 : 1
      for (let k = orb.sideNext; k < orb.sideNext + 4; k++) {
        const gate = course.gates[k * stride + (side === 'right' ? 1 : 0)]
        if (!gate) break
        const sy = this.screenY(gate.y)
        if (sy < -60 || sy > height + 60) continue
        const line = centreline(routeOf(course, gate.side), gate.y)
        const gapL = line + gate.gapOffset - gate.gapHalf
        const gapR = line + gate.gapOffset + gate.gapHalf
        const wallL = line - halfW
        const wallR = line + halfW

        let charged = true
        if (gate.kind === 'pair') {
          const otherSide = side === 'left' ? 'right' : 'left'
          const otherLine = centreline(routeOf(course, otherSide), gate.y)
          charged =
            Math.abs(other.y - gate.y) < 40 &&
            Math.abs(other.x - (otherLine + gate.chargeOffset)) < 40
          // Charge ring on the other corridor.
          const rx = otherLine + gate.chargeOffset
          charge.circle(rx, sy, 38).stroke({ width: 2.5, color: CHARGE_COLOR, alpha: charged ? 0.95 : 0.45 })
          charge.circle(rx, sy, 8).fill({ color: CHARGE_COLOR, alpha: 0.35 })
        }
        const gateColor = gate.kind === 'pair' ? (charged ? PAIR_OPEN : PAIR_CLOSED) : GATE_COLOR
        gates.moveTo(wallL, sy)
        gates.lineTo(gapL, sy)
        gates.moveTo(gapR, sy)
        gates.lineTo(wallR, sy)
        gates.stroke({ width: 9, color: gateColor, alpha: 0.22 })
        gates.moveTo(wallL, sy)
        gates.lineTo(gapL, sy)
        gates.moveTo(gapR, sy)
        gates.lineTo(wallR, sy)
        gates.stroke({ width: 3.5, color: gateColor, alpha: 0.95 })
      }
    }

    // Orbs + trails.
    for (const side of ['left', 'right'] as const) {
      const orb = side === 'left' ? this.left : this.right
      const gfx = side === 'left' ? this.orbsGfx!.left : this.orbsGfx!.right
      const sy = this.screenY(orb.y)
      gfx.position.set(orb.x, sy)
      gfx.alpha = orb.flash > 0 ? 0.5 + Math.sin(orb.flash * 40) * 0.4 : 1
      const trail = side === 'left' ? this.trails!.left : this.trails!.right
      trail.redraw()
    }

    // Shake + HUD.
    const shake = computeShake(this.shakeTime, 0.25, 6)
    this.world.position.set(shake.x, shake.y)

    const remaining = Math.max(0, this.duration - this.sessionTime)
    this.hud!.score.text = `SCORE ${this.score}`
    this.hud!.time.text = `${remaining.toFixed(1)}s`
    this.hud!.time.style.fill = remaining <= 5 ? PAIR_CLOSED : 0xeef7ec
    this.hud!.streak.text = `STREAK x${this.streak}   GATES ${this.gatesPassed}${this.banner.life > 0 ? `   ${this.banner.text}` : ''}`
    this.hud!.streak.style.fill = this.banner.life > 0 ? this.banner.color : 0xa7bcae
  }

  getScore(): ScoreResult {
    const s = this.score
    return {
      score: s,
      grade: s >= 6000 ? 'S' : s >= 4000 ? 'A' : s >= 2600 ? 'B' : s >= 1500 ? 'C' : s >= 700 ? 'D' : 'F',
      details: {
        gates: this.gatesPassed,
        perfects: this.perfects,
        syncs: this.syncs,
        maxStreak: this.maxStreak,
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    this.course = makeCourse(Math.floor(Math.random() * 1e9), this.app?.screen.width ?? 1280)
    this.left = this.freshOrb()
    this.right = this.freshOrb()
    for (const [orb, side] of [
      [this.left, 'left'],
      [this.right, 'right'],
    ] as const) {
      orb.x = centreline(routeOf(this.course, side), orb.y)
      orb.prevY = orb.y
      orb.sideNext = side === 'left' ? 0 : 1
    }
    this.sessionTime = 0
    this.score = 0
    this.streak = 0
    this.maxStreak = 0
    this.gatesPassed = 0
    this.perfects = 0
    this.syncs = 0
    this.shakeTime = 0
    this.banner = { text: '', color: 0xffffff, life: 0 }
    this.trails?.left.clear()
    this.trails?.right.clear()
  }
}
