/**
 * Button Blitz Challenge
 * Press the target button (A) as many times as possible in 10 seconds
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, gradeColor, isReducedMotion } from '../../engine/palette'
import { TIMING } from '../../config/timing'

export class ButtonBlitzChallenge implements Challenge {
  id = 'button-blitz'
  name = 'Button Blitz'
  description = 'Press A as fast as you can!'
  duration = TIMING.challengeDurations['button-blitz']

  private renderer: Renderer | null = null
  private pressCount = 0
  private lastPressTime = 0
  private pressIntervals: number[] = []
  private aButtonPrev = false
  private score = 0
  private grade: ScoreResult['grade'] = 'F'
  private flashTimer = 0
  private flashDuration = 0.1
  private elapsed = 0
  private combo = 0
  private maxCombo = 0

  setup(ctx: CanvasRenderingContext2D, _gamepad: Gamepad): void {
    this.renderer?.destroy()
    this.renderer = new Renderer(ctx.canvas)
    this.reset()
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.elapsed += dt
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
    }

    const aPressed = input.buttons.a
    if (aPressed && !this.aButtonPrev) {
      const now = performance.now()
      this.pressCount++
      this.flashTimer = this.flashDuration

      if (this.lastPressTime > 0) {
        const interval = (now - this.lastPressTime) / 1000
        this.pressIntervals.push(interval)

        if (interval < 0.5) {
          this.combo++
          this.maxCombo = Math.max(this.maxCombo, this.combo)
        } else {
          this.combo = 1
        }
      }
      this.lastPressTime = now
    }
    this.aButtonPrev = aPressed

    this.calculateScore()

    return {
      progress: 1,
      score: this.score,
      metadata: {
        pressCount: this.pressCount,
        combo: this.combo,
        maxCombo: this.maxCombo,
        avgInterval: this.pressIntervals.length > 0
          ? this.pressIntervals.reduce((a, b) => a + b, 0) / this.pressIntervals.length
          : 0,
      },
    }
  }

  private calculateScore(): void {
    let score = this.pressCount * 100

    if (this.pressIntervals.length >= 3) {
      const mean = this.pressIntervals.reduce((a, b) => a + b, 0) / this.pressIntervals.length
      const variance = this.pressIntervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / this.pressIntervals.length
      const stdDev = Math.sqrt(variance)
      const rhythmBonus = Math.max(0, 1 - stdDev / 0.3) * 500
      score += Math.floor(rhythmBonus)
    }

    score += this.maxCombo * 50

    this.score = score
    this.grade = this.calculateGrade(score)
  }

  private calculateGrade(score: number): ScoreResult['grade'] {
    if (score >= 3000) return 'S'
    if (score >= 2000) return 'A'
    if (score >= 1500) return 'B'
    if (score >= 1000) return 'C'
    if (score >= 500) return 'D'
    return 'F'
  }

  draw(_ctx: CanvasRenderingContext2D): void {
    if (!this.renderer) return

    const r = this.renderer
    const { width, height } = r.getContext()
    const centerX = width / 2
    const centerY = height / 2
    const active = this.flashTimer > 0

    r.drawBackdrop()

    r.drawStrokeText('BUTTON BLITZ', centerX, 60, {
      font: '32px "JetBrains Mono", monospace',
      fillColor: PALETTE.xboxNeon,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 18,
    })

    // Visible countdown timer (the game is a timed 10s run).
    const remaining = Math.max(0, this.duration - this.elapsed)
    const timeFrac = Math.max(0, Math.min(1, remaining / this.duration))
    const barW = Math.min(360, width - 80)
    r.drawProgressBar(centerX - barW / 2, 96, barW, 10, timeFrac, {
      bgColor: PALETTE.ringTrack,
      fgColor: remaining > 3 ? PALETTE.xboxNeon : PALETTE.red,
      borderColor: PALETTE.stroke,
      glow: 8,
    })
    r.drawCenteredText(`${remaining.toFixed(1)}s`, centerX, 120, {
      font: '16px "JetBrains Mono", monospace',
      color: remaining > 3 ? PALETTE.ink : PALETTE.red,
    })

    r.drawCenteredText('PRESS  [ A ]', centerX, centerY - 80, {
      font: '28px "JetBrains Mono", monospace',
      color: PALETTE.faceA,
      glow: 12,
    })

    const btnRadius = 80
    const btnX = centerX
    const btnY = centerY + 20

    // Press feedback: an expanding glow ring (static highlight under reduced motion).
    if (active) {
      const alpha = this.flashTimer / this.flashDuration
      const ctx = r.canvasContext
      ctx.save()
      ctx.globalAlpha = alpha * 0.5
      const ringR = isReducedMotion() ? btnRadius + 18 : btnRadius + 18 + (1 - alpha) * 46
      r.drawCircle(btnX, btnY, ringR, { strokeColor: PALETTE.faceA, lineWidth: 6, glow: 24, glowColor: PALETTE.faceA })
      ctx.restore()
    }

    // A = green face button; the letter keeps it readable without relying on colour.
    r.drawCircle(btnX, btnY, btnRadius, {
      fillColor: '#0c160e',
      strokeColor: active ? PALETTE.xboxNeon : PALETTE.faceA,
      lineWidth: active ? 7 : 4,
      glow: active ? 30 : 16,
      glowColor: active ? PALETTE.xboxNeon : PALETTE.faceA,
    })

    r.drawStrokeText('A', btnX, btnY, {
      font: 'bold 48px "JetBrains Mono", monospace',
      fillColor: '#ffffff',
      strokeColor: '#000',
      lineWidth: 4,
    })

    r.drawStrokeText(`${this.pressCount}`, centerX, btnY + btnRadius + 64, {
      font: 'bold 72px "JetBrains Mono", monospace',
      fillColor: PALETTE.xboxNeon,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 22,
    })

    if (this.combo > 1) {
      r.drawCenteredText(`COMBO x${this.combo}!`, centerX, btnY + btnRadius + 132, {
        font: '24px "JetBrains Mono", monospace',
        color: PALETTE.faceY,
        glow: 14,
      })
    }

    r.drawCenteredText(`SCORE: ${this.score}`, centerX, height - 100, {
      font: '24px "JetBrains Mono", monospace',
      color: PALETTE.ink,
    })

    r.drawCenteredText(`GRADE: ${this.grade}`, centerX, height - 60, {
      font: '28px "JetBrains Mono", monospace',
      color: gradeColor(this.grade),
      glow: 14,
    })
  }

  getScore(): ScoreResult {
    return {
      score: this.score,
      grade: this.grade,
      details: {
        presses: this.pressCount,
        maxCombo: this.maxCombo,
        avgInterval: this.pressIntervals.length > 0
          ? this.pressIntervals.reduce((a, b) => a + b, 0) / this.pressIntervals.length
          : 0,
        pressesPerSecond: this.duration > 0 ? this.pressCount / this.duration : 0,
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    this.pressCount = 0
    this.lastPressTime = 0
    this.pressIntervals = []
    this.aButtonPrev = false
    this.score = 0
    this.grade = 'F'
    this.flashTimer = 0
    this.combo = 0
    this.maxCombo = 0
    this.elapsed = 0
  }
}
