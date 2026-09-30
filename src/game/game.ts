import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import { frameScores, maxPossible, nextBall, scoreGame, rollKind, type NextBall } from '../../server/bowling.mjs'
import { AimGuide } from './aim'
import { Alley, ballMesh, pinGeometry, pinMaterial } from './alley'
import { CameraDirector } from './camera'
import { BALL, CAMERA, LANE, THROW } from './config'
import type { DailyLane, FrameConditions } from './daily'
import { Effects } from './fx'
import { isSplit } from './pinshape'
import { BowlingSim, predictPath, type ThrowParams } from './sim'
import { BALLS, DEFAULT_BALL, type BallId } from './balls'
import { evaluateChallenge, type ChallengeResult } from './challenges'

export type Phase = 'title' | 'aim' | 'charge' | 'roll' | 'show' | 'reset' | 'over'

export type HudState = {
  rolls: number[]
  frame: number
  ball: number
  total: number
  maxPossible: number
  best: number
  target: number | null
  combo: number
  cond: FrameConditions
  standing: number
}

export type Summary = { score: number; rolls: number[]; durationMs: number; strikes: number; spares: number; newBest: boolean; beatTarget: boolean; challenge?: ChallengeResult }

export interface GameUI {
  hud(h: HudState): void
  banner(kind: 'strike' | 'spare' | 'gutter' | 'split' | 'count' | 'near' | 'best' | 'target' | 'frame', text: string, sub?: string): void
  popup(text: string, tone: 'gold' | 'cyan' | 'pink' | 'white'): void
  meter(power: number | null, spin: number): void
  phase(p: Phase): void
  over(s: Summary): void
  t(key: string, vars?: Record<string, string | number>): string
}

const PIN_COLORS = ['#ff4fa3', '#39e6ff', '#ffd23f', '#8a5cff', '#ffffff']

export class Game {
  readonly scene = new THREE.Scene()
  readonly director: CameraDirector
  readonly sim: BowlingSim
  readonly alley: Alley
  readonly fx = new Effects()
  readonly aim = new AimGuide()
  phase: Phase = 'title'
  rolls: number[] = []
  best = 0
  target: number | null = null
  reducedMotion = false
  /** Test hook: skip slow motion and speed shows up. */
  fast = false
  private lane: DailyLane
  private next: NextBall = { done: false, frame: 0, ball: 0, fresh: true, standing: 10 }
  private stanceX = 0
  private aimAngle = 0
  private power = 0
  private chargeT = 0
  private spin = 0
  private pointerAim = true
  private spinStartX = 0
  private before: boolean[] = []
  private phaseT = 0
  private showFor = 0
  private timeScale = 1
  private slowLeft = 0
  private impactSeen = false
  private combo = 0
  private strikes = 0
  private spares = 0
  private startedAt = 0
  private announcedBest = false
  private announcedTarget = false
  private lastParams: ThrowParams | null = null
  private path: THREE.Vector3[] = []
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private reticle = new THREE.Vector3()
  private resetFresh = false
  private racked = false
  private prevStanding = 10
  private hitBudget = 0
  private tickAcc = 0
  private ballVisual: THREE.Group
  private generation = 0
  private ballId: BallId = DEFAULT_BALL
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>()

  private cancelAnnouncements(): void {
    this.generation += 1
    for (const timer of this.pendingTimers) clearTimeout(timer)
    this.pendingTimers.clear()
  }

