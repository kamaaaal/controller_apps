/**
 * Pattern Lock — memory + button accuracy.
 *
 * Four face pads (A / B / X / Y) light up in sequence; the player reproduces
 * the sequence in order. A wrong pad replays the same pattern (Simon-style)
 * but breaks the streak, so the pressure is on recall speed rather than on
 * punishing a single slip.
 *
 * Difficulty comes from two dials: the pattern grows every second cleared
 * pattern, and the flash window shrinks as it grows — the longer the
 * sequence, the less time each note is on screen.
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, isReducedMotion } from '../../engine/palette'
import { Fx } from '../../engine/fx'
import { playSfx } from '../../engine/audio'
import { TIMING } from '../../config/timing'
import { formatSecondsRemaining } from '../../utils/timerFormat'
import { mulberry32 } from '../../utils/rng'
import {
  FACES,
  MIN_PATTERN_LENGTH,
  generatePattern,
  gradeFor,
  isCorrectStep,
  patternLength,
  patternScore,
  recallBonus,
  type Face,
} from './pattern'

type Phase = 'show' | 'prompt' | 'input'

/** Face pad colours — matched to the Xbox face buttons, and each pad also
 *  carries its letter so the colour is never the only cue. */
const FACE_COLORS: Record<Face, string> = {
  a: PALETTE.faceA,
  b: PALETTE.faceB,
  x: PALETTE.faceX,
  y: PALETTE.faceY,
}

const FACE_LABELS: Record<Face, string> = { a: 'A', b: 'B', x: 'X', y: 'Y' }

interface PadFlash {
  face: Face
  life: number
}

export class PatternLockChallenge implements Challenge {
  id = 'pattern-lock'
  name = 'Pattern Lock'
  description = 'Memorise the pad sequence, then replay it from memory'
  duration = TIMING.challengeDurations['pattern-lock']

  private renderer: Renderer | null = null
  private fx = new Fx(isReducedMotion)

  private phase: Phase = 'show'
  private phaseTime = 0
  private pattern: Face[] = []
  private patternIndex = 0
  private inputIndex = 0
  private flash: PadFlash | null = null

  private patternsCleared = 0
  private longestPattern = 0
  private mistakes = 0
  private streak = 0
  private bestStreak = 0
  private score = 0
  private sessionTime = 0
  private recallLatencyMs = -1
  private recallSumMs = 0
  private recallSamples = 0

  private prevButtons: Record<Face, boolean> = { a: false, b: false, x: false, y: false }
  private banner: { text: string; color: string; life: number } = {
    text: '',
    color: PALETTE.ink,
    life: 0,
  }

  setup(renderer: Renderer, _gamepad: Gamepad): void {
    this.renderer = renderer
    this.reset()
  }

  reset(): void {
    this.phase = 'show'
    this.phaseTime = 0
    this.pattern = []
    this.patternIndex = 0
    this.inputIndex = 0
    this.flash = null
    this.patternsCleared = 0
    this.longestPattern = 0
    this.mistakes = 0
    this.streak = 0
    this.bestStreak = 0
    this.score = 0
    this.sessionTime = 0
    this.recallLatencyMs = -1
    this.recallSumMs = 0
    this.recallSamples = 0
    this.prevButtons = { a: false, b: false, x: false, y: false }
    this.banner = { text: '', color: PALETTE.ink, life: 0 }
    this.fx.clear()
    this.nextPattern()
  }

  /** Build and start showing the next pattern. */
  private nextPattern(): void {
    const length = patternLength(this.patternsCleared)
    this.pattern = generatePattern(mulberry32(Math.floor(Math.random() * 1e9)), length)
    this.patternIndex = 0
    this.inputIndex = 0
    this.phase = 'show'
    this.phaseTime = 0
    this.recallLatencyMs = -1
  }

