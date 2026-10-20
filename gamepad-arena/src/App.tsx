/**
 * Gamepad Arena — app shell (iteration 13).
 *
 * Real browser-history routes via React Router: `/` is the games library,
 * `/play/:challengeId` is one route per game and `/settings` is the settings
 * dialog. The shell owns cross-route state (gamepad detection, settings,
 * personal bests), the shared transition input latch (fix 4a), the gamepad
 * status pill and the bottom controller-hint chip (fix 4c). Pages render
 * through `motion` route transitions; gameplay stays on the existing Canvas 2D
 * engine behind the unchanged `Challenge` interface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useParams, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { useGamepad } from './hooks/useGamepad'
import { InputLockout } from './utils/inputLockout'
import { ROUTES } from './utils/routes'
import { setReducedMotion } from './engine/palette'
import { setAudioEnabled } from './engine/audio'
import {
  clearAllData,
  getAllPersonalBests,
  loadSettings,
  savePersonalBest,
  saveSettings,
} from './store/localStorage'
import { LibraryPage } from './routes/LibraryPage'
import { PlayPage, type PlayPageProps } from './routes/PlayPage'
import { SettingsPage } from './routes/SettingsPage'
import type {
  AxisMapping,
  ButtonMapping,
  GameState,
  HatSpec,
  PersonalBest,
  ScoreResult,
  Settings,
} from './types'

/** Re-mounts the play page per challenge id so each game gets a fresh engine. */
function PlayRoute(props: Omit<PlayPageProps, 'challengeId'>) {
  const { challengeId } = useParams()
  return <PlayPage key={challengeId ?? 'unknown'} challengeId={challengeId ?? ''} {...props} />
}

