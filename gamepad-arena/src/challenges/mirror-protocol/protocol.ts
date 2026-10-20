/**
 * Mirror Protocol — vector relation rules (pure logic).
 *
 * The left stick is the "signal" and the right stick must obey a relation to
 * it. The player controls both sticks, so the challenge is not about moving
 * *to* a target but about arranging two vectors into a relationship — a
 * coordination puzzle that rewards internalising the rule rather than reading
 * it every time.
 *
 * Screen convention: +x is RIGHT, +y is DOWN.
 */

export interface Point {
  x: number
  y: number
}

export type Rule = 'match' | 'mirror' | 'cross' | 'flip'

export const RULES: readonly Rule[] = ['match', 'mirror', 'cross', 'flip']

export interface Tolerance {
  /** Allowed angular error, in radians. */
  angle: number
  /** Allowed difference in stick magnitude. */
  magnitude: number
}

export interface RelationError {
  angle: number
  magnitude: number
}

/** Negate without producing `-0` (which compares unequal to `0`). */
function negate(value: number): number {
  return value === 0 ? 0 : -value
}

/** The vector the right stick must take, given the left stick's vector. */
export function applyRule(vector: Point, rule: Rule): Point {
  switch (rule) {
    case 'match':
      // Same direction.
      return { x: vector.x, y: vector.y }
    case 'mirror':
      // Reflected across the vertical axis: right becomes left.
      return { x: negate(vector.x), y: vector.y }
    case 'cross':
      // Rotated 90° clockwise on screen: up becomes right.
      return { x: negate(vector.y), y: vector.x }
    case 'flip':
      // Inverted: up becomes down.
      return { x: negate(vector.x), y: negate(vector.y) }
  }
}

export function magnitude(vector: Point): number {
  return Math.hypot(vector.x, vector.y)
}

/** Absolute angle between two vectors, in radians (0 … π). */
export function angularDifference(a: Point, b: Point): number {
  const ma = magnitude(a)
  const mb = magnitude(b)
  if (ma < 1e-6 || mb < 1e-6) return Math.PI
  const dot = (a.x * b.x + a.y * b.y) / (ma * mb)
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

/** How far the right stick is from obeying the rule. */
export function relationError(left: Point, right: Point, rule: Rule): RelationError {
  const expected = applyRule(left, rule)
  const expectedMagnitude = magnitude(expected)
  if (expectedMagnitude < 1e-6) return { angle: Math.PI, magnitude: 1 }
  return {
    angle: angularDifference(right, expected),
    magnitude: Math.abs(magnitude(right) - expectedMagnitude),
  }
}

/** True when the right stick satisfies the rule within `tolerance`. */
export function satisfies(
  left: Point,
  right: Point,
  rule: Rule,
  tolerance: Tolerance
): boolean {
  const error = relationError(left, right, rule)
  return error.angle <= tolerance.angle && error.magnitude <= tolerance.magnitude
}

/**
 * Tolerance for a given round: it tightens as the run progresses, so the
 * same rule becomes harder to satisfy the longer the player survives.
 */
export function toleranceForRound(round: number): Tolerance {
  const angle = Math.max(0.22, 0.5 - round * 0.035)
  const magnitude = Math.max(0.22, 0.5 - round * 0.03)
  return { angle, magnitude }
}

export function ruleLabel(rule: Rule): string {
  switch (rule) {
    case 'match':
      return 'MATCH'
    case 'mirror':
      return 'MIRROR'
    case 'cross':
      return 'CROSS'
    case 'flip':
      return 'FLIP'
  }
}

export function ruleHint(rule: Rule): string {
  switch (rule) {
    case 'match':
      return 'RIGHT STICK = LEFT STICK'
    case 'mirror':
      return 'RIGHT STICK = LEFT, MIRRORED'
    case 'cross':
      return 'RIGHT STICK = LEFT, ROTATED 90°'
    case 'flip':
      return 'RIGHT STICK = LEFT, INVERTED'
  }
}

/** Short spoken-form description used by the result screen. */
export function ruleDescription(rule: Rule): string {
  switch (rule) {
    case 'match':
      return 'same direction'
    case 'mirror':
      return 'mirrored'
    case 'cross':
      return 'rotated 90°'
    case 'flip':
      return 'inverted'
  }
}
