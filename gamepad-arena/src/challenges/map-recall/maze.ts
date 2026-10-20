/**
 * Map Recall — maze generation and grid movement (pure logic).
 *
 * The maze is a perfect maze (a randomised depth-first spanning tree), so
 * every cell is reachable and there is exactly one route between any two
 * cells — which is what makes "remember the route" a fair test.
 *
 * Positions are continuous and expressed in cell units: cell (col, row)
 * occupies the square [col, col+1) × [row, row+1), so the player slides
 * smoothly and only crosses a boundary when the movement actually reaches it.
 */

import type { Rng } from '../../utils/rng'

export type Direction = 'up' | 'down' | 'left' | 'right'

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

export const WALL_NORTH = 1
export const WALL_EAST = 2
export const WALL_SOUTH = 4
export const WALL_WEST = 8
export const ALL_WALLS = WALL_NORTH | WALL_EAST | WALL_SOUTH | WALL_WEST

export interface Cell {
  col: number
  row: number
}

export interface Maze {
  cols: number
  rows: number
  /** Wall bitmask per cell, row-major. */
  cells: number[]
  start: Cell
  goal: Cell
}

/** A continuous position in cell units. */
export interface MazePoint {
  x: number
  y: number
}

const DIR_WALL: Record<Direction, number> = {
  up: WALL_NORTH,
  right: WALL_EAST,
  down: WALL_SOUTH,
  left: WALL_WEST,
}

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export function cellIndex(maze: { cols: number; rows: number }, cell: Cell): number {
  return cell.row * maze.cols + cell.col
}

export function inBounds(maze: { cols: number; rows: number }, cell: Cell): boolean {
  return cell.col >= 0 && cell.col < maze.cols && cell.row >= 0 && cell.row < maze.rows
}

/** The cell containing a continuous position. */
export function cellAt(maze: Maze, point: MazePoint): Cell {
  const col = Math.max(0, Math.min(maze.cols - 1, Math.floor(point.x)))
  const row = Math.max(0, Math.min(maze.rows - 1, Math.floor(point.y)))
  return { col, row }
}

/** True when the cell has a wall on the given side. */
export function hasWall(maze: Maze, cell: Cell, dir: Direction): boolean {
  if (!inBounds(maze, cell)) return true
  const mask = maze.cells[cellIndex(maze, cell)]
  return (mask & DIR_WALL[dir]) !== 0
}

/** Directions the player can leave a cell in. */
export function openings(maze: Maze, cell: Cell): Direction[] {
  return DIRECTIONS.filter((dir) => !hasWall(maze, cell, dir))
}

/**
 * Build a perfect maze with a randomised depth-first walk.
 *
 * The goal is the cell furthest from the start, so the route is always worth
 * remembering.
 */
export function generateMaze(rng: Rng, cols: number, rows: number): Maze {
  const width = Math.max(2, Math.floor(cols))
  const height = Math.max(2, Math.floor(rows))
  const cells = new Array<number>(width * height).fill(ALL_WALLS)
  const visited = new Array<boolean>(width * height).fill(false)

  const start: Cell = { col: 0, row: 0 }
  visited[0] = true
  const stack: Cell[] = [start]

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    const candidates: Array<{ cell: Cell; dir: Direction }> = []

    const consider = (cell: Cell, dir: Direction) => {
      if (!inBounds({ cols: width, rows: height }, cell)) return
      if (visited[cell.row * width + cell.col]) return
      candidates.push({ cell, dir })
    }

    consider({ col: current.col, row: current.row - 1 }, 'up')
    consider({ col: current.col + 1, row: current.row }, 'right')
    consider({ col: current.col, row: current.row + 1 }, 'down')
    consider({ col: current.col - 1, row: current.row }, 'left')

    if (candidates.length === 0) {
      stack.pop()
      continue
    }

    const chosen = candidates[Math.floor(rng() * candidates.length) % candidates.length]
    const here = cellIndex({ cols: width, rows: height }, current)
    const there = cellIndex({ cols: width, rows: height }, chosen.cell)

    cells[here] &= ~DIR_WALL[chosen.dir]
    cells[there] &= ~DIR_WALL[OPPOSITE[chosen.dir]]
    visited[there] = true
    stack.push(chosen.cell)
  }

  const maze: Maze = { cols: width, rows: height, cells, start, goal: start }
  maze.goal = farthestCell(maze, start)
  return maze
}

