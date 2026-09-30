import { describe, expect, it } from 'vitest'
import { frameMarks, frameScores, isComplete, maxPossible, nextBall, scoreGame, splitFrames, rollKind } from '../server/bowling.mjs'
import { cleanDisplayName, validateSubmission } from '../server/validate.mjs'
import { dailyLane } from '../src/game/daily'

describe('5-frame bowling scoring', () => {
  it('calls zero followed by ten a spare, including final-frame bonuses', () => {
    expect(rollKind(nextBall([])!, 10)).toBe('strike')
    expect(rollKind(nextBall([0])!, 10)).toBe('spare')
    expect(rollKind(nextBall([0, 0, 0, 0, 0, 0, 0, 0, 10, 0])!, 10)).toBe('spare')
  })
  it('scores a perfect game as 150 with 7 balls', () => {
    const perfect = [10, 10, 10, 10, 10, 10, 10]
    expect(isComplete(perfect)).toBe(true)
    expect(scoreGame(perfect)).toBe(150)
    expect(frameScores(perfect)).toEqual([30, 60, 90, 120, 150])
    expect(frameMarks(perfect)[4]).toEqual(['X', 'X', 'X'])
  })
  it('scores open frames, spares and strikes with real bonuses', () => {
    // 9-  7/  X  X  8/6
    const rolls = [9, 0, 7, 3, 10, 10, 8, 2, 6]
    expect(frameScores(rolls)).toEqual([9, 29, 57, 77, 93])
    expect(scoreGame(rolls)).toBe(93)
    expect(frameMarks(rolls)).toEqual([['9', '-'], ['7', '/'], ['', 'X'], ['', 'X'], ['8', '/', '6']])
  })
  it('leaves pending frames unscored until their bonus balls are thrown', () => {
    expect(frameScores([10])).toEqual([null, null, null, null, null])
    expect(frameScores([10, 3])).toEqual([null, null, null, null, null])
    expect(frameScores([10, 3, 4])).toEqual([17, 24, null, null, null])
    expect(frameScores([5, 5])?.[0]).toBeNull()
  })
  it('gives the final frame bonus balls only after a strike or spare', () => {
    expect(isComplete([0, 0, 0, 0, 0, 0, 0, 0, 3, 4])).toBe(true)
    expect(isComplete([0, 0, 0, 0, 0, 0, 0, 0, 3, 7])).toBe(false)
    expect(isComplete([0, 0, 0, 0, 0, 0, 0, 0, 3, 7, 5])).toBe(true)
    expect(isComplete([0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 10])).toBe(true)
    expect(scoreGame([0, 0, 0, 0, 0, 0, 0, 0, 10, 7, 3])).toBe(20)
  })
  it('rejects impossible pin counts', () => {
    expect(splitFrames([7, 5])).toBeNull()
    expect(splitFrames([11])).toBeNull()
    expect(splitFrames([0, 0, 0, 0, 0, 0, 0, 0, 10, 7, 5])).toBeNull()
  })
  it('knows which ball comes next and whether the rack is fresh', () => {
    expect(nextBall([])).toMatchObject({ frame: 0, ball: 0, fresh: true, standing: 10 })
    expect(nextBall([7])).toMatchObject({ frame: 0, ball: 1, fresh: false, standing: 3 })
    expect(nextBall([10])).toMatchObject({ frame: 1, ball: 0, fresh: true })
    expect(nextBall([0, 0, 0, 0, 0, 0, 0, 0, 10])).toMatchObject({ frame: 4, ball: 1, fresh: true, standing: 10 })
    expect(nextBall([0, 0, 0, 0, 0, 0, 0, 0, 10, 4])).toMatchObject({ frame: 4, ball: 2, fresh: false, standing: 6 })
    expect(nextBall([0, 0, 0, 0, 0, 0, 0, 0, 6, 4])).toMatchObject({ frame: 4, ball: 2, fresh: true })
    expect(nextBall([0, 0, 0, 0, 0, 0, 0, 0, 3, 4])?.done).toBe(true)
  })
  it('tracks the maximum still reachable', () => {
    expect(maxPossible([])).toBe(150)
    expect(maxPossible([9, 0])).toBe(129)
    expect(maxPossible([10, 10, 10, 10, 10, 10, 10])).toBe(150)
  })
})

describe('server submission validation', () => {
  const rolls = [9, 0, 7, 3, 10, 10, 8, 2, 6]
  it('accepts an honest game', () => {
    expect(validateSubmission({ score: 93, durationMs: 60000, rolls })).toMatchObject({ ok: true, score: 93 })
  })
  it('rejects a score that does not match the rolls', () => {
    expect(validateSubmission({ score: 150, durationMs: 60000, rolls })).toMatchObject({ ok: false, code: 'score_mismatch' })
  })
  it('rejects out-of-range scores, unfinished games and impossible speed', () => {
    expect(validateSubmission({ score: 151, durationMs: 60000, rolls })).toMatchObject({ ok: false, code: 'invalid_score' })
    expect(validateSubmission({ score: 9, durationMs: 60000, rolls: [9, 0] })).toMatchObject({ ok: false })
    expect(validateSubmission({ score: 93, durationMs: 3000, rolls })).toMatchObject({ ok: false, code: 'run_too_fast' })
    expect(validateSubmission({ score: 12, durationMs: 60000, rolls: [7, 5, 0, 0, 0, 0, 0, 0, 0, 0] })).toMatchObject({ ok: false })
  })
  it('cleans display names', () => {
    expect(cleanDisplayName('  球友 \u0007 1234  ')).toBe('球友 1234')
    expect(cleanDisplayName('')).toBeNull()
    expect(cleanDisplayName('x'.repeat(17))).toBeNull()
  })
})

describe('daily challenge', () => {
  it('is identical for the same UTC day and ramps up difficulty', () => {
    const a = dailyLane('2026-09-26')
    expect(dailyLane('2026-09-26')).toEqual(a)
    expect(dailyLane('2026-09-27')).not.toEqual(a)
    expect(Math.abs(a.frames[0].drift)).toBe(0)
    expect(Math.abs(a.frames[4].drift)).toBeGreaterThan(Math.abs(a.frames[1].drift))
    expect(a.frames[4].guide).toBeLessThan(a.frames[0].guide)
  })
})
