import { describe, it, expect } from 'vitest'
import { formatSecondsRemaining } from './timerFormat'

describe('formatSecondsRemaining', () => {
  it('formats whole seconds with one decimal', () => {
    expect(formatSecondsRemaining(10)).toBe('10.0s')
    expect(formatSecondsRemaining(3)).toBe('3.0s')
  })

  it('formats fractional seconds', () => {
    expect(formatSecondsRemaining(9.44)).toBe('9.4s')
    expect(formatSecondsRemaining(0.55)).toBe('0.6s')
  })

  it('rounds a just-under-full timer up to the full second', () => {
    expect(formatSecondsRemaining(9.96)).toBe('10.0s')
  })

  it('reads exactly zero at the end of the run', () => {
    expect(formatSecondsRemaining(0)).toBe('0.0s')
    expect(formatSecondsRemaining(0.04)).toBe('0.0s')
  })

  it('never goes negative (loop clamps, but stay defensive)', () => {
    expect(formatSecondsRemaining(-0.5)).toBe('0.0s')
  })
})
