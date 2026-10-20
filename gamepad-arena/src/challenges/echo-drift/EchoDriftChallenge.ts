/**
 * Echo Drift (iteration 16) — rhythm, timing, motor memory.
 *
 * The arena shows a short sequence of 8-direction notes pulsing on a beat
 * (demo), then the player reproduces ORDER and RHYTHM with the sticks
 * (response). `hold` notes need a sustained sector entry; `flick` notes need a
 * hard snap — different physical motions on the same stick. Rounds grow,
 * channels alternate, and every 4th round both sticks answer on the same beat.
 *
 * Scoring separates timing accuracy from directional centre, rewards combos
 * and clean rounds, and the visuals fade their cues as rounds advance.
 */

import type { Application, Container, Graphics, Text, TextStyleOptions } from 'pixi.js'
import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { playSfx } from '../../engine/audio'
import { BurstPool, type PixiModules } from '../../engine/pixiFx'
import { TIMING } from '../../config/timing'
import { getMoveVector } from '../../utils/input'
import {
  EARLY_TOLERANCE_S,
  ENTRY_MAGNITUDE,
  FLICK_MAGNITUDE,
  HOLD_TIME,
  SECTOR_RAD,
  TIMING_MAX_S,
  angularDistance,
  directionScore,
  generateRound,
  stickAngle,
  timingScore,
  angleOfDir,
  type Note,
  type RoundPlan,
} from './sequence'

const LEFT_COLOR = 0x9bf00b
const RIGHT_COLOR = 0x1e8fff
const HIT_COLOR = 0x39d353
const MISS_COLOR = 0xff3b45
const GOLD = 0xffd23f
const INK = 0xeef7ec
const DIM = 0xa7bcae

type Phase = 'demo' | 'response' | 'gap'

interface NoteState extends Note {
  atBeat: number
  status: 'pending' | 'hit' | 'missed'
  score: number
}

interface ChannelState {
  notes: NoteState[]
  cursor: number
  holdTime: number
  wasInSector: boolean
  done: boolean
}

interface CursorDisplay {
  angle: number
  magnitude: number
}

export class EchoDriftChallenge implements Challenge {
  id = 'echo-drift'
  name = 'Echo Drift'
  description = 'Watch the pulse, then echo it — order AND rhythm, both sticks'
  duration = TIMING.challengeDurations['echo-drift']
  renderMode = 'pixi' as const

  private app: Application | null = null
  private pixi: PixiModules | null = null
  private ready = false

  private phase: Phase = 'demo'
  private phaseTime = 0
  private round = 0
  private plan: RoundPlan | null = null
  private left: ChannelState = { notes: [], cursor: 0, holdTime: 0, wasInSector: false, done: true }
  private right: ChannelState = { notes: [], cursor: 0, holdTime: 0, wasInSector: false, done: true }
  private leftInput: CursorDisplay = { angle: 0, magnitude: 0 }
  private rightInput: CursorDisplay = { angle: 0, magnitude: 0 }

  private sessionTime = 0
  private score = 0
  private combo = 0
  private bestCombo = 0
  private notesHit = 0
  private notesMissed = 0
  private timingSumMs = 0
  private cleanRounds = 0

  // Display
  private ringsGfx: Graphics | null = null
  private noteParent: Container | null = null
  private noteGfx: Array<{ gfx: Graphics; note: NoteState; channel: 'left' | 'right' }> = []
  private noteGfxKey = ''
  private inputGfx: { left: Graphics; right: Graphics } | null = null
  private sweeperGfx: Graphics | null = null
  private bursts: BurstPool | null = null
  private hud: Record<'score' | 'time' | 'round' | 'phase', Text> | null = null

  setupPixi(app: Application, _gamepad: Gamepad | null): void {
    this.app = app
    this.ready = false
    void this.buildScene()
  }

