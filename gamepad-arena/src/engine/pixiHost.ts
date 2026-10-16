/**
 * Lazy PixiJS host (iteration 15).
 *
 * PixiJS is a renderer, not a framework: it does not own the game loop or
 * input, so it slots in beside the existing `GameLoop` / `Challenge`
 * architecture. Crucially the import is dynamic — `pixi.js` stays in its own
 * async chunk and is only fetched when a challenge with `renderMode: 'pixi'`
 * actually mounts. The Canvas 2D games never pay for it.
 *
 * The app is created with `autoStart: false`: the GameLoop calls
 * `app.render()` from the challenge's draw pass, keeping one clock for the
 * whole app.
 */

import type { Application } from 'pixi.js'

export async function createPixiApp(container: HTMLElement): Promise<Application> {
  const { Application } = await import('pixi.js')

  const app = new Application()
  await app.init({
    resizeTo: container,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    autoStart: false,
  })

  // Insert behind the DOM overlays (ui-overlay, countdown, debug) — the shared
  // `.canvas-container canvas` CSS gives it the canvas z-index slot.
  container.insertBefore(app.canvas, container.firstChild)
  return app
}

export function destroyPixiApp(app: Application | null): void {
  app?.destroy(true, { children: true })
}
