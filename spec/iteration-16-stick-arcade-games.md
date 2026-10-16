# Iteration 16 — Joystick-First Arcade Wave: Three New Pixi Games

**Date:** 2026-10-16

## Summary

Three new analog-stick-first arcade games built on the lazy-loaded PixiJS
renderer (iteration 15), each with a distinct skill profile so the collection is
no longer "cursor-to-circle" variants: **Thread the Needle** (precision/
smoothness), **Gravity Jockey** (momentum/prediction) and **Echo Drift** (rhythm/
motor memory). Plus shared foundations: seeded RNG, a WebAudio SFX synth, Pixi
FX helpers, and an instant-retry flow for gamepad users.

## Selection rationale (concepts A–H scored against the existing lineup)

Existing: Button Blitz (timing), Dual Orbit (angular smoothness), Twin Target
(dual direct cursors).

| Candidate | Verdict | Reason |
| --- | --- | --- |
| A Thread the Needle | **Chosen** | Only path-following-under-pressure concept; corridor narrowing + pair-gate coordination is a fresh identity. |
| B Gravity Jockey | **Chosen** | Only momentum/physics concept; slingshot mastery gives the highest skill ceiling. |
| E Echo Drift | **Chosen** | Only rhythm/memory concept; hold-vs-flick notes make it pure analog motor skill. |
| C Twinblade | Rejected | Angular-velocity control overlaps Dual Orbit's identity. |
| D Circuit Breaker | Rejected | Tracing concept weaker variety-per-effort for wave 1. |
| F Black Hole Ballet | Rejected | Duplicates Gravity Jockey's momentum identity. |
| G Paintstorm | Rejected | Coverage puzzles overlap Twin Target's spatial-direct family. |
| H Phase Shift | Rejected | Portal prediction interesting but shares the "move core to target" core loop. |

**No physics library** — deterministic integration + circle geometry covers
Gravity Jockey (`src/challenges/gravity-jockey/physics.ts`, unit-tested).
New dependency: none beyond pinned `pixi.js@8.22.0` (iteration 15).

## Shared foundations (new)

- `src/utils/rng.ts` (+tests) — mulberry32 seeded PRNG; deterministic course/
  sequence/arena generation, replay-ready.
- `src/engine/audio.ts` — asset-free WebAudio SFX synth (`hit`, `perfect`,
  `combo`, `miss`, `crash`, `sync`, `round`); lazy context, resume-on-gesture,
  failures swallowed; `setAudioEnabled()` synced from the existing
  `Settings.audioEnabled` toggle in `App.tsx`.
- `src/engine/pixiFx.ts` — `Trail` (fading polyline), `BurstPool` (pooled
  additive particles), `PulseRing`, `computeShake()`; type-only pixi imports so
  the lazy chunk boundary holds; reduced-motion aware.
- `GameLoop.finish()` — challenge-driven early run end (Gravity Jockey dock);
  PlayPage maps `metadata.finished` → `finish()`.
- PlayPage/App: **☰ (Start) now retries from the result screen** (A stays
  vetoed per fix 4a); hint chip shows "Retry" on results.

## Game 1 — Thread the Needle (60s, Pixi, precision/smoothness)

- **Controls**: L-stick = green orb, R-stick = blue orb. Stick x = lateral
  velocity, magnitude-proportional, smoothed (no diagonal boost); stick y
  nudges the constant climb for gate timing.
- **Core loop**: climb two seeded weaving corridors; thread the gap in each
  gate bar. Scrape walls/stars → clamp + streak reset + −25 (forgiving, never
  death). Every 4th gate is a **pair gate**: closed (red) until the other orb
  holds its charge ring — hold one, thread the other.
- **Difficulty**: corridor half-width 90→60 px, gate gaps 48→32 px half-width
  with progress — spatial, visible ahead, not raw speed.
- **Scoring**: pass 100 × combo (streak ×0.1, cap ×3), PERFECT centre-hit
  (<12 px) ×2, SYNC pair gate +250, scrape −25/streak reset. Details: gates,
  perfects, syncs, max streak.
- **Pure logic**: `course.ts` (+11 tests) — generation, centreline, crossing
  and charge predicates.

## Game 2 — Gravity Jockey (60s, Pixi, momentum/prediction)

- **Controls**: each stick is one ship's thrust vector (≈340 px/s²); Newtonian
  integration, exponential damping, 520 px/s clamp — momentum is the mechanic.
  Three gravity wells (GM/r², surface-capped) + one orbiting mine.
