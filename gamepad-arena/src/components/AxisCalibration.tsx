/**
 * Stick and trigger axis calibration wizard.
 *
 * Controllers disagree about which raw axis carries what. The 8BitDo Ultimate
 * 2C, for instance, interleaves the right stick and the two triggers, so a
 * guessed index makes the right stick read the left trigger (or the other way
 * round).
 *
 * Rather than guessing, this wizard asks the player to move each control and
 * captures the axis that actually moved. The result is written into the
 * controller's axis mapping.
 */

import { useEffect, useRef, useState } from 'react'
import type { AxisMapping } from '../types'

type StepKey = 'leftStickX' | 'leftStickY' | 'rightStickX' | 'rightStickY' | 'leftTrigger' | 'rightTrigger'

interface Step {
  key: StepKey
  /** What the player should do. */
  prompt: string
  /** Short label for the captured value. */
  label: string
}

const STEPS: Step[] = [
  { key: 'leftStickX', prompt: 'Push the LEFT stick to the RIGHT', label: 'Left stick X' },
  { key: 'leftStickY', prompt: 'Push the LEFT stick DOWN', label: 'Left stick Y' },
  { key: 'rightStickX', prompt: 'Push the RIGHT stick to the RIGHT', label: 'Right stick X' },
  { key: 'rightStickY', prompt: 'Push the RIGHT stick DOWN', label: 'Right stick Y' },
  { key: 'leftTrigger', prompt: 'Press the LEFT trigger (LT)', label: 'Left trigger' },
  { key: 'rightTrigger', prompt: 'Press the RIGHT trigger (RT)', label: 'Right trigger' },
]

interface AxisCalibrationProps {
  gamepad: Gamepad | null
  /** The axis mapping currently in use. */
  axes: AxisMapping
  /** Called with the updated mapping once every step is captured. */
  onCalibrate: (axes: AxisMapping) => void
}

/** The smallest change in an axis that counts as "the player moved it". */
const MOVE_THRESHOLD = 0.25

export function AxisCalibration({ gamepad, axes, onCalibrate }: AxisCalibrationProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [captured, setCaptured] = useState<Partial<Record<StepKey, number>>>({})
  const [running, setRunning] = useState(false)
  const [liveAxes, setLiveAxes] = useState<number[]>([])

  const baselineRef = useRef<number[]>([])
  const capturedRef = useRef<Partial<Record<StepKey, number>>>({})
  const runningRef = useRef(false)
  const stepRef = useRef(STEPS[0])
  /**
   * Set synchronously when a capture fires, so the very next frame cannot
   * capture again before React has re-rendered. Without it the capture runs
   * twice per arming: the second run would overwrite the same control and
   * advance the step by two, shifting every later step.
   */
  const armedRef = useRef(false)

  useEffect(() => {
    capturedRef.current = captured
    runningRef.current = running
    stepRef.current = STEPS[stepIndex] ?? STEPS[0]
  }, [captured, running, stepIndex])

  // Watch the axes: when the player does what the step asks, the axis that
  // moved the most is the one that carries that control.
  useEffect(() => {
    if (!gamepad) return
    let frame = 0

    const loop = () => {
      const values = Array.from(gamepad.axes)
      setLiveAxes((prev) =>
        prev.length === values.length && prev.every((v, i) => v === values[i]) ? prev : values
      )

      if (runningRef.current && armedRef.current) {
        const baseline = baselineRef.current
        if (baseline.length === values.length) {
          let bestAxis = -1
          let bestDelta = MOVE_THRESHOLD
          for (let i = 0; i < values.length; i++) {
            const delta = Math.abs(values[i] - baseline[i])
            if (delta > bestDelta) {
              bestDelta = delta
              bestAxis = i
            }
          }
          if (bestAxis >= 0) {
            armedRef.current = false
            const next = { ...capturedRef.current, [stepRef.current.key]: bestAxis }
            capturedRef.current = next
            setCaptured(next)
            setRunning(false)
            // Move on to the next control automatically.
            setStepIndex((index) => (index + 1) % STEPS.length)
          }
        }
      }

      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [gamepad])

  const startStep = () => {
    if (!gamepad) return
    // Always re-arm with a fresh baseline. If a capture is already pending,
    // this simply restarts it — a stale baseline would otherwise attribute
    // the previous control's movement to this one.
    baselineRef.current = Array.from(gamepad.axes)
    armedRef.current = true
    setRunning(true)
  }

  const step = STEPS[stepIndex]

  const apply = () => {
    const patch: Partial<AxisMapping> = {}
    for (const s of STEPS) {
      const axis = captured[s.key]
      if (axis !== undefined) patch[s.key] = axis
    }
    onCalibrate({ ...axes, ...patch })
  }

  const complete = STEPS.every((s) => captured[s.key] !== undefined)

  return (
    <div className="calibration axis-calibration">
      <p className="mapping-hint">
        Move each control as instructed — the app captures the axis that moved. This fixes
        controllers that put the sticks and triggers on unusual axes.
      </p>

      <ol className="axis-steps">
        {STEPS.map((s, index) => {
          const value = captured[s.key]
          const done = value !== undefined
          const active = index === stepIndex
          return (
            <li
              key={s.key}
              className={
                'axis-step' + (done ? ' axis-step-done' : '') + (active && running ? ' axis-step-running' : '')
              }
            >
              <span className="axis-step-label">{s.label}</span>
              <span className="axis-step-value">{done ? `Axis ${value}` : '—'}</span>
            </li>
          )
        })}
      </ol>

      <div className="calibration-grid">
        {liveAxes.map((value, index) => (
          <div className="calibration-item" key={index}>
            <span className="calibration-label">AX{index}</span>
            <span className="calibration-value">{value.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="btn-group calibration-actions">
        <button className="btn btn-primary" onClick={startStep} disabled={!gamepad}>
          {running ? `MOVE ${step.label.toUpperCase()} NOW…` : `CAPTURE: ${step.label.toUpperCase()}`}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setRunning(false)
            setStepIndex((i) => (i + 1) % STEPS.length)
          }}
        >
          NEXT STEP
        </button>
        <button className="btn btn-secondary" onClick={apply} disabled={!complete}>
          APPLY
        </button>
      </div>
      <p className="mapping-hint">
        {running ? step.prompt : `Next: ${step.prompt}`}
      </p>
    </div>
  )
}
