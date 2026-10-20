/**
 * Pixi Demo — dev-only showcase for the lazily-loaded PixiJS renderer
 * (iteration 15).
 *
 * Template for the next *complex* game: it opts into `renderMode: 'pixi'`, so
 * the play route hands it an initialised Pixi `Application` (pixi.js is loaded
 * via a dynamic import — its own async chunk, never fetched by the Canvas 2D
 * games). Our `GameLoop` still owns time: `update()` advances state and
 * `drawPixi()` syncs display objects right before `app.render()`.
 *
 * Scene: a neon orb eases toward the left stick; A bursts particles; holding
 * B shakes the orb; score/bursts update live.
 *
 * Registered only when `import.meta.env.DEV` — never ships to production.
 */

import type { Application, Graphics, Text } from 'pixi.js'
import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { TIMING } from '../../config/timing'

const NEON = 0x9bf00b
const PS_BLUE = 0x1e8fff
const ORB_RADIUS = 22

interface DemoParticle {
  gfx: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
}

export class PixiDemoChallenge implements Challenge {
  id = 'pixi-demo'
  name = 'Pixi Demo (dev)'
  description = 'Dev template: lazy-loaded PixiJS scene — stick, A burst, B shake'
  duration = TIMING.challengeDurations['pixi-demo']
  renderMode = 'pixi' as const

  private app: Application | null = null
  private pixi: { Graphics: typeof Graphics; Text: typeof Text } | null = null
  private orb: Graphics | null = null
  private particles: DemoParticle[] = []
  private pos = { x: 0, y: 0 }
  private shakeTime = 0

  private sessionTime = 0
  private aPrev = false
  private burstCount = 0
  private score = 0
  private grade: ScoreResult['grade'] = 'F'

  setupPixi(app: Application, _gamepad: Gamepad | null): void {
    this.app = app
    this.pos = { x: app.screen.width / 2, y: app.screen.height / 2 }
    // Constructors come from the same dynamic chunk the host loaded pixi from;
    // building the scene async keeps setupPixi synchronous for the interface.
    void this.buildScene()
  }

  private async buildScene(): Promise<void> {
    const app = this.app
    if (!app) return
    const pixi = await import('pixi.js')
    if (this.app !== app) return // challenge was reset/switched meanwhile
    this.pixi = pixi

    const { width, height } = app.screen

    // Deep playfield + faint grid, matching the Canvas 2D backdrop language.
    const bg = new pixi.Graphics()
    bg.rect(0, 0, width, height).fill({ color: 0x07090e, alpha: 0.82 })
    for (let x = 46; x < width; x += 46) {
      bg.moveTo(x, 0).lineTo(x, height)
    }
    for (let y = 46; y < height; y += 46) {
      bg.moveTo(0, y).lineTo(width, y)
    }
    bg.stroke({ width: 1, color: 0x243041, alpha: 0.4 })
    app.stage.addChild(bg)

    const title = new pixi.Text({
      text: 'PIXI SCENE — async chunk loaded',
      style: { fontFamily: '"JetBrains Mono", monospace', fontSize: 20, fill: NEON },
    })
    title.anchor.set(0.5, 0)
    title.position.set(width / 2, 24)
    app.stage.addChild(title)

    const hint = new pixi.Text({
      text: 'L-stick: move   A: burst   B: shake',
      style: { fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fill: 0xa7bcae },
    })
    hint.anchor.set(0.5, 0)
    hint.position.set(width / 2, 52)
    app.stage.addChild(hint)

    const orb = new pixi.Graphics()
    orb.circle(0, 0, ORB_RADIUS + 10).fill({ color: NEON, alpha: 0.12 })
    orb.circle(0, 0, ORB_RADIUS).fill({ color: NEON, alpha: 0.35 }).stroke({ width: 2, color: NEON })
    orb.circle(0, 0, 5).fill({ color: 0xffffff })
    orb.position.set(this.pos.x, this.pos.y)
    app.stage.addChild(orb)
    this.orb = orb
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.sessionTime += dt

    const width = this.app?.screen.width ?? 0
    const height = this.app?.screen.height ?? 0

    // Eased follow: the orb trails the stick target instead of teleporting.
    const targetX = width / 2 + input.axes.leftStick.x * (width / 2 - ORB_RADIUS - 20)
    const targetY = height / 2 + input.axes.leftStick.y * (height / 2 - ORB_RADIUS - 80)
    const follow = Math.min(1, dt * 9)
    this.pos.x += (targetX - this.pos.x) * follow
    this.pos.y += (targetY - this.pos.y) * follow

    if (input.buttons.a && !this.aPrev) {
      this.spawnBurst()
      this.burstCount++
      this.score += 10
      this.grade = this.score >= 300 ? 'A' : this.score >= 150 ? 'B' : this.score >= 50 ? 'C' : 'F'
    }
    this.aPrev = input.buttons.a

    if (input.buttons.b) this.shakeTime = 0.25
    else if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt)

    for (const p of [...this.particles]) {
      p.life -= dt
      p.gfx.position.set(p.gfx.x + p.vx * dt, p.gfx.y + p.vy * dt)
      p.vx *= Math.exp(-3 * dt)
      p.vy *= Math.exp(-3 * dt)
      p.gfx.alpha = Math.max(0, p.life / p.maxLife)
      if (p.life <= 0) {
        p.gfx.destroy()
        this.particles.splice(this.particles.indexOf(p), 1)
      }
    }

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: { bursts: this.burstCount, particles: this.particles.length },
    }
  }

  /** A-press: a ring of particles, alternating brand colours. */
  private spawnBurst(): void {
    const pixi = this.pixi
    const app = this.app
    if (!pixi || !app) return
    const color = this.burstCount % 2 === 0 ? NEON : PS_BLUE
    for (let i = 0; i < 16; i++) {
      const gfx = new pixi.Graphics().circle(0, 0, 3).fill({ color })
      gfx.position.set(this.pos.x, this.pos.y)
      app.stage.addChild(gfx)
      const angle = (i / 16) * Math.PI * 2
      const speed = 140 + Math.random() * 120
      const life = 0.5 + Math.random() * 0.3
      this.particles.push({ gfx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life })
    }
  }

  drawPixi(): void {
    if (!this.orb) return
    if (this.shakeTime > 0) {
      const magnitude = 6 * (this.shakeTime / 0.25)
      this.orb.position.set(
        this.pos.x + (Math.random() * 2 - 1) * magnitude,
        this.pos.y + (Math.random() * 2 - 1) * magnitude
      )
    } else {
      this.orb.position.set(this.pos.x, this.pos.y)
    }
  }

  getScore(): ScoreResult {
    return {
      score: this.score,
      grade: this.grade,
      details: {
        bursts: this.burstCount,
        particles: this.particles.length,
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    for (const p of this.particles) p.gfx.destroy()
    this.particles = []
    this.sessionTime = 0
    this.aPrev = false
    this.burstCount = 0
    this.score = 0
    this.grade = 'F'
    this.shakeTime = 0
    if (this.app) this.pos = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }
  }
}
