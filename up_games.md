# Game Ideas Backlog — Gamepad Arena

> **Purpose:** the design backlog for Gamepad Arena — challenges that train
> controller muscle memory, precision and problem-solving.
>
> **Status legend:** ✅ shipped · 🛠️ in progress · 📋 planned · 💡 idea only
>
> Every idea below is scoped against the existing engine: a `Challenge` class
> plus an optional pure-logic sibling module (`sequence.ts`, `course.ts`,
> `physics.ts`, …) so the rules can be unit-tested without a canvas.

---

## The design rule

A challenge is only worth adding if it teaches something the others do not.
The six skill pillars the lineup has to cover between them:

| Pillar | What it trains | Games |
|---|---|---|
| **Speed** | Press rate, rhythm | Button Blitz, Rhythm Gate |
| **Memory** | Recall of sequences and layouts | Pattern Lock, Map Recall, Flash Path |
| **Coordination** | Two limbs at once | Dual Orbit, Dual Stick Rush, Mirror Protocol |
| **Precision** | Fine motor control, no overshoot | Balance Beam, Thread the Needle, Pixel Hunt |
| **Rhythm** | Timing against a beat | Echo Drift, Beat Runner |
| **Puzzle** | Rules, deduction, planning | Mirror Protocol, Relay Switch, Circuit Break |

Difficulty should grow by adding a *dimension*, never just by making things
faster. A round that adds a new rule is worth more than a round that halves
the timer.

---

## ✅ Shipped in this iteration

### Pattern Lock — memory + button accuracy ✅
*Simon-style recall on the four face buttons.*

- **Controls:** A / B / X / Y
- **Mechanic:** a sequence of pads lights up (3 notes at the start, growing to
  9). The player reproduces it in order. A wrong pad replays the same pattern
  rather than ending the run — the cost is the broken streak and lost time.
- **Why it works:** it is the cleanest possible test of "can you remember and
  reproduce a short physical sequence".
- **Scoring:** `length × 100 + 50 × length`, scaled by a streak multiplier
  (cap ×2.5). Starting the recall within 700 ms pays an *instant recall*
  bonus — the muscle-memory payoff.
- **Difficulty ramp:** the pattern grows every second cleared pattern, and the
  flash window shrinks as it grows.
- **Files:** `src/challenges/pattern-lock/{pattern.ts,PatternLockChallenge.ts}`

### Mirror Protocol — coordination puzzle ✅
*The left stick is the signal; the right stick must obey the rule.*

- **Controls:** both sticks
- **Mechanic:** each round shows a relation — MATCH, MIRROR, CROSS or FLIP.
  The player must arrange both sticks so the right vector equals the left
  vector transformed by that rule, and hold it steady for 1.1 s to lock the
  checkpoint. Breaking the relation bleeds the hold progress instead of
  wiping it.
- **Why it works:** it is a genuine puzzle about vector relationships, and the
  ghost marker showing where the right stick *should* go teaches the rule.
- **Scoring:** 100 + a speed bonus, scaled by the streak multiplier. The
  required hold grows and the tolerance tightens each round.
- **Files:** `src/challenges/mirror-protocol/{protocol.ts,MirrorProtocolChallenge.ts}`

### Balance Beam — analog fine control ✅
*The only game in the lineup that uses the analog triggers.*

- **Controls:** LT / RT (left stick X as an automatic fallback when the pad
  reports no analog trigger)
- **Mechanic:** the beam follows the trigger through a spring-damper, so a
  light touch produces a small tilt. The ball rolls along it under gravity and
  must be eased onto each orb. Three lives; rolling off the end costs a life.
- **Why it works:** it is the only test of *analog* control in the app — every
  other game is digital or absolute-position.
- **Scoring:** 100 per orb, ×3 for the rare bonus orb, with a combo
  multiplier. Falling off costs 50 points and breaks the combo.
- **Files:** `src/challenges/balance-beam/{beam.ts,BalanceBeamChallenge.ts}`

### Map Recall — spatial memory ✅
*The maze is shown briefly, then hidden.*

- **Controls:** left stick or D-pad
- **Mechanic:** a perfect maze (randomised depth-first spanning tree) is
  shown for 3 s, then the walls become invisible while staying solid. The
  player navigates the remembered route to the goal.
