/**
 * Core type definitions for Gamepad Arena
 */

export type GameState = 'idle' | 'countdown' | 'running' | 'paused' | 'result'

export interface NormalizedInput {
  axes: {
    leftStick: { x: number; y: number }
    rightStick: { x: number; y: number }
    leftTrigger: number
    rightTrigger: number
  }
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
  /** Canvas 2D setup — required path for `renderMode: 'canvas2d'` challenges. */
  setup?(ctx: CanvasRenderingContext2D, gamepad: Gamepad): void
  update(dt: number, input: NormalizedInput): ChallengeState
  /** Canvas 2D draw — required path for `renderMode: 'canvas2d'` challenges. */
  draw?(ctx: CanvasRenderingContext2D): void
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

export interface Settings {
  deadzone: number
  vibration: boolean
  highContrast: boolean
  reducedMotion: boolean
  audioEnabled: boolean
  customMapping?: ButtonMapping
}