import { nextBall } from '../../server/bowling.mjs'
import { STAGES, unlockedStage, visibleBotRolls, type CampaignStore, type Opponent } from '../game/campaign'
import type { HudState } from '../game/game'
import type { I18n } from '../engine/i18n'
import { fillScoreCard, scoreCardTemplate } from './scorecard'

const words = {
  'pt-BR': { entry:'Campanha • Duelo contra bots', title:'A ROTA NEON', sub:'12 adversários. Uma vitória de cada vez.', rule:'Vença em 5 rodadas para desbloquear a próxima fase. Empates pedem revanche.', stage:'Fase', you:'Você', bot:'Computador', loading:'Preparando adversário…', win:'VITÓRIA!', lose:'REVANCHE?', tie:'EMPATE!', next:'Próxima fase', retry:'Tentar novamente', map:'Ver caminho', free:'Voltar ao início', complete:'CAMPEÃO DA ROTA!', cleared:'vitórias', locked:'Bloqueada', available:'Disputar', beaten:'Vencida', boss:'CHEFE', progress:'Progresso salvo neste navegador', note:'O bot joga com física real. A súmula dele é definida antes da sua partida e revelada a cada jogada.', fail:'Não foi possível preparar a partida. Tente novamente.', earned:'Estrelas conquistadas' },
  en: { entry:'Campaign • Bot duels', title:'THE NEON ROAD', sub:'12 rivals. One victory at a time.', rule:'Win a 5-frame match to unlock the next stage. Ties require a rematch.', stage:'Stage', you:'You', bot:'Computer', loading:'Preparing opponent…', win:'VICTORY!', lose:'REMATCH?', tie:'DRAW!', next:'Next stage', retry:'Try again', map:'View road', free:'Back to title', complete:'ROAD CHAMPION!', cleared:'victories', locked:'Locked', available:'Play match', beaten:'Defeated', boss:'BOSS', progress:'Progress saved in this browser', note:'The bot bowls with real physics. Its scorecard is fixed before your match and revealed throw by throw.', fail:'Could not prepare the match. Please try again.', earned:'Stars earned' },
  'zh-CN': { entry:'战役 • 电脑对决', title:'霓虹之路', sub:'12位对手，一场一场赢下去。', rule:'赢得五轮比赛才能解锁下一关。平局需要重赛。', stage:'关卡', you:'你', bot:'电脑', loading:'正在准备对手…', win:'胜利！', lose:'再战？', tie:'平局！', next:'下一关', retry:'再次挑战', map:'查看路线', free:'返回首页', complete:'路线冠军！', cleared:'胜利', locked:'未解锁', available:'开始对决', beaten:'已击败', boss:'首领', progress:'进度保存在此浏览器中', note:'电脑使用真实物理系统。比赛前确定记分表，每轮结束后显示。', fail:'无法准备比赛，请重试。', earned:'获得星星' },
} as const
export type Match = { stage: number; bot: Opponent; playerScore?: number }
export class CampaignView {
  match?: Match
  busy = false
  constructor(private i18n: I18n, private store: CampaignStore) {}
  t(k: keyof typeof words.en): string { return words[this.i18n.locale][k] }
  refresh(): void {
    document.querySelector('.campaign-entry')!.textContent = this.t('entry')
    this.renderMap()
    if(this.match?.playerScore !== undefined) this.result()
  }
  renderMap(error = ''): void {
    const p = this.store.data, unlocked = unlockedStage(p), wins=p.stars.filter(Boolean).length
    const positions = STAGES.map((_, i) => ({x:[15,50,85][Math.floor(i/3)%2 ? 2-i%3 : i%3], y:12+Math.floor(i/3)*24}))
    const path = positions.map((v,i)=>`${i?'L':'M'} ${v.x*6} ${v.y*7.6}`).join(' ')
    document.querySelector('.campaign-shell')!.innerHTML = `
      <header class="road-header"><span class="road-eyebrow">STRIKE BOWL / CAMPAIGN</span><h1>${this.t('title')}</h1><p>${this.t('sub')}</p>
      <div class="road-progress"><b>${wins}/12 ${this.t('cleared')}</b><span>${p.stars.reduce((a,b)=>a+b,0)}/36 ★</span></div><progress max="12" value="${wins}" aria-label="${this.t('title')}"></progress>
      <p class="road-rule">${this.t('rule')}</p></header>
      <div class="road-status" role="status">${error || (this.busy?this.t('loading'):wins===12?this.t('complete'):this.t('progress'))}</div>
      <div class="road-map"><svg viewBox="0 0 600 760" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" class="road-track"/><path d="${positions.slice(0,Math.min(12,wins+1)).map((v,i)=>`${i?'L':'M'} ${v.x*6} ${v.y*7.6}`).join(' ')}" class="road-cleared"/></svg>
      ${STAGES.map(([name,type],i)=>`<button class="road-node ${p.stars[i]?'won':i===unlocked?'current':'locked'} ${type==='boss'?'boss':''}" data-act="stage" data-stage="${i}" style="left:${positions[i].x}%;top:${positions[i].y}%" ${i>unlocked||this.busy?'disabled':''} aria-label="${this.t('stage')} ${i+1}, ${name}, ${i>unlocked?this.t('locked'):p.stars[i]?this.t('beaten'):this.t('available')}"><span class="node-orb">${i>unlocked?'◆':type==='boss'?'♛':i+1}</span><b>${name}</b><small>${type==='boss'?this.t('boss'):this.t('stage')+' '+(i+1)}</small><em>${p.stars[i]?'★'.repeat(p.stars[i])+'☆'.repeat(3-p.stars[i]):i>unlocked?'—':this.t('available')}</em></button>`).join('')}</div>
      <p class="road-note">${this.t('note')}</p><button class="btn" data-act="quit">${this.t('free')}</button>`
  }
  hud(h?: HudState): void {
    const el=document.querySelector<HTMLElement>('.duel-strip')!
    el.hidden=!this.match
    if(!this.match) return
    const m=this.match, rolls=visibleBotRolls(m.bot,h?.rolls??[])
    const next=nextBall(h?.rolls??[])
    const label=`${this.t('bot')} · ${STAGES[m.stage][0]}`
    if(!el.querySelector('.card')) el.innerHTML=`<div class="score-panel-label"><b class="bot-name"></b><span class="bot-stage"></span></div>${scoreCardTemplate()}`
    el.querySelector('.bot-name')!.textContent=label
    el.querySelector('.bot-stage')!.textContent=`${this.t('stage')} ${m.stage+1}`
    el.querySelector('[data-i18n="hud.total"]')!.textContent=this.i18n.t('hud.total')
    fillScoreCard(el.querySelector<HTMLElement>('.card')!,rolls,next?.done?-1:next?.frame??0)
  }

