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

### Challenges
- Button Blitz, Dual Orbit, and Twin Target implemented
- Precision Run, Combo Master, Trigger Control, Rhythm Combo not yet implemented
- No daily challenges or leaderboards
- No replay/ghost system

### Persistence
- localStorage only (no cloud sync)
- No export/import of data
- No account system

### Audio
- No sound effects or music implemented
- Web Audio API not yet integrated
- `audioEnabled` setting is a placeholder

### Visuals
- Neon Xbox-first theme with layered gradients, glassy panels, canvas glow and
  decorative gamepad artwork (iteration 9)
- No CRT shader (just a scanline overlay)
- No particle system yet (press feedback is a single expanding glow ring)
- Font loading: JetBrains Mono/Orbitron may not load on all systems

### Accessibility
- WCAG 2.1 AA pass in iteration 9: all text/UI contrast ≥ AA (lowest 5.7:1),
  face buttons / rings / grades carry letters or labels (never colour alone),
  Settings is a focus-trapped modal (Escape closes, focus restored), reduced
  motion and high-contrast honoured (OS media queries + in-app toggles),
  interactive targets ≥ 44x44 px, result announced via an `aria-live` region.
- High-contrast mode keeps the neon glow on primary buttons (cosmetic only;
  borders + text already satisfy contrast) — could be flattened further.
- Colour-vision-deficiency check was reasoned from the palette + mandatory
  letters/labels, not run through an automated CVD simulator.
- Gameplay HUD is drawn as canvas pixels; the DOM result screen mirrors the
  score/grade for assistive tech, but live in-challenge values are not exposed.

### Dependencies
- `react-router-dom` (routing, HashRouter) and `motion` (UI transitions) were
  added in iteration 13; both are client-only and pinned. They grow the bundle
  (~170 KB gzip combined). No game engine was adopted (Canvas 2D retained).

### Testing
- No E2E tests (Playwright not configured for the project)
- No visual regression tests
- Unit tests cover input utils, Dual Orbit scoring, and the game-loop lifecycle/
  timing (33 tests); no App-component render tests or E2E yet

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
3. Implement remaining challenges (Precision Run, Combo Master, Trigger Control, Rhythm Combo)
4. Add Web Audio sound effects (the `audioEnabled` toggle is still a placeholder)
5. Configure Playwright for E2E testing (a throwaway headless-Chromium harness
   with a synthetic gamepad was used to verify iteration 9 manually)
6. Add font loading with fallbacks
7. Implement daily challenge system
8. Add replay recording/playback
9. Consider IndexedDB for larger data storage

## Recently Fixed
- START button did nothing — the canvas container ref was never attached, so the
  engine never initialised (iteration 7)
- Gameplay rendered to a duplicate off-screen canvas (iteration 7)
- Settings dialog overflowed the viewport (iteration 7)
- "NEW PERSONAL BEST!" banner never appeared (iteration 7)
- Dual Orbit challenge implemented (iteration 8)
- Lint is green: `no-case-declarations` and `no-explicit-any` issues resolved (iteration 7)
- Neon UI redesign, background controller art and WCAG 2.1 AA accessibility (iteration 9)
- Full gamepad UI control: the whole app is navigable with the controller
  (iteration 10)
- Dual Stick Rush (Twin Target) challenge implemented (iteration 11)

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
