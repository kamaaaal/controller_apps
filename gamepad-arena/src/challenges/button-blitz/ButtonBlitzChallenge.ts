/**
 * Button Blitz Challenge
 * Press the target button (A) as many times as possible in 10 seconds
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, gradeColor, isReducedMotion } from '../../engine/palette'
import { Fx } from '../../engine/fx'
import { quadOut } from '../../engine/easings'
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
  private combo = 0
  private maxCombo = 0
  private fx = new Fx(isReducedMotion)
  private ripples: Array<{ r: number }> = []

  private buttonPos(): { x: number; y: number } {
    const { width, height } = this.renderer?.getContext() ?? { width: 0, height: 0 }
    return { x: width / 2, y: height / 2 + 20 }
  }

  setup(ctx: CanvasRenderingContext2D, _gamepad: Gamepad): void {
    this.renderer?.destroy()
    this.renderer = new Renderer(ctx.canvas)
    this.reset()
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
    }
    this.fx.update(dt)

    const aPressed = input.buttons.a
    if (aPressed && !this.aButtonPrev) {
      const now = performance.now()
      this.pressCount++
      this.flashTimer = this.flashDuration

      // Visual feedback (iteration 15): additive burst + an expanding ripple
      // ring tweened per press. Decorative only — scoring below is untouched.
      if (this.renderer) {
        const { x, y } = this.buttonPos()
        this.fx.burst({ x, y, color: PALETTE.faceA, count: 14, speed: 260, life: 0.45 })
        this.addRipple()
      }

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

  /** One expanding ripple ring, driven by an FX tween and removed on completion. */
  private addRipple(): void {
    if (this.ripples.length >= 6) this.ripples.shift()
    const ripple = { r: 98 }
    this.ripples.push(ripple)
    this.fx.tween({
      from: 98,
      to: 156,
      duration: 0.35,
      ease: quadOut,
      onUpdate: (r) => {
        ripple.r = r
      },
      onComplete: () => {
        const index = this.ripples.indexOf(ripple)
        if (index >= 0) this.ripples.splice(index, 1)
      },
    })
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

    // Tweened ripple rings (iteration 15), fading as they expand.
    if (this.ripples.length > 0) {
      const ctx = r.canvasContext
      for (const ripple of this.ripples) {
        ctx.save()
        ctx.globalAlpha = Math.max(0, 0.6 * (1 - (ripple.r - 98) / 58))
        r.drawCircle(btnX, btnY, ripple.r, {
          strokeColor: PALETTE.faceA,
          lineWidth: 4,
          glow: 16,
          glowColor: PALETTE.faceA,
        })
        ctx.restore()
      }
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

    this.fx.draw(r)
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
    this.fx.clear()
    this.ripples = []
  }
}
