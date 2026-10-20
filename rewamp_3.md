# Rewamp 3 — Prompt (Home Page: Full Width, Header Type, Gradient & Shadow Rewrite)

> Hand this to a capable agent. Repo root: `/home/ffx/Documents/vibe/controller`.
> The app is `gamepad-arena/` — React 19 + TypeScript + Vite + Canvas 2D + `motion`.
> It has ten challenges, a neon Xbox-first theme, real routes (`/`, `/play/:id`,
> `/settings`), full gamepad UI navigation, and a `spec/` folder that documents
> every change.

You are working in `/home/ffx/Documents/vibe/controller`. The home page (`/`, the
games library) has four concrete complaints. Fix all four at the root, in real
files, without breaking gameplay or the project's checks — then document it in
`spec/`.

The home is a **launcher**, not a marketing page. The player's job in the first
viewport is: read the wordmark, scan the lineup, launch a game. Everything on
this page serves that.

---

## 1. Fonts — the header type is broken because no font ever loads

**This is the root cause of "the header fonts don't look good".** It is not a
styling problem, it is a missing-resource problem.

- `gamepad-arena/index.html` has **no font `<link>` and no `<preload>`**. It is
  13 lines and loads no stylesheet or font file at all.
- `gamepad-arena/public/` contains only `favicon.svg` and `icons.svg`. **No
  font files.**
