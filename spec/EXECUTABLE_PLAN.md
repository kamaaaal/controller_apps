# Gamepad Arena — Executable Implementation Plan

> **Source:** gamepad-arena-plan.md  
> **Stack:** React + TypeScript + Vite + Canvas 2D  
> **Target:** Browser MVP with local persistence first  
> **First Challenge:** Button Blitz (fastest to prototype) → Dual Orbit

---

## Phase 0: Project Setup (Day 0)

### 0.1 Initialize Vite + React + TypeScript Project
- [x] `npm create vite@latest gamepad-arena -- --template react-ts`
- [x] `cd gamepad-arena && npm install`
- [x] Add ESLint, Prettier, Vitest
- [x] Configure `tsconfig.json` strict mode
- [x] Add Canvas 2D rendering setup

### 0.2 Project Structure
```
gamepad-arena/
├── src/
│   ├── components/       # React components
│   ├── hooks/            # Custom hooks (useGamepad, etc.)
│   ├── challenges/       # Challenge implementations
│   │   ├── button-blitz/
│   │   └── dual-orbit/
│   ├── engine/           # Core game loop, renderer, input
│   ├── store/            # State management (localStorage)
│   ├── types/            # TypeScript types
│   ├── utils/            # Helpers (deadzone, normalization)
│   └── styles/           # CSS/Theme
├── public/
└── spec/                 # This folder - all iterations documented here
```

### 0.3 Arcade Visual Theme
- [x] Dark background, neon accents (cyan/magenta/green)
- [x] CRT scanline overlay (optional)
- [x] Monospace font for scores/timers
- [x] Responsive: mobile (touch fallback), desktop, landscape

---

## Phase 1: Input Foundation (Day 1)

### 1.1 Gamepad Detection Hook (`useGamepad`)
- [x] `navigator.getGamepads()` polling loop (rAF)
- [x] Connection/disconnection events
- [x] Support multiple gamepads (index 0 primary)
- [x] Expose: `gamepad`, `connected`, `index`

### 1.2 Input Normalization (`src/utils/input.ts`)
- [x] Axes: `[-1, 1]` with deadzone (configurable, default 0.15)
- [x] Buttons: `pressed` (boolean), `value` (0-1 for triggers)
- [x] Triggers: separate left/right (indices 6/7 standard)
- [x] Button mapping: standard layout (A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Back=8, Start=9, LS=10, RS=11, Up=12, Down=13, Left=14, Right=15)
- [x] Handle non-standard mappings gracefully

### 1.3 Developer Diagnostics Overlay (Dev Only)
- [x] Show raw axes, buttons, triggers
- [x] Visual stick vectors
- [x] Toggle with `~` key or query param `?debug=1`

---

## Phase 2: Core Engine (Day 1-2)

### 2.1 Game Loop (`src/engine/gameLoop.ts`)
- [x] Fixed timestep (60Hz) with interpolation
- [x] States: `idle` | `countdown` | `running` | `paused` | `result`
- [x] Pause on tab blur, resume on focus

### 2.2 Canvas Renderer (`src/engine/renderer.ts`)
- [x] Single `<canvas>` full viewport
- [x] High-DPI support (`devicePixelRatio`)
- [x] Clear + draw each frame
- [x] Arcadish primitives: circles, arcs, text, particles

### 2.3 Challenge Interface (`src/challenges/types.ts`)
```typescript
interface Challenge {
  id: string;
  name: string;
  description: string;
  duration: number; // seconds
  setup(ctx: CanvasContext, gamepad: Gamepad): void;
  update(dt: number, input: NormalizedInput): ChallengeState;
  draw(ctx: CanvasContext): void;
  getScore(): ScoreResult;
}
```

---

## Phase 3: Challenge 1 — Button Blitz (Day 2-3)

### 3.1 Rules
- **Target:** Press target button (A) as many times as possible in 10s
- **Anti-cheat:** Minimum release threshold (button must go up before next press counts)
- **Scoring:** Valid presses × 100, bonus for rhythm (consistent timing)
- **Feedback:** Visual flash on press, combo counter, final grade (S/A/B/C/D/F)

### 3.2 Implementation
- [x] `ButtonBlitzChallenge` class implementing `Challenge`
- [x] Countdown: 3-2-1-GO (visual + audio beep)
- [x] Timer bar + large center counter
- [x] Press detection with debounce
- [x] Rhythm bonus calculation (std deviation of intervals)
- [x] Result screen: score, presses/sec, grade, personal best

