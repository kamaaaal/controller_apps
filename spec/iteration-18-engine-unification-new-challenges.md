# Iteration 18 — Engine Unification, Four New Challenges, Controller Profiles

**Date:** 2026-10-20

## Summary

Three things happened in this iteration, all of them driven by what the app
actually needed once it was played on real hardware:

1. **The engine seams were closed.** Gameplay used to run on a second
   animation frame with a hardcoded `1/60` step while the game loop's fixed
   timestep only drove the timer — so on a 144 Hz display every challenge ran
   ~2.4× too fast. There is now one clock, one renderer, and one input
   sample per frame.
2. **Four new challenges** joined the lineup (Pattern Lock, Mirror Protocol,
   Balance Beam, Map Recall), each with a pure-logic module and unit tests.
3. **The D-pad was fixed at the root.** It was normalised correctly and
   mapped correctly, but *no gameplay ever read it* — and on the 8BitDo
   Ultimate 2C Wireless it is reported as a **hat switch on axis 9**, not as
   four buttons, so the whole D-pad path was dead on that device.

The D-pad investigation also uncovered a genuine bug in the spatial focus
algorithm, which is described under "Focus navigation".

---

## 1. Engine unification

### One clock

`GameLoop` gained an input provider:

```ts
loop.setInputProvider(() => NormalizedInput | null)
```

It is invoked exactly once per rendered frame, *before* the fixed-timestep
updates, so every simulation step acts on the same freshest snapshot. The
play route no longer runs its own `requestAnimationFrame` for gameplay, and
the challenge's `update(dt, input)` is now driven by `GameLoop.setUpdateFn`.

Consequences:

