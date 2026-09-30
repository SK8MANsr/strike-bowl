import './styles/main.css'
import './styles/campaign.css'
import './styles/hud.css'
import { CampaignStore, campaignLane, simulateOpponent, unlockedStage, STAGES } from './game/campaign'
import { CampaignView } from './ui/campaign'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, insertScore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import type { Renderer as RendererT } from './engine/renderer'
import { Leaderboard, type SubmitResult } from './net/leaderboard'
import { readChallenge } from './ui/share'
import { Ui } from './ui/ui'
import { dailyLane, utcDay } from './game/daily'
import { normalizeBallState, type BallId } from './game/balls'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const campaignStore = new CampaignStore()
  const syncBallRewards = () => {
    const totalStars = campaignStore.data.stars.reduce((sum, stars) => sum + stars, 0)
    const state = normalizeBallState(save.data.ballsUnlocked, save.data.equippedBall, totalStars)
    if (state.unlocked.join('|') !== save.data.ballsUnlocked.join('|') || state.equipped !== save.data.equippedBall) save.update({ ballsUnlocked: state.unlocked, equippedBall: state.equipped })
    return state
  }
  syncBallRewards()
  let campaign: CampaignView
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  document.documentElement.lang = i18n.locale
  const input = new Input(canvas)
  const audio = new Audio()
  const board = new Leaderboard()
  let lane = dailyLane(utcDay())
  const challenge = readChallenge()
  let game: Game | undefined
  let renderer: RendererT | undefined
  let loop: GameLoop | undefined
  let runtimePromise: Promise<void> | null = null
  let runId: Promise<string | null> | null = null
  let gameToken = 0

  if (save.data.bestDay !== lane.day) save.update({ bestDay: lane.day, dayBest: 0 })
  if (!save.data.playerName) save.update({ playerName: `${i18n.t('name.auto')}${Math.floor(1000 + Math.random() * 9000)}` })

  const applySettings = (d: SaveData) => {
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.reducedMotion = d.reducedMotion
  }

  const ensureRuntime = async (): Promise<void> => {
    if (runtimePromise) return runtimePromise
    runtimePromise = (async () => {
      const [{ Game: GameClass }, physics] = await Promise.all([
        import('./game/game'),
        import('./engine/physics'),
      ])
      ui.setBootProgress(0.72)
      await physics.initPhysics()
      ui.setBootProgress(0.86)
      if (!renderer) throw new Error('Renderer not ready')
      const r = renderer
      const g = new GameClass(input, audio, ui, lane, r.shadowMapSize)
      game = g
      g.setBall(save.data.equippedBall)
      g.reducedMotion = save.data.reducedMotion
      g.best = save.data.best
      g.target = challenge?.score ?? null
      g.alley.bakeEnvironment(r.gl, g.scene)

      const showOver = ui.over.bind(ui)
      ui.over = summary => {
        const token = gameToken
        const newBest = summary.score > save.data.best
        if (campaign.match) {
          campaign.match.playerScore = summary.score
          campaignStore.finish(campaign.match.stage, summary.score, campaign.match.bot.score)
          syncBallRewards()
        }
        save.update({
          best: Math.max(save.data.best, summary.score),
          ...(!campaign.match ? { dayBest: Math.max(save.data.dayBest, summary.score), bestDay: lane.day } : {}),
          games: save.data.games + 1,
          strikes: save.data.strikes + summary.strikes,
          leaderboard: insertScore(save.data.leaderboard, { name: save.data.playerName, score: summary.score, seconds: summary.durationMs / 1000, at: Date.now() }).board,
        })
        showOver({ ...summary, newBest })
        const pending = runId
        runId = null
        void (async () => {
          const id = pending ? await pending : null
          let result: SubmitResult
          if (!id) result = { accepted: false, error: 'offline' }
          else result = await board.submit(id, summary.score, summary.durationMs, summary.rolls)
          if (token === gameToken) ui.setSubmitResult(result)
        })()
      }

      loop = new GameLoop({
        step: dt => g.step(dt),
        render: (alpha, frameSeconds) => {
          input.poll()
          ui.frame(frameSeconds)
          if (input.wasPressed('pause') && ui.screen === 'hud') pause()
          else if (input.wasPressed('pause') && ui.screen === 'pause') resume()
          if (input.wasPressed('restart') && ui.screen === 'hud') restart()
          if (!loop?.paused) g.frame(Math.min(frameSeconds, 0.1))
          g.sync(alpha)
          r.render(g.scene, g.director.camera)
          input.endStep()
        },
      })
      loop.start()
      if (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === 'true') {
        ;(window as unknown as { __sb: unknown }).__sb = { game: g, ui, input, save, board, loop, campaign, campaignStore }
      }
      ui.setBootProgress(1)
    })().catch(error => {
      runtimePromise = null
      throw error
    })
    return runtimePromise
  }

  const startGame = async () => {
    try {
      await ensureRuntime()
    } catch (error) {
      console.error(error)
      ui.show('title')
      return
    }
    if (!game || !loop) return
    audio.unlock()
    audio.startMusic()
    gameToken += 1
    lane = campaign.match ? campaignLane(campaign.match.stage) : dailyLane(utcDay())
    if (campaign.match) lane.day = utcDay()
    ui.day = lane.day
    ui.dailyChallenge = lane.challenge
    ui.laneProfile = lane.profile
    if (!campaign.match && save.data.bestDay !== lane.day) save.update({ bestDay: lane.day, dayBest: 0 })
    game.best = save.data.best
    game.target = campaign.match ? null : challenge?.score ?? null
    game.start(lane)
    ui.show('hud')
    loop.paused = false
    loop.resetAccumulator()
    runId = campaign.match ? null : board.startRun(save.data.playerName, lane.day)
  }

  const openCampaign = () => {
    gameToken++
    runId = null
    campaign.match = undefined
    campaign.busy = false
    game?.toTitle()
    if (loop) loop.paused = false
    ui.show('campaign')
    campaign.hud()
    campaign.renderMap()
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.road-node.current')?.scrollIntoView({ block: 'center' }))
  }
  const startStage = async (stage: number) => {
    if (campaign.busy || !Number.isInteger(stage) || stage < 0 || stage >= STAGES.length || stage > unlockedStage(campaignStore.data)) return
    const token = ++gameToken
    campaign.match = undefined
    campaign.busy = true
    game?.toTitle()
    if (loop) loop.paused = true
    ui.show('campaign')
    campaign.renderMap()
    try {
      const stageLane = campaignLane(stage)
      const attempt = campaignStore.begin(stage)
      const bot = await simulateOpponent(stage, attempt, stageLane)
      if (token !== gameToken) return
      campaign.busy = false
      campaign.match = { stage, bot }
      await startGame()
    } catch (error) {
      if (token !== gameToken) return
      console.error(error)
      campaign.busy = false
      if (loop) loop.paused = false
      campaign.renderMap(campaign.t('fail'))
    }
  }
  const restart = () => { if (campaign.match) void startStage(campaign.match.stage); else void startGame() }

  const pause = () => {
    if (!game || !loop || ui.screen !== 'hud') return
    loop.paused = true
    input.cancelThrow()
    audio.setRoll(0)
    audio.setCharge(null)
    ui.show('pause')
  }
  const resume = () => {
    if (!game || !loop) return
    loop.paused = false
    loop.resetAccumulator()
    input.cancelThrow()
    ui.show('hud')
  }

  const ui = new Ui(i18n, save, audio, input, board, {
    play: () => { campaign.match = undefined; void startGame(); campaign.hud() },
    restart,
    campaign: openCampaign,
    stage: n => { void startStage(n) },
    resume,
    pause,
    quit: () => {
      gameToken++
      runId = null
      campaign.match = undefined
      campaign.busy = false
      if (loop) loop.paused = false
      audio.stopMusic()
      game?.toTitle()
      ui.show('title')
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) {
        i18n.set(patch.locale)
        document.documentElement.lang = patch.locale
      }
      if (qualityChanged) renderer?.applyQuality(save.data.quality)
    },
    ball: (id: BallId) => {
      const state = syncBallRewards()
      if (!state.unlocked.includes(id)) return
      save.update({ equippedBall: id })
      game?.setBall(id)
      ui.refreshBalls()
    },
  })
  campaign = new CampaignView(i18n, campaignStore)
  ui.onHud = h => campaign.hud(h)
  ui.onResults = () => campaign.result()
  ui.onTranslate = () => campaign.refresh()
  campaign.refresh()
  ui.day = lane.day
  ui.dailyChallenge = lane.challenge
  ui.laneProfile = lane.profile
  ui.challenge = challenge
  ui.onNameChange = name => void board.rename(name)
  ui.show('boot')
  applySettings(save.data)

  const [{ Renderer, suggestQuality }] = await Promise.all([
    import('./engine/renderer'),
    document.fonts.ready.then(() => undefined),
  ])
  ui.setBootProgress(0.55)
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  renderer = new Renderer(canvas, save.data.quality)
  if (import.meta.env.VITE_TEST_HOOKS === 'true') await ensureRuntime()
  window.setTimeout(() => ui.show('title'), 200)
  if (import.meta.env.PROD && 'serviceWorker' in navigator && import.meta.env.VITE_TEST_HOOKS !== 'true') {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
