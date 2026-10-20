import { describe, it, expect, vi } from 'vitest'
import { GameLoop } from './gameLoop'
import { TIMING } from '../config/timing'
import type { GameState, NormalizedInput } from '../types'

const FIXED_DT = 1 / 60

/** Advance the loop deterministically by `seconds`, one fixed step at a time. */
function advance(loop: GameLoop, seconds: number): void {
  const steps = Math.ceil(seconds / FIXED_DT)
  for (let i = 0; i < steps; i++) loop.step(FIXED_DT)
}

/** Collect every state the loop transitions through. */
function track(loop: GameLoop): GameState[] {
  const states: GameState[] = []
  loop.setOnStateChange((s) => states.push(s))
  return states
}

const DURATION = TIMING.challengeDurations['button-blitz'] // 10s

describe('GameLoop lifecycle & timing', () => {
  it('runs idle → countdown → running → result in order', () => {
    const loop = new GameLoop()
    const states = track(loop)
    expect(loop.getState()).toBe('idle')

    loop.startChallenge(DURATION)
    expect(loop.getState()).toBe('countdown')

    advance(loop, TIMING.countdownSeconds + 0.1)
    expect(loop.getState()).toBe('running')

    advance(loop, DURATION + 0.1)
    expect(loop.getState()).toBe('result')

    expect(states).toEqual(['countdown', 'running', 'result'])
    loop.destroy()
  })

  it('fires the game-over (result) transition exactly once', () => {
    const loop = new GameLoop()
    const states = track(loop)
    loop.startChallenge(DURATION)
    // Run well past the end and keep ticking.
    advance(loop, TIMING.countdownSeconds + DURATION + 5)
    expect(states.filter((s) => s === 'result')).toHaveLength(1)
    expect(loop.getState()).toBe('result')
    loop.destroy()
  })

  it('calls the update fn only while running, with the fixed dt', () => {
    const loop = new GameLoop()
    const update = vi.fn()
    loop.setUpdateFn(update)
    loop.startChallenge(DURATION)

    // During countdown: no gameplay updates.
    advance(loop, TIMING.countdownSeconds - 0.5)
    expect(update).not.toHaveBeenCalled()

    // Into running: updates arrive, each with the fixed timestep.
    advance(loop, 1)
    expect(update).toHaveBeenCalled()
    for (const call of update.mock.calls) {
      expect(call[0]).toBeCloseTo(FIXED_DT, 6)
    }
    loop.destroy()
  })

  it('pause freezes the timer; resume continues it', () => {
    const loop = new GameLoop()
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 1) // now running, ~1s elapsed
    const remainingAtPause = loop.getTimeRemaining()

    loop.pause()
    expect(loop.getState()).toBe('paused')
    advance(loop, 2) // time passes while paused
    expect(loop.getTimeRemaining()).toBe(remainingAtPause) // frozen

    loop.resume()
    expect(loop.getState()).toBe('running')
    advance(loop, 1)
    expect(loop.getTimeRemaining()).toBeLessThan(remainingAtPause)
    loop.destroy()
  })

  it('reset returns to idle and clears the timer', () => {
    const loop = new GameLoop()
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 2)
    loop.reset()
    expect(loop.getState()).toBe('idle')
    expect(loop.getTimeRemaining()).toBe(0)
    // No gameplay advances from idle.
    const update = vi.fn()
    loop.setUpdateFn(update)
    advance(loop, 1)
    expect(update).not.toHaveBeenCalled()
    loop.destroy()
  })

  it('restart (startChallenge again) resets timers and re-runs the countdown', () => {
    const loop = new GameLoop()
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 5)
    expect(loop.getTimeRemaining()).toBeLessThan(DURATION)

    const states = track(loop)
    loop.startChallenge(DURATION)
    expect(loop.getState()).toBe('countdown')
    expect(loop.getCountdownValue()).toBe(TIMING.countdownSeconds)
    advance(loop, TIMING.countdownSeconds + 0.1)
    expect(loop.getState()).toBe('running')
    // Timer was reset to ~full (just a couple of frames into the fresh run),
    // not continued from the previous depleted run.
    expect(loop.getTimeRemaining()).toBeGreaterThan(DURATION - 0.3)
    expect(loop.getTimeRemaining()).toBeLessThanOrEqual(DURATION)
    expect(states).toContain('countdown')
    loop.destroy()
  })

  it('clamps a huge frame delta so it cannot skip the whole run in one step', () => {
    const loop = new GameLoop()
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 0.1) // running
    // A 10-minute frame (e.g. after tab-blur) must not blow past the timer.
    loop.step(600)
    expect(loop.getTimeRemaining()).toBeGreaterThan(DURATION - 0.3)
    loop.destroy()
  })

  it('stops ticking and removes its visibility listener on destroy (no leaks)', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const loop = new GameLoop()
    loop.start()
    loop.destroy()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeSpy.mockRestore()
  })
})

describe('GameLoop input isolation', () => {
  it('ignores a null update fn without throwing', () => {
    const loop = new GameLoop()
    loop.startChallenge(DURATION)
    expect(() => advance(loop, TIMING.countdownSeconds + 1)).not.toThrow()
    loop.destroy()
  })

  it('passes the latest input snapshot into the update fn', () => {
    const loop = new GameLoop()
    let seen: NormalizedInput | null = null
    loop.setUpdateFn((_dt, input) => { seen = input })
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 0.1) // running
    const input: NormalizedInput = {
      axes: { leftStick: { x: 1, y: 0 }, rightStick: { x: -1, y: 0 }, leftTrigger: 0, rightTrigger: 0 },
      dpad: { x: 0, y: 0 },
      buttons: { a: true, b: false, x: false, y: false, lb: false, rb: false, back: false, start: false, ls: false, rs: false, dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: false },
      rawAxes: [], rawButtons: [],
    }
    loop.setInput(input)
    advance(loop, 0.1)
    expect(seen).toBe(input)
    loop.destroy()
  })

  it('samples the input provider once per frame, ahead of the simulation', () => {
    const loop = new GameLoop()
    let samples = 0
    const provided: NormalizedInput = {
      axes: { leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, leftTrigger: 0, rightTrigger: 0 },
      dpad: { x: 0, y: 0 },
      buttons: { a: false, b: false, x: false, y: false, lb: false, rb: false, back: false, start: false, ls: false, rs: false, dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: false },
      rawAxes: [], rawButtons: [],
    }
    loop.setInputProvider(() => {
      samples++
      return provided
    })
    let seen: NormalizedInput | null = null
    loop.setUpdateFn((_dt, input) => { seen = input })
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 0.1)

    expect(samples).toBeGreaterThan(0)
    expect(seen).toBe(provided)
    loop.destroy()
  })

  it('keeps the last known input when the provider returns null', () => {
    const loop = new GameLoop()
    loop.setInputProvider(() => null)
    let seen: NormalizedInput | null = null
    loop.setUpdateFn((_dt, input) => { seen = input })
    loop.startChallenge(DURATION)
    advance(loop, TIMING.countdownSeconds + 0.1)
    expect(seen).not.toBeNull()
    loop.destroy()
  })
})
