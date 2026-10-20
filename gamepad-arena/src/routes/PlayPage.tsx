/**
 * `/play/:challengeId` — one challenge per route (iteration 13).
 *
 * Owns the canvas, the game loop and every in-game overlay for a single
 * challenge. Gameplay logic, scoring and the `Challenge` interface are untouched
 * from previous iterations. Route-level behaviour:
 * - entering the route arms the shared input latch (fix 4a),
 * - entering `result` re-arms it, A is vetoed on the result screen and only B
 *   (back → library) can leave it,
 * - ☰ (Start) starts the run when idle and pauses/resumes while playing,
 * - the controller is sampled once per frame by the game loop itself, so the
 *   challenge always acts on fresh input with no extra animation frame of lag.
 *
 * Iteration 18: the host no longer knows about individual games. The timer HUD
 * comes from `challenge.drawHud`, the briefing from the challenge metadata, and
 * the live score/time are mirrored into a DOM HUD for assistive tech.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { usePageNavigation } from '../hooks/usePageNavigation'
import { useStickParallax } from '../hooks/useStickParallax'
import { normalizeGamepadInput, overridesFromSettings } from '../utils/input'
import { goBackTarget, ROUTES } from '../utils/routes'
import { GameLoop } from '../engine/gameLoop'
import { Renderer } from '../engine/renderer'
import { createPixiApp, destroyPixiApp } from '../engine/pixiHost'
import { getChallenge, challenges } from '../challenges'
import { getChallengeMeta } from '../challenges/meta'
import { ControllerGlyph } from '../components/ControllerGlyph'
import type { Application } from 'pixi.js'
import type { InputLockout } from '../utils/inputLockout'
import type {
  ChallengeState,
  GameState,
  NormalizedInput,
  PersonalBest,
  ScoreResult,
  Settings,
} from '../types'

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
  patterns: 'Patterns',
  longest: 'Longest',
  mistakes: 'Mistakes',
  recallMs: 'Recall',
  locks: 'Locks',
  avgHold: 'Avg Hold',
  orbs: 'Orbs',
  lives: 'Lives',
  mazes: 'Mazes',
  walls: 'Wall Hits',
  gates: 'Gates',
  perfects: 'Perfect',
  syncs: 'Syncs',
  notesHit: 'Notes Hit',
  notesMissed: 'Missed',
  avgTimingMs: 'Avg Timing',
  cleanRounds: 'Clean Rounds',
  accuracyPct: 'Accuracy',
}

const GRADE_COLORS: Record<ScoreResult['grade'], string> = {
  S: 'var(--accent-gold)',
  A: 'var(--accent-magenta)',
  B: 'var(--accent-cyan)',
  C: 'var(--accent-green)',
  D: 'var(--accent-orange)',
  F: 'var(--accent-red)',
}

function formatDetail(key: string, value: number): string {
  if (key === 'maxCombo') return `x${value}`
  if (key.endsWith('Pct')) return `${Math.round(value)}%`
  if (key === 'avgInterval' || key === 'avgTime' || key === 'avgHold') return `${value.toFixed(2)}s`
  if (key === 'accuracy') return `${Math.round(value)}%`
  if (key === 'bestStreak') return `x${value}`
  if (key === 'recallMs' || key === 'avgTimingMs') return `${Math.round(value)}ms`
  if (key === 'pressesPerSecond' || key === 'rotations') return value.toFixed(1)
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
}

/** Live values mirrored into the DOM so they are not canvas-only. */
interface HudState {
  score: number
  remaining: number
  progress: number
}

export interface PlayPageProps {
  challengeId: string
  connected: boolean
  gamepad: Gamepad | null
  gamepads: Gamepad[]
  settings: Settings
  personalBests: Record<string, PersonalBest>
  onRecordResult: (challengeId: string, score: ScoreResult) => void
  lockout: InputLockout
  onPhaseChange: (phase: GameState) => void
}

