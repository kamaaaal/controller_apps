import { describe, it, expect } from 'vitest'
import { goBackTarget, playPath, ROUTES } from './routes'

describe('route helpers', () => {
  it('builds deep-linkable play paths', () => {
    expect(playPath('button-blitz')).toBe('/play/button-blitz')
    expect(playPath('twin-target')).toBe('/play/twin-target')
  })

  it('escapes challenge ids into a single path segment', () => {
    expect(playPath('twin target')).toBe('/play/twin%20target')
  })

  it('keeps the library and settings routes stable', () => {
    expect(ROUTES.library).toBe('/')
    expect(ROUTES.settings).toBe('/settings')
  })

  it('goes back in history when the app pushed the current entry', () => {
    expect(goBackTarget(1)).toBe('back')
    expect(goBackTarget(3)).toBe('back')
  })

  it('falls back to the library for deep links (no router history)', () => {
    expect(goBackTarget(undefined)).toBe('home')
    expect(goBackTarget(0)).toBe('home')
  })
})