  private async buildScene(): Promise<void> {
    const app = this.app
    if (!app) return
    const pixi = await import('pixi.js')
    if (this.app !== app) return
    this.pixi = pixi

    const world = new pixi.Container()
    app.stage.addChild(world)
    this.noteParent = world

    this.ringsGfx = new pixi.Graphics()
    this.sweeperGfx = new pixi.Graphics()
    world.addChild(this.ringsGfx, this.sweeperGfx)

    const mkCursor = (color: number) => {
      const g = new pixi.Graphics().circle(0, 0, 9).fill({ color, alpha: 0.9 }).circle(0, 0, 3).fill({ color: 0xffffff })
      world.addChild(g)
      return g
    }
    this.inputGfx = { left: mkCursor(LEFT_COLOR), right: mkCursor(RIGHT_COLOR) }
    this.bursts = new BurstPool(pixi, world)

    const mkText = (style: TextStyleOptions, x: number, y: number) => {
      const t = new pixi.Text({ text: '', style: { fontFamily: '"JetBrains Mono", monospace', ...style } })
      t.position.set(x, y)
      app.stage.addChild(t)
      return t
    }
    this.hud = {
      score: mkText({ fontSize: 20, fill: INK }, 16, 12),
      time: mkText({ fontSize: 20, fill: INK }, app.screen.width / 2, 12),
      round: mkText({ fontSize: 14, fill: DIM }, 16, 40),
      phase: mkText({ fontSize: 16, fill: GOLD }, app.screen.width / 2, app.screen.height - 40),
    }
    this.hud.time.anchor.set(0.5, 0)
    this.hud.phase.anchor.set(0.5, 0)

    this.ready = true
  }

  private toChannelState(plan: RoundPlan, channel: 'left' | 'right'): ChannelState {
    return {
      notes: plan[channel].map((n) => ({ ...n, status: 'pending' as const, score: 0 })),
      cursor: 0,
      holdTime: 0,
      wasInSector: false,
      done: plan[channel].length === 0,
    }
  }

  private startRound(): void {
    this.plan = generateRound(this.round, Math.floor(Math.random() * 1e9))
    this.left = this.toChannelState(this.plan, 'left')
    this.right = this.toChannelState(this.plan, 'right')
    this.phase = 'demo'
    this.phaseTime = 0
    playSfx('round')
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    if (!this.plan || !this.app) return { progress: 0, score: this.score, metadata: {} }
    this.sessionTime += dt
    this.phaseTime += dt

    const l = getMoveVector(input, 'left')
    const r = getMoveVector(input, 'right')
    this.leftInput = { angle: stickAngle(l.x, l.y), magnitude: Math.hypot(l.x, l.y) }
    this.rightInput = { angle: stickAngle(r.x, r.y), magnitude: Math.hypot(r.x, r.y) }

    if (this.phase === 'demo') {
      const steps = Math.max(this.plan.left.length, this.plan.right.length)
      if (this.phaseTime > steps * this.plan.beat + 0.7) {
        this.phase = 'response'
        this.phaseTime = 0
      }
    } else if (this.phase === 'response') {
      this.stepChannel(this.left, this.leftInput, dt)
      this.stepChannel(this.right, this.rightInput, dt)
      if (this.left.done && this.right.done) {
        this.endRound()
      }
    } else {
      // gap
      if (this.phaseTime > 0.9) {
        this.round++
        this.startRound()
      }
    }

    // Particle simulation advances on the fixed timestep, not on the draw rate.
    this.bursts?.update(dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: { round: this.round + 1 },
    }
  }

  private stepChannel(channel: ChannelState, input: CursorDisplay, dt: number): void {
    if (channel.done) return
    const note = channel.notes[channel.cursor]
    if (!note) {
      channel.done = true
      return
    }

    const ideal = note.atBeat * this.plan!.beat
    const offset = this.phaseTime - ideal
    const inSector =
      input.magnitude > ENTRY_MAGNITUDE && angularDistance(input.angle, note.dir) < SECTOR_RAD

    // Expired → miss (auto-advance).
    if (offset > TIMING_MAX_S) {
      this.resolveNote(channel, note, null, null)
      return
    }

    if (inSector) {
      if (note.kind === 'flick') {
        if (offset >= -EARLY_TOLERANCE_S && input.magnitude >= FLICK_MAGNITUDE && !channel.wasInSector) {
          this.resolveNote(channel, note, offset, input)
        }
      } else {
        if (offset >= -EARLY_TOLERANCE_S) {
          channel.holdTime += dt
          if (channel.holdTime >= HOLD_TIME) {
            this.resolveNote(channel, note, offset - HOLD_TIME / 2, input)
          }
        }
      }
    } else {
      channel.holdTime = 0
    }
    channel.wasInSector = inSector
  }

