/**
 * Gamepad input normalization, deadzone handling and per-device profiles.
 *
 * Controllers are not consistent: button indices, axis indices and even the
 * way a D-pad is reported all vary. The standard layout (a 0, b 1, x 2,
 * y 3, d-pad 12-15, right stick on axes 2/3) is only a default.
 *
 * A `ControllerProfile` describes one device: which raw button index carries
 * each logical control, which axes carry the sticks and triggers, and — for
 * pads that report the D-pad as a hat switch — the axis values that mean each
 * direction.
 */

import type { NormalizedInput, ButtonMapping, AxisMapping, HatSpec } from '../types'
export type { ButtonMapping, AxisMapping, HatSpec }

// Standard gamepad button indices (XInput layout)
export const BUTTON_INDEX = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  LS: 10,
  RS: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  // 16+ vendor specific
} as const

// Standard gamepad axis indices
export const AXIS_INDEX = {
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
  RIGHT_STICK_X: 2,
  RIGHT_STICK_Y: 3,
  // LT/RT sometimes on axes 4/5 on some browsers
} as const

const DEFAULT_DEADZONE = 0.15
const TRIGGER_THRESHOLD = 0.1

/**
 * Default button mapping (standard XInput layout)
 */
export const DEFAULT_BUTTON_MAPPING: ButtonMapping = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  ls: 10,
  rs: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
}

/** Which raw axes carry the non-stick controls. */
export const DEFAULT_AXIS_MAPPING: AxisMapping = {
  leftStickX: AXIS_INDEX.LEFT_STICK_X,
  leftStickY: AXIS_INDEX.LEFT_STICK_Y,
  rightStickX: AXIS_INDEX.RIGHT_STICK_X,
  rightStickY: AXIS_INDEX.RIGHT_STICK_Y,
  leftTrigger: -1,
  rightTrigger: -1,
  dpadHat: -1,
}

/** Everything needed to read one controller. */
export interface ControllerProfile {
  buttons: ButtonMapping
  axes: AxisMapping
  hat: HatSpec | null
}

/** User overrides applied on top of the detected profile. */
export interface ControllerOverrides {
  buttons?: ButtonMapping
  axes?: Partial<AxisMapping>
  /** `null` explicitly disables a detected hat switch. */
  hat?: HatSpec | null
  /** Which layout to use: the detected one, or the standard XInput layout. */
  profileMode?: ProfileMode
}

/**
 * Which layout to use.
 *
 * `auto` uses the profile detected from the controller id. `standard` forces
 * the XInput layout — the escape hatch for a controller the detection tables
 * get wrong.
 */
export type ProfileMode = 'auto' | 'standard'

/**
 * How close (in axis units) a reading must be to an anchor to count as it.
 *
 * This has to be tight. A hat switch's idle position can sit *between* two
 * directions, and a loose tolerance would let the idle reading be mistaken
 * for a direction — which shows up as one arrow (usually DOWN) appearing to
 * be stuck on. A tight tolerance means only a real press decodes, and the
 * calibration wizard pins the exact values for the player's controller.
 */
export const HAT_TOLERANCE = 0.12

/**
 * Known controller profiles.
 *
 * The 8BitDo Ultimate 2C Wireless reports a completely non-standard layout:
 * the D-pad is a hat switch on axis 9, the right stick's Y axis is axis 5
 * (not 3), the triggers are axes 3/4, and the face buttons skip index 2.
 */
