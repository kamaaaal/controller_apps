/**
 * Twin Target — Dual Stick Rush
 *
 * Two cursors (left = Xbox green, right = PlayStation blue) must reach their
 * targets before the round timer expires. Each successful round awards points
 * and spawns a new target pair. The session ends with score, streak and grade.
 *
 * Input arrives already normalized and deadzoned (App applies the user's
 * deadzone setting via normalizeGamepadInput), so this challenge uses the
 * stick vectors directly — no second deadzone pass.
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, gradeColor, isReducedMotion } from '../../engine/palette'
import { Fx } from '../../engine/fx'
import { TIMING } from '../../config/timing'
import { getMoveVector } from '../../utils/input'
import { distance, moveCursor } from './movement'

const ROUND_TIME = TIMING.twinTargetRoundSeconds // seconds per round
const TARGET_RADIUS = 24
const CURSOR_RADIUS = 12

// Left cursor = Xbox green, right cursor = PlayStation blue (paired with L/R
// labels so the two are never distinguished by colour alone).
const LEFT_COLOR = PALETTE.xboxNeon
const RIGHT_COLOR = PALETTE.ps

interface Cursor {
  x: number
  y: number
  targetX: number
  targetY: number
  zoneLeft: number
  zoneRight: number
  zoneTop: number
  zoneBottom: number
  color: string
  label: string
}

interface RoundResult {
  completed: boolean
  timeMs: number
  clean: boolean // no wrong-target touches
}

export class TwinTargetChallenge implements Challenge {
  id = 'twin-target'
  name = 'Dual Stick Rush'
  description = 'Move both cursors to their targets fast!'
  duration = TIMING.challengeDurations['twin-target']

  private renderer: Renderer | null = null
  private leftCursor: Cursor | null = null
  private rightCursor: Cursor | null = null
  private fx = new Fx(isReducedMotion)

  sessionTime = 0
  roundTime = 0
  roundResults: RoundResult[] = []
  streak = 0
  bestStreak = 0
  totalCompleted = 0
  totalClean = 0

  score = 0
  grade: ScoreResult['grade'] = 'F'

  setup(renderer: Renderer, _gamepad: Gamepad): void {
    // The host hands over the shared renderer — never construct a second one.
    this.renderer = renderer
    this.reset()
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.sessionTime += dt
    this.roundTime += dt
    this.fx.update(dt)

    // Input is already normalized + deadzoned upstream; use it directly. The
    // D-pad is accepted as an alternative to either stick.
    const leftInput = getMoveVector(input, 'left')
    const rightInput = getMoveVector(input, 'right')

    if (this.leftCursor) {
      this.moveCursor(this.leftCursor, leftInput, dt)
    }
    if (this.rightCursor) {
      this.moveCursor(this.rightCursor, rightInput, dt)
    }

    // Check if both cursors reached their targets
    if (this.leftCursor && this.rightCursor) {
      const leftReached = distance(this.leftCursor.x, this.leftCursor.y, this.leftCursor.targetX, this.leftCursor.targetY) < TARGET_RADIUS
      const rightReached = distance(this.rightCursor.x, this.rightCursor.y, this.rightCursor.targetX, this.rightCursor.targetY) < TARGET_RADIUS

      if (leftReached && rightReached) {
        this.completeRound()
      }
    }

    // Round timeout
    if (this.roundTime >= ROUND_TIME) {
      this.completeRound(false)
    }

    // Session end
    if (this.sessionTime >= this.duration) {
      this.calculateScore()
    }

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: {
        streak: this.streak,
        bestStreak: this.bestStreak,
        completed: this.totalCompleted,
      },
    }
  }

  private moveCursor(cursor: Cursor, input: { x: number; y: number }, dt: number): void {
    const moved = moveCursor(cursor, input, {
      left: cursor.zoneLeft,
      right: cursor.zoneRight,
      top: cursor.zoneTop,
      bottom: cursor.zoneBottom,
    }, dt)
    cursor.x = moved.x
    cursor.y = moved.y
  }

  private completeRound(completed: boolean = true): void {
    const result: RoundResult = {
      completed,
      timeMs: this.roundTime * 1000,
      clean: completed,
    }
    this.roundResults.push(result)

    if (completed) {
      this.totalCompleted++
      this.streak++
      this.bestStreak = Math.max(this.bestStreak, this.streak)
      this.totalClean++
    } else {
      this.streak = 0
    }

    // Visual feedback (iteration 15) — burst at both targets + shake + float
    // text. Purely decorative; score/state above is untouched.
    if (completed && this.leftCursor && this.rightCursor) {
      const left = this.leftCursor
      const right = this.rightCursor
      this.fx.burst({ x: left.targetX, y: left.targetY, color: left.color, count: 22 })
      this.fx.burst({ x: right.targetX, y: right.targetY, color: right.color, count: 22 })
      this.fx.shake(6, 0.25)
      this.fx.floatText({
        x: (left.targetX + right.targetX) / 2,
        y: (left.targetY + right.targetY) / 2,
        text: `+100  STREAK x${this.streak}`,
        color: PALETTE.gold,
      })
    }

    // Spawn new targets
    this.spawnTargets()
    this.roundTime = 0
  }

  private spawnTargets(): void {
    const renderer = this.renderer!
    const { width, height } = renderer.getContext()

    const zoneWidth = width / 2 - 40
    const zoneHeight = height - 120

    // Left zone
    this.leftCursor = {
      x: 100,
      y: height / 2,
      targetX: 60 + Math.random() * (zoneWidth - 80),
      targetY: 60 + Math.random() * (zoneHeight - 80),
      zoneLeft: 20,
      zoneRight: width / 2 - 20,
      zoneTop: 60,
      zoneBottom: height - 60,
      color: LEFT_COLOR,
      label: 'L',
    }

    // Right zone
    this.rightCursor = {
      x: width - 100,
      y: height / 2,
      targetX: width / 2 + 20 + Math.random() * (zoneWidth - 80),
      targetY: 60 + Math.random() * (zoneHeight - 80),
      zoneLeft: width / 2 + 20,
      zoneRight: width - 20,
      zoneTop: 60,
      zoneBottom: height - 60,
      color: RIGHT_COLOR,
      label: 'R',
    }
  }

  calculateScore(): void {
    const baseScore = this.totalCompleted * 100
    const speedBonus = this.roundResults
      .filter(r => r.completed)
      .reduce((sum, r) => sum + Math.max(0, 50 - (r.timeMs / 1000)), 0)
    const cleanBonus = this.totalClean * 25
    const streakMultiplier = 1 + Math.min(this.bestStreak * 0.1, 2)

    this.score = Math.round((baseScore + speedBonus + cleanBonus) * streakMultiplier)
    this.grade = this.calculateGrade(this.score)
  }

  private calculateGrade(score: number): ScoreResult['grade'] {
    if (score >= 5000) return 'S'
    if (score >= 3500) return 'A'
    if (score >= 2500) return 'B'
    if (score >= 1500) return 'C'
    if (score >= 800) return 'D'
    return 'F'
  }

  draw(renderer: Renderer): void {
    const r = this.renderer ?? renderer
    const { width, height } = r.getContext()

    r.drawBackdrop()

    // Gameplay layer inside the shake transform; the HUD below stays steady.
    this.fx.beginShake(r.canvasContext)

    // Draw the two play zones.
    r.drawRect(20, 60, width / 2 - 40, height - 120, {
      fillColor: 'rgba(18, 28, 44, 0.55)',
      strokeColor: PALETTE.stroke,
      lineWidth: 2,
      radius: 12,
    })
    r.drawRect(width / 2 + 20, 60, width / 2 - 40, height - 120, {
      fillColor: 'rgba(18, 28, 44, 0.55)',
      strokeColor: PALETTE.stroke,
      lineWidth: 2,
      radius: 12,
    })

    // Draw cursors and targets
    if (this.leftCursor) this.drawCursor(r, this.leftCursor)
    if (this.rightCursor) this.drawCursor(r, this.rightCursor)

    this.fx.endShake(r.canvasContext)

    // HUD
    const remaining = Math.max(0, this.duration - this.sessionTime)
    r.drawCenteredText(`Session: ${remaining.toFixed(1)}s`, width / 2, 30, {
      font: '18px "JetBrains Mono", monospace',
      color: PALETTE.ink,
    })

    r.drawCenteredText(`Round: ${this.roundTime.toFixed(1)}s`, width / 2, 55, {
      font: '14px "JetBrains Mono", monospace',
      color: PALETTE.inkDim,
    })

    r.drawCenteredText(`SCORE: ${this.score}   STREAK: x${this.streak}`, width / 2, height - 20, {
      font: '16px "JetBrains Mono", monospace',
      color: this.grade === 'F' ? PALETTE.gold : gradeColor(this.grade),
      glow: 10,
    })

    this.fx.draw(r)
  }

  private drawCursor(r: Renderer, cursor: Cursor): void {
    // Zone / stick label so the two sides aren't distinguished by colour alone.
    r.drawCenteredText(cursor.label, (cursor.zoneLeft + cursor.zoneRight) / 2, 48, {
      font: 'bold 14px "JetBrains Mono", monospace',
      color: cursor.color,
      glow: 8,
    })

    // Target (ring + centre dot)
    r.drawCircle(cursor.targetX, cursor.targetY, TARGET_RADIUS, {
      strokeColor: cursor.color,
      lineWidth: 3,
      glow: 14,
      glowColor: cursor.color,
    })
    r.drawCircle(cursor.targetX, cursor.targetY, 4, {
      fillColor: cursor.color,
    })

    // Cursor
    r.drawCircle(cursor.x, cursor.y, CURSOR_RADIUS, {
      fillColor: cursor.color,
      strokeColor: '#ffffff',
      lineWidth: 2,
      glow: 12,
      glowColor: cursor.color,
    })
  }

  getScore(): ScoreResult {
    this.calculateScore()
    const avgTime = this.roundResults.filter(r => r.completed).length > 0
      ? this.roundResults.filter(r => r.completed).reduce((sum, r) => sum + r.timeMs, 0) / this.roundResults.filter(r => r.completed).length
      : 0

    return {
      score: this.score,
      grade: this.grade,
      details: {
        completed: this.totalCompleted,
        clean: this.totalClean,
        bestStreak: this.bestStreak,
        avgTime: avgTime / 1000,
        accuracy: this.totalCompleted > 0 ? Math.round((this.totalClean / this.totalCompleted) * 100) : 0,
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    this.sessionTime = 0
    this.roundTime = 0
    this.roundResults = []
    this.streak = 0
    this.bestStreak = 0
    this.totalCompleted = 0
    this.totalClean = 0
    this.score = 0
    this.grade = 'F'
    this.leftCursor = null
    this.rightCursor = null
    this.fx.clear()

    // Only spawn targets if renderer exists (tests skip canvas setup)
    if (this.renderer) {
      this.spawnTargets()
    }
  }
}
