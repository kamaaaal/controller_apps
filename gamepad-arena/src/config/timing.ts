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
    'pattern-lock': 60,
    'balance-beam': 60,
    'echo-drift': 75,
    'twin-target': 60,
    'mirror-protocol': 75,
    'map-recall': 75,
    'thread-the-needle': 60,
    'gravity-jockey': 60,
    // Dev-only PixiJS showcase (iteration 15) — never in the production lineup.
    'pixi-demo': 30,
  },

  /** Twin Target: time limit for a single target-pair round (seconds). */
  twinTargetRoundSeconds: 4,

  /** Pattern Lock: seconds between notes during pattern playback. */
  patternLockBeatSeconds: 0.45,

  /** Pattern Lock: seconds the pattern stays on screen before it is hidden. */
  patternLockFlashSeconds: 0.42,

  /** Pattern Lock: how long the "your turn" prompt stays up before input opens. */
  patternLockPromptSeconds: 0.7,

  /** Mirror Protocol: seconds the relation must be held to lock a checkpoint. */
  mirrorProtocolHoldSeconds: 1.1,

  /** Mirror Protocol: minimum stick magnitude for a relation to count. */
  mirrorProtocolMinMagnitude: 0.4,

  /** Balance Beam: seconds the run lasts (also the challenge duration). */
  balanceBeamMaxTiltRadians: 0.38,

  /** Map Recall: seconds the maze is shown before it is hidden. */
  mapRecallPreviewSeconds: 3,
} as const

export type ChallengeId = keyof typeof TIMING.challengeDurations

/** Duration for a challenge id, or 0 if unknown (callers should guard). */
export function challengeDuration(id: string): number {
  return (TIMING.challengeDurations as Record<string, number>)[id] ?? 0
}
