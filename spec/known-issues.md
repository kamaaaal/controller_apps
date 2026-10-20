# Known Issues & Limitations

## Browser Compatibility

### Gamepad API Support
- **Chrome/Edge**: Full support, standard mapping
- **Firefox**: Full support, standard mapping
- **Safari**: Partial support (requires user gesture, limited mapping)
- **Mobile browsers**: Limited - iOS Safari requires special handling

### Controller Mapping Variations
- **Xbox (XInput)**: Standard mapping works perfectly
- **PlayStation (DualShock/DualSense)**: Standard mapping in Chrome, may need adjustment in Firefox
- **Switch Pro**: Standard mapping when paired via Bluetooth
- **Generic/Third-party**: May use non-standard mappings
- **Trigger axes**: Some browsers report LT/RT on axes[4]/[5], others only on buttons[6]/[7]

## Current Limitations

### Input
- Only first connected gamepad (index 0) used
- No gamepad switching UI yet
- No haptic/vibration support implemented (API stubbed)
- Deadzone applies to both sticks equally
- The D-pad is read as a single vector, so a diagonal press reports two
  directions at once — menu navigation acts on the dominant one first
- Hat-switch D-pad values are per-device constants. The 8BitDo Ultimate 2C
  Wireless values come from a published reverse-engineering of that model, so
  they are **not** verified against the physical unit. If the D-pad misbehaves,
  Settings → D-PAD CALIBRATION captures the controller's real values in a
  few seconds, and "COPY REPORT" exports the raw data
- The same applies to the axis layout: Settings → STICK & TRIGGER
  CALIBRATION captures which raw axis carries each stick and trigger

### Challenges
- Ten challenges implemented: Button Blitz, Dual Orbit, Pattern Lock,
  Balance Beam, Echo Drift, Dual Stick Rush, Mirror Protocol, Map Recall,
  Thread the Needle, Gravity Jockey
- No daily challenges or leaderboards
- No replay/ghost system
- Balance Beam needs analog triggers; pads that report triggers as plain
  on/off buttons fall back to the left stick's X axis automatically (and the
  game says so on screen)

### Persistence
- localStorage only (no cloud sync)
- No export/import of data
- No account system

### Audio
- Sound effects are implemented (Web Audio oscillator synth, no assets)
- No background music

### Visuals
- Neon Xbox-first theme with layered gradients, glassy panels, canvas glow and
  decorative gamepad artwork (iteration 9)
- No CRT shader (just a scanline overlay)
- Font loading: JetBrains Mono/Orbitron may not load on all systems

### Accessibility
- WCAG 2.1 AA pass in iteration 9: all text/UI contrast ≥ AA (lowest 5.7:1),
  face buttons / rings / grades carry letters or labels (never colour alone),
  Settings is a focus-trapped modal (Escape closes, focus restored), reduced
  motion and high-contrast honoured (OS media queries + in-app toggles),
  interactive targets ≥ 44x44 px, result announced via an `aria-live` region.
- Iteration 18: the live score and time are mirrored into a DOM HUD panel
  (top-left), so in-game values are no longer canvas-only. The challenge
  briefing is shown as real text on the idle screen.
- High-contrast mode keeps the neon glow on primary buttons (cosmetic only;
  borders + text already satisfy contrast) — could be flattened further.
- Colour-vision-deficiency check was reasoned from the palette + mandatory
  letters/labels, not run through an automated CVD simulator.

### Testing
- No E2E tests (Playwright not configured for the project)
- No visual regression tests
- 251 unit tests cover input utils, controller profiles and hat decoding,
  focus navigation, the game-loop lifecycle and timing, the registry
  contract, and the pure-logic module of every challenge
- Browser verification was done manually with a headless Chromium and a
  synthetic gamepad injected over `navigator.getGamepads`

## Workarounds

### For Testing Without Controller
- Use `?debug=1` query parameter for debug overlay
- Keyboard fallback: **Space** = A, **Enter** = Start (pause/resume), **Escape** = back to menu
- Note: the on-screen START button stays disabled until a gamepad is detected

### For Safari Users
- Must interact with page first (click) before Gamepad API activates
- May need to enable "Gamepad API" in Experimental Features

## Future Fixes
1. Add controller selection UI when multiple connected
2. Implement vibration using GamepadHapticActuator
3. Add the next batch of challenges from `up_games.md` (Relay Switch,
   Circuit Break, Pixel Hunt, Beat Runner)
4. Configure Playwright for E2E testing (a throwaway headless-Chromium harness
   with a synthetic gamepad was used to verify iterations 9 and 18 manually)
5. Add font loading with fallbacks
6. Implement daily challenge system
7. Add replay recording/playback
8. Consider IndexedDB for larger data storage
9. Verify the 8BitDo hat-switch and axis values on the physical unit — the
   headless test browser could not see the attached controller, so the
   shipped values come from a published reverse-engineering rather than from
   the unit. The D-pad and stick/trigger calibration wizards cover this in
   the meantime

