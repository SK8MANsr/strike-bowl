import { describe, expect, it } from 'vitest'
import { BALLS, DEFAULT_BALL, getUnlockedBalls, normalizeBallState, type BallId } from '../src/game/balls'

describe('reward balls', () => {
  it('starts with the classic ball and unlocks rewards by campaign stars', () => {
    expect(getUnlockedBalls(0)).toEqual([DEFAULT_BALL])
    expect(getUnlockedBalls(3)).toContain('precision')
    expect(getUnlockedBalls(6)).toContain('power')
    expect(getUnlockedBalls(12)).toContain('control')
    expect(getUnlockedBalls(20)).toHaveLength(Object.keys(BALLS).length)
  })

  it('normalizes invalid saved state and keeps the equipped ball unlocked', () => {
    expect(normalizeBallState(['precision', 'unknown' as BallId], 'unknown' as BallId, 0)).toEqual({ unlocked: [DEFAULT_BALL], equipped: DEFAULT_BALL })
    expect(normalizeBallState(['precision'], 'precision', 3)).toEqual({ unlocked: [DEFAULT_BALL, 'precision'], equipped: 'precision' })
    expect(normalizeBallState([], 'unknown' as BallId, 6).equipped).toBe(DEFAULT_BALL)
  })

  it('exposes readable bonus values for each reward', () => {
    expect(BALLS.precision.bonuses.precision).toBeGreaterThan(0)
    expect(BALLS.power.bonuses.power).toBeGreaterThan(0)
    expect(BALLS.control.bonuses.control).toBeGreaterThan(0)
  })
})
