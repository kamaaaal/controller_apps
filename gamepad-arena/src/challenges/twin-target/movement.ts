/**
 * Cursor movement for Dual Stick Rush — pure geometry, no renderer.
 *
 * Kept separate from the challenge so the movement rules can be unit-tested
 * without a canvas (jsdom has no 2D context).
 */

/** Pixels per second at full stick deflection. */
export const CURSOR_SPEED = 400

export interface CursorZone {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Point {
  x: number
  y: number
}

/** Move a cursor by `input` for `dt` seconds, clamped to its zone. */
export function moveCursor(
  position: Point,
  input: Point,
  zone: CursorZone,
  dt: number
): Point {
  const dx = input.x * CURSOR_SPEED * dt
  const dy = input.y * CURSOR_SPEED * dt
  return {
    x: Math.max(zone.left, Math.min(zone.right, position.x + dx)),
    y: Math.max(zone.top, Math.min(zone.bottom, position.y + dy)),
  }
}

/** Euclidean distance between two points. */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}
