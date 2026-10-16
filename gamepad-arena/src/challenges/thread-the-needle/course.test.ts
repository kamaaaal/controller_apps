import { describe, it, expect } from 'vitest'
import {
  CLIMB_SPEED,
  corridorHalfWidth,
  evaluateGateCrossing,
  gateCrossed,
  gateSide,
  gapHalfForGate,
  isPairGate,
  makeCourse,
  centreline,
  withinCorridor,
} from './course'

const WIDTH = 1280

describe('course generation', () => {
  it('is deterministic per seed', () => {
    const a = makeCourse(42, WIDTH)
    const b = makeCourse(42, WIDTH)
    expect(a.left).toEqual(b.left)
    expect(a.right).toEqual(b.right)
    expect(a.gates).toEqual(b.gates)
  })

  it('differs between seeds', () => {
    const a = makeCourse(1, WIDTH)
    const b = makeCourse(2, WIDTH)
    expect(a.left).not.toEqual(b.left)
  })

  it('keeps centrelines inside the arena', () => {
    const course = makeCourse(7, WIDTH)
    for (let y = 0; y < 8000; y += 50) {
      for (const route of [course.left, course.right]) {
        const x = centreline(route, y)
        expect(x).toBeGreaterThan(0)
        expect(x).toBeLessThan(WIDTH)
      }
    }
  })

  it('alternates gate sides and marks every 4th as a pair gate', () => {
    const course = makeCourse(3, WIDTH)
    course.gates.forEach((gate, i) => {
      expect(gate.side).toBe(gateSide(i))
      expect(gate.kind).toBe(isPairGate(i) ? 'pair' : 'normal')
    })
  })
})

describe('difficulty curves', () => {
  it('corridor narrows monotonically toward the floor', () => {
    let prev = corridorHalfWidth(0)
    expect(prev).toBe(90)
    for (let p = 0.1; p <= 1; p += 0.1) {
      const w = corridorHalfWidth(p)
      expect(w).toBeLessThanOrEqual(prev)
      prev = w
    }
    expect(corridorHalfWidth(1)).toBe(60)
  })

  it('gate gaps shrink to a floor', () => {
    expect(gapHalfForGate(0)).toBe(48)
    expect(gapHalfForGate(200)).toBe(32)
    expect(gapHalfForGate(500)).toBe(32)
  })
})

describe('predicates', () => {
  it('gateCrossed detects upward crossings only', () => {
    expect(gateCrossed(100, 110, 105)).toBe(true)
    expect(gateCrossed(110, 100, 105)).toBe(false)
    expect(gateCrossed(105, 105, 105)).toBe(false)
  })

  it('withinCorridor tests against the weave', () => {
    const course = makeCourse(11, WIDTH)
    const y = 800
    const line = centreline(course.left, y)
    expect(withinCorridor(course, 'left', y, line, 80)).toBe(true)
    expect(withinCorridor(course, 'left', y, line + 120, 80)).toBe(false)
  })

  it('normal gate: pass inside the gap, fail outside, perfect near centre', () => {
    const course = makeCourse(5, WIDTH)
    const gate = course.gates[0] // left, normal
    const line = centreline(course.left, gate.y)
    const orb = { side: 'left' as const, y: gate.y, x: 0 }
    const other = { y: 0, x: 0 }

    const centre = evaluateGateCrossing(course, gate, { ...orb, x: line + gate.gapOffset }, other)
    expect(centre.passed).toBe(true)
    expect(centre.perfect).toBe(true)

    const edge = evaluateGateCrossing(course, gate, { ...orb, x: line + gate.gapOffset + gate.gapHalf - 6 }, other)
    expect(edge.passed).toBe(true)
    expect(edge.perfect).toBe(false)

    const miss = evaluateGateCrossing(course, gate, { ...orb, x: line + gate.gapOffset + gate.gapHalf + 30 }, other)
    expect(miss.passed).toBe(false)
  })

  it('pair gate stays charged only while the other orb holds the ring', () => {
    const course = makeCourse(5, WIDTH)
    const pairGate = course.gates.find((g) => g.kind === 'pair')!
    const route = pairGate.side === 'left' ? course.left : course.right
    const line = centreline(route, pairGate.y)
    const orb = { side: pairGate.side, y: pairGate.y, x: line + pairGate.gapOffset }

    const otherLine = centreline(pairGate.side === 'left' ? course.right : course.left, pairGate.y)
    const away = evaluateGateCrossing(course, pairGate, orb, { y: pairGate.y - 200, x: otherLine })
    expect(away.charged).toBe(false)
    expect(away.passed).toBe(false)

    const holding = evaluateGateCrossing(course, pairGate, orb, {
      y: pairGate.y,
      x: otherLine + pairGate.chargeOffset,
    })
    expect(holding.charged).toBe(true)
    expect(holding.passed).toBe(true)
  })

  it('climb speed covers the generated gate span within a 60s run', () => {
    const course = makeCourse(9, WIDTH)
    const last = course.gates[course.gates.length - 1]
    expect(last.y).toBeGreaterThan(CLIMB_SPEED * 60)
  })
})
