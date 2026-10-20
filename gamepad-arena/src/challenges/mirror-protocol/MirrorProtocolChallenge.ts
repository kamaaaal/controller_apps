/**
 * Mirror Protocol — dual-stick coordination puzzle.
 *
 * The left stick produces a vector; the right stick must satisfy the relation
 * shown on the panel (MATCH / MIRROR / CROSS / FLIP). Hold the relation steady
 * for the required time to lock the checkpoint.
 *
 * Difficulty ramps two ways: the relation changes every round (so the player
 * has to internalise what each one means) and the tolerance tightens, so a
 * sloppier stick stops passing. Breaking the relation mid-hold bleeds the
 * hold progress rather than resetting it outright.
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, isReducedMotion } from '../../engine/palette'
import { Fx } from '../../engine/fx'
import { playSfx } from '../../engine/audio'
import { TIMING } from '../../config/timing'
import { formatSecondsRemaining } from '../../utils/timerFormat'
import {
  RULES,
  applyRule,
  magnitude,
  ruleHint,
  ruleLabel,
  satisfies,
  toleranceForRound,
  type Point,
  type Rule,
} from './protocol'

const LEFT_COLOR = PALETTE.xboxNeon
const RIGHT_COLOR = PALETTE.ps
const GOLD = PALETTE.gold

export class MirrorProtocolChallenge implements Challenge {
  id = 'mirror-protocol'
  name = 'Mirror Protocol'
  description = 'The right stick must obey the rule — match, mirror, cross or flip'
  duration = TIMING.challengeDurations['mirror-protocol']

  private renderer: Renderer | null = null
  private fx = new Fx(isReducedMotion)

  private rule: Rule = 'match'
  private round = 0
  private holdTime = 0
  private holdRequired: number = TIMING.mirrorProtocolHoldSeconds
  private leftVec: Point = { x: 0, y: 0 }
  private rightVec: Point = { x: 0, y: 0 }
  private expectedVec: Point = { x: 0, y: 0 }
  private relationHeld = false

  private locks = 0
  private streak = 0
  private bestStreak = 0
  private mistakes = 0
  private score = 0
  private sessionTime = 0
  private holdSumSeconds = 0
  private holdSamples = 0
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
    this.rule = 'match'
    this.round = 0
    this.holdTime = 0
    this.holdRequired = TIMING.mirrorProtocolHoldSeconds
    this.leftVec = { x: 0, y: 0 }
    this.rightVec = { x: 0, y: 0 }
    this.expectedVec = { x: 0, y: 0 }
    this.relationHeld = false
    this.locks = 0
    this.streak = 0
    this.bestStreak = 0
    this.mistakes = 0
    this.score = 0
    this.sessionTime = 0
    this.holdSumSeconds = 0
    this.holdSamples = 0
    this.banner = { text: '', color: PALETTE.ink, life: 0 }
    this.fx.clear()
    this.nextRound()
  }

  private nextRound(): void {
    this.rule = RULES[this.round % RULES.length]
    this.holdTime = 0
    this.relationHeld = false
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.sessionTime += dt
    this.fx.update(dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)

    this.leftVec = { x: input.axes.leftStick.x, y: input.axes.leftStick.y }
    this.rightVec = { x: input.axes.rightStick.x, y: input.axes.rightStick.y }
    this.expectedVec = applyRule(this.leftVec, this.rule)

    const tolerance = toleranceForRound(this.round)
    const leftStrong = magnitude(this.leftVec) >= TIMING.mirrorProtocolMinMagnitude
    const obeying = leftStrong && satisfies(this.leftVec, this.rightVec, this.rule, tolerance)

    if (obeying) {
      if (!this.relationHeld) {
        this.relationHeld = true
        this.holdTime = Math.max(this.holdTime, 0)
      }
      this.holdTime += dt
      if (this.holdTime >= this.holdRequired) {
        this.lockCheckpoint()
      }
    } else {
      if (this.relationHeld && this.holdTime > 0) {
        this.mistakes++
        this.streak = 0
        this.banner = { text: 'RELATION BROKEN', color: PALETTE.red, life: 0.8 }
        playSfx('miss')
      }
      this.relationHeld = false
      // Bleed the hold progress instead of wiping it — a slip costs time, not
      // the whole checkpoint.
      this.holdTime = Math.max(0, this.holdTime - dt * 2)
    }

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: {
        locks: this.locks,
        streak: this.streak,
        rule: this.rule,
        hold: this.holdTime / this.holdRequired,
      },
    }
  }

  private lockCheckpoint(): void {
    this.locks++
    this.streak++
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    this.holdSumSeconds += this.holdTime
    this.holdSamples++

    const speedBonus = Math.max(0, Math.round((this.holdRequired - this.holdTime) * 60))
    const points = Math.round((100 + speedBonus) * (1 + Math.min(this.streak * 0.15, 1.5)))
    this.score += points

    this.banner = { text: `LOCKED +${points}`, color: GOLD, life: 1 }
    playSfx('sync')

    const { width, height } = this.renderer?.getContext() ?? { width: 640, height: 360 }
    this.fx.burst({ x: width / 2, y: height / 2, color: GOLD, count: 18, speed: 240 })
    this.fx.floatText({ x: width / 2, y: height / 2 - 70, text: `+${points}`, color: GOLD })

    this.round++
    // Each lock demands a steadier hold.
    this.holdRequired = Math.min(2.2, this.holdRequired + 0.12)
    this.nextRound()
  }

  draw(renderer: Renderer): void {
    const r = this.renderer ?? renderer
    const { width, height } = r.getContext()
    const cx = width / 2
    const cy = height / 2

    r.drawBackdrop()

    r.drawStrokeText('MIRROR PROTOCOL', cx, 52, {
      font: '30px "JetBrains Mono", monospace',
      fillColor: PALETTE.ps,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 18,
    })

    // Rule panel.
    const panelW = 300
    const panelH = 74
    r.drawRect(cx - panelW / 2, cy - 178, panelW, panelH, {
      fillColor: 'rgba(14, 22, 34, 0.72)',
      strokeColor: PALETTE.ps,
      lineWidth: 2,
      radius: 12,
      glow: 12,
      glowColor: PALETTE.ps,
    })
    r.drawStrokeText(ruleLabel(this.rule), cx, cy - 148, {
      font: 'bold 30px "JetBrains Mono", monospace',
      fillColor: GOLD,
      strokeColor: '#000',
      lineWidth: 4,
      glow: 14,
    })
    r.drawCenteredText(ruleHint(this.rule), cx, cy - 116, {
      font: '13px "JetBrains Mono", monospace',
      color: PALETTE.inkDim,
    })

    // Stick indicators: left (actual) and right (actual vs expected ghost).
    this.drawStick(cx - 150, cy + 30, 62, this.leftVec, LEFT_COLOR, 'L', null)
    this.drawStick(cx + 150, cy + 30, 62, this.rightVec, RIGHT_COLOR, 'R', this.expectedVec)

    // Hold ring.
    const holdProgress = Math.min(1, this.holdTime / this.holdRequired)
    r.drawRing(cx, cy + 30, 88, holdProgress, {
      bgColor: PALETTE.ringTrack,
      fgColor: holdProgress >= 1 ? PALETTE.success : GOLD,
      lineWidth: 9,
      glow: 16,
      glowColor: holdProgress >= 1 ? PALETTE.success : GOLD,
    })
    r.drawStrokeText(`${Math.round(holdProgress * 100)}%`, cx, cy + 30, {
      font: 'bold 22px "JetBrains Mono", monospace',
      fillColor: '#ffffff',
      strokeColor: '#000',
      lineWidth: 4,
    })

    if (this.banner.life > 0) {
      r.drawCenteredText(this.banner.text, cx, cy + 148, {
        font: 'bold 22px "JetBrains Mono", monospace',
        color: this.banner.color,
        glow: 12,
      })
    } else {
      r.drawCenteredText(
        this.relationHeld ? 'HOLD IT…' : 'SET THE RELATION',
        cx,
        cy + 148,
        { font: '16px "JetBrains Mono", monospace', color: PALETTE.inkDim }
      )
    }

    r.drawCenteredText(
      `LOCKS ${this.locks}   STREAK x${this.streak}   ROUND ${this.round + 1}`,
      cx,
      height - 46,
      { font: '16px "JetBrains Mono", monospace', color: PALETTE.inkDim }
    )

    this.fx.draw(r)
  }

  /**
   * A stick dial: the deflected dot is the actual vector, the faint outline is
   * the vector the rule expects (for the right stick).
   */
  private drawStick(
    cx: number,
    cy: number,
    radius: number,
    vector: Point,
    color: string,
    label: string,
    expected: Point | null
  ): void {
    const r = this.renderer!
    r.drawCircle(cx, cy, radius, { strokeColor: PALETTE.stroke, lineWidth: 3 })
    r.drawCenteredText(label, cx, cy - radius - 16, {
      font: 'bold 15px "JetBrains Mono", monospace',
      color,
      glow: 8,
    })

    if (expected) {
      const ex = cx + expected.x * radius * 0.82
      const ey = cy + expected.y * radius * 0.82
      r.drawCircle(ex, ey, radius * 0.18, {
        strokeColor: GOLD,
        lineWidth: 2,
        glow: 8,
        glowColor: GOLD,
      })
    }

    const px = cx + vector.x * radius * 0.82
    const py = cy + vector.y * radius * 0.82
    r.drawCircle(px, py, radius * 0.16, {
      fillColor: color,
      strokeColor: '#fff',
      lineWidth: 2,
      glow: 14,
      glowColor: color,
    })
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
      fgColor: danger ? PALETTE.red : PALETTE.ps,
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
    const avgHold = this.holdSamples > 0 ? this.holdSumSeconds / this.holdSamples : 0
    const attempts = this.locks + this.mistakes
    return {
      score: this.score,
      grade: this.gradeFromScore(),
      details: {
        locks: this.locks,
        mistakes: this.mistakes,
        bestStreak: this.bestStreak,
        avgHold: avgHold,
        accuracy: attempts > 0 ? Math.round((this.locks / attempts) * 100) : 0,
      },
      timestamp: Date.now(),
    }
  }

  private gradeFromScore(): ScoreResult['grade'] {
    if (this.score >= 5000) return 'S'
    if (this.score >= 3800) return 'A'
    if (this.score >= 2600) return 'B'
    if (this.score >= 1600) return 'C'
    if (this.score >= 700) return 'D'
    return 'F'
  }
}
