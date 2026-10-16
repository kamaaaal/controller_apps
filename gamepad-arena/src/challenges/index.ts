/**
 * Challenge registry
 */

import { ButtonBlitzChallenge } from './button-blitz/ButtonBlitzChallenge'
import { DualOrbitChallenge } from './dual-orbit/DualOrbitChallenge'
import { TwinTargetChallenge } from './twin-target/TwinTargetChallenge'
import { ThreadTheNeedleChallenge } from './thread-the-needle/ThreadTheNeedleChallenge'
import { GravityJockeyChallenge } from './gravity-jockey/GravityJockeyChallenge'
import { EchoDriftChallenge } from './echo-drift/EchoDriftChallenge'
import { PixiDemoChallenge } from './pixi-demo/PixiDemoChallenge'
import type { Challenge } from '../types'

/**
 * The production lineup plus (in dev only) the PixiJS showcase challenge —
 * a testable seam so the demo is verifiable yet tree-shaken from prod builds.
 */
export function buildChallenges(isDev: boolean): Challenge[] {
  const list: Challenge[] = [
    new ButtonBlitzChallenge(),
    new DualOrbitChallenge(),
    new TwinTargetChallenge(),
    new ThreadTheNeedleChallenge(),
    new GravityJockeyChallenge(),
    new EchoDriftChallenge(),
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
  TwinTargetChallenge,
  ThreadTheNeedleChallenge,
  GravityJockeyChallenge,
  EchoDriftChallenge,
  PixiDemoChallenge,
}
