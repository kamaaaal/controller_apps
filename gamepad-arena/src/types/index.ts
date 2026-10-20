/**
 * Core type definitions for Gamepad Arena
 */

import type { Renderer } from '../engine/renderer'

export type GameState = 'idle' | 'countdown' | 'running' | 'paused' | 'result'

export interface NormalizedInput {
  axes: {
    leftStick: { x: number; y: number }
    rightStick: { x: number; y: number }
    leftTrigger: number
    rightTrigger: number
  }
  /**
   * D-pad as a unit vector (8-way), zero when no direction is held.
   *
   * The D-pad is a first-class input: challenges that need directional
   * movement read it through `getMoveVector` (see utils/input.ts) so the pad
   * works as an alternative to either stick instead of being decorative.
   */
  dpad: { x: number; y: number }
  buttons: {
    a: boolean
    b: boolean
    x: boolean
    y: boolean
    lb: boolean
    rb: boolean
    back: boolean
    start: boolean
    ls: boolean
    rs: boolean
    dpadUp: boolean
    dpadDown: boolean
    dpadLeft: boolean
    dpadRight: boolean
  }
  rawAxes: number[]
  rawButtons: GamepadButton[]
}

export interface ChallengeState {
  progress: number // 0-1
  score: number
  metadata: Record<string, unknown>
}

export interface ScoreResult {
  score: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
  details: Record<string, number>
  timestamp: number
}

export interface PersonalBest {
  score: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
  details: Record<string, number>
  timestamp: number
  challengeId: string
}

export interface Challenge {
  id: string
  name: string
  description: string
  duration: number // seconds
  /**
   * Canvas 2D setup — required for `renderMode: 'canvas2d'` challenges.
   *
   * The host hands over the *shared* renderer; a challenge must reuse it
   * rather than constructing its own (a second Renderer means a second
   * canvas/ResizeObserver and a second source of truth for the viewport).
   */
  setup?(renderer: Renderer, gamepad: Gamepad): void
  update(dt: number, input: NormalizedInput): ChallengeState
  /** Canvas 2D draw — required path for `renderMode: 'canvas2d'` challenges. */
  draw?(renderer: Renderer): void
  /**
   * Optional HUD layer drawn after the scene (timer, score, prompt).
   *
   * `timeRemaining` comes from the game loop so every challenge can show a
   * timer without the host special-casing individual game ids.
   */
  drawHud?(renderer: Renderer, timeRemaining: number): void
  getScore(): ScoreResult
  reset(): void
  /**
   * Renderer backend (iteration 15). Defaults to `canvas2d`; `pixi` opts the
   * challenge into the lazily-loaded PixiJS app — pixi.js is only ever fetched
   * when a pixi challenge mounts, never for the Canvas 2D games.
   */
  renderMode?: 'canvas2d' | 'pixi'
  /** Pixi setup; called once with the initialised app (our GameLoop drives
   *  `app.render()`, so Pixi's own ticker stays off). */
  setupPixi?(app: import('pixi.js').Application, gamepad: Gamepad | null): void
  /** Per-frame scene sync for pixi challenges; called right before `app.render()`. */
  drawPixi?(): void
}

export interface GamepadStatus {
  connected: boolean
  gamepad: Gamepad | null
  index: number
}

export interface ButtonMapping {
  a: number
  b: number
  x: number
  y: number
  lb: number
  rb: number
  lt: number
  rt: number
  back: number
  start: number
  ls: number
  rs: number
  dpadUp: number
  dpadDown: number
  dpadLeft: number
  dpadRight: number
}

/** Which raw axes carry the non-stick controls of a controller. */
export interface AxisMapping {
  /** Left stick X axis index (standard layout: 0). */
  leftStickX: number
  /** Left stick Y axis index (standard layout: 1). */
  leftStickY: number
  /** Right stick X axis index (standard layout: 2). */
  rightStickX: number
  /** Right stick Y axis index (standard layout: 3). */
  rightStickY: number
  /** Left trigger axis index (-1 = read the trigger button's value). */
  leftTrigger: number
  /** Right trigger axis index (-1 = read the trigger button's value). */
  rightTrigger: number
  /** Axis index carrying a D-pad hat switch (-1 = the D-pad reports buttons). */
  dpadHat: number
}

/**
 * A D-pad reported as a hat switch on an axis.
 *
 * `up`/`right`/`down`/`left` are the axis values that mean each direction;
 * `rest` is the value the axis reads when the D-pad is released.
 */
export interface HatSpec {
  axis: number
  up: number
  right: number
  down: number
  left: number
  rest: number
}

export interface Settings {
  deadzone: number
  vibration: boolean
  highContrast: boolean
  reducedMotion: boolean
  audioEnabled: boolean
  customMapping?: ButtonMapping
  customAxes?: Partial<AxisMapping>
  customHat?: HatSpec | null
  /**
   * `auto` uses the layout detected for the connected controller;
   * `standard` forces the XInput layout.
   */
  profileMode?: 'auto' | 'standard'
}
