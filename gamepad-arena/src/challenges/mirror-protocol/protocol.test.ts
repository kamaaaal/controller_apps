import { describe, it, expect } from 'vitest'
import {
  RULES,
  angularDifference,
  applyRule,
  magnitude,
  relationError,
  ruleDescription,
  ruleHint,
  ruleLabel,
  satisfies,
  toleranceForRound,
  type Rule,
} from './protocol'

const UP = { x: 0, y: -1 }
const RIGHT = { x: 1, y: 0 }
const DOWN = { x: 0, y: 1 }
const LEFT = { x: -1, y: 0 }

describe('applyRule', () => {
  it('match keeps the vector', () => {
    expect(applyRule(UP, 'match')).toEqual(UP)
    expect(applyRule(RIGHT, 'match')).toEqual(RIGHT)
  })

  it('mirror reflects across the vertical axis', () => {
    expect(applyRule(RIGHT, 'mirror')).toEqual(LEFT)
    expect(applyRule(UP, 'mirror')).toEqual(UP)
  })

  it('cross rotates 90° clockwise on screen', () => {
    expect(applyRule(UP, 'cross')).toEqual(RIGHT)
    expect(applyRule(RIGHT, 'cross')).toEqual(DOWN)
    expect(applyRule(DOWN, 'cross')).toEqual(LEFT)
    expect(applyRule(LEFT, 'cross')).toEqual(UP)
  })

  it('flip inverts the vector', () => {
    expect(applyRule(UP, 'flip')).toEqual(DOWN)
    expect(applyRule(RIGHT, 'flip')).toEqual(LEFT)
  })
})

describe('magnitude', () => {
  it('measures the vector length', () => {
    expect(magnitude({ x: 3, y: 4 })).toBe(5)
    expect(magnitude({ x: 0, y: 0 })).toBe(0)
  })
})

describe('angularDifference', () => {
  it('is zero for the same direction', () => {
    expect(angularDifference(UP, UP)).toBeCloseTo(0)
  })

  it('is 90° for perpendicular vectors', () => {
    expect(angularDifference(UP, RIGHT)).toBeCloseTo(Math.PI / 2)
  })

  it('is 180° for opposite vectors', () => {
    expect(angularDifference(UP, DOWN)).toBeCloseTo(Math.PI)
  })

  it('is 180° when a vector has no direction', () => {
    expect(angularDifference({ x: 0, y: 0 }, UP)).toBeCloseTo(Math.PI)
  })
})

describe('relationError', () => {
  it('is zero when the rule is obeyed exactly', () => {
    const error = relationError(UP, applyRule(UP, 'match'), 'match')
    expect(error.angle).toBeCloseTo(0)
    expect(error.magnitude).toBeCloseTo(0)
  })

  it('measures the angular miss', () => {
    const error = relationError(UP, RIGHT, 'match')
    expect(error.angle).toBeCloseTo(Math.PI / 2)
  })

  it('measures the magnitude miss', () => {
    const error = relationError(UP, { x: 0, y: -0.5 }, 'match')
    expect(error.magnitude).toBeCloseTo(0.5)
    expect(error.angle).toBeCloseTo(0)
  })

  it('reports an undefined relation when the left stick is centred', () => {
    const error = relationError({ x: 0, y: 0 }, UP, 'match')
    expect(error.angle).toBe(Math.PI)
  })
})

describe('satisfies', () => {
  const tolerance = { angle: 0.3, magnitude: 0.3 }

  it('accepts an exact match for every rule', () => {
    for (const rule of RULES) {
      expect(satisfies(UP, applyRule(UP, rule), rule, tolerance)).toBe(true)
    }
  })

  it('rejects a wrong direction', () => {
    expect(satisfies(UP, RIGHT, 'match', tolerance)).toBe(false)
  })

  it('rejects a right direction with the wrong magnitude', () => {
    expect(satisfies(UP, { x: 0, y: -0.2 }, 'match', tolerance)).toBe(false)
  })

  it('accepts a small error inside the tolerance', () => {
    const slightlyOff = { x: Math.sin(0.1), y: -Math.cos(0.1) }
    expect(satisfies(UP, slightlyOff, 'match', tolerance)).toBe(true)
  })

  it('rejects an error outside the tolerance', () => {
    const wayOff = { x: Math.sin(0.8), y: -Math.cos(0.8) }
    expect(satisfies(UP, wayOff, 'match', tolerance)).toBe(false)
  })
})

describe('toleranceForRound', () => {
  it('tightens as the round grows', () => {
    expect(toleranceForRound(8).angle).toBeLessThan(toleranceForRound(0).angle)
    expect(toleranceForRound(8).magnitude).toBeLessThan(toleranceForRound(0).magnitude)
  })

  it('never becomes impossible', () => {
    expect(toleranceForRound(100).angle).toBeGreaterThan(0)
    expect(toleranceForRound(100).magnitude).toBeGreaterThan(0)
  })
})

describe('rule text', () => {
  it('labels every rule', () => {
    for (const rule of RULES) {
      expect(ruleLabel(rule)).toMatch(/^[A-Z]+$/)
      expect(ruleHint(rule).length).toBeGreaterThan(0)
      expect(ruleDescription(rule).length).toBeGreaterThan(0)
    }
  })

  it('covers all four rules', () => {
    const labels = RULES.map((rule: Rule) => ruleLabel(rule))
    expect(labels).toEqual(['MATCH', 'MIRROR', 'CROSS', 'FLIP'])
  })
})
