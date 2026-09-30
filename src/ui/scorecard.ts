import { frameMarks, frameScores } from '../../server/bowling.mjs'

/** One scorecard structure and renderer for the player, computer and results. */
export function scoreCardTemplate(): string {
  return `<div class="card"><div class="card-frames">${[0,1,2,3,4].map(f=>`<div class="cf" data-f="${f}"><span class="cf-n">${f+1}</span><div class="cf-rolls">${(f===4?[0,1,2]:[0,1]).map(k=>`<i data-r="${k}"></i>`).join('')}</div><b class="cf-t"></b></div>`).join('')}<div class="cf cf-total"><span class="cf-n" data-i18n="hud.total"></span><b class="cf-t" data-card="total">0</b></div></div></div>`
}
export function fillScoreCard(card: HTMLElement, rolls: number[], current: number, animate = false): void {
  const marks=frameMarks(rolls),totals=frameScores(rolls)??[]
  card.querySelectorAll<HTMLElement>('.cf[data-f]').forEach((el,f)=>{
    el.classList.toggle('is-current',f===current)
    el.querySelectorAll<HTMLElement>('i').forEach((box,k)=>{
      const v=marks[f]?.[k]??''
      if(box.textContent!==v){
        box.textContent=v;box.className=v==='X'?'x':v==='/'?'sp':''
        if(v&&animate)box.animate([{transform:'scale(1.25)'},{transform:'scale(1)'}],{duration:200})
      }
    })
    const total=totals[f]
    el.querySelector<HTMLElement>('.cf-t')!.textContent=total===null||total===undefined?'':String(total)
  })
  const total=totals.reduce<number>((value,n)=>n??value,0)
  card.querySelector<HTMLElement>('[data-card="total"]')!.textContent=String(total)
}
