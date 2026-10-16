/**
 * Gravity Jockey (iteration 16) — momentum, trajectory prediction, risk/reward.
 *
 * Each stick is the thrust vector of one ship in a three-well gravity arena
 * with an orbiting mine. Ships carry momentum: the skill is steering with
 * curves, slingshotting wells instead of fighting them. Collect your four
 * fragments, touch your switch, then dock BOTH ships in the centre exit.
 * Close, fast flybys pay a SLINGSHOT bonus; touches cost points.
 *
 * Ends early (with a time bonus) once both ships dock — `metadata.finished`
 * tells the play route to finish the run.
 */

import type { Application, Container, Graphics, Text, TextStyleOptions } from 'pixi.js'
import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { playSfx } from '../../engine/audio'
import { BurstPool, PulseRing, Trail, computeShake, type PixiModules } from '../../engine/pixiFx'
import {
  SHIP_RADIUS,
  bounceOff,
  collidesWith,
  makeArena,
  minePosition,
  nearMiss,
  stepShip,
  type ArenaLayout,
  type Ship,
} from './physics'

const GOLD = 0xffd23f // left ship + fragments
const CYAN = 0x4aa3ff // right ship + fragments
const WELL = 0x8a6cff
const MINE_COLOR = 0xff3b45
const EXIT_COLOR = 0x39d353
const FRAG_COLOR_LEFT = 0xffc21e
const FRAG_COLOR_RIGHT = 0x2a95f0
const INK = 0xeef7ec
const DIM = 0xa7bcae

interface ShipState extends Ship {
  flash: number
  hitCooldown: number
}

interface FragState {
  x: number
  y: number
  collected: boolean
}

export class GravityJockeyChallenge implements Challenge {
  id = 'gravity-jockey'
  name = 'Gravity Jockey'
  description = 'Steer with momentum around gravity wells — slingshot, collect, dock'
  duration = 60
  renderMode = 'pixi' as const

  private app: Application | null = null
  private pixi: PixiModules | null = null
  private ready = false

  private arena: ArenaLayout | null = null
  private left: ShipState = { x: 0, y: 0, vx: 0, vy: 0, flash: 0, hitCooldown: 0 }
  private right: ShipState = { x: 0, y: 0, vx: 0, vy: 0, flash: 0, hitCooldown: 0 }
  private leftFrags: FragState[] = []
  private rightFrags: FragState[] = []
  private leftSwitchArmed = false
  private rightSwitchArmed = false
  private exitOpen = false
  private finished = false

  private sessionTime = 0
  private score = 0
  private slingshots = 0
  private collisions = 0
  private finishBonus = 0
  private shakeTime = 0
  private banner = { text: '', color: INK, life: 0 }
  private nearMissCooldown = new Map<string, number>()

  // Display
  private world: Container | null = null
  private staticGfx: Graphics | null = null
  private mineGfx: Graphics | null = null
  private exitGfx: Graphics | null = null
  private fragGfx: Graphics[] = []
  private switchGfx: { left: Graphics; right: Graphics } | null = null
  private shipGfx: { left: Graphics; right: Graphics } | null = null
  private trails: { left: Trail; right: Trail } | null = null
  private bursts: BurstPool | null = null
  private pulses: PulseRing | null = null
  private hud: Record<'score' | 'time' | 'obj' | 'banner', Text> | null = null

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

    this.staticGfx = new pixi.Graphics()
    this.mineGfx = new pixi.Graphics()
    this.exitGfx = new pixi.Graphics()
    world.addChild(this.staticGfx, this.mineGfx, this.exitGfx)

    const mkShip = (color: number) => {
      const g = new pixi.Graphics()
      g.circle(0, 0, SHIP_RADIUS + 7).fill({ color, alpha: 0.14 })
      g.circle(0, 0, SHIP_RADIUS).fill({ color })
      g.circle(0, 0, 3).fill({ color: 0xffffff })
      world.addChild(g)
      return g
    }
    this.shipGfx = { left: mkShip(GOLD), right: mkShip(CYAN) }
    this.trails = {
      left: new Trail(pixi, world, { color: GOLD, width: 5 }),
      right: new Trail(pixi, world, { color: CYAN, width: 5 }),
    }
    this.bursts = new BurstPool(pixi, world)
    this.pulses = new PulseRing(pixi, world)

    const mkSwitch = (color: number) => {
      const g = new pixi.Graphics().poly([0, -20, 17, -10, 17, 10, 0, 20, -17, 10, -17, -10])
      g.stroke({ width: 2.5, color, alpha: 0.9 })
      world.addChild(g)
      return g
    }
    this.switchGfx = { left: mkSwitch(GOLD), right: mkSwitch(CYAN) }

