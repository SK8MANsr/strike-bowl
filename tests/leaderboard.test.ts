import { afterEach, describe, expect, it, vi } from 'vitest'
import { Leaderboard } from '../src/net/leaderboard'
afterEach(() => vi.unstubAllGlobals())
function prepare() {
  vi.stubGlobal('location', { origin: 'http://localhost', pathname: '/' })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ playerId: 'old', token: 'a'.repeat(43), displayName: 'Tester' }), setItem: vi.fn(), removeItem: vi.fn() })
}
describe('leaderboard regressions', () => {
  it('keeps unknown standing unknown after an accepted submission', async () => {
    prepare()
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => new Response(JSON.stringify(opts.method === 'PUT' ? { accepted: true, improved: true } : { error: 'offline' }), { status: opts.method === 'PUT' ? 200 : 503 })))
    expect(await new Leaderboard(true).submit('run', 150, 60000, Array(7).fill(10))).toEqual({ accepted: true, improved: true, today: null, allTime: null })
  })
  it('renews an expired session and retries starting a run once', async () => {
    prepare()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":"guest_session_expired"}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ playerId: 'new', token: 'b'.repeat(43), displayName: 'Tester' })))
      .mockResolvedValueOnce(new Response('{"runId":"new-run"}'))
    vi.stubGlobal('fetch', fetcher)
    const board = new Leaderboard(true)
    expect(await board.startRun('Tester')).toBe('new-run')
    expect(board.playerId).toBe('new'); expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('does not contact an API when optional ranking is disabled', async () => {
    prepare(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await new Leaderboard(false).startRun('Tester')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
