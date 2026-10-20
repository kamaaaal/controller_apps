/**
 * Test helpers for building `NormalizedInput` snapshots.
 *
 * Keeps the challenge tests short and — more importantly — keeps them honest:
 * a new field on `NormalizedInput` breaks one helper instead of silently
 * drifting out of sync across a dozen test files.
 */

import type { NormalizedInput } from '../types'

export interface InputOverrides {
  leftStick?: { x: number; y: number }
  rightStick?: { x: number; y: number }
  leftTrigger?: number
  rightTrigger?: number
  dpad?: { x: number; y: number }
  buttons?: Partial<NormalizedInput['buttons']>
}

/** A neutral input snapshot with the given overrides applied. */
export function makeInput(overrides: InputOverrides = {}): NormalizedInput {
  const buttons: NormalizedInput['buttons'] = {
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
    ...overrides.buttons,
  }

  return {
    axes: {
      leftStick: overrides.leftStick ?? { x: 0, y: 0 },
      rightStick: overrides.rightStick ?? { x: 0, y: 0 },
      leftTrigger: overrides.leftTrigger ?? 0,
      rightTrigger: overrides.rightTrigger ?? 0,
    },
    dpad: overrides.dpad ?? { x: 0, y: 0 },
    buttons,
    rawAxes: [],
    rawButtons: [],
  }
}

/** A synthetic `Gamepad` with the given buttons held down. */
export function makeGamepad(pressedIndices: number[] = [], id = 'Test Pad'): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: pressedIndices.includes(i),
    touched: pressedIndices.includes(i),
    value: pressedIndices.includes(i) ? 1 : 0,
  }))
  return {
    id,
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  } as unknown as Gamepad
}
