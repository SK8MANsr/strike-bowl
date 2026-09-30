import { beforeAll, describe, expect, it } from 'vitest'
import { initPhysics } from '../src/engine/physics'
import { BowlingSim } from '../src/game/sim'
import { dailyLane } from '../src/game/daily'
import { nextBall, scoreGame } from '../server/bowling.mjs'

beforeAll(async () => { await initPhysics() })
function finish(sim: BowlingSim) {
  for (let n = 0; n < 720; n++) if (sim.step(1 / 60)) return
  throw new Error('Ball failed to settle')
}
describe('Rapier gameplay regressions', () => {
  it('keeps an untouched rack upright for ten seconds', () => {
    const sim = new BowlingSim()
    try {
      for (let n = 0; n < 600; n++) sim.step(1 / 60)
      expect(sim.standing()).toEqual(Array(10).fill(true))
    } finally { sim.dispose() }
  })
  it('does not topple pins before a slow ball reaches the deck', () => {
    const sim = new BowlingSim()
    try {
      sim.release({ x: 0, angle: 0, speed: 5.6, spin: 0 }, { oil: 11.7, drift: 0, guide: 1, hookScale: 1 })
      for (let n = 0; n < 120; n++) sim.step(1 / 60)
      expect(sim.impactAt).toBe(-1)
      expect(sim.standing()).toEqual(Array(10).fill(true))
    } finally { sim.dispose() }
  })
  it.each([-1, 1])('gutter %s cannot score or disturb the rack', direction => {
    const sim = new BowlingSim()
    try {
      const before = sim.standing()
      sim.release({ x: 0, angle: direction * 0.07, speed: 9.8, spin: direction }, dailyLane('2026-09-29').frames[0])
      finish(sim)
      expect(sim.gutterAt).toBeGreaterThanOrEqual(0)
      expect(sim.countDown(before)).toBe(0)
      expect(sim.standing()).toEqual(before)
    } finally { sim.dispose() }
  })
  it('preserves ball-pin contact events across four substeps', () => {
    const sim = new BowlingSim()
    try {
      sim.release({ x: 0.06, angle: 0, speed: 8.6, spin: 0 }, { oil: 11.7, drift: 0, guide: 1, hookScale: 1 })
      let ballHits = 0
      for (let n = 0; n < 720; n++) {
        const done = sim.step(1 / 60)
        ballHits += sim.hits.filter(h => h.kind === 'ballPin').length
        sim.hits.length = 0
        if (done) break
      }
      expect(ballHits).toBeGreaterThan(0)
      expect(sim.impactAt).toBeGreaterThan(0)
    } finally { sim.dispose() }
  })
  it('completes a real five-frame game with rack counts consistent with the rules', () => {
    const sim = new BowlingSim(), lane = dailyLane('2026-09-29'), rolls: number[] = []
    try {
      for (let n = 0; n < 12; n++) {
        const next = nextBall(rolls)!
        if (next.done) break
        sim.holdBall(0); sim.rack(next.fresh)
        const before = sim.standing()
        expect(before.filter(Boolean).length).toBe(next.standing)
        sim.release({ x: 0.06, angle: 0, speed: 8.6, spin: 0 }, lane.frames[next.frame])
        finish(sim); rolls.push(sim.countDown(before)); sim.finishRoll()
        const counted = sim.standing()
        for (let i = 0; i < 120; i++) sim.step(1 / 60)
        expect(sim.standing()).toEqual(counted)
      }
      expect(nextBall(rolls)?.done).toBe(true)
      expect(scoreGame(rolls)).not.toBeNull()
    } finally { sim.dispose() }
  })
})
