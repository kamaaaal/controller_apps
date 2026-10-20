/**
 * Map Recall — spatial memory.
 *
 * A maze is shown for a couple of seconds and then hidden. The player must
 * navigate the remembered route from the start cell to the goal, with the
 * walls still solid but no longer visible.
 *
 * Difficulty ramps by growing the maze, shortening the preview and making
 * the goal further away — so later rounds lean on memory rather than on
 * sight. Bumping into a wall costs points but never ends the run.
 */

import type { Challenge, ChallengeState, NormalizedInput, ScoreResult } from '../../types'
import { Renderer } from '../../engine/renderer'
import { PALETTE, isReducedMotion } from '../../engine/palette'
import { Fx } from '../../engine/fx'
import { playSfx } from '../../engine/audio'
import { TIMING } from '../../config/timing'
import { formatSecondsRemaining } from '../../utils/timerFormat'
import { mulberry32 } from '../../utils/rng'
import { getMoveVector } from '../../utils/input'
import {
  cellAt,
  generateMaze,
  hasWall,
  stepMaze,
  type Direction,
  type Maze,
  type MazePoint,
} from './maze'

const PLAYER_COLOR = PALETTE.xboxNeon
const GOAL_COLOR = PALETTE.gold
const WALL_COLOR = PALETTE.ps
const MOVE_SPEED = 3.2 // cells per second

/** Maze size by round index. */
function mazeSize(round: number): { cols: number; rows: number } {
  const size = Math.min(9, 5 + Math.floor(round / 2))
  return { cols: size, rows: size }
}

/** Preview time by round index — it shrinks as the player gets better. */
function previewSeconds(round: number): number {
  return Math.max(1.2, TIMING.mapRecallPreviewSeconds - round * 0.15)
}

export class MapRecallChallenge implements Challenge {
  id = 'map-recall'
  name = 'Map Recall'
  description = 'The maze is shown, then hidden — navigate it from memory'
  duration = TIMING.challengeDurations['map-recall']

  private renderer: Renderer | null = null
  private fx = new Fx(isReducedMotion)
  private rng = mulberry32(Math.floor(Math.random() * 1e9))

  private maze: Maze | null = null
  private position: MazePoint = { x: 0, y: 0 }
  private round = 0
  private phase: 'preview' | 'hidden' = 'preview'
  private phaseTime = 0
  private previewLength = 2

