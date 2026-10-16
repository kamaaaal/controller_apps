/**
 * Reusable PixiJS display helpers for the arcade games (iteration 16).
 *
 * Lazy-load discipline: this module never imports pixi.js at runtime — only
 * `import type`. The challenge loads the library through its dynamic import
 * (see `src/engine/pixiHost.ts`) and passes the module handle in, so the pixi
 * chunk stays async and the Canvas 2D games never pay for it.
 *
 * Helpers are intentionally small and mechanical: fading movement trails,
 * pooled additive particle bursts, expanding pulse rings and a deterministic
 * shake offset. Games own their simulation; these only own presentation.
 */

import type { Container, Graphics } from 'pixi.js'
import { isReducedMotion } from './palette'

export interface PixiModules {
  Graphics: typeof Graphics
  Container: typeof Container
}

// ---------------------------------------------------------------------------
// Trail — fading polyline ribbon behind a moving object.
// ---------------------------------------------------------------------------

interface TrailPoint {
  x: number
  y: number
  age: number
}

export class Trail {
  private gfx: Graphics
  private points: TrailPoint[] = []
  private maxPoints: number
  private lifetime: number
  private baseWidth: number
  private color: number

  constructor(mods: PixiModules, parent: Container, options: { color: number; maxPoints?: number; lifetime?: number; width?: number }) {
    this.color = options.color
    this.maxPoints = options.maxPoints ?? (isReducedMotion() ? 8 : 36)
    this.lifetime = options.lifetime ?? 0.55
    this.baseWidth = options.width ?? 6
    this.gfx = new mods.Graphics()
    parent.addChild(this.gfx)
  }

  push(x: number, y: number): void {
    this.points.push({ x, y, age: 0 })
    while (this.points.length > this.maxPoints) this.points.shift()
  }

  update(dt: number): void {
    for (const p of this.points) p.age += dt
    this.points = this.points.filter((p) => p.age < this.lifetime)
  }

  redraw(): void {
    const g = this.gfx
    g.clear()
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]
      const b = this.points[i]
      const t = i / this.points.length
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke({ width: this.baseWidth * t, color: this.color, alpha: 0.7 * t, cap: 'round' })
    }
  }

  clear(): void {
    this.points = []
    this.gfx.clear()
  }

  destroy(): void {
    this.gfx.destroy()
  }
}

// ---------------------------------------------------------------------------
// BurstPool — pooled additive particles (never per-particle filters).
// ---------------------------------------------------------------------------

interface BurstParticle {
  gfx: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
}

export class BurstPool {
  private mods: PixiModules
  private parent: Container
  private particles: BurstParticle[] = []
  private max: number

  constructor(mods: PixiModules, parent: Container, options: { max?: number } = {}) {
    this.mods = mods
    this.parent = parent
    this.max = options.max ?? 220
  }

  spawn(
    x: number,
    y: number,
    options: { color: number; count?: number; speed?: number; life?: number; size?: number }
  ): void {
    const { color, count = 14, speed = 200, life = 0.55, size = 3.5 } = options
    const actual = isReducedMotion() ? Math.ceil(count / 2) : count
    for (let i = 0; i < actual; i++) {
      if (this.particles.length >= this.max) return
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.35 + Math.random() * 0.65)
      const particleLife = life * (0.6 + Math.random() * 0.4)
      const gfx = new this.mods.Graphics().circle(0, 0, size * (0.6 + Math.random() * 0.7)).fill({ color })
      gfx.position.set(x, y)
      this.parent.addChild(gfx)
      this.particles.push({
        gfx,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: particleLife,
        maxLife: particleLife,
      })
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-3 * dt)
    for (const p of [...this.particles]) {
      p.life -= dt
      p.gfx.position.set(p.gfx.x + p.vx * dt, p.gfx.y + p.vy * dt)
      p.vx *= drag
      p.vy *= drag
      p.gfx.alpha = Math.max(0, p.life / p.maxLife)
      if (p.life <= 0) {
        this.particles.splice(this.particles.indexOf(p), 1)
        p.gfx.destroy()
      }
    }
  }

  destroy(): void {
    for (const p of this.particles) p.gfx.destroy()
    this.particles = []
  }
}

// ---------------------------------------------------------------------------
// PulseRing — one expanding, fading ring (hit flashes, gate passes).
// ---------------------------------------------------------------------------

export class PulseRing {
  private mods: PixiModules
  private parent: Container
  private rings: Array<{ gfx: Graphics; t: number; duration: number; from: number; to: number; color: number }> = []

  constructor(mods: PixiModules, parent: Container) {
    this.mods = mods
    this.parent = parent
  }

  fire(x: number, y: number, options: { color: number; from?: number; to?: number; duration?: number }): void {
    if (this.rings.length > 14) return
    const gfx = new this.mods.Graphics().circle(0, 0, 1).stroke({ width: 2, color: options.color })
    gfx.position.set(x, y)
    this.parent.addChild(gfx)
    this.rings.push({
      gfx,
      t: 0,
      duration: options.duration ?? 0.4,
      from: options.from ?? 8,
      to: options.to ?? 56,
      color: options.color,
    })
  }

  update(dt: number): void {
    for (const r of [...this.rings]) {
      r.t += dt
      const k = Math.min(1, r.t / r.duration)
      const radius = r.from + (r.to - r.from) * k
      r.gfx.clear().circle(0, 0, radius).stroke({ width: 2.5 * (1 - k), color: r.color, alpha: 1 - k })
      if (k >= 1) {
        this.rings.splice(this.rings.indexOf(r), 1)
        r.gfx.destroy()
      }
    }
  }

  destroy(): void {
    for (const r of this.rings) r.gfx.destroy()
    this.rings = []
  }
}

// ---------------------------------------------------------------------------
// Shake — deterministic decaying offset for a scene container.
// ---------------------------------------------------------------------------

export function computeShake(remaining: number, duration: number, intensity: number): { x: number; y: number } {
  if (isReducedMotion() || remaining <= 0 || duration <= 0) return { x: 0, y: 0 }
  const falloff = remaining / duration
  return { x: (Math.random() * 2 - 1) * intensity * falloff, y: (Math.random() * 2 - 1) * intensity * falloff }
}
