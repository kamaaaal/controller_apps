/**
 * Per-challenge presentation metadata for the games library (iteration 13).
 *
 * Deliberately kept OUT of the `Challenge` interface: gameplay classes stay
 * untouched and the launcher presentation (difficulty, card accent colour,
 * cover glyph, skill tags and the pre-run briefing) lives beside the registry
 * instead.
 *
 * The map is keyed by `ChallengeId`, so a challenge that exists in the
 * registry but has no entry here is a compile error rather than a silent
 * fallback.
 */

import type { ChallengeId } from '../config/timing'

export type ChallengeDifficulty = 'Easy' | 'Medium' | 'Hard'

export type ChallengeGlyph =
  | 'blitz'
  | 'orbit'
  | 'twin'
  | 'thread'
  | 'gravity'
  | 'echo'
  | 'pattern'
  | 'mirror'
  | 'beam'
  | 'maze'

/** Skill tags surfaced on the library card and used for grouping. */
export type ChallengeSkill =
  | 'Speed'
  | 'Memory'
  | 'Coordination'
  | 'Precision'
  | 'Rhythm'
  | 'Puzzle'
  | 'Physics'

export interface ChallengeMeta {
  difficulty: ChallengeDifficulty
  /** CSS colour driving the card's cover-art accent (glow + tint, not outlines). */
  accent: string
  /** Translucent variant of `accent` used as the card's gradient tint. */
  accentSoft: string
  /** Decorative cover glyph (inline SVG, aria-hidden). */
  glyph: ChallengeGlyph
  /** Short skill tags shown on the library card. */
  skills: ChallengeSkill[]
  /** Pre-run briefing, shown one line per entry on the idle screen. */
  instructions: string[]
}

export const CHALLENGE_META: Record<ChallengeId, ChallengeMeta> = {
  'button-blitz': {
    difficulty: 'Easy',
    accent: 'var(--face-a)',
    accentSoft: 'rgba(47, 212, 14, 0.16)',
    glyph: 'blitz',
    skills: ['Speed'],
    instructions: [
      'Mash the A button as fast as you can.',
      'A steady rhythm scores more than raw speed.',
      'Longer streaks multiply your points.',
    ],
  },
  'dual-orbit': {
    difficulty: 'Medium',
    accent: 'var(--accent-gold)',
    accentSoft: 'rgba(255, 210, 63, 0.14)',
    glyph: 'orbit',
    skills: ['Coordination', 'Precision'],
    instructions: [
      'Spin the LEFT stick clockwise.',
      'Spin the RIGHT stick counter-clockwise.',
      'Complete 3 full orbits without reversing.',
    ],
  },
  'pattern-lock': {
    difficulty: 'Medium',
    accent: 'var(--face-y)',
    accentSoft: 'rgba(255, 194, 30, 0.16)',
    glyph: 'pattern',
    skills: ['Memory', 'Precision'],
    instructions: [
      'Watch the four pads light up in sequence.',
      'Repeat the pattern with A, B, X and Y.',
      'A wrong pad resets the pattern — speed up your recall.',
    ],
  },
  'balance-beam': {
    difficulty: 'Medium',
    accent: 'var(--ps-triangle)',
    accentSoft: 'rgba(47, 212, 154, 0.16)',
    glyph: 'beam',
    skills: ['Precision', 'Coordination'],
    instructions: [
      'LT tilts the beam left, RT tilts it right.',
      'Ease the ball onto each orb to collect it.',
      'Let the ball roll off the end and you lose a life.',
    ],
  },
  'echo-drift': {
    difficulty: 'Medium',
    accent: 'var(--brand-ps)',
    accentSoft: 'rgba(30, 143, 255, 0.16)',
    glyph: 'echo',
    skills: ['Rhythm', 'Memory'],
    instructions: [
      'Watch the pulse — order AND rhythm.',
      'Echo it back on both sticks, on the beat.',
      'Hold notes need a sustained lean, flicks need a snap.',
    ],
  },
  'twin-target': {
    difficulty: 'Hard',
    accent: 'var(--brand-ps)',
    accentSoft: 'rgba(30, 143, 255, 0.16)',
    glyph: 'twin',
    skills: ['Coordination', 'Speed'],
    instructions: [
      'Left stick drives the left cursor, right stick the right.',
      'Land BOTH cursors on their targets before the timer.',
      'Consecutive clean rounds build a streak multiplier.',
    ],
  },
  'mirror-protocol': {
    difficulty: 'Hard',
    accent: 'var(--ps-square)',
    accentSoft: 'rgba(255, 122, 194, 0.16)',
    glyph: 'mirror',
    skills: ['Puzzle', 'Coordination'],
    instructions: [
      'The LEFT stick is the signal; the RIGHT stick must obey the rule.',
      'MATCH · MIRROR · CROSS · FLIP — read the panel each round.',
      'Hold the relation steady to lock the checkpoint.',
    ],
  },
  'map-recall': {
    difficulty: 'Hard',
    accent: 'var(--ps-cross)',
    accentSoft: 'rgba(74, 163, 255, 0.16)',
    glyph: 'maze',
    skills: ['Memory', 'Puzzle'],
    instructions: [
      'The maze is shown briefly — then it disappears.',
      'Navigate the remembered route to the goal.',
      'Stick or D-pad both steer. Walls block you.',
    ],
  },
  'thread-the-needle': {
    difficulty: 'Hard',
    accent: 'var(--ps-triangle)',
    accentSoft: 'rgba(47, 212, 154, 0.16)',
    glyph: 'thread',
    skills: ['Precision', 'Coordination'],
    instructions: [
      'Climb two corridors, one orb per stick.',
      'Stick X steers, stick Y nudges the climb.',
      'Every fourth gate only opens while the other orb charges it.',
    ],
  },
  'gravity-jockey': {
    difficulty: 'Hard',
    accent: 'var(--accent-gold)',
    accentSoft: 'rgba(255, 210, 63, 0.16)',
    glyph: 'gravity',
    skills: ['Physics', 'Coordination'],
    instructions: [
      'Fly with momentum around the gravity wells.',
      'Collect the fragments, then dock BOTH ships at the exit.',
      'Close flybys slingshot you for bonus points.',
    ],
  },
  // Dev-only PixiJS showcase (iteration 15) — pink accent to stand apart.
  'pixi-demo': {
    difficulty: 'Medium',
    accent: 'var(--ps-square)',
    accentSoft: 'rgba(255, 122, 194, 0.16)',
    glyph: 'twin',
    skills: ['Coordination'],
    instructions: ['Development showcase — not a real challenge.'],
  },
}

const FALLBACK_META: ChallengeMeta = {
  difficulty: 'Medium',
  accent: 'var(--brand-xbox-neon)',
  accentSoft: 'rgba(155, 240, 11, 0.14)',
  glyph: 'blitz',
  skills: [],
  instructions: [],
}

/** Metadata for a challenge id, with a safe fallback for unknown ids. */
export function getChallengeMeta(challengeId: string): ChallengeMeta {
  return CHALLENGE_META[challengeId as ChallengeId] ?? FALLBACK_META
}