- Gameplay speed no longer depends on the display refresh rate.
- Input latency dropped by one frame (the challenge previously acted on the
  *previous* frame's snapshot).
- One fewer concurrent animation loop (the countdown rAF was folded into the
  loop's draw callback, and only re-renders when the value actually changes).

### One renderer

`Challenge.setup` now receives the host's `Renderer` instead of a raw
`CanvasRenderingContext2D`. Previously each canvas challenge built a *second*
`Renderer` over the same canvas — a second `ResizeObserver` and a second
source of truth for the viewport.

```ts
setup(renderer: Renderer, gamepad: Gamepad): void
draw(renderer: Renderer): void
```

### The host no longer knows which game it is running

`ButtonBlitzChallenge` used to be special-cased in the play route
(`if (current.id === 'button-blitz') drawTimerHud(...)`). The `Challenge`
interface now has an optional hook:

```ts
drawHud?(renderer: Renderer, timeRemaining: number): void
```

The host calls it after the scene draw with the loop's remaining time. Any
challenge can now draw its own timer without touching the host.

### Durations

Every challenge duration now comes from `TIMING.challengeDurations`. The
three Pixi challenges had hardcoded literals (`duration = 60`) that bypassed
the config the file's own header says is the single source of truth. The
registry test now asserts that the registry and the timing table agree.

---

## 2. New challenges

Each ships with a pure-logic sibling module so the rules are testable
without a canvas, matching the existing `course.ts` / `physics.ts` /
`sequence.ts` convention.

| Challenge | Skill | Controls | Module |
|---|---|---|---|
| **Pattern Lock** | Memory, precision | A / B / X / Y | `challenges/pattern-lock/pattern.ts` |
| **Mirror Protocol** | Coordination, puzzle | both sticks | `challenges/mirror-protocol/protocol.ts` |
| **Balance Beam** | Precision (analog) | LT / RT | `challenges/balance-beam/beam.ts` |
| **Map Recall** | Memory, puzzle | left stick / D-pad | `challenges/map-recall/maze.ts` |

- **Pattern Lock** — Simon-style recall. The pattern grows every second
  cleared pattern (3 → 9 notes) and the flash window shrinks as it grows.
  Consecutive duplicate faces are avoided: two identical faces in a row are
  indistinguishable from one long flash, which makes the sequence ambiguous
  rather than merely hard.
- **Mirror Protocol** — the left stick is the signal, the right stick must
  obey MATCH / MIRROR / CROSS / FLIP. A ghost marker shows where the right
  stick *should* be, so the rule teaches itself.
- **Balance Beam** — the only game that uses the analog triggers. The beam
  follows the trigger through a spring-damper (ζ ≈ 0.75) so a light touch
  produces a small tilt. If the pad reports no analog trigger, the game
  detects it and falls back to the left stick's X axis, announcing the switch
  on screen so it is never a mystery.
- **Map Recall** — a perfect maze (randomised depth-first spanning tree) is
  shown for 3 s, then the walls become invisible while staying solid. The
  maze grows 5×5 → 9×9 and the preview shortens 3 s → 1.2 s.

The full design backlog — including the ideas that are *not* built yet — is
in `up_games.md` at the repository root.

---

## 3. The D-pad

### Root cause

`NormalizedInput` gained a `dpad` field: a single 8-way unit vector built
from the four D-pad buttons **or** from a hat switch on an axis. Challenges
read it through `getMoveVector(input, 'left' | 'right')`, so the D-pad is now
a first-class alternative to either stick in every directional game.

Three separate defects were behind "the D-pad doesn't work":

1. **No gameplay read the D-pad.** The D-pad was normalised, mapped and used
   for menu navigation — but no challenge ever looked at it. X, Y, LB, RB,
   LS and RS were unused in gameplay too.
2. **The 8BitDo Ultimate 2C reports the D-pad on an axis.** Its layout is
   completely non-standard:

   | Control | Raw index |
   |---|---|
   | A / B | 0 / 1 |
   | X / Y | 3 / 4 |
   | L1 / R1 | 6 / 7 |
   | L2 / R2 | 8 / 9 |
   | Back / Start | 10 / 11 |
   | L3 / R3 | 13 / 14 |
   | **D-pad** | **hat switch on axis 9** |
   | Right stick Y | **axis 5** (not 3) |
   | Triggers | **axes 3 / 4** |

   The old table claimed the D-pad was "shifted" but then used the standard
   indices anyway — so the D-pad was dead, the right stick's vertical axis
   was dead, and the triggers were on the wrong inputs.

3. **The navigation hook read the D-pad buttons**, not the new vector, so a
   hat switch never reached the menus either.

### Controller profiles

`ControllerProfile` now describes a device completely:

```ts
interface ControllerProfile {
  buttons: ButtonMapping
  axes: AxisMapping     // right stick Y, trigger axes, hat axis
  hat: HatSpec | null   // axis values that mean up/right/down/left/rest
}
```

`detectProfile(gamepad)` matches the controller id against `KNOWN_PROFILES`;
`resolveProfile(gamepad, overrides)` layers the user's saved overrides on
top. The hat switch is decoded by `decodeHat`, which matches a reading to
the nearest anchor within a tolerance and treats a reading closer to the
rest position as "released".

### Settings

- **Live controller monitor** — every raw button index lights up as it is
  pressed, with the indices the current mapping expects for the D-pad
  marked, every live axis value shown, and a live D-pad readout (direction
  and raw axis value) when the pad uses a hat switch. This makes a
  non-standard pad diagnosable instead of mysterious.
- **"COPY REPORT"** — exports the controller identity, the live axis and
  button readings, and a log of every distinct press captured while the
  panel was open, as JSON. It is the fastest way to get a device profile
  right: share the report and the exact layout can be written from it.
- **Axis role labels** — each raw axis is labelled with the control it
  carries (`AX2 LT`, `AX4 RS-X`, …), and the live trigger percentages are
  shown, so a mis-assigned axis is visible at a glance instead of being a
  mystery.
- **D-pad calibration wizard** — press each direction and the app captures
  exactly what the controller reports, for a button-based D-pad *or* a hat
  switch on an axis. The hat flow captures the four direction values plus
  the idle value, and writes them into the profile.
- **Effective mapping** — the button grid shows the indices the controller
  *actually* uses (detected profile + overrides), not the generic XInput
  defaults. On a non-standard pad the old grid was actively misleading: it
  showed indices the controller never reports, which reads as "the keys are
  collapsed".
- **Layout selector** — `Auto-detected` or `Standard (XInput)`, for a
  controller the detection tables get wrong.
- **Axes & D-pad section** — the D-pad source (buttons or a hat axis), the
  hat values, the right stick's Y axis and the trigger axes are all editable.
- `RESET TO DETECTED LAYOUT` restores the detected profile rather than the
  generic defaults.

### The stuck-down arrow

A hat switch's idle position can sit *between* two detents, and on this
controller the idle reading is close to the DOWN detent. With a loose
tolerance (0.22) the idle reading was decoded as DOWN, so the DOWN arrow
appeared permanently held and the other directions were hard to reach.

The tolerance is now tight (0.12): only a real press decodes, and the
calibration wizard pins the exact values for the player's controller. There
are regression tests for both — an idle reading of `0` must not decode as
DOWN, while a real press of each direction still does.

### The right stick reading as the left trigger

The published reverse-engineering of the 8BitDo Ultimate 2C lists the axes
as `0 LSx, 1 LSy, 2 RSx, 3 L2, 4 R2, 5 RSy`. On the real unit that is
**swapped**: axes 2 and 3 are the two analog triggers and axes 4 and 5 are
the right stick. The consequence was that moving the right stick X read as
the left trigger being pressed.

The shipped profile now uses the real layout, and the app can no longer be
fooled by a wrong guess:

- **Trigger axes are read with `readTriggerAxis`**, which handles both the
  -1…1 and 0…1 conventions without any history, so the value is right on
  the first frame and a trigger never sits at a phantom 50 %.
- **A trigger pointed at a stick axis is discarded** (`sanitiseAxes`) — such
  an assignment cannot be correct, and it is exactly the failure that made
  the stick appear to press the trigger.
- **STICK & TRIGGER CALIBRATION** captures the real axis indices: the player
  moves each control in turn and the app records the axis that moved.


---

## 4. Focus navigation bug

Pressing right on a library card moved focus to a **filter chip above the
grid** instead of the next card.

`findNextFocus` scored candidates as `primary + perpendicular × 2`. A chip
that sat 126 px above the row but only 76 px to the right scored better
(328) than the actual next card (416). The perpendicular penalty was too
weak whenever the on-axis candidate was far away.

Navigation now works in two passes: candidates are first narrowed to the
band containing the closest alignment in that direction (same row or column,
within 48 px), and the nearest of those wins. The filter chip is 126 px off
the row, so it is excluded, while the button group under the last grid row
— the only thing in that band — is still reachable.

### Two follow-up navigation bugs

**Skipping controls in the settings form.** The band was matched by *centre
distance*, so a wide range slider and a narrow checkbox in the same column
looked misaligned: pressing down on the deadzone slider jumped straight to
the Layout dropdown, skipping Vibration, High Contrast, Reduced Motion and
Audio. Bands are now matched by **span overlap** — how much the two boxes
share across the pressed axis — which correctly identifies "the same row" for
controls of very different widths.

**Spatial navigation is wrong for a form.** Even with correct bands, a
form-like screen is read top to bottom, and a spatial jump from a wide
slider to a narrow checkbox further down the page is disorienting. The
settings dialog therefore navigates up/down in **reading order**
(`findNextInOrder`), while the games library keeps the spatial behaviour —
there the geometry *is* the point. Left/right still adjusts a focused
select or slider in place, as before.

Verified in the browser: pressing down through the whole settings dialog
visits every one of its 35 controls in order, and pressing up walks back
through them; the library still moves card-to-card and row-to-row.

---

## 5. UI / UX

- **Pre-run briefing.** Every challenge now shows a "HOW TO PLAY" panel with
  its objective, its controls and its skill tags on the idle screen.
- **DOM HUD.** The live score and time are mirrored into a small panel in the
  top-left corner (a corner, not the centre, so it never collides with the
  canvas title or timer). It is not `aria-hidden`, so the values are readable
  by assistive technology instead of existing only as canvas pixels.
- **Result screen.** Shows the delta against the previous personal best
  (`NEW BEST · +1,240` / `+80 vs best` / `FIRST RUN`) and a **NEXT: <game>**
  button.
- **Library.** A skill filter row, skill tags on every card, and a header
  strip with the challenge and record counts.
- **Patten Lock pads** are laid out like an Xbox face-button cluster (the
  first layout overlapped the pads).
- **Map Recall** grid leaves room under it for the phase label.

---

## 6. Bug fixes

| Bug | Fix |
|---|---|
| `localStorage.clear()` wiped **every** key on the origin, not just the app's | `clearAllData()` removes only the `gamepad-arena:` prefixed keys |
| Gameplay ran at display refresh rate with a hardcoded `1/60` step | One fixed timestep, driven by `GameLoop` |
| Each canvas challenge built a second `Renderer` | The host's renderer is shared |
| Pixi particle/trail FX aged at the draw rate, not in real time | FX now advance on the fixed timestep |
| A placeholder test (`expect(true).toBe(true)`) stood in for cursor-movement coverage | Movement extracted to `twin-target/movement.ts` and covered for real |
| Dead Vite boilerplate (`src/App.css`, `src/assets/*`) | Removed |
| `getAllPersonalBests()` was exported but never used | Used by the app shell |

---

## Files Created

- `src/challenges/pattern-lock/{pattern.ts,pattern.test.ts,PatternLockChallenge.ts}`
- `src/challenges/mirror-protocol/{protocol.ts,protocol.test.ts,MirrorProtocolChallenge.ts}`
- `src/challenges/balance-beam/{beam.ts,beam.test.ts,BalanceBeamChallenge.ts}`
- `src/challenges/map-recall/{maze.ts,maze.test.ts,MapRecallChallenge.ts}`
- `src/challenges/twin-target/movement.ts`
- `src/components/ControllerMonitor.tsx`
- `src/components/DpadCalibration.tsx`
- `src/components/AxisCalibration.tsx`
- `src/test/input.ts` — shared `NormalizedInput` / synthetic gamepad helpers
- `up_games.md` — the full game design backlog
- `spec/iteration-18-engine-unification-new-challenges.md`

## Files Modified

- `src/types/index.ts` — `dpad` on `NormalizedInput`; `AxisMapping`, `HatSpec`; new `Settings` fields
- `src/utils/input.ts` — controller profiles, hat decoding, axis remapping
- `src/utils/focusNavigation.ts` — banded spatial navigation
- `src/engine/gameLoop.ts` — input provider
- `src/config/timing.ts` — every challenge duration + new per-game timings
- `src/challenges/index.ts`, `src/challenges/meta.ts` — registry, skills, briefings
- `src/challenges/*/` — all six existing challenges adapted to the new contract
- `src/routes/{PlayPage,LibraryPage,SettingsPage}.tsx`, `src/App.tsx`
- `src/index.css` — briefing, HUD, filter chips, skill chips, hat calibration, monitor
- `src/store/localStorage.ts` — scoped clear

## Verification

- `npm run test:run` — **258 passed** (21 files), up from 137.
- `npm run lint` — clean, `--max-warnings 0`.
- `npm run build` — green.
- Chromium (agent-browser + a synthetic pad injected over `navigator.getGamepads`):
  - D-pad RIGHT / DOWN / UP / LEFT move focus card-to-card across the library grid.
  - A hat-switch D-pad (8BitDo profile) drives navigation in all four
    directions, including with an idle axis reading of `0`.
  - The D-pad calibration wizard captures the four direction values and the
    idle value from a live controller and persists them to the settings.
  - The settings grid shows the controller's real indices (A=0, B=1, X=3,
    Y=4, L1=6, R1=7 for the 8BitDo layout) and the D-pad rows show
    "Hat axis 9".
  - Each of the four new challenges was played and screenshotted: Pattern Lock
    flashes its pads and shows the phase, Mirror Protocol locked a MATCH
    checkpoint and advanced to MIRROR with the ghost marker on the correct side,
    Balance Beam rolled the ball downhill under analog trigger input, Map Recall
    switched from preview to hidden and moved the player in all four directions
    while respecting walls.
  - Result screen verified: grade, score, delta against the previous best, and
    the NEXT challenge button.
- Note: an 8BitDo Ultimate 2C Wireless is attached to the machine but was not
  exposed to the headless test browser, so the shipped hat values were taken
  from a published reverse-engineering of that exact controller. The D-pad
  calibration wizard and the "COPY REPORT" export exist so the real values can
  be captured from the unit itself in a few seconds.
