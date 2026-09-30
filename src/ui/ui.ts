import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import type { Locale, Quality, SaveData, SaveStore } from '../engine/save'
import { fillScoreCard, scoreCardTemplate } from './scorecard'
import type { GameUI, HudState, Phase, Summary } from '../game/game'
import type { BoardPage, Leaderboard, SubmitResult } from '../net/leaderboard'
import { challengeLink, drawShareCard } from './share'
import { BALLS, BALL_ORDER, type BallId } from '../game/balls'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'board' | 'results' | 'share' | 'campaign'

export type UiActions = {
  play(): void
  resume(): void
  restart(): void
  quit(): void
  settings(patch: Partial<SaveData>): void
  pause(): void
  campaign(): void
  stage(n: number): void
  ball(id: BallId): void
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const ICON = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v3h3v2a5 5 0 0 1-5 5 6 6 0 0 1-3 2.6V18h3v3H8v-3h3v-2.4A6 6 0 0 1 8 13a5 5 0 0 1-5-5V6h3Zm-1 5a3 3 0 0 0 1.5 2.6A8 8 0 0 1 6 8Zm14 0h-1a8 8 0 0 1-.5 2.6A3 3 0 0 0 19 8Z" fill="currentColor"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2 2.5 3-.8.8 3 2.7 1.5-1.1 2.8 1.1 2.8-2.7 1.5-.8 3-3-.8L12 22l-2-2.5-3 .8-.8-3-2.7-1.5L4.6 13 3.5 10.2 6.2 8.7l.8-3 3 .8Zm0 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="currentColor"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a15 15 0 0 0-1.3-3.9A8 8 0 0 1 18.9 8ZM12 4c.9 1.2 1.6 2.5 2 4h-4c.4-1.5 1.1-2.8 2-4ZM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4Zm.8 2h3a15 15 0 0 0 1.3 3.9A8 8 0 0 1 5.1 16ZM8 8H5.1a8 8 0 0 1 4.3-3.9A15 15 0 0 0 8 8Zm4 12c-.9-1.2-1.6-2.5-2-4h4c-.4 1.5-1.1 2.8-2 4Zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4Zm.3 5.9A15 15 0 0 0 16 16h3a8 8 0 0 1-4.4 3.9ZM16.3 14a16 16 0 0 0 0-4h3.4a8 8 0 0 1 0 4Z" fill="currentColor"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0ZM7 17a3 3 0 0 1 0-4.2l2.1-2.1-1.4-1.4-2.1 2.1a5 5 0 0 0 7.1 7.1l2.1-2.1-1.4-1.4-2.1 2.1A3 3 0 0 1 7 17Zm12.4-11.4a5 5 0 0 0-7.1 0l-2.1 2.1 1.4 1.4 2.1-2.1a3 3 0 0 1 4.2 4.2l-2.1 2.1 1.4 1.4 2.1-2.1a5 5 0 0 0 0-7Z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 48" aria-hidden="true"><path d="M12 2c3 0 3.6 3.4 2.6 7-.6 2.2 1.4 4.8 2.8 9 2 6-1 22-2.4 26H9C7.6 40 4.6 24 6.6 18c1.4-4.2 3.4-6.8 2.8-9C8.4 5.4 9 2 12 2Z" fill="#fff7e8" stroke="#120828" stroke-width="2.2"/><path d="M9.6 10.5h4.8M9.4 13h5.2" stroke="#e8203f" stroke-width="1.8"/></svg>',
}

type Tone = 'gold' | 'cyan' | 'pink' | 'white'

/**
 * DOM game UI layered over the canvas: every screen is keyboard-, gamepad- and touch-navigable,
 * text comes from i18n keys and re-renders on language change.
 */
export class Ui implements GameUI {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private hudCache = new Map<string, string>()
  private phaseNow: Phase = 'title'
  private lastHud?: HudState
  private boardPeriod: 'today' | 'all' = 'today'
  private summary?: Summary
  private submit?: SubmitResult | 'pending'
  private shareCanvas?: HTMLCanvasElement
  private bannerTimer = 0
  private navCooldown = 0
  private toastTimer = 0
  private overTimer = 0
  private scoreAnimation = 0
  day = ''
  challenge: { score: number; name: string } | null = null
  onNameChange?: (name: string) => void
  onHud?: (h: HudState) => void
  onResults?: () => void
  onTranslate?: () => void

  constructor(
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly board: Leaderboard,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    this.root.addEventListener('focusin', e => {
      if ((e.target as HTMLElement).matches('.btn, .seg button, .toggle')) this.audio.play('ui')
    })
    window.addEventListener('keydown', e => this.onKey(e))
    i18n.onChange(() => this.translate())
    this.bindTouch()
    this.translate()
    this.refreshSettings()
  }