export const KNOWN_PROFILES: Record<string, ControllerProfile> = {
  '8bitdo ultimate 2c wireless': {
    buttons: {
      a: 0,
      b: 1,
      x: 3,
      y: 4,
      lb: 6,
      rb: 7,
      lt: 8,
      rt: 9,
      back: 10,
      start: 11,
      ls: 13,
      rs: 14,
      // The D-pad is a hat switch, not four buttons.
      dpadUp: -1,
      dpadDown: -1,
      dpadLeft: -1,
      dpadRight: -1,
    },
    axes: {
      leftStickX: 0,
      leftStickY: 1,
      // The sticks and the triggers are interleaved on this pad, and the
      // triggers come *before* the right stick: axes 2/3 are the two analog
      // triggers and 4/5 are the right stick. (A published reverse-engineering
      // of this controller lists 2 as the right stick X and 3/4 as the
      // triggers; on the real unit that swap makes the right stick read the
      // left trigger.)
      rightStickX: 4,
      rightStickY: 5,
      leftTrigger: 2,
      rightTrigger: 3,
      dpadHat: 9,
    },
    hat: {
      axis: 9,
      up: -1.0,
      right: -0.43,
      down: 0.14,
      left: 0.71,
      // The idle position sits between the UP and RIGHT detents. If the
      // controller reports a different idle value, the D-pad calibration
      // wizard captures the real one.
      rest: -0.145,
    },
  },
}

/**
 * Apply deadzone to a single axis value
 */
export function applyDeadzone(value: number, deadzone: number = DEFAULT_DEADZONE): number {
  if (Math.abs(value) < deadzone) return 0
  const sign = value > 0 ? 1 : -1
  return sign * (Math.abs(value) - deadzone) / (1 - deadzone)
}

/**
 * Normalize trigger value (0-1)
 */
export function normalizeTrigger(value: number): number {
  return value > TRIGGER_THRESHOLD ? value : 0
}

/**
 * Check if button is pressed (handles both digital and analog buttons)
 */
export function isButtonPressed(button: GamepadButton): boolean {
  return button.pressed || button.value > 0.5
}

/**
 * Decode a hat-switch axis reading into a direction.
 *
 * Returns null when the reading does not clearly mean any direction (i.e.
 * the D-pad is at rest). Screen convention: +x is RIGHT, +y is DOWN.
 */
export function decodeHat(value: number, spec: HatSpec): { x: number; y: number } | null {
  const distance = (anchor: number) => Math.abs(value - anchor)
  const candidates: Array<{ dir: { x: number; y: number }; d: number }> = [
    { dir: { x: 0, y: -1 }, d: distance(spec.up) },
    { dir: { x: 1, y: 0 }, d: distance(spec.right) },
    { dir: { x:  0, y: 1 }, d: distance(spec.down) },
    { dir: { x: -1, y: 0 }, d: distance(spec.left) },
  ].sort((a, b) => a.d - b.d)

  const best = candidates[0]
  if (best.d > HAT_TOLERANCE) return null
  // A reading closer to the rest position than to any direction is "released".
  if (best.d >= distance(spec.rest)) return null
  return best.dir
}

/**
 * Collapse the four D-pad buttons into a single 8-way unit vector.
 *
 * Screen convention matches the analog sticks: +y is DOWN, +x is RIGHT.
 * Returns `{ x: 0, y: 0 }` when no direction is held.
 */
export function dpadVector(buttons: NormalizedInput['buttons']): { x: number; y: number } {
  const up = buttons.dpadUp ? 1 : 0
  const down = buttons.dpadDown ? 1 : 0
  const left = buttons.dpadLeft ? 1 : 0
  const right = buttons.dpadRight ? 1 : 0

  if (up === 0 && down === 0 && left === 0 && right === 0) return { x: 0, y: 0 }

  const x = right - left
  const y = down - up
  const length = Math.hypot(x, y)
  return { x: x / length, y: y / length }
}

/**
 * Directional input for a hand: the analog stick when it is deflected, the
 * D-pad otherwise.
 *
 * This is what makes the D-pad a usable alternative to either stick in every
 * directional challenge instead of a control that only works in menus.
 */
export function getMoveVector(
  input: NormalizedInput,
  hand: 'left' | 'right'
): { x: number; y: number } {
  const stick = hand === 'left' ? input.axes.leftStick : input.axes.rightStick
  if (Math.hypot(stick.x, stick.y) > 0) return { x: stick.x, y: stick.y }
  return input.dpad
}

