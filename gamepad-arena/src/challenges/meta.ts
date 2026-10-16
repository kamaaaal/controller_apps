/**
 * Per-challenge presentation metadata for the games library (iteration 13).
 *
 * Deliberately kept OUT of the `Challenge` interface: gameplay classes stay
 * untouched and the launcher presentation (difficulty, card accent colour,
 * cover glyph) lives beside the registry instead.
 */

export type ChallengeDifficulty = 'Easy' | 'Medium' | 'Hard'

export type ChallengeGlyph = 'blitz' | 'orbit' | 'twin' | 'thread' | 'gravity' | 'echo'

export interface ChallengeMeta {
  difficulty: ChallengeDifficulty
  /** CSS colour driving the card's cover-art accent (glow + tint, not outlines). */
  accent: string
  /** Translucent variant of `accent` used as the card's gradient tint. */
  accentSoft: string
  /** Decorative cover glyph (inline SVG, aria-hidden). */
  glyph: ChallengeGlyph
}

export const CHALLENGE_META: Record<string, ChallengeMeta> = {
  'button-blitz': {
    difficulty: 'Easy',
    accent: 'var(--face-a)',
    accentSoft: 'rgba(47, 212, 14, 0.16)',
    glyph: 'blitz',
  },
  'dual-orbit': {
    difficulty: 'Medium',
    accent: 'var(--accent-gold)',
    accentSoft: 'rgba(255, 210, 63, 0.14)',
    glyph: 'orbit',
  },
  'twin-target': {
    difficulty: 'Hard',
    accent: 'var(--brand-ps)',
    accentSoft: 'rgba(30, 143, 255, 0.16)',
    glyph: 'twin',
  },
  // Dev-only PixiJS showcase (iteration 15) — pink accent to stand apart.
  'pixi-demo': {
    difficulty: 'Medium',
    accent: 'var(--ps-square)',
    accentSoft: 'rgba(255, 122, 194, 0.16)',
    glyph: 'twin',
  },
  'thread-the-needle': {
    difficulty: 'Hard',
    accent: 'var(--ps-triangle)',
    accentSoft: 'rgba(47, 212, 154, 0.16)',
    glyph: 'thread',
  },
  'gravity-jockey': {
    difficulty: 'Hard',
    accent: 'var(--accent-gold)',
    accentSoft: 'rgba(255, 210, 63, 0.16)',
    glyph: 'gravity',
  },
  'echo-drift': {
    difficulty: 'Medium',
    accent: 'var(--brand-ps)',
    accentSoft: 'rgba(30, 143, 255, 0.16)',
    glyph: 'echo',
  },
}

const FALLBACK_META: ChallengeMeta = {
  difficulty: 'Medium',
  accent: 'var(--brand-xbox-neon)',
  accentSoft: 'rgba(155, 240, 11, 0.14)',
  glyph: 'blitz',
}

/** Metadata for a challenge id, with a safe fallback for unknown ids. */
export function getChallengeMeta(challengeId: string): ChallengeMeta {
  return CHALLENGE_META[challengeId] ?? FALLBACK_META
}
