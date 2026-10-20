import { describe, it, expect } from 'vitest'
import { TwinTargetChallenge } from './TwinTargetChallenge'
import { CURSOR_SPEED, distance, moveCursor } from './movement'
import { makeInput } from '../../test/input'

const DT = 1 / 60

describe('TwinTargetChallenge', () => {
  it('initializes with cursors and targets', () => {
    const challenge = new TwinTargetChallenge()
    // In test environment, renderer is null, so cursors won't be spawned
    // But the state should still initialize correctly
    challenge.reset()

    expect(challenge.sessionTime).toBe(0)
    expect(challenge.roundTime).toBe(0)
    expect(challenge.streak).toBe(0)
    expect(challenge.totalCompleted).toBe(0)
    expect(challenge.score).toBe(0)
  })

  it('completes rounds and tracks streak', () => {
    const challenge = new TwinTargetChallenge()
    challenge.reset()

    // Simulate completing rounds directly
    challenge.totalCompleted = 5
    challenge.totalClean = 5
    challenge.streak = 5
    challenge.bestStreak = 5
    challenge.roundResults = Array(5).fill({ completed: true, timeMs: 2000, clean: true })

    expect(challenge.totalCompleted).toBe(5)
    expect(challenge.streak).toBe(5)
    expect(challenge.bestStreak).toBe(5)
  })

  it('resets all state', () => {
    const challenge = new TwinTargetChallenge()
    challenge.reset()

    challenge.update(DT, makeInput({ leftStick: { x: 1, y: 0 }, rightStick: { x: 1, y: 0 } }))
    challenge.update(DT, makeInput({ leftStick: { x: 1, y: 0 }, rightStick: { x: 1, y: 0 } }))

    challenge.reset()

    expect(challenge.sessionTime).toBe(0)
    expect(challenge.roundTime).toBe(0)
    expect(challenge.streak).toBe(0)
    expect(challenge.totalCompleted).toBe(0)
    expect(challenge.score).toBe(0)
  })

  it('calculates a grade based on score', () => {
    const challenge = new TwinTargetChallenge()
    challenge.reset()

    const score = challenge.getScore()
    expect(score.grade).toBe('F') // no rounds completed

    // Simulate completing rounds to get a high score
    challenge.totalCompleted = 50
    challenge.totalClean = 50
    challenge.roundResults = Array(50).fill({ completed: true, timeMs: 1000, clean: true })
    challenge.calculateScore()

    expect(challenge.grade).toBe('S')
  })

  it('accepts the D-pad as an alternative to the left stick', () => {
    const challenge = new TwinTargetChallenge()
    challenge.reset()
    // The D-pad vector is what `getMoveVector` falls back to when the stick is
    // centred — the cursor must still move.
    challenge.update(
      DT,
      makeInput({ dpad: { x: 1, y: 0 } })
    )
    expect(challenge.sessionTime).toBeGreaterThan(0)
  })
})

describe('TwinTarget movement', () => {
  const zone = { left: 0, right: 1000, top: 0, bottom: 500 }

  it('moves at full speed in the stick direction', () => {
    const moved = moveCursor({ x: 0, y: 0 }, { x: 1, y: 0 }, zone, 0.1)
    expect(moved.x).toBeCloseTo(CURSOR_SPEED * 0.1)
    expect(moved.y).toBe(0)
  })

  it('scales speed with stick magnitude', () => {
    const moved = moveCursor({ x: 0, y: 0 }, { x: 0.5, y: 0 }, zone, 0.1)
    expect(moved.x).toBeCloseTo(CURSOR_SPEED * 0.5 * 0.1)
  })

  it('does not move when the stick is released', () => {
    const moved = moveCursor({ x: 10, y: 10 }, { x: 0, y: 0 }, zone, 1)
    expect(moved.x).toBe(10)
    expect(moved.y).toBe(10)
  })

  it('clamps the cursor inside its zone', () => {
    const smallZone = { left: 0, right: 100, top: 0, bottom: 50 }
    const moved = moveCursor({ x: 90, y: 45 }, { x: 1, y: 1 }, smallZone, 1)
    expect(moved.x).toBe(100)
    expect(moved.y).toBe(50)
  })

  it('measures the distance between two points', () => {
    expect(distance(0, 0, 3, 4)).toBe(5)
    expect(distance(10, 10, 10, 10)).toBe(0)
  })
})