  private resolveNote(
    channel: ChannelState,
    note: NoteState,
    offset: number | null,
    input: CursorDisplay | null
  ): void {
    channel.cursor++
    channel.holdTime = 0
    if (channel.cursor >= channel.notes.length) channel.done = true

    const pos = this.noteScreenPos(note, channel === this.left ? 'left' : 'right')

    if (offset === null || input === null) {
      note.status = 'missed'
      this.notesMissed++
      this.combo = 0
      this.setPhaseBanner('MISS', MISS_COLOR)
      playSfx('miss')
      this.bursts?.spawn(pos.x, pos.y, { color: MISS_COLOR, count: 8, speed: 120 })
      return
    }

    const timing = timingScore(offset)
    const direction = directionScore(input.angle, input.magnitude, note.dir)
    const raw = timing * 0.6 + direction * 0.4
    const mult = Math.min(2, 1 + this.combo * 0.05)
    const points = Math.round(raw * mult)

    note.status = 'hit'
    note.score = points
    this.score += points
    this.notesHit++
    this.combo++
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    this.timingSumMs += Math.abs(offset) * 1000

    this.setPhaseBanner(`${Math.round(timing)} TIMING · ${Math.round(direction)} AIM  +${points}`, timing >= 99 ? GOLD : HIT_COLOR)
    playSfx(timing >= 99 && direction >= 90 ? 'perfect' : this.combo % 5 === 0 ? 'combo' : 'hit')
    this.bursts?.spawn(pos.x, pos.y, { color: HIT_COLOR, count: 14 })
  }

  private endRound(): void {
    const hits = this.left.notes.filter((n) => n.status === 'hit').length + this.right.notes.filter((n) => n.status === 'hit').length
    const clean = hits === this.plan!.length
    if (clean) {
      this.cleanRounds++
      const bonus = Math.round(50 * this.plan!.length * (this.plan!.simultaneous ? 1.5 : 1))
      this.score += bonus
      this.setPhaseBanner(`CLEAN ROUND +${bonus}`, GOLD)
      playSfx('sync')
    }
    this.phase = 'gap'
    this.phaseTime = 0
  }

  private banner = { text: '', color: INK, life: 0 }

  private setPhaseBanner(text: string, color: number): void {
    this.banner = { text, color, life: 0.9 }
  }

  // ---- Display -----------------------------------------------------------

  private centre(): { x: number; y: number } {
    const w = this.app?.screen.width ?? 1280
    const h = this.app?.screen.height ?? 720
    return { x: w / 2, y: h / 2 + 10 }
  }

  private noteScreenPos(note: Note, channel: 'left' | 'right'): { x: number; y: number } {
    const c = this.centre()
    const list = channel === 'left' ? this.left.notes : this.right.notes
    const index = list.indexOf(note as NoteState)
    const count = Math.max(1, list.length)
    // Left channel arcs across the left half, right across the right half.
    const spread = Math.PI * 0.86
    const base = channel === 'left' ? Math.PI - spread / 2 : spread / 2
    const t = count === 1 ? 0.5 : index / (count - 1)
    const angle = base + (channel === 'left' ? -1 : 1) * (t - 0.5) * -spread
    const radius = 150
    return { x: c.x + Math.cos(angle) * radius, y: c.y - Math.sin(angle) * radius }
  }

