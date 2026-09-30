import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
const port = 4927, url = `http://127.0.0.1:${port}/`, out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-test', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' })
let browser
const checks = [], errors = []
const guard = setTimeout(() => { server.kill(); process.exit(1) }, 180000)
async function phase(page, expected) {
  await page.waitForFunction(p => window.__sb.game.phase === p, expected, { timeout: 20000 })
}
try {
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(url)).ok) break } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  for (const [name, width, height] of [['phone-portrait',430,932], ['phone-landscape',932,430], ['small-phone',375,667]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(url)
    await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60000 })
    if (!(await page.locator('[data-act="play"]').textContent()).includes('Jogar')) throw new Error('Portuguese missing')
    await page.screenshot({ path: `${out}/${name}-title.png` })
    const box = await page.locator('[data-act="play"]').boundingBox()
    if (!box || box.x < 0 || box.x + box.width > width + 1 || box.y < 0 || box.y + box.height > height + 1) throw new Error(`${name}: play control clipped`)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await phase(page, 'aim')
    await page.screenshot({ path: `${out}/${name}-game.png` })
    const cdp = await ctx.newCDPSession(page)
    const x = width / 2, y = height * 0.5
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await phase(page, 'charge')
    await page.waitForTimeout(150)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await phase(page, 'aim')
    if (await page.evaluate(() => window.__sb.game.rolls.length !== 0)) throw new Error('Cancelled touch scored')
    checks.push(`${name}: Portuguese, visible controls, cancelled touch returns to aim`)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await phase(page, 'charge')
    await page.waitForTimeout(400)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await phase(page, 'roll')
    checks.push(`${name}: real touchscreen hold/release launches`)
    await page.evaluate(() => { const s = window.__sb; s.game.pinLift = 0.5; s.game.start(); if(s.game.pinLift !== 0 || s.input.moveAxis() !== 0) throw new Error('Restart residue') })
    await phase(page, 'aim')
    await page.locator('.pause-btn').tap()
    await page.waitForSelector('[data-screen="pause"].is-active')
    await page.locator('[data-act="resume"]').tap()
    await phase(page, 'aim')
    checks.push(`${name}: restart clears pin lift; pause/resume works`)
    await page.evaluate(() => {
      const s = window.__sb
      s.ui.over({ score: 0, rolls: Array(10).fill(0), durationMs: 22000, strikes: 0, spares: 0, newBest: false, beatTarget: false })
      s.game.start(); s.ui.show('hud')
    })
    await page.waitForTimeout(1300)
    if (await page.evaluate(() => window.__sb.ui.screen !== 'hud')) throw new Error('Stale results timer interrupted restart')
    checks.push(`${name}: pending results cannot interrupt a new game`)
    await ctx.close()
  }
  const desktop = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 720 } })
  const page = await desktop.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60000 })
  await page.keyboard.press('Space'); await phase(page, 'aim')
  await page.keyboard.down('Space'); await phase(page, 'charge')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.keyboard.up('Space'); await page.keyboard.press('Escape'); await phase(page, 'aim')
  checks.push('keyboard: Escape pauses once and resuming cancels a charged throw')
  await page.evaluate(() => {
    window.__padA = true
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, axes: [0,0,0,0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 && window.__padA, value: i === 0 && window.__padA ? 1 : 0 })) }] })
  })
  await phase(page, 'charge'); await page.waitForTimeout(300)
  await page.evaluate(() => { window.__padA = false }); await phase(page, 'roll')
  checks.push('gamepad: simulated A-button hold/release drives a real physics throw')
  await desktop.close()
  if (errors.length) throw new Error(errors.join('\n'))
  writeFileSync(`${out}/acceptance.json`, JSON.stringify({ checks, errors }, null, 2))
  console.log('acceptance: OK\n' + checks.join('\n'))
} finally {
  clearTimeout(guard)
  await browser?.close()
  server.kill()
}