  result(): void {
    let el=document.querySelector<HTMLElement>('.campaign-result')
    if(!el){el=document.createElement('div');el.className='campaign-result';document.querySelector('.res-head')!.after(el)}
    const m=this.match
    el.hidden=!m || m.playerScore===undefined
    for(const selector of ['.btn-again','.res-rank','.res-hint','.res-target']) {
      const node=document.querySelector<HTMLElement>(selector)!
      if(m) node.hidden=true
      else if(selector==='.btn-again'||selector==='.res-rank'||selector==='.res-hint') node.hidden=false
    }
    if(!m||m.playerScore===undefined) return
    const won=m.playerScore>m.bot.score, tie=m.playerScore===m.bot.score
    const stars=this.store.data.stars[m.stage]
    el.classList.toggle('victory',won)
    el.innerHTML=`<h2>${won?(m.stage===11?this.t('complete'):this.t('win')):tie?this.t('tie'):this.t('lose')}</h2><p>${this.t('you')} <b>${m.playerScore}</b> <span>VS</span> <b>${m.bot.score}</b> ${STAGES[m.stage][0]}</p><div class="duel-final-card">${scoreCardTemplate()}</div>${won?`<div class="road-stars" aria-label="${this.t('earned')}: ${stars}">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>`:''}<div class="duel-actions">${won&&m.stage<11?`<button class="btn btn-primary" data-act="stage" data-stage="${m.stage+1}">${this.t('next')} →</button>`:`<button class="btn btn-primary" data-act="stage" data-stage="${m.stage}">${this.t('retry')}</button>`}<button class="btn" data-act="campaign">${this.t('map')}</button></div>`
    const card=el.querySelector<HTMLElement>('.duel-final-card .card')!
    card.querySelector('[data-i18n="hud.total"]')!.textContent=this.i18n.t('hud.total')
    fillScoreCard(card,m.bot.rolls,-1)
  }
}