## Recently Fixed
- **START button did nothing** — the canvas container ref was never attached, so the
  engine never initialised (iteration 7)
- **Gameplay rendered to a duplicate off-screen canvas** (iteration 7)
- **Settings dialog overflowed the viewport** (iteration 7)
- **"NEW PERSONAL BEST!" banner never appeared** (iteration 7)
- **Dual Orbit challenge implemented** (iteration 8)
- **Neon UI redesign, background controller art and WCAG 2.1 AA accessibility** (iteration 9)
- **Full gamepad UI control**: the whole app is navigable with the controller
  (iteration 10)
- **Dual Stick Rush (Twin Target) challenge implemented** (iteration 11)
- **Gameplay ran at display refresh rate** with a hardcoded `1/60` step — a
  144 Hz display ran every challenge ~2.4× too fast (iteration 18)
- **Each canvas challenge built a second `Renderer`** over the same canvas
  (iteration 18)
- **`localStorage.clear()` wiped every key on the origin**, not just the app's
  (iteration 18)
- **The D-pad did nothing in gameplay** — no challenge read it, and the
  8BitDo Ultimate 2C Wireless reports its D-pad as a hat switch on axis 9
  (iteration 18)
- **The DOWN arrow appeared stuck on** — the hat switch's idle reading is
  close to the DOWN detent, and the decode tolerance was loose enough to
  read it as a press (iteration 18)
- **The settings button-mapping grid showed the wrong indices** — it listed
  the generic XInput defaults rather than the controller's real layout, which
  made a non-standard pad look like "most of the keys are collapsed"
  (iteration 18)
- **Pressing right on a library card jumped to a filter chip above the grid**
  instead of the next card — the spatial focus penalty was too weak
  (iteration 18)
- **The settings dialog skipped controls** — pressing down on the deadzone
  slider jumped to the Layout dropdown, skipping four checkboxes, because
  the focus bands were matched by centre distance rather than by span
  overlap (iteration 18)
- **Moving the right stick pressed the left trigger** — the 8BitDo Ultimate
  2C's axis layout was mis-assigned (the triggers are axes 2/3 and the right
  stick is axes 4/5, not the other way round) (iteration 18)
- **Up/down in the settings dialog is now reading order**, not spatial —
  forms read top to bottom, and the games library keeps spatial navigation
  (iteration 18)
- **Pixi particle and trail effects aged at the draw rate**, so they ran
  faster on high-refresh displays (iteration 18)

## Gamepad UI Control (iteration 10)
- D-pad / left stick move focus; **A** confirms; **B**/Back goes back; **Start**
  plays (menu) or pauses/resumes (during a run).
- Navigation is disabled during `countdown`/`running` so the stick is not stolen
  from the challenge.
- On a focused slider or dropdown, **left/right adjusts the value in place**
  (native popups can't be driven by a gamepad).
- Down from a challenge card focuses the spatially-nearest control below it,
  which may be SETTINGS rather than START depending on position.
- Only the first connected gamepad drives navigation (index 0).

## Dual Stick Rush / Twin Target (iteration 11)
- Third challenge: dual-analog puzzle with two cursors (cyan left, purple right)
- Both sticks control cursors simultaneously; targets spawn randomly in each zone
- 60-second sessions with 4-second rounds, streaks, and scoring
- Result screen shows: Completed / Clean / Best Streak / Avg Time / Accuracy

## Navigation Fix (iteration 10b)
- **Problem reported:** "joystick control is not working all of a sudden"
- **Root cause:** The navigation hooks (`useFocusNavigation`, `useGamepadNavigation`)
  and utilities (`focusNavigation.ts`, `controlAdjust.ts`) were created but never
  imported or used in `App.tsx`. The files existed on disk but were dead code.
- **Fix:** Added the imports, navigation wiring (handleNavigate, handleConfirm,
  handleBack, handleNavStart), the `gamepad-nav` container class, and the action
  hints legend to `App.tsx`.
- **Verification:** D-pad moves focus between menu cards, A selects, B goes back,
  Start starts the game. Navigation auto-disables during gameplay.

## Current Limitations (updated)
### Challenges
- Button Blitz, Dual Orbit, and Twin Target implemented
- Precision Run, Combo Master, Trigger Control, Rhythm Combo not yet implemented
- No daily challenges or leaderboards
- No replay/ghost system

### Engine / tooling (iteration 15)
- The production `dist` contains an unused async `pixi-*.js` chunk (~185 kB
  gzip). It is only fetched if a `renderMode: 'pixi'` challenge mounts — no
  production challenge does today, so it never loads at runtime. It will be
  used by the first complex Pixi game.
- The dev-only Pixi showcase (`/play/pixi-demo`) only appears when Vite runs in
  a development mode (`import.meta.env.DEV`). On this machine
  `NODE_ENV=production` is exported globally — start the dev server with
  `NODE_ENV=development npx vite` to see it, and use
  `npm ci --include=dev` after installs that prune devDependencies.
- A physical gamepad connected to the OS is visible to any Chromium instance
  (including the test browser) and can interleave real input with synthetic
  test pads.
