/**
 * Balance Beam — analog trigger fine control.
 *
 * LT and RT tilt a beam; the ball rolls along it under gravity and must be
 * eased onto each orb. This is the only game in the lineup that uses the
 * analog triggers, and it is deliberately about *precision* rather than
 * speed: the beam follows the trigger through a spring-damper, so a light
 * touch produces a small tilt.
 *
 * Controllers that report their triggers as plain on/off buttons cannot play
 * it, so the game detects that case and falls back to the left stick's X axis
 * (announced on screen so the switch is never a mystery).
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
  BEAM_HALF_LENGTH,
  ORB_RADIUS,
  collectOrb,
  isAnalogReading,
  isOffBeam,
  nextOrbX,
  stepBall,
  stepBeam,
  tiltFromTriggers,
  type BallState,
  type BeamState,
} from './beam'

const BEAM_COLOR = PALETTE.ps
const BALL_COLOR = PALETTE.gold
const ORB_COLOR = PALETTE.xboxNeon
const LIVES = 3

/** Seconds of play before the game decides whether triggers are usable. */
const TRIGGER_PROBE_SECONDS = 2.5

export class BalanceBeamChallenge implements Challenge {
  id = 'balance-beam'
  name = 'Balance Beam'
  description = 'Tilt with the triggers and roll the ball onto every orb'
  duration = TIMING.challengeDurations['balance-beam']

  private renderer: Renderer | null = null
  private fx = new Fx(isReducedMotion)
  private rng = mulberry32(Math.floor(Math.random() * 1e9))

  private beam: BeamState = { angle: 0, angularVelocity: 0 }
  private ball: BallState = { x: 0, vx: 0 }
  private orbX = 0
  private orbActive = false
  private orbValue = 100

  private orbs = 0
  private combo = 0
  private bestCombo = 0
  private lives = LIVES
  private score = 0
  private sessionTime = 0
  private timeOnBeam = 0

