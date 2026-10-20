/**
 * Pattern Lock — pattern generation and scoring rules (pure logic).
 *
 * The game is a Simon-style recall test on the four face buttons: a sequence
 * of A / B / X / Y flashes is shown, then the player reproduces it in order.
 * Everything here is deterministic given a seed so the rules can be tested
 * without a canvas.
 */

import type { Rng } from '../../utils/rng'

export const FACES = ['a', 'b', 'x', 'y'] as const
export type Face = (typeof FACES)[number]

export const MIN_PATTERN_LENGTH = 3
export const MAX_PATTERN_LENGTH = 9

/** Points for a single recalled note. */
export const NOTE_POINTS = 100
/** Points for clearing a whole pattern. */
export const PATTERN_CLEAR_POINTS = 50
/** Cap on the streak multiplier. */
export const MAX_STREAK_MULTIPLIER = 2.5
/** Recall faster than this (ms) earns the muscle-memory bonus. */
export const FAST_RECALL_MS = 700

/**
 * Length of the next pattern. It grows every second cleared pattern and is
 * capped so a run always stays winnable inside the session.
 */
export function patternLength(patternsCompleted: number): number {
  return Math.min(MAX_PATTERN_LENGTH, MIN_PATTERN_LENGTH + Math.floor(patternsCompleted / 2))
}

/**
 * A random pattern of `length` faces.
 *
 * Consecutive duplicates are avoided: two identical faces in a row are
 * indistinguishable from one long flash, which would make the sequence
 * ambiguous rather than just hard.
 */
export function generatePattern(rng: Rng, length: number): Face[] {
  const pattern: Face[] = []
  for (let i = 0; i < length; i++) {
    const candidates = i === 0 ? FACES : FACES.filter((face) => face !== pattern[i - 1])
    pattern.push(candidates[Math.floor(rng() * candidates.length) % candidates.length])
  }
  return pattern
}

/** True when `face` is the note expected at `index`. */
export function isCorrectStep(pattern: readonly Face[], index: number, face: Face): boolean {
  return pattern[index] === face
}

/** Streak multiplier — never below 1, never above the cap. */
export function streakMultiplier(streak: number): number {
  return 1 + Math.min(streak * 0.15, MAX_STREAK_MULTIPLIER - 1)
}

/**
 * Points for clearing one pattern: the notes themselves plus a clear bonus,
 * all scaled by the streak multiplier.
 */
export function patternScore(length: number, streak: number): number {
  const base = length * NOTE_POINTS + PATTERN_CLEAR_POINTS * length
  return Math.round(base * streakMultiplier(streak))
}

/**
 * Bonus for starting the recall quickly — the muscle-memory payoff.
 * Zero when the player waited longer than `FAST_RECALL_MS`.
 */
export function recallBonus(latencyMs: number, length: number): number {
  if (latencyMs < 0 || latencyMs > FAST_RECALL_MS) return 0
  return Math.round((length * 25 * (1 - latencyMs / FAST_RECALL_MS)) / 5) * 5
}

/** Grade thresholds for the whole run. */
export function gradeFor(score: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 6000) return 'S'
  if (score >= 4500) return 'A'
  if (score >= 3200) return 'B'
  if (score >= 2000) return 'C'
  if (score >= 1000) return 'D'
  return 'F'
}
