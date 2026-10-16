/**
 * `/` — the games library (iteration 13).
 *
 * The home is a launcher-style dashboard: a responsive grid of glass game tiles
 * with cover art, description, difficulty and personal best. Click/A on a card
 * routes into the game (`/play/:challengeId`); ☰ (Start) opens the selected
 * card. B has nothing above the library to back out to, so it is a no-op.
 */

import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { challenges } from '../challenges'
import { getChallengeMeta, type ChallengeGlyph } from '../challenges/meta'
import { playPath, ROUTES } from '../utils/routes'
import { DEFAULT_BUTTON_MAPPING } from '../utils/input'
import { usePageNavigation } from '../hooks/usePageNavigation'
import { useStickParallax } from '../hooks/useStickParallax'
import { ControllerGlyph } from '../components/ControllerGlyph'
import type { InputLockout } from '../utils/inputLockout'
import type { PersonalBest, Settings } from '../types'

/** Decorative cover art per game (inline SVG, aria-hidden — no image assets). */
function GameGlyph({ kind }: { kind: ChallengeGlyph }) {
  if (kind === 'blitz') {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M36 6 L14 36 h14 L26 58 L50 26 h-15 Z"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'orbit') {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="32" cy="10" r="5" stroke="currentColor" strokeWidth="3" />
        <circle cx="32" cy="54" r="5" stroke="currentColor" strokeWidth="3" />
      </svg>
    )
  }
  if (kind === 'twin') {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <circle cx="20" cy="32" r="10" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="46" cy="32" r="10" stroke="currentColor" strokeWidth="3.5" />
        <path d="M30 32 h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'thread') {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <path d="M14 58 C 24 40, 12 28, 22 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M42 58 C 52 40, 40 28, 50 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M6 34 h14 M44 34 h14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="18" cy="20" r="3.5" fill="currentColor" />
        <circle cx="46" cy="46" r="3.5" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'gravity') {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <ellipse cx="32" cy="32" rx="26" ry="14" stroke="currentColor" strokeWidth="2.5" transform="rotate(-20 32 32)" />
        <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="54" cy="24" r="3.5" fill="currentColor" />
        <circle cx="10" cy="40" r="2.5" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="6" fill="currentColor" />
      <path d="M32 14 A18 18 0 0 1 50 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 50 A18 18 0 0 1 14 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 4 A28 28 0 0 1 60 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M32 60 A28 28 0 0 1 4 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

interface LibraryPageProps {
  connected: boolean
  gamepad: Gamepad | null
  settings: Settings
  personalBests: Record<string, PersonalBest>
  lockout: InputLockout
}

export function LibraryPage({ connected, gamepad, settings, personalBests, lockout }: LibraryPageProps) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(challenges[0]?.id ?? 'button-blitz')
  const scopeRef = useRef<HTMLDivElement>(null)
  const bgArtRef = useRef<HTMLDivElement>(null)

  // Iteration 14: the background controller art reacts to the left stick.
  useStickParallax(bgArtRef, gamepad, settings.deadzone)

  const openGame = (challengeId: string) => navigate(playPath(challengeId))

  const { navMode } = usePageNavigation({
    gamepad,
    enabled: true,
    deadzone: settings.deadzone,
    mapping: settings.customMapping || DEFAULT_BUTTON_MAPPING,
    lockout,
    getScope: () => scopeRef.current,
    selectedSelector: '.game-card.selected',
    onBack: () => {
      // The library is the root of the app — there is nothing to back out to.
    },
    onStart: () => {
      if (connected) openGame(selectedId)
    },
  })

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
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
      {/* Iteration 17: full-bleed transparent layout — no panel container, so
          the library grid breathes without scrolling. */}
      <div ref={scopeRef} className={'library' + (navMode ? ' gamepad-nav' : '')}>
        <header className="library-header">
          <ControllerGlyph className="library-logo" />
          <div className="library-heading">
            <h1 className="screen-title">GAMEPAD ARENA</h1>
            <p className="library-tagline">Pick a challenge — grab a controller and go.</p>
          </div>
        </header>

        {!connected && (
          <div className="connect-note" role="alert">
            <p className="connect-note-title">No controller detected</p>
            <p className="connect-note-body">
              Connect a gamepad via USB or Bluetooth, then press any button. Supported: Xbox,
              PlayStation, Switch Pro and standard Gamepad API controllers.
            </p>
          </div>
        )}

        <div className="library-grid" role="listbox" aria-label="Games library">
          {challenges.map((challenge) => {
            const meta = getChallengeMeta(challenge.id)
            const pb = personalBests[challenge.id]
            const isSelected = selectedId === challenge.id
            const cardStyle = {
              '--card-accent': meta.accent,
              '--card-accent-soft': meta.accentSoft,
            } as CSSProperties
            return (
              <motion.div
                key={challenge.id}
                className={'game-card' + (isSelected ? ' selected' : '')}
                style={cardStyle}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                whileHover={{ y: -4 }}
                onClick={() => {
                  setSelectedId(challenge.id)
                  openGame(challenge.id)
                }}
                onFocus={() => setSelectedId(challenge.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openGame(challenge.id)
                  }
                }}
              >
                <div className="game-card-art" aria-hidden="true">
                  <GameGlyph kind={meta.glyph} />
                </div>
                <div className="game-card-body">
                  <h2 className="game-card-name">{challenge.name}</h2>
                  <p className="game-card-desc">{challenge.description}</p>
                </div>
                <div className="game-card-meta">
                  <span className="meta-chip">{challenge.duration}s</span>
                  <span className="meta-chip meta-chip-difficulty">{meta.difficulty}</span>
                </div>
                {pb ? (
                  <div className="game-card-pb">
                    PB {pb.score.toLocaleString()} · {pb.grade}
                  </div>
                ) : (
                  <div className="game-card-pb game-card-pb-empty">No record yet</div>
                )}
              </motion.div>
            )
          })}
        </div>

        <div className="btn-group library-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              if (connected) openGame(selectedId)
            }}
            disabled={!connected}
          >
            PLAY
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(ROUTES.settings)}>
            SETTINGS
          </button>
        </div>
      </div>
    </motion.div>
  )
}

