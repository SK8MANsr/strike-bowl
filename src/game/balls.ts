export type BallId = 'classic' | 'precision' | 'power' | 'control' | 'hybrid'

export type BallBonuses = {
  precision: number
  power: number
  control: number
}

export type BallSpec = {
  id: BallId
  name: string
  color: string
  accent: string
  unlockStars: number
  description: string
  bonuses: BallBonuses
}

export const DEFAULT_BALL: BallId = 'classic'

export const BALLS: Record<BallId, BallSpec> = {
  classic: { id: 'classic', name: 'Classic', color: '#f4f1ff', accent: '#8a5cff', unlockStars: 0, description: 'Equilíbrio confiável para qualquer pista.', bonuses: { precision: 0, power: 0, control: 0 } },
  precision: { id: 'precision', name: 'Vector', color: '#40e9ff', accent: '#2468ff', unlockStars: 3, description: 'Mais precisão na mira e no guia de trajetória.', bonuses: { precision: 0.18, power: 0, control: 0.04 } },
  power: { id: 'power', name: 'Titan', color: '#ff6b45', accent: '#ffcf4a', unlockStars: 6, description: 'Mais força para atravessar a formação de pinos.', bonuses: { precision: -0.03, power: 0.1, control: 0 } },
  control: { id: 'control', name: 'Flux', color: '#60f2b0', accent: '#11a7a0', unlockStars: 12, description: 'Mais controle para aplicar efeito lateral.', bonuses: { precision: 0.04, power: 0, control: 0.22 } },
  hybrid: { id: 'hybrid', name: 'Apex', color: '#ff4fd8', accent: '#8a5cff', unlockStars: 20, description: 'A combinação premium de precisão, força e controle.', bonuses: { precision: 0.1, power: 0.06, control: 0.1 } },
}

export const BALL_ORDER = Object.keys(BALLS) as BallId[]

export function getUnlockedBalls(stars: number): BallId[] {
  const safeStars = Number.isFinite(stars) ? Math.max(0, stars) : 0
  return BALL_ORDER.filter(id => BALLS[id].unlockStars <= safeStars)
}

export function normalizeBallState(saved: unknown, equipped: unknown, stars: number): { unlocked: BallId[]; equipped: BallId } {
  const safeStars = Number.isFinite(stars) ? Math.max(0, stars) : 0
  const campaignUnlocked = getUnlockedBalls(stars)
  const savedUnlocked = Array.isArray(saved) ? saved.filter((id): id is BallId => typeof id === 'string' && id in BALLS && BALLS[id as BallId].unlockStars <= safeStars) : []
  const unlocked = BALL_ORDER.filter(id => campaignUnlocked.includes(id) || savedUnlocked.includes(id))
  const nextEquipped = typeof equipped === 'string' && unlocked.includes(equipped as BallId) ? equipped as BallId : DEFAULT_BALL
  return { unlocked, equipped: nextEquipped }
}
