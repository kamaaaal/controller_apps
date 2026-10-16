/**
 * HUD timer formatting (iteration 13, fix 4b).
 *
 * Button Blitz had no visible countdown; the in-game timer HUD is driven by the
 * game loop's remaining time (`GameLoop.getTimeRemaining()`) and formatted here
 * so the readout matches the style the other challenges draw (`12.3s`).
 */

/** Format remaining seconds for the HUD, e.g. `9.4s`. Never negative. */
export function formatSecondsRemaining(remainingSeconds: number): string {
  return `${Math.max(0, remainingSeconds).toFixed(1)}s`
}