/**
 * Read an analog trigger axis into a 0…1 value.
 *
 * Controllers disagree on the range: some report -1 (released) … 1 (fully
 * pressed), others report 0 … 1. Both are handled without any history, so
 * the value is correct on the very first frame:
 *
 * - -1 → released (a -1…1 axis at rest)
 * - negative → a -1…1 axis, rescaled to 0…1
 * - 0 → released (a 0…1 axis at rest)
 * - positive → a 0…1 axis, used as-is
 */
export function readTriggerAxis(raw: number): number {
  if (raw <= -0.99) return 0
  if (raw < 0) return (raw + 1) / 2
  return raw
}

/**
 * Detect the profile for a connected controller.
 */
export function detectProfile(gamepad: Gamepad): ControllerProfile {
  const id = gamepad.id.toLowerCase()
  for (const [key, profile] of Object.entries(KNOWN_PROFILES)) {
    if (id.includes(key)) {
      logProfileOnce(key)
      return profile
    }
  }
  // Generic 8BitDo fallback — the Ultimate 2C layout is the best guess we
  // have for devices we have not measured.
  if (id.includes('8bitdo')) {
    logProfileOnce('8bitdo (generic)')
    return KNOWN_PROFILES['8bitdo ultimate 2c wireless']
  }
  return {
    buttons: DEFAULT_BUTTON_MAPPING,
    axes: DEFAULT_AXIS_MAPPING,
    hat: null,
  }
}

/**
 * The profile is resolved on every sampled frame, so the detection notice is
 * logged once per layout rather than once per frame.
 */
const loggedProfiles = new Set<string>()

function logProfileOnce(key: string): void {
  if (loggedProfiles.has(key)) return
  loggedProfiles.add(key)
  console.log('[Input] Detected known mapping for:', key)
}

/**
 * Detect controller mapping from gamepad ID (buttons only).
 *
 * Kept for callers that only need the button table.
 */
export function detectMapping(gamepad: Gamepad): ButtonMapping {
  return detectProfile(gamepad).buttons
}

/**
 * Drop axis assignments that would make a control read a stick.
 *
 * If a trigger is pointed at an axis that also carries a stick, the trigger
 * would follow the stick — the right stick appearing to "press" the left
 * trigger. Such an assignment cannot be right, so the trigger falls back to
 * its button value instead.
 */
function sanitiseAxes(axes: AxisMapping): AxisMapping {
  const stickAxes = new Set([axes.leftStickX, axes.leftStickY, axes.rightStickX, axes.rightStickY])
  return {
    ...axes,
    leftTrigger: stickAxes.has(axes.leftTrigger) ? -1 : axes.leftTrigger,
    rightTrigger: stickAxes.has(axes.rightTrigger) ? -1 : axes.rightTrigger,
  }
}

/** Merge user overrides onto the detected profile. */
export function resolveProfile(
  gamepad: Gamepad,
  overrides?: ControllerOverrides
): ControllerProfile {
  if (overrides?.profileMode === 'standard') {
    return {
      buttons: overrides.buttons ?? DEFAULT_BUTTON_MAPPING,
      axes: sanitiseAxes({ ...DEFAULT_AXIS_MAPPING, ...(overrides.axes ?? {}) }),
      hat: overrides.hat === undefined ? null : overrides.hat,
    }
  }

  const detected = detectProfile(gamepad)
  return {
    buttons: overrides?.buttons ?? detected.buttons,
    axes: sanitiseAxes({ ...detected.axes, ...(overrides?.axes ?? {}) }),
    hat: overrides?.hat === undefined ? detected.hat : overrides.hat,
  }
}

/** Build the override set from the user's saved settings. */
export function overridesFromSettings(settings: {
  customMapping?: ButtonMapping
  customAxes?: Partial<AxisMapping>
  customHat?: HatSpec | null
}): ControllerOverrides {
  return {
    buttons: settings.customMapping,
    axes: settings.customAxes,
    hat: settings.customHat,
  }
}

/**
 * Normalize raw gamepad input to our standard format
 */
