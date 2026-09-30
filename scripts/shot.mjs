// Visual QA helper: node scripts/shot.mjs [url] — plays through the game with the debug hook and
// writes screenshots to shots/. Collects console errors and prints them at the end.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:3000/'
const out = process.env.SHOTS_DIR ?? 'shots'
const mode = process.env.MODE ?? 'basic'
const vw = Number(process.env.VW ?? 1280)
const vh = Number(process.env.VH ?? 720)
mkdirSync(out, { recursive: true })
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, locale: process.env.LOCALE ?? 'zh-CN', hasTouch: process.env.TOUCH === '1', isMobile: process.env.TOUCH === '1' })
const page = await ctx.newPage()
const errors = []
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text())
  if (process.env.LOG) console.log('console:', m.type(), m.text())
})
page.on('pageerror', e => errors.push(String(e)))
await page.goto(url)
await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60_000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/01-title.png` })
const sb = fn => page.evaluate(fn)
const phase = () => sb(() => window.__sb.game.phase)
async function waitPhase(p, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if ((await phase()) === p) return true
    await page.waitForTimeout(100)
  }
  return false
}
await page.keyboard.press('Space')
await waitPhase('aim')
await page.waitForTimeout(700)
await page.mouse.move(vw / 2 + 20, vh * 0.45)
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/02-aim.png` })
if (mode === 'basic') {
  // Real mouse gesture: press, drag sideways for hook, release.
  await page.mouse.down()
  await page.waitForTimeout(350)
  await page.mouse.move(vw / 2 + 60, vh * 0.45, { steps: 5 })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/03-charge.png` })
  await page.waitForTimeout(250)
  await page.mouse.up()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/04-follow.png` })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/05-impact.png` })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/06-impact2.png` })
  await waitPhase('show')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/07-show.png` })
  console.log('after ball 1', await sb(() => ({ rolls: window.__sb.game.rolls, last: window.__sb.game.lastThrow })))
}
if (mode === 'full') {
  // Bowl a whole game through the debug hook with near-pocket throws.
  let n = 0
  for (;;) {
    const p = await phase()
    if (p === 'over') break
    if (p === 'aim') {
      await sb(() => window.__sb.game.debugThrow({ x: 0.28, angle: -0.028 + (Math.random() - 0.5) * 0.01, speed: 8.6, spin: -0.55 }))
      n += 1
      if (n === 1) {
        await page.waitForTimeout(2200)
        await page.screenshot({ path: `${out}/f-impact.png` })
      }
    }
    await page.waitForTimeout(150)
    if (n > 20) break
  }
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 20000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${out}/08-results.png` })
  console.log('game', await sb(() => ({ rolls: window.__sb.game.rolls, rank: document.querySelector('.res-rank')?.textContent })))
  if (process.env.SHARE) {
    await page.click('[data-act="share"]')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/09-share.png` })
    await page.click('.modal-share [data-act="back"]')
  }
  await page.keyboard.press('Space')
  await page.waitForTimeout(800)
  console.log('restart phase', await phase())
}
console.log('errors:', JSON.stringify(errors, null, 1))
await browser.close()