- **Why it works:** the maze is a *perfect* maze, so there is exactly one
  route between any two cells — remembering it is the whole challenge.
- **Scoring:** 150 + 20 per maze, scaled by the streak multiplier. Bumping a
  wall costs 15 points.
- **Difficulty ramp:** the maze grows (5×5 → 9×9) and the preview shortens
  (3 s → 1.2 s) as the run progresses.
- **Files:** `src/challenges/map-recall/{maze.ts,MapRecallChallenge.ts}`

---

## 📋 Next up — recommended order

### Relay Switch 📋
*Coordination puzzle: one cursor holds a switch, the other takes the route.*

- **Controls:** both sticks
- **Mechanic:** a switch on one side opens a gate on the other. The player
  must hold the switch with one cursor while the other threads the gate. The
  gate closes if the switch is released, so the player has to plan the order:
  which gate first, and how long the hold has to last.
- **Why:** it is the "paired switches" mechanic from the original product plan
  (section 4B), still unshipped, and it needs a *plan*, not just reflexes.
- **Scoring:** 120 per gate, ×2 for a clean pass (no wall touch), streak
  multiplier.
- **Implementation note:** reuse the pure-maze/collision helpers from Map
  Recall; the interesting part is a small state machine for
  `switch-held → gate-open → passed`.

### Circuit Break 📋
*Puzzle: route power through a rotating grid.*

- **Controls:** left stick to move a cursor, A to toggle a tile
- **Mechanic:** a grid of tiles carries power from a source to a sink. Some
  tiles rotate each round; the player toggles tiles to complete a path
  before the timer. Level difficulty = grid size + number of rotating tiles.
- **Why:** a real logic puzzle rather than a reflex test, and it uses A (which
  the lineup uses in Pattern Lock) in a completely different way.
- **Implementation note:** a breadth-first check per round to confirm the
  puzzle is still solvable after every rotation — never present an
  unsolvable board.

### Pixel Hunt 📋
*Precision: land a crosshair on a small moving target.*

- **Controls:** right stick for fine aim, left stick to switch to fast aim
- **Mechanic:** a small target drifts across the screen. The left stick moves
  quickly, the right stick moves slowly — the player chooses which to use
  depending on the distance. The target shrinks each round.
- **Why:** it teaches *deliberate* speed switching, which is a real muscle
  memory skill (and a real shooter habit).
- **Implementation note:** a deliberately asymmetric cursor speed (fast ≈ 900
  px/s, slow ≈ 180 px/s) makes the choice meaningful.

---

## 💡 Backlog — muscle memory

### Gesture Trace 💡
*Reproduce a gesture from memory.*

- **Controls:** left stick
- **Mechanic:** a short path is drawn on screen, then hidden. The player
  reproduces it as closely as possible; the score is the path similarity.
- **Why:** the closest thing to "muscle memory" in the purest sense — it
  trains the hand's spatial memory, not the eyes.
- **Implementation note:** score with a per-sample distance metric; draw the
  player's trace and the target trace together at the end for a ghost diff.

### Flash Path 💡
*Recall a route through a lit maze.*

- **Controls:** left stick
- **Mechanic:** a route is lit through a maze for 2 s, then the maze is shown
  unlit. The player must walk the same route. Unlike Map Recall, the *path*
  is memorised, not the layout.
- **Why:** complements Map Recall (layout memory) with route memory.

### Haptic Cadence 💡
*Keep a rhythm through a rumble-free pulse.*

- **Controls:** A on the beat, in time with a visual pulse
- **Mechanic:** a metronome pulse runs; the player taps A on the beat and
  holds the streak. Drifting off the beat resets the streak but not the score.
- **Why:** pure timing, separated from Echo Drift (which is stick-based).

### Muscle Memory Warmup 💡
*A short daily drill.*

- **Controls:** varies
- **Mechanic:** 60 seconds of five micro-drills back to back (10 s each):
  tap cadence, stick precision, pattern recall, trigger sweep, dual-axis
  symmetry. A composite score with a per-drill breakdown.
- **Why:** gives the app a reason to be opened every day, and acts as a
  diagnostic that highlights the player's weakest pillar.

---

## 💡 Backlog — puzzles

### Relay Switch ✅ (see above)