- **Core loop**: collect your 4 gold/cyan fragments (some tucked behind wells
  for curved approaches), touch your switch, then dock BOTH ships in the centre
  exit. Docking ends the run early with a time bonus.
- **Risk/reward**: contact = bounce + −40 + shake; fast flybys inside the 24 px
  halo pay SLINGSHOT +30 (1.5 s cooldown per ship/well).
- **Scoring**: fragments 100, switches 250, slingshots 30, impacts −40, finish
  bonus = remaining seconds × 25. Details: fragments, switches, slingshots,
  collisions, finishBonus.
- **Pure logic**: `physics.ts` (+10 tests) — gravity direction/cap, momentum,
  clamping, bounce restitution, near-miss window, seeded deterministic arena.

## Game 3 — Echo Drift (75s, Pixi, rhythm/motor memory)

- **Controls**: sticks reproduce 8-direction notes. `hold` = enter the ±40°
  sector (mag > 0.55) and sustain 100 ms; `flick` = snap in above 0.75 — two
  distinct physical motions on the same stick.
- **Core loop**: WATCH — the sequence pulses on a 0.55 s beat; REPEAT — notes
  resolve in order against the ideal beat times (reproducing the rhythm, not
  just the order). Expiry auto-misses; timing ≤80 ms = 100 tapering to 0 at
  300 ms; direction scored from angular centring × magnitude.
- **Progression**: +2 notes/round (cap 10), right channel joins round 3, every
  4th round halves the beat for true simultaneity, demo cues dim over rounds.
- **Scoring**: per-note (timing ×0.6 + aim ×0.4) × combo mult (cap ×2),
  clean-round bonus 50 × length (×1.5 simultaneous). Details: notes hit/missed,
  avg timing ms, best combo, clean rounds, accuracy %.
- **Pure logic**: `sequence.ts` (+9 tests) — direction math, wrap-around angular
  distance, timing/direction curves, seeded round plans and progression.

## Files Created

- `src/utils/rng.ts`, `src/utils/rng.test.ts`
- `src/engine/audio.ts`
- `src/engine/pixiFx.ts`
- `src/challenges/thread-the-needle/course.ts` (+test), `ThreadTheNeedleChallenge.ts`
- `src/challenges/gravity-jockey/physics.ts` (+test), `GravityJockeyChallenge.ts`
- `src/challenges/echo-drift/sequence.ts` (+test), `EchoDriftChallenge.ts`
- `spec/iteration-16-stick-arcade-games.md`

## Files Modified

- `src/config/timing.ts` — three new durations (60/60/75 s)
- `src/challenges/index.ts` (+test) — registry; six production games
- `src/challenges/meta.ts`, `src/routes/LibraryPage.tsx` — card metadata +
  three new cover glyphs (thread/gravity/echo)
- `src/engine/gameLoop.ts` (+`finish()`)
- `src/routes/PlayPage.tsx` — `metadata.finished` handling, Start-to-retry
- `src/App.tsx` — audio-enabled sync, "Retry" hint on results

## Verification

- `npm run test:run` — 137 passed (17 files; 36 new tests this iteration)
- `npm run lint -- --max-warnings 0` — clean
- `npm run build` — green; main chunk 160.58 kB gzip (pixi still isolated in
  the async `lib-*.js` chunk, fetched only by pixi routes)
- Chromium (dev server + agent-browser + synthetic `navigator.getGamepads`
  pad, screenshots per game):
  - Thread the Needle: both corridors + gates render; independent sticks drive
    the orbs; wall scrapes clamp + flash + banner + penalty; gates resolve.
  - Gravity Jockey: wells/mine/fragments/switches/exit render; ships curve
    under gravity with trails; impacts bounce with penalty feedback.
  - Echo Drift: WATCH demo pulses notes on the beat; REPEAT shows sweeper,
    dual-channel arrows (round 7 captured), auto-miss + burst feedback.

## Known limitations / next steps

- No in-game tutorial beyond the HUD labels; a one-round interactive tutorial
  would teach hold-vs-flick and pair gates faster.
- Echo Drift scoring records timing accuracy only on hits; miss-penalty depth
  (e.g. partial credit for early flicks) is a tuning knob.
- Thread the Needle's pair-charge ring timing window (±40 px) is generous for
  accessibility; tighten per difficulty tier if added.
- Audio covers gameplay events only — no music; a lightweight WebAudio loop
  could be added behind the same toggle.
- Deterministic seeds exist everywhere: a daily-challenge/leaderboard mode can
  now pin seeds without further refactors.