  drawPixi(): void {
    if (!this.ready || !this.app || !this.plan || !this.pixi) return
    const c = this.centre()
    const beatPhase = (this.phaseTime % this.plan.beat) / this.plan.beat

    // Rings: steady cores + a beat-synced pulse during the demo.
    const rings = this.ringsGfx!
    rings.clear()
    rings.circle(c.x, c.y, 60).stroke({ width: 2, color: 0x2a3848, alpha: 0.9 })
    rings.circle(c.x, c.y, 90).stroke({ width: 1.5, color: 0x2a3848, alpha: 0.7 })
    rings.circle(c.x, c.y, 120).stroke({ width: 1, color: 0x2a3848, alpha: 0.5 })
    if (this.phase === 'demo') {
      const pulseR = 40 + beatPhase * 110
      rings.circle(c.x, c.y, pulseR).stroke({ width: 2.5, color: LEFT_COLOR, alpha: 0.5 * (1 - beatPhase) })
    }
    rings.circle(c.x, c.y, 14).fill({ color: INK, alpha: 0.9 })

    // Notes: one Graphics per pending note — geometry built when the plan or
    // cursor advances; only alpha/scale change per frame.
    const key = `${this.round}-${this.phase}-${this.left.cursor}-${this.right.cursor}`
    if (key !== this.noteGfxKey) {
      this.noteGfx.forEach((n) => n.gfx.destroy())
      this.noteGfx = []
      const add = (note: NoteState, channel: 'left' | 'right') => {
        if (note.status === 'hit' || !this.noteParent) return
        const pos = this.noteScreenPos(note, channel)
        const color = channel === 'left' ? LEFT_COLOR : RIGHT_COLOR
        const strokeColor = note.status === 'missed' ? MISS_COLOR : color
        const g = new this.pixi!.Graphics()
        g.poly([14, 0, -7, 9, -7, -9]).stroke({ width: 2.5, color: strokeColor })
        if (note.kind === 'hold') g.circle(0, 0, 3).fill({ color: strokeColor })
        g.position.set(pos.x, pos.y)
        g.rotation = angleOfDir(note.dir)
        this.noteParent.addChild(g)
        this.noteGfx.push({ gfx: g, note, channel })
      }
      this.left.notes.forEach((n) => add(n, 'left'))
      this.right.notes.forEach((n) => add(n, 'right'))
      this.noteGfxKey = key
    }
    for (const { note, channel, gfx } of this.noteGfx) {
      let alpha = 0.55
      let scale = 1
      if (this.phase === 'demo') {
        const activeBeat = Math.floor(this.phaseTime / this.plan!.beat)
        if (note.atBeat === activeBeat) {
          alpha = 1
          scale = 1.35 - beatPhase * 0.25
        } else if (note.atBeat < activeBeat) {
          alpha = 0.18
        }
      } else if (this.phase === 'response') {
        const chan = channel === 'left' ? this.left : this.right
        const isCurrent = chan.notes[chan.cursor] === note
        alpha = isCurrent ? 0.95 : 0.4
        scale = isCurrent ? 1.15 : 1
      }
      if (note.status === 'missed') alpha = 0.3
      gfx.alpha = alpha
      gfx.scale.set(scale)
    }

    // Sweeper marks the response beat.
    const sweep = this.sweeperGfx!
    sweep.clear()
    if (this.phase === 'response') {
      const a = -Math.PI / 2 + beatPhase * Math.PI * 2
      sweep.moveTo(c.x, c.y)
      sweep.lineTo(c.x + Math.cos(a) * 130, c.y - Math.sin(a) * 130)
      sweep.stroke({ width: 1.5, color: GOLD, alpha: 0.35 })
    }

    // Live input cursors — the player sees exactly what the stick is doing.
    const inp = this.inputGfx!
    const place = (g: Graphics, disp: CursorDisplay, radius: number) => {
      g.position.set(c.x + Math.cos(disp.angle) * disp.magnitude * radius, c.y - Math.sin(disp.angle) * disp.magnitude * radius)
      g.alpha = disp.magnitude > 0.05 ? 1 : 0.25
    }
    place(inp.left, this.leftInput, 55)
    place(inp.right, this.rightInput, 85)

    // HUD.
    const remaining = Math.max(0, this.duration - this.sessionTime)
    this.hud!.score.text = `SCORE ${this.score}   COMBO x${this.combo}`
    this.hud!.time.text = `${remaining.toFixed(1)}s`
    this.hud!.time.style.fill = remaining <= 5 ? MISS_COLOR : INK
    this.hud!.round.text = `ROUND ${this.round + 1}   BEST COMBO x${this.bestCombo}`
    const label =
      this.phase === 'demo' ? 'WATCH' : this.phase === 'response' ? 'REPEAT — IN ORDER, ON THE BEAT' : '…'
    this.hud!.phase.text = this.banner.life > 0 ? `${label}   ${this.banner.text}` : label
    this.hud!.phase.style.fill = this.banner.life > 0 ? this.banner.color : GOLD
  }

  getScore(): ScoreResult {
    const total = this.notesHit + this.notesMissed
    const s = this.score
    return {
      score: s,
      grade: s >= 6000 ? 'S' : s >= 4500 ? 'A' : s >= 3000 ? 'B' : s >= 1800 ? 'C' : s >= 900 ? 'D' : 'F',
      details: {
        notesHit: this.notesHit,
        notesMissed: this.notesMissed,
        avgTimingMs: this.notesHit > 0 ? Math.round(this.timingSumMs / this.notesHit) : 0,
        bestCombo: this.bestCombo,
        cleanRounds: this.cleanRounds,
        accuracyPct: total > 0 ? Math.round((this.notesHit / total) * 100) : 0,
      },
      timestamp: Date.now(),
    }
  }

  reset(): void {
    this.sessionTime = 0
    this.round = 0
    this.score = 0
    this.combo = 0
    this.bestCombo = 0
    this.notesHit = 0
    this.notesMissed = 0
    this.timingSumMs = 0
    this.cleanRounds = 0
    this.banner = { text: '', color: INK, life: 0 }
    this.leftInput = { angle: 0, magnitude: 0 }
    this.rightInput = { angle: 0, magnitude: 0 }
    this.noteGfx.forEach((n) => n.gfx.destroy())
    this.noteGfx = []
    this.noteGfxKey = ''
    this.startRound()
  }
}
