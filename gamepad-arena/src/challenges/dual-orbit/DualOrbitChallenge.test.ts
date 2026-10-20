import { describe, it, expect } from 'vitest'
import { DualOrbitChallenge } from './DualOrbitChallenge'
import { makeInput } from '../../test/input'

const DT = 1 / 60

/** Feed `rotations` full circular revolutions to both sticks. */
function spin(
  challenge: DualOrbitChallenge,
  rotations: number,
  leftDir: 1 | -1,
  rightDir: 1 | -1,
  stepsPerRotation = 90
): void {
  const total = Math.round(rotations * stepsPerRotation)
  for (let i = 0; i <= total; i++) {
    const a = (i / stepsPerRotation) * Math.PI * 2
    const la = a * leftDir
    const ra = a * rightDir
    challenge.update(
      DT,
      makeInput({
        leftStick: { x: Math.cos(la), y: Math.sin(la) },
        rightStick: { x: Math.cos(ra), y: Math.sin(ra) },
      })
    )
  }
}

describe('DualOrbitChallenge', () => {
  it('accumulates full orbits when both sticks move in the required directions', () => {
    const challenge = new DualOrbitChallenge()
    challenge.reset()
    spin(challenge, 3, 1, -1)

    expect(challenge.getScore().details.rotations).toBeGreaterThanOrEqual(2.9)
    expect(challenge.getScore().details.rotations).toBeLessThanOrEqual(3.1)
  })

  it('scores a completed run above an empty one', () => {
    const challenge = new DualOrbitChallenge()
    challenge.reset()
    spin(challenge, 3.5, 1, -1)

    const score = challenge.getScore()
    expect(score.score).toBeGreaterThan(700)
    expect(score.grade).not.toBe('F')
  })

  it('ignores stick movement below the minimum magnitude', () => {
    const idle = new DualOrbitChallenge()
    idle.reset()
    for (let i = 0; i < 200; i++) {
      idle.update(
        DT,
        makeInput({
          leftStick: { x: 0.1, y: 0.1 },
          rightStick: { x: -0.1, y: -0.1 },
        })
      )
    }

    expect(idle.getScore().details.rotations).toBe(0)
  })

  it('counts no orbits when a stick rotates the wrong direction', () => {
    const challenge = new DualOrbitChallenge()
    challenge.reset()
    spin(challenge, 3, -1, -1)

    expect(challenge.getScore().details.rotations).toBe(0)
  })

  it('requires both sticks, so a single-stick spin earns no orbits', () => {
    const challenge = new DualOrbitChallenge()
    challenge.reset()
    spin(challenge, 3, 1, 1)

    // left goes CW (counts), right also goes CW (wrong direction for right)
    expect(challenge.getScore().details.rotations).toBe(0)
  })

  it('returns F and a zero score before any input', () => {
    const challenge = new DualOrbitChallenge()
    challenge.reset()
    const score = challenge.getScore()
    expect(score.score).toBe(0)
    expect(score.grade).toBe('F')
    expect(score.details.rotations).toBe(0)
  })
})
