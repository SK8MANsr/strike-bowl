import { DEFAULT_BALL, normalizeBallState, type BallId } from '../game/balls'

/**
 * Versioned local save. Everything the player keeps between sessions lives in one JSON record so
 * it is easy to migrate. Corrupt or foreign data falls back to defaults instead of crashing.
 */
export type Locale = 'en' | 'zh-CN' | 'pt-BR'
export type Quality = 'low' | 'medium' | 'high'

export type ScoreEntry = { name: string; score: number; seconds: number; at: number }

export type SaveData = {
  version: 1
  /** '' = never chosen; the game follows the browser language until the player picks one. */
  locale: Locale | ''
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  reducedMotion: boolean
  tutorialDone: boolean
  playerName: string
  /** The player typed a nickname themselves (otherwise an auto name is used for the board). */
  nameChosen: boolean
  leaderboard: ScoreEntry[]
  /** Personal best over all days, and best on `bestDay` (UTC). */
  best: number
  dayBest: number
  bestDay: string
  games: number
  strikes: number
  ballsUnlocked: BallId[]
  equippedBall: BallId
}

export const SAVE_KEY = 'strikebowl.save'
export const LEADERBOARD_SIZE = 10

export function defaultSave(): SaveData {
  return {
    version: 1,
    locale: '',
    musicVolume: 0.7,
    sfxVolume: 0.8,
    muted: false,
    sensitivity: 1,
    invertY: false,
    quality: 'high',
    reducedMotion: false,
    tutorialDone: false,
    playerName: '',
    nameChosen: false,
    leaderboard: [],
    best: 0,
    dayBest: 0,
    bestDay: '',
    games: 0,
    strikes: 0,
    ballsUnlocked: [DEFAULT_BALL],
    equippedBall: DEFAULT_BALL,
  }
}

const intIn = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo)
const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)

/** Parse untrusted stored JSON into a valid SaveData (pure; unit tested). */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch {
    return base
  }
  if (data.version !== 1) return base
  const board = Array.isArray(data.leaderboard) ? data.leaderboard : []
  return {
    version: 1,
    locale: data.locale === 'en' || data.locale === 'zh-CN' || data.locale === 'pt-BR' ? data.locale : '',
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    sensitivity: typeof data.sensitivity === 'number' && data.sensitivity >= 0.2 && data.sensitivity <= 3 ? data.sensitivity : base.sensitivity,
    invertY: data.invertY === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    tutorialDone: data.tutorialDone === true,
    playerName: typeof data.playerName === 'string' ? [...data.playerName.trim()].slice(0, 16).join('') : base.playerName,
    leaderboard: board
      .filter((e): e is ScoreEntry => !!e && typeof e === 'object' && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score))
      .map(e => ({ name: e.name.slice(0, 16), score: Math.max(0, Math.floor(e.score)), seconds: Number.isFinite(e.seconds) ? e.seconds : 0, at: Number.isFinite(e.at) ? e.at : 0 }))
      .slice(0, LEADERBOARD_SIZE),
    nameChosen: data.nameChosen === true,
    best: intIn(data.best, 0, 150),
    dayBest: intIn(data.dayBest, 0, 150),
    bestDay: typeof data.bestDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.bestDay) ? data.bestDay : '',
    games: intIn(data.games, 0, 1e7),
    strikes: intIn(data.strikes, 0, 1e8),
    ballsUnlocked: normalizeBallState(data.ballsUnlocked, data.equippedBall, Number.POSITIVE_INFINITY).unlocked,
    equippedBall: normalizeBallState(data.ballsUnlocked, data.equippedBall, Number.POSITIVE_INFINITY).equipped,
  }
}

/** Insert a run into a bounded, deterministically ordered leaderboard (higher score, then faster, then earlier). */
export function insertScore(board: ScoreEntry[], entry: ScoreEntry): { board: ScoreEntry[]; rank: number } {
  const next = [...board, entry].sort((a, b) => b.score - a.score || a.seconds - b.seconds || a.at - b.at).slice(0, LEADERBOARD_SIZE)
  return { board: next, rank: next.indexOf(entry) }
}

export class SaveStore {
  data: SaveData

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw)
  }

  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // Private browsing or quota: the game keeps working with in-memory settings.
    }
  }
}
