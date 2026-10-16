# Iteration 14 — Organic Glass Surfaces & Joystick-Reactive Background Art

**Date:** 2026-10-16
**Follow-up to:** rewamp_2 (glass UI, routing, input fixes — iteration-13 write-up pending)

## Summary

Three polish concerns raised after the rewamp_2 glass redesign:

1. The frosted panels still read as "container divs" — rounded rectangles with a
   hairline edge. They are now **soft-edged organic glass**: no border, no boxed
   shadow, edges dissolving into the page via a radial mask.
2. The main games library screen lacked the decorative background controller
   artwork ("joystick logos") that the play route already had. It now has it.
3. The background artwork was static. It now **reacts to every joystick move** —
   parallax translation plus a magnitude-driven glow, smoothed per frame.

## 1. Organic glass surfaces (no more rectangle containers)

`.screen` (library, play idle/pause/result, connect, settings dialog) and
`.game-card` were reworked in `src/index.css`:

- **No borders**: the 1px hairline highlight is gone (`border: none`).
- **Radial fill, not a flat panel**: a layered radial gradient (soft top light
  catch + dark core) replaces the linear glass fill.
- **Mask-dissolved edges**: `mask-image: radial-gradient(100% 100% at 50% 50%,
  #000 40%, transparent 100%)` fades the panel edges into the page so there is
  no visible rectangle — the panel reads as a haze of frosted glass. Cards use a
  gentler corner fade (opaque core to 55% of a 115% radius).
- **Halo instead of box shadow**: `box-shadow` replaced by `filter:
  drop-shadow(...)` (dark depth + faint Xbox-neon halo).
- **Contrast preserved**: the fill core stays ≥ 0.84 alpha of a near-black
  surface, keeping text ≥ 4.5:1 over the page background; content sits inside
  `--space-xl` padding, well within the opaque core.
- **Fallbacks updated**: `.high-contrast`, `@media (prefers-contrast: more)`,
  `@supports not (backdrop-filter)` and `@media (forced-colors: active)` all
  reset `mask-image: none; filter: none` and restore opaque, bounded surfaces.

## 2. Background controller art on the library

- `LibraryPage` now renders the same `.bg-art` block as `PlayPage` (four drifting
  `ControllerGlyph` silhouettes, `aria-hidden`, behind the glass panel).
- `.page` gained `position: relative; isolation: isolate` so the negative-z
  `.bg-art` stays behind the page content without escaping to the root stacking
  context (settings is a separate route via `.settings-page`).

## 3. Joystick-reactive icons (parallax + glow)

- New pure helpers `src/utils/stickParallax.ts`:
  - `parallaxTarget(ax, ay, deadzone)` — deadzone-filtered stick vector plus a
    magnitude clamped to 0..1.
  - `lerpParallax(current, target, factor)` — one exponential-smoothing step.
- New hook `src/hooks/useStickParallax.ts`: samples the pad's left stick per
  frame, lerps toward the target (factor 0.14) and writes `--joy-x`, `--joy-y`,
  `--joy-m` on the `.bg-art` element, skipping writes below a 0.001 epsilon.
- Markup restructure: each icon is now `.art-slot` wrapper + inner svg. The slot
  carries position + the parallax translate (`calc(var(--joy-x) * ±Npx)`, a
  different multiplier per icon for depth); the svg keeps its drift keyframes
  and gains `filter: drop-shadow(0 0 calc(var(--joy-m) * 18px) currentColor)` so
  icons glow brighter the further the stick is deflected.
- Wired into `LibraryPage` and `PlayPage` (both already receive the `gamepad`).
- `prefers-reduced-motion` / `.reduced-motion` reset the slot transforms; the
  parallax is decorative only and never an input path.

## Files Created

- `src/utils/stickParallax.ts`
- `src/utils/stickParallax.test.ts`
- `src/hooks/useStickParallax.ts`
- `spec/iteration-14-organic-glass.md`

## Files Modified

- `src/index.css` — organic `.screen`/`.game-card` glass, `.art-slot` parallax
  classes, `.page` positioning, fallback + reduced-motion updates
- `src/routes/LibraryPage.tsx` — bg-art + `useStickParallax`
- `src/routes/PlayPage.tsx` — bg-art slot markup + `useStickParallax`

## Verification

- `npm run test:run` — 73 passed (10 files; 7 new stickParallax tests)
- `npm run lint -- --max-warnings 0` — clean
- `npm run build` — succeeds
- Chromium (agent-browser, synthetic gamepad via `navigator.getGamepads`
  override): library + play idle screens screenshot-checked — panels have no
  rectangle edge, background art visible on both routes; stick deflection
  (0.9, −0.6) produced `--joy-x 0.882 / --joy-y −0.529 / --joy-m 1.000` and the
  `.art-1` slot translated to `(−26.46, 11.64)` px as expected; sustained
  deflection on the library only moves focus (no stray navigation).
