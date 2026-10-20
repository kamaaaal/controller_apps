import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import {
  cellAt,
  farthestCell,
  generateMaze,
  hasWall,
  inBounds,
  openings,
  shortestPath,
  stepMaze,
  type Cell,
  type Maze,
} from './maze'

function mazeOf(cols: number, rows: number, seed = 1): Maze {
  return generateMaze(mulberry32(seed), cols, rows)
}

describe('generateMaze', () => {
  it('creates the requested size', () => {
    const maze = mazeOf(6, 5)
    expect(maze.cols).toBe(6)
    expect(maze.rows).toBe(5)
    expect(maze.cells).toHaveLength(30)
  })

  it('seals the outer border', () => {
    const maze = mazeOf(5, 5)
    for (let col = 0; col < maze.cols; col++) {
      expect(hasWall(maze, { col, row: 0 }, 'up')).toBe(true)
      expect(hasWall(maze, { col, row: maze.rows - 1 }, 'down')).toBe(true)
    }
    for (let row = 0; row < maze.rows; row++) {
      expect(hasWall(maze, { col: 0, row }, 'left')).toBe(true)
      expect(hasWall(maze, { col: maze.cols - 1, row }, 'right')).toBe(true)
    }
  })

  it('carves exactly one opening per cell pair', () => {
    const maze = mazeOf(6, 6)
    // A perfect maze over N cells has N-1 passages.
    let passages = 0
    for (const dir of ['right', 'down'] as const) {
      for (let row = 0; row < maze.rows; row++) {
        for (let col = 0; col < maze.cols; col++) {
          if (!hasWall(maze, { col, row }, dir)) passages++
        }
      }
    }
    expect(passages).toBe(maze.cols * maze.rows - 1)
  })

  it('is deterministic for a given seed', () => {
    expect(mazeOf(5, 5, 9).cells).toEqual(mazeOf(5, 5, 9).cells)
  })

  it('differs across seeds', () => {
    expect(mazeOf(5, 5, 1).cells).not.toEqual(mazeOf(5, 5, 2).cells)
  })

  it('places the goal away from the start', () => {
    const maze = mazeOf(6, 6)
    expect(maze.goal).not.toEqual(maze.start)
  })

  it('places the goal at the far end of the maze', () => {
    const maze = mazeOf(7, 7)
    expect(farthestCell(maze, maze.start)).toEqual(maze.goal)
  })

  it('never produces a disconnected maze', () => {
    const maze = mazeOf(8, 8)
    const path = shortestPath(maze, maze.start, maze.goal)
    expect(path.length).toBeGreaterThan(1)
  })
})

describe('hasWall / openings', () => {
  it('reports the outer border as walled', () => {
    const maze = mazeOf(4, 4)
    expect(hasWall(maze, { col: 0, row: 0 }, 'up')).toBe(true)
    expect(hasWall(maze, { col: 0, row: 0 }, 'left')).toBe(true)
  })

  it('reports out-of-bounds cells as walled', () => {
    const maze = mazeOf(4, 4)
    expect(hasWall(maze, { col: -1, row: 0 }, 'left')).toBe(true)
    expect(hasWall(maze, { col: 0, row: 9 }, 'up')).toBe(true)
  })

  it('gives every cell at least one opening', () => {
    const maze = mazeOf(6, 6)
    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        expect(openings(maze, { col, row }).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('inBounds', () => {
  it('accepts cells inside the grid', () => {
    const maze = mazeOf(4, 4)
    expect(inBounds(maze, { col: 0, row: 0 })).toBe(true)
    expect(inBounds(maze, { col: 3, row: 3 })).toBe(true)
  })

  it('rejects cells outside the grid', () => {
    const maze = mazeOf(4, 4)
    expect(inBounds(maze, { col: 4, row: 0 })).toBe(false)
    expect(inBounds(maze, { col: 0, row: -1 })).toBe(false)
  })
})

describe('cellAt', () => {
  it('maps a point to its cell', () => {
    const maze = mazeOf(4, 4)
    expect(cellAt(maze, { x: 0.5, y: 0.5 })).toEqual({ col: 0, row: 0 })
    expect(cellAt(maze, { x: 2.9, y: 1.1 })).toEqual({ col: 2, row: 1 })
  })

  it('clamps points outside the grid', () => {
    const maze = mazeOf(4, 4)
    expect(cellAt(maze, { x: -3, y: -3 })).toEqual({ col: 0, row: 0 })
    expect(cellAt(maze, { x: 99, y: 99 })).toEqual({ col: 3, row: 3 })
  })
})

describe('shortestPath', () => {
  it('returns a connected route from start to goal', () => {
    const maze = mazeOf(7, 7, 5)
    const path = shortestPath(maze, maze.start, maze.goal)
    expect(path[0]).toEqual(maze.start)
    expect(path[path.length - 1]).toEqual(maze.goal)
  })

  it('walks only through open passages', () => {
    const maze = mazeOf(6, 6, 8)
    const path = shortestPath(maze, maze.start, maze.goal)
    for (let i = 1; i < path.length; i++) {
      const previous = path[i - 1]
      const current = path[i]
      const dir =
        current.col === previous.col + 1
          ? 'right'
          : current.col === previous.col - 1
            ? 'left'
            : current.row === previous.row + 1
              ? 'down'
              : 'up'
      expect(hasWall(maze, previous, dir)).toBe(false)
    }
  })

  it('returns an empty route for an unreachable cell', () => {
    const maze = mazeOf(4, 4)
    expect(shortestPath(maze, { col: 0, row: 0 }, { col: 99, row: 99 })).toEqual([])
  })
})

describe('stepMaze', () => {
  it('moves freely inside a cell', () => {
    const maze = mazeOf(4, 4)
    const step = stepMaze(maze, { x: 0.5, y: 0.5 }, 'right', 2, 0.1)
    expect(step.point.x).toBeCloseTo(0.7)
    expect(step.blocked).toBe(false)
  })

  it('crosses an open boundary', () => {
    const maze = mazeOf(4, 4)
    // Find a cell with an opening to the right and step across it.
    let from: Cell | null = null
    for (let row = 0; row < maze.rows && !from; row++) {
      for (let col = 0; col < maze.cols; col++) {
        if (!hasWall(maze, { col, row }, 'right')) {
          from = { col, row }
          break
        }
      }
    }
    expect(from).not.toBeNull()
    const cell = from!
    const step = stepMaze(maze, { x: cell.col + 0.9, y: cell.row + 0.5 }, 'right', 2, 0.1)
    expect(step.blocked).toBe(false)
    expect(step.point.x).toBeGreaterThan(cell.col + 1)
  })

  it('is stopped by a wall', () => {
    const maze = mazeOf(4, 4)
    // The top-left cell always keeps its north and west walls.
    const step = stepMaze(maze, { x: 0.05, y: 0.05 }, 'up', 4, 0.5)
    expect(step.blocked).toBe(true)
    expect(step.point.y).toBe(0)
  })

  it('cannot leave the outer border', () => {
    const maze = mazeOf(4, 4)
    const step = stepMaze(maze, { x: 0.5, y: 0.5 }, 'left', 4, 1)
    expect(step.blocked).toBe(true)
    expect(step.point.x).toBe(0)
  })

  it('does not report a block while moving freely', () => {
    const maze = mazeOf(5, 5)
    const step = stepMaze(maze, { x: 1.5, y: 1.5 }, 'down', 1, 0.05)
    expect(step.blocked).toBe(false)
  })
})
