/**
 * Game-feel FX layer (iteration 15).
 *
 * A small, dependency-free effects system composed into a challenge (never
 * global): tweens with easings, pooled particle bursts, screen shake and
 * floating text — the primitives every upcoming Canvas 2D game will want.
 *
 * Design notes:
 * - `update(dt)` advances everything; `draw(renderer)` paints particles and
 *   floaters on top of the scene (call it last).
 * - Particles use additive blending (`lighter`) and NEVER per-particle
 *   shadowBlur — shadowBlur is the expensive Canvas 2D path; a batched
 *   additive pass reads as neon glow for a fraction of the cost.
 * - Screen shake is opt-in per frame via beginShake/endShake around the scene
 *   draw (ctx save/translate/restore); the HUD stays outside the shake.
 * - `prefers-reduced-motion` (via the palette module) disables shake and halves
 *   particle counts; tweens still resolve so state-dependent visuals work.
 * - All caps are hard: bursts beyond the particle cap are dropped, so a
 *   mash-heavy game can never degrade the frame rate.
 */

import { linear, type Easing } from './easings'
import type { Renderer } from './renderer'

const MAX_PARTICLES = 300

export interface TweenOptions {
  from: number
  to: number
  duration: number
  ease?: Easing
  delay?: number
  onUpdate: (value: number) => void
  onComplete?: () => void
}

export interface BurstOptions {
  x: number
  y: number
  color: string
  count?: number
  speed?: number
  life?: number
  size?: number
  /** Full circle by default; pass a span (radians) for directional sprays. */
  spread?: number
  angle?: number
}

export interface FloatTextOptions {
  x: number
  y: number
  text: string
  color: string
  life?: number
  font?: string
  rise?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface Floater {
  x: number
  y: number
  text: string
  color: string
  font: string
  life: number
  maxLife: number
  rise: number
}

interface Tween {
  elapsed: number
  options: TweenOptions
  done: boolean
}

export class Fx {
  private tweens: Tween[] = []
  private particles: Particle[] = []
  private floaters: Floater[] = []
  private shakeIntensity = 0
  private shakeTime = 0
  private shakeDuration = 0
  private shakeOffset = { x: 0, y: 0 }
  private reducedMotion: () => boolean

  constructor(reducedMotion: () => boolean = () => false) {
    this.reducedMotion = reducedMotion
  }

  // ---- Tweens ------------------------------------------------------------

  tween(options: TweenOptions): void {
    this.tweens.push({ elapsed: 0, options, done: false })
  }

  // ---- Effects -----------------------------------------------------------

  burst(options: BurstOptions): void {
    const {
      x,
      y,
      color,
      count = 18,
      speed = 220,
      life = 0.6,
      size = 4,
      spread = Math.PI * 2,
      angle = 0,
    } = options

    const actualCount = this.reducedMotion() ? Math.ceil(count / 2) : count
    for (let i = 0; i < actualCount; i++) {
      if (this.particles.length >= MAX_PARTICLES) break
      const dir = angle - spread / 2 + Math.random() * spread
      const velocity = speed * (0.4 + Math.random() * 0.6)
      const particleLife = life * (0.6 + Math.random() * 0.4)
      this.particles.push({
        x,
        y,
        vx: Math.cos(dir) * velocity,
        vy: Math.sin(dir) * velocity,
        life: particleLife,
        maxLife: particleLife,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      })
    }
  }

  shake(intensity: number, duration: number): void {
    if (this.reducedMotion()) return
    // Stronger, longer shakes win over weaker pending ones.
    if (intensity >= this.shakeIntensity || this.shakeTime <= 0) {
      this.shakeIntensity = intensity
      this.shakeDuration = duration
      this.shakeTime = duration
    }
  }

  /** Wrap the scene draw: translate by the current (decaying) shake offset. */
  beginShake(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    if (!this.reducedMotion() && this.shakeTime > 0) {
      const falloff = this.shakeTime / this.shakeDuration
      ctx.translate(this.shakeOffset.x * falloff, this.shakeOffset.y * falloff)
    }
  }

  endShake(ctx: CanvasRenderingContext2D): void {
    ctx.restore()
  }

  floatText(options: FloatTextOptions): void {
    const { x, y, text, color, life = 0.9, font = 'bold 20px "JetBrains Mono", monospace', rise = 46 } =
      options
    this.floaters.push({ x, y, text, color, font, life, maxLife: life, rise })
  }

  // ---- Frame plumbing ----------------------------------------------------

  update(dt: number): void {
    for (const tween of this.tweens) {
      if (tween.done) continue
      tween.elapsed += dt
      const { from, to, duration, ease = linear, delay = 0, onUpdate, onComplete } = tween.options
      const activeTime = tween.elapsed - delay
      if (activeTime < 0) continue
      const t = duration > 0 ? Math.min(1, activeTime / duration) : 1
      onUpdate(from + (to - from) * ease(t))
      if (t >= 1) {
        tween.done = true
        onComplete?.()
      }
    }
    this.tweens = this.tweens.filter((tween) => !tween.done)

    const drag = Math.exp(-3.2 * dt)
    for (const p of this.particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= drag
      p.vy *= drag
    }
    this.particles = this.particles.filter((p) => p.life > 0)

    for (const f of this.floaters) {
      f.life -= dt
      f.y -= (f.rise / f.maxLife) * dt
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt)
      this.shakeOffset.x = (Math.random() * 2 - 1) * this.shakeIntensity
      this.shakeOffset.y = (Math.random() * 2 - 1) * this.shakeIntensity
      if (this.shakeTime === 0) this.shakeIntensity = 0
    }
  }

  /** Paint particles + floating text; call after the scene draw. */
  draw(renderer: Renderer): void {
    const ctx = renderer.canvasContext

    if (this.particles.length > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    for (const f of this.floaters) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, (f.life / f.maxLife) * 1.6)
      renderer.drawCenteredText(f.text, f.x, f.y, { font: f.font, color: f.color, glow: 10 })
      ctx.restore()
    }
  }

  clear(): void {
    this.tweens = []
    this.particles = []
    this.floaters = []
    this.shakeIntensity = 0
    this.shakeTime = 0
    this.shakeDuration = 0
    this.shakeOffset = { x: 0, y: 0 }
  }

  /** Introspection for tests/debug. */
  counts(): { tweens: number; particles: number; floaters: number } {
    return { tweens: this.tweens.length, particles: this.particles.length, floaters: this.floaters.length }
  }
}
