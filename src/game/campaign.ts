import { frameScores, nextBall, scoreGame } from '../../server/bowling.mjs'
import { dailyLane, hashString, mulberry32, type DailyLane } from './daily'

export const CAMPAIGN_KEY = 'strikebowl.campaign.v1'
export const STAGES = [
  ['Pixel', 'rookie'], ['Byte', 'rookie'], ['Flux', 'rookie'], ['Nova', 'boss'],
  ['Vega', 'pro'], ['Orbit', 'pro'], ['Prisma', 'pro'], ['Titan', 'boss'],
  ['Comet', 'elite'], ['Pulse', 'elite'], ['Spectra', 'elite'], ['Neon King', 'boss'],
] as const
export type Progress = { version: 1; stars: number[]; best: number[]; attempts: number[] }
export const emptyProgress = (): Progress => ({ version: 1, stars: Array(12).fill(0), best: Array(12).fill(0), attempts: Array(12).fill(0) })
export function parseProgress(raw: string | null): Progress {
  const p = emptyProgress()
  try {
    const d = JSON.parse(raw ?? 'null')
    if (d?.version !== 1) return p
    for (const key of ['stars', 'best', 'attempts'] as const) {
      p[key] = p[key].map((_, i) => Number.isInteger(d[key]?.[i]) ? Math.max(0, Math.min(key === 'stars' ? 3 : key === 'best' ? 150 : 1e6, d[key][i])) : 0)
    }
    // A corrupted record cannot skip an unbeaten stage.
    let gap = false
    p.stars = p.stars.map(n => { if (!n) gap = true; return gap ? 0 : n })
  } catch { /* Keep a playable default. */ }
  return p
}
export const unlockedStage = (p: Progress): number => { const n = p.stars.findIndex(s => s === 0); return n < 0 ? 11 : n }
export function recordMatch(p: Progress, stage: number, player: number, bot: number): Progress {
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length || stage > unlockedStage(p) || ![player, bot].every(n => Number.isInteger(n) && n >= 0 && n <= 150)) return p
  const result: Progress = { ...p, stars: [...p.stars], best: [...p.best], attempts: [...p.attempts] }
  result.best[stage] = Math.max(result.best[stage], player)
  if (player > bot) result.stars[stage] = Math.max(result.stars[stage], player - bot >= 25 ? 3 : player - bot >= 10 ? 2 : 1)
  return result
}
export class CampaignStore {
  data: Progress
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw = null
    try { raw = storage?.getItem(CAMPAIGN_KEY) ?? null } catch { /* In-memory fallback. */ }
    this.data = parseProgress(raw)
  }
  persist(): void { try { this.storage?.setItem(CAMPAIGN_KEY, JSON.stringify(this.data)) } catch { /* In-memory fallback. */ } }
  begin(stage: number): number { this.data.attempts[stage]++; this.persist(); return this.data.attempts[stage] }
  finish(stage: number, player: number, bot: number): void { this.data = recordMatch(this.data, stage, player, bot); this.persist() }
}
export function campaignLane(stage: number): DailyLane {
  const lane = dailyLane(`campaign-${stage + 1}`, false)
  lane.frames = lane.frames.map((f, i) => ({ ...f, guide: Math.max(.3, 1 - stage * .04 - i * .07), drift: f.drift * (.4 + stage * .055) }))
  return lane
}
export type Opponent = { rolls: number[]; byFrame: number[][]; score: number }
/** The computer bowls a real Rapier match before the player starts; it cannot react to their score. */
export async function simulateOpponent(stage: number, attempt: number, lane: DailyLane, progress?: (f: number) => void): Promise<Opponent> {
  const { BowlingSim } = await import('./sim')
  const sim = new BowlingSim(), rolls: number[] = [], byFrame: number[][] = []
  const rnd = mulberry32(hashString(`campaign-bot-v1:${stage}:${attempt}`))
  try {
    for (let n = 0; n < 12; n++) {
      const next = nextBall(rolls)!
      if (next.done) break
      sim.holdBall(0); sim.rack(next.fresh)
      const before = sim.standing(), speed = 7.4 + stage * .16 + rnd() * .5
      const positions = sim.pins.filter(p => p.active).map(p => p.body.translation().x)
      const aim = next.fresh ? .065 : positions.reduce((a, b) => a + b, 0) / positions.length
      const error = (.045 * Math.pow(.84, stage)) * (rnd() * 2 - 1)
      const cond = lane.frames[next.frame]
      const angle = aim / 18.29 - cond.drift * 18.29 / (2 * speed * speed) + error
      sim.release({ x: 0, angle, speed, spin: 0 }, cond)
      let finished = false
      for (let i = 0; i < 720; i++) if (sim.step(1 / 60)) { finished = true; break }
      if (!finished) throw new Error('Opponent failed to settle')
      rolls.push(sim.countDown(before)); sim.finishRoll()
      const after = nextBall(rolls)!
      if (after.done || after.frame > next.frame) byFrame[next.frame] = [...rolls]
      progress?.((next.frame + 1) / 5)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    const score = scoreGame(rolls)
    if (score === null || !nextBall(rolls)?.done || byFrame.length !== 5) throw new Error('Invalid opponent match')
    return { rolls, byFrame, score }
  } finally { sim.dispose() }
}
export function visibleBotScore(bot: Opponent, completedFrames: number): number {
  const totals = frameScores(bot.byFrame[Math.min(4, completedFrames - 1)] ?? []) ?? []
  return totals.reduce<number>((total, n) => n ?? total, 0)
}

/** Reveal the opponent's matching throw, keeping future rolls and bonus results concealed. */
export function visibleBotRolls(bot: Opponent, playerRolls: number[]): number[] {
  const next = nextBall(playerRolls)
  if (!next) return []
  if (next.done) return [...bot.rolls]
  const prior = bot.byFrame[next.frame - 1] ?? []
  const current = bot.byFrame[next.frame] ?? prior
  return current.slice(0, prior.length + next.ball)
}
