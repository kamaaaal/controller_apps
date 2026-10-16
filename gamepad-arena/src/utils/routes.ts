/**
 * Central route definitions and navigation helpers (iteration 13).
 *
 * The app uses real browser-history routes (`BrowserRouter`): the games library,
 * one route per challenge and a settings dialog route. All path building and the
 * "B = back" decision live here so routing behaviour is testable without React.
 */

export const ROUTES = {
  /** Home — the games library. */
  library: '/',
  /** An individual game, e.g. `/play/button-blitz`. */
  settings: '/settings',
} as const

/** Build the deep-linkable path for a challenge. */
export function playPath(challengeId: string): string {
  return `/play/${encodeURIComponent(challengeId)}`
}

/**
 * Decide where "back" should go: one step in the browser history when the app
 * itself pushed an entry (in-app navigation), otherwise fall back to the
 * library — e.g. when `/play/x` or `/settings` was deep-linked directly and
 * `navigate(-1)` would leave the app.
 *
 * React Router stores the zero-based position of the current entry in
 * `history.state.idx`; `undefined` means the entry was not created by the router.
 */
export function goBackTarget(historyIndex: number | undefined): 'back' | 'home' {
  return typeof historyIndex === 'number' && historyIndex > 0 ? 'back' : 'home'
}
