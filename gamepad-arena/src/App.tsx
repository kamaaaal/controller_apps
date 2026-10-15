/**
 * Gamepad Arena — route-aware shell.
 *
 * A persistent canvas + game-loop + gamepad shell renders route-driven overlays:
 *   /                 → games library (home / launcher)
 *   /play/:challengeId → the active game (countdown → running → result / paused)
 *   /settings          → settings
 *
 * The engine (GameLoop/Renderer) and the gamepad navigation layer live in the
 * shell and persist across routes; routes only change which overlay shows.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import { useGamepad } from './hooks/useGamepad'
import { useFocusNavigation } from './hooks/useFocusNavigation'
import { useGamepadNavigation } from './hooks/useGamepadNavigation'
import { normalizeGamepadInput, DEFAULT_BUTTON_MAPPING, type ButtonMapping } from './utils/input'
import { adjustControl } from './utils/controlAdjust'
import { getFocusableElements, type NavDirection } from './utils/focusNavigation'
import { GameLoop } from './engine/gameLoop'
import { Renderer } from './engine/renderer'
import { setReducedMotion } from './engine/palette'
import { challenges, getChallenge } from './challenges'
import { loadPersonalBest, savePersonalBest, loadSettings, saveSettings } from './store/localStorage'
import type { GameState, ScoreResult, PersonalBest, Settings, Challenge } from './types'
import './index.css'

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

const DETAIL_LABELS: Record<string, string> = {
  presses: 'Presses',
  maxCombo: 'Max Combo',
  pressesPerSecond: 'Presses/s',
  avgInterval: 'Avg Interval',
  rotations: 'Rotations',
  simultaneousPct: 'Simultaneous',
  smoothnessPct: 'Smoothness',
  completed: 'Rounds',
  clean: 'Clean',
  bestStreak: 'Best Streak',
  avgTime: 'Avg Time',
  accuracy: 'Accuracy',
}

/** Per-challenge cover art + difficulty tag for the games library tiles. */
const CHALLENGE_META: Record<string, { icon: string; tag: string; accent: string }> = {
  'button-blitz': { icon: 'A', tag: 'Speed', accent: 'var(--face-a)' },
  'dual-orbit': { icon: '◎', tag: 'Coordination', accent: 'var(--brand-xbox-neon)' },
  'twin-target': { icon: '✛', tag: 'Precision', accent: 'var(--brand-ps)' },
}

function formatDetail(key: string, value: number): string {
  if (key === 'maxCombo') return `x${value}`
  if (key.endsWith('Pct')) return `${Math.round(value)}%`
  if (key === 'avgInterval' || key === 'avgTime') return `${value.toFixed(2)}s`
  if (key === 'accuracy') return `${Math.round(value)}%`
  if (key === 'bestStreak') return `x${value}`
  if (key === 'pressesPerSecond' || key === 'rotations') return value.toFixed(1)
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
}

/**
 * Decorative gamepad silhouette (inline SVG so it scales and inherits colour via
 * currentColor). Purely ornamental — always aria-hidden.
 */
function ControllerGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 140" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M70 34 Q110 18 150 34 Q188 46 196 92 Q200 124 172 128 Q150 130 138 104 Q122 92 110 92 Q98 92 82 104 Q70 130 48 128 Q20 124 24 92 Q32 46 70 34 Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="78" cy="74" r="12" stroke="currentColor" strokeWidth="4" />
      <circle cx="132" cy="86" r="12" stroke="currentColor" strokeWidth="4" />
      <path d="M96 92 h14 M103 85 v14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="158" cy="58" r="6" stroke="currentColor" strokeWidth="3" />
      <circle cx="158" cy="86" r="6" stroke="currentColor" strokeWidth="3" />
      <circle cx="144" cy="72" r="6" stroke="currentColor" strokeWidth="3" />
      <circle cx="172" cy="72" r="6" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const playMatch = location.pathname.match(/^\/play\/([^/]+)$/)
  const routeChallengeId = playMatch ? decodeURIComponent(playMatch[1]) : null
  const isSettings = location.pathname === '/settings'
  const isLibrary = !routeChallengeId && !isSettings

  const { connected, gamepad, gamepads } = useGamepad(0)
  const [gameState, setGameState] = useState<GameState>('idle')
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('button-blitz')
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [personalBests, setPersonalBests] = useState<Record<string, PersonalBest>>({})
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null)
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [osReducedMotion, setOsReducedMotion] = useState(false)
  const [navMode, setNavMode] = useState(false)

  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const gameLoopRef = useRef<GameLoop | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const currentChallengeRef = useRef<Challenge | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startButtonPrevRef = useRef(false)
  const resultHandledRef = useRef(false)
  const activePlayIdRef = useRef<string | null>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const keyboardStateRef = useRef({ a: false, start: false })

  const currentMapping = useMemo(() => settings.customMapping || DEFAULT_BUTTON_MAPPING, [settings.customMapping])
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

  // Keyboard fallback (testing): Space = A, Enter = Start.
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (isField(e.target)) return
      if (e.code === 'Space') keyboardStateRef.current.a = true
      else if (e.code === 'Enter') keyboardStateRef.current.start = true
    }
    const up = (e: KeyboardEvent) => {
      if (isField(e.target)) return
      if (e.code === 'Space') keyboardStateRef.current.a = false
      else if (e.code === 'Enter') keyboardStateRef.current.start = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Create the renderer + game loop once.
  useEffect(() => {
    if (!canvasContainerRef.current) return
    const renderer = new Renderer(canvasContainerRef.current)
    rendererRef.current = renderer
    const loop = new GameLoop()
    loop.setOnStateChange(setGameState)
    loop.setDrawFn(() => {
      if (currentChallengeRef.current && rendererRef.current) {
        currentChallengeRef.current.draw(rendererRef.current.getContext().ctx)
      }
    })
    gameLoopRef.current = loop
    loop.start()
    const pbs: Record<string, PersonalBest> = {}
    challenges.forEach((c) => {
      const pb = loadPersonalBest(c.id)
      if (pb) pbs[c.id] = pb
    })
    setPersonalBests(pbs)
    return () => {
      loop.destroy()
      renderer.destroy()
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  // Per-frame game input: feed the loop and the active challenge, handle Start pause/resume.
  useEffect(() => {
    if (!gameLoopRef.current || !gamepad) return
    const updateInput = () => {
      if (!gameLoopRef.current || !gamepad) return
      const input = normalizeGamepadInput(gamepad, settings.deadzone, currentMapping)
      input.buttons.a = input.buttons.a || keyboardStateRef.current.a
      input.buttons.start = input.buttons.start || keyboardStateRef.current.start
      gameLoopRef.current.setInput(input)

      const startPressed = input.buttons.start
      if (startPressed && !startButtonPrevRef.current) {
        const state = gameLoopRef.current.getState()
        if (state === 'running') gameLoopRef.current.pause()
        else if (state === 'paused') gameLoopRef.current.resume()
      }
      startButtonPrevRef.current = startPressed

      if (currentChallengeRef.current && gameLoopRef.current.getState() === 'running') {
        currentChallengeRef.current.update(1 / 60, input)
      }
      animationFrameRef.current = requestAnimationFrame(updateInput)
    }
    animationFrameRef.current = requestAnimationFrame(updateInput)
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current) }
  }, [gamepad, settings.deadzone, currentMapping])

  const startChallenge = useCallback((challengeId: string) => {
    const challenge = getChallenge(challengeId)
    if (!challenge || !gameLoopRef.current || !rendererRef.current || !gamepad) return
    resultHandledRef.current = false
    setSelectedChallengeId(challengeId)
    setGameState('idle')
    setLastResult(null)
    setCountdownValue(null)
    currentChallengeRef.current = challenge
    challenge.setup(rendererRef.current.getContext().ctx, gamepad)
    challenge.reset()
    gameLoopRef.current.startChallenge(challenge.duration)
  }, [gamepad])

  // ---- Route ↔ engine sync ---------------------------------------------
  // Start the challenge named by the route (once per route id).
  useEffect(() => {
    if (!routeChallengeId) { activePlayIdRef.current = null; return }
    if (activePlayIdRef.current === routeChallengeId) return
    if (!gameLoopRef.current || !rendererRef.current || !gamepad) return
    if (!getChallenge(routeChallengeId)) { navigate('/', { replace: true }); return }
    activePlayIdRef.current = routeChallengeId
    // startChallenge sets the selected id; avoid a direct setState in the effect.
    startChallenge(routeChallengeId)
  }, [routeChallengeId, gamepad, navigate, startChallenge])

  // Leaving a play route returns the loop to idle (so the canvas stops drawing the game).
  useEffect(() => {
    if (routeChallengeId) return
    const loop = gameLoopRef.current
    if (loop && loop.getState() !== 'idle') loop.reset()
  }, [routeChallengeId, gameState])

  // ---- Gamepad-driven UI navigation ------------------------------------
  const navEnabled = gameState !== 'running' && gameState !== 'countdown'

  const getNavScope = useCallback(
    () => (isSettings ? settingsPanelRef.current : overlayRef.current),
    [isSettings]
  )

  const { move: moveFocus } = useFocusNavigation(getNavScope)

  const handleNavigate = useCallback((direction: NavDirection) => {
    const active = document.activeElement as HTMLElement | null
    if (active && adjustControl(active, direction)) return
    moveFocus(direction)
  }, [moveFocus])

  const handleConfirm = useCallback(() => {
    const active = document.activeElement as HTMLElement | null
    if (!active) return
    if (active instanceof HTMLSelectElement) return
    if (active instanceof HTMLInputElement && active.type === 'range') return
    active.click()
  }, [])

  const goBack = useCallback(() => {
    if (isLibrary) return
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }, [isLibrary, location.key, navigate])

  const handleNavStart = useCallback(() => {
    if (isLibrary && connected) navigate(`/play/${selectedChallengeId}`)
  }, [isLibrary, connected, navigate, selectedChallengeId])

  const handleNavActivity = useCallback(() => setNavMode(true), [])

  useGamepadNavigation({
    gamepad,
    enabled: navEnabled,
    deadzone: settings.deadzone,
    mapping: currentMapping,
    onDirection: handleNavigate,
    onConfirm: handleConfirm,
    onBack: goBack,
    onStart: handleNavStart,
    onActivity: handleNavActivity,
    lockKey: `${location.pathname}:${gameState}`,
  })

  // Keyboard Escape = back (mirrors gamepad B).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      e.preventDefault()
      goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goBack])

  useEffect(() => {
    if (!navMode) return
    const off = () => setNavMode(false)
    window.addEventListener('pointerdown', off)
    window.addEventListener('mousemove', off)
    return () => {
      window.removeEventListener('pointerdown', off)
      window.removeEventListener('mousemove', off)
    }
  }, [navMode])

  // Auto-focus the right control after a route / state change.
  useEffect(() => {
    if (!navEnabled || !connected) return
    const scope = getNavScope()
    if (!scope) return
    const items = getFocusableElements(scope)
    if (items.length === 0) return
    const active = document.activeElement as HTMLElement | null
    if (active && items.includes(active) && scope.contains(active)) return
    const selectedTile = scope.querySelector<HTMLElement>('.game-tile[data-selected="true"]')
    const target = selectedTile && items.includes(selectedTile) ? selectedTile : items[0]
    target.focus()
  }, [navEnabled, connected, gameState, isSettings, routeChallengeId, location.pathname, getNavScope])

  // Record result + personal best when a run finishes.
  useEffect(() => {
    if (gameState !== 'result' || !currentChallengeRef.current) return
    if (resultHandledRef.current) return
    resultHandledRef.current = true
    const score = currentChallengeRef.current.getScore()
    setLastResult(score)
    const existingPb = personalBests[selectedChallengeId]
    if (!existingPb || score.score > existingPb.score) {
      const pb: PersonalBest = { ...score, challengeId: selectedChallengeId }
      savePersonalBest(pb)
      setPersonalBests((prev) => ({ ...prev, [selectedChallengeId]: pb }))
    }
  }, [gameState, selectedChallengeId, personalBests])

  useEffect(() => {
    if (!gameLoopRef.current) return
    let frameId: number
    const checkCountdown = () => {
      const loop = gameLoopRef.current!
      if (loop.getState() === 'countdown') setCountdownValue(loop.getCountdownValue())
      else setCountdownValue(null)
      frameId = requestAnimationFrame(checkCountdown)
    }
    checkCountdown()
    return () => cancelAnimationFrame(frameId)
  }, [gameState])

  // Settings route: focus first control + trap Tab inside the panel.
  useEffect(() => {
    if (!isSettings) return
    const panel = settingsPanelRef.current
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
        : []
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      else if (active && panel && !panel.contains(active)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isSettings])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => { const next = { ...prev, [key]: value }; saveSettings(next); return next })
  }, [])

  const updateMapping = useCallback((key: keyof ButtonMapping, value: number) => {
    setSettings((prev) => {
      const current = prev.customMapping || DEFAULT_BUTTON_MAPPING
      const next = { ...prev, customMapping: { ...current, [key]: value } }
      saveSettings(next)
      return next
    })
  }, [])

  const resetMapping = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, customMapping: undefined }
      saveSettings(next)
      return next
    })
  }, [])

  // ---- Overlay renderers ------------------------------------------------
  const renderConnect = () => (
    <div className="screen" role="alert">
      <h2 className="screen-title">CONNECT CONTROLLER</h2>
      <p className="screen-subtitle">Connect a gamepad via USB or Bluetooth, then press any button to begin.</p>
      <div style={{ marginTop: 'var(--space-xl)', padding: 'var(--space-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--fg-secondary)' }}>Supported: Xbox, PlayStation, Switch Pro, and standard Gamepad API controllers</p>
        {gamepads.length > 0 && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--accent-yellow)' }}>Detected gamepads:</p>
            <ul style={{ textAlign: 'left', marginTop: 'var(--space-xs)', paddingLeft: 'var(--space-lg)' }}>
              {gamepads.map((gp) => (
                <li key={gp.index} style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)' }}>
                  [{gp.index}] {gp.id} {gp.mapping !== 'standard' && ` (mapping: ${gp.mapping})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )

  const renderLibrary = () => (
    <div className="library">
      <header className="library-head">
        <h1 className="screen-title">GAMEPAD ARENA</h1>
        <p className="screen-subtitle">Choose your challenge</p>
      </header>
      <div className="game-grid" role="list" aria-label="Games">
        {challenges.map((challenge) => {
          const pb = personalBests[challenge.id]
          const meta = CHALLENGE_META[challenge.id] ?? { icon: '●', tag: 'Arcade', accent: 'var(--brand-xbox-neon)' }
          const isSelected = selectedChallengeId === challenge.id
          return (
            <button
              key={challenge.id}
              type="button"
              role="listitem"
              className="game-tile"
              data-selected={isSelected}
              onFocus={() => setSelectedChallengeId(challenge.id)}
              onMouseEnter={() => setSelectedChallengeId(challenge.id)}
              onClick={() => navigate(`/play/${challenge.id}`)}
              aria-label={`${challenge.name} — ${meta.tag}, ${challenge.duration} seconds${pb ? `, best ${pb.score} grade ${pb.grade}` : ''}`}
            >
              <span className="game-tile-art" aria-hidden="true" style={{ ['--tile-accent' as string]: meta.accent }}>
                {meta.icon}
              </span>
              <span className="game-tile-body">
                <span className="game-tile-name">{challenge.name}</span>
                <span className="game-tile-desc">{challenge.description}</span>
                <span className="game-tile-meta">
                  <span className="game-tile-tag">{meta.tag}</span>
                  <span className="game-tile-dur">{challenge.duration}s</span>
                </span>
                {pb && <span className="game-tile-pb">PB {pb.score.toLocaleString()} · {pb.grade}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="library-actions">
        <button className="btn btn-secondary" onClick={() => navigate('/settings')}>Settings</button>
      </div>
    </div>
  )

  const renderPaused = () => (
    <div className="screen" style={{ maxWidth: '400px' }}>
      <h2 className="screen-title">PAUSED</h2>
      <p className="screen-subtitle">Press Start or Resume to continue</p>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={() => gameLoopRef.current?.resume()}>RESUME</button>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>QUIT</button>
      </div>
    </div>
  )

  const renderResult = () => {
    if (!lastResult) return null
    const pb = personalBests[selectedChallengeId]
    const isNewPB = pb && pb.timestamp === lastResult.timestamp
    const gradeColor = { S: 'var(--accent-gold)', A: 'var(--accent-magenta)', B: 'var(--accent-cyan)', C: 'var(--accent-green)', D: 'var(--accent-orange)', F: 'var(--accent-red)' }[lastResult.grade]
    const announcement = `Challenge complete. Grade ${lastResult.grade}. Score ${lastResult.score.toLocaleString()}.${isNewPB ? ' New personal best.' : ''}`
    return (
      <div className="screen result-screen">
        <div className="sr-only" role="status" aria-live="assertive">{announcement}</div>
        <h2 className="screen-title">CHALLENGE COMPLETE</h2>
        <div className="result-grade" style={{ color: gradeColor }} aria-label={`Grade ${lastResult.grade}`}>{lastResult.grade}</div>
        <div className="result-score" aria-label={`Score ${lastResult.score.toLocaleString()}`}>{lastResult.score.toLocaleString()}</div>
        <div className="result-stats">
          {Object.entries(lastResult.details).map(([key, value]) => (
            <div className="result-stat" key={key}><span className="result-stat-label">{DETAIL_LABELS[key] ?? key}</span><span className="result-stat-value">{formatDetail(key, value)}</span></div>
          ))}
        </div>
        {isNewPB && <div className="result-pb"><span aria-hidden="true">🏆 </span>NEW PERSONAL BEST!</div>}
        <div className="btn-group">
          <button className="btn btn-primary" onClick={() => routeChallengeId && startChallenge(routeChallengeId)}>RETRY</button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>LIBRARY</button>
        </div>
      </div>
    )
  }

  const renderSettings = () => (
    <div ref={settingsPanelRef} className="screen" style={{ maxWidth: '580px' }} role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}>
      <h2 id="settings-title" className="screen-title">SETTINGS</h2>
      <div className="settings-group">
        <div className="setting-row">
          <label className="setting-label" htmlFor="set-deadzone">Deadzone</label>
          <div className="setting-control">
            <input id="set-deadzone" type="range" className="setting-slider" min="0" max="0.5" step="0.01" value={settings.deadzone} onChange={(e) => updateSetting('deadzone', parseFloat(e.target.value))} aria-label="Deadzone" aria-valuetext={`${Math.round(settings.deadzone * 100)} percent`} />
            <span style={{ fontSize: '0.75rem', color: 'var(--fg-secondary)' }}>{Math.round(settings.deadzone * 100)}%</span>
          </div>
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="set-vibration">Vibration</label>
          <div className="setting-control">
            <label className="setting-toggle"><input id="set-vibration" type="checkbox" checked={settings.vibration} onChange={(e) => updateSetting('vibration', e.target.checked)} aria-label="Vibration" /><span className="setting-toggle-slider" aria-hidden="true" /></label>
          </div>
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="set-contrast">High Contrast</label>
          <div className="setting-control">
            <label className="setting-toggle"><input id="set-contrast" type="checkbox" checked={settings.highContrast} onChange={(e) => updateSetting('highContrast', e.target.checked)} aria-label="High Contrast" /><span className="setting-toggle-slider" aria-hidden="true" /></label>
          </div>
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="set-motion">Reduced Motion</label>
          <div className="setting-control">
            <label className="setting-toggle"><input id="set-motion" type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSetting('reducedMotion', e.target.checked)} aria-label="Reduced Motion" /><span className="setting-toggle-slider" aria-hidden="true" /></label>
          </div>
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="set-audio">Audio</label>
          <div className="setting-control">
            <label className="setting-toggle"><input id="set-audio" type="checkbox" checked={settings.audioEnabled} onChange={(e) => updateSetting('audioEnabled', e.target.checked)} aria-label="Audio" /><span className="setting-toggle-slider" aria-hidden="true" /></label>
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ fontFamily: 'var(--font-ui)', color: 'var(--accent-cyan)', marginBottom: 'var(--space-md)' }}>BUTTON MAPPING</h3>
          <p className="mapping-hint">Auto-detected for known controllers. Edit below to customize.</p>
          <div className="mapping-grid">
            {(Object.keys(DEFAULT_BUTTON_MAPPING) as Array<keyof ButtonMapping>).map((key) => (
              <div key={key} className="mapping-item">
                <label className="mapping-label" htmlFor={`map-${key}`}>{BUTTON_LABELS[key]}</label>
                <select id={`map-${key}`} className="mapping-select" value={currentMapping[key]} onChange={(e) => updateMapping(key, parseInt(e.target.value, 10))}>
                  {Array.from({ length: 20 }, (_, i) => i).map((i) => (<option key={i} value={i}>Button {i}</option>))}
                </select>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 'var(--space-md)' }} onClick={resetMapping}>RESET TO DEFAULTS</button>
        </div>
      </div>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={() => navigate('/')}>DONE</button>
        <button className="btn btn-danger" onClick={() => { if (confirm('Clear all personal bests and settings?')) { localStorage.clear(); setPersonalBests({}); setSettings(loadSettings()) }}}>CLEAR DATA</button>
      </div>
    </div>
  )

  const renderOverlay = () => {
    if (!connected) return renderConnect()
    if (isSettings) return renderSettings()
    if (routeChallengeId) {
      if (gameState === 'result') return renderResult()
      if (gameState === 'paused') return renderPaused()
      return null // countdown / running / idle: canvas only
    }
    return renderLibrary()
  }

  const renderDebug = () => {
    if (!import.meta.env.DEV && !new URLSearchParams(window.location.search).has('debug')) return null
    if (!gamepad) return null
    const input = normalizeGamepadInput(gamepad, settings.deadzone, currentMapping)
    const rawPressed = gamepad.buttons.map((b, i) => b.pressed ? i : -1).filter(i => i !== -1)
    return (
      <div className="debug-overlay">
        <h4>DEBUG: {gamepad.id} [#{gamepad.index}]</h4>
        <div className="debug-row"><span className="debug-label">Mapping:</span><span className="debug-value">{gamepad.mapping}</span></div>
        <div className="debug-row"><span className="debug-label">L-Stick:</span><span className="debug-value">{input.axes.leftStick.x.toFixed(2)}, {input.axes.leftStick.y.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">R-Stick:</span><span className="debug-value">{input.axes.rightStick.x.toFixed(2)}, {input.axes.rightStick.y.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">LT/RT:</span><span className="debug-value">{input.axes.leftTrigger.toFixed(2)} / {input.axes.rightTrigger.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">Buttons:</span><span className="debug-value">{Object.entries(input.buttons).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(', ') || 'none'}</span></div>
        <div className="debug-row"><span className="debug-label">Raw Pressed:</span><span className="debug-value">{rawPressed.join(', ')}</span></div>
      </div>
    )
  }

  const containerClass =
    'canvas-container' +
    (reducedMotionActive ? ' reduced-motion' : '') +
    (settings.highContrast ? ' high-contrast' : '') +
    (navMode ? ' gamepad-nav' : '')

  const startHint = isLibrary ? 'Play' : 'Pause'
  const overlayKey = !connected
    ? 'connect'
    : isSettings
      ? 'settings'
      : routeChallengeId
        ? `play:${gameState === 'result' ? 'result' : gameState === 'paused' ? 'paused' : 'play'}`
        : 'library'

  return (
    <MotionConfig reducedMotion={reducedMotionActive ? 'always' : 'user'}>
      <div className={containerClass} ref={canvasContainerRef}>
        <div className="bg-art" aria-hidden="true">
          <ControllerGlyph className="art-xbox art-1" />
          <ControllerGlyph className="art-ps art-2" />
          <ControllerGlyph className="art-xbox art-3" />
          <ControllerGlyph className="art-ps art-4" />
        </div>
        <div className="ui-overlay" ref={overlayRef}>
          <AnimatePresence mode="wait">
            <motion.div
              key={overlayKey}
              className="route-layer"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {renderOverlay()}
            </motion.div>
          </AnimatePresence>
        </div>
        {connected && navEnabled && (
          <div className="action-hints" aria-hidden="true">
            <span><kbd>A</kbd> Select</span>
            <span><kbd>B</kbd> Back</span>
            <span><kbd>☰</kbd> {startHint}</span>
          </div>
        )}
        {gameState === 'countdown' && countdownValue !== null && (
          <div className="countdown-overlay" aria-live="polite" aria-atomic="true"><span className={"countdown-number " + (countdownValue === 0 ? 'countdown-go' : '')}>{countdownValue === 0 ? 'GO!' : countdownValue}</span></div>
        )}
        <div className="gamepad-status" aria-live="polite"><span className={"gamepad-indicator " + (connected ? 'connected' : 'disconnected')} aria-hidden="true" /><span className="gamepad-name">{connected ? gamepad?.id : 'No controller'}</span></div>
        {renderDebug()}
      </div>
    </MotionConfig>
  )
}
export default App
