import { describe, it, expect } from 'vitest'
import { buildChallenges } from './index'
import { TIMING } from '../config/timing'
import { CHALLENGE_META } from './meta'

const PRODUCTION_IDS = [
  'button-blitz',
  'dual-orbit',
  'pattern-lock',
  'balance-beam',
  'echo-drift',
  'twin-target',
  'mirror-protocol',
  'map-recall',
  'thread-the-needle',
  'gravity-jockey',
]

describe('buildChallenges', () => {
  it('ships the ten production games outside dev', () => {
    const ids = buildChallenges(false).map((c) => c.id)
    expect(ids).toEqual(PRODUCTION_IDS)
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

  it('registers exactly the challenges listed in the timing config', () => {
    const ids = buildChallenges(true).map((c) => c.id).sort()
    expect(ids).toEqual(Object.keys(TIMING.challengeDurations).sort())
  })

  it('gives every production challenge a duration from the timing config', () => {
    for (const challenge of buildChallenges(false)) {
      expect(challenge.duration).toBe(TIMING.challengeDurations[challenge.id as keyof typeof TIMING.challengeDurations])
      expect(challenge.duration).toBeGreaterThan(0)
    }
  })

  it('gives every production challenge presentation metadata', () => {
    for (const challenge of buildChallenges(false)) {
      const meta = CHALLENGE_META[challenge.id as keyof typeof CHALLENGE_META]
      expect(meta).toBeDefined()
      expect(meta.instructions.length).toBeGreaterThan(0)
      expect(meta.skills.length).toBeGreaterThan(0)
    }
  })

  it('exposes a setup and a draw for every canvas challenge', () => {
    for (const challenge of buildChallenges(false)) {
      if (challenge.renderMode === 'pixi') continue
      expect(typeof challenge.setup).toBe('function')
      expect(typeof challenge.draw).toBe('function')
      expect(typeof challenge.update).toBe('function')
      expect(typeof challenge.getScore).toBe('function')
      expect(typeof challenge.reset).toBe('function')
    }
  })
})
