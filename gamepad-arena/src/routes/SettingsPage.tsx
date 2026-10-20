/**
 * `/settings` — settings as a dialog route (iteration 13).
 *
 * Settings is a real route (`/settings`) rendered as a glass dialog on a dimmed
 * blurred backdrop. Because it is a route, it can never stack on top of a
 * result/pause screen in a broken way — the underlying page unmounts — and the
 * backdrop always covers everything below it. Opening/closing it is a route
 * transition, so the shared input latch arms automatically (fix 4a).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { usePageNavigation } from '../hooks/usePageNavigation'
import {
  DEFAULT_BUTTON_MAPPING,
  overridesFromSettings,
  resolveProfile,
  type ButtonMapping,
} from '../utils/input'
import { goBackTarget, ROUTES } from '../utils/routes'
import { ControllerMonitor } from '../components/ControllerMonitor'
import { DpadCalibration } from '../components/DpadCalibration'
import { AxisCalibration } from '../components/AxisCalibration'
import type { AxisMapping, HatSpec, Settings } from '../types'
import type { InputLockout } from '../utils/inputLockout'

const BUTTON_LABELS: Record<keyof ButtonMapping, string> = {
  a: 'A (Cross)',
  b: 'B (Circle)',
  x: 'X (Square)',
  y: 'Y (Triangle)',
  lb: 'LB (L1)',
  rb: 'RB (R1)',
  lt: 'LT (L2)',
  rt: 'RT (R2)',
  back: 'Back (Select)',
  start: 'Start (Options)',
  ls: 'LS (L3)',
  rs: 'RS (R3)',
  dpadUp: 'D-Pad Up',
  dpadDown: 'D-Pad Down',
  dpadLeft: 'D-Pad Left',
  dpadRight: 'D-Pad Right',
}

interface SettingsPageProps {
  gamepad: Gamepad | null
  settings: Settings
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  onUpdateMappingFull: (mapping: ButtonMapping) => void
  onUpdateAxes: (patch: Partial<AxisMapping>) => void
  onUpdateHat: (hat: HatSpec | null) => void
  onUpdateProfileMode: (mode: 'auto' | 'standard') => void
  onResetMapping: () => void
  onClearData: () => void
  lockout: InputLockout
}

export function SettingsPage({
  gamepad,
  settings,
  onUpdateSetting,
  onUpdateMappingFull,
  onUpdateAxes,
  onUpdateHat,
  onUpdateProfileMode,
  onResetMapping,
  onClearData,
  lockout,
}: SettingsPageProps) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  // The effective layout: what the app is actually using right now — the
  // detected profile for this controller, with the user's overrides on top.
  // Showing the generic defaults here instead would be misleading on any
  // controller that does not use the standard layout.
  const effective = useMemo(
    () => resolveProfile(gamepad ?? ({ id: '' } as Gamepad), overridesFromSettings(settings)),
    [gamepad, settings]
  )
  const effectiveHat = effective.hat
  const hatAxis = effective.axes.dpadHat

  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (goBackTarget(idx) === 'back') navigate(-1)
    else navigate(ROUTES.library, { replace: true })
  }, [navigate])

  const { navMode } = usePageNavigation({
    gamepad,
    enabled: true,
    deadzone: settings.deadzone,
    mapping: overridesFromSettings(settings),
    lockout,
    getScope: () => panelRef.current,
    // A settings form is read top to bottom, so up/down walk the fields in
    // order rather than jumping around by geometry.
    linearVertical: true,
    onBack: goBack,
  })

  // Focus dialog: move focus in on open, trap Tab, Escape closes (real navigation).
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)

    focusables()[0]?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        goBack()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey && activeEl === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault()
        firstEl.focus()
      } else if (activeEl && panel && !panel.contains(activeEl)) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [goBack])

  return (
    <div className="settings-page">
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) goBack()
        }}
      >
        <motion.div
          ref={panelRef}
          className={'screen settings-screen' + (navMode ? ' gamepad-nav' : '')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          tabIndex={-1}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <h2 id="settings-title" className="screen-title">SETTINGS</h2>
          <div className="settings-group">
            <div className="setting-row">
              <label className="setting-label" htmlFor="set-deadzone">Deadzone</label>
              <div className="setting-control">
                <input
                  id="set-deadzone"
                  type="range"
                  className="setting-slider"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={settings.deadzone}
                  onChange={(e) => onUpdateSetting('deadzone', parseFloat(e.target.value))}
                  aria-label="Deadzone"
                  aria-valuetext={`${Math.round(settings.deadzone * 100)} percent`}
                />
                <span className="setting-value">{Math.round(settings.deadzone * 100)}%</span>
              </div>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="set-vibration">Vibration</label>
              <div className="setting-control">
                <label className="setting-toggle">
                  <input
                    id="set-vibration"
                    type="checkbox"
                    checked={settings.vibration}
                    onChange={(e) => onUpdateSetting('vibration', e.target.checked)}
                    aria-label="Vibration"
                  />
                  <span className="setting-toggle-slider" aria-hidden="true" />
                </label>
              </div>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="set-contrast">High Contrast</label>
              <div className="setting-control">
                <label className="setting-toggle">
                  <input
                    id="set-contrast"
                    type="checkbox"
                    checked={settings.highContrast}
                    onChange={(e) => onUpdateSetting('highContrast', e.target.checked)}
                    aria-label="High Contrast"
                  />
                  <span className="setting-toggle-slider" aria-hidden="true" />
                </label>
              </div>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="set-motion">Reduced Motion</label>
              <div className="setting-control">
                <label className="setting-toggle">
                  <input
                    id="set-motion"
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) => onUpdateSetting('reducedMotion', e.target.checked)}
                    aria-label="Reduced Motion"
                  />
                  <span className="setting-toggle-slider" aria-hidden="true" />
                </label>
              </div>
            </div>

            <div className="setting-row">
              <label className="setting-label" htmlFor="set-audio">Audio</label>
              <div className="setting-control">
                <label className="setting-toggle">
                  <input
                    id="set-audio"
                    type="checkbox"
                    checked={settings.audioEnabled}
                    onChange={(e) => onUpdateSetting('audioEnabled', e.target.checked)}
                    aria-label="Audio"
                  />
                  <span className="setting-toggle-slider" aria-hidden="true" />
                </label>
              </div>
            </div>

            {/* Controller layout */}
            <div className="settings-divider">
              <h3 className="settings-heading">CONTROLLER LAYOUT</h3>
              <p className="mapping-hint">
                {gamepad ? (
                  <>
                    Detected: <strong>{gamepad.id}</strong> · {gamepad.mapping} ·{' '}
                    {gamepad.buttons.length} buttons · {gamepad.axes.length} axes
                  </>
                ) : (
                  'Connect a controller to detect its layout.'
                )}
              </p>

              <div className="setting-row">
                <label className="setting-label" htmlFor="set-profile-mode">Layout</label>
                <div className="setting-control">
                  <select
                    id="set-profile-mode"
                    className="mapping-select"
                    value={settings.profileMode ?? 'auto'}
                    onChange={(e) => onUpdateProfileMode(e.target.value as 'auto' | 'standard')}
                  >
                    <option value="auto">Auto-detected</option>
                    <option value="standard">Standard (XInput)</option>
                  </select>
                </div>
              </div>

              <ControllerMonitor
                gamepad={gamepad}
                hat={effectiveHat}
                axes={effective.axes}
                dpadIndices={{
                  up: effective.buttons.dpadUp,
                  down: effective.buttons.dpadDown,
                  left: effective.buttons.dpadLeft,
                  right: effective.buttons.dpadRight,
                }}
              />
            </div>

            {/* Button Mapping */}
            <div className="settings-divider">
              <h3 className="settings-heading">BUTTON MAPPING</h3>
              <p className="mapping-hint">
                The indices this controller actually uses. Editing one keeps the rest.
              </p>
              <div className="mapping-grid">
                {(Object.keys(DEFAULT_BUTTON_MAPPING) as Array<keyof ButtonMapping>).map((key) => {
                  const isDpad = key.startsWith('dpad')
                  const usesHat = isDpad && hatAxis >= 0
                  return (
                    <div key={key} className="mapping-item">
                      <label className="mapping-label" htmlFor={`map-${key}`}>{BUTTON_LABELS[key]}</label>
                      {usesHat ? (
                        <span className="mapping-select mapping-fixed">Hat axis {hatAxis}</span>
                      ) : (
                        <select
                          id={`map-${key}`}
                          className="mapping-select"
                          value={effective.buttons[key]}
                          onChange={(e) =>
                            onUpdateMappingFull({
                              ...effective.buttons,
                              [key]: parseInt(e.target.value, 10),
                            })
                          }
                        >
                          {Array.from({ length: 20 }, (_, i) => i).map((i) => (
                            <option key={i} value={i}>
                              Button {i}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
              <button className="btn btn-secondary mapping-reset" onClick={onResetMapping}>
                RESET TO DETECTED LAYOUT
              </button>
            </div>

            {/* Axes & D-pad */}
            <div className="settings-divider">
              <h3 className="settings-heading">AXES &amp; D-PAD</h3>
              <p className="mapping-hint">
                Some controllers report the D-pad as a hat switch on an axis, and put the right
                stick or the triggers on unusual axes.
              </p>

              <div className="setting-row">
                <label className="setting-label" htmlFor="set-dpad-hat">D-Pad source</label>
                <div className="setting-control">
                  <select
                    id="set-dpad-hat"
                    className="mapping-select"
                    value={effective.axes.dpadHat}
                    onChange={(e) => {
                      const axis = parseInt(e.target.value, 10)
                      onUpdateAxes({ dpadHat: axis })
                      if (axis >= 0 && !effectiveHat) {
                        onUpdateHat({ axis, up: -1, right: -0.43, down: 0.14, left: 0.71, rest: 0 })
                      } else if (axis < 0) {
                        onUpdateHat(null)
                      }
                    }}
                  >
                    <option value={-1}>Buttons</option>
                    {Array.from({ length: 8 }, (_, i) => i).map((i) => (
                      <option key={i} value={i}>
                        Hat axis {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {effectiveHat && (
                <div className="hat-calibration">
                  <p className="mapping-hint">
                    Press each direction on the D-pad and enter the axis value it reports.
                  </p>
                  <div className="hat-grid">
                    {(['up', 'right', 'down', 'left', 'rest'] as const).map((key) => (
                      <label className="hat-item" key={key}>
                        <span className="hat-label">{key.toUpperCase()}</span>
                        <input
                          type="number"
                          step="0.01"
                          className="hat-input"
                          value={effectiveHat[key]}
                          aria-label={`D-pad ${key} axis value`}
                          onChange={(e) =>
                            onUpdateHat({
                              ...effectiveHat,
                              [key]: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="setting-row">
                <label className="setting-label" htmlFor="set-rstick-y">Right stick Y</label>
                <div className="setting-control">
                  <select
                    id="set-rstick-y"
                    className="mapping-select"
                    value={effective.axes.rightStickY}
                    onChange={(e) => onUpdateAxes({ rightStickY: parseInt(e.target.value, 10) })}
                  >
                    {Array.from({ length: 8 }, (_, i) => i).map((i) => (
                      <option key={i} value={i}>
                        Axis {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="setting-row">
                <label className="setting-label" htmlFor="set-lt-axis">Triggers</label>
                <div className="setting-control">
                  <select
                    id="set-lt-axis"
                    className="mapping-select"
                    value={effective.axes.leftTrigger}
                    onChange={(e) => onUpdateAxes({ leftTrigger: parseInt(e.target.value, 10) })}
                    aria-label="Left trigger axis"
                  >
                    <option value={-1}>Button value</option>
                    {Array.from({ length: 8 }, (_, i) => i).map((i) => (
                      <option key={i} value={i}>
                        Axis {i}
                      </option>
                    ))}
                  </select>
                  <select
                    className="mapping-select"
                    value={effective.axes.rightTrigger}
                    onChange={(e) => onUpdateAxes({ rightTrigger: parseInt(e.target.value, 10) })}
                    aria-label="Right trigger axis"
                  >
                    <option value={-1}>Button value</option>
                    {Array.from({ length: 8 }, (_, i) => i).map((i) => (
                      <option key={i} value={i}>
                        Axis {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-divider">
                <h3 className="settings-heading">D-PAD CALIBRATION</h3>
                <p className="mapping-hint">
                  The surest way to get the D-pad right: press each direction and let the app learn
                  what your controller reports.
                </p>
                <DpadCalibration
                  gamepad={gamepad}
                  axisIndex={hatAxis}
                  onCalibrateButtons={(map) => {
                    onUpdateMappingFull({
                      ...effective.buttons,
                      dpadUp: map.up,
                      dpadRight: map.right,
                      dpadDown: map.down,
                      dpadLeft: map.left,
                    })
                    onUpdateAxes({ dpadHat: -1 })
                    onUpdateHat(null)
                  }}
                  onCalibrateAxis={(spec) => {
                    onUpdateAxes({ dpadHat: spec.axis })
                    onUpdateHat(spec)
                  }}
                />
              </div>

              <div className="settings-divider">
                <h3 className="settings-heading">STICK &amp; TRIGGER CALIBRATION</h3>
                <p className="mapping-hint">
                  Some controllers put the sticks and triggers on unusual axes — a wrong index makes
                  the right stick read the left trigger.
                </p>
                <AxisCalibration
                  gamepad={gamepad}
                  axes={effective.axes}
                  onCalibrate={(next) => onUpdateAxes(next)}
                />
              </div>
            </div>
          </div>

          <div className="btn-group">
            <button className="btn btn-primary" onClick={goBack}>DONE</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirm('Clear all personal bests and settings?')) onClearData()
              }}
            >
              CLEAR DATA
            </button>
          </div>

        </motion.div>
      </motion.div>
    </div>
  )
}


