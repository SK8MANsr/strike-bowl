// End-to-end smoke test: build dist-test/ first (`npm run build:test`).
// Serves dist-test/, boots the game in headless Chromium, bowls one ball with a real mouse gesture,
// finishes the game through the debug hook, restarts with Space, checks English/Chinese and
// fails on any console error (leaderboard calls are stubbed: vite preview has no /api).
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { scoreGame } from '../server/bowling.mjs'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-test', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 420_000)
function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}
async function openGame(locale, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale })
  // No backend in vite preview: answer the leaderboard API as "unavailable" so the game runs offline.
  await ctx.route('**/api/leaderboards/v1/**', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }))
  const page = await ctx.newPage()
  page.on('console', m => m.type() === 'error' && !/503/.test(m.text()) && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60_000 })
  await page.waitForTimeout(800)
  return page
}
const phase = page => page.evaluate(() => window.__sb.game.phase)
async function waitPhase(page, p, ms = 30_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if ((await phase(page)) === p) return
    await page.waitForTimeout(100)
  }
  throw new Error(`phase ${p} not reached (now ${await phase(page)})`)
}
try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  browser = await chromium.launch({ args, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined }).catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []
  const page = await openGame('en-US', errors)
  if (!(await page.textContent('.logo-en'))?.includes('STRIKE')) throw new Error('title not rendered')
  await page.screenshot({ path: `${out}/smoke-title.png` })
  await page.keyboard.press('Space')
  await waitPhase(page, 'aim')
  // Real gesture: move stance, press, drag sideways, release.
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(250)
  await page.keyboard.up('KeyD')
  await page.mouse.move(640, 330)
  await page.mouse.down()
  await page.waitForTimeout(500)
  await page.mouse.move(700, 330, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/smoke-roll.png` })
  if ((await phase(page)) === 'aim' && (await page.evaluate(() => window.__sb.game.rolls.length)) === 0) throw new Error('mouse gesture did not throw')
  await page.evaluate(() => { window.__sb.game.fast = true })
  // Finish the game quickly through the debug hook.
  for (let n = 0; n < 12; n += 1) {
    await page.waitForFunction(() => ['aim', 'over'].includes(window.__sb.game.phase), null, { timeout: 60_000 })
    if ((await phase(page)) === 'over') break
    await page.evaluate(() => window.__sb.game.debugThrow({ x: 0.06, angle: 0, speed: 8.6, spin: 0 }))
    await page.waitForTimeout(300)
  }
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 30_000 })
  const rolls = await page.evaluate(() => window.__sb.game.rolls)
  const expected = scoreGame(rolls)
  await page.waitForFunction(score => document.querySelector('.res-score').textContent === String(score), expected)
  const total = await page.textContent('.res-score')
  if (!(rolls.length >= 6 && rolls.length <= 11)) throw new Error(`bad roll count ${rolls.length}`)
  if (!/^\d+$/.test(total?.trim() ?? '')) throw new Error(`bad total ${total}`)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/smoke-results.png` })
  await page.keyboard.press('Space')
  await waitPhase(page, 'aim')
  if ((await page.evaluate(() => window.__sb.game.rolls.length)) !== 0) throw new Error('restart did not reset the game')
  const zh = await openGame('zh-CN', errors)
  if (!(await zh.textContent('.logo-cn'))?.includes('好球保龄')) throw new Error('zh title missing')
  if (!(await zh.textContent('[data-act="play"]'))?.includes('开始')) throw new Error('zh copy missing')
  if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`)
  console.log(`smoke: OK — rolls ${rolls.join(',')} total ${total?.trim()}`)
  await browser.close()
  cleanup()
  process.exit(0)
} catch (e) {
  await fail(e instanceof Error ? e.message : String(e))
}
