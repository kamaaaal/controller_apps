import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import {
  FACES,
  FAST_RECALL_MS,
  MAX_PATTERN_LENGTH,
  MAX_STREAK_MULTIPLIER,
  MIN_PATTERN_LENGTH,
  generatePattern,
  gradeFor,
  isCorrectStep,
  patternLength,
  patternScore,
  recallBonus,
  streakMultiplier,
} from './pattern'

describe('patternLength', () => {
  it('starts at the minimum length', () => {
    expect(patternLength(0)).toBe(MIN_PATTERN_LENGTH)
    expect(patternLength(1)).toBe(MIN_PATTERN_LENGTH)
  })

  it('grows every second cleared pattern', () => {
    expect(patternLength(2)).toBe(MIN_PATTERN_LENGTH + 1)
    expect(patternLength(4)).toBe(MIN_PATTERN_LENGTH + 2)
  })

  it('is capped so a run stays winnable', () => {
    expect(patternLength(1000)).toBe(MAX_PATTERN_LENGTH)
  })
})

describe('generatePattern', () => {
  it('produces the requested length', () => {
    const pattern = generatePattern(mulberry32(1), 5)
    expect(pattern).toHaveLength(5)
  })

  it('only uses the four face buttons', () => {
    const pattern = generatePattern(mulberry32(42), 9)
    for (const face of pattern) expect(FACES).toContain(face)
  })

  it('never repeats the same face twice in a row', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pattern = generatePattern(mulberry32(seed), 9)
      for (let i = 1; i < pattern.length; i++) {
        expect(pattern[i]).not.toBe(pattern[i - 1])
      }
    }
  })

  it('is deterministic for a given seed', () => {
    expect(generatePattern(mulberry32(7), 6)).toEqual(generatePattern(mulberry32(7), 6))
  })

  it('differs across seeds', () => {
    const a = generatePattern(mulberry32(1), 6)
    const b = generatePattern(mulberry32(2), 6)
    expect(a).not.toEqual(b)
  })
})

describe('isCorrectStep', () => {
  const pattern = ['a', 'b', 'x', 'y'] as const

  it('accepts the expected face', () => {
    expect(isCorrectStep(pattern, 0, 'a')).toBe(true)
    expect(isCorrectStep(pattern, 3, 'y')).toBe(true)
  })

  it('rejects any other face', () => {
    expect(isCorrectStep(pattern, 0, 'b')).toBe(false)
    expect(isCorrectStep(pattern, 2, 'a')).toBe(false)
  })
})

describe('streakMultiplier', () => {
  it('starts at 1', () => {
    expect(streakMultiplier(0)).toBe(1)
  })

  it('grows with the streak', () => {
    expect(streakMultiplier(4)).toBeGreaterThan(1)
  })

  it('is capped', () => {
    expect(streakMultiplier(1000)).toBeCloseTo(MAX_STREAK_MULTIPLIER)
  })
})

describe('patternScore', () => {
  it('rewards longer patterns', () => {
    expect(patternScore(6, 0)).toBeGreaterThan(patternScore(3, 0))
  })

  it('rewards a streak', () => {
    expect(patternScore(4, 5)).toBeGreaterThan(patternScore(4, 0))
  })
})

describe('recallBonus', () => {
  it('is zero when the recall was slow', () => {
    expect(recallBonus(FAST_RECALL_MS + 1, 4)).toBe(0)
  })

  it('is zero for an invalid latency', () => {
    expect(recallBonus(-1, 4)).toBe(0)
  })

  it('pays more the faster the recall', () => {
    expect(recallBonus(0, 4)).toBeGreaterThan(recallBonus(400, 4))
  })

  it('is rounded to a tidy multiple of five', () => {
    expect(recallBonus(123, 4) % 5).toBe(0)
  })
})

describe('gradeFor', () => {
  it('maps scores to grades in order', () => {
    expect(gradeFor(7000)).toBe('S')
    expect(gradeFor(5000)).toBe('A')
    expect(gradeFor(3500)).toBe('B')
    expect(gradeFor(2500)).toBe('C')
    expect(gradeFor(1500)).toBe('D')
    expect(gradeFor(100)).toBe('F')
  })
})