  private announceLater(callback: () => void, delay: number): void {
    const generation = this.generation
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer)
      if (generation === this.generation) callback()
    }, delay)
    this.pendingTimers.add(timer)
  }

  constructor(private readonly input: Input, private readonly audio: Audio, private readonly ui: GameUI, lane: DailyLane, shadowMap: number) {
    this.lane = lane
    this.director = new CameraDirector(innerWidth / innerHeight)
    this.alley = new Alley(this.scene, lane.palette, shadowMap)
    this.sim = new BowlingSim()
    const geo = pinGeometry(12)
    const mat = pinMaterial()
    for (const pin of this.sim.pins) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      pin.object.add(mesh)
      this.scene.add(pin.object)
    }
    this.ballVisual = ballMesh(this.alley.palette.d, this.alley.palette.a)
    this.sim.ballObject.add(this.ballVisual)
    this.scene.add(this.sim.ballObject, this.fx.group, this.aim.group)
    this.aim.hide()
    this.sim.holdBall(0)
    this.director.set('title', true)
  }

  setBall(id: BallId): void {
    if (!(id in BALLS)) return
    this.ballId = id
    const spec = BALLS[id]
    this.sim.ballObject.remove(this.ballVisual)
    this.ballVisual = ballMesh(spec.color, spec.accent)
    this.sim.ballObject.add(this.ballVisual)
  }

  get cond(): FrameConditions {
    return this.lane.frames[Math.min(this.next.frame, this.lane.frames.length - 1)]
  }

  get day(): string {
    return this.lane.day
  }

  get total(): number {
    const s = frameScores(this.rolls) ?? []
    let t = 0
    for (const v of s) if (v !== null) t = v
    return t
  }

  hudState(): HudState {
    return { rolls: [...this.rolls], frame: this.next.frame, ball: this.next.ball, total: this.total, maxPossible: maxPossible(this.rolls), best: this.best, target: this.target, combo: this.combo, cond: this.cond, standing: this.next.standing }
  }

  private setPhase(p: Phase): void {
    this.phase = p
    this.phaseT = 0
    this.ui.phase(p)
  }

  /** Start (or restart) a five-frame game immediately. */
  start(lane?: DailyLane): void {
    this.cancelAnnouncements()
    if (lane) this.lane = lane
    this.pinLift = 0
    this.prevWasSplit = false
    this.audio.setCharge(null)
    this.audio.setRoll(0)
    this.rolls = []
    this.next = nextBall(this.rolls)!
    this.combo = 0
    this.strikes = 0
    this.spares = 0
    this.announcedBest = false
    this.announcedTarget = false
    this.startedAt = performance.now()
    this.timeScale = 1
    this.slowLeft = 0
    this.fx.clear()
    this.sim.rack(true)
    this.stanceX = 0
    this.aimAngle = 0
    this.alley.sweep.position.y = 1.25
    this.beginAim(true)
    this.audio.play('start')
    this.ui.hud(this.hudState())
  }

  /** Back to the title attract mode. */
  toTitle(): void {
    this.cancelAnnouncements()
    this.pinLift = 0
    this.input.reset()
    this.sim.rack(true)
    this.sim.holdBall(0)
    this.aim.hide()
    this.timeScale = 1
    this.audio.setRoll(0)
    this.audio.setCharge(null)
    this.director.set('title')
    this.setPhase('title')
  }

  private beginAim(snap = false): void {
    this.before = this.sim.standing()
    this.prevStanding = this.before.filter(Boolean).length
    this.sim.holdBall(this.stanceX)
    this.ballVisual.scale.setScalar(0.01)
    this.director.stanceX = this.stanceX
    this.director.set('stance', snap)
    this.alley.screen.set({ frame: this.next.frame, ball: this.next.ball, total: this.total, standing: this.before, caption: this.ui.t('screen.caption', { frame: this.next.frame + 1, ball: this.next.ball + 1 }), target: this.target ? this.ui.t('screen.target', { score: this.target }) : undefined })
    this.alley.screen.clearShow()
    this.input.reset()
    this.setPhase('aim')
    this.ui.hud(this.hudState())
  }

  private throwParams(): ThrowParams {
    const bonus = BALLS[this.ballId].bonuses
    return {
      x: this.stanceX,
      angle: this.aimAngle * Math.max(0.7, 1 - bonus.precision * 0.35),
      speed: BALL.minSpeed + this.power * (BALL.maxSpeed - BALL.minSpeed) * (1 + bonus.power),
      spin: this.spin * (1 + bonus.control),
    }
  }

  /** Fixed-step simulation (physics + slow motion). */
  step(dt: number): void {
    if (this.phase === 'roll' || this.phase === 'show' || this.phase === 'title' || this.phase === 'reset' || this.phase === 'over') {
      const simDt = dt * this.timeScale
      const done = this.sim.step(simDt)
      if (this.phase === 'roll') {
        this.watchRoll()
        if (done) this.finishBall()
      }
    }
  }

  private watchRoll(): void {
    const p = this.sim.ball.translation()
    if (!this.impactSeen && (this.sim.impactAt >= 0 || -p.z > LANE.headPin - 1.1)) {
      this.impactSeen = true
      const onTarget = this.sim.gutterAt < 0 && Math.abs(p.x) < LANE.width / 2 + 0.05
      if (onTarget && !this.fast) {
        this.slowLeft = this.reducedMotion ? CAMERA.slowSeconds * 0.5 : CAMERA.slowSeconds
        this.director.set('impact')
      }
    }
    if (p.y < -0.3 || -p.z > LANE.pitEnd) this.sim.ballObject.visible = false
  }

  /** Per rendered frame: input, timers, visuals. */
  frame(dt: number): void {
    this.phaseT += dt
    this.handleSlowMo(dt)
    switch (this.phase) {
      case 'title':
        break
      case 'aim':
        this.updateAim(dt)
        break
      case 'charge':
        this.updateCharge(dt)
        break
      case 'roll':
        this.updateRoll()
        break
      case 'show':
        if (this.phaseT > this.showFor || (this.phaseT > 0.45 && (this.input.wasPressed('throw') || this.input.wasPressed('confirm') || this.input.pointerWasPressed()))) this.beginReset()
        break
      case 'reset':
        this.updateReset()
        break
      case 'over':
        break
    }
    this.drainHits()
    const bp = this.sim.ballObject.position
    this.director.ball.copy(bp)
    this.director.reducedMotion = this.reducedMotion
    this.director.update(dt)
    this.alley.update(dt, this.reducedMotion)
    this.alley.screen.update(dt)
    this.aim.update(dt)
    this.fx.update(dt * Math.max(this.timeScale, 0.35))
    // Pop-in of a new ball from the return.
    const s = this.ballVisual.scale.x
    if (s < 1) this.ballVisual.scale.setScalar(Math.min(1, s + dt * 5))
  }

  private handleSlowMo(dt: number): void {
    if (this.slowLeft > 0) {
      this.slowLeft -= dt
      this.timeScale += (CAMERA.slowScale - this.timeScale) * Math.min(1, dt * 14)
      if (this.slowLeft <= 0) this.slowLeft = 0
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 4)
      if (this.timeScale > 0.995) this.timeScale = 1
    }
  }

  private laneHit(): THREE.Vector3 | null {
    const p = this.input.pointer
    if (!p.inside && !p.down) return null
    this.ray.setFromCamera(new THREE.Vector2(p.x, p.y), this.director.camera)
    const hit = this.ray.ray.intersectPlane(this.plane, this.reticle)
    if (!hit || hit.z > -1) return null
    return hit
  }

  private updateAim(dt: number): void {
    const move = this.input.moveAxis()
    if (move !== 0) {
      const before = this.stanceX
      this.stanceX = THREE.MathUtils.clamp(this.stanceX + move * BALL.stanceSpeed * dt, -BALL.stanceMax, BALL.stanceMax)
      this.tickAcc += Math.abs(this.stanceX - before)
      if (this.tickAcc > 0.05) {
        this.tickAcc = 0
        this.audio.play('tick')
      }
    }
    const aimAxis = this.input.aimAxis()
    if (aimAxis !== 0) {
      this.pointerAim = false
      this.aimAngle = THREE.MathUtils.clamp(this.aimAngle + aimAxis * 0.05 * dt, -BALL.aimMax, BALL.aimMax)
    }
    if (this.input.pointerMoved) {
      this.pointerAim = true
      this.input.pointerMoved = false
    }
    let reticle: THREE.Vector3 | null = null
    if (this.pointerAim && this.input.method !== 'gamepad') {
      const hit = this.laneHit()
      if (hit) {
        this.aimAngle = THREE.MathUtils.clamp(Math.atan2(hit.x - this.stanceX, -hit.z), -BALL.aimMax, BALL.aimMax)
        reticle = hit
      }
    }
    this.sim.holdBall(this.stanceX)
    this.director.stanceX = this.stanceX
    this.spin = 0
    predictPath(this.throwParams(), this.cond, this.path)
    this.aim.show(this.path, Math.min(1, this.cond.guide + BALLS[this.ballId].bonuses.precision * 0.2), this.stanceX, null, reticle, true)
    const pointerStart = this.input.pointerWasPressed()
    if (pointerStart) {
      // Aim where the press landed (touch taps a spot on the lane), then drag sideways for spin.
      const hit = this.laneHit()
      if (hit) this.aimAngle = THREE.MathUtils.clamp(Math.atan2(hit.x - this.stanceX, -hit.z), -BALL.aimMax, BALL.aimMax)
    }
    if (pointerStart || this.input.wasPressed('throw')) this.beginCharge(pointerStart)
  }

  private chargeByPointer = false

  private beginCharge(byPointer: boolean): void {
    this.chargeByPointer = byPointer
    this.spinStartX = this.input.pointer.px
    this.chargeT = 0
    this.power = 0
    this.spin = 0
    this.setPhase('charge')
  }

  private updateCharge(dt: number): void {
    if (this.input.wasCancelled()) {
      this.audio.setCharge(null)
      this.ui.meter(null, 0)
      this.beginAim()
      return
    }
    const period = THROW.chargeSeconds[Math.min(this.next.frame, THROW.chargeSeconds.length - 1)]
    this.chargeT += dt
    // Ping-pong meter: 0 → 1 → 0 ...
    const u = (this.chargeT / period) % 2
    this.power = u < 1 ? u : 2 - u
    if (this.chargeByPointer) {
      const dx = (this.input.pointer.px - this.spinStartX) / Math.max(320, innerWidth)
      this.spin = THREE.MathUtils.clamp(dx / THROW.spinDrag, -1, 1)
    } else {
      const axis = this.input.method === 'gamepad' ? this.input.spinAxis() : 0
      if (this.input.method === 'gamepad') this.spin = THREE.MathUtils.clamp(axis, -1, 1)
      else this.spin = THREE.MathUtils.clamp(this.spin + this.input.spinAxis() * dt * 2.2, -1, 1)
    }
    predictPath(this.throwParams(), this.cond, this.path)
    this.aim.show(this.path, Math.min(1, this.cond.guide + BALLS[this.ballId].bonuses.precision * 0.2), this.stanceX, this.power, null, false)
    this.ui.meter(this.power, this.spin)
    this.audio.setCharge(this.power)
    const released = this.chargeByPointer ? this.input.pointerWasReleased() || !this.input.pointer.down : this.input.wasReleased('throw') || !this.input.isDown('throw')
    if (released && this.chargeT > 0.06) this.release()
  }

  private release(): void {
    const p = this.throwParams()
    this.lastParams = p
    this.audio.setCharge(null)
    this.audio.play('release')
    this.ui.meter(null, 0)
    this.aim.hide()
    this.sim.ballObject.visible = true
    this.sim.release(p, this.cond)
    this.impactSeen = false
    this.hitBudget = 0
    this.director.set('follow')
    this.setPhase('roll')
    if (p.speed > BALL.maxSpeed - 0.35) this.ui.popup(this.ui.t('pop.power'), 'gold')
    if (Math.abs(p.spin) > 0.6) this.ui.popup(this.ui.t(p.spin > 0 ? 'pop.hookRight' : 'pop.hookLeft'), 'cyan')
  }

  private updateRoll(): void {
    const v = this.sim.ball.linvel()
    const p = this.sim.ball.translation()
    const gutter = this.sim.gutterAt >= 0
    this.audio.setRoll(this.sim.ballObject.visible ? Math.hypot(v.x, v.z) : 0, gutter)
    if (gutter && this.sim.t - this.sim.gutterAt < 0.05 && !this.fast) {
      this.fx.puff(new THREE.Vector3(p.x, 0, p.z), 0.6)
    }
  }

  private drainHits(): void {
    const hits = this.sim.hits.splice(0)
    for (const h of hits) {
      const at = new THREE.Vector3(h.x, Math.max(0.12, h.y + 0.12), h.z)
      if (h.kind === 'ballPin') {
        const s = Math.min(1, h.force / 2600)
        this.audio.hit(s, true)
        this.fx.impact(at, s, '#fff2c4')
        this.fx.shatter(at, s)
        if (this.hitBudget < 1) {
          this.director.shake(0.35 + s * 0.3)
          this.alley.flashLights(this.alley.palette.c, 0.22)
        }
        this.hitBudget += 1
      } else if (h.kind === 'pinPin') {
        const s = Math.min(1, h.force / 700)
        this.audio.hit(s * 0.8)
        if (s > 0.35) this.fx.impact(at, s * 0.6, PIN_COLORS[h.pin % PIN_COLORS.length])
        if (s > 0.6) this.fx.shatter(at, s * 0.5)
      } else if (h.kind === 'pinWall') {
        this.audio.hit(Math.min(1, h.force / 900) * 0.6)
      } else if (h.kind === 'pinFloor') {
        const s = Math.min(1, h.force / 900)
        if (s > 0.25) this.audio.hit(s * 0.45)
      } else if (h.kind === 'ballWall') {
        this.audio.hit(Math.min(1, h.force / 3000) * 0.6, true)
      }
    }
  }

  private finishBall(): void {
    this.audio.setRoll(0)
    this.slowLeft = 0
    const standing = this.sim.standing()
    this.sim.finishRoll()
    const down = this.sim.gutterAt >= 0 ? 0 : this.before.reduce((n, was, i) => n + (was && !standing[i] ? 1 : 0), 0)
    const cur = this.next
    const firstBallOfRack = cur.fresh
    this.rolls.push(down)
    const after = nextBall(this.rolls)!
    const left = standing.filter(Boolean).length
    const wobbler = this.sim.pins.some(p => p.active && standing[p.index] && p.maxTilt > 0.22)
    const gutter = this.sim.gutterAt >= 0 && down === 0
    const frameMarks = this.rolls
    void frameMarks
    let kind: Parameters<GameUI['banner']>[0] = 'count'
    let big = ''
    let small = ''
    const resultKind = rollKind(cur, down)
    const isStrike = resultKind === 'strike'
    const isSpare = resultKind === 'spare'
    if (isStrike) {
      this.combo += 1
      this.strikes += 1
      kind = 'strike'
      big = this.ui.t('call.strike')
      small = this.combo >= 2 ? this.ui.t(`call.combo${Math.min(this.combo, 5)}`) : this.ui.t('call.strikeSub')
      this.strikeShow(this.combo)
    } else if (isSpare) {
      this.spares += 1
      this.combo = 0
      kind = 'spare'
      big = this.ui.t('call.spare')
      small = this.prevWasSplit ? this.ui.t('call.splitSpare') : this.ui.t('call.spareSub')
      this.spareShow()
    } else {
      this.combo = 0
      if (gutter) {
        kind = 'gutter'
        big = this.ui.t('call.gutter')
        small = this.ui.t('call.gutterSub')
        this.audio.play('aww')
      } else if (down === 0) {
        kind = 'count'
        big = this.ui.t('call.miss')
        small = ''
        this.audio.play('miss')
      } else {
        kind = 'count'
        big = this.ui.t('call.pins', { n: down })
        if (firstBallOfRack && isSplit(standing)) {
          kind = 'split'
          small = this.ui.t('call.split')
          this.audio.play('split')
        } else if (left === 1 && firstBallOfRack) {
          kind = 'near'
          small = this.ui.t('call.oneLeft')
          this.audio.play('aww')
        } else if (wobbler) {
          kind = 'near'
          small = this.ui.t('call.wobble')
          this.audio.play('wobble')
        } else if (!firstBallOfRack && left > 0) {
          small = this.ui.t('call.leftPins', { n: left })
          this.audio.play('miss')
        }
        if (wobbler && kind !== 'near') this.audio.play('wobble')
      }
    }
    this.prevWasSplit = firstBallOfRack && !isStrike && isSplit(standing)
    this.ui.banner(kind, big, small)
    if (down > 0) this.ui.popup(`+${down}`, isStrike ? 'gold' : isSpare ? 'cyan' : 'white')
    this.alley.screen.play({ kind: kind === 'near' ? 'count' : (kind as 'strike' | 'spare' | 'gutter' | 'split' | 'count'), big, small })
    this.next = after
    this.ui.hud(this.hudState())
    // Personal-best and challenge-target moments during the game.
    const total = this.total
    if (!this.announcedBest && this.best > 0 && total > this.best) {
      this.announcedBest = true
      this.announceLater(() => {
        this.ui.banner('best', this.ui.t('call.newBest'), this.ui.t('call.newBestSub', { score: total }))
        this.audio.play('best')
      }, 900)
    }
    if (!this.announcedTarget && this.target !== null && total > this.target) {
      this.announcedTarget = true
      this.announceLater(() => this.ui.banner('target', this.ui.t('call.beatTarget'), this.ui.t('call.beatTargetSub', { score: this.target ?? 0 })), 1500)
    }
    this.showFor = this.fast ? 0.2 : isStrike ? 2.4 : isSpare ? 1.8 : 1.3
    this.setPhase('show')
    void this.prevStanding
  }

  private prevWasSplit = false

  private strikeShow(combo: number): void {
    const p = this.alley.palette
    const colors = [p.a, p.b, p.c, p.d, '#ffffff']
    this.audio.play('strike')
    if (combo >= 2) this.audio.play('combo')
    this.alley.flashLights(combo >= 3 ? p.c : p.a, 1)
    this.alley.cheer(1)
    this.director.shake(0.7)
    const deck = new THREE.Vector3(0, 0.3, -LANE.headPin - 0.4)
    this.fx.confettiBurst(new THREE.Vector3(-0.75, 0.6, -LANE.headPin), 90 + combo * 30, colors, 5)
    this.fx.confettiBurst(new THREE.Vector3(0.75, 0.6, -LANE.headPin), 90 + combo * 30, colors, 5)
    this.fx.confettiRain(new THREE.Vector3(0, 2.2, -LANE.headPin + 1.2), 1.4, 120 + combo * 40, colors)
    this.fx.impact(deck, 1, p.c)
  }

  private spareShow(): void {
    const p = this.alley.palette
    this.audio.play('spare')
    this.alley.flashLights(p.b, 0.6)
    this.alley.cheer(0.6)
    this.fx.confettiBurst(new THREE.Vector3(0, 0.5, -LANE.headPin - 0.2), 80, [p.b, '#ffffff', p.d], 4)
  }

  private beginReset(): void {
    this.alley.screen.clearShow()
    if (this.next.done) {
      this.finishGame()
      return
    }
    this.resetFresh = this.next.fresh
    this.racked = false
    this.audio.play('sweep')
    this.director.set('stance')
    this.director.stanceX = this.stanceX
    this.setPhase('reset')
  }

  private updateReset(): void {
    const t = this.phaseT * (this.fast ? 4 : 1)
    const sweep = this.alley.sweep
    const zFront = -LANE.headPin + 0.35
    const standingVisual = this.sim.pins.filter(p => p.active)
    // Bar down, sweep back, return, rise.
    if (t < 0.25) sweep.position.set(0, THREE.MathUtils.lerp(1.25, 0.12, t / 0.25), zFront)
    else if (t < 0.55) sweep.position.set(0, 0.12, zFront)
    else if (t < 0.8) sweep.position.set(0, 0.12, THREE.MathUtils.lerp(zFront, -LANE.deckEnd - 0.1, (t - 0.55) / 0.25))
    else if (t < 1.0) sweep.position.set(0, 0.12, THREE.MathUtils.lerp(-LANE.deckEnd - 0.1, zFront, (t - 0.8) / 0.2))
    else sweep.position.set(0, THREE.MathUtils.lerp(0.12, 1.25, Math.min(1, (t - 1.0) / 0.25)), zFront)
    if (!this.racked && t >= 0.62) {
      this.racked = true
      this.sim.rack(this.resetFresh)
      this.sim.holdBall(this.stanceX)
    }
    // Lift/lower pins visually around the rack call.
    let lift = 0
    if (!this.resetFresh) {
      if (t < 0.3) lift = 0
      else if (t < 0.5) lift = ((t - 0.3) / 0.2) * 0.5
      else if (t < 0.85) lift = 0.5
      else if (t < 1.1) lift = 0.5 * (1 - (t - 0.85) / 0.25)
    } else if (this.racked) {
      lift = t < 0.85 ? 0.6 : Math.max(0, 0.6 * (1 - (t - 0.85) / 0.3))
    }
    this.pinLift = lift
    void standingVisual
    if (t >= 1.25) {
      this.pinLift = 0
      sweep.position.set(0, 1.25, zFront)
      this.beginAim()
    }
  }

  /** Visual-only vertical offset for pins while the pinsetter handles them. */
  pinLift = 0

  private finishGame(): void {
    const score = scoreGame(this.rolls) ?? this.total
    const durationMs = performance.now() - this.startedAt
    const newBest = score > this.best
    const beatTarget = this.target !== null && score > this.target
    this.director.set('results')
    this.setPhase('over')
    this.audio.play(newBest ? 'best' : 'end')
    if (newBest || score >= 100) {
      const p = this.alley.palette
      this.fx.confettiRain(new THREE.Vector3(0, 2.4, -LANE.headPin + 2), 1.8, 220, [p.a, p.b, p.c, p.d])
      this.alley.flashLights(p.c, 0.8)
      this.alley.cheer(1)
    }
    this.alley.screen.play({ kind: 'final', big: String(score), small: this.ui.t('screen.final') })
    const challenge = this.lane.challenge ? { id: this.lane.challenge.id, success: evaluateChallenge(this.lane.challenge, { score, rolls: [...this.rolls], strikes: this.strikes, spares: this.spares }) } : undefined
    this.ui.over({ score, rolls: [...this.rolls], durationMs, strikes: this.strikes, spares: this.spares, newBest, beatTarget, challenge })
  }

  /** Render-time sync after physics interpolation. */
  sync(alpha: number): void {
    this.sim.sync(alpha)
    if (this.pinLift > 0) for (const p of this.sim.pins) if (p.active) p.object.position.y += this.pinLift
  }

  /** Debug/test hook: bowl a ball with explicit parameters from the aim phase. */
  debugThrow(p: Partial<ThrowParams>): boolean {
    if (this.phase !== 'aim') return false
    this.stanceX = p.x ?? this.stanceX
    this.aimAngle = p.angle ?? 0
    this.spin = p.spin ?? 0
    this.power = THREE.MathUtils.clamp(((p.speed ?? 8.5) - BALL.minSpeed) / (BALL.maxSpeed - BALL.minSpeed), 0, 1)
    this.release()
    this.lastParams = { ...this.throwParams() }
    return true
  }

  get lastThrow(): ThrowParams | null {
    return this.lastParams
  }
}
