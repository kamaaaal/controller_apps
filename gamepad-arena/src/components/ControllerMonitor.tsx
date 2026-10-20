/**
 * Live controller monitor for the settings dialog.
 *
 * Some controllers do not use the standard button indices — the D-pad in
 * particular is often reported on an axis as a hat switch, and several pads
 * shift every face button. This panel shows exactly which raw button index
 * each physical press arrives on, which axes move and what the D-pad currently
 * decodes to, so a mismatched pad can be diagnosed instead of being a mystery.
 *
 * "COPY REPORT" exports everything needed to write a device profile: the
 * controller identity, the live axis readings, and a log of what was pressed
 * while the panel was open.
 */

import { useEffect, useRef, useState } from 'react'
import { decodeHat, readTriggerAxis, type HatSpec } from '../utils/input'
import type { AxisMapping } from '../types'

interface ControllerMonitorProps {
  gamepad: Gamepad | null
  /** The button index the current mapping expects for the D-pad directions. */
  dpadIndices: { up: number; down: number; left: number; right: number }
  /** The hat switch the current profile expects, if the pad reports one. */
  hat?: HatSpec | null
  /** The axis mapping in use, so each axis can be labelled with its role. */
  axes?: AxisMapping
}

const VISIBLE_BUTTONS = 20
const MAX_SAMPLES = 60

const NO_BUTTONS: ReadonlySet<number> = new Set()

interface Sample {
  pressed: number[]
  axes: number[]
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

export function ControllerMonitor({
  gamepad,
  dpadIndices,
  hat,
  axes,
}: ControllerMonitorProps) {
  const [pressed, setPressed] = useState<ReadonlySet<number>>(NO_BUTTONS)
  const [axisValues, setAxisValues] = useState<number[]>([])
  const [samples, setSamples] = useState<Sample[]>([])
  const [copied, setCopied] = useState(false)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!gamepad) return

    const loop = () => {
      const next = new Set<number>()
      gamepad.buttons.forEach((button, index) => {
        if (button.pressed || button.value > 0.5) next.add(index)
      })
      setPressed((prev) => (sameSet(prev, next) ? prev : next))

      const rawAxes = Array.from(gamepad.axes)
      const rounded = rawAxes.map((value) => Math.round(value * 1000) / 1000)
      setAxisValues((prev) =>
        prev.length === rounded.length && prev.every((value, i) => value === rounded[i])
          ? prev
          : rounded
      )

      // Keep a log of what was pressed, so the report can be used to write a
      // device profile without the player having to note anything down.
      if (next.size > 0) {
        const pressedList = [...next].sort((a, b) => a - b)
        setSamples((prev) => {
          if (prev.some((s) => s.pressed.join(',') === pressedList.join(','))) return prev
          const nextSamples = [...prev, { pressed: pressedList, axes: rounded }]
          return nextSamples.length > MAX_SAMPLES ? nextSamples.slice(-MAX_SAMPLES) : nextSamples
        })
      }

      frameRef.current = requestAnimationFrame(loop)
    }