  t(key: string, vars?: Record<string, string | number>): string {
    return this.i18n.t(key, vars)
  }

  // ─── template ───────────────────────────────────────────────────────────
  private template(): string {
    const card = scoreCardTemplate()
    return `
<section class="screen boot" data-screen="boot">
  <div class="boot-logo outlined">好球保龄<small>STRIKE BOWL</small></div>
  <div class="boot-bar"><i></i></div>
  <p data-i18n="boot.loading"></p>
</section>
<section class="screen title" data-screen="title">
  <div class="title-main">
    <p class="creator-credit">Criado por Sergio Ribeiro Jr. 2026</p>
    <h1 class="logo"><span class="logo-pins">${ICON.pin}${ICON.pin}${ICON.pin}</span><span class="logo-cn outlined" data-i18n="title.logo"></span><span class="logo-en outlined">STRIKE BOWL</span></h1>
    <p class="tagline" data-i18n="title.tagline"></p>
    <div class="challenge-chip" hidden></div>
    <button class="btn btn-primary btn-play" data-act="play"><span data-i18n="title.play"></span><kbd>Space</kbd></button>
    <button class="btn campaign-entry" data-act="campaign"></button>
    <div class="how">
      <div class="how-step"><b>1</b><span data-i18n="how.move"></span><em data-how="move"></em></div>
      <div class="how-step"><b>2</b><span data-i18n="how.aim"></span><em data-how="aim"></em></div>
      <div class="how-step"><b>3</b><span data-i18n="how.hold"></span><em data-how="hold"></em></div>
      <div class="how-step"><b>4</b><span data-i18n="how.spin"></span><em data-how="spin"></em></div>
    </div>
    <div class="title-row">
      <button class="btn btn-small" data-act="board">${ICON.trophy}<span data-i18n="btn.board"></span></button>
      <button class="btn btn-small" data-act="settings">${ICON.gear}<span data-i18n="btn.settings"></span></button>
      <button class="btn btn-small" data-act="lang">${ICON.globe}<span data-i18n="btn.lang"></span></button>
    </div>
  </div>
  <aside class="title-side">
    <div class="title-meta"><span class="daily"></span><span class="pb"></span></div>
    <div class="mini-board"><h3 data-i18n="title.top"></h3><ol></ol></div>
  </aside>
</section>
<section class="screen campaign" data-screen="campaign"><div class="campaign-shell"></div></section>
<section class="screen hud" data-screen="hud">
  <div class="hud-panel">
    <div class="hud-toolbar">
      <div class="hud-left"><div class="hud-frame"></div><div class="hud-ball"></div></div>
      <button class="btn btn-icon pause-btn" data-act="pause" data-i18n-aria="a11y.pause">${ICON.pause}</button>
    </div>
    <div class="hud-scoreboards">
      <div class="hud-top score-panel"><div class="score-panel-label" data-i18n="hud.player"></div>${card}</div>
      <div class="duel-strip score-panel" hidden></div>
    </div>
    <div class="hud-details">
      <div class="hud-cond"></div>
      <div class="hud-right">
        <div class="hud-stat"><span data-i18n="hud.best"></span><b data-hud="best">0</b></div>
        <div class="hud-stat hud-target" hidden><span data-i18n="hud.target"></span><b data-hud="target">0</b></div>
        <div class="hud-stat"><span data-i18n="hud.max"></span><b data-hud="max">150</b></div>
      </div>
    </div>
    <aside class="ball-rack" aria-live="polite"></aside>
  </div>
  <div class="hud-combo outlined" hidden></div>
  <div class="banner" aria-live="polite"><b class="banner-big outlined"></b><span class="banner-sub"></span></div>
  <div class="popups"></div>
  <div class="hud-bottom">
  <div class="meter" hidden>
    <div class="meter-row"><span data-i18n="meter.power"></span><div class="meter-bar"><i class="meter-sweet"></i><i class="meter-fill"></i></div></div>
    <div class="meter-row"><span data-i18n="meter.hook"></span><div class="spin-bar"><i class="spin-mid"></i><i class="spin-fill"></i></div><em class="spin-label"></em></div>
  </div>
  <div class="hint"></div>
  <div class="touch">
    <button class="touch-btn" data-move="-1" data-i18n-aria="a11y.left">◀</button>
    <button class="touch-btn" data-move="1" data-i18n-aria="a11y.right">▶</button>
    <button class="touch-throw" data-i18n-aria="a11y.throw"><span data-i18n="btn.throw"></span></button>
  </div>
  </div>
</section>
<section class="screen modal-screen pause" data-screen="pause">
  <div class="modal">
    <h2 class="modal-title" data-i18n="pause.title"></h2>
    <button class="btn btn-primary" data-act="resume" data-i18n="btn.resume"></button>
    <button class="btn" data-act="restart" data-i18n="btn.restart"></button>
    <button class="btn" data-act="settings" data-i18n="btn.settings"></button>
    <button class="btn" data-act="quit" data-i18n="btn.quit"></button>
  </div>
</section>
<section class="screen modal-screen settings" data-screen="settings">
  <div class="modal">
    <h2 class="modal-title" data-i18n="settings.title"></h2>
    <div class="field"><span data-i18n="settings.language"></span><div class="seg" data-setting="locale"><button data-v="pt-BR">Português (Brasil)</button><button data-v="en">English</button><button data-v="zh-CN">中文</button></div></div>
    <div class="field"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality"><button data-v="low" data-i18n="settings.low"></button><button data-v="medium" data-i18n="settings.medium"></button><button data-v="high" data-i18n="settings.high"></button></div></div>
    <label class="field"><span data-i18n="settings.music"></span><input type="range" min="0" max="1" step="0.05" data-setting="musicVolume"></label>
    <label class="field"><span data-i18n="settings.sfx"></span><input type="range" min="0" max="1" step="0.05" data-setting="sfxVolume"></label>
    <div class="field"><span data-i18n="settings.mute"></span><button class="toggle" data-setting="muted"></button></div>
    <div class="field"><span data-i18n="settings.motion"></span><button class="toggle" data-setting="reducedMotion"></button></div>
    <button class="btn btn-primary" data-act="back" data-i18n="btn.back"></button>
  </div>
</section>
<section class="screen modal-screen board" data-screen="board">
  <div class="modal modal-wide">
    <h2 class="modal-title" data-i18n="board.title"></h2>
    <div class="seg tabs"><button data-period="today" data-i18n="board.today"></button><button data-period="all" data-i18n="board.all"></button></div>
    <div class="board-meta"></div>
    <ol class="board-list"></ol>
    <button class="btn btn-primary" data-act="back" data-i18n="btn.close"></button>
  </div>
</section>
<section class="screen results" data-screen="results">
  <div class="results-panel">
    <div class="res-head">
      <span class="res-label" data-i18n="results.title"></span>
      <b class="res-score outlined">0</b>
      <span class="res-badge" hidden data-i18n="results.newBest"></span>
      <span class="res-best"></span>
    </div>
    <div class="res-card">${card}</div>
    <div class="res-stats"></div>
    <div class="res-target" hidden></div>
    <div class="res-rank"></div>
    <div class="res-name"><label><span data-i18n="results.name"></span><input type="text" maxlength="16" autocomplete="off" spellcheck="false" data-i18n-ph="results.namePh"></label><button class="btn btn-small" data-act="saveName" data-i18n="btn.save"></button></div>
    <div class="res-actions">
      <button class="btn btn-primary btn-again" data-act="again"><span data-i18n="results.again"></span><kbd>Space</kbd></button>
      <button class="btn" data-act="share">${ICON.share}<span data-i18n="btn.share"></span></button>
      <button class="btn" data-act="copy">${ICON.link}<span data-i18n="btn.copyLink"></span></button>
      <button class="btn" data-act="board">${ICON.trophy}<span data-i18n="btn.board"></span></button>
    </div>
    <p class="res-hint" data-i18n="results.restartHint"></p>
  </div>
</section>
<section class="screen modal-screen share" data-screen="share">
  <div class="modal modal-share">
    <h2 class="modal-title" data-i18n="share.title"></h2>
    <div class="share-img"></div>
    <input class="share-link" readonly>
    <div class="share-actions">
      <button class="btn btn-primary" data-act="download" data-i18n="btn.download"></button>
      <button class="btn" data-act="nativeShare" data-i18n="btn.nativeShare"></button>
      <button class="btn" data-act="copy" data-i18n="btn.copyLink"></button>
      <button class="btn" data-act="back" data-i18n="btn.close"></button>
    </div>
  </div>
</section>
<div class="toast" role="status"></div>
`
  }

