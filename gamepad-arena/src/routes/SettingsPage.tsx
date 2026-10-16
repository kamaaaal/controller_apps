/**
 * `/settings` — settings as a dialog route (iteration 13).
 *
 * Settings is a real route (`/settings`) rendered as a glass dialog on a dimmed
 * blurred backdrop. Because it is a route, it can never stack on top of a
 * result/pause screen in a broken way — the underlying page unmounts — and the
 * backdrop always covers everything below it. Opening/closing it is a route
 * transition, so the shared input latch arms automatically (fix 4a).
 */

import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { usePageNavigation } from '../hooks/usePageNavigation'
import { DEFAULT_BUTTON_MAPPING, type ButtonMapping } from '../utils/input'
import { goBackTarget, ROUTES } from '../utils/routes'
import type { Settings } from '../types'
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
  onUpdateMapping: (key: keyof ButtonMapping, value: number) => void
  onResetMapping: () => void
  onClearData: () => void
  lockout: InputLockout
}

export function SettingsPage({
  gamepad,
  settings,
  onUpdateSetting,
  onUpdateMapping,
  onResetMapping,
  onClearData,
  lockout,
}: SettingsPageProps) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  const currentMapping = settings.customMapping || DEFAULT_BUTTON_MAPPING

  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (goBackTarget(idx) === 'back') navigate(-1)
    else navigate(ROUTES.library, { replace: true })
  }, [navigate])

  const { navMode } = usePageNavigation({
    gamepad,
    enabled: true,
    deadzone: settings.deadzone,
    mapping: currentMapping,
    lockout,
    getScope: () => panelRef.current,
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

            {/* Button Mapping */}
            <div className="settings-divider">
              <h3 className="settings-heading">BUTTON MAPPING</h3>
              <p className="mapping-hint">Auto-detected for known controllers. Edit below to customize.</p>
              <div className="mapping-grid">
                {(Object.keys(DEFAULT_BUTTON_MAPPING) as Array<keyof ButtonMapping>).map((key) => (
                  <div key={key} className="mapping-item">
                    <label className="mapping-label" htmlFor={`map-${key}`}>{BUTTON_LABELS[key]}</label>
                    <select
                      id={`map-${key}`}
                      className="mapping-select"
                      value={currentMapping[key]}
                      onChange={(e) => onUpdateMapping(key, parseInt(e.target.value, 10))}
                    >
                      {Array.from({ length: 20 }, (_, i) => i).map((i) => (
                        <option key={i} value={i}>
                          Button {i}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary mapping-reset" onClick={onResetMapping}>
                RESET TO DEFAULTS
              </button>
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


