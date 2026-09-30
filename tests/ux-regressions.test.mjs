import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const hud = readFileSync('src/styles/hud.css', 'utf8')
const campaign = readFileSync('src/styles/campaign.css', 'utf8')

describe('mobile gameplay and campaign UX contracts', () => {
  it('does not render the daily challenge card over the active playfield HUD', () => {
    expect(hud).toMatch(/#ui\[data-active-screen=["']hud["']\]\s+\.hud-challenge[^}]*display\s*:\s*none\s*!important/)
  })

  it('makes campaign nodes tap-first and keeps the campaign scrollable above the safe area', () => {
    expect(campaign).toMatch(/\.road-node[^}]*touch-action\s*:\s*manipulation/)
    expect(campaign).toMatch(/\.screen\.campaign[^}]*padding-bottom\s*:\s*calc\([^}]*var\(--safe-b\)/)
  })
})
