/**
 * Client for the project's own leaderboard server (`/api/leaderboards/v1`). Guests only need a
 * nickname; the server issues an opaque token kept in localStorage. Every failure degrades to
 * offline play: the game never blocks on the network.
 */
export const BOARD_ID = 'strike5-v1'
const RULES_VERSION = 'v1'
const PROTOCOL_VERSION = 1

export type BoardEntry = { playerId: string; displayName: string; score: number; rank: number; isMe: boolean; achievedAt: string }
export type BoardPage = { period: 'today' | 'all'; players: number; entries: BoardEntry[]; myRank: { rank: number; score: number } | null }
export type Standing = { rank: number; players: number; beatPct: number }
export type SubmitResult = { accepted: true; improved: boolean; today: Standing | null; allTime: Standing | null } | { accepted: false; error: string }

type Identity = { playerId: string; token: string; displayName: string }

declare global {
  interface Window {
    __MANUS_GAME_HISTORY__?: { apiRoot?: string; readOnly?: boolean }
  }
}

const HISTORY_ROOT = 'https://game-history.invalid/api/leaderboards/v1'

export function apiRoot(loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  const injected = typeof window !== 'undefined' ? window.__MANUS_GAME_HISTORY__?.apiRoot : undefined
  if (injected === HISTORY_ROOT) return injected
  // Managed preview URLs may have an ingress prefix before /__manus__/game-preview/.
  const marker = '/__manus__/game-preview/'
  const at = loc.pathname.indexOf(marker)
  if (at >= 0) return `${loc.origin}${loc.pathname.slice(0, at)}/api/leaderboards/v1`
  return `${loc.origin}/api/leaderboards/v1`
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export class Leaderboard {
  readonly root = apiRoot()
  private readonly key = `strikebowl.lb:${this.root}`
  private identity: Identity | null = null
  /** Set once the server says this client is too old (426); ranked writes stop. */
  upgradeRequired = false
  online = true
  readonly readOnly = typeof window !== 'undefined' && window.__MANUS_GAME_HISTORY__?.readOnly === true

  constructor(readonly enabled = import.meta.env?.VITE_LEADERBOARD_ENABLED === 'true') {
    this.online = enabled
    try {
      const raw = localStorage.getItem(this.key)
      if (raw) {
        const v = JSON.parse(raw) as Identity
        if (v && typeof v.token === 'string' && typeof v.playerId === 'string') this.identity = v
      }
    } catch {
      this.identity = null
    }
  }

  get playerId(): string | null {
    return this.identity?.playerId ?? null
  }

  get displayName(): string | null {
    return this.identity?.displayName ?? null
  }

  private save(): void {
    try {
      if (this.identity) localStorage.setItem(this.key, JSON.stringify(this.identity))
      else localStorage.removeItem(this.key)
    } catch {
      // Storage blocked: identity lives for this session only.
    }
  }

  private async req<T>(method: string, path: string, body?: unknown, auth = false, timeoutMs = 7000): Promise<T> {
    if (!this.enabled) throw new HttpError(503, 'offline')
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth && this.identity) headers.Authorization = `Bearer ${this.identity.token}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${this.root}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, cache: 'no-store' })
      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }
      if (!res.ok) {
        const code = (data as { error?: string } | null)?.error ?? `http_${res.status}`
        if (res.status === 426) this.upgradeRequired = true
        throw new HttpError(res.status, code)
      }
      if (data === null || typeof data !== 'object') throw new HttpError(502, 'bad_response')
      this.online = true
      return data as T
    } catch (e) {
      if (!(e instanceof HttpError)) this.online = false
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  /** Make sure we hold a guest identity under `name`; renames if the name changed. */
  async ensureGuest(name: string): Promise<boolean> {
    if (!this.enabled) return false
    try {
      if (!this.identity) {
        const g = await this.req<Identity & { expiresInSeconds: number }>('POST', '/guests', { displayName: name })
        this.identity = { playerId: g.playerId, token: g.token, displayName: g.displayName }
        this.save()
        return true
      }
      if (this.identity.displayName !== name) return this.rename(name)
      return true
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        this.identity = null
        this.save()
      }
      return false
    }
  }

  async rename(name: string): Promise<boolean> {
    if (!this.identity) return this.ensureGuest(name)
    try {
      const r = await this.req<{ displayName: string }>('PATCH', '/guests/me', { displayName: name }, true)
      this.identity.displayName = r.displayName
      this.save()
      return true
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        this.identity = null
        this.save()
        return this.ensureGuest(name)
      }
      return false
    }
  }

  /** Register a new run with the server clock; returns the run id or null when offline. */
  async startRun(name: string, day = new Date().toISOString().slice(0, 10)): Promise<string | null> {
    if (this.upgradeRequired || this.readOnly) return null
    if (!(await this.ensureGuest(name))) return null
    try {
      const r = await this.authReq<{ runId: string }>('POST', `/boards/${BOARD_ID}/runs`, { protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION, day })
      return r.runId
    } catch {
      return null
    }
  }

  async submit(runId: string, score: number, durationMs: number, rolls: number[]): Promise<SubmitResult> {
    try {
      const r = await this.authReq<{ accepted: boolean; improved: boolean }>('PUT', `/runs/${runId}`, { score, durationMs: Math.round(durationMs), rolls }, 10000)
      if (!r.accepted) return { accepted: false, error: 'not_accepted' }
      const s = await this.standing(score)
      return { accepted: true, improved: r.improved, today: s?.today ?? null, allTime: s?.allTime ?? null }
    } catch (e) {
      return { accepted: false, error: e instanceof HttpError ? e.code : 'offline' }
    }
  }

  private async authReq<T>(method: string, path: string, body: unknown, timeoutMs = 7000): Promise<T> {
    try { return await this.req<T>(method, path, body, true, timeoutMs) }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401 || !this.identity) throw error
      const name = this.identity.displayName
      this.identity = null
      this.save()
      if (!(await this.ensureGuest(name))) throw error
      return this.req<T>(method, path, body, true, timeoutMs)
    }
  }

  async standing(score: number): Promise<{ today: Standing; allTime: Standing } | null> {
    try {
      return await this.req<{ today: Standing; allTime: Standing }>('GET', `/boards/${BOARD_ID}/standing?score=${score}`, undefined, true)
    } catch {
      return null
    }
  }

  async list(period: 'today' | 'all', limit = 20): Promise<BoardPage | null> {
    try {
      return await this.req<BoardPage>('GET', `/boards/${BOARD_ID}?period=${period}&limit=${limit}`, undefined, true)
    } catch {
      return null
    }
  }
}