  /** Seconds a single note stays lit. Shrinks as patterns get longer. */
  private get beat(): number {
    const length = this.pattern.length || MIN_PATTERN_LENGTH
    const extra = Math.max(0, length - MIN_PATTERN_LENGTH)
    return Math.max(0.26, TIMING.patternLockBeatSeconds - extra * 0.02)
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.sessionTime += dt
    this.phaseTime += dt
    this.fx.update(dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)
    if (this.flash) {
      this.flash.life -= dt
      if (this.flash.life <= 0) this.flash = null
    }

    if (this.phase === 'show') {
      if (this.phaseTime >= this.beat) {
        this.phaseTime = 0
        if (this.patternIndex < this.pattern.length) {
          const face = this.pattern[this.patternIndex]
          this.flash = { face, life: TIMING.patternLockFlashSeconds }
          this.patternIndex++
          playSfx('hit')
        } else {
          this.phase = 'prompt'
        }
      }
    } else if (this.phase === 'prompt') {
      if (this.phaseTime >= TIMING.patternLockPromptSeconds) {
        this.phase = 'input'
        this.phaseTime = 0
        this.inputIndex = 0
        this.banner = { text: 'YOUR TURN', color: PALETTE.gold, life: 0.9 }
      }
    } else {
      this.handleInput(input)
    }

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: {
        patterns: this.patternsCleared,
        streak: this.streak,
        phase: this.phase,
      },
    }
  }

  private handleInput(input: NormalizedInput): void {
    const pressed = input.buttons
    for (const face of FACES) {
      const isDown = pressed[face]
      if (isDown && !this.prevButtons[face]) {
        this.onFacePressed(face)
      }
      this.prevButtons[face] = isDown
    }
  }

  private onFacePressed(face: Face): void {
    if (this.inputIndex === 0 && this.recallLatencyMs < 0) {
      this.recallLatencyMs = Math.round(this.phaseTime * 1000)
    }

    if (!isCorrectStep(this.pattern, this.inputIndex, face)) {
      this.mistakes++
      this.streak = 0
      this.banner = { text: 'WRONG PAD', color: PALETTE.red, life: 0.9 }
      playSfx('miss')
      this.fx.shake(7, 0.25)
      // Replay the same pattern so the player can learn it — the cost is the
      // broken streak and the lost time.
      this.nextPattern()
      return
    }

    this.flash = { face, life: TIMING.patternLockFlashSeconds }
    playSfx(this.streak > 0 && this.streak % 4 === 0 ? 'combo' : 'hit')
    this.inputIndex++

    if (this.inputIndex >= this.pattern.length) {
      this.completePattern()
    }
  }

  private completePattern(): void {
    const length = this.pattern.length
    const points = patternScore(length, this.streak)
    const bonus = recallBonus(this.recallLatencyMs, length)
    this.score += points + bonus
    this.streak++
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    this.patternsCleared++
    this.longestPattern = Math.max(this.longestPattern, length)

    if (this.recallLatencyMs >= 0) {
      this.recallSumMs += this.recallLatencyMs
      this.recallSamples++
    }

    this.banner = {
      text: bonus > 0 ? `CLEARED +${points + bonus}  (INSTANT RECALL)` : `CLEARED +${points}`,
      color: PALETTE.gold,
      life: 1.1,
    }
    playSfx('sync')
    this.fx.shake(4, 0.2)

    const cx = this.renderer?.getContext().width ?? 640
    const cy = this.renderer?.getContext().height ?? 360
    this.fx.burst({ x: cx, y: cy, color: PALETTE.gold, count: 20, speed: 260 })
    this.fx.floatText({ x: cx, y: cy - 60, text: `+${points + bonus}`, color: PALETTE.gold })

    this.nextPattern()
  }

  draw(renderer: Renderer): void {
    const r = this.renderer ?? renderer
    const { width, height } = r.getContext()
    const cx = width / 2
    const cy = height / 2

    r.drawBackdrop()

    r.drawStrokeText('PATTERN LOCK', cx, 56, {
      font: '32px "JetBrains Mono", monospace',
      fillColor: PALETTE.gold,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 18,
    })

    // Progress dots: one per note in the current pattern.
    const dotY = 104
    const dotGap = 26
    const startX = cx - ((this.pattern.length - 1) * dotGap) / 2
    for (let i = 0; i < this.pattern.length; i++) {
      const done = this.phase === 'input' && i < this.inputIndex
      const active = this.phase === 'show' && i === this.patternIndex - 1 && this.flash !== null
      r.drawCircle(startX + i * dotGap, dotY, 7, {
        fillColor: done ? PALETTE.success : active ? PALETTE.gold : PALETTE.ringTrack,
        strokeColor: done ? PALETTE.success : PALETTE.stroke,
        lineWidth: 2,
        glow: done || active ? 12 : 0,
      })
    }

    // The four pads, laid out like an Xbox face-button cluster.
    const padY = cy + 20
    const padRadius = 44
    const padPos: Record<Face, { x: number; y: number; r: number }> = {
      x: { x: cx - 112, y: padY - 24, r: padRadius },
      y: { x: cx, y: padY - 128, r: padRadius },
      a: { x: cx, y: padY + 96, r: padRadius + 6 },
      b: { x: cx + 112, y: padY - 24, r: padRadius },
    }

    for (const face of FACES) {
      const { x: px, y: py, r: radius } = padPos[face]
      const lit = this.flash?.face === face
      const color = FACE_COLORS[face]
      const scale = lit ? 1.12 : 1

      r.drawCircle(px, py, radius * scale, {
        fillColor: lit ? color : 'rgba(12, 18, 26, 0.85)',
        strokeColor: color,
        lineWidth: lit ? 6 : 3,
        glow: lit ? 28 : 10,
        glowColor: color,
      })
      r.drawStrokeText(FACE_LABELS[face], px, py, {
        font: 'bold 30px "JetBrains Mono", monospace',
        fillColor: lit ? '#ffffff' : color,
        strokeColor: '#000',
        lineWidth: 4,
        glow: lit ? 14 : 0,
      })
      if (lit) {
        r.drawCircle(px, py, radius * 1.3, {
          strokeColor: color,
          lineWidth: 2,
          glow: 16,
          glowColor: color,
        })
      }
    }

    // Phase banner.
    const phaseLabel =
      this.phase === 'show' ? 'WATCH' : this.phase === 'prompt' ? 'READY…' : 'REPEAT IT'
    r.drawCenteredText(
      this.banner.life > 0 ? this.banner.text : phaseLabel,
      cx,
      padY + 190,
      {
        font: 'bold 24px "JetBrains Mono", monospace',
        color: this.banner.life > 0 ? this.banner.color : PALETTE.ink,
        glow: 12,
      }
    )

    r.drawCenteredText(
      `CLEARED ${this.patternsCleared}   STREAK x${this.streak}   MISTAKES ${this.mistakes}`,
      cx,
      height - 46,
      { font: '16px "JetBrains Mono", monospace', color: PALETTE.inkDim }
    )

    this.fx.draw(r)
  }

  drawHud(renderer: Renderer, timeRemaining: number): void {
    const r = this.renderer ?? renderer
    const { width } = r.getContext()
    const barWidth = Math.min(300, width * 0.42)
    const x = width / 2 - barWidth / 2
    const danger = timeRemaining <= 5
    const progress = this.duration > 0 ? Math.min(1, Math.max(0, 1 - timeRemaining / this.duration)) : 1

    r.drawProgressBar(x, 14, barWidth, 8, progress, {
      bgColor: PALETTE.ringTrack,
      fgColor: danger ? PALETTE.red : PALETTE.gold,
      borderColor: PALETTE.stroke,
      glow: 8,
    })
    r.drawCenteredText(formatSecondsRemaining(timeRemaining), width / 2 + barWidth / 2 + 34, 24, {
      font: '16px "JetBrains Mono", monospace',
      color: danger ? PALETTE.red : PALETTE.ink,
      glow: danger ? 10 : 0,
    })
  }

  getScore(): ScoreResult {
    const avgRecall = this.recallSamples > 0 ? this.recallSumMs / this.recallSamples : 0
    return {
      score: this.score,
      grade: gradeFor(this.score),
      details: {
        patterns: this.patternsCleared,
        longest: this.longestPattern,
        mistakes: this.mistakes,
        bestStreak: this.bestStreak,
        recallMs: Math.round(avgRecall),
        accuracy: this.patternsCleared + this.mistakes > 0
          ? Math.round((this.patternsCleared / (this.patternsCleared + this.mistakes)) * 100)
          : 0,
      },
      timestamp: Date.now(),
    }
  }
}
