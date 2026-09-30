import { describe, expect, it } from 'vitest'
import { DAILY_CHALLENGES, LANE_PROFILES, evaluateChallenge, profileForSeed } from '../src/game/challenges'
import { dailyLane } from '../src/game/daily'

describe('daily challenges and lane profiles', () => {
  it('selects a deterministic profile from a seed', () => {
    expect(profileForSeed(0)).toBe(LANE_PROFILES[0])
    expect(profileForSeed(5)).toBe(LANE_PROFILES[1])
    expect(profileForSeed(9)).toBe(LANE_PROFILES[1])
  })

  it('evaluates a precision challenge from the real result summary', () => {
    const challenge = DAILY_CHALLENGES.find(item => item.id === 'precision')!
    expect(evaluateChallenge(challenge, { score: 90, strikes: 0, spares: 2, rolls: [9, 1] })).toBe(true)
    expect(evaluateChallenge(challenge, { score: 89, strikes: 3, spares: 0, rolls: [10, 10] })).toBe(false)
  })

  it('evaluates clean play without treating zero scoring rolls as gutters', () => {
    const challenge = DAILY_CHALLENGES.find(item => item.id === 'clean')!
    expect(evaluateChallenge(challenge, { score: 70, strikes: 0, spares: 3, rolls: [0, 5, 5] })).toBe(false)
    expect(evaluateChallenge(challenge, { score: 70, strikes: 0, spares: 3, rolls: [1, 5, 4] })).toBe(true)
  })

  it('keeps the daily profile and challenge deterministic while campaign lanes stay classic', () => {
    const daily = dailyLane('2026-09-30')
    expect(daily.profile.id).toBe(profileForSeed(daily.seed).id)
    expect(daily.challenge?.id).toBe(DAILY_CHALLENGES[Math.floor(daily.seed / LANE_PROFILES.length) % DAILY_CHALLENGES.length].id)
    expect(dailyLane('2026-09-30')).toEqual(daily)
    expect(dailyLane('campaign-1', false).profile.id).toBe('classic')
    expect(dailyLane('campaign-1', false).challenge).toBeNull()
  })
})