- `src/index.css:107-108` declares:
  ```css
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --font-ui: 'Orbitron', 'Rajdhani', var(--font-mono);
  ```
  None of those families exist on a typical machine, so **every screen in the
  app — including the `GAMEPAD ARENA` wordmark — renders in the generic
  `monospace` fallback.** The arcade display face the design intends has never
  been on screen. `spec/known-issues.md:58` already logs this as an open issue
  ("Font loading: JetBrains Mono/Orbitron may not load on all systems", future
  fix #5 on line 101).

**Do this:**

- **Self-host the fonts.** Both are SIL Open Font License 1.1, so vendoring the
  `.woff2` files is permitted — add the license/notice alongside them.
  - Display face: **Orbitron** (weights 700, 800) — the wordmark, stat values,
    game names, grade, countdown.
  - Text face: **JetBrains Mono** (weights 400, 500, 700) — body, meta chips,
    labels, HUD, all `font-mono` text.
  - Put the files in `gamepad-arena/public/fonts/` and declare `@font-face` in
    `src/index.css` with `font-display: swap`, `unicode-range`, and
    `size-adjust`/fallback metric overrides on the local fallback so the swap
    does not shift layout.
  - Preload only the two critical `.woff2` files in `index.html`
    (`<link rel="preload" as="font" type="font/woff2" crossorigin>`).
- **Fix the token stacks** so the fallback is deliberate, not accidental:
  ```css
  --font-ui: 'Orbitron', 'Rajdhani', 'Eurostile', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', 'Cascadia Mono',
    'DejaVu Sans Mono', monospace;
  ```
- **Do not add a third family.** Two faces, used with discipline.
- **Use Orbitron only for display.** It is wide and low-contrast at small
  sizes. Card names at 1rem in Orbitron are hard to read — set the card name
  to the mono face at 700 weight, or to Orbitron at ≥1.15rem with positive
  tracking. Pick one and apply it consistently across the card.
- **Give light text on dark a hair more weight and line-height** than you would
  on a light background (Orbitron at 400 is optically thin on near-black).

---

## 2. Full-width layout — the page is capped and the header floats

- `src/index.css:525-533` — `.library { max-width: 1240px; }`. On a 2560px
  ultrawide that leaves ~660px of dead margin on each side. The page is not
  using the screen.
- `src/index.css:178-188` — `.page { padding: var(--space-lg); align-items:
  center; justify-content: center; }` (24px padding, and `.library-page`
  overrides only `align-items`, not the padding).
- `src/index.css:535-539` — `.library-header { justify-content: center; }`. The
  header cluster is centred inside the 1240px box instead of aligning to the
  grid edges, so the title does not sit above the cards it titles. It reads as
  a floating widget, not a page header.
- `src/index.css:1197-1203` — `.library-filters { justify-content: center; }`.
  Same misalignment: the filter row is centred while the grid below it is
  full-bleed.

**Do this:**

- Move the gutter to the page and let the content run edge to edge:
  - `.library-page` → `padding: 0 clamp(16px, 3.5vw, 64px) 60px;`
    (keep the 60px bottom so the last grid row clears the fixed hint chip).
  - `.library` → `width: 100%; max-width: none; margin-inline: auto;` with a
    generous fluid cap (`max-width: min(100%, 2100px)`) so an ultrawide does
    not stretch a card to 600px. Below that cap the page is genuinely
    full-bleed.
- **Align everything to one left edge**: header, filter row and grid must
  share the same start edge. Drop `justify-content: center` on
  `.library-header` and `.library-filters`; use `justify-content: flex-start`
  and put the secondary items to the right with `margin-left: auto`.
- **Re-tier the grid for the wider canvas.** The current `repeat(4, 1fr)` with
  breakpoints at 1100 / 820 / 560 (`src/index.css:566-596`) is tuned for the
  1240px box. Keep the column counts **deterministic** (the spatial focus
  navigation depends on a stable grid — do not switch to `auto-fit`):
  - ≥ 1440px → 5 columns (ten games = exactly two rows)
  - ≥ 1180px → 4 columns
  - ≥ 880px → 3 columns
  - ≥ 620px → 2 columns
  - < 620px → 1 column
- **Nothing should need scrolling at 1440×900 or 1920×1080.** The grid stays the
  only scroll region (`overflow-y: auto`, `align-content: start`), and the
  header + filters + actions must all fit above it.
- Verify the viewport gauntlet: **320, 375, 768, 1024, 1440, 2560**. No
  horizontal scroll at any of them.

---

## 3. Header — rebuild it as a real full-width band

Current markup: `src/routes/LibraryPage.tsx:216-232` (logo, heading stack,
stats strip) and `src/routes/LibraryPage.tsx:315-328` (the PLAY / SETTINGS
buttons in a separate `.library-actions` row at the bottom).

**Specific defects to fix:**

1. **The title and tagline are misaligned.** `.screen-title` sets
   `text-align: center` (`src/index.css:372`) while `.library-tagline` is
   left-aligned inside the same `.library-heading` flex column. The h1 is
   centred in its box, the tagline is flush left — they do not share an edge.
2. **The title is too small to be the page's h1.** `.library-heading
   .screen-title` overrides it to `1.45rem` (`src/index.css:547-550`). It is a
   home-page wordmark, not a panel heading.
3. **The gradient text + glow reads as muddy** — see section 4.
4. **The action buttons are stranded on their own row at the bottom of the
   page**, separated from the header, so the page reads as three disconnected
   bands and the grid loses vertical space to an empty row.

**Target structure** — one band, aligned to the grid, using the full width:

```
┌───────────────────────────────────────────────────────────────────────┐
│ [logo] GAMEPAD ARENA            CHALLENGES  RECORDS     [PLAY][SETTINGS]│
│        Pick a challenge — grab a controller and go.                     │
└───────────────────────────────────────────────────────────────────────┘
[ All ][ Speed ][ Memory ][ Coordination ][ Precision ][ Rhythm ][ Puzzle ]
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│  card  │ │  card  │ │  card  │ │  card  │ │  card  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

- `.library-header` becomes a grid: `grid-template-columns: 1fr auto auto`
  with `align-items: center` — brand block left, stats centre-right, actions
  far right. `gap: clamp(16px, 2vw, 40px)`.
- **Move PLAY and SETTINGS into the header band** (same `.btn` components, same
  `disabled` logic — PLAY stays disabled until a controller is connected). This
  reclaims the bottom row for the grid and gives the page a launcher top bar.
  Below ~880px the header wraps to two rows: brand on row 1, stats + actions
  on row 2.
- **Keep the header band visually distinct from the cards.** A single hairline
  rule or a low-opacity gradient wash under it is enough. It must not become
  another glass box (the project already dropped the library panel in
  iteration 17 on purpose — see `spec/iteration-17-full-bleed-library.md`).
- **Type scale for the header** (use `clamp()` so it is fluid, not fixed):

  | Element | Size | Weight | Tracking | Family |
  |---|---|---|---|---|
  | Wordmark (h1) | `clamp(2rem, 1.3rem + 2.6vw, 3.25rem)` | 800 | `0.06em` | Orbitron |
  | Tagline | `clamp(0.9rem, 0.85rem + 0.3vw, 1.05rem)` | 400 | `0.01em` | mono |
  | Stat value | `clamp(1.35rem, 1.1rem + 0.9vw, 1.85rem)` | 700 | `0.02em` | Orbitron |
  | Stat label | `0.68rem` | 500 | `0.16em` | mono |

  - Line-height 1.0–1.1 on the wordmark, 1.4–1.5 on the tagline.
  - Tagline measure: max 46ch. It is a bridge line, not a paragraph.
  - **Exactly three hierarchy levels in the header** — wordmark (hook), tagline
    (bridge), stat labels (detail). Nothing else.
  - `.library-stats` currently right-aligns inside a flex column
    (`src/index.css:1245-1249`); with the new band it should read left-to-right
    as a pair, separated from the brand by the layout, not by a left border
    rule.
- **The wordmark must be the only display-size element.** The stat values are
  display face but must not compete — they sit one step down.
- The `<h1>` must stay a real `<h1>` (it is the page's only one), the tagline
  a `<p>`, the stat numbers real text with an accessible label (the current
  `aria-label` on `.library-stats` is good — keep it).

---

## 4. Gradient + shadow — rewrite the treatment

This is the "gradient plus shadow doesn't seem good" complaint. The current
design stacks a neon gradient, a glow filter and a masked radial fill on the
same element, and the result is a soft greenish smear rather than a designed
surface. Specific problems:

1. **`.screen-title` is a gradient-clipped headline** (`src/index.css:369-381`):
   ```css
   background: linear-gradient(135deg, var(--brand-xbox-neon), var(--brand-ps));
   -webkit-background-clip: text;
   -webkit-text-fill-color: transparent;
   filter: drop-shadow(0 0 14px var(--glow-xbox-soft));
   ```
   - Green→blue across 13 characters reads as a rainbow smear, not a wordmark.
   - The `drop-shadow` glow on gradient-clipped text fills the counters and
     softens the letterforms. The thin strokes look smeared.
   - `-webkit-text-fill-color: transparent` is **invisible in Windows High
     Contrast**: the `@media (forced-colors: active)` block
     (`src/index.css:1827-1864`) and the `.high-contrast` block
     (`src/index.css:1759-1776`) reset backgrounds, masks and filters but
     **never reset `text-fill-color`**, so the H1 disappears entirely in those
     modes. That is a live accessibility bug, not a hypothetical.
2. **The card's radial mask fades its own text.** `src/index.css:602-621`:
   ```css
   -webkit-mask-image: radial-gradient(115% 115% at 50% 50%, #000 55%, rgba(0,0,0,0) 100%);
   ```
   The mask applies to the **whole element**, including the description, the
   meta chips and the PB line sitting in the 12px padding. At the card's edges
   the mask alpha is roughly 45–50%, so **edge text is rendered translucent and
   loses contrast** — the description and the bottom PB line visibly fade out.
   The mask was meant to soften the tile's edge, not the words on it.
3. **Hover/selected use `filter: drop-shadow()`** (`src/index.css:623-636`),
   which follows the mask's alpha, so the glow fades with the edge instead of
   forming a clean halo.
4. **`.screen` stacks two drop-shadows plus a neon halo**
   (`src/index.css:342-367`) — a `0 26px 46px` black shadow plus a
   `0 0 34px` green halo. The green halo is the weak, smudgy part.
5. **`--bg-layers` (`src/index.css:101-104`) adds two large radial washes on
   top of a linear base**, and the card gradients sit on top of that. Three
   layers of low-contrast green fog compound into mud.

**Do this:**

- **Build a small, explicit shadow scale** and use it everywhere. Two
  components max per shadow (ambient + key), no neon halo:
  ```css
  --shadow-1: 0 1px 2px rgba(0,0,0,.45);
  --shadow-2: 0 16px 36px -14px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.4);
  --shadow-3: 0 32px 80px -20px rgba(0,0,0,.8), 0 6px 18px rgba(0,0,0,.45);
  --surface-highlight: inset 0 1px 0 rgba(255,255,255,.06);
  ```
  - Cards → `--shadow-1`, raised/hover → `--shadow-2`, overlays/modals →
    `--shadow-3`.
  - **Glow is reserved** for the focus ring, the selected card and the primary
    button. It is a state signal, not a surface decoration.
- **Drop `background-clip: text` from the wordmark.** Use solid colour: the
  wordmark in `--fg-primary`, with one accent word (e.g. `ARENA`) in
  `--brand-xbox-neon`. No `filter` glow on it. If a gradient is used at all it
  must be a **single-hue** wash at ≥ 2rem, not a two-hue sweep — and it must
  still pass contrast against the page background.
- **Reset the fill colour in the accessibility modes** regardless:
  ```css
  .high-contrast .screen-title,
  .high-contrast .library-title { -webkit-text-fill-color: currentColor; color: var(--fg-primary); }
  @media (forced-colors: active) { .screen-title { -webkit-text-fill-color: currentColor; } }
  ```
- **Fix the card mask without fading the text.** Move the masked gradient onto a
  background layer and keep the element's own content unmasked:
  ```css
  .game-card { position: relative; /* …no mask, no filter on the element… */ }
  .game-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: <the gradient>;
    -webkit-mask-image: radial-gradient(115% 115% at 50% 50%, #000 55%, rgba(0,0,0,0) 100%);
    mask-image: radial-gradient(115% 115% at 50% 50%, #000 55%, rgba(0,0,0,0) 100%);
    z-index: 0;
    pointer-events: none;
  }
  .game-card > * { position: relative; z-index: 1; }
  ```
  The card's soft dissolving edge is preserved; **the words are no longer
  inside the mask.** Hover/selected glow moves to `box-shadow` on the card, not
  to a `filter` on a masked element.
- **Simplify the page background.** One base colour plus **one** directional
  wash, not three overlapping gradients. The decorative controller art already
  provides the depth — the background should not compete with it.
- **Reduce the card's own gradient complexity**: the card currently has a
  radial white sheen + a linear tint + a radial accent wash in the art strip +
  the page's own washes. Keep the card fill to **one** gradient plus the
  per-card accent tint, and let the accent live in the glyph/art strip, not in
  the whole tile.
- **The per-card accent colours are a genuine asset** (`src/challenges/meta.ts`
  gives each challenge an `accent` + `accentSoft`). Use them deliberately:
  accent on the glyph, the focus ring and the PB line; keep the tile body
  neutral so ten different-coloured tiles do not become confetti.

---

## 5. Accessibility — the floor, not a checkbox

The project targets WCAG 2.1 AA (`spec/known-issues.md:60-72`). This rework
must not regress it:

- Body text ≥ 4.5:1, large text and UI ≥ 3:1, measured against the **actual
  composited background** (a card over a page wash over the base — check the
  real stack, not the token in isolation).
- **Never colour alone**: accent tinting must not be the only signal of
  selection. The selected card needs a visible ring or a non-colour marker
  too, and the face-button colours (A green / B red) must keep their letters.
- **`forced-colors` / `prefers-contrast: more` / `.high-contrast`:** the
  existing fallback blocks (`src/index.css:1750-1864`) must be extended to
  cover every new surface and the `text-fill-color` bug above. Glass
  surfaces must keep their contrast without relying on blur.
- **No `backdrop-filter` without a fallback.** The
  `@supports not (backdrop-filter: blur(1px))` block (`src/index.css:1803-1824`)
  must include every new surface.
- `prefers-reduced-motion` and the in-app `.reduced-motion` toggle must
  disable any new motion (including the existing `.bg-art` drift).
- Focus ring: 3px, 2px offset, `:focus-visible`, never removed. The
  `.gamepad-nav :focus` override (`src/index.css:1880-1883`) must still paint a
  ring, because programmatic `focus()` is not always reported as
  `:focus-visible`.
- Interactive targets ≥ 44×44px — including the header buttons at their new
  position.
- **Gamepad navigation must keep working.** The library uses **spatial**
  navigation (not `linearVertical`) — see
  `src/hooks/usePageNavigation.ts` and `src/utils/focusNavigation.ts`. Moving
  PLAY/SETTINGS into the header changes the geometry, so verify:
  - Up from the top card row lands on the header controls, not off-screen.
  - Down from the header lands on the grid, and **down from the last row
    reaches the bottom control, not nothing**.
  - Auto-focus still resolves to `.game-card.selected` on route entry
    (`selectedSelector` in `src/routes/LibraryPage.tsx:182`).
  - **☰ (Start) still launches the selected game**; **A** on PLAY launches it;
    **B** stays a no-op (the library is the root route).
  - The focus candidate matching is by **box span overlap**, not centre
    distance — do not regress it (see `spec/known-issues.md`, iteration 18).
- **Keyboard:** Tab order follows DOM order, Enter/Space opens a card, the
  filter chips and header buttons are reachable.

---

## 6. Guardrails

- Do **not** change gameplay, scoring, timers, the engine, the `Challenge`
  interface, the canvas renderer, or the canvas palette. This is a presentation
  pass on the home page (plus the shared type/shadow tokens it needs).
- Do not add a new route, a new challenge, a marketing hero, a carousel, a
  feature-tour overlay, or a testimonial strip. The home is a launcher.
- Do not reintroduce a container panel around the library — iteration 17
  removed it deliberately and the user has asked for width, not a bigger box.
- Do not add a third font family.
- Keep the decorative `.bg-art` controller artwork and the stick parallax — it
  is working and the user likes it. If the header band changes the art's
  relationship to the content, adjust its positions/opacity, not its concept.
- Keep `npm run build`, `npm run test:run` (currently 251 passing) and
  `npm run lint` (`--max-warnings 0`) all green. Add tests only for genuinely
  new pure logic (e.g. a helper that maps viewport width → column count);
  otherwise do not add tests for CSS.
- Use `clamp()`, `min()`, `max()` and logical properties
  (`margin-inline`, `padding-block`, `inset-inline`) rather than hard-coded
  left/right values.

---

## 7. Verification (required — do not claim a fix you have not seen)

Verify in a real browser. `/usr/bin/chromium-browser` is available; install the
`agent-browser` CLI into a writable prefix
(`npm i -g agent-browser --prefix ~/.local/npm-global`). Inject a synthetic
gamepad by overriding `navigator.getGamepads` (axes/buttons objects) to drive
the library navigation. **Clean up every process you start** (dev server,
browser).

Screenshot and check, at each of **320, 768, 1440 and 2560 px wide**:

1. **The fonts actually load.** After `document.fonts.ready`, assert
   `document.fonts.check('800 3rem Orbitron')` and
   `document.fonts.check('700 1rem "JetBrains Mono"')` are both `true`, and
   confirm the computed `font-family` on `.screen-title` is not resolving to a
   generic fallback. A screenshot with a real wordmark is the evidence.
2. **No horizontal scroll:** `document.documentElement.scrollWidth ===
   document.documentElement.clientWidth`.
3. **The library uses the width:** measure `.library`'s bounding box against
   the viewport at 2560px and confirm the gutter is the clamp value, not a
   centred 1240px column.
4. **Nothing is cut off at 1440×900:** the header, the filter row and the
   grid's first two rows are visible without scrolling; the last grid row
   clears the fixed hint chip.
5. **No faded text:** inspect a card in the DOM and confirm the description and
   PB line are not inside a masked/faded element — the mask must live on a
   pseudo-element background layer. Sample the rendered pixels of the
   description text against its card background if you can.
6. **The wordmark is visible in every accessibility mode:** screenshot with
   `forced-colors: active` emulation and with the in-app high-contrast toggle
   on, and confirm the h1 is readable in both.
7. **Contrast:** report the measured ratio for the tagline, the stat labels,
   the card description and the meta chips against their real backgrounds.
8. **Gamepad navigation:** drive the library with the synthetic pad —
   Up from the top row reaches the header, Down returns to the grid, A on a
   card opens the game, ☰ launches the selected game, B does nothing on `/`.
   Screenshot the focus ring.

---

## 8. Spec documentation (required)

This project documents every change in
`/home/ffx/Documents/vibe/controller/spec/`. Follow the existing
`iteration-NN-*.md` style (Date, Summary, per-area detail, Files
Created/Modified, Verification).

- Add **`spec/iteration-19-homepage-full-width-header-type.md`** covering:
  the font loading fix (which files, which weights, the token stacks, the
  fallback metrics), the full-width layout change (gutters, max-width, the new
  column tiers), the header rebuild (new structure, the type scale table, the
  action-button move), the gradient/shadow rewrite (the new shadow tokens, the
  card mask fix, the removed `background-clip: text`, the simplified page
  background), and the accessibility verification (contrast ratios, the
  `forced-colors` / `text-fill-color` fix, the reduced-motion check).
- Update **`spec/EXECUTABLE_PLAN.md`**: add the iteration-19 entry to the
  iteration index (after the iteration-18 line) and tick any relevant Phase
  5.1 (UI/UX) items.
- Update **`spec/known-issues.md`**:
  - Close the font-loading issue (currently line 58, "Font loading:
    JetBrains Mono/Orbitron may not load on all systems") and remove/retick
    future fix #5 ("Add font loading with fallbacks", currently line 101).
  - Add the `forced-colors` gradient-title bug to **Recently Fixed**.
  - Note any remaining limitations of the new layout (e.g. if a viewport still
    needs the grid to scroll).
- Record the exact files touched and the verification commands/results.

Deliver a home page that uses the full width, a header that reads as a designed
launcher band with a real display typeface, a gradient/shadow treatment that
is deliberate instead of muddy, WCAG 2.1 AA intact, gamepad navigation
unbroken, and a complete `spec/` write-up — with build, tests and lint all
green.
