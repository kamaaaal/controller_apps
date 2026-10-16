import { describe, it, expect } from 'vitest'
import { buildChallenges } from './index'

describe('buildChallenges', () => {
  it('ships the six production games outside dev', () => {
    const ids = buildChallenges(false).map((c) => c.id)
    expect(ids).toEqual([
      'button-blitz',
      'dual-orbit',
      'twin-target',
      'thread-the-needle',
      'gravity-jockey',
      'echo-drift',
    ])
  })

  it('adds the Pixi demo in dev, opted into the pixi render mode', () => {
    const demo = buildChallenges(true).find((c) => c.id === 'pixi-demo')
    expect(demo).toBeDefined()
    expect(demo?.renderMode).toBe('pixi')
    expect(typeof demo?.setupPixi).toBe('function')
    expect(typeof demo?.drawPixi).toBe('function')
  })

  it('keeps the classic games on the canvas2d path and the new wave on pixi', () => {
    const list = buildChallenges(false)
    for (const challenge of list) {
      const expected = ['thread-the-needle', 'gravity-jockey', 'echo-drift'].includes(challenge.id)
        ? 'pixi'
        : 'canvas2d'
      expect(challenge.renderMode ?? 'canvas2d').toBe(expected)
    }
  })
})
