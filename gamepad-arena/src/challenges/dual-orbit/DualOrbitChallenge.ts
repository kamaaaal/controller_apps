/**
 * Dual Orbit Challenge
 * Rotate the left stick clockwise while rotating the right stick
 * counter-clockwise at the same time. Complete full orbits before the timer runs out.
 *
 * Detection notes:
 * - Angles are unwrapped across the -PI / +PI boundary via angleDiff().
 * - Movement below MIN_MAGNITUDE (stick near center) is ignored because the angle
 *   is unstable there.
 * - Angular jumps larger than MAX_FRAME_DELTA are rejected as implausible.
 * - Only movement in the required direction accumulates progress; the opposite
 *   direction counts as a reversal and costs smoothness.
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, gradeColor, isReducedMotion } from '../../engine/palette'
import { Fx } from '../../engine/fx'
import { TIMING } from '../../config/timing'
import { getStickAngle, getStickMagnitude, angleDiff } from '../../utils/input'

const TWO_PI = Math.PI * 2
const REQUIRED_ROTATIONS = 3
const MIN_MAGNITUDE = 0.35
const MAX_FRAME_DELTA = 0.8
const MIN_MOVE = 0.01
const MAX_REVERSALS = 20

// Left stick = Xbox green, right stick = PlayStation blue.
const LEFT_COLOR = PALETTE.xboxNeon
const RIGHT_COLOR = PALETTE.ps

interface StickTrack {
  lastAngle: number | null
  required: number
  lastSign: number
}

function newTrack(): StickTrack {
  return { lastAngle: null, required: 0, lastSign: 0 }
}

export class DualOrbitChallenge implements Challenge {
  id = 'dual-orbit'
  name = 'Dual Orbit'
  description = 'Spin L-stick CW and R-stick CCW together'
  duration = TIMING.challengeDurations['dual-orbit']

  private renderer: Renderer | null = null

  private left = newTrack()
  private right = newTrack()
  private leftVec = { x: 0, y: 0 }
  private rightVec = { x: 0, y: 0 }

  private simultaneousTime = 0
  private elapsed = 0
  private reversals = 0
  private completionTime = -1

  private score = 0
  private grade: ScoreResult['grade'] = 'F'

  private fx = new Fx(isReducedMotion)
  private leftWhole = 0
  private rightWhole = 0

  /** Shared orbit layout so update-time FX land exactly on the drawn rings. */
  private orbitLayout(): { centerX: number; ringY: number; radius: number; leftX: number; rightX: number } {
    const { width, height } = this.renderer!.getContext()
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.max(52, Math.min(width, height) * 0.15)
    const spread = radius * 3.4
    const ringY = centerY - 10
    return { centerX, ringY, radius, leftX: centerX - spread / 2, rightX: centerX + spread / 2 }
  }

  /** Visual feedback (iteration 15): a small burst at the stick when a whole
   *  rotation completes. Decorative only — scoring is untouched. */
  private checkOrbitBurst(
    track: StickTrack,
    vec: { x: number; y: number },
    color: string,
    centerX: number,
    ringY: number,
    radius: number,
    isLeft: boolean
  ): void {
    const whole = Math.floor(track.required / TWO_PI)
    const prev = isLeft ? this.leftWhole : this.rightWhole
    if (whole > prev) {
      this.fx.burst({
        x: centerX + vec.x * radius * 0.82,
        y: ringY + vec.y * radius * 0.82,
        color,
        count: 12,
        speed: 160,
        life: 0.5,
      })
      this.fx.floatText({ x: centerX, y: ringY - radius - 40, text: 'ORBIT!', color, life: 0.7 })
    }
    if (isLeft) this.leftWhole = whole
    else this.rightWhole = whole
  }

  setup(ctx: CanvasRenderingContext2D, _gamepad: Gamepad): void {
    this.renderer?.destroy()
    this.renderer = new Renderer(ctx.canvas)
    this.reset()
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.elapsed += dt
    this.fx.update(dt)

    const leftStick = input.axes.leftStick
    const rightStick = input.axes.rightStick
    this.leftVec = { x: leftStick.x, y: leftStick.y }
    this.rightVec = { x: rightStick.x, y: rightStick.y }

    const leftMove = this.trackStick(this.left, leftStick.x, leftStick.y, 1)
    const rightMove = this.trackStick(this.right, rightStick.x, rightStick.y, -1)

    if (leftMove > MIN_MOVE && rightMove > MIN_MOVE) {
      this.simultaneousTime += dt
    }

    if (this.completionTime < 0 && this.rotations() >= REQUIRED_ROTATIONS) {
      this.completionTime = this.elapsed
    }

    if (this.renderer) {
      const layout = this.orbitLayout()
      this.checkOrbitBurst(this.left, this.leftVec, LEFT_COLOR, layout.leftX, layout.ringY, layout.radius, true)
      this.checkOrbitBurst(this.right, this.rightVec, RIGHT_COLOR, layout.rightX, layout.ringY, layout.radius, false)
    }

    this.calculateScore()

    return {
      progress: Math.min(1, this.rotations() / REQUIRED_ROTATIONS),
      score: this.score,
      metadata: {
        rotations: this.rotations(),
        simultaneousTime: this.simultaneousTime,
      },
    }
  }

  /**
   * Track one stick. `dir` is 1 when clockwise (positive angle) counts as progress
   * and -1 when counter-clockwise counts. Returns the directed movement this frame
   * (positive = moving in the required direction).
   */
  private trackStick(track: StickTrack, x: number, y: number, dir: 1 | -1): number {
    if (getStickMagnitude(x, y) < MIN_MAGNITUDE) {
      track.lastAngle = null
      return 0
    }

    const angle = getStickAngle(x, y)
    let directed = 0

    if (track.lastAngle !== null) {
      const delta = angleDiff(track.lastAngle, angle)
      if (Math.abs(delta) <= MAX_FRAME_DELTA) {
        directed = delta * dir
        if (directed > 0) {
          track.required += directed
          if (track.lastSign === -1) this.reversals++
          track.lastSign = 1
        } else if (directed < -MIN_MOVE) {
          if (track.lastSign === 1) this.reversals++
          track.lastSign = -1
        }
      }
    }

    track.lastAngle = angle
    return directed
  }

  private rotations(): number {
    return Math.min(this.left.required, this.right.required) / TWO_PI
  }

  private calculateScore(): void {
    const rotations = this.rotations()
    const completion = Math.min(1, rotations / REQUIRED_ROTATIONS)
    const simultaneity = Math.min(1, this.simultaneousTime / this.duration)
    // Smoothness only rewards work that was actually performed.
    const smoothness = Math.max(0, 1 - this.reversals / MAX_REVERSALS) * completion
    const speed = this.completionTime >= 0 ? Math.max(0, 1 - this.completionTime / this.duration) : 0

    const score = Math.round(
      completion * 400 +
      simultaneity * 250 +
      smoothness * 200 +
      speed * 150
    )

    this.score = score
    this.grade = this.calculateGrade(score)
  }

  private calculateGrade(score: number): ScoreResult['grade'] {
    if (score >= 900) return 'S'
    if (score >= 750) return 'A'
    if (score >= 600) return 'B'
    if (score >= 450) return 'C'
    if (score >= 250) return 'D'
    return 'F'
  }

  draw(_ctx: CanvasRenderingContext2D): void {
    if (!this.renderer) return

    const r = this.renderer
    const { width, height } = r.getContext()
    const centerX = width / 2

    r.drawBackdrop()

    r.drawStrokeText('DUAL ORBIT', centerX, 56, {
      font: '32px "JetBrains Mono", monospace',
      fillColor: PALETTE.xboxNeon,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 18,
    })

    r.drawCenteredText('LEFT STICK  CW  ↻      RIGHT STICK  CCW  ↺', centerX, 96, {
      font: '16px "JetBrains Mono", monospace',
      color: PALETTE.inkDim,
    })

    const { radius, leftX, rightX, ringY } = this.orbitLayout()

    this.drawOrbit(leftX, ringY, radius, this.leftVec, this.left.required, LEFT_COLOR, 'L')
    this.drawOrbit(rightX, ringY, radius, this.rightVec, this.right.required, RIGHT_COLOR, 'R')

    const rotations = this.rotations()
    const progress = Math.min(1, rotations / REQUIRED_ROTATIONS)
    r.drawRing(centerX, ringY, radius * 0.42, progress, {
      bgColor: PALETTE.ringTrack,
      fgColor: progress >= 1 ? PALETTE.success : PALETTE.gold,
      lineWidth: 8,
      glow: 16,
      glowColor: progress >= 1 ? PALETTE.success : PALETTE.gold,
    })
    r.drawStrokeText(`${rotations.toFixed(1)}/${REQUIRED_ROTATIONS}`, centerX, ringY, {
      font: 'bold 28px "JetBrains Mono", monospace',
      fillColor: '#ffffff',
      strokeColor: '#000',
      lineWidth: 4,
    })

    const remaining = Math.max(0, this.duration - this.elapsed)
    r.drawProgressBar(centerX - 140, height - 110, 280, 12, Math.min(1, this.elapsed / this.duration), {
      bgColor: PALETTE.ringTrack,
      fgColor: remaining > 5 ? PALETTE.xboxNeon : PALETTE.red,
      borderColor: PALETTE.stroke,
      glow: 10,
    })
    r.drawCenteredText(`${remaining.toFixed(1)}s`, centerX, height - 76, {
      font: '20px "JetBrains Mono", monospace',
      color: PALETTE.ink,
    })
    r.drawCenteredText(`SCORE: ${this.score}   GRADE: ${this.grade}`, centerX, height - 40, {
      font: '20px "JetBrains Mono", monospace',
      color: gradeColor(this.grade),
      glow: 12,
    })

    this.fx.draw(r)
  }

  private drawOrbit(
    x: number,
    y: number,
    radius: number,
    vec: { x: number; y: number },
    required: number,
    color: string,
    label: string
  ): void {
    const r = this.renderer!
    r.drawCircle(x, y, radius, { strokeColor: PALETTE.stroke, lineWidth: 3 })

    // Stick identity label (L / R) so the two rings aren't distinguished by colour alone.
    r.drawCenteredText(label, x, y - radius - 16, {
      font: 'bold 16px "JetBrains Mono", monospace',
      color,
      glow: 8,
    })

    const progress = Math.min(1, required / (TWO_PI * REQUIRED_ROTATIONS))
    if (progress > 0) {
      r.drawArc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + TWO_PI * progress, {
        strokeColor: color,
        lineWidth: 6,
        glow: 14,
        glowColor: color,
      })
    }

    const magnitude = getStickMagnitude(vec.x, vec.y)
    const live = magnitude >= MIN_MAGNITUDE
    const px = x + vec.x * radius * 0.82
    const py = y + vec.y * radius * 0.82
    r.drawCircle(px, py, Math.max(6, radius * 0.12), {
      fillColor: live ? color : '#4a5560',
      strokeColor: '#fff',
      lineWidth: 2,
      glow: live ? 14 : 0,
      glowColor: color,
    })
  }

  getScore(): ScoreResult {
    this.calculateScore()
    const rotations = this.rotations()
    return {
      score: this.score,
      grade: this.grade,
      details: {
        rotations: Number(rotations.toFixed(2)),
        simultaneousPct: Math.round(Math.min(1, this.simultaneousTime / this.duration) * 100),
        smoothnessPct: Math.round(Math.max(0, 1 - this.reversals / MAX_REVERSALS) * 100),
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    this.left = newTrack()
    this.right = newTrack()
    this.leftVec = { x: 0, y: 0 }
    this.rightVec = { x: 0, y: 0 }
    this.simultaneousTime = 0
    this.elapsed = 0
    this.reversals = 0
    this.completionTime = -1
    this.score = 0
    this.grade = 'F'
    this.fx.clear()
    this.leftWhole = 0
    this.rightWhole = 0
  }
}
