# Iteration 17 — Full-Bleed Library (No Panel, No Scrolling)

**Date:** 2026-10-16

## Summary

With six production games the home grid no longer fit inside the 880px glass
panel and required scrolling. Per user direction the library now drops its
container entirely: content sits directly over the page background and the
drifting controller art — a wide, transparent layout where only the game cards
themselves remain glass tiles.

## Changes

- `src/routes/LibraryPage.tsx` — replaced the `.screen library-screen` panel
  with a transparent `.library` wrapper (scope/gamepad-nav class preserved);
  header compacted to a horizontal logo + title + tagline row; PLAY/SETTINGS
  group tagged `.library-actions`.
- `src/index.css` —
  - `.library`: full-bleed, `max-width: 1240px`, column flex, 12px gaps.
  - `.library-grid`: deterministic `repeat(3, 1fr)` (2 columns ≤1000px,
    1 column ≤640px) instead of fluid auto-fit.
  - Compact tiles: padding 12px, art strip 52px, name 1rem, description 0.78rem
    clamped to 2 lines, pb line 0.72rem — card height ≈190px.
  - `.library-heading .screen-title` 1.45rem inline beside a 64px logo.
- Play/Settings/other `.screen` routes keep the soft-edged glass panels — the
  panel look was only removed from the library, per the request.

## Verification

- Chromium (agent-browser + synthetic pad): production layout (6 cards, no
  connect-note) measures `scrollHeight 633 == clientHeight 633` — **no
  scrolling** at 1280×633; screenshot confirms the full-bleed grid, inline
  header, and visible background art. (Dev-only Pixi Demo card adds a third
  row in dev builds — expected.)
- `npm run test:run` — 137 passed; lint clean; build green.
- Note: with no controller connected the "connect note" appears above the grid
  and may push slight scrolling on short viewports — transient state, and the
  user is otherwise holding a controller.

## Files Modified

- `src/routes/LibraryPage.tsx`
- `src/index.css`
