/**
 * Echo Drift — pure sequence generation and scoring (iteration 16).
 *
 * Motor-memory rhythm: the demo plays a sequence of 8-direction notes on a
 * fixed beat; the player reproduces the ORDER and the RHYTHM with the sticks.
 * Two note types demand different physical motions: `hold` (enter the sector
 * and sustain) and `flick` (snap into the sector hard).
 *
 * Math convention everywhere: angle 0 = right, CCW positive, stick up = +Y
 * (input y is negated first). dir 0..7 map to 45° steps.
 */

import { mulberry32, rngInt, type Rng } from '../../utils/rng'

export type NoteKind = 'hold' | 'flick'
export type Channel = 'left' | 'right'

export interface Note {
  dir: number // 0..7 (0 = right, CCW)
  kind: NoteKind
}

export const BEAT = 0.55 // seconds between notes
export const HOLD_TIME = 0.1 // seconds the stick must stay in sector for 'hold'
export const TIMING_PERFECT_S = 0.08
export const TIMING_MAX_S = 0.3
export const EARLY_TOLERANCE_S = 0.15 // entering the sector earlier does nothing
export const SECTOR_RAD = (40 * Math.PI) / 180
export const ENTRY_MAGNITUDE = 0.55
export const FLICK_MAGNITUDE = 0.75

export function angleOfDir(dir: number): number {
  return (((dir % 8) + 8) % 8) * (Math.PI / 4)
}

/** Angle of a stick vector (screen y-down → math y-up). */
export function stickAngle(x: number, y: number): number {
  return Math.atan2(-y, x)
}

export function dirFromAngle(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
}

/** Absolute angular distance between a stick vector and a note direction. */
export function angularDistance(angle: number, dir: number): number {
  let d = angle - angleOfDir(dir)
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

/** Timing points: 100 within 80 ms, linear taper to 0 at 300 ms. */
export function timingScore(offsetSeconds: number): number {
  const abs = Math.abs(offsetSeconds)
  if (abs <= TIMING_PERFECT_S) return 100
  if (abs >= TIMING_MAX_S) return 0
  return 100 * (1 - (abs - TIMING_PERFECT_S) / (TIMING_MAX_S - TIMING_PERFECT_S))
}

/** Direction points: angular centre × stick magnitude, 0..100. */
export function directionScore(angle: number, magnitude: number, dir: number): number {
  const centre = Math.max(0, Math.cos(angularDistance(angle, dir)))
  return 100 * centre * centre * Math.min(1, magnitude)
}

/**
 * Round plan. Progression: rounds 0–1 left only; from round 2 notes alternate
 * channels within the round; every 4th round (3, 7, …) the beat halves so both
 * channels receive notes ON THE SAME BEAT — true simultaneity.
 */
export interface RoundPlan {
  left: Array<Note & { atBeat: number }>
  right: Array<Note & { atBeat: number }>
  simultaneous: boolean
  beat: number
  length: number
}

export function generateRound(round: number, seed: number): RoundPlan {
  const rng: Rng = mulberry32(seed)
  const length = Math.min(10, 3 + round)
  const simultaneous = round >= 3 && round % 4 === 3
  const beat = simultaneous ? BEAT / 2 : BEAT

  const left: Array<Note & { atBeat: number }> = []
  const right: Array<Note & { atBeat: number }> = []
  let lastDir = -1
  let lastKind: NoteKind = 'flick'

  for (let i = 0; i < length; i++) {
    let dir = rngInt(rng, 0, 7)
    if (dir === lastDir) dir = (dir + 1 + rngInt(rng, 0, 6)) % 8
    lastDir = dir

    let kind: NoteKind = rng() < 0.45 ? 'hold' : 'flick'
    if (kind === lastKind && rng() < 0.7) kind = kind === 'hold' ? 'flick' : 'hold'
    lastKind = kind

    let channel: Channel
    if (round < 2) channel = 'left'
    else if (simultaneous) channel = i % 2 === 0 ? 'left' : 'right'
    else channel = i % 2 === 0 ? 'left' : 'right'

    const note = { dir, kind, atBeat: i }
    ;(channel === 'left' ? left : right).push(note)
  }

  return { left, right, simultaneous, beat, length }
}