### 3.3 Local Persistence
- [x] `localStorage` key: `gamepad-arena:pb:button-blitz`
- [x] Store: `{ score, presses, timestamp, grade }`
- [x] Show PB on result screen

---

## Phase 4: Challenge 2 — Dual Orbit (Day 3-5)

### 4.1 Rules
- **Target:** Rotate both sticks in opposite directions (CW + CCW) simultaneously
- **Duration:** 15 seconds
- **Scoring:** Degrees completed × accuracy multiplier
- **Accuracy:** Deviation from perfect circle + phase difference

### 4.2 Implementation
- [x] `DualOrbitChallenge` class
- [x] Stick angle tracking (atan2 + unwrap via `angleDiff`)
- [x] Direction detection (CW/CCW)
- [x] Phase tracking (both sticks moving opposite)
- [x] Visual: two orbit rings with progress arcs
- [x] Scoring formula: completion + simultaneity + smoothness + speed (see `iteration-08-dual-orbit.md`)

---

## Phase 5: Polish & Playtest (Day 5-6)

### 5.1 UI/UX
- [x] Main menu: challenge selector
- [x] Controller connection screen
- [x] Settings: deadzone, vibration (if supported)
- [x] Keyboard fallback for testing (Space = A, Enter = Start, Escape = menu)
- [x] Neon Xbox-first visual redesign + background controller art (iteration 9)
- [x] Frosted-glass UI, React Router routes + games-library launcher, motion transitions (iteration 13)
- [x] Button Blitz visible timer; controller hint as bottom glass chip (iteration 13)

### 5.2 Audio
- [ ] Web Audio API: beeps, press sounds, success/fail stings
- [x] Mute toggle (audioEnabled setting)

### 5.3 Accessibility
- [x] High contrast mode
- [x] Reduced motion
- [x] Screen reader announcements for scores
- [x] WCAG 2.1 AA pass: contrast, never-colour-alone, modal focus trap, 44px targets (iteration 9)

### 5.4 Testing Checklist
- [ ] Xbox controller (Chrome/Firefox/Safari)
- [ ] PS4/PS5 controller
- [ ] Switch Pro controller
- [x] Disconnect/reconnect mid-game
- [x] Tab focus loss/restore
- [ ] Multiple gamepads connected

---

## Phase 6: Spec Documentation (Ongoing)

Each iteration creates a file in `spec/`:
- `spec/iteration-01-setup.md` — Project init, config
- `spec/iteration-02-input-foundation.md` — Gamepad hook, normalization
- `spec/iteration-03-engine.md` — Game loop, renderer
- `spec/iteration-04-button-blitz.md` — First challenge
- `spec/iteration-05-fixes.md` — Bug fixes & controller compatibility
- `spec/iteration-06-button-mapping.md` — Flexible button mapping & 8BitDo support
- `spec/iteration-07-startup-fixes.md` — Engine init, rendering, layout & result-screen fixes
- `spec/iteration-08-dual-orbit.md` — Second challenge (Dual Orbit)
- `spec/iteration-09-neon-ui-accessibility.md` — Neon UI redesign + accessibility
- `spec/iteration-10-gamepad-ui-navigation.md` — Gamepad-driven UI navigation
- `spec/iteration-10-timing-config-tests.md` — Central timing config, testable loop, lifecycle tests
- `spec/iteration-11-dual-stick-rush.md` — Twin Target (Dual Stick Rush) challenge
- `spec/iteration-12-twin-target-theming.md` — Twin Target theme & convention reconciliation
- `spec/iteration-13-glass-routing-motion.md` — Glass UI, React Router, Motion & input fixes (Rewamp 2)
- `spec/known-issues.md` — Browser/controller quirks

---

## Success Criteria for MVP

| Metric | Target |
|--------|--------|
| First meaningful interaction | < 5 seconds (connect → play) |
| Button Blitz replay rate | > 50% play again immediately |
| Dual Orbit completion rate | > 30% get grade C or better |
| No crashes on disconnect | 100% handled gracefully |
| localStorage persistence | Survives browser close/reopen |

---

## Next Steps After MVP

1. **Daily Challenge** — Rotating challenge + seed, local leaderboard
2. **Accounts/Backend** — Supabase/Firebase for sync + global leaderboards
3. **More Challenges** — Trigger Control, Stick Precision, Sequence Memory
4. **Replay System** — Record/playback inputs for verification
5. **Tournament Mode** — Bracket duels (WebRTC or backend)