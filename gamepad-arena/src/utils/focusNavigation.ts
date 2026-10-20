/**
 * Spatial (directional) focus navigation helpers.
 *
 * Given the currently focused element and the set of focusable elements inside a
 * scope, `findNextFocus` picks the best neighbour in a given direction using
 * element geometry, so D-pad / stick input can drive the DOM like a game menu.
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right'

export const NAV_DIRECTIONS: NavDirection[] = ['up', 'down', 'left', 'right']

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false
  if (el.hidden) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

/** All focusable, currently-rendered elements inside `root`, in DOM order. */
export function getFocusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)
}

interface Measurement {
  el: HTMLElement
  /** Gap between the two boxes along the pressed axis, in pixels. */
  gap: number
  /** Overlap between the two boxes across the pressed axis, in pixels. */
  overlap: number
  /** Distance between the two boxes across the pressed axis, in pixels. */
  perpGap: number
}

/**
 * How far across the pressed axis a candidate may sit when it does not
 * overlap the focused element at all.
 *
 * This is the fallback for "nothing in this row/column band" — for example
 * moving down from the last row of game cards onto the button group below.
 * Without it, "right" from a button at the bottom of the page would jump
 * diagonally up to a control in a completely different row.
 */
const FALLBACK_BAND = 240

/**
 * Measure a candidate relative to the focused element.
 *
 * `gap` is how far the candidate sits beyond the focused element along the
 * pressed axis; `overlap` is how much the two boxes share across that axis.
 * Overlap is what identifies "the same row" / "the same column": a wide
 * slider and a narrow checkbox in one row barely overlap by centre distance
 * but share the whole row by extent.
 */
function measure(
  el: HTMLElement,
  originRect: DOMRect,
  direction: NavDirection
): Measurement | null {
  const rect = el.getBoundingClientRect()
  const horizontal = direction === 'left' || direction === 'right'

  let gap: number
  let overlap: number
  let perpGap: number

  if (horizontal) {
    if (direction === 'right') {
      if (rect.left <= originRect.right + 1) return null
      gap = rect.left - originRect.right
    } else {
      if (rect.right >= originRect.left - 1) return null
      gap = originRect.left - rect.right
    }
    overlap = Math.min(originRect.bottom, rect.bottom) - Math.max(originRect.top, rect.top)
    perpGap = Math.max(0, Math.max(originRect.top, rect.top) - Math.min(originRect.bottom, rect.bottom))
  } else {
    if (direction === 'down') {
      if (rect.top <= originRect.bottom + 1) return null
      gap = rect.top - originRect.bottom
    } else {
      if (rect.bottom >= originRect.top - 1) return null
      gap = originRect.top - rect.bottom
    }
    overlap = Math.min(originRect.right, rect.right) - Math.max(originRect.left, rect.left)
    perpGap = Math.max(0, Math.max(originRect.left, rect.left) - Math.min(originRect.right, rect.right))
  }

  return { el, gap, overlap, perpGap }
}

/**
 * Find the next focusable element in *document order* — the previous one for
 * `up`, the next one for `down`.
 *
 * Forms are read top to bottom, so a form-like screen (settings) navigates
 * better in reading order than in spatial order: a wide control and a narrow
 * one in the same column are still simply "the next field". Spatial
 * navigation is kept for grids (the games library), where the geometry is
 * the point.
 */
export function findNextInOrder(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: 'up' | 'down'
): HTMLElement | null {
  const index = candidates.indexOf(current)
  if (index < 0) return null
  const next = direction === 'down' ? index + 1 : index - 1
  return candidates[next] ?? null
}

/**
 * Find the nearest focusable element in `direction` from `current`.
 *
 * Candidates that share a row (or column) band with the focused element are
 * preferred, so "down" on a wide slider lands on the next control in that
 * column rather than skipping to a differently-shaped element further down
 * the page. When nothing overlaps, the nearest candidate in that direction
 * wins.
 *
 * Returns null when there is nothing further in that direction.
 */
export function findNextFocus(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: NavDirection
): HTMLElement | null {
  const originRect = current.getBoundingClientRect()

  const measurements: Measurement[] = []
  for (const el of candidates) {
    if (el === current) continue
    const m = measure(el, originRect, direction)
    if (m) measurements.push(m)
  }
  if (measurements.length === 0) return null

  // Prefer candidates that share a band with the focused element. If nothing
  // overlaps, fall back to the nearest candidate that is still roughly in the
  // same area of the page.
  const overlapping = measurements.filter((m) => m.overlap > 0)
  const pool =
    overlapping.length > 0
      ? overlapping
      : measurements.filter((m) => m.perpGap <= FALLBACK_BAND)
  if (pool.length === 0) return null

  let best = pool[0]
  for (const m of pool) {
    if (m.gap < best.gap || (m.gap === best.gap && m.overlap > best.overlap)) {
      best = m
    }
  }
  return best.el
}