export function normalizeGamepadInput(
  gamepad: Gamepad,
  deadzone: number = DEFAULT_DEADZONE,
  custom?: ControllerOverrides | ButtonMapping
): NormalizedInput {
  const axes = gamepad.axes
  const buttons = gamepad.buttons

  // Accept either a bare button mapping (legacy callers) or a full override
  // set. A `ButtonMapping` is a flat map of 16 numeric keys and never has
  // 'buttons' / 'axes' / 'hat', so the three keys tell the two apart.
  const isOverrideSet =
    custom !== undefined &&
    ('buttons' in custom || 'axes' in custom || 'hat' in custom)
  const overrides: ControllerOverrides = isOverrideSet
    ? (custom as ControllerOverrides)
    : custom
      ? { buttons: custom as ButtonMapping }
      : {}

  const profile = resolveProfile(gamepad, overrides)
  const mapping = profile.buttons
  const axisMapping = profile.axes

  // Helper to safely get button by mapped index
  const getBtn = (key: keyof ButtonMapping) => {
    const idx = mapping[key]
    return idx >= 0 && buttons[idx] ? isButtonPressed(buttons[idx]) : false
  }

  // Helper for analog triggers: some pads report them on an axis, others only
  // as a button value.
  const getTrigger = (axisKey: 'leftTrigger' | 'rightTrigger', buttonKey: 'lt' | 'rt') => {
    const axisIndex = axisMapping[axisKey]
    if (axisIndex >= 0) {
      return normalizeTrigger(readTriggerAxis(axes[axisIndex] ?? 0))
    }
    const idx = mapping[buttonKey]
    return normalizeTrigger(idx >= 0 ? buttons[idx]?.value ?? 0 : 0)
  }

  const buttonState = {
    a: getBtn('a'),
    b: getBtn('b'),
    x: getBtn('x'),
    y: getBtn('y'),
    lb: getBtn('lb'),
    rb: getBtn('rb'),
    back: getBtn('back'),
    start: getBtn('start'),
    ls: getBtn('ls'),
    rs: getBtn('rs'),
    dpadUp: getBtn('dpadUp'),
    dpadDown: getBtn('dpadDown'),
    dpadLeft: getBtn('dpadLeft'),
    dpadRight: getBtn('dpadRight'),
  }

  // A pad may report the D-pad as a hat switch on an axis instead of buttons.
  let dpad = dpadVector(buttonState)
  if (profile.hat) {
    const hatValue = axes[profile.hat.axis] ?? 0
    const decoded = decodeHat(hatValue, profile.hat)
    if (decoded) dpad = decoded
  }

  return {
    axes: {
      leftStick: {
        x: applyDeadzone(axes[axisMapping.leftStickX] ?? 0, deadzone),
        y: applyDeadzone(axes[axisMapping.leftStickY] ?? 0, deadzone),
      },
      rightStick: {
        x: applyDeadzone(axes[axisMapping.rightStickX] ?? 0, deadzone),
        y: applyDeadzone(axes[axisMapping.rightStickY] ?? 0, deadzone),
      },
      leftTrigger: getTrigger('leftTrigger', 'lt'),
      rightTrigger: getTrigger('rightTrigger', 'rt'),
    },
    dpad,
    buttons: buttonState,
    rawAxes: [...axes],
    rawButtons: [...buttons],
  }
}

/**
 * Get stick angle in radians (-PI to PI), 0 = right, PI/2 = down
 */
export function getStickAngle(x: number, y: number): number {
  return Math.atan2(y, x)
}

/**
 * Get stick magnitude (0-1)
 */
export function getStickMagnitude(x: number, y: number): number {
  return Math.min(1, Math.sqrt(x * x + y * y))
}

/**
 * Detect rotation direction from angle change
 * Returns: 1 for CW, -1 for CCW, 0 for no significant rotation
 */
export function getRotationDirection(
  prevAngle: number,
  currAngle: number,
  threshold: number = 0.1
): number {
  let diff = currAngle - prevAngle
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI

  if (Math.abs(diff) < threshold) return 0
  return diff > 0 ? 1 : -1
}

/**
 * Calculate angle difference (shortest path)
 */
export function angleDiff(a: number, b: number): number {
  let diff = b - a
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return diff
}

/**
 * Lerp between two angles (shortest path)
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = angleDiff(a, b)
  return a + diff * t
}