export function PlayPage({
  challengeId,
  connected,
  gamepad,
  gamepads,
  settings,
  personalBests,
  onRecordResult,
  lockout,
  onPhaseChange,
}: PlayPageProps) {
  const navigate = useNavigate()
  const challenge = getChallenge(challengeId)
  const meta = getChallengeMeta(challengeId)

  const [gameState, setGameState] = useState<GameState>('idle')
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null)
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [pixiReady, setPixiReady] = useState(false)
  const [hud, setHud] = useState<HudState>({ score: 0, remaining: 0, progress: 0 })
  /** The personal best as it stood when the current run started. */
  const [pbAtStart, setPbAtStart] = useState<PersonalBest | undefined>(undefined)

  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const bgArtRef = useRef<HTMLDivElement>(null)
  const pixiAppRef = useRef<Application | null>(null)
  const gameLoopRef = useRef<GameLoop | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const currentChallengeRef = useRef<ReturnType<typeof getChallenge>>(null)
  const latestStateRef = useRef<ChallengeState | null>(null)
  const startButtonPrevRef = useRef(false)
  const resultHandledRef = useRef(false)
  const keyboardStateRef = useRef({ a: false, start: false, escape: false })

  // Per-device input overrides (button map, axis map, hat switch). These are
  // layered on top of the profile detected for the connected controller.
  const currentOverrides = useMemo(() => overridesFromSettings(settings), [settings])

  // Latest input settings, read by the loop's sampler without re-creating it.
  const gamepadRef = useRef(gamepad)
  const mappingRef = useRef(currentOverrides)
  const deadzoneRef = useRef(settings.deadzone)
  useEffect(() => {
    gamepadRef.current = gamepad
    mappingRef.current = currentOverrides
    deadzoneRef.current = settings.deadzone
  }, [gamepad, currentOverrides, settings.deadzone])

  // Report the in-game phase to the shell (it drives the hint chip).
  useEffect(() => {
    onPhaseChange(gameState)
  }, [gameState, onPhaseChange])

  // Iteration 14: background controller art drifts with the left stick.
  useStickParallax(bgArtRef, gamepad, settings.deadzone)

  // B = real navigation (fallback to the library for deep links).
  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (goBackTarget(idx) === 'back') navigate(-1)
    else navigate(ROUTES.library, { replace: true })
  }, [navigate])

  // Keyboard fallback for testing (Space = A, Enter = ☰, Escape = quit to menu).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (e.code === 'Space') keyboardStateRef.current.a = true
      else if (e.code === 'Enter') keyboardStateRef.current.start = true
      else if (e.code === 'Escape') keyboardStateRef.current.escape = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (e.code === 'Space') keyboardStateRef.current.a = false
      else if (e.code === 'Enter') keyboardStateRef.current.start = false
      else if (e.code === 'Escape') keyboardStateRef.current.escape = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Engine init: the game loop owns the clock, the input sampling and the
  // simulation. A Canvas 2D renderer is only created for canvas2d challenges —
  // pixi challenges get their own lazily imported app below (iteration 15),
  // keeping pixi.js out of the Canvas path.
  useEffect(() => {
    if (!canvasContainerRef.current) return
    if (challenge?.renderMode !== 'pixi') {
      rendererRef.current = new Renderer(canvasContainerRef.current)
    }
    const loop = new GameLoop()
    loop.setOnStateChange(setGameState)

    // Sample the controller exactly once per rendered frame, ahead of the
    // simulation. This replaces the old second animation frame that drove the
    // challenge with a hardcoded 1/60 step.
    loop.setInputProvider((): NormalizedInput | null => {
      const pad = gamepadRef.current
      if (!pad) return null
      const input = normalizeGamepadInput(pad, deadzoneRef.current, mappingRef.current)

      // Merge keyboard state for testing
      input.buttons.a = input.buttons.a || keyboardStateRef.current.a
      input.buttons.start = input.buttons.start || keyboardStateRef.current.start

      // ☰ toggles pause/resume
      const startPressed = input.buttons.start
      if (startPressed && !startButtonPrevRef.current) {
        const state = loop.getState()
        if (state === 'running') loop.pause()
        else if (state === 'paused') loop.resume()
      }
      startButtonPrevRef.current = startPressed

      // Escape quits a run back to the idle screen
      if (keyboardStateRef.current.escape) {
        const state = loop.getState()
        if (state === 'running' || state === 'paused') loop.reset()
      }

      return input
    })

    // Drive the challenge from the loop's fixed timestep.
    loop.setUpdateFn((dt: number, input: NormalizedInput) => {
      const current = currentChallengeRef.current
      if (!current) return
      const state = current.update(dt, input)
      latestStateRef.current = state
      // Challenge-driven early finish (e.g. Gravity Jockey: both ships docked).
      if (state.metadata.finished === true) loop.finish()
    })

    loop.setDrawFn(() => {
      const current = currentChallengeRef.current
      const state = loop.getState()

      if (current) {
        if (current.renderMode === 'pixi') {
          current.drawPixi?.()
          pixiAppRef.current?.render()
        } else if (rendererRef.current) {
          current.draw?.(rendererRef.current)
          current.drawHud?.(rendererRef.current, loop.getTimeRemaining())
        }
      }

      // Countdown overlay value (only changes once per second).
      const cd = state === 'countdown' ? loop.getCountdownValue() : null
      setCountdownValue((prev) => (prev === cd ? prev : cd))

      // Mirror the live score/time into the DOM HUD for assistive tech. The
      // update only happens when a displayed value actually changes.
      const score = latestStateRef.current?.score ?? 0
      const remaining = loop.getTimeRemaining()
      const progress = loop.getProgress()
      setHud((prev) =>
        prev.score === score &&
        Math.abs(prev.remaining - remaining) < 0.05 &&
        Math.abs(prev.progress - progress) < 0.005
          ? prev
          : { score, remaining, progress }
      )
    })

    gameLoopRef.current = loop
    loop.start()
    return () => {
      loop.destroy()
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, [challenge])

  // Pixi challenges: create the app once per mount. This dynamic import is the
  // ONLY place pixi.js is fetched — the Canvas 2D games never pay for it.
  useEffect(() => {
    if (challenge?.renderMode !== 'pixi' || !canvasContainerRef.current) return
    let cancelled = false
    setPixiReady(false)
    createPixiApp(canvasContainerRef.current)
      .then((app: Application) => {
        if (cancelled) {
          destroyPixiApp(app)
          return
        }
        pixiAppRef.current = app
        setPixiReady(true)
      })
      .catch((err: unknown) => {
        console.error('[Pixi] failed to initialise', err)
      })
    return () => {
      cancelled = true
      destroyPixiApp(pixiAppRef.current)
      pixiAppRef.current = null
    }
  }, [challenge])

  // Result handling: score, PB, and — fix 4a — arm the input latch so a button
  // still held (or mid-mash) at the transition cannot dismiss the result screen.
  useEffect(() => {
    if (gameState !== 'result' || !currentChallengeRef.current) return
    if (resultHandledRef.current) return
    resultHandledRef.current = true
    const score = currentChallengeRef.current.getScore()
    setLastResult(score)
    lockout.arm(performance.now())
    onRecordResult(challengeId, score)
  }, [gameState, challengeId, lockout, onRecordResult])

  const startChallenge = useCallback(
    (id: string) => {
      const next = getChallenge(id)
      const loop = gameLoopRef.current
      if (!next || !loop) return
      const isPixi = next.renderMode === 'pixi'
      if (isPixi && !pixiAppRef.current) return
      if (!isPixi && !rendererRef.current) return

      resultHandledRef.current = false
      latestStateRef.current = null
      setPbAtStart(personalBests[id])
      setGameState('idle')
      setLastResult(null)
      setCountdownValue(null)
      setHud({ score: 0, remaining: next.duration, progress: 0 })
      currentChallengeRef.current = next

      if (isPixi) {
        next.setupPixi?.(pixiAppRef.current!, gamepadRef.current)
      } else {
        next.setup?.(rendererRef.current!, gamepadRef.current!)
      }
      next.reset()
      loop.startChallenge(next.duration)
    },
    [personalBests]
  )

  // ---- Gamepad-driven navigation for this route ---------------------------
  const navEnabled = gameState !== 'running' && gameState !== 'countdown'
  // A pixi challenge can't start until its lazily-loaded app is ready.
  const pixiPending = challenge?.renderMode === 'pixi' && !pixiReady

  const { navMode } = usePageNavigation({
    gamepad,
    enabled: navEnabled,
    deadzone: settings.deadzone,
    mapping: currentOverrides,
    lockout,
    getScope: () => overlayRef.current,
    // Fix 4a: A never activates anything on the result screen — only B leaves it.
    canConfirm: () => gameState !== 'result',
    onBack: () => {
      const state = gameLoopRef.current?.getState()
      if (state === 'running' || state === 'countdown') return
      // idle / paused / result → leave the game via real navigation.
      goBack()
    },
    onStart: () => {
      // ☰ retries a finished run (instant restart for gamepad users) and is a
      // no-op mid-run — pause/resume is handled by the Start toggle in the
      // input sampler. The transition lock-out still guards a held Start.
      if (!connected || pixiPending) return
      const state = gameLoopRef.current?.getState()
      if (state === 'idle' || state === 'result') startChallenge(challengeId)
    },
  })

  // Unknown challenge id → friendly dead end instead of a broken screen.
  if (!challenge) {
    return (
      <motion.div
        className="page"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <div className="screen">
          <h2 className="screen-title">CHALLENGE NOT FOUND</h2>
          <p className="screen-subtitle">Nothing here for “{challengeId}”.</p>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={goBack}>
              BACK TO LIBRARY
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  const pb = personalBests[challengeId]
  const previousPb = pbAtStart
  const isNewPB = previousPb !== undefined && lastResult !== null && lastResult.score > previousPb.score
  const scoreDelta = previousPb && lastResult ? lastResult.score - previousPb.score : 0

  // The next challenge in the library lineup (never the dev-only showcase).
  const production = challenges.filter((c) => c.id !== 'pixi-demo')
  const currentIndex = production.findIndex((c) => c.id === challengeId)
  const nextChallenge = currentIndex >= 0 ? production[(currentIndex + 1) % production.length] : undefined

  const renderConnect = () => (
    <div className="screen" role="alert">
      <h2 className="screen-title">CONNECT CONTROLLER</h2>
      <p className="screen-subtitle">Connect a gamepad via USB or Bluetooth, then press any button to begin.</p>
      <div className="connect-note">
        <p className="connect-note-body">
          Supported: Xbox, PlayStation, Switch Pro, and standard Gamepad API controllers
        </p>
        {gamepads.length > 0 && (
          <div className="connect-detected">
            <p className="connect-detected-label">Detected gamepads:</p>
            <ul className="connect-detected-list">
              {gamepads.map((gp) => (
                <li key={gp.index}>
                  [{gp.index}] {gp.id} {gp.mapping !== 'standard' && ` (mapping: ${gp.mapping})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )

  const renderBriefing = () => (
    <div className="briefing">
      <h3 className="briefing-title">HOW TO PLAY</h3>
      <ul className="briefing-list">
        {meta.instructions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="briefing-tags">
        {meta.skills.map((skill) => (
          <span className="meta-chip" key={skill}>
            {skill}
          </span>
        ))}
        <span className="meta-chip meta-chip-difficulty">{meta.difficulty}</span>
      </div>
    </div>
  )

  const renderScreen = () => {
    if (!connected) return renderConnect()

    switch (gameState) {
      case 'idle':
        return (
          <div className="screen play-idle-screen">
            <h2 className="screen-title">{challenge.name.toUpperCase()}</h2>
            <p className="screen-subtitle">{challenge.description}</p>
            {renderBriefing()}
            {pb && (
              <div className="play-pb">
                PB: {pb.score.toLocaleString()} ({pb.grade})
              </div>
            )}
            <div className="btn-group">
              <button
                className="btn btn-primary"
                onClick={() => startChallenge(challengeId)}
                disabled={!connected || pixiPending}
              >
                {pixiPending ? 'LOADING…' : 'PLAY'}
              </button>
              <button className="btn btn-secondary" onClick={goBack}>
                LIBRARY
              </button>
              <button className="btn btn-secondary" onClick={() => navigate(ROUTES.settings)}>
                SETTINGS
              </button>
            </div>
          </div>
        )
      case 'countdown':
      case 'running':
        return null
      case 'paused':
        return (
          <div className="screen paused-screen">
            <h2 className="screen-title">PAUSED</h2>
            <p className="screen-subtitle">Press ☰ or click Resume to continue</p>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => gameLoopRef.current?.resume()}>
                RESUME
              </button>
              <button className="btn btn-secondary" onClick={goBack}>
                QUIT
              </button>
            </div>
          </div>
        )
      case 'result': {
        if (!lastResult) return null
        const announcement = `Challenge complete. Grade ${lastResult.grade}. Score ${lastResult.score.toLocaleString()}.${isNewPB ? ' New personal best.' : ''}`
        return (
          <div className="screen result-screen">
            <div className="sr-only" role="status" aria-live="assertive">
              {announcement}
            </div>
            <h2 className="screen-title">CHALLENGE COMPLETE</h2>
            <div
              className="result-grade"
              style={{ color: GRADE_COLORS[lastResult.grade] }}
              aria-label={`Grade ${lastResult.grade}`}
            >
              {lastResult.grade}
            </div>
            <div className="result-score" aria-label={`Score ${lastResult.score.toLocaleString()}`}>
              {lastResult.score.toLocaleString()}
            </div>
            <div className="result-delta">
              {isNewPB ? (
                <span className="result-delta-up">NEW BEST · +{scoreDelta.toLocaleString()}</span>
              ) : previousPb ? (
                <span className={scoreDelta >= 0 ? 'result-delta-up' : 'result-delta-down'}>
                  {scoreDelta >= 0 ? '+' : ''}
                  {scoreDelta.toLocaleString()} vs best
                </span>
              ) : (
                <span className="result-delta-new">FIRST RUN</span>
              )}
            </div>
            <div className="result-stats">
              {Object.entries(lastResult.details).map(([key, value]) => (
                <div className="result-stat" key={key}>
                  <span className="result-stat-label">{DETAIL_LABELS[key] ?? key}</span>
                  <span className="result-stat-value">{formatDetail(key, value)}</span>
                </div>
              ))}
            </div>
            {isNewPB && (
              <div className="result-pb">
                <span aria-hidden="true">🏆 </span>NEW PERSONAL BEST!
              </div>
            )}
            <div className="btn-group">
              {/* A is vetoed on this screen (fix 4a) — RETRY is pointer/keyboard
                  only; gamepad users press B for the library and replay there. */}
              <button className="btn btn-primary" onClick={() => startChallenge(challengeId)}>
                RETRY
              </button>
              {nextChallenge && nextChallenge.id !== challengeId && (
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate(`/play/${nextChallenge.id}`)}
                >
                  NEXT: {nextChallenge.name.toUpperCase()}
                </button>
              )}
              <button className="btn btn-secondary" onClick={goBack}>
                MENU
              </button>
            </div>
          </div>
        )
      }
      default:
        return null
    }
  }

  const renderDebug = () => {
    if (!import.meta.env.DEV && !new URLSearchParams(window.location.search).has('debug')) return null
    if (!gamepad) return null
    const input = normalizeGamepadInput(gamepad, settings.deadzone, currentOverrides)
    const rawPressed = gamepad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i !== -1)
    return (
      <div className="debug-overlay">
        <h4>DEBUG: {gamepad.id} [#{gamepad.index}]</h4>
        <div className="debug-row"><span className="debug-label">Mapping:</span><span className="debug-value">{gamepad.mapping}</span></div>
        <div className="debug-row"><span className="debug-label">L-Stick:</span><span className="debug-value">{input.axes.leftStick.x.toFixed(2)}, {input.axes.leftStick.y.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">R-Stick:</span><span className="debug-value">{input.axes.rightStick.x.toFixed(2)}, {input.axes.rightStick.y.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">D-Pad:</span><span className="debug-value">{input.dpad.x.toFixed(2)}, {input.dpad.y.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">LT/RT:</span><span className="debug-value">{input.axes.leftTrigger.toFixed(2)} / {input.axes.rightTrigger.toFixed(2)}</span></div>
        <div className="debug-row"><span className="debug-label">Buttons:</span><span className="debug-value">{Object.entries(input.buttons).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(', ') || 'none'}</span></div>
        <div className="debug-row"><span className="debug-label">Raw Pressed:</span><span className="debug-value">{rawPressed.join(', ')}</span></div>
      </div>
    )
  }

  const containerClass = 'canvas-container' + (navMode ? ' gamepad-nav' : '')
  const hudVisible = gameState === 'countdown' || gameState === 'running' || gameState === 'paused'

  return (
    <motion.div
      className={containerClass}
      ref={canvasContainerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      <div className="bg-art" aria-hidden="true" ref={bgArtRef}>
        <div className="art-slot art-1">
          <ControllerGlyph className="art-xbox" />
        </div>
        <div className="art-slot art-2">
          <ControllerGlyph className="art-ps" />
        </div>
        <div className="art-slot art-3">
          <ControllerGlyph className="art-xbox" />
        </div>
        <div className="art-slot art-4">
          <ControllerGlyph className="art-ps" />
        </div>
      </div>

      {/* DOM mirror of the live score/time so the HUD is not canvas-only. */}
      {hudVisible && (
        <div className="hud-bar">
          <div className="hud-progress" role="presentation">
            <span className="hud-progress-fill" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </div>
          <div className="hud-stats">
            <span className="hud-stat">
              <span className="hud-label">SCORE</span>
              <span className="hud-value">{hud.score.toLocaleString()}</span>
            </span>
            <span className="hud-stat">
              <span className="hud-label">TIME</span>
              <span className={'hud-value' + (hud.remaining <= 5 ? ' hud-value-danger' : '')}>
                {hud.remaining.toFixed(1)}s
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="ui-overlay" ref={overlayRef}>
        {renderScreen()}
      </div>
      {gameState === 'countdown' && countdownValue !== null && (
        <div className="countdown-overlay" aria-live="polite" aria-atomic="true">
          <motion.span
            key={countdownValue}
            className={'countdown-number ' + (countdownValue === 0 ? 'countdown-go' : '')}
            initial={{ scale: 1.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {countdownValue === 0 ? 'GO!' : countdownValue}
          </motion.span>
        </div>
      )}
      {renderDebug()}
    </motion.div>
  )
}
