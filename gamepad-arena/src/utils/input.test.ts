import { describe, it, expect } from 'vitest'
import {
  applyDeadzone,
  normalizeTrigger,
  isButtonPressed,
  normalizeGamepadInput,
  getStickAngle,
  getStickMagnitude,
  getRotationDirection,
  decodeHat,
  detectProfile,
  dpadVector,
  getMoveVector,
  readTriggerAxis,
  resolveProfile,
  type HatSpec,
} from './input'

/** The hat switch layout of the 8BitDo Ultimate 2C Wireless (axis 9). */
const EIGHT_BITDO_HAT: HatSpec = {
  axis: 9,
  up: -1.0,
  right: -0.43,
  down: 0.14,
  left: 0.71,
  rest: -0.145,
}

describe('input utils', () => {
  describe('applyDeadzone', () => {
    it('returns 0 for values within deadzone', () => {
      expect(applyDeadzone(0.1, 0.15)).toBe(0)
      expect(applyDeadzone(-0.1, 0.15)).toBe(0)
    })

    it('rescales values outside deadzone', () => {
      expect(applyDeadzone(0.5, 0.15)).toBeCloseTo(0.4118, 3)
      expect(applyDeadzone(-0.5, 0.15)).toBeCloseTo(-0.4118, 3)
    })

    it('returns 1 for maximum input', () => {
      expect(applyDeadzone(1, 0.15)).toBe(1)
      expect(applyDeadzone(-1, 0.15)).toBe(-1)
    })
  })

  describe('normalizeTrigger', () => {
    it('returns 0 for values below threshold', () => {
      expect(normalizeTrigger(0.05)).toBe(0)
      expect(normalizeTrigger(0.1)).toBe(0)
    })

    it('returns value for values above threshold', () => {
      expect(normalizeTrigger(0.2)).toBe(0.2)
      expect(normalizeTrigger(1)).toBe(1)
    })
  })

  describe('isButtonPressed', () => {
    it('returns true for pressed button', () => {
      expect(isButtonPressed({ pressed: true, value: 0, touched: false })).toBe(true)
    })

    it('returns true for analog button above 0.5', () => {
      expect(isButtonPressed({ pressed: false, value: 0.8, touched: false })).toBe(true)
    })

    it('returns false for unpressed button', () => {
      expect(isButtonPressed({ pressed: false, value: 0, touched: false })).toBe(false)
    })
  })

  describe('normalizeGamepadInput', () => {
    it('normalizes axes and buttons correctly', () => {
      const mockGamepad = {
        id: 'Test Gamepad',
        index: 0,
        connected: true,
        timestamp: performance.now(),
        mapping: 'standard',
        axes: [0.5, -0.5, 0.2, -0.2, 0, 0],
        buttons: Array(17).fill(null).map((_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0, touched: false })),
        vibrationActuator: null as unknown as Gamepad['vibrationActuator'],
      }

      const input = normalizeGamepadInput(mockGamepad as Gamepad, 0.15)
      expect(input.axes.leftStick.x).toBeCloseTo(0.4118, 2)
      expect(input.axes.leftStick.y).toBeCloseTo(-0.4118, 2)
      expect(input.buttons.a).toBe(true)
      expect(input.buttons.b).toBe(false)
    })
  })

  describe('getStickAngle', () => {
    it('returns correct angles', () => {
      expect(getStickAngle(1, 0)).toBe(0) // right
      expect(getStickAngle(0, 1)).toBe(Math.PI / 2) // down
      expect(getStickAngle(-1, 0)).toBe(Math.PI) // left
      expect(getStickAngle(0, -1)).toBe(-Math.PI / 2) // up
    })
  })

  describe('getStickMagnitude', () => {
    it('returns correct magnitude', () => {
      expect(getStickMagnitude(0, 0)).toBe(0)
      expect(getStickMagnitude(1, 0)).toBe(1)
      expect(getStickMagnitude(0.6, 0.8)).toBe(1) // clamped at 1
    })
  })

  describe('getRotationDirection', () => {
    it('detects CW rotation', () => {
      expect(getRotationDirection(0, 0.5)).toBe(1)
    })

    it('detects CCW rotation', () => {
      expect(getRotationDirection(0, -0.5)).toBe(-1)
    })

    it('returns 0 for small changes', () => {
      expect(getRotationDirection(0, 0.05)).toBe(0)
    })
  })

  describe('simultaneous dual-stick input', () => {
    const mkPad = (axes: number[]): Gamepad =>
      ({
        id: 'Test Gamepad',
        index: 0,
        connected: true,
        timestamp: performance.now(),
        mapping: 'standard',
        axes,
        buttons: Array(17).fill(null).map(() => ({ pressed: false, value: 0, touched: false })),
        vibrationActuator: null as unknown as Gamepad['vibrationActuator'],
      }) as Gamepad

    it('reads both sticks at once, each independent of the other', () => {
      // Left pushed up-right, right pushed down-left, in the same frame.
      const input = normalizeGamepadInput(mkPad([0.8, -0.8, -0.8, 0.8]), 0.15)
      expect(input.axes.leftStick.x).toBeGreaterThan(0)
      expect(input.axes.leftStick.y).toBeLessThan(0)
      expect(input.axes.rightStick.x).toBeLessThan(0)
      expect(input.axes.rightStick.y).toBeGreaterThan(0)
      // The two sticks are mirror images, confirming no cross-talk.
      expect(input.axes.leftStick.x).toBeCloseTo(-input.axes.rightStick.x, 6)
      expect(input.axes.leftStick.y).toBeCloseTo(-input.axes.rightStick.y, 6)
    })

    it('applies the deadzone to both sticks independently', () => {
      // Left inside deadzone (drift), right clearly outside.
      const input = normalizeGamepadInput(mkPad([0.1, -0.1, 0.9, 0.0]), 0.15)
      expect(input.axes.leftStick.x).toBe(0)
      expect(input.axes.leftStick.y).toBe(0)
      expect(input.axes.rightStick.x).toBeGreaterThan(0)
    })

    it('does not crash on a malformed/partial gamepad (e.g. mid-disconnect)', () => {
      expect(() => normalizeGamepadInput(mkPad([]), 0.15)).not.toThrow()
      const input = normalizeGamepadInput(mkPad([]), 0.15)
      expect(input.axes.leftStick.x).toBe(0)
      expect(input.axes.rightStick.y).toBe(0)
    })
  })

  describe('decodeHat', () => {
    it('decodes each direction of the hat switch', () => {
      expect(decodeHat(EIGHT_BITDO_HAT.up, EIGHT_BITDO_HAT)).toEqual({ x: 0, y: -1 })
      expect(decodeHat(EIGHT_BITDO_HAT.right, EIGHT_BITDO_HAT)).toEqual({ x: 1, y: 0 })
      expect(decodeHat(EIGHT_BITDO_HAT.down, EIGHT_BITDO_HAT)).toEqual({ x: 0, y: 1 })
      expect(decodeHat(EIGHT_BITDO_HAT.left, EIGHT_BITDO_HAT)).toEqual({ x: -1, y: 0 })
    })

    it('returns null at the rest position', () => {
      expect(decodeHat(EIGHT_BITDO_HAT.rest, EIGHT_BITDO_HAT)).toBeNull()
    })

    it('returns null for a reading far from every anchor', () => {
      expect(decodeHat(1, EIGHT_BITDO_HAT)).toBeNull()
    })

    it('tolerates a small measurement error', () => {
      const nudged = { ...EIGHT_BITDO_HAT, up: EIGHT_BITDO_HAT.up + 0.1 }
      expect(decodeHat(EIGHT_BITDO_HAT.up, nudged)).toEqual({ x: 0, y: -1 })
    })

    it('prefers the rest position over a distant anchor', () => {
      // A reading nearer the rest value must not be reported as a direction.
      const spec = { ...EIGHT_BITDO_HAT, rest: 0 }
      expect(decodeHat(0.02, spec)).toBeNull()
    })

    it('does not mistake a plausible idle reading for DOWN', () => {
      // Some units report the hat's idle position as 0, which is close to the
      // DOWN detent (0.14). It must not read as a direction — otherwise DOWN
      // appears to be stuck on.
      expect(decodeHat(0, EIGHT_BITDO_HAT)).toBeNull()
      expect(decodeHat(-0.05, EIGHT_BITDO_HAT)).toBeNull()
    })

    it('still decodes a real press of each direction', () => {
      expect(decodeHat(0.14, EIGHT_BITDO_HAT)).toEqual({ x: 0, y: 1 })
      expect(decodeHat(0.2, EIGHT_BITDO_HAT)).toEqual({ x: 0, y: 1 })
      expect(decodeHat(0.75, EIGHT_BITDO_HAT)).toEqual({ x: -1, y: 0 })
    })
  })

  describe('readTriggerAxis', () => {
    it('reads a -1…1 axis', () => {
      expect(readTriggerAxis(-1)).toBe(0)
      expect(readTriggerAxis(-0.5)).toBeCloseTo(0.25)
      expect(readTriggerAxis(0)).toBe(0)
      expect(readTriggerAxis(1)).toBe(1)
    })

    it('reads a 0…1 axis', () => {
      expect(readTriggerAxis(0)).toBe(0)
      expect(readTriggerAxis(0.25)).toBe(0.25)
      expect(readTriggerAxis(1)).toBe(1)
    })
  })

  describe('resolveProfile', () => {
    const pad = { id: '8BitDo Ultimate 2C Wireless' } as Gamepad

    it('keeps a trigger on its own axis', () => {
      const profile = resolveProfile(pad, { axes: { leftTrigger: 2, rightTrigger: 3 } })
      expect(profile.axes.leftTrigger).toBe(2)
      expect(profile.axes.rightTrigger).toBe(3)
    })

    it('drops a trigger that points at a stick axis', () => {
      // A trigger reading a stick axis would make the stick "press" the
      // trigger, so the assignment is discarded.
      const profile = resolveProfile(pad, { axes: { leftTrigger: 2, rightStickX: 2 } })
      expect(profile.axes.leftTrigger).toBe(-1)
    })

    it('forces the standard layout on request', () => {
      const profile = resolveProfile(pad, { profileMode: 'standard' })
      expect(profile.buttons.dpadUp).toBe(12)
      expect(profile.axes.rightStickX).toBe(2)
      expect(profile.hat).toBeNull()
    })
  })

  describe('detectProfile', () => {
    it('uses the standard layout for an unknown controller', () => {
      const profile = detectProfile({ id: 'Unknown Pad' } as Gamepad)
      expect(profile.buttons.dpadUp).toBe(12)
      expect(profile.axes.dpadHat).toBe(-1)
      expect(profile.hat).toBeNull()
    })

    it('detects the 8BitDo Ultimate 2C layout', () => {
      const profile = detectProfile({
        id: '8BitDo Ultimate 2C Wireless (Vendor: 2dc8 Product: 301b)',
      } as Gamepad)
      // The face buttons skip index 2 on this pad.
      expect(profile.buttons.a).toBe(0)
      expect(profile.buttons.x).toBe(3)
      expect(profile.buttons.y).toBe(4)
      expect(profile.buttons.start).toBe(11)
      // The triggers come before the right stick: axes 2/3 are the triggers and
      // 4/5 are the right stick.
      expect(profile.axes.leftTrigger).toBe(2)
      expect(profile.axes.rightTrigger).toBe(3)
      expect(profile.axes.rightStickX).toBe(4)
      expect(profile.axes.rightStickY).toBe(5)
      // The D-pad is a hat switch on axis 9.
      expect(profile.axes.dpadHat).toBe(9)
      expect(profile.hat?.axis).toBe(9)
    })
  })

  describe('hat-switch D-pad', () => {
    const mk8BitDo = (axes: number[]): Gamepad =>
      ({
        id: '8BitDo Ultimate 2C Wireless (Vendor: 2dc8 Product: 301b)',
        index: 0,
        connected: true,
        timestamp: performance.now(),
        mapping: 'standard',
        axes,
        buttons: Array(15).fill(null).map(() => ({ pressed: false, value: 0, touched: false })),
        vibrationActuator: null as unknown as Gamepad['vibrationActuator'],
      }) as Gamepad

    it('turns a hat-switch reading into a D-pad direction', () => {
      const axes = Array(10).fill(0)
      axes[9] = EIGHT_BITDO_HAT.up
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15)
      expect(input.dpad).toEqual({ x: 0, y: -1 })
    })

    it('reports no direction when the D-pad is at rest', () => {
      const axes = Array(10).fill(0)
      axes[9] = EIGHT_BITDO_HAT.rest
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15)
      expect(input.dpad).toEqual({ x: 0, y: 0 })
    })

    it('reads the right stick from its own axis on this pad', () => {
      const axes = Array(10).fill(0)
      axes[4] = 0.5 // right stick X
      axes[5] = -0.5 // right stick Y
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15)
      expect(input.axes.rightStick.x).toBeGreaterThan(0)
      expect(input.axes.rightStick.y).toBeLessThan(0)
    })

    it('does not read the right stick as the left trigger', () => {
      // The right stick and the triggers are on different axes; moving the
      // stick must not press a trigger.
      const axes = Array(10).fill(0)
      axes[4] = 1
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15)
      expect(input.axes.rightStick.x).toBeGreaterThan(0)
      expect(input.axes.leftTrigger).toBe(0)
      expect(input.axes.rightTrigger).toBe(0)
    })

    it('reads the sticks from remapped axes', () => {
      const axes = Array(10).fill(0)
      axes[4] = 0.5 // right stick X, on a non-standard axis
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15, {
        axes: { rightStickX: 4 },
      })
      expect(input.axes.rightStick.x).toBeGreaterThan(0)
    })

    it('does not let a trigger read a stick axis', () => {
      // Pointing the left trigger at the right stick's X axis would make the
      // stick appear to press the trigger; the assignment is discarded.
      const axes = Array(10).fill(0)
      axes[2] = 1
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15, {
        axes: { leftTrigger: 2, rightStickX: 2 },
      })
      expect(input.axes.leftTrigger).toBe(0)
    })

    it('lets the D-pad drive movement when the stick is centred', () => {
      const axes = Array(10).fill(0)
      axes[9] = EIGHT_BITDO_HAT.right
      const input = normalizeGamepadInput(mk8BitDo(axes), 0.15)
      expect(getMoveVector(input, 'left')).toEqual({ x: 1, y: 0 })
    })
  })

  describe('dpadVector / getMoveVector', () => {
    it('collapses the D-pad buttons into a unit vector', () => {
      const buttons = {
        a: false, b: false, x: false, y: false, lb: false, rb: false,
        back: false, start: false, ls: false, rs: false,
        dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: true,
      }
      expect(dpadVector(buttons)).toEqual({ x: 1, y: 0 })
    })

    it('is zero when no direction is held', () => {
      const buttons = {
        a: false, b: false, x: false, y: false, lb: false, rb: false,
        back: false, start: false, ls: false, rs: false,
        dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: false,
      }
      expect(dpadVector(buttons)).toEqual({ x: 0, y: 0 })
    })

    it('prefers the stick over the D-pad when the stick is deflected', () => {
      const input = normalizeGamepadInput(
        {
          id: 'Test Pad',
          index: 0,
          connected: true,
          timestamp: 0,
          mapping: 'standard',
          axes: [1, 0, 0, 0],
          buttons: Array(17).fill(null).map(() => ({ pressed: false, value: 0, touched: false })),
          vibrationActuator: null,
        } as unknown as Gamepad,
        0.15
      )
      expect(getMoveVector(input, 'left').x).toBeCloseTo(1)
    })
  })
})
