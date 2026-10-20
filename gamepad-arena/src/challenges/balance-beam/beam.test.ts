import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import {
  BEAM_HALF_LENGTH,
  MAX_TILT,
  ORB_MIN_GAP,
  ORB_RADIUS,
  clamp,
  collectOrb,
  isAnalogReading,
  isOffBeam,
  nextOrbX,
  stepBall,
  stepBeam,
  tiltFromTriggers,
  type BallState,
  type BeamState,
} from './beam'

const DT = 1 / 60

describe('clamp', () => {
  it('bounds a value', () => {
    expect(clamp(5, -1, 1)).toBe(1)
    expect(clamp(-5, -1, 1)).toBe(-1)
    expect(clamp(0.5, -1, 1)).toBe(0.5)
  })
})

describe('tiltFromTriggers', () => {
  it('is zero when neither trigger is pressed', () => {
    expect(tiltFromTriggers(0, 0)).toBe(0)
  })

  it('tilts right for RT and left for LT', () => {
    expect(tiltFromTriggers(0, 0.6)).toBeCloseTo(0.6)
    expect(tiltFromTriggers(0.4, 0)).toBeCloseTo(-0.4)
  })

  it('is clamped to the tilt range', () => {
    expect(tiltFromTriggers(0, 1)).toBe(1)
    expect(tiltFromTriggers(1, 0)).toBe(-1)
  })
})

describe('stepBeam', () => {
  it('starts level and stays level without input', () => {
    const beam: BeamState = { angle: 0, angularVelocity: 0 }
    const next = stepBeam(beam, 0, DT)
    expect(next.angle).toBeCloseTo(0)
  })

  it('eases towards the target instead of snapping', () => {
    let beam: BeamState = { angle: 0, angularVelocity: 0 }
    beam = stepBeam(beam, 1, DT)
    expect(Math.abs(beam.angle)).toBeLessThan(MAX_TILT)
    expect(Math.abs(beam.angle)).toBeGreaterThan(0)
  })

  it('settles at the target tilt', () => {
    let beam: BeamState = { angle: 0, angularVelocity: 0 }
    for (let i = 0; i < 400; i++) beam = stepBeam(beam, 1, DT)
    expect(beam.angle).toBeCloseTo(MAX_TILT, 2)
  })

  it('never exceeds the maximum tilt beyond a small spring overshoot', () => {
    let beam: BeamState = { angle: 0, angularVelocity: 0 }
    for (let i = 0; i < 600; i++) {
      beam = stepBeam(beam, 1, DT)
      // The spring-damper overshoots very slightly before settling — that is
      // what gives the beam its springy feel.
      expect(Math.abs(beam.angle)).toBeLessThanOrEqual(MAX_TILT * 1.05)
    }
  })

  it('reaches the target tilt quickly', () => {
    let beam: BeamState = { angle: 0, angularVelocity: 0 }
    for (let i = 0; i < 30; i++) beam = stepBeam(beam, 1, DT)
    expect(beam.angle).toBeGreaterThan(MAX_TILT * 0.9)
  })

  it('is symmetric for opposite tilts', () => {
    let right: BeamState = { angle: 0, angularVelocity: 0 }
    let left: BeamState = { angle: 0, angularVelocity: 0 }
    for (let i = 0; i < 120; i++) {
      right = stepBeam(right, 1, DT)
      left = stepBeam(left, -1, DT)
    }
    expect(right.angle).toBeCloseTo(-left.angle, 6)
  })
})

describe('stepBall', () => {
  it('does not move on a level beam', () => {
    const ball: BallState = { x: 0, vx: 0 }
    const next = stepBall(ball, 0, DT)
    expect(next.x).toBeCloseTo(0)
  })

  it('accelerates downhill', () => {
    const ball: BallState = { x: 0, vx: 0 }
    const next = stepBall(ball, MAX_TILT, DT)
    expect(next.vx).toBeGreaterThan(0)
    expect(next.x).toBeGreaterThan(0)
  })

  it('accelerates the other way when the beam tips the other way', () => {
    const ball: BallState = { x: 0, vx: 0 }
    const next = stepBall(ball, -MAX_TILT, DT)
    expect(next.vx).toBeLessThan(0)
  })

  it('loses speed to rolling friction', () => {
    const ball: BallState = { x: 0, vx: 400 }
    const next = stepBall(ball, 0, DT)
    expect(Math.abs(next.vx)).toBeLessThan(400)
  })
})

describe('isOffBeam', () => {
  it('is false while the ball is on the beam', () => {
    expect(isOffBeam({ x: BEAM_HALF_LENGTH - 1, vx: 0 })).toBe(false)
  })

  it('is true past the end', () => {
    expect(isOffBeam({ x: BEAM_HALF_LENGTH + 1, vx: 0 })).toBe(true)
    expect(isOffBeam({ x: -BEAM_HALF_LENGTH - 1, vx: 0 })).toBe(true)
  })
})

describe('collectOrb', () => {
  it('collects when the ball is on the orb', () => {
    expect(collectOrb(100, 100)).toBe(true)
    expect(collectOrb(100 + ORB_RADIUS, 100)).toBe(true)
  })

  it('does not collect from a distance', () => {
    expect(collectOrb(100, 100 + ORB_RADIUS + 1)).toBe(false)
  })
})

describe('nextOrbX', () => {
  it('always lands on the beam', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 100; i++) {
      const x = nextOrbX(rng, 0)
      expect(Math.abs(x)).toBeLessThanOrEqual(BEAM_HALF_LENGTH)
    }
  })

  it('keeps a minimum gap from the previous orb', () => {
    const rng = mulberry32(11)
    let previous = 0
    for (let i = 0; i < 100; i++) {
      const x = nextOrbX(rng, previous)
      expect(Math.abs(x - previous)).toBeGreaterThanOrEqual(ORB_MIN_GAP - 1)
      previous = x
    }
  })
})

describe('isAnalogReading', () => {
  it('recognises a partial press', () => {
    expect(isAnalogReading(0.5)).toBe(true)
    expect(isAnalogReading(0.1)).toBe(true)
  })

  it('rejects fully-on and fully-off readings', () => {
    expect(isAnalogReading(0)).toBe(false)
    expect(isAnalogReading(1)).toBe(false)
  })
})