  private mazesCleared = 0
  private wallHits = 0
  private streak = 0
  private bestStreak = 0
  private score = 0
  private sessionTime = 0
  private solveSumSeconds = 0
  private solveSamples = 0
  private bumpCooldown = 0
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
    this.round = 0
    this.mazesCleared = 0
    this.wallHits = 0
    this.streak = 0
    this.bestStreak = 0
    this.score = 0
    this.sessionTime = 0
    this.solveSumSeconds = 0
    this.solveSamples = 0
    this.bumpCooldown = 0
    this.banner = { text: '', color: PALETTE.ink, life: 0 }
    this.fx.clear()
    this.nextMaze()
  }

  private nextMaze(): void {
    const size = mazeSize(this.round)
    this.maze = generateMaze(this.rng, size.cols, size.rows)
    this.position = { x: 0.5, y: 0.5 }
    this.phase = 'preview'
    this.phaseTime = 0
    this.previewLength = previewSeconds(this.round)
    playSfx('round')
  }

  update(dt: number, input: NormalizedInput): ChallengeState {
    this.sessionTime += dt
    this.phaseTime += dt
    this.fx.update(dt)
    if (this.banner.life > 0) this.banner.life = Math.max(0, this.banner.life - dt)
    if (this.bumpCooldown > 0) this.bumpCooldown = Math.max(0, this.bumpCooldown - dt)

    if (this.phase === 'preview') {
      if (this.phaseTime >= this.previewLength) {
        this.phase = 'hidden'
        this.phaseTime = 0
        this.banner = { text: 'MEMORISE THE ROUTE', color: PALETTE.ink, life: 1.6 }
      }
    } else {
      this.movePlayer(dt, input)
    }

    return {
      progress: Math.min(1, this.sessionTime / this.duration),
      score: this.score,
      metadata: {
        mazes: this.mazesCleared,
        streak: this.streak,
        phase: this.phase,
      },
    }
  }

  private movePlayer(dt: number, input: NormalizedInput): void {
    const maze = this.maze
    if (!maze) return

    const vector = getMoveVector(input, 'left')
    const direction = this.directionOf(vector)
    if (!direction) return

    const result = stepMaze(maze, this.position, direction, MOVE_SPEED, dt)
    this.position = result.point

    if (result.blocked) {
      if (this.bumpCooldown === 0) {
        this.bumpCooldown = 0.35
        this.wallHits++
        this.streak = 0
        this.score = Math.max(0, this.score - 15)
        this.banner = { text: 'WALL  −15', color: PALETTE.red, life: 0.6 }
        playSfx('miss')
        this.fx.shake(5, 0.18)
      }
      return
    }

    // Reaching the goal clears the maze.
    const cell = cellAt(maze, this.position)
    if (cell.col === maze.goal.col && cell.row === maze.goal.row) {
      this.completeMaze()
    }
  }

  /** Map a stick vector to a cardinal direction (dominant axis wins). */
  private directionOf(vector: { x: number; y: number }): Direction | null {
    const mag = Math.hypot(vector.x, vector.y)
    if (mag < 0.35) return null
    if (Math.abs(vector.x) >= Math.abs(vector.y)) {
      return vector.x > 0 ? 'right' : 'left'
    }
    return vector.y > 0 ? 'down' : 'up'
  }

  private completeMaze(): void {
    this.mazesCleared++
    this.streak++
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    this.solveSumSeconds += this.phaseTime
    this.solveSamples++

    const points = Math.round((150 + this.round * 20) * (1 + Math.min(this.streak * 0.12, 1.5)))
    this.score += points
    this.banner = { text: `FOUND IT  +${points}`, color: GOAL_COLOR, life: 1.2 }
    playSfx('sync')

    const { width, height } = this.renderer?.getContext() ?? { width: 640, height: 360 }
    this.fx.burst({ x: width / 2, y: height / 2, color: GOAL_COLOR, count: 22, speed: 280 })
    this.fx.floatText({ x: width / 2, y: height / 2 - 50, text: `+${points}`, color: GOAL_COLOR })

    this.round++
    this.nextMaze()
  }

  /** Screen rect for the maze grid. */
  private layout(): { x: number; y: number; size: number; cell: number } {
    const { width, height } = this.renderer?.getContext() ?? { width: 640, height: 360 }
    // Leave room under the grid for the phase label and the stat line.
    const size = Math.min(width - 120, height - 230)
    const cols = this.maze?.cols ?? 1
    const rows = this.maze?.rows ?? 1
    const cell = size / Math.max(cols, rows)
    return {
      x: width / 2 - (cell * cols) / 2,
      y: height / 2 - (cell * rows) / 2,
      size,
      cell,
    }
  }

  draw(renderer: Renderer): void {
    const r = this.renderer ?? renderer
    const { width, height } = r.getContext()
    const maze = this.maze
    if (!maze) return

    r.drawBackdrop()

    r.drawStrokeText('MAP RECALL', width / 2, 48, {
      font: '30px "JetBrains Mono", monospace',
      fillColor: WALL_COLOR,
      strokeColor: '#000',
      lineWidth: 6,
      glow: 18,
    })

    const layout = this.layout()
    const cell = layout.cell
    const originX = layout.x
    const originY = layout.y
    const showWalls = this.phase === 'preview'

    const ctx = r.canvasContext
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineWidth = 3

    if (showWalls) {
      // Draw every wall segment.
      ctx.strokeStyle = WALL_COLOR
      ctx.shadowBlur = 12
      ctx.shadowColor = WALL_COLOR
      ctx.beginPath()
      for (let row = 0; row < maze.rows; row++) {
        for (let col = 0; col < maze.cols; col++) {
          const px = originX + col * cell
          const py = originY + row * cell
          if (hasWall(maze, { col, row }, 'up')) {
            ctx.moveTo(px, py)
            ctx.lineTo(px + cell, py)
          }
          if (hasWall(maze, { col, row }, 'left')) {
            ctx.moveTo(px, py)
            ctx.lineTo(px, py + cell)
          }
          if (col === maze.cols - 1 && hasWall(maze, { col, row }, 'right')) {
            ctx.moveTo(px + cell, py)
            ctx.lineTo(px + cell, py + cell)
          }
          if (row === maze.rows - 1 && hasWall(maze, { col, row }, 'down')) {
            ctx.moveTo(px, py + cell)
            ctx.lineTo(px + cell, py + cell)
          }
        }
      }
      ctx.stroke()
    } else {
      // Hidden: show only the start and goal markers as a memory aid.
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(30, 143, 255, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let col = 0; col <= maze.cols; col++) {
        ctx.moveTo(originX + col * cell, originY)
        ctx.lineTo(originX + col * cell, originY + maze.rows * cell)
      }
      for (let row = 0; row <= maze.rows; row++) {
        ctx.moveTo(originX, originY + row * cell)
        ctx.lineTo(originX + maze.cols * cell, originY + row * cell)
      }
      ctx.stroke()
    }
    ctx.restore()

    // Start marker.
    r.drawCircle(originX + cell * 0.5, originY + cell * 0.5, cell * 0.18, {
      strokeColor: PALETTE.inkDim,
      lineWidth: 2,
    })
    r.drawCenteredText('S', originX + cell * 0.5, originY + cell * 0.5, {
      font: 'bold 12px "JetBrains Mono", monospace',
      color: PALETTE.inkDim,
    })

    // Goal marker.
    const goalX = originX + (maze.goal.col + 0.5) * cell
    const goalY = originY + (maze.goal.row + 0.5) * cell
    r.drawCircle(goalX, goalY, cell * 0.22, {
      fillColor: GOAL_COLOR,
      strokeColor: '#ffffff',
      lineWidth: 2,
      glow: 18,
      glowColor: GOAL_COLOR,
    })

    // Player.
    const playerX = originX + this.position.x * cell
    const playerY = originY + this.position.y * cell
    r.drawCircle(playerX, playerY, cell * 0.24, {
      fillColor: PLAYER_COLOR,
      strokeColor: '#ffffff',
      lineWidth: 2,
      glow: 18,
      glowColor: PLAYER_COLOR,
    })

    // Phase banner.
    const label =
      this.phase === 'preview'
        ? `STUDY THE MAZE — ${Math.max(0, this.previewLength - this.phaseTime).toFixed(1)}s`
        : 'FIND THE GOAL'
    r.drawCenteredText(this.banner.life > 0 ? this.banner.text : label, width / 2, height - 74, {
      font: 'bold 18px "JetBrains Mono", monospace',
      color: this.banner.life > 0 ? this.banner.color : this.phase === 'preview' ? PALETTE.gold : PALETTE.ink,
      glow: 10,
    })

    r.drawCenteredText(
      `MAZES ${this.mazesCleared}   STREAK x${this.streak}   BUMPS ${this.wallHits}`,
      width / 2,
      height - 48,
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
      fgColor: danger ? PALETTE.red : WALL_COLOR,
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
    const avgTime = this.solveSamples > 0 ? this.solveSumSeconds / this.solveSamples : 0
    return {
      score: this.score,
      grade: this.gradeFromScore(),
      details: {
        mazes: this.mazesCleared,
        walls: this.wallHits,
        bestStreak: this.bestStreak,
        avgTime: avgTime,
        accuracy: this.mazesCleared + this.wallHits > 0
          ? Math.round((this.mazesCleared / (this.mazesCleared + this.wallHits)) * 100)
          : 0,
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