/** The reachable cell furthest from `from` (by path length). */
export function farthestCell(maze: Maze, from: Cell): Cell {
  const distance = bfsDistances(maze, from)
  let best = from
  let bestDistance = -1
  for (const [index, d] of distance) {
    if (d > bestDistance) {
      bestDistance = d
      best = { col: index % maze.cols, row: Math.floor(index / maze.cols) }
    }
  }
  return best
}

function bfsDistances(maze: Maze, from: Cell): Map<number, number> {
  const distances = new Map<number, number>()
  const startIndex = cellIndex(maze, from)
  distances.set(startIndex, 0)
  const queue: Cell[] = [from]

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDistance = distances.get(cellIndex(maze, current)) ?? 0
    for (const dir of openings(maze, current)) {
      const next: Cell = {
        col: current.col + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0),
        row: current.row + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0),
      }
      if (!inBounds(maze, next)) continue
      const nextIndex = cellIndex(maze, next)
      if (distances.has(nextIndex)) continue
      distances.set(nextIndex, currentDistance + 1)
      queue.push(next)
    }
  }
  return distances
}

/**
 * The shortest route from `from` to `to`, inclusive of both ends.
 * Returns an empty array when no route exists.
 */
export function shortestPath(maze: Maze, from: Cell, to: Cell): Cell[] {
  const previous = new Map<number, number>()
  const visited = new Set<number>()
  const queue: Cell[] = [from]
  const fromIndex = cellIndex(maze, from)
  const toIndex = cellIndex(maze, to)
  visited.add(fromIndex)

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentIndex = cellIndex(maze, current)
    if (currentIndex === toIndex) break

    for (const dir of openings(maze, current)) {
      const next: Cell = {
        col: current.col + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0),
        row: current.row + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0),
      }
      if (!inBounds(maze, next)) continue
      const nextIndex = cellIndex(maze, next)
      if (visited.has(nextIndex)) continue
      visited.add(nextIndex)
      previous.set(nextIndex, currentIndex)
      queue.push(next)
    }
  }

  if (!visited.has(toIndex)) return []

  const path: Cell[] = []
  let cursor = toIndex
  while (cursor !== fromIndex) {
    path.push({ col: cursor % maze.cols, row: Math.floor(cursor / maze.cols) })
    const prev = previous.get(cursor)
    if (prev === undefined) return []
    cursor = prev
  }
  path.push(from)
  path.reverse()
  return path
}

export interface MazeStep {
  point: MazePoint
  /** True when the movement was stopped by a wall. */
  blocked: boolean
}

/**
 * Advance a continuous position by `speed` cells per second in `dir`.
 *
 * A wall stops the movement at the boundary instead of letting the player
 * slip through it, and reports `blocked` so the game can score the bump.
 */
export function stepMaze(
  maze: Maze,
  point: MazePoint,
  dir: Direction,
  speed: number,
  dt: number
): MazeStep {
  let { x, y } = point
  let blocked = false

  const horizontal = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
  const vertical = dir === 'up' ? -1 : dir === 'down' ? 1 : 0

  if (horizontal !== 0) {
    const next = point.x + horizontal * speed * dt
    const col = Math.floor(point.x)
    const row = Math.floor(point.y)
    const boundary = horizontal > 0 ? col + 1 : col
    const crossing = horizontal > 0 ? next >= boundary : next <= boundary
    if (crossing) {
      const neighbour: Cell = { col: horizontal > 0 ? col + 1 : col - 1, row }
      if (!inBounds(maze, neighbour) || hasWall(maze, { col, row }, horizontal > 0 ? 'right' : 'left')) {
        x = boundary
        blocked = true
      } else {
        x = next
      }
    } else {
      x = next
    }
  }

  if (vertical !== 0) {
    const next = point.y + vertical * speed * dt
    const col = Math.floor(point.x)
    const row = Math.floor(point.y)
    const boundary = vertical > 0 ? row + 1 : row
    const crossing = vertical > 0 ? next >= boundary : next <= boundary
    if (crossing) {
      const neighbour: Cell = { col, row: vertical > 0 ? row + 1 : row - 1 }
      if (!inBounds(maze, neighbour) || hasWall(maze, { col, row }, vertical > 0 ? 'down' : 'up')) {
        y = boundary
        blocked = true
      } else {
        y = next
      }
    } else {
      y = next
    }
  }

  return { point: { x, y }, blocked }
}