export default function App() {
  const { connected, gamepad, gamepads } = useGamepad(0)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [personalBests, setPersonalBests] = useState<Record<string, PersonalBest>>(() =>
    getAllPersonalBests()
  )
  const [osReducedMotion, setOsReducedMotion] = useState(false)
  const [playPhase, setPlayPhase] = useState<GameState | null>(null)


  const lockout = useMemo(() => new InputLockout(), [])
  const location = useLocation()

  const reducedMotionActive = osReducedMotion || settings.reducedMotion

  // Track the OS reduced-motion preference and keep the canvas flag in sync.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setOsReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    setReducedMotion(reducedMotionActive)
  }, [reducedMotionActive])

  // Iteration 16: the WebAudio SFX synth follows the settings toggle.
  useEffect(() => {
    setAudioEnabled(settings.audioEnabled)
  }, [settings.audioEnabled])

  // Fix 4a: arm the input latch on EVERY route transition (settings open/close
  // included) so a button held across the change cannot act on the new page.
  useEffect(() => {
    lockout.arm(performance.now())
  }, [location.key, lockout])

  // In-game phase, only meaningful while a play route is mounted. Derived on
  // render instead of synced by an effect; PlayPage reports phase changes.
  const onPlayRoute = location.pathname.startsWith('/play/')
  const activePhase = onPlayRoute ? playPhase : null

  const personalBestsRef = useRef(personalBests)
  useEffect(() => {
    personalBestsRef.current = personalBests
  }, [personalBests])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      saveSettings(next)
      return next
    })
  }, [])

  /** Replace the whole button map (used by the D-pad calibration wizard). */
  const updateMappingFull = useCallback((mapping: ButtonMapping) => {
    setSettings((prev) => {
      const next = { ...prev, customMapping: mapping }
      saveSettings(next)
      return next
    })
  }, [])

  const updateProfileMode = useCallback((mode: 'auto' | 'standard') => {
    setSettings((prev) => {
      const next = { ...prev, profileMode: mode }
      saveSettings(next)
      return next
    })
  }, [])
  const resetMapping = useCallback(() => {
    setSettings((prev) => {
      // Back to the layout detected for the connected controller, not to the
      // generic XInput defaults.
      const next = { ...prev, customMapping: undefined, customAxes: undefined, customHat: undefined }
      saveSettings(next)
      return next
    })
  }, [])

  const updateAxes = useCallback((patch: Partial<AxisMapping>) => {
    setSettings((prev) => {
      const next = { ...prev, customAxes: { ...(prev.customAxes ?? {}), ...patch } }
      saveSettings(next)
      return next
    })
  }, [])

  const updateHat = useCallback((hat: HatSpec | null) => {
    setSettings((prev) => {
      const next = { ...prev, customHat: hat }
      saveSettings(next)
      return next
    })
  }, [])

  const clearData = useCallback(() => {
    // Scoped to this app's keys — `localStorage.clear()` would wipe every
    // other site's data on the origin.
    clearAllData()
    setPersonalBests({})
    setSettings(loadSettings())
  }, [])

  const recordResult = useCallback((challengeId: string, score: ScoreResult) => {
    const existing = personalBestsRef.current[challengeId]
    if (existing && score.score <= existing.score) return
    const pb: PersonalBest = { ...score, challengeId }
    savePersonalBest(pb)
    setPersonalBests((prev) => ({ ...prev, [challengeId]: pb }))
  }, [])

  const handlePhaseChange = useCallback((phase: GameState) => setPlayPhase(phase), [])

  // Fix 4c: the hint chip hides during active gameplay (and on small screens,
  // via CSS); ☰ is only offered where it actually does something.
  const gameplayActive = activePhase === 'countdown' || activePhase === 'running'
  const onSettingsRoute = location.pathname === ROUTES.settings
  const hintVisible = connected && !gameplayActive
  const showStartHint =
    !onSettingsRoute &&
    (activePhase === null ||
      activePhase === 'idle' ||
      activePhase === 'paused' ||
      activePhase === 'result')
  const startLabel =
    activePhase === 'paused' ? 'Resume' : activePhase === 'result' ? 'Retry' : 'Play'



  return (
    <MotionConfig reducedMotion={reducedMotionActive ? 'always' : 'never'}>
      <div
        className={
          'app-shell' +
          (reducedMotionActive ? ' reduced-motion' : '') +
          (settings.highContrast ? ' high-contrast' : '')
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route
              path={ROUTES.library}
              element={
                <LibraryPage
                  connected={connected}
                  gamepad={gamepad}
                  settings={settings}
                  personalBests={personalBests}
                  lockout={lockout}
                />
              }
            />
            <Route
              path="/play/:challengeId"
              element={
                <PlayRoute
                  connected={connected}
                  gamepad={gamepad}
                  gamepads={gamepads}
                  settings={settings}
                  personalBests={personalBests}
                  onRecordResult={recordResult}
                  lockout={lockout}
                  onPhaseChange={handlePhaseChange}
                />
              }
            />
            <Route
              path={ROUTES.settings}
              element={
                <SettingsPage
                  gamepad={gamepad}
                  settings={settings}
                  onUpdateSetting={updateSetting}
                  onUpdateMappingFull={updateMappingFull}
                  onUpdateAxes={updateAxes}
                  onUpdateHat={updateHat}
                  onUpdateProfileMode={updateProfileMode}
                  onResetMapping={resetMapping}
                  onClearData={clearData}
                  lockout={lockout}
                />
              }
            />
            <Route path="*" element={<Navigate to={ROUTES.library} replace />} />
          </Routes>
        </AnimatePresence>

        {/* Fix 4c: glass chip pinned bottom-centre; aria-hidden affordance — the
            real controls are the DOM elements it describes. */}
        {hintVisible && (
          <div className="action-hints" aria-hidden="true">
            <span><kbd>A</kbd> Select</span>
            <span><kbd>B</kbd> Back</span>
            {showStartHint && <span><kbd>☰</kbd> {startLabel}</span>}
          </div>
        )}

        <div className="gamepad-status" aria-live="polite">
          <span
            className={'gamepad-indicator ' + (connected ? 'connected' : 'disconnected')}
            aria-hidden="true"
          />
          <span className="gamepad-name">{connected ? gamepad?.id : 'No controller'}</span>
        </div>
      </div>
    </MotionConfig>
  )
}

