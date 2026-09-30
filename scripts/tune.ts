// Headless tuning: throws many balls through the real Rapier lane and reports pinfall.
// Run: npx tsx scripts/tune.ts [mode]
import { initPhysics } from '../src/engine/physics'
import { BALL } from '../src/game/config'
import { BowlingSim, type ThrowParams } from '../src/game/sim'
import type { FrameConditions } from '../src/game/daily'

await initPhysics()
const sim = new BowlingSim()
const cond: FrameConditions = { oil: 11.7, drift: 0, guide: 1, hookScale: 1 }

function roll(p: ThrowParams, c = cond): { down: number; strike: boolean; t: number; standing: string; impact: number; gutter: boolean } {
  sim.rack(true)
  const before = sim.standing()
  sim.release(p, c)
  let steps = 0
  while (!sim.step(1 / 60) && steps < 60 * 12) steps += 1
  const now = sim.standing()
  const down = sim.countDown(before)
  sim.holdBall(0)
  return { down, strike: down === 10, t: sim.t, standing: now.map((s, i) => (s ? i + 1 : '')).filter(Boolean).join(','), impact: sim.impactAt, gutter: sim.gutterAt >= 0 }
}

const mode = process.argv[2] ?? 'grid'
if (mode === 'one') {
  const [x, a, s, sp] = process.argv.slice(3).map(Number)
  console.log(roll({ x, angle: a, speed: s, spin: sp }))
} else if (mode === 'straight') {
  // Straight balls at different target offsets at the head pin.
  for (const target of [-0.15, -0.1, -0.06, -0.03, 0, 0.03, 0.06, 0.1, 0.15]) {
    let strikes = 0
    let total = 0
    const res: number[] = []
    for (const speed of [7, 8.5, 9.8]) {
      for (const jitter of [-0.01, 0, 0.01]) {
        const r = roll({ x: target + jitter, angle: 0, speed, spin: 0 })
        strikes += r.strike ? 1 : 0
        total += r.down
        res.push(r.down)
      }
    }
    console.log(`straight target ${target.toFixed(2)}: strikes ${strikes}/9 avg ${(total / 9).toFixed(1)} [${res.join(' ')}]`)
  }
} else if (mode === 'hook') {
  // Hook balls: start right, aim slightly left, spin left into the 1-3 pocket etc.
  const rows: string[] = []
  for (const spin of [-1, -0.6, 0.6, 1]) {
    for (const x of [-0.35, -0.2, 0, 0.2, 0.35]) {
      for (const angle of [-0.03, -0.015, 0, 0.015, 0.03]) {
        const r = roll({ x, angle, speed: 8.6, spin })
        rows.push(`spin ${spin} x ${x} a ${angle}: ${r.down}${r.strike ? ' X' : ''} left[${r.standing}]`)
      }
    }
  }
  console.log(rows.join('\n'))
} else if (mode === 'pocket') {
  // Solve the aim so the ball arrives at a target x at the head pin, for several spins.
  const { predictPath } = await import('../src/game/sim')
  const { LANE } = await import('../src/game/config')
  const arrive = (p: ThrowParams) => {
    const pts = predictPath(p, cond)
    const hit = pts.find(v => -v.z >= LANE.headPin) ?? pts[pts.length - 1]
    return hit.x
  }
  const solve = (x: number, spin: number, speed: number, target: number) => {
    let lo = -0.08
    let hi = 0.08
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2
      if (arrive({ x, angle: mid, speed, spin }) < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const speed = Number(process.argv[3] ?? 8.6)
  for (const spin of [0, 0.5, 1, -0.5, -1]) {
    const x = spin > 0 ? -0.3 : spin < 0 ? 0.3 : 0.06
    const line: string[] = []
    let strikes = 0
    for (let target = -0.16; target <= 0.161; target += 0.02) {
      const angle = solve(x, spin, speed, target)
      const r = roll({ x, angle, speed, spin })
      strikes += r.strike ? 1 : 0
      line.push(`${target.toFixed(2)}:${r.down}${r.strike ? 'X' : ''}`)
    }
    console.log(`spin ${spin} strikes ${strikes}/17  ${line.join(' ')}`)
  }
} else if (mode === 'random') {
  // Random "casual player" throws: stance near centre, small aim error, random power/spin.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  let strikes = 0
  let total = 0
  let gutters = 0
  const n = Number(process.argv[3] ?? 200)
  for (let i = 0; i < n; i += 1) {
    const r = roll({ x: (rnd() - 0.5) * 0.3, angle: (rnd() - 0.5) * 0.03, speed: BALL.minSpeed + rnd() * (BALL.maxSpeed - BALL.minSpeed), spin: (rnd() - 0.5) * 0.6 })
    strikes += r.strike ? 1 : 0
    total += r.down
    gutters += r.gutter ? 1 : 0
  }
  console.log(`random casual: strike ${(strikes / n * 100).toFixed(1)}% avg ${(total / n).toFixed(2)} gutters ${gutters}`)
}
sim.dispose()