    const mkText = (style: TextStyleOptions, x: number, y: number) => {
      const t = new pixi.Text({ text: '', style: { fontFamily: '"JetBrains Mono", monospace', ...style } })
      t.position.set(x, y)
      app.stage.addChild(t)
      return t
    }
    this.hud = {
      score: mkText({ fontSize: 20, fill: INK }, 16, 12),
      time: mkText({ fontSize: 20, fill: INK }, app.screen.width / 2, 12),
      obj: mkText({ fontSize: 14, fill: DIM }, 16, 40),
      banner: mkText({ fontSize: 18, fill: INK }, app.screen.width / 2, app.screen.height - 44),
    }
    this.hud.time.anchor.set(0.5, 0)
    this.hud.banner.anchor.set(0.5, 0)

    this.ready = true
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    if (!this.arena || !this.app || this.finished) {
      return { progress: Math.min(1, this.sessionTime / this.duration), score: this.score, metadata: {} }
    }
    this.sessionTime += dt
    const arena = this.arena
    const mine = minePosition(arena.mine, this.sessionTime)
    const bodies = [...arena.planets, mine]

    this.stepShipState(this.left, input.axes.leftStick, arena.planets, bodies, dt, 'left')
    this.stepShipState(this.right, input.axes.rightStick, arena.planets, bodies, dt, 'right')

