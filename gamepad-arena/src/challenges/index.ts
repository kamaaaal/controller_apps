/**
 * Challenge registry
 */

import { ButtonBlitzChallenge } from './button-blitz/ButtonBlitzChallenge'
import { DualOrbitChallenge } from './dual-orbit/DualOrbitChallenge'
import { PatternLockChallenge } from './pattern-lock/PatternLockChallenge'
import { BalanceBeamChallenge } from './balance-beam/BalanceBeamChallenge'
import { EchoDriftChallenge } from './echo-drift/EchoDriftChallenge'
import { TwinTargetChallenge } from './twin-target/TwinTargetChallenge'
import { MirrorProtocolChallenge } from './mirror-protocol/MirrorProtocolChallenge'
import { MapRecallChallenge } from './map-recall/MapRecallChallenge'
import { ThreadTheNeedleChallenge } from './thread-the-needle/ThreadTheNeedleChallenge'
import { GravityJockeyChallenge } from './gravity-jockey/GravityJockeyChallenge'
import { PixiDemoChallenge } from './pixi-demo/PixiDemoChallenge'
import type { Challenge } from '../types'

/**
 * The production lineup plus (in dev only) the PixiJS showcase challenge —
 * a testable seam so the demo is verifiable yet tree-shaken from prod builds.
 *
 * The order is the library display order: it walks the player from the
 * simplest skill test to the hardest coordination puzzles.
 */
export function buildChallenges(isDev: boolean): Challenge[] {
  const list: Challenge[] = [
    new ButtonBlitzChallenge(),
    new DualOrbitChallenge(),
    new PatternLockChallenge(),
    new BalanceBeamChallenge(),
    new EchoDriftChallenge(),
    new TwinTargetChallenge(),
    new MirrorProtocolChallenge(),
    new MapRecallChallenge(),
    new ThreadTheNeedleChallenge(),
    new GravityJockeyChallenge(),
  ]
  if (isDev) list.push(new PixiDemoChallenge())
  return list
}

export const challenges: Challenge[] = buildChallenges(import.meta.env.DEV)

export function getChallenge(id: string): Challenge | undefined {
  return challenges.find((c) => c.id === id)
}

export {
  ButtonBlitzChallenge,
  DualOrbitChallenge,
  PatternLockChallenge,
  BalanceBeamChallenge,
  EchoDriftChallenge,
  TwinTargetChallenge,
  MirrorProtocolChallenge,
  MapRecallChallenge,
  ThreadTheNeedleChallenge,
  GravityJockeyChallenge,
  PixiDemoChallenge,
}
