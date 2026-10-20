/**
 * D-pad calibration wizard.
 *
 * Controllers are wildly inconsistent about the D-pad: some report four
 * buttons at the standard indices, some report a hat switch on an axis, and
 * the values a hat axis reports for each direction are device-specific.
 *
 * Rather than guessing, this wizard asks the player to press each direction
 * and captures exactly what the controller reports. It works for both a
 * button-based D-pad and a hat-switch D-pad.
 */

import { useEffect, useRef, useState } from 'react'
import type { HatSpec } from '../types'

export type CalibrationMode = 'buttons' | 'axis'

type Direction = 'up' | 'right' | 'down' | 'left'

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']

const DIRECTION_LABELS: Record<Direction, string> = {
  up: 'UP',
  right: 'RIGHT',
  down: 'DOWN',
  left: 'LEFT',
}

export interface ButtonDpadMap {
  up: number
  right: number
  down: number
  left: number
}

interface DpadCalibrationProps {
  gamepad: Gamepad | null
  /** Axis index of the hat switch (-1 when calibrating buttons). */
  axisIndex: number
  /** Called with the captured button indices once all four are known. */
  onCalibrateButtons: (map: ButtonDpadMap) => void
  /** Called with the captured hat values once all five are known. */
  onCalibrateAxis: (spec: HatSpec) => void
}

type Capture = Partial<Record<Direction, number>>

