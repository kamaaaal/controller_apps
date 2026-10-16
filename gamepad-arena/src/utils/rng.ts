/**
 * Tiny seeded PRNG (mulberry32) — iteration 16.
 *
 * Lets course/sequence generators be deterministic under test and lays the
 * groundwork for replay seeds. Not cryptographically strong; not intended to be.
 */

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random float in [min, max). */
export function rngRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Random integer in [min, max] inclusive. */
export function rngInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rngRange(rng, min, max + 1))
}

/** Random element from a non-empty array. */
export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}