    frameRef.current = requestAnimationFrame(loop)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [gamepad])

  // Derived during render: with no controller connected there is nothing live
  // to show, so the last known snapshot is ignored rather than reset in an
  // effect (which would cause a cascading render).
  const livePressed = gamepad ? pressed : NO_BUTTONS
  const liveAxes = gamepad ? axisValues : []

  if (!gamepad) {
    return (
      <div className="monitor" role="status">
        <p className="mapping-hint">Connect a controller to see its live button indices.</p>
      </div>
    )
  }

  const dpadSet = new Set([dpadIndices.up, dpadIndices.down, dpadIndices.left, dpadIndices.right])

  // Which raw axis carries what, so a mis-assigned axis is obvious at a glance.
  const axisRoles = new Map<number, string>()
  if (axes) {
    const roles: Array<[number, string]> = [
      [axes.leftStickX, 'LS-X'],
      [axes.leftStickY, 'LS-Y'],
      [axes.rightStickX, 'RS-X'],
      [axes.rightStickY, 'RS-Y'],
      [axes.leftTrigger, 'LT'],
      [axes.rightTrigger, 'RT'],
    ]
    for (const [index, role] of roles) {
      if (index >= 0) axisRoles.set(index, role)
    }
  }

  // The live trigger values, read exactly the way the app reads them.
  const triggerValue = (axisIndex: number): number =>
    axisIndex >= 0 ? readTriggerAxis(liveAxes[axisIndex] ?? 0) : 0

  // Decode the hat switch (when the pad reports the D-pad on an axis).
  let hatDirection = '—'
  let hatValue: number | null = null
  if (hat) {
    hatValue = liveAxes[hat.axis] ?? 0
    const decoded = decodeHat(hatValue, hat)
    hatDirection = decoded
      ? decoded.y < 0
        ? 'UP'
        : decoded.y > 0
          ? 'DOWN'
          : decoded.x > 0
            ? 'RIGHT'
            : 'LEFT'
      : '—'
  }

  const copyReport = async () => {
    const report = {
      controller: {
        id: gamepad.id,
        index: gamepad.index,
        mapping: gamepad.mapping,
        buttonCount: gamepad.buttons.length,
        axisCount: gamepad.axes.length,
      },
      detectedDpad: {
        up: dpadIndices.up,
        down: dpadIndices.down,
        left: dpadIndices.left,
        right: dpadIndices.right,
      },
      hat: hat ?? null,
      liveAxes,
      liveButtons: liveAxes.length >= 0 ? gamepad.buttons.map((b) => b.value) : [],
      samples,
    }
    const text = JSON.stringify(report, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked; fall back to a selectable prompt.
      window.prompt('Copy this controller report:', text)
    }
  }

  return (
    <div className="monitor">
      <p className="mapping-hint">
        Press buttons on the controller — the matching index lights up. Indices marked{' '}
        <span className="monitor-dpad-mark">D</span> are where the D-pad is expected.
      </p>
      <div className="monitor-grid" aria-hidden="true">
        {Array.from({ length: VISIBLE_BUTTONS }, (_, index) => (
          <span
            key={index}
            className={
              'monitor-cell' +
              (livePressed.has(index) ? ' monitor-cell-active' : '') +
              (dpadSet.has(index) ? ' monitor-cell-dpad' : '')
            }
          >
            {index}
          </span>
        ))}
      </div>
      {hat && (
        <div className="monitor-dpad">
          <span>D-PAD (HAT AX{hat.axis})</span>
          <span className="monitor-dpad-value">{hatDirection}</span>
          <span>value {hatValue?.toFixed(3)}</span>
        </div>
      )}
      <div className="monitor-axes" aria-hidden="true">
        {liveAxes.map((value, index) => {
          const role = axisRoles.get(index)
          return (
            <span
              className={
                'monitor-axis' + (role ? ' monitor-axis-role' : '') + (hat && hat.axis === index ? ' monitor-axis-hat' : '')
              }
              key={index}
            >
              <span className="monitor-axis-label">
                AX{index}
                {role ? ` ${role}` : ''}
              </span>
              <span className="monitor-axis-bar">
                <span
                  className="monitor-axis-fill"
                  style={{
                    width: `${Math.round(Math.abs(value) * 50)}%`,
                    left: value < 0 ? '50%' : '50%',
                    transform: value < 0 ? 'translateX(-100%)' : undefined,
                  }}
                />
              </span>
              <span className="monitor-axis-value">{value.toFixed(2)}</span>
            </span>
          )
        })}
      </div>
      {axes && (
        <div className="monitor-dpad">
          <span>TRIGGERS</span>
          <span className="monitor-dpad-value">
            LT {Math.round(triggerValue(axes.leftTrigger) * 100)}%
          </span>
          <span>RT {Math.round(triggerValue(axes.rightTrigger) * 100)}%</span>
        </div>
      )}
      <div className="monitor-footer">
        <button className="btn btn-secondary monitor-copy" onClick={copyReport}>
          {copied ? 'COPIED ✓' : 'COPY REPORT'}
        </button>
        <span className="mapping-hint">
          {samples.length} input{samples.length === 1 ? '' : 's'} logged — copy the report to share
          it.
        </span>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {livePressed.size === 0
          ? 'No buttons pressed.'
          : `Buttons pressed: ${Array.from(livePressed).sort((a, b) => a - b).join(', ')}.`}
      </p>
    </div>
  )
}
