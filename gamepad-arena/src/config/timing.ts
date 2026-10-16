/**
 * Central timing configuration for Gamepad Arena.
 *
 * All gameplay durations (in seconds) live here rather than as magic numbers
 * scattered across the engine and challenges. The single fixed-timestep game
 * loop (src/engine/gameLoop.ts) is the one time source for gameplay, driven by
 * the monotonic `performance.now()` clock — never by rendered frame counts.
 *
 * Changing a value here changes it everywhere; do not reintroduce inline
 * duration literals in challenges or the loop.
 */
export const TIMING = {
  /** Countdown shown before a run begins (3 → 2 → 1 → GO). */
  countdownSeconds: 3,

  /** Per-challenge run durations, keyed by challenge id. */
  challengeDurations: {
    'button-blitz': 10,
    'dual-orbit': 15,
    'twin-target': 60,
    'thread-the-needle': 60,
    'gravity-jockey': 60,
    'echo-drift': 75,
  },

  /** Twin Target: time limit for a single target-pair round (seconds). */
  twinTargetRoundSeconds: 4,
} as const

export type ChallengeId = keyof typeof TIMING.challengeDurations

/** Duration for a challenge id, or 0 if unknown (callers should guard). */
export function challengeDuration(id: string): number {
  return (TIMING.challengeDurations as Record<string, number>)[id] ?? 0
}
