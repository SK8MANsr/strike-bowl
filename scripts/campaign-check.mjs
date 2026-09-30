import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const port=4932,url=`http://127.0.0.1:${port}/`
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--outDir','dist-test','--port',String(port),'--strictPort','--host','127.0.0.1'],{stdio:'ignore'})
let browser
const checks=[],errors=[]
const guard=setTimeout(()=>{server.kill();process.exit(1)},240000)
const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m)}
try {
 for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break}catch{}await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 const context=await browser.newContext({viewport:{width:430,height:932},locale:'pt-BR',hasTouch:true,isMobile:true})
 const page=await context.newPage()
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto(url);await page.waitForSelector('[data-screen="title"].is-active')
 await page.evaluate(()=>window.__sb.save.update({dayBest:47,bestDay:window.__sb.ui.day}))
 await page.locator('[data-act="campaign"]').click();await page.waitForSelector('[data-screen="campaign"].is-active')
 assert(await page.locator('.road-node').count()===12,'12-stage map renders')
 assert(await page.locator('.road-node:disabled').count()===11,'Only first stage is unlocked for a new player')
 await page.screenshot({path:'shots/campaign-map-portrait.png',fullPage:true})
 await page.locator('[data-stage="0"]').click();await page.waitForSelector('#ui[data-phase="aim"]',{timeout:30000})
 assert(await page.evaluate(()=>window.__sb.campaign.match.bot.rolls.length>=6),'Computer has a full physics scorecard before player releases')
 assert((await page.locator('.duel-strip .cf-rolls').allTextContents()).every(v=>v===''),'Future computer frames remain concealed')
 await page.keyboard.down('Space');await page.waitForTimeout(350);await page.keyboard.up('Space');await page.waitForSelector('#ui[data-phase="roll"]')
 await page.screenshot({path:'shots/campaign-duel.png'})
 // Valid complete scorecards as integration fixtures: the physics opponent itself is covered by unit tests.
 const settle=async(score,rolls,botZero=false)=>{
  await page.evaluate(({score,rolls,botZero})=>{
   const sb=window.__sb;sb.game.toTitle()
   if(botZero)sb.campaign.match.bot={rolls:Array(10).fill(0),byFrame:Array.from({length:5},(_,i)=>Array((i+1)*2).fill(0)),score:0}
   sb.ui.over({score,rolls,durationMs:60000,strikes:score===150?7:0,spares:0,newBest:false,beatTarget:false})
  },{score,rolls,botZero})
  await page.waitForSelector('[data-screen="results"].is-active');await page.waitForSelector('.campaign-result:not([hidden])')
 }
 await settle(0,Array(10).fill(0))
 assert(await page.evaluate(()=>window.__sb.campaignStore.data.stars[0]===0),'Defeat keeps next stage locked')
 await page.locator('.campaign-result [data-stage="0"]').click();await page.waitForSelector('#ui[data-phase="aim"]',{timeout:30000})
 await settle(0,Array(10).fill(0),true)
 assert(await page.textContent('.campaign-result h2')==='EMPATE!','Tie offers a rematch and does not advance')
 assert(await page.evaluate(()=>window.__sb.campaignStore.data.stars[0]===0),'Tie keeps next stage locked')
 await page.locator('.campaign-result [data-stage="0"]').click();await page.waitForSelector('#ui[data-phase="aim"]',{timeout:30000})
 await settle(150,Array(7).fill(10),true)
 assert(await page.evaluate(()=>window.__sb.campaignStore.data.stars[0]===3),'Victory awards stars and saves progress')
 assert(await page.evaluate(()=>window.__sb.save.data.dayBest===47),'Campaign preserves the existing daily record')
 await page.waitForFunction(()=>document.querySelector('.res-score').textContent==='150')
 assert(await page.locator('.btn-again').isHidden(),'Campaign result offers the correct next-stage action')
 await page.screenshot({path:'shots/campaign-victory.png'})
 await page.locator('.campaign-result [data-stage="1"]').click();await page.waitForSelector('#ui[data-phase="aim"]',{timeout:30000})
 assert(await page.evaluate(()=>window.__sb.campaign.match.stage===1),'Next-stage button starts the next opponent')
 await page.reload();await page.waitForSelector('[data-screen="title"].is-active')
 await page.locator('[data-act="campaign"]').click()
 assert(await page.locator('.road-node.won').count()===1,'Victory persists after reload')
 assert(await page.locator('.road-node:disabled').count()===10,'Saved victory unlocks exactly one additional stage')
 await page.setViewportSize({width:932,height:430});await page.screenshot({path:'shots/campaign-map-landscape.png'})
 await page.locator('.campaign-shell [data-act="quit"]').click();await page.waitForSelector('[data-screen="title"].is-active')
 await page.keyboard.press('Space');await page.waitForSelector('#ui[data-phase="aim"]')
 assert(await page.locator('.duel-strip').isHidden(),'Free-play mode remains independent from campaign')
 assert(await page.evaluate(()=>window.__sb.save.data.best===150),'Existing personal records are preserved')
 if(errors.length)throw Error(errors.join('\n'))
 writeFileSync('shots/campaign-acceptance.json',JSON.stringify({checks,errors,note:'Outcome fixtures test integration; bots use real physics in unit tests.'},null,2))
 console.log('CAMPAIGN PASS\n'+checks.join('\n'))
}finally{clearTimeout(guard);await browser?.close();server.kill()}
