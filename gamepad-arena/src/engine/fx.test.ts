import { describe, it, expect } from 'vitest'
import { Fx } from './fx'
import { quadOut } from './easings'
import type { Renderer } from './renderer'

function fakeCtx(translations: Array<{ x: number; y: number }>): CanvasRenderingContext2D {
  return {
    save: () => {},
    restore: () => {},
    translate: (x: number, y: number) => translations.push({ x, y }),
  } as unknown as CanvasRenderingContext2D
}

function fakeRenderer(): { renderer: Renderer } {
  const renderer = {
    canvasContext: {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      globalAlpha: 1,
      fillStyle: '',
      globalCompositeOperation: 'source-over',
    },
    drawCenteredText: () => {},
    getContext: () => ({ width: 800, height: 600 }),
  } as unknown as Renderer
  return { renderer }
}

describe('Fx tweens', () => {
  it('interpolates from → to and completes exactly once', () => {
    const fx = new Fx()
    const values: number[] = []
    let completions = 0
    fx.tween({
      from: 0,
      to: 100,
      duration: 0.5,
      onUpdate: (v) => values.push(v),
      onComplete: () => completions++,
    })

    fx.update(0.25)
    expect(values[values.length - 1]).toBeCloseTo(50)
    expect(completions).toBe(0)

    fx.update(0.25)
    expect(completions).toBe(1)
    expect(values[values.length - 1]).toBeCloseTo(100)

    fx.update(0.1)
    expect(completions).toBe(1)
    expect(fx.counts().tweens).toBe(0)
  })

  it('respects the easing function', () => {
    const fx = new Fx()
    let value = 0
    fx.tween({ from: 0, to: 1, duration: 1, ease: quadOut, onUpdate: (v) => (value = v) })
    fx.update(0.5)
    expect(value).toBeCloseTo(quadOut(0.5))
  })

  it('honours the delay before starting', () => {
    const fx = new Fx()
    let value = -1
    fx.tween({ from: 0, to: 10, duration: 0.2, delay: 0.3, onUpdate: (v) => (value = v) })
    fx.update(0.2)
    expect(value).toBe(-1)
    fx.update(0.3)
    expect(value).toBeCloseTo(10)
  })
})

describe('Fx particles', () => {
  it('spawns the requested count and expires them', () => {
    const fx = new Fx()
    fx.burst({ x: 0, y: 0, color: '#fff', count: 12, life: 0.5 })
    expect(fx.counts().particles).toBe(12)
    fx.update(1)
    expect(fx.counts().particles).toBe(0)
  })

  it('respects the hard particle cap', () => {
    const fx = new Fx()
    for (let i = 0; i < 50; i++) fx.burst({ x: 0, y: 0, color: '#fff', count: 40, life: 5 })
    expect(fx.counts().particles).toBeLessThanOrEqual(300)
  })

  it('halves particle counts under reduced motion', () => {
    const fx = new Fx(() => true)
    fx.burst({ x: 0, y: 0, color: '#fff', count: 20 })
    expect(fx.counts().particles).toBe(10)
  })
})

describe('Fx shake', () => {
  it('translates while active and stops when released', () => {
    const fx = new Fx()
    fx.shake(8, 0.2)
    const during: Array<{ x: number; y: number }> = []
    fx.update(0.05)
    fx.beginShake(fakeCtx(during))
    fx.endShake(fakeCtx([]))
    expect(during.length).toBe(1)
    expect(Math.abs(during[0].x)).toBeLessThanOrEqual(8)

    fx.update(1)
    const after: Array<{ x: number; y: number }> = []
    fx.beginShake(fakeCtx(after))
    fx.endShake(fakeCtx([]))
    // Offset values may exist but falloff is zero — translate must not run.
    expect(after.length).toBe(0)
  })

  it('never shakes under reduced motion', () => {
    const fx = new Fx(() => true)
    fx.shake(20, 1)
    fx.update(0.1)
    const shots: Array<{ x: number; y: number }> = []
    fx.beginShake(fakeCtx(shots))
    fx.endShake(fakeCtx([]))
    expect(shots.length).toBe(0)
  })
})

describe('Fx floaters + clear', () => {
  it('floaters rise and expire; clear removes everything', () => {
    const fx = new Fx()
    fx.floatText({ x: 10, y: 100, text: '+100', color: '#fff', life: 0.4, rise: 40 })
    fx.update(0.1)
    expect(fx.counts().floaters).toBe(1)
    fx.update(1)
    expect(fx.counts().floaters).toBe(0)

    fx.burst({ x: 0, y: 0, color: '#fff' })
    fx.tween({ from: 0, to: 1, duration: 5, onUpdate: () => {} })
    fx.floatText({ x: 0, y: 0, text: 'x', color: '#fff' })
    fx.clear()
    expect(fx.counts()).toEqual({ tweens: 0, particles: 0, floaters: 0 })
  })

  it('draw does not throw with a stub renderer', () => {
    const fx = new Fx()
    fx.burst({ x: 5, y: 5, color: '#0f0' })
    fx.floatText({ x: 5, y: 5, text: '+1', color: '#0f0' })
    const { renderer } = fakeRenderer()
    expect(() => {
      fx.update(0.016)
      fx.draw(renderer)
    }).not.toThrow()
  })
})
