import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const index = readFileSync('index.html', 'utf8')
const ui = readFileSync('src/ui/ui.ts', 'utf8')

describe('game accessibility contract', () => {
  it('does not disable browser zoom', () => {
    expect(index).not.toContain('user-scalable=no')
  })

  it('exposes a live gameplay status for non-visual feedback', () => {
    expect(ui).toContain('game-status')
    expect(ui).toContain('aria-live="polite"')
  })
})