  // ─── screens ────────────────────────────────────────────────────────────
  show(screen: Screen): void {
    if (screen !== 'results') {
      clearTimeout(this.overTimer)
      cancelAnimationFrame(this.scoreAnimation)
    }
    this.stack.length = 0
    this.setScreen(screen)
  }

  push(screen: Screen): void {
    this.stack.push(this.screen)
    this.setScreen(screen)
  }

  back(): void {
    const prev = this.stack.pop()
    if (prev) this.setScreen(prev)
    else if (this.screen === 'pause') this.actions.resume()
    else if (this.screen === 'campaign') this.actions.quit()
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    const under = [screen, ...this.stack]
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const s = el.dataset.screen as Screen
      const active = s === screen || (s === 'hud' && under.includes('pause')) || (s === 'results' && under.includes('results') && screen !== 'results' && screen !== 'title') || (s === 'title' && under.includes('title') && screen !== 'title')
      el.classList.toggle('is-active', active)
      el.classList.toggle('is-under', active && s !== screen)
      el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    if (screen === 'title') this.renderTitle()
    if (screen === 'hud') this.refreshBalls()
    if (screen === 'board') void this.renderBoard()
    requestAnimationFrame(() => {
      const items = this.navItems()
      const first = items.find(el => el.matches('.btn-primary')) ?? items.find(el => !el.matches('input'))
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  setBootProgress(progress: number): void {
    this.q<HTMLElement>('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})`
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = this.root): T {
    return root.querySelector<T>(sel)!
  }

  private set(key: string, html: string, sel = `[data-hud="${key}"]`): void {
    if (this.hudCache.get(sel) === html) return
    this.hudCache.set(sel, html)
    const el = this.root.querySelector<HTMLElement>(sel)
    if (el) el.innerHTML = html
  }

  private translate(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.t(el.dataset.i18n!)
    for (const el of this.root.querySelectorAll<HTMLInputElement>('[data-i18n-ph]')) el.placeholder = this.t(el.dataset.i18nPh!)
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) el.setAttribute('aria-label', this.t(el.dataset.i18nAria!))
    this.hudCache.clear()
    this.renderHow()
    if (this.screen === 'title') this.renderTitle()
    if (this.lastHud) this.hud(this.lastHud)
    if (this.summary && (this.screen === 'results' || this.stack.includes('results'))) this.renderResults()
    this.refreshSettings()
    this.refreshBalls()
    this.onTranslate?.()
  }

  private renderHow(): void {
    const m = this.input.method === 'gamepad' ? 'Pad' : this.input.method === 'touch' ? 'Touch' : 'Keys'
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-how]')) el.textContent = this.t(`how.${el.dataset.how}${m}`)
  }

  private lastMethod = ''

  /** Per-frame UI work: method-dependent hints, gamepad menu navigation. */
  frame(dt: number): void {
    if (this.input.method !== this.lastMethod) {
      this.lastMethod = this.input.method
      document.body.classList.toggle('has-touch', this.input.method === 'touch' || matchMedia('(pointer: coarse)').matches)
      this.renderHow()
      this.renderHint()
    }
    this.navCooldown -= dt
    if (this.screen !== 'hud' && this.input.method === 'gamepad') {
      const x = this.input.moveAxis()
      if (Math.abs(x) > 0.6 && this.navCooldown <= 0) {
        this.navCooldown = 0.22
        this.moveFocus(x > 0 ? 1 : -1)
      }
      if (this.input.wasPressed('confirm')) {
        const el = document.activeElement as HTMLElement | null
        if (el && this.root.contains(el) && el.matches('button')) el.click()
        else if (this.screen === 'title') this.actions.play()
        else if (this.screen === 'results') this.actions.restart()
      }
      if (this.input.wasPressed('back')) this.back()
    }
  }

  private navItems(): HTMLElement[] {
    const screen = this.root.querySelector(`[data-screen="${this.screen}"]`)
    if (!screen) return []
    return [...screen.querySelectorAll<HTMLElement>('button:not([hidden]):not(:disabled):not(.touch-btn):not(.touch-throw):not(.pause-btn), input')].filter(el => el.offsetParent !== null)
  }

  private moveFocus(dir: number): void {
    const items = this.navItems()
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(i + dir + items.length) % items.length]
    next.focus({ preventScroll: true })
  }

  private onKey(e: KeyboardEvent): void {
    const typing = (e.target as HTMLElement | null)?.matches?.('input[type="text"]')
    if (typing) {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.saveName()
        ;(e.target as HTMLElement).blur()
      }
      if (e.key === 'Escape') (e.target as HTMLElement).blur()
      return
    }
    if (this.screen === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
      const el = document.activeElement as HTMLElement | null
      if (e.code === 'Enter' && el && el.matches('.btn:not(.btn-play)')) return
      e.preventDefault()
      this.actions.play()
      return
    }
    if (this.screen === 'results' && (e.code === 'Space' || e.code === 'Enter')) {
      const el = document.activeElement as HTMLElement | null
      if (e.code === 'Enter' && el && el.matches('.btn:not(.btn-again)')) return
      e.preventDefault()
      this.actions.restart()
      return
    }
    if (e.code === 'Escape') {
      // HUD/pause use the unified pause action in main; do not toggle twice.
      if (this.screen !== 'hud' && this.screen !== 'pause' && this.screen !== 'title' && this.screen !== 'results' && this.screen !== 'boot') this.back()
      return
    }
    if (this.screen !== 'hud' && ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key) && !(e.target as HTMLElement)?.matches?.('input[type="range"]')) {
      e.preventDefault()
      this.moveFocus(e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1)
    }
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-v], [data-period], [data-ball], .toggle')
    if (!el) return
    this.audio.unlock()
    if (el.dataset.ball) {
      this.actions.ball(el.dataset.ball as BallId)
      return
    }
    if (el.dataset.period) {
      this.boardPeriod = el.dataset.period as 'today' | 'all'
      void this.renderBoard()
      return
    }
    if (el.matches('.toggle')) {
      const key = el.dataset.setting as 'muted' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings()
      return
    }
    if (el.dataset.v) {
      const seg = el.closest<HTMLElement>('.seg')!
      const key = seg.dataset.setting
      if (key === 'locale') this.actions.settings({ locale: el.dataset.v as Locale })
      if (key === 'quality') this.actions.settings({ quality: el.dataset.v as Quality })
      this.refreshSettings()
      return
    }
    switch (el.dataset.act) {
      case 'campaign': this.actions.campaign(); break
      case 'stage': this.actions.stage(Number(el.dataset.stage)); break
      case 'play': this.actions.play(); break
      case 'again': this.actions.restart(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'pause': this.actions.pause(); break
      case 'settings': this.push('settings'); break
      case 'board': this.push('board'); break
      case 'back': this.back(); break
      case 'lang': this.push('settings'); break
      case 'saveName': this.saveName(); break
      case 'share': this.openShare(); break
      case 'copy': void this.copyLink(); break
      case 'download': this.downloadCard(); break
      case 'nativeShare': void this.nativeShare(); break
    }
  }

  refreshBalls(): void {
    const rack = this.root.querySelector<HTMLElement>('.ball-rack')
    if (!rack) return
    const unlocked = new Set(this.save.data.ballsUnlocked)
    rack.innerHTML = `<div class="ball-rack-head"><span>${esc(this.t('ball.title'))}</span><small>${esc(this.t('ball.hint'))}</small></div><div class="ball-rack-list">${BALL_ORDER.map(id => {
      const spec = BALLS[id]
      const available = unlocked.has(id)
      const selected = this.save.data.equippedBall === id
      const bonus = spec.bonuses.power ? `+${Math.round(spec.bonuses.power * 100)}% ${this.t('ball.power')}` : spec.bonuses.precision ? `+${Math.round(spec.bonuses.precision * 100)}% ${this.t('ball.precision')}` : spec.bonuses.control ? `+${Math.round(spec.bonuses.control * 100)}% ${this.t('ball.control')}` : this.t('ball.balanced')
      return `<button class="ball-card ${selected ? 'selected' : ''} ${available ? '' : 'locked'}" data-ball="${id}" ${available ? '' : 'disabled'} aria-pressed="${selected}" style="--ball:${spec.color};--ball-accent:${spec.accent}"><span class="ball-swatch"></span><span class="ball-copy"><b>${esc(this.t(`ball.${id}.name`))}</b><small>${esc(available ? bonus : this.t('ball.locked'))}</small></span>${selected ? '<i>✓</i>' : ''}</button>`
    }).join('')}</div>`
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement
    const key = el.dataset.setting as 'musicVolume' | 'sfxVolume' | undefined
    if (key) this.actions.settings({ [key]: Number(el.value) })
  }

  refreshSettings(): void {
    const d = this.save.data
    for (const seg of this.root.querySelectorAll<HTMLElement>('.seg[data-setting]')) {
      const key = seg.dataset.setting as 'locale' | 'quality'
      const value = key === 'locale' ? this.i18n.locale : d[key]
      for (const b of seg.querySelectorAll<HTMLElement>('button')) b.classList.toggle('is-on', b.dataset.v === value)
    }
    for (const r of this.root.querySelectorAll<HTMLInputElement>('input[type="range"][data-setting]')) r.value = String(d[r.dataset.setting as 'musicVolume' | 'sfxVolume'])
    for (const t of this.root.querySelectorAll<HTMLElement>('.toggle')) t.classList.toggle('is-on', !!d[t.dataset.setting as 'muted' | 'reducedMotion'])
    for (const b of this.root.querySelectorAll<HTMLElement>('.tabs button')) b.classList.toggle('is-on', b.dataset.period === this.boardPeriod)
  }

  // ─── title ──────────────────────────────────────────────────────────────
  renderTitle(): void {
    this.q('.daily').textContent = this.t('title.daily', { day: this.day })
    const best = this.save.data.best
    this.q('.pb').textContent = best > 0 ? this.t('title.best', { score: best }) : this.t('title.noBest')
    const chip = this.q('.challenge-chip')
    if (this.challenge) {
      chip.hidden = false
      chip.textContent = this.challenge.name ? this.t('title.challenge', { name: this.challenge.name, score: this.challenge.score }) : this.t('title.challengeAnon', { score: this.challenge.score })
    } else chip.hidden = true
    void this.renderMiniBoard()
  }

  private async renderMiniBoard(): Promise<void> {
    const ol = this.q('.mini-board ol')
    const page = await this.board.list('today', 5)
    if (!page) {
      ol.innerHTML = this.localBoard('today', 5)
      return
    }
    ol.innerHTML = page.entries.length ? page.entries.map(e => `<li class="${e.isMe ? 'me' : ''}"><em>${e.rank}</em><span>${esc(e.displayName)}</span><b>${e.score}</b></li>`).join('') : `<li class="muted">${esc(this.t('board.empty'))}</li>`
  }

  // ─── HUD ────────────────────────────────────────────────────────────────
  hud(h: HudState): void {
    this.onHud?.(h)
    this.lastHud = h
    this.fillCard(this.q('.hud-top .card'), h.rolls, h.frame)
    this.set('frame', esc(this.t('hud.frameOf', { n: h.frame + 1 })), '.hud-frame')
    this.set('ball', esc(this.t('hud.ballN', { n: h.ball + 1 })), '.hud-ball')
    const drift = h.cond.drift
    const arrows = Math.abs(drift) < 0.01 ? '' : Math.abs(drift) < 0.07 ? '›' : Math.abs(drift) < 0.11 ? '››' : '›››'
    const cond = Math.abs(drift) < 0.01 ? this.t('hud.straight') : `${this.t(drift < 0 ? 'hud.driftLeft' : 'hud.driftRight')} <i class="${drift < 0 ? 'flip' : ''}">${arrows}</i>`
    this.set('cond', `<span>${cond}</span><span>${esc(this.t('hud.guide', { pct: Math.round(h.cond.guide * 100) }))}</span>`, '.hud-cond')
    this.set('best', String(h.best))
    this.set('max', String(h.maxPossible))
    const tgt = this.q('.hud-target')
    tgt.hidden = h.target === null
    if (h.target !== null) this.set('target', String(h.target))
    const combo = this.q('.hud-combo')
    combo.hidden = h.combo < 2
    if (h.combo >= 2) combo.textContent = this.t('hud.combo', { n: h.combo })
  }

  private fillCard(card: HTMLElement, rolls: number[], current: number): void {
    fillScoreCard(card, rolls, current, !this.save.data.reducedMotion)
  }

  phase(p: Phase): void {
    this.phaseNow = p
    this.root.dataset.phase = p
    this.renderHint()
    if (p === 'aim' && this.lastHud && this.lastHud.ball === 0 && this.lastHud.rolls.length > 0) {
      const f = this.lastHud.frame
      this.banner('frame', f === 4 ? this.t('call.lastFrame') : this.t('call.frame', { n: f + 1 }), '')
    }
  }

  private renderHint(): void {
    const m = this.input.method
    let text = ''
    if (this.phaseNow === 'aim') text = this.t(`hint.aim.${m}`)
    else if (this.phaseNow === 'charge') text = this.t(`hint.charge.${m}`)
    else if (this.phaseNow === 'show') text = this.t('hint.skip')
    this.set('hint', esc(text), '.hint')
    this.q('.hint').classList.toggle('is-hot', this.phaseNow === 'charge')
  }

  banner(kind: string, text: string, sub = ''): void {
    const el = this.q('.banner')
    el.className = `banner is-${kind}`
    this.q('.banner-big').textContent = text
    this.q('.banner-sub').textContent = sub
    void el.offsetWidth
    el.classList.add('is-on')
    clearTimeout(this.bannerTimer)
    this.bannerTimer = window.setTimeout(() => el.classList.remove('is-on'), kind === 'strike' ? 2100 : kind === 'frame' ? 900 : 1500)
  }

  popup(text: string, tone: Tone): void {
    const el = document.createElement('div')
    el.className = `popup outlined tone-${tone}`
    el.textContent = text
    el.style.left = `${46 + Math.random() * 8}%`
    this.q('.popups').appendChild(el)
    window.setTimeout(() => el.remove(), 1300)
  }

  meter(power: number | null, spin: number): void {
    const m = this.q('.meter')
    if (power === null) {
      m.hidden = true
      return
    }
    m.hidden = false
    this.q('.meter-fill').style.transform = `scaleX(${power.toFixed(3)})`
    m.classList.toggle('is-max', power > 0.9)
    const fill = this.q('.spin-fill')
    fill.style.left = spin < 0 ? `${50 + spin * 50}%` : '50%'
    fill.style.width = `${Math.abs(spin) * 50}%`
    const label = Math.abs(spin) < 0.08 ? this.t('meter.straight') : `${spin < 0 ? '←' : ''} ${Math.round(Math.abs(spin) * 100)}% ${spin > 0 ? '→' : ''}`
    this.set('spin', esc(label), '.spin-label')
  }

  private toast(text: string): void {
    const el = this.q('.toast')
    el.textContent = text
    el.classList.add('is-on')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 1800)
  }

  // ─── touch controls ─────────────────────────────────────────────────────
  private bindTouch(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>('.touch-btn')) {
      const dir = Number(b.dataset.move)
      b.addEventListener('pointerdown', e => {
        e.preventDefault()
        b.setPointerCapture(e.pointerId)
        b.classList.add('is-down')
        this.input.setTouchMove(dir)
      })
      const up = () => {
        b.classList.remove('is-down')
        this.input.setTouchMove(0)
      }
      b.addEventListener('pointerup', up)
      b.addEventListener('pointercancel', up)
    }
    const t = this.q('.touch-throw')
    t.addEventListener('pointerdown', e => {
      e.preventDefault()
      t.setPointerCapture(e.pointerId)
      t.classList.add('is-down')
      this.input.setTouchAction('throw', true)
    })
    t.addEventListener('pointermove', e => {
      if (!t.classList.contains('is-down')) return
      const r = t.getBoundingClientRect()
      this.input.setTouchMove(Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 1.2))))
    })
    const up = () => {
      t.classList.remove('is-down')
      this.input.setTouchMove(0)
      this.input.setTouchAction('throw', false)
    }
    t.addEventListener('pointerup', up)
    t.addEventListener('pointercancel', () => {
      t.classList.remove('is-down')
      this.input.cancelThrow()
    })
    t.addEventListener('lostpointercapture', () => {
      if (t.classList.contains('is-down')) {
        t.classList.remove('is-down')
        this.input.cancelThrow()
      }
    })
  }

  // ─── results ────────────────────────────────────────────────────────────
  over(s: Summary): void {
    this.summary = s
    this.submit = 'pending'
    this.shareCanvas = undefined
    clearTimeout(this.overTimer)
    this.overTimer = window.setTimeout(() => {
      this.show('results')
      this.renderResults()
      this.countUp(s.score)
    }, 1100)
  }

  setSubmitResult(r: SubmitResult): void {
    this.submit = r
    this.shareCanvas = undefined
    if (this.summary) this.renderResults()
  }

  private countUp(score: number): void {
    cancelAnimationFrame(this.scoreAnimation)
    const el = this.q('.res-score')
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 900)
      el.textContent = String(Math.round(score * (1 - Math.pow(1 - k, 3))))
      if (k < 1) this.scoreAnimation = requestAnimationFrame(tick)
      else el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.6,.4,1)' })
    }
    this.scoreAnimation = requestAnimationFrame(tick)
  }

  private renderResults(): void {
    const s = this.summary
    if (!s) return
    this.fillCard(this.q('.res-card .card'), s.rolls, -1)
    this.q('.res-badge').hidden = !s.newBest
    this.q('.res-best').textContent = this.t('results.best', { score: this.save.data.best })
    const secs = Math.round(s.durationMs / 1000)
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    this.q('.res-stats').innerHTML = `<div><b>${s.strikes}</b><span>${esc(this.t('results.strikes'))}</span></div><div><b>${s.spares}</b><span>${esc(this.t('results.spares'))}</span></div><div><b>${time}</b><span>${esc(this.t('results.time'))}</span></div>`
    const tgt = this.q('.res-target')
    if (this.challenge) {
      tgt.hidden = false
      tgt.classList.toggle('is-win', s.beatTarget)
      tgt.textContent = s.beatTarget ? this.t('results.targetWin', { score: this.challenge.score }) : this.t('results.targetLose', { n: this.challenge.score - s.score + (s.score === this.challenge.score ? 1 : 0), score: this.challenge.score })
    } else tgt.hidden = true
    const rank = this.q('.res-rank')
    const r = this.submit
    if (r === 'pending' || r === undefined) rank.innerHTML = `<span class="muted">${esc(this.t('results.submitting'))}</span>`
    else if (!r.accepted) rank.innerHTML = `<span class="muted">${esc('error' in r && r.error !== 'offline' ? this.t('results.rejected', { code: r.error }) : this.t('results.offline'))}</span>`
    else if (!r.today || !r.allTime) rank.innerHTML = `<span class="muted">${esc(this.t('results.rankUnavailable'))}</span>`
    else rank.innerHTML = `<div class="rank-big"><b class="outlined">#${r.today.rank}</b><span>${esc(this.t('results.rankToday', { rank: r.today.rank, players: r.today.players }))}</span></div><div class="rank-pct outlined">${esc(this.t('results.beat', { pct: r.today.beatPct }))}</div><div class="rank-all">${esc(this.t('results.rankAll', { rank: r.allTime.rank, players: r.allTime.players }))}</div><small>${esc(this.t('board.casual'))}</small>`
    const input = this.q<HTMLInputElement>('.res-name input')
    if (document.activeElement !== input) input.value = this.save.data.playerName
    this.q('.res-name').classList.toggle('is-needed', !this.save.data.nameChosen)
    this.onResults?.()
  }

  private saveName(): void {
    const input = this.q<HTMLInputElement>('.res-name input')
    const name = [...input.value.replace(/[\u0000-\u001f]/g, '').trim()].slice(0, 16).join('')
    if (!name) return
    this.save.update({ playerName: name, nameChosen: true })
    this.onNameChange?.(name)
    this.toast(this.t('results.nameSaved'))
    this.shareCanvas = undefined
    this.renderResults()
  }

  private link(): string {
    return challengeLink(this.summary?.score ?? 0, this.save.data.playerName)
  }

  private card(): HTMLCanvasElement {
    if (this.shareCanvas) return this.shareCanvas
    const s = this.summary!
    const r = this.submit && this.submit !== 'pending' && this.submit.accepted ? this.submit : null
    this.shareCanvas = drawShareCard({ score: s.score, rolls: s.rolls, name: this.save.data.playerName, day: this.day, rank: r?.today?.rank ?? null, players: r?.today?.players ?? null, beatPct: r?.today?.beatPct ?? null, link: this.link(), t: (k, v) => this.t(k, v), zh: this.i18n.locale === 'zh-CN' })
    return this.shareCanvas
  }

  private openShare(): void {
    if (!this.summary) return
    const c = this.card()
    const holder = this.q('.share-img')
    holder.innerHTML = ''
    const img = new Image()
    img.alt = 'share card'
    img.src = c.toDataURL('image/png')
    holder.appendChild(img)
    this.q<HTMLInputElement>('.share-link').value = this.link()
    this.q('[data-act="nativeShare"]').hidden = typeof navigator.share !== 'function'
    this.push('share')
  }

  private downloadCard(): void {
    const c = this.card()
    const a = document.createElement('a')
    a.download = `strike-bowl-${this.summary?.score ?? 0}.png`
    a.href = c.toDataURL('image/png')
    document.body.appendChild(a)
    a.click()
    a.remove()
    this.toast(this.t('share.saved'))
  }

  private async nativeShare(): Promise<void> {
    const text = `${this.t('share.text', { score: this.summary?.score ?? 0 })} ${this.link()}`
    try {
      const blob = await new Promise<Blob | null>(res => this.card().toBlob(res, 'image/png'))
      const file = blob ? new File([blob], 'strike-bowl.png', { type: 'image/png' }) : null
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text })
      else await navigator.share({ text, url: this.link() })
    } catch {
      // Share sheet dismissed.
    }
  }

  private async copyLink(): Promise<void> {
    const text = `${this.t('share.text', { score: this.summary?.score ?? 0 })} ${this.link()}`
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      ta.remove()
    }
    this.toast(ok ? this.t('share.copied') : this.t('share.copyFail'))
    if (!ok && this.screen !== 'share') this.openShare()
  }

  // ─── leaderboard ────────────────────────────────────────────────────────
  private localBoard(period: 'today' | 'all', limit = 20): string {
    const rows = this.save.data.leaderboard.filter(e => {
      const date = new Date(e.at)
      return Number.isFinite(date.getTime()) && (period === 'all' || date.toISOString().slice(0, 10) === this.day)
    }).slice(0, limit)
    const label = `<li class="muted">${esc(this.t('board.local'))}</li>`
    return label + (rows.length ? rows.map((e, i) => `<li><em>${i + 1}</em><span>${esc(e.name)}</span><b>${e.score}</b></li>`).join('') : `<li class="muted">${esc(this.t('board.empty'))}</li>`)
  }

  private async renderBoard(): Promise<void> {
    this.refreshSettings()
    const list = this.q('.board-list')
    const meta = this.q('.board-meta')
    list.innerHTML = `<li class="muted">${esc(this.t('board.loading'))}</li>`
    meta.textContent = ''
    const period = this.boardPeriod
    const page: BoardPage | null = await this.board.list(period, 20)
    if (period !== this.boardPeriod) return
    if (!page) {
      meta.textContent = this.t('board.local')
      list.innerHTML = this.localBoard(period)
      return
    }
    meta.textContent = `${this.t('board.casual')} · ${this.t('board.players', { n: page.players })}${page.myRank ? ` · ${this.t('board.yourRank', { rank: page.myRank.rank, score: page.myRank.score })}` : ''}`
    list.innerHTML = page.entries.length
      ? page.entries.map(e => `<li class="${e.isMe ? 'me' : ''} ${e.rank <= 3 ? `top top${e.rank}` : ''}"><em>${e.rank}</em><span>${esc(e.displayName)}${e.isMe ? ` <small>${esc(this.t('board.you'))}</small>` : ''}</span><b>${e.score}</b></li>`).join('')
      : `<li class="muted">${esc(this.t('board.empty'))}</li>`
  }
}