    this.checkObjectives()

    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: { finished: this.finished },
    }
  }

  private stepShipState(
    ship: ShipState,
    thrust: { x: number; y: number },
    planets: readonly { x: number; y: number; gm: number }[],
    bodies: ReadonlyArray<{ x: number; y: number; r: number }>,
    dt: number,
    side: 'left' | 'right'
  ): void {
    if (ship.flash > 0) ship.flash = Math.max(0, ship.flash - dt)
    if (ship.hitCooldown > 0) ship.hitCooldown = Math.max(0, ship.hitCooldown - dt)

    stepShip(ship, thrust, planets, dt)

    // Soft arena bounds — bounce silently, no penalty (containment, not hazard).
    const w = this.app?.screen.width ?? 1280
    const h = this.app?.screen.height ?? 720
    if (ship.x < SHIP_RADIUS) {
      ship.x = SHIP_RADIUS
      ship.vx = Math.abs(ship.vx) * 0.5
    } else if (ship.x > w - SHIP_RADIUS) {
      ship.x = w - SHIP_RADIUS
      ship.vx = -Math.abs(ship.vx) * 0.5
    }
    if (ship.y < 64 + SHIP_RADIUS) {
      ship.y = 64 + SHIP_RADIUS
      ship.vy = Math.abs(ship.vy) * 0.5
    } else if (ship.y > h - SHIP_RADIUS) {
      ship.y = h - SHIP_RADIUS
      ship.vy = -Math.abs(ship.vy) * 0.5
    }

    // Planet/mine contact.
    for (const body of bodies) {
      if (!collidesWith(ship, body)) continue
      bounceOff(ship, body)
      if (ship.hitCooldown === 0) {
        ship.hitCooldown = 0.5
        ship.flash = 0.4
        this.collisions++
        this.score = Math.max(0, this.score - 40)
        this.shakeTime = 0.3
        this.setBanner('IMPACT −40', MINE_COLOR)
        playSfx('crash')
        this.bursts?.spawn(ship.x, ship.y, { color: MINE_COLOR, count: 12, speed: 180 })
      }
    }

    // Slingshot halo (per ship per body cooldown).
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]
      if (collidesWith(ship, body) || !nearMiss(ship, body)) continue
      const speed = Math.hypot(ship.vx, ship.vy)
      if (speed < 180) continue
      const key = `${side}:${i}`
      if ((this.nearMissCooldown.get(key) ?? 0) > this.sessionTime) continue
      this.nearMissCooldown.set(key, this.sessionTime + 1.5)
      this.slingshots++
      this.score += 30
      this.setBanner('SLINGSHOT +30', GOLD)
      playSfx('hit')
    }
  }

  private checkObjectives(): void {
    const arena = this.arena!

    const collect = (frags: FragState[], ship: ShipState, color: number): number => {
      let got = 0
      for (const f of frags) {
        if (f.collected) continue
        if (Math.hypot(ship.x - f.x, ship.y - f.y) < 20) {
          f.collected = true
          got++
          this.score += 100
          this.setBanner('+100 FRAGMENT', color)
          playSfx('hit')
          this.pulses?.fire(f.x, f.y, { color, to: 44 })
          this.bursts?.spawn(f.x, f.y, { color, count: 12 })
        }
      }
      return got
    }
    collect(this.leftFrags, this.left, FRAG_COLOR_LEFT)
    collect(this.rightFrags, this.right, FRAG_COLOR_RIGHT)

    if (!this.leftSwitchArmed && Math.hypot(this.left.x - arena.leftSwitch.x, this.left.y - arena.leftSwitch.y) < 26) {
      this.leftSwitchArmed = true
      this.score += 250
      this.setBanner('SWITCH L ARMED +250', GOLD)
      playSfx('combo')
      this.pulses?.fire(arena.leftSwitch.x, arena.leftSwitch.y, { color: GOLD, to: 70 })
    }
    if (!this.rightSwitchArmed && Math.hypot(this.right.x - arena.rightSwitch.x, this.right.y - arena.rightSwitch.y) < 26) {
      this.rightSwitchArmed = true
      this.score += 250
      this.setBanner('SWITCH R ARMED +250', CYAN)
      playSfx('combo')
      this.pulses?.fire(arena.rightSwitch.x, arena.rightSwitch.y, { color: CYAN, to: 70 })
    }

    const allFragments = this.leftFrags.every((f) => f.collected) && this.rightFrags.every((f) => f.collected)
    const open = allFragments && this.leftSwitchArmed && this.rightSwitchArmed
    if (open && !this.exitOpen) {
      this.exitOpen = true
      this.setBanner('EXIT OPEN — DOCK BOTH SHIPS', EXIT_COLOR)
      playSfx('sync')
    }

    if (this.exitOpen) {
      const inExit = (ship: ShipState) => Math.hypot(ship.x - arena.exit.x, ship.y - arena.exit.y) < arena.exit.r
      if (inExit(this.left) && inExit(this.right)) {
        this.finished = true
        this.finishBonus = Math.round(Math.max(0, this.duration - this.sessionTime) * 25)
        this.score += this.finishBonus
        this.setBanner(`DOCKED! TIME BONUS +${this.finishBonus}`, EXIT_COLOR)
        playSfx('round')
        this.bursts?.spawn(arena.exit.x, arena.exit.y, { color: EXIT_COLOR, count: 40, speed: 260, life: 0.9 })
      }
    }
  }

  private setBanner(text: string, color: number): void {
    this.banner = { text, color, life: 1.1 }
  }

  drawPixi(): void {
    if (!this.ready || !this.app || !this.arena || !this.pixi || !this.world) return
    const arena = this.arena
    const mine = minePosition(arena.mine, this.sessionTime)

    // Static art (rebuilt only on reset — cheap enough to redraw; kept simple).
    const st = this.staticGfx!
    st.clear()
    for (const p of arena.planets) {
      st.circle(p.x, p.y, p.r + 26).stroke({ width: 1.5, color: WELL, alpha: 0.16 })
      st.circle(p.x, p.y, p.r + 54).stroke({ width: 1, color: WELL, alpha: 0.08 })
      st.circle(p.x, p.y, p.r).fill({ color: WELL, alpha: 0.28 })
      st.circle(p.x, p.y, p.r).stroke({ width: 2.5, color: WELL, alpha: 0.85 })
    }
    st.moveTo(arena.leftSwitch.x - 20, arena.leftSwitch.y)
    st.lineTo(arena.leftSwitch.x + 20, arena.leftSwitch.y)
    st.stroke({ width: 1, color: GOLD, alpha: 0.05 })

    const mineG = this.mineGfx!
    mineG.clear()
    mineG.circle(mine.x, mine.y, mine.r + 6).fill({ color: MINE_COLOR, alpha: 0.15 })
    mineG.circle(mine.x, mine.y, mine.r).fill({ color: MINE_COLOR, alpha: 0.9 })

    const exit = this.exitGfx!
    exit.clear()
    const pulse = 0.6 + Math.sin(this.sessionTime * 4) * 0.3
    exit.circle(arena.exit.x, arena.exit.y, arena.exit.r).stroke({
      width: this.exitOpen ? 4 : 2,
      color: EXIT_COLOR,
      alpha: this.exitOpen ? pulse : 0.25,
    })
    if (this.exitOpen) exit.circle(arena.exit.x, arena.exit.y, arena.exit.r - 8).fill({ color: EXIT_COLOR, alpha: 0.12 })

    const sw = this.switchGfx!
    sw.left.position.set(arena.leftSwitch.x, arena.leftSwitch.y)
    sw.right.position.set(arena.rightSwitch.x, arena.rightSwitch.y)
    sw.left.clear()
    sw.left.poly([0, -20, 17, -10, 17, 10, 0, 20, -17, 10, -17, -10]).stroke({
      width: 2.5,
      color: GOLD,
      alpha: this.leftSwitchArmed ? 0.3 : 0.9,
    })
    sw.right.clear()
    sw.right.poly([0, -20, 17, -10, 17, 10, 0, 20, -17, 10, -17, -10]).stroke({
      width: 2.5,
      color: CYAN,
      alpha: this.rightSwitchArmed ? 0.3 : 0.9,
    })

    // Fragments: rotating diamonds (rebuilt only when the sets change).
    const expectedFrags = this.leftFrags.filter((f) => !f.collected).length + this.rightFrags.filter((f) => !f.collected).length
    if (this.fragGfx.length !== expectedFrags) {
      this.fragGfx.forEach((g) => g.destroy())
      this.fragGfx = []
      const pixi = this.pixi
      const drawFrag = (f: FragState, color: number) => {
        if (f.collected) return
        const g = new pixi.Graphics().poly([0, -8, 6, 0, 0, 8, -6, 0]).fill({ color })
        g.position.set(f.x, f.y)
        this.world!.addChild(g)
        this.fragGfx.push(g)
      }
      this.leftFrags.forEach((f) => drawFrag(f, FRAG_COLOR_LEFT))
      this.rightFrags.forEach((f) => drawFrag(f, FRAG_COLOR_RIGHT))
    }
    for (const g of this.fragGfx) g.rotation = this.sessionTime * 1.6

    // Ships + trails.
    for (const side of ['left', 'right'] as const) {
      const ship = side === 'left' ? this.left : this.right
      const gfx = side === 'left' ? this.shipGfx!.left : this.shipGfx!.right
      gfx.position.set(ship.x, ship.y)
      gfx.alpha = ship.flash > 0 ? 0.4 + Math.sin(ship.flash * 40) * 0.4 : 1
      const trail = side === 'left' ? this.trails!.left : this.trails!.right
      trail.push(ship.x, ship.y)
      trail.update(1 / 60)
      trail.redraw()
    }
    this.bursts!.update(1 / 60)
    this.pulses!.update(1 / 60)

    const shake = computeShake(this.shakeTime, 0.3, 7)
    this.world.position.set(shake.x, shake.y)

    // HUD.
    const remaining = Math.max(0, this.duration - this.sessionTime)
    const leftLeft = this.leftFrags.filter((f) => !f.collected).length
    const rightLeft = this.rightFrags.filter((f) => !f.collected).length
    this.hud!.score.text = `SCORE ${this.score}`
    this.hud!.time.text = `${remaining.toFixed(1)}s`
    this.hud!.time.style.fill = remaining <= 5 ? MINE_COLOR : INK
    this.hud!.obj.text = `GOLD: ${leftLeft} frag${this.leftSwitchArmed ? ' · switch ✓' : ''}   BLUE: ${rightLeft} frag${this.rightSwitchArmed ? ' · switch ✓' : ''}`
    this.hud!.banner.text = this.banner.life > 0 ? this.banner.text : ''
    this.hud!.banner.style.fill = this.banner.color
  }

  getScore(): ScoreResult {
    const s = this.score
    return {
      score: s,
      grade: s >= 2400 ? 'S' : s >= 1900 ? 'A' : s >= 1400 ? 'B' : s >= 900 ? 'C' : s >= 450 ? 'D' : 'F',
      details: {
        fragments: this.leftFrags.filter((f) => f.collected).length + this.rightFrags.filter((f) => f.collected).length,
        switches: (this.leftSwitchArmed ? 1 : 0) + (this.rightSwitchArmed ? 1 : 0),
        slingshots: this.slingshots,
        collisions: this.collisions,
        finishBonus: this.finishBonus,
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    const w = this.app?.screen.width ?? 1280
    const h = this.app?.screen.height ?? 720
    this.arena = makeArena(Math.floor(Math.random() * 1e9), w, h)
    const spawn = { x: w * 0.5, y: h * 0.86 }
    this.left = { ...spawn, x: w * 0.44, vx: 0, vy: 0, flash: 0, hitCooldown: 0 }
    this.right = { ...spawn, x: w * 0.56, vx: 0, vy: 0, flash: 0, hitCooldown: 0 }
    this.leftFrags = this.arena.leftFragments.map((f) => ({ ...f, collected: false }))
    this.rightFrags = this.arena.rightFragments.map((f) => ({ ...f, collected: false }))
    this.leftSwitchArmed = false
    this.rightSwitchArmed = false
    this.exitOpen = false
    this.finished = false
    this.sessionTime = 0
    this.score = 0
    this.slingshots = 0
    this.collisions = 0
    this.finishBonus = 0
    this.shakeTime = 0
    this.banner = { text: '', color: INK, life: 0 }
    this.nearMissCooldown.clear()
    this.trails?.left.clear()
    this.trails?.right.clear()
  }
}
