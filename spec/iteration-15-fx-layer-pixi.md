# Iteration 15 — Game-feel FX Layer + Lazy-loaded PixiJS for Complex Games

**Date:** 2026-10-16

## Summary

Answer to "why raw Canvas instead of a library?": the game code was never raw
canvas — all challenges render through the shared `Renderer` API
(`drawCircle/drawRect/drawRing/drawArc/drawProgressBar/drawBackdrop/...`), which
is exactly the abstraction a game library provides. This iteration closed the
real gap (game-feel primitives) with a small in-house FX layer, and set up
PixiJS as an **opt-in, lazily imported renderer** for future complex games —
it is never fetched by the Canvas 2D games.

## Engine evaluation (rewamp_2 §3, documented here as required)

| Option | Verdict | Rationale |
| --- | --- | --- |
| Phaser / Kaplay | Rejected | Own loop, scenes and input. Would run beside our `GameLoop` + `normalizeGamepadInput` + React-owned canvas, force rewriting every challenge (rewamp_2 guardrail: "do not rewrite gameplay"), and add ~150–450 KB gzip for features these skill-games never use. |
| PixiJS | Adopted (opt-in) | A *renderer*, not a framework — no loop/input ownership, so it coexists cleanly behind the `Challenge` interface. Its value (WebGL, thousands of particles, bloom) only matters for complex games, so it sits behind a dynamic import and is used only by `renderMode: 'pixi'` challenges. |
| FX layer on `Renderer` | Adopted | The primitives every upcoming game wants (tweens, easings, particle bursts, screen shake, floating text) didn't exist. A ~250-line dependency-free module on the existing `Renderer` covers all Canvas 2D games today, stays unit-testable, and costs ~3 KB gzip. |

## Part 1 — FX layer (`src/engine/fx.ts`, `src/engine/easings.ts`)

`Fx` is composed into a challenge (never global):

- **`tween({from, to, duration, ease, delay, onUpdate, onComplete})`** — driven
  by the challenge's `update(dt)`; easings in `src/engine/easings.ts`
  (linear, quadIn/Out/InOut, cubicOut, backOut, elasticOut — all pure, tested).
- **`burst({x, y, color, count, speed, life, size, spread, angle})`** — pooled
  particles, hard cap 300; additive blending (`lighter`), never per-particle
  `shadowBlur` (the expensive Canvas 2D path).
- **`shake(intensity, duration)`** via `beginShake(ctx)`/`endShake(ctx)`
  around the scene draw — the HUD stays outside the shake.
- **`floatText({x, y, text, color, life, font, rise})`** — rising, fading text.
- **`update(dt)` / `draw(renderer)` / `clear()`**; `prefers-reduced-motion`
  (palette module) disables shake and halves particle counts.

### Wired into all three games (visual only — zero gameplay/scoring changes)

- **Twin Target**: particle bursts at both targets + small shake + "+100
  STREAK xN" float text on round completion; gameplay layer inside the shake
  transform, HUD steady.
- **Button Blitz**: additive burst + tweened expanding ripple ring per A press
  (max 6 concurrent, `quadOut`, faded by radius); existing flash ring kept.
- **Dual Orbit**: per-stick burst + "ORBIT!" float text at the exact ring
  position (shared `orbitLayout()` helper) whenever a whole rotation completes.

## Part 2 — PixiJS, opt-in and lazily loaded

- **Dependency**: `pixi.js@8.22.0`, pinned exact (`--save-exact`).
- **`Challenge` extras** (backwards compatible): `renderMode?: 'canvas2d' |
  'pixi'`, `setupPixi?(app, gamepad)`, `drawPixi?()`; `setup`/`draw` became
  optional so a challenge implements either the Canvas pair or the Pixi pair.
  Type-only pixi imports — erased at build, zero runtime cost.
- **`src/engine/pixiHost.ts`**: `createPixiApp(container)` does
  `await import('pixi.js')` (the only place the library is requested),
  `app.init({ resizeTo, autoStart: false, backgroundAlpha: 0, ... })` — our
  `GameLoop` owns time and calls `app.render()` from the draw pass.
- **`PlayPage`**: pixi challenges skip the Canvas 2D `Renderer`; the pixi app
  is created once per mount (destroyed with `destroy(true, {children:true})`);
  PLAY is disabled ("LOADING…") until the app is ready; start/route/cleanup
  paths branch on `renderMode`.
- **Dev-only showcase** `src/challenges/pixi-demo/` (`/play/pixi-demo`):
  template for the next complex game — neon orb eases toward the left stick,
  A bursts alternating green/blue particle rings, holding B shakes the orb.
  Registered via the pure `buildChallenges(isDev)` seam (unit-tested) only when
  `import.meta.env.DEV`, so it is tree-shaken from production.

### Bundle guarantee

- `dist` main chunk: 468.27 kB (150.39 kB gzip) vs 458.52 kB (147.05 kB) before
  — the FX layer + plumbing (~3 kB). The pixi library lives in a separate
  `lib-*.js` chunk (645.40 kB / 184.97 kB gzip) referenced only by dynamic
  `import()`; `dist/index.html` never references it.

## Files Created

- `src/engine/easings.ts`, `src/engine/easings.test.ts`
- `src/engine/fx.ts`, `src/engine/fx.test.ts`
- `src/engine/pixiHost.ts`
- `src/challenges/pixi-demo/PixiDemoChallenge.ts`
- `src/challenges/index.test.ts`
- `spec/iteration-15-fx-layer-pixi.md`

## Files Modified

- `src/types/index.ts` — Challenge: optional setup/draw + renderMode/pixi hooks
- `src/routes/PlayPage.tsx` — pixi branch (app lifecycle, draw pass, start gating)
- `src/challenges/index.ts` — `buildChallenges(isDev)` registry seam
- `src/challenges/meta.ts` — pixi-demo card metadata
- `src/challenges/twin-target/TwinTargetChallenge.ts` — FX (burst/shake/float)
- `src/challenges/button-blitz/ButtonBlitzChallenge.ts` — FX (burst/ripples)
- `src/challenges/dual-orbit/DualOrbitChallenge.ts` — FX (orbit bursts + layout)
- `package.json` / `package-lock.json` — pinned `pixi.js@8.22.0`

## Verification

- `npm run test:run` — 100 passed (13 files; 33 new: easings/fx/registry)
- `npm run lint -- --max-warnings 0` — clean
- `npm run build` — green; chunk sizes confirmed as above (main 150.39 kB
  gzip, pixi isolated in async `lib-*.js`)
- Chromium (agent-browser + synthetic `navigator.getGamepads` override):
  - Button Blitz: live run via Start + A-mash — ripple rings + additive
    particles visible mid-run; run completed with correct score/PB.
  - Pixi demo: `/play/pixi-demo` mounts with the Pixi canvas; scene title,
    grid, eased orb and both burst colours captured mid-run; `agent-browser
    network requests` shows `pixi__js.js` fetched on `/play/pixi-demo` and NOT
    fetched on `/play/button-blitz` (dev), matching the prod chunk analysis.
- Environment note: this machine exports `NODE_ENV=production` globally, which
  makes npm prune devDependencies on install (`npm ci --include=dev` or
  `NODE_ENV=development` needed) and makes Vite treat a dev server as prod
  (`import.meta.env.DEV === false`, hiding the dev-only pixi-demo card). Run
  the dev server with `NODE_ENV=development npx vite` when the demo is needed.
- Real-hardware note: a physical 8BitDo controller was visible to the test
  browser via the Gamepad API and interleaved with synthetic input during
  verification (also explains the stray navigation observed in iteration 14).