  private analogTriggersSeen = false
  private stickFallback = false
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
    this.rng = mulberry32(Math.floor(Math.random() * 1e9))
    this.beam = { angle: 0, angularVelocity: 0 }
    this.ball = { x: 0, vx: 0 }
    this.orbActive = false
    this.orbX = 0
    this.orbValue = 100
    this.orbs = 0
    this.combo = 0
    this.bestCombo = 0
    this.lives = LIVES
    this.score = 0
    this.sessionTime = 0
    this.timeOnBeam = 0
    this.analogTriggersSeen = false
    this.stickFallback = false
    this.banner = { text: '', color: PALETTE.ink, life: 0 }
    this.fx.clear()
    this.spawnOrb()
  }

  private spawnOrb(): void {
    this.orbX = nextOrbX(this.rng, this.ball.x)
    this.orbActive = true
    // Orbs are worth more as the run goes on, and the occasional bonus orb
    // is worth three.
    this.orbValue = this.rng() < 0.15 ? 300 : 100
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.sessionTime += dt
    this.fx.update(dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)

    // Decide once whether the triggers can be used for analog control.
    if (!this.analogTriggersSeen) {
      if (isAnalogReading(input.axes.leftTrigger) || isAnalogReading(input.axes.rightTrigger)) {
        this.analogTriggersSeen = true
      } else if (this.sessionTime > TRIGGER_PROBE_SECONDS) {
        this.stickFallback = true
        this.banner = { text: 'ANALOG TRIGGERS NOT DETECTED — USE LEFT STICK', color: PALETTE.gold, life: 3 }
      }
    }

    const tilt = this.stickFallback
      ? input.axes.leftStick.x
      : tiltFromTriggers(input.axes.leftTrigger, input.axes.rightTrigger)

    this.beam = stepBeam(this.beam, tilt, dt)
    this.ball = stepBall(this.ball, this.beam.angle, dt)
    this.timeOnBeam += dt

    if (isOffBeam(this.ball)) {
      this.loseLife()
    } else if (this.orbActive && collectOrb(this.ball.x, this.orbX)) {
      this.collectOrb()
    }

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: {
        orbs: this.orbs,
        lives: this.lives,
        combo: this.combo,
      },
    }
  }

  private collectOrb(): void {
    this.orbActive = false
    this.orbs++
    this.combo++
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    const points = Math.round(this.orbValue * (1 + Math.min(this.combo * 0.1, 1.5)))
    this.score += points
    this.banner = { text: `+${points}`, color: ORB_COLOR, life: 0.7 }
    playSfx(this.combo > 0 && this.combo % 5 === 0 ? 'combo' : 'hit')

    const orbScreen = this.orbScreenPos()
    this.fx.burst({ x: orbScreen.x, y: orbScreen.y, color: ORB_COLOR, count: 14, speed: 200 })
    this.fx.floatText({ x: orbScreen.x, y: orbScreen.y - 20, text: `+${points}`, color: ORB_COLOR })

    this.spawnOrb()
  }

  private loseLife(): void {
    this.lives--
    this.combo = 0
    this.score = Math.max(0, this.score - 50)
    this.ball = { x: 0, vx: 0 }
    this.beam = { angle: 0, angularVelocity: 0 }
    this.banner = { text: 'FELL OFF  −50', color: PALETTE.red, life: 1 }
    playSfx('crash')
    this.fx.shake(9, 0.3)

    if (this.lives <= 0) {
      this.banner = { text: 'OUT OF LIVES', color: PALETTE.red, life: 5 }
    } else {
      this.spawnOrb()
    }
  }

  /** Where the beam's centre sits on screen. */
  private beamOrigin(): { x: number; y: number } {
    const { width, height } = this.renderer?.getContext() ?? { width: 640, height: 360 }
    return { x: width / 2, y: height / 2 + 30 }
  }

  private orbScreenPos(): { x: number; y: number } {
    const origin = this.beamOrigin()
    return {
      x: origin.x + this.orbX * Math.cos(this.beam.angle),
      y: origin.y + this.orbX * Math.sin(this.beam.angle),
    }
  }

  private ballScreenPos(): { x: number; y: number } {
    const origin = this.beamOrigin()
    return {
      x: origin.x + this.ball.x * Math.cos(this.beam.angle),
      y: origin.y + this.ball.x * Math.sin(this.beam.angle),
    }
  }

  draw(renderer: Renderer): void {
    const r = this.renderer ?? renderer
    const { width, height } = r.getContext()
    const origin = this.beamOrigin()

    r.drawBackdrop()

    r.drawStrokeText('BALANCE BEAM', width / 2, 52, {
      font: '30px "JetBrains Mono", monospace',
      fillColor: BEAM_COLOR,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 18,
    })

    // The beam.
    const cos = Math.cos(this.beam.angle)
    const sin = Math.sin(this.beam.angle)
    const leftX = origin.x - BEAM_HALF_LENGTH * cos
    const leftY = origin.y - BEAM_HALF_LENGTH * sin
    const rightX = origin.x + BEAM_HALF_LENGTH * cos
    const rightY = origin.y + BEAM_HALF_LENGTH * sin

    const ctx = r.canvasContext
    ctx.save()
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(leftX, leftY)
    ctx.lineTo(rightX, rightY)
    ctx.strokeStyle = PALETTE.stroke
    ctx.lineWidth = 14
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(leftX, leftY)
    ctx.lineTo(rightX, rightY)
    ctx.strokeStyle = BEAM_COLOR
    ctx.lineWidth = 6
    ctx.shadowBlur = 16
    ctx.shadowColor = BEAM_COLOR
    ctx.stroke()
    ctx.restore()

    // End caps.
    r.drawCircle(leftX, leftY, 7, { fillColor: BEAM_COLOR, glow: 12, glowColor: BEAM_COLOR })
    r.drawCircle(rightX, rightY, 7, { fillColor: BEAM_COLOR, glow: 12, glowColor: BEAM_COLOR })

    // The orb.
    if (this.orbActive) {
      const orb = this.orbScreenPos()
      const bonus = this.orbValue > 100
      r.drawCircle(orb.x, orb.y, ORB_RADIUS, {
        fillColor: bonus ? PALETTE.gold : ORB_COLOR,
        strokeColor: '#ffffff',
        lineWidth: 2,
        glow: 20,
        glowColor: bonus ? PALETTE.gold : ORB_COLOR,
      })
    }

    // The ball.
    const ball = this.ballScreenPos()
    r.drawCircle(ball.x, ball.y, 13, {
      fillColor: BALL_COLOR,
      strokeColor: '#ffffff',
      lineWidth: 2,
      glow: 20,
      glowColor: BALL_COLOR,
    })

    // Tilt gauge.
    r.drawCenteredText(
      this.stickFallback ? 'TILT: LEFT STICK X' : 'TILT: LT / RT TRIGGERS',
      width / 2,
      origin.y - 96,
      { font: '14px "JetBrains Mono", monospace', color: PALETTE.inkDim }
    )

    // Lives.
    for (let i = 0; i < LIVES; i++) {
      r.drawCircle(width / 2 - 20 + i * 40, origin.y - 52, 8, {
        fillColor: i < this.lives ? PALETTE.success : PALETTE.ringTrack,
        strokeColor: i < this.lives ? PALETTE.success : PALETTE.stroke,
        lineWidth: 2,
        glow: i < this.lives ? 10 : 0,
      })
    }

    if (this.banner.life > 0) {
      r.drawCenteredText(this.banner.text, width / 2, origin.y + 76, {
        font: 'bold 20px "JetBrains Mono", monospace',
        color: this.banner.color,
        glow: 12,
      })
    }

    r.drawCenteredText(
      `ORBS ${this.orbs}   COMBO x${this.combo}   SCORE ${this.score}`,
      width / 2,
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
      fgColor: danger ? PALETTE.red : BEAM_COLOR,
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
    return {
      score: this.score,
      grade: this.gradeFromScore(),
      details: {
        orbs: this.orbs,
        lives: this.lives,
        bestCombo: this.bestCombo,
        avgTime: this.orbs > 0 ? this.timeOnBeam / this.orbs : 0,
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
