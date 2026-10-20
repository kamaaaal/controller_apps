/**
 * Fixed timestep game loop with interpolation
 */

import type { GameState, NormalizedInput } from '../types'
import { TIMING } from '../config/timing'

const TARGET_FPS = 60
const FIXED_DT = 1 / TARGET_FPS
const MAX_SUBSTEPS = 5

type UpdateFn = (dt: number, input: NormalizedInput) => void
type DrawFn = (interpolationAlpha: number) => void
type StateChangeFn = (state: GameState) => void
/**
 * Samples fresh controller state. Called once per rendered frame — before any
 * fixed-timestep updates — so gameplay never runs on a stale snapshot.
 * Returning null keeps the last known input.
 */
type InputProvider = () => NormalizedInput | null

export class GameLoop {
  private state: GameState = 'idle'
  private lastTime = 0
  private accumulator = 0
  private animationFrameId: number | null = null
  private updateFn: UpdateFn | null = null
  private drawFn: DrawFn | null = null
  private onStateChange: StateChangeFn | null = null
  private input: NormalizedInput = this.getEmptyInput()
  private inputProvider: InputProvider | null = null
  private countdownValue: number = TIMING.countdownSeconds
  private countdownTimer = 0
  private challengeDuration = 0
  private challengeTimer = 0

  constructor() {
    // Handle visibility change
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden && this.state === 'running') {
      this.pause()
    }
  }

  private getEmptyInput(): NormalizedInput {
    return {
      axes: {
        leftStick: { x: 0, y: 0 },
        rightStick: { x: 0, y: 0 },
        leftTrigger: 0,
        rightTrigger: 0,
      },
      dpad: { x: 0, y: 0 },
      buttons: {
        a: false,
        b: false,
        x: false,
        y: false,
        lb: false,
        rb: false,
        back: false,
        start: false,
        ls: false,
        rs: false,
        dpadUp: false,
        dpadDown: false,
        dpadLeft: false,
        dpadRight: false,
      },
      rawAxes: [],
      rawButtons: [],
    }
  }

  setUpdateFn(fn: UpdateFn): void {
    this.updateFn = fn
  }

  /**
   * Register the input sampler. It runs once per rendered frame, ahead of the
   * fixed-timestep updates, so a challenge always acts on the freshest
   * controller state (no one-frame input lag).
   */
  setInputProvider(fn: InputProvider): void {
    this.inputProvider = fn
  }

  setDrawFn(fn: DrawFn): void {
    this.drawFn = fn
  }

  setOnStateChange(fn: StateChangeFn): void {
    this.onStateChange = fn
  }

  setInput(input: NormalizedInput): void {
    this.input = input
  }

  startChallenge(duration: number): void {
    this.challengeDuration = duration
    this.challengeTimer = duration
    this.countdownValue = TIMING.countdownSeconds
    this.countdownTimer = TIMING.countdownSeconds
    this.setState('countdown')
  }

  pause(): void {
    if (this.state === 'running' || this.state === 'countdown') {
      this.setState('paused')
    }
  }

  /** End a running challenge early (challenge-driven finish, e.g. both ships
   *  docked). Idempotent from every other state. */
  finish(): void {
    if (this.state === 'running') {
      this.setState('result')
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.setState('running')
    }
  }

  reset(): void {
    this.setState('idle')
    this.challengeTimer = 0
    this.countdownValue = TIMING.countdownSeconds
    this.countdownTimer = 0
  }

  getState(): GameState {
    return this.state
  }

  getCountdownValue(): number {
    return this.countdownValue
  }

  getProgress(): number {
    if (this.challengeDuration <= 0) return 0
    return 1 - this.challengeTimer / this.challengeDuration
  }

  getTimeRemaining(): number {
    return Math.max(0, this.challengeTimer)
  }

  private setState(newState: GameState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }

  start(): void {
    if (this.animationFrameId !== null) return
    this.lastTime = performance.now()
    this.tick()
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  private tick = (): void => {
    const now = performance.now()
    const frameTime = (now - this.lastTime) / 1000
    this.lastTime = now
    this.step(frameTime)
    this.animationFrameId = requestAnimationFrame(this.tick)
  }

  /**
   * Advance the simulation by `frameTime` seconds, running fixed-timestep
   * updates and one render. This is the single integration point the render
   * loop (and tests) drive the loop through — gameplay never advances off the
   * raw frame count. `frameTime` is clamped to [0, 0.25]s to absorb negative
   * clocks and to avoid a spiral-of-death after a long pause or tab-blur.
   */
  step(frameTime: number): void {
    // Sample the controller once per rendered frame, ahead of the simulation,
    // so every fixed step below acts on the same fresh snapshot.
    const sampled = this.inputProvider?.() ?? null
    if (sampled) this.input = sampled

    this.accumulator += Math.min(Math.max(0, frameTime), 0.25)

    let substeps = 0
    while (this.accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
      this.fixedUpdate(FIXED_DT)
      this.accumulator -= FIXED_DT
      substeps++
    }

    // Render with interpolation
    const alpha = this.accumulator / FIXED_DT
    this.drawFn?.(alpha)
  }

  private fixedUpdate(dt: number): void {
    switch (this.state) {
      case 'countdown':
        this.countdownTimer -= dt
        this.countdownValue = Math.ceil(this.countdownTimer)
        if (this.countdownTimer <= 0) {
          this.setState('running')
        }
        break

      case 'running':
        this.challengeTimer -= dt
        this.updateFn?.(dt, this.input)
        if (this.challengeTimer <= 0) {
          this.setState('result')
        }
        break

      case 'paused':
      case 'result':
      case 'idle':
        // No fixed updates in these states
        break
    }
  }

  destroy(): void {
    this.stop()
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }
}