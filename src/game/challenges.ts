export type ChallengeId = 'precision' | 'clean' | 'power' | 'comeback'

export type ChallengeSpec = {
  id: ChallengeId
  nameKey: string
  descriptionKey: string
}

export type ChallengeResult = {
  id: ChallengeId
  success: boolean
}

export type ResultSummary = {
  score: number
  strikes: number
  spares: number
  rolls: number[]
}

export type LaneProfile = {
  id: 'classic' | 'slick' | 'crosswind' | 'hook'
  nameKey: string
  descriptionKey: string
  oilMultiplier: number
  driftMultiplier: number
  hookMultiplier: number
}

export const DAILY_CHALLENGES: readonly ChallengeSpec[] = [
  { id: 'precision', nameKey: 'challenge.precision.name', descriptionKey: 'challenge.precision.description' },
  { id: 'clean', nameKey: 'challenge.clean.name', descriptionKey: 'challenge.clean.description' },
  { id: 'power', nameKey: 'challenge.power.name', descriptionKey: 'challenge.power.description' },
  { id: 'comeback', nameKey: 'challenge.comeback.name', descriptionKey: 'challenge.comeback.description' },
]

export const LANE_PROFILES: readonly LaneProfile[] = [
  { id: 'classic', nameKey: 'lane.classic.name', descriptionKey: 'lane.classic.description', oilMultiplier: 1, driftMultiplier: 1, hookMultiplier: 1 },
  { id: 'slick', nameKey: 'lane.slick.name', descriptionKey: 'lane.slick.description', oilMultiplier: 1.18, driftMultiplier: 0.82, hookMultiplier: 0.82 },
  { id: 'crosswind', nameKey: 'lane.crosswind.name', descriptionKey: 'lane.crosswind.description', oilMultiplier: 0.9, driftMultiplier: 1.45, hookMultiplier: 1.05 },
  { id: 'hook', nameKey: 'lane.hook.name', descriptionKey: 'lane.hook.description', oilMultiplier: 0.78, driftMultiplier: 0.9, hookMultiplier: 1.32 },
]

export function profileForSeed(seed: number): LaneProfile {
  const index = Math.abs(Math.floor(seed)) % LANE_PROFILES.length
  return LANE_PROFILES[index]
}

export function challengeForSeed(seed: number): ChallengeSpec {
  const index = Math.abs(Math.floor(seed / LANE_PROFILES.length)) % DAILY_CHALLENGES.length
  return DAILY_CHALLENGES[index]
}

export function evaluateChallenge(challenge: ChallengeSpec, result: ResultSummary): boolean {
  switch (challenge.id) {
    case 'precision':
      return result.score >= 90
    case 'clean':
      return result.rolls.length > 0 && result.rolls.every(roll => roll > 0)
    case 'power':
      return result.strikes >= 2
    case 'comeback':
      return result.spares >= 3 || result.strikes >= 1 && result.score >= 80
  }
}