export function DpadCalibration({
  gamepad,
  axisIndex,
  onCalibrateButtons,
  onCalibrateAxis,
}: DpadCalibrationProps) {
  // The mode follows the configured hat axis until the player picks one, so a
  // controller that is detected after mount still lands in the right mode.
  const [modeOverride, setModeOverride] = useState<CalibrationMode | null>(null)
  const mode: CalibrationMode = modeOverride ?? (axisIndex >= 0 ? 'axis' : 'buttons')
  const [buttons, setButtons] = useState<Capture>({})
  const [axisValues, setAxisValues] = useState<Partial<Record<Direction, number>>>({})
  const [restValue, setRestValue] = useState<number | null>(null)
  const [restArmed, setRestArmed] = useState(false)
  const [liveAxis, setLiveAxis] = useState<number | null>(null)
  const previousButtonsRef = useRef<Set<number>>(new Set())

  // The capture loop runs on every frame, so the values it reads live in refs
  // rather than state (which would restart the loop on every capture).
  const modeRef = useRef(mode)
  const axisIndexRef = useRef(axisIndex)
  const restArmedRef = useRef(restArmed)
  const buttonsRef = useRef(buttons)
  const axisValuesRef = useRef(axisValues)

  useEffect(() => {
    modeRef.current = mode
    axisIndexRef.current = axisIndex
    restArmedRef.current = restArmed
    buttonsRef.current = buttons
    axisValuesRef.current = axisValues
  }, [mode, axisIndex, restArmed, buttons, axisValues])

  // Watch the controller and capture the first direction that is pressed.
  useEffect(() => {
    if (!gamepad) return
    let frame = 0

    const loop = () => {
      const pressedNow = new Set<number>()
      gamepad.buttons.forEach((button, index) => {
        if (button.pressed || button.value > 0.5) pressedNow.add(index)
      })

      const previous = previousButtonsRef.current
      const newlyPressed = [...pressedNow].filter((index) => !previous.has(index))
      previousButtonsRef.current = pressedNow

      const axis = axisIndexRef.current
      if (axis >= 0) {
        const value = gamepad.axes[axis] ?? 0
        setLiveAxis(value)

        if (restArmedRef.current) {
          // Capture the idle reading once the player lets go.
          if (newlyPressed.length === 0 && previous.size === 0) {
            setRestValue(value)
            setRestArmed(false)
          }
        } else if (modeRef.current === 'axis' && newlyPressed.length > 0) {
          // A button press is how the player says "now"; the axis value at
          // that moment is the direction's value.
          const next = { ...axisValuesRef.current }
          const direction = DIRECTIONS.find((d) => next[d] === undefined)
          if (direction) {
            next[direction] = value
            axisValuesRef.current = next
            setAxisValues(next)
          }
        }
      } else if (modeRef.current === 'buttons' && newlyPressed.length > 0) {
        const next = { ...buttonsRef.current }
        const direction = DIRECTIONS.find((d) => next[d] === undefined)
        if (direction) {
          next[direction] = newlyPressed[0]
          buttonsRef.current = next
          setButtons(next)
        }
      }

      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [gamepad])

  const reset = () => {
    const empty: Capture = {}
    const emptyAxes: Partial<Record<Direction, number>> = {}
    buttonsRef.current = empty
    axisValuesRef.current = emptyAxes
    setButtons(empty)
    setAxisValues(emptyAxes)
    setRestValue(null)
    setRestArmed(false)
    setModeOverride(null)
  }

  const buttonComplete = DIRECTIONS.every((d) => buttons[d] !== undefined)
  const axisComplete = DIRECTIONS.every((d) => axisValues[d] !== undefined) && restValue !== null
  /** The direction the player should press next. */
  const nextDirection = DIRECTIONS.find((d) => axisValues[d] === undefined)
  const nextButtonDirection = DIRECTIONS.find((d) => buttons[d] === undefined)

  return (
    <div className="calibration dpad-calibration">
      <div className="calibration-head">
        <div className="calibration-modes" role="group" aria-label="D-pad calibration mode">
          <button
            className={'filter-chip' + (mode === 'buttons' ? ' filter-chip-active' : '')}
            aria-pressed={mode === 'buttons'}
            onClick={() => {
              setModeOverride('buttons')
              reset()
            }}
          >
            Buttons
          </button>
          <button
            className={'filter-chip' + (mode === 'axis' ? ' filter-chip-active' : '')}
            aria-pressed={mode === 'axis'}
            onClick={() => {
              setModeOverride('axis')
              reset()
            }}
          >
            Hat axis
          </button>
        </div>
        <button className="btn btn-secondary calibration-reset" onClick={reset}>
          CLEAR
        </button>
      </div>

      {mode === 'axis' && (
        <>
          <p className="mapping-hint">
            {axisIndex >= 0
              ? `Press the D-pad ${nextDirection ? DIRECTION_LABELS[nextDirection] : 'directions'} in turn — then press REST while leaving the D-pad alone.`
              : 'Choose “Hat axis” and pick the axis in AXES & D-PAD below first.'}
            {liveAxis !== null && axisIndex >= 0 && (
              <span className="calibration-live"> Live axis {axisIndex}: {liveAxis.toFixed(3)}</span>
            )}
          </p>
          <div className="calibration-grid">
            {DIRECTIONS.map((direction) => (
              <div className="calibration-item" key={direction}>
                <span className="calibration-label">{DIRECTION_LABELS[direction]}</span>
                <span className="calibration-value">
                  {axisValues[direction] !== undefined ? axisValues[direction]!.toFixed(3) : '—'}
                </span>
              </div>
            ))}
            <div className="calibration-item">
              <span className="calibration-label">REST</span>
              <span className="calibration-value">
                {restValue !== null ? restValue.toFixed(3) : restArmed ? 'waiting…' : '—'}
              </span>
            </div>
          </div>
          <div className="btn-group calibration-actions">
            {!restArmed ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setRestValue(null)
                  setRestArmed(true)
                }}
              >
                CAPTURE REST
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={() => setRestArmed(false)}>
                CANCEL REST
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={!axisComplete}
              onClick={() => {
                if (!axisComplete || axisIndex < 0) return
                onCalibrateAxis({
                  axis: axisIndex,
                  up: axisValues.up!,
                  right: axisValues.right!,
                  down: axisValues.down!,
                  left: axisValues.left!,
                  rest: restValue!,
                })
              }}
            >
              APPLY HAT VALUES
            </button>
          </div>
        </>
      )}

      {mode === 'buttons' && (
        <>
          <p className="mapping-hint">
            Press the D-pad {nextButtonDirection ? DIRECTION_LABELS[nextButtonDirection] : 'directions'} in
            turn. The button index your controller reports is captured automatically.
          </p>
          <div className="calibration-grid">
            {DIRECTIONS.map((direction) => (
              <div className="calibration-item" key={direction}>
                <span className="calibration-label">{DIRECTION_LABELS[direction]}</span>
                <span className="calibration-value">
                  {buttons[direction] !== undefined ? `Button ${buttons[direction]}` : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="btn-group calibration-actions">
            <button
              className="btn btn-primary"
              disabled={!buttonComplete}
              onClick={() => {
                if (!buttonComplete) return
                onCalibrateButtons({
                  up: buttons.up!,
                  right: buttons.right!,
                  down: buttons.down!,
                  left: buttons.left!,
                })
              }}
            >
              APPLY BUTTON INDICES
            </button>
          </div>
        </>
      )}
    </div>
  )
}
