import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--outDir','dist-test','--port','4940','--host','127.0.0.1'],{stdio:'ignore'})
let browser;const checks=[]
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4940')).ok)break}catch{}await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:'/tmp/strike-chromium/chromium',args:['--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 const context=await browser.newContext({locale:'pt-BR',hasTouch:true,isMobile:true});const page=await context.newPage()
 await page.goto('http://127.0.0.1:4940');await page.waitForSelector('[data-screen="title"].is-active')
 for(const [width,height] of [[375,667],[430,744],[430,932],[844,390],[932,430],[1440,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150)
  const credit=await page.locator('.creator-credit').boundingBox()
  if(!credit||credit.y<0||credit.x<0||credit.y+credit.height>height)throw Error('Credit clipped '+width)
  await page.screenshot({path:`shots/title-${width}x${height}.png`})
 }
 if(await page.textContent('.creator-credit')!=='Criado por Sergio Ribeiro Jr. 2026')throw Error('Credit differs')
 await page.locator('[data-act="lang"]').click();await page.waitForSelector('[data-screen="settings"].is-active')
 if(await page.textContent('[data-setting="locale"] [data-v="pt-BR"]')!=='Português (Brasil)')throw Error('Locale label')
 await page.evaluate(()=>window.__sb.ui.toTitle?.())
 await page.keyboard.press('Escape');await page.waitForSelector('[data-screen="title"].is-active')
 await page.locator('[data-act="campaign"]').click();await page.locator('[data-stage="0"]').click();await page.waitForSelector('#ui[data-phase="aim"]',{timeout:30000})
 for(const [width,height] of [[375,667],[430,744],[430,932],[844,390],[932,430],[1440,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150)
  const report=await page.evaluate(()=>{
   const sels=['.hud-toolbar','.hud-top','.duel-strip','.hud-details','.hud-bottom'];const boxes=sels.map(s=>({s,r:document.querySelector(s).getBoundingClientRect().toJSON()}));const errors=[]
   for(const {s,r} of boxes)if(r.x<0||r.y<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5)errors.push('clipped '+s)
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i].r,b=boxes[j].r;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)errors.push('overlap '+boxes[i].s+' '+boxes[j].s)}
   return errors
  });if(report.length)throw Error(`${width}x${height}: ${report.join(', ')}`)
  await page.screenshot({path:`shots/duel-${width}x${height}.png`});checks.push(`${width}x${height}: HUD regions fit without overlap; creator credit fits title`)
 }
 await page.evaluate(()=>{const sb=window.__sb;sb.campaign.match.bot={rolls:[5,5,10,3,4,0,0,10,10,10],byFrame:[[5,5],[5,5,10],[5,5,10,3,4],[5,5,10,3,4,0,0],[5,5,10,3,4,0,0,10,10,10]],score:74};sb.campaign.hud({rolls:[6]})})
 if((await page.locator('.duel-strip .cf-rolls').allTextContents()).join('')!=='5')throw Error('First bot throw not shown')
 await page.evaluate(()=>window.__sb.campaign.hud({rolls:[6,2,10]}))
 if((await page.locator('.duel-strip .cf-rolls').allTextContents()).join('')!=='5/X')throw Error('Spare/strike reveal incorrect')
 checks.push('Bot individual throws, spare, strike and hidden future frames render correctly')
 writeFileSync('shots/layout-acceptance.json',JSON.stringify({checks},null,2));console.log('LAYOUT PASS\n'+checks.join('\n'))
}finally{await browser?.close();server.kill()}
