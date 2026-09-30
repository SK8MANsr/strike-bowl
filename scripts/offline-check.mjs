import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const port = 4928, url = `http://127.0.0.1:${port}/`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => { server.kill(); process.exit(1) }, 120000)
try {
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(url)).ok) break } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors = []
  const failed = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('requestfailed', req => failed.push(`${req.url()} ${req.failure()?.errorText}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60000 })
  if (await page.evaluate(() => '__sb' in window)) throw new Error('Production exposes test hooks')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForSelector('[data-screen="title"].is-active')
  await context.setOffline(true)
  await page.reload()
  try { await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60000 }) }
  catch (error) {
    console.error({ errors, failed, body: await page.locator('body').innerText(), caches: await page.evaluate(() => caches.keys()) })
    throw error
  }
  await page.keyboard.press('Space')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.screenshot({ path: 'shots/offline-production.png' })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('offline: OK — production boots and starts a game without network; test hooks absent')
} finally {
  clearTimeout(guard)
  await browser?.close()
  server.kill()
}
