import { beforeAll, describe, expect, it } from 'vitest'
import { CampaignStore, campaignLane, emptyProgress, parseProgress, recordMatch, simulateOpponent, unlockedStage, visibleBotRolls, visibleBotScore } from '../src/game/campaign'
import { initPhysics } from '../src/engine/physics'
import { nextBall, scoreGame } from '../server/bowling.mjs'
beforeAll(initPhysics)
describe('campaign progression', () => {
  it.each([[20,30],[30,30]])('loss or tie (%s:%s) cannot unlock a stage', (player,bot) => {
    const p=recordMatch(emptyProgress(),0,player,bot)
    expect(unlockedStage(p)).toBe(0); expect(p.stars[0]).toBe(0)
  })
  it('unlocks exactly one stage on a win and retains previous stars on replay',()=>{
    const first=recordMatch(emptyProgress(),0,70,40)
    expect(first.stars[0]).toBe(3);expect(unlockedStage(first)).toBe(1)
    const replay=recordMatch(first,0,42,40)
    expect(replay.stars[0]).toBe(3);expect(replay.best[0]).toBe(70)
    const second=recordMatch(replay,1,45,40)
    expect(second.stars[1]).toBe(1);expect(unlockedStage(second)).toBe(2)
    expect(first.stars[1]).toBe(0)
  })
  it('rejects locked stages and malformed results',()=>{
    const p=emptyProgress()
    for(const n of [-1,1,12,NaN]) expect(recordMatch(p,n,150,0)).toBe(p)
    expect(recordMatch(p,0,151,0)).toBe(p)
    expect(recordMatch(p,0,30,NaN)).toBe(p)
  })
  it('finishes all twelve stages without overflow',()=>{
    let p=emptyProgress()
    for(let i=0;i<12;i++) p=recordMatch(p,i,80,60)
    expect(p.stars).toEqual(Array(12).fill(2)); expect(unlockedStage(p)).toBe(11)
  })
  it('sanitizes corrupted saves without skipping an unbeaten stage',()=>{
    expect(parseProgress('{bad')).toEqual(emptyProgress())
    const p=parseProgress(JSON.stringify({version:1,stars:[3,0,3],best:[200,-1],attempts:[5]}))
    expect(p.stars.slice(0,3)).toEqual([3,0,0]);expect(p.best.slice(0,2)).toEqual([150,0])
  })
  it('persists attempts and wins independently from existing game saves',()=>{
    const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)}}
    const a=new CampaignStore(storage);a.begin(0);a.finish(0,80,60)
    const b=new CampaignStore(storage);expect(b.data.attempts[0]).toBe(1);expect(unlockedStage(b.data)).toBe(1)
  })
  it('keeps playable progress when storage is unavailable',()=>{
    const store=new CampaignStore({getItem:()=>{throw Error()},setItem:()=>{throw Error()}})
    store.begin(0);store.finish(0,80,60);expect(unlockedStage(store.data)).toBe(1)
  })
})
describe('physics opponent',()=>{
  it('bowls a complete deterministic match and reveals only completed frames',async()=>{
    const lane=campaignLane(0),a=await simulateOpponent(0,1,lane),b=await simulateOpponent(0,1,lane)
    expect(a).toEqual(b);expect(nextBall(a.rolls)?.done).toBe(true);expect(scoreGame(a.rolls)).toBe(a.score)
    expect(a.byFrame).toHaveLength(5);expect(visibleBotScore(a,0)).toBe(0);expect(visibleBotScore(a,5)).toBe(a.score)
    expect(a.byFrame[0].length).toBeLessThan(a.rolls.length)
  })
  it('gives late opponents better accuracy across representative attempts',async()=>{
    const early:number[]=[],late:number[]=[]
    for(let seed=1;seed<=4;seed++) {
      early.push((await simulateOpponent(0,seed,campaignLane(0))).score)
      late.push((await simulateOpponent(11,seed,campaignLane(11))).score)
    }
    console.log('Bot calibration: rookie',early,'final boss',late)
    expect(late.reduce((a,b)=>a+b,0)).toBeGreaterThan(early.reduce((a,b)=>a+b,0)+40)
  }, 20000)
})

describe('bot scorecard reveal',()=>{
 const bot={rolls:[5,5,10,3,4,0,0,10,10,10],byFrame:[[5,5],[5,5,10],[5,5,10,3,4],[5,5,10,3,4,0,0],[5,5,10,3,4,0,0,10,10,10]],score:0}
 it('reveals individual throws without future frame bonuses',()=>{
  expect(visibleBotRolls(bot,[])).toEqual([])
  expect(visibleBotRolls(bot,[6])).toEqual([5])
  expect(visibleBotRolls(bot,[6,2])).toEqual([5,5])
  expect(visibleBotRolls(bot,[6,2,10])).toEqual([5,5,10])
 })
 it('reveals final bonus throws and complete match',()=>{
  expect(visibleBotRolls(bot,[0,0,0,0,0,0,0,0,10])).toEqual(bot.rolls.slice(0,8))
  expect(visibleBotRolls(bot,[0,0,0,0,0,0,0,0,10,10])).toEqual(bot.rolls.slice(0,9))
  expect(visibleBotRolls(bot,[0,0,0,0,0,0,0,0,10,10,10])).toEqual(bot.rolls)
 })
})
