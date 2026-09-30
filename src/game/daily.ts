import { RAMP } from './config'
import { challengeForSeed, profileForSeed, type ChallengeSpec, type LaneProfile } from './challenges'

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** UTC calendar day, e.g. "2026-09-26". Everyone on the same UTC day plays the same lane. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type FrameConditions = {
  /** Distance from the foul line where the oil ends and the hook starts (m). */
  oil: number
  /** Constant sideways acceleration (m/s²); + pushes right. */
  drift: number
  /** Fraction of the predicted path the aim guide shows. */
  guide: number
  /** Multiplier on the ball's hook strength. */
  hookScale: number
}

export type DailyLane = {
  day: string
  seed: number
  frames: FrameConditions[]
  /** Neon palette index for today's alley lighting (cosmetic only). */
  palette: number
  profile: LaneProfile
  challenge: ChallengeSpec | null
}

/** Build today's lane conditions: identical for every player on the same UTC day. */
export function dailyLane(day = utcDay(), varied = true): DailyLane {
  const seed = hashString(`strike-bowl:${day}`)
  const rnd = mulberry32(seed)
  const profile = varied ? profileForSeed(seed) : profileForSeed(0)
  const frames: FrameConditions[] = RAMP.guide.map((guide, f) => {
    const oil = (RAMP.oilMin[f] + rnd() * RAMP.oilSpread[f]) * profile.oilMultiplier
    const sign = rnd() < 0.5 ? -1 : 1
    const drift = RAMP.drift[f] * sign * (0.75 + rnd() * 0.25) * profile.driftMultiplier
    const hookScale = (0.92 + rnd() * 0.16) * profile.hookMultiplier
    return { oil, drift: Math.round(drift * 1000) / 1000, guide, hookScale }
  })
  return { day, seed, frames, palette: Math.floor(rnd() * 4), profile, challenge: varied ? challengeForSeed(seed) : null }
}