### Lockstep 💡
*Two cursors must move identically.*

- **Controls:** both sticks
- **Mechanic:** a target shape is drawn. The player must keep both cursors
  the same distance apart while moving them around an obstacle field.
- **Why:** the "mirror" idea taken to movement instead of vector algebra.

### Gatekeeper 💡
*Deduce the rule from examples.*

- **Controls:** A to choose, sticks to explore
- **Mechanic:** the game shows a few input→outcome examples, and the player
  must infer the hidden rule (e.g. "press A when the stick is in a corner"),
  then apply it to score.
- **Why:** genuine deduction — the rarest skill in the lineup.
- **Implementation note:** define the rule as a small declarative predicate
  with a fixed answer key, so it is testable and never ambiguous.

### Switchback 💡
*A two-state logic puzzle.*

- **Controls:** A to flip a switch
- **Mechanic:** two switches, two gates, one shared constraint. The player
  must find the combination that opens both gates — and the combination
  *changes* between rounds.
- **Why:** cheap to implement, disproportionately satisfying.

---

## 💡 Backlog — rhythm & precision

### Beat Runner 📋
*A rhythm platformer.*

- **Controls:** left stick to move, A to jump
- **Mechanic:** the character crosses platforms that arrive on the beat.
  Jumping off-beat costs momentum.
- **Why:** the only game in the lineup that would use A for a *repeated*
  physical action rather than a discrete one.

### Trigger Sweep 💡
*Analogue trigger control.*

- **Controls:** LT / RT
- **Mechanic:** a needle must be held inside a moving target band using only
  the analog trigger. The band narrows and moves faster each round.
- **Why:** a pure test of trigger *resolution* — the thing analog sticks give
  you and buttons do not.

### Pixel Perfect 💡
*Precision path following.*

- **Controls:** left stick
- **Mechanic:** follow a thin line without touching the edge; the line
  narrows and gains curves.
- **Why:** a precision test that is about *control*, not speed. Naturally
  extends the Thread the Needle corridor idea.

### Orbit Ladder 💡
*Two-axis symmetry with rotation.*

- **Controls:** both sticks
- **Mechanic:** two rings rotate at different speeds; the player must keep a
  marker aligned between them.
- **Why:** extends Dual Orbit from "rotate both" to "coordinate two
  rotations".

---

## 💡 Backlog — longer-form

### Daily Gauntlet 💡
*One seeded run of five challenges.*

- **Mechanic:** a seeded set of five challenges with a shared timer and a
  single score. Deterministic, so it is comparable across players and
  replayable.
- **Why:** the cheapest retention feature that does not need a backend — the
  seed is the whole content.

### Ghost Chase 💡
*Race a recorded run of yourself.*

- **Mechanic:** record the input summary of a run (timestamps + normalised
  inputs) and replay it as a ghost. A local leaderboard of personal bests.
- **Implementation note:** the existing seeded RNG was built with replay in
  mind — the same seed reproduces the same course.

---

## Adding a challenge — the checklist

1. **Pure logic first.** Put the rules in a sibling module with no renderer
   dependency (`sequence.ts`, `course.ts`, `physics.ts`, `pattern.ts`,
   `protocol.ts`, `beam.ts`, `maze.ts`). Test it hard.
2. **Register it** in `src/challenges/index.ts` and add its duration to
   `TIMING.challengeDurations` in `src/config/timing.ts` — the registry test
   fails if these two drift apart.
3. **Add metadata** to `src/challenges/meta.ts`: difficulty, accent colour,
   cover glyph, skill tags and the pre-run briefing. The metadata map is
   keyed by challenge id, so a missing entry is a compile error.
4. **Draw your own HUD.** Implement `drawHud(renderer, timeRemaining)` rather
   than adding a game id to the host — the play route must never know which
   game it is running.
5. **Use `getMoveVector(input, 'left' | 'right')`** for anything directional so
   the D-pad works as an alternative to the stick, on every controller.
6. **Keep the D-pad honest.** `NormalizedInput.dpad` is a unit vector built
   from the four D-pad buttons *or* from a hat switch on an axis — do not read
   `input.buttons.dpadUp` directly.
7. **Add tests.** The registry contract test, plus unit tests for the pure
   logic module.
