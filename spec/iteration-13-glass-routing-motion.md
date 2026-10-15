# Iteration 13: Glass UI, React Router, Motion & Input Fixes (Rewamp 2)

## Date: 2026-10-16

## Summary
Implemented the `rewamp_2.md` brief: a frosted-glass arcade shell with real,
deep-linkable routes, a games-library home, tasteful motion, and three concrete
input/polish fixes — without breaking gameplay, the gamepad navigation, or the
project's checks. Build, 53 tests and lint are all green.

## Dependencies added (pinned)
- `react-router-dom@7.9.1` — routing.
- `motion@12.23.12` (Framer Motion's `motion/react`) — route/overlay transitions.

### Engine / animation decision (spec §3)
Kept the existing **Canvas 2D renderer** and custom fixed-timestep loop; adopted
**`motion`** only for UI/route transitions. Rationale: the three games are a few
simple 2D scenes already served well by the single-canvas `Renderer` behind the
`Challenge` interface (`setup/update/draw/getScore/reset`). A full engine
(Phaser) would mean rewriting all three games' draw code and bundling a large
dependency for no gameplay gain — against the brief's "lightest change that
delivers the polish." `motion` is UI-only, respects `prefers-reduced-motion`, and
adds no gameplay coupling. Bundle grew ~170 KB gzip (router + motion); acceptable
for a client-only Vite build with no SSR.

## 1. Glass UI + documented z-index (spec §1)
- Added a documented z-index scale (`--z-art/-canvas/-hud/-overlay/-modal/
  -toast/-debug`) and glass tokens (`--glass-surface/-blur/-hairline/-lightcatch`),
  replacing ad-hoc values.
- `.screen`, `.result-stats`, `.challenge-card`/tiles and the hint chip are now
  **frosted glass** (layered semi-transparent gradient + `backdrop-filter` blur +
  inset top light-catch + soft shadow), with only a 1px hairline — no neon
  outlines. Neon accents remain as glow/gradient tint.
- **Modal stacking:** settings is now its own **route** (`/settings`) rather than
  an overlay stacked on the result/pause screen, so overlays can no longer
  collide. The canvas (`--z-canvas`) always sits below overlays.
- **Accessibility survives the glass:** opaque solid fallbacks under
  `@supports not (backdrop-filter)`, `prefers-contrast: more`, `.high-contrast`
  and `forced-colors: active`; body/large text keep AA contrast (dark glass
  surfaces behind text).

## 2. Routing (spec §2)
- `HashRouter` (deep-linkable `#/play/:id`, refresh-safe without server SPA
  config — works in dev, preview and a single static file; back/forward work).
- Routes: `/` (library), `/play/:challengeId` (game), `/settings`.
- A **persistent shell** owns the canvas, `GameLoop`, `Renderer` and gamepad
  layer; routes only swap the overlay. Route↔engine sync effects start the named
  challenge on entering `/play/:id` (once per id) and reset the loop on leaving.
- **Gamepad B = back** → `navigate(-1)` (falls back to `/` on a fresh deep-link);
  **Start** on the library opens the focused game's route; A/click opens a tile.
- Gamepad focus navigation re-resolves its scope on every route change (existing
  `useFocusNavigation` + auto-focus effect, now keyed on the pathname).

## 3. Games library (spec §2)
- The home is a responsive grid of **glass game tiles** (cover-art badge,
  name, description, difficulty tag, duration, personal best) — a launcher, not a
  form. Full keyboard + gamepad navigation (D-pad/stick move, A opens, B backs),
  with visible focus/selected treatment.

## 4. Motion (spec §3)
- Route overlays animate via `AnimatePresence` (`mode="wait"`) + `motion.div`
  (fade/slide), wrapped in `<MotionConfig reducedMotion=...>` driven by the OS
  preference **and** the in-app Reduced Motion toggle.

## 5. Input / polish fixes (spec §4)
### 4a — Result screen no longer auto-closes on a held button
- New pure `src/utils/inputLatch.ts`: a release-latch gating confirm/back until
  the button is **released at least once** since the transition **and** a ~400 ms
  cooldown elapses. Wired into `useGamepadNavigation` via a `lockKey` that changes
  on every route/state transition. Verified: holding A through the Button-Blitz
  finish does **not** dismiss the result (stays on `/play/button-blitz`); only B
  leaves (to the library). Directional nav is never gated.

### 4b — Button Blitz now has a visible timer
- Added an internal elapsed timer + a HUD progress bar and seconds readout
  (turns red under 3 s), consistent with the other games; ends exactly at 0.

### 4c — Controller hint is a bottom-center glass chip
- The `A/B/☰` legend is now a fixed, frosted, bottom-center pill (was an unstyled
  block hanging at the top). Hidden during active gameplay and on small screens,
  clear of the debug overlay and status pill, and stays `aria-hidden`.

## Files
- **Created:** `src/utils/inputLatch.ts`, `src/utils/inputLatch.test.ts`.
- **Modified:** `src/main.tsx` (HashRouter), `src/App.tsx` (route-aware shell,
  library, settings route, motion, lock-out lockKey), `src/index.css` (glass +
  z-index scale + hint chip + library tiles + a11y fallbacks),
  `src/hooks/useGamepadNavigation.ts` (release-latch),
  `src/challenges/button-blitz/ButtonBlitzChallenge.ts` (timer),
  `package.json` (pinned deps).

## Verification
- ✅ `npm run build` — succeeds (tsc + vite, 443 KB JS / 143 KB gzip).
- ✅ `npm run test:run` — **53/53** (5 new input-latch tests).
- ✅ `npm run lint` — exit 0 (`--max-warnings 0`).
- ✅ Real browser (headless Chromium + synthetic gamepad): library launcher,
  Button Blitz visible timer, result-screen lock-out (A held → result not
  dismissed; B → library), settings route, and the `#/play/twin-target`
  deep-link all verified; routing hashes and gamepad B-back confirmed.

## Remaining limitations
- No App-component render tests (route↔engine wiring verified in-browser, not in
  jsdom, which lacks a canvas context).
- Audio is still a placeholder (`audioEnabled` toggle only).
- Bundle size grew with router + motion (see decision above).
