import * as THREE from 'three'
import { Physics, RAPIER } from '../engine/physics'
import { BALL, LANE, PIN, SIM } from './config'
import type { FrameConditions } from './daily'
import { PIN_SPOTS, pinHullPoints } from './pinshape'

export type ThrowParams = {
  /** Ball centre across the lane at release (m, + right). */
  x: number
  /** Direction relative to straight down the lane (rad, + right). */
  angle: number
  /** Release speed (m/s). */
  speed: number
  /** -1..1; + curves to the right late in the lane. */
  spin: number
}

export type HitKind = 'ballPin' | 'pinPin' | 'pinWall' | 'pinFloor' | 'ballWall'
export type Hit = { kind: HitKind; force: number; x: number; y: number; z: number; pin: number }

export type Pin = {
  index: number
  body: RAPIER.RigidBody
  object: THREE.Object3D
  active: boolean
  /** Largest tilt from vertical seen during this ball (radians); for "wobbler" moments. */
  maxTilt: number
  /** Was touched by anything during this ball. */
  touched: boolean
}

type Tag = { kind: 'ball' } | { kind: 'pin'; index: number } | { kind: 'wall' } | { kind: 'floor' }

const UP = new THREE.Vector3(0, 1, 0)
const tmpQ = new THREE.Quaternion()
const tmpV = new THREE.Vector3()

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Lateral acceleration on the ball at a given distance down the lane. Shared with the aim guide. */
export function laneAccel(distance: number, spin: number, cond: FrameConditions): number {
  const hook = spin * BALL.hook * cond.hookScale * smoothstep(cond.oil, cond.oil + BALL.hookRamp, distance)
  return hook + cond.drift
}

/**
 * Predict the ball path on an empty lane (no pins, no friction loss) for the aim guide.
 * Returns points every ~0.25 m until the head pin or the gutter.
 */
export function predictPath(t: ThrowParams, cond: FrameConditions, out: THREE.Vector3[] = []): THREE.Vector3[] {
  out.length = 0
  let x = t.x
  let z = 0
  let vx = Math.sin(t.angle) * t.speed
  const vz = -Math.cos(t.angle) * t.speed
  const dt = 1 / 120
  let acc = 0
  out.push(new THREE.Vector3(x, BALL.radius, z))
  for (let i = 0; i < 1200; i += 1) {
    vx += laneAccel(-z, t.spin, cond) * dt
    x += vx * dt
    z += vz * dt
    acc += Math.hypot(vx, vz) * dt
    if (acc >= 0.25) {
      acc = 0
      out.push(new THREE.Vector3(x, BALL.radius, z))
    }
    if (Math.abs(x) > LANE.width / 2 || -z > LANE.headPin + 0.9) break
  }
  out.push(new THREE.Vector3(x, BALL.radius, z))
  return out
}

/**
 * The physical bowling lane. Owns one Rapier world (via the template `Physics`) with the lane,
 * gutters, kickbacks, pit, ten pins and the ball. Runs headless too (tuning script, tests).
 */
export class BowlingSim {
  readonly physics: Physics
  readonly ball: RAPIER.RigidBody
  readonly ballObject = new THREE.Object3D()
  readonly pins: Pin[] = []
  readonly hits: Hit[] = []
  private tags = new Map<number, Tag>()
  cond: FrameConditions = { oil: 11, drift: 0, guide: 1, hookScale: 1 }
  spin = 0
  rolling = false
  /** Sim seconds since release. */
  t = 0
  /** Sim time of the first ball–pin contact, or -1. */
  impactAt = -1
  /** Sim time the ball first entered the gutter, or -1. */
  gutterAt = -1
  private calm = 0
  private ballGone = -1
  private hookOn = true
  private pinCooldown: number[] = []
  private releaseRack: Array<{ position: RAPIER.Vector; rotation: RAPIER.Rotation }> = []

  constructor() {
    this.physics = new Physics(-9.81)
    this.physics.substeps = SIM.substeps
    // Solver tolerances follow the smallest gameplay bodies (~10 cm), not metre-sized props.
    // The default metre scale can destabilise a narrow pin base before any impact.
    this.physics.world.integrationParameters.lengthUnit = 0.1
    this.physics.world.integrationParameters.numSolverIterations = SIM.solverIterations
    this.physics.events = new RAPIER.EventQueue(false)
    this.physics.beforeSubstep = sub => this.applyLaneForces(sub)
    this.buildLane()
    for (const spot of PIN_SPOTS) this.pins.push(this.makePin(spot.number - 1))
    this.pinCooldown = this.pins.map(() => 0)
    this.ball = this.makeBall()
    this.rack(true)
  }

  private tag(c: RAPIER.Collider, t: Tag): RAPIER.Collider {
    this.tags.set(c.handle, t)
    return c
  }

  private box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, friction: number, kind: 'wall' | 'floor', restitution = 0.1): void {
    const desc = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setCollisionGroups((1 << 16) | 7)
      .setTranslation(cx, cy, cz)
      .setFriction(friction)
      .setRestitution(restitution)
    this.tag(this.physics.world.createCollider(desc), { kind })
  }

  private buildLane(): void {
    const w = LANE.width
    const deckStart = LANE.headPin - 0.45
    const laneLen = LANE.approach + deckStart
    // Lane bed (oily wood): top surface at y = 0.
    this.box(0, -0.1, (LANE.approach - deckStart) / 2, w, 0.2, laneLen, BALL.friction, 'floor')
    // Pin deck: grippier so pins do not skate forever.
    this.box(0, -0.1, -(deckStart + LANE.deckEnd) / 2, w, 0.2, LANE.deckEnd - deckStart, 0.42, 'floor')
    // Gutters run the whole lane and past the deck into the pit.
    const gw = LANE.gutterWidth
    const gz0 = LANE.approach * 0 + 0.4
    const gLen = LANE.deckEnd + gz0
    for (const s of [-1, 1]) {
      const gx = s * (w / 2 + gw / 2)
      this.box(gx, -LANE.gutterDepth - 0.1, gz0 - gLen / 2, gw, 0.2, gLen, 0.2, 'floor')
      // Low divider between lanes along the gutter.
      this.box(s * (w / 2 + gw + 0.02), 0.02, gz0 - LANE.kickbackStart / 2, 0.04, 0.22, LANE.kickbackStart + 0.8, 0.2, 'wall')
      // Kickback walls around the deck and pit.
      const kLen = LANE.pitEnd - LANE.kickbackStart
      this.box(s * (w / 2 + gw + 0.03), LANE.kickbackHeight / 2 - 0.1, -(LANE.kickbackStart + kLen / 2), 0.06, LANE.kickbackHeight + 0.2, kLen, 0.3, 'wall', 0.35)
    }
    // Pit floor, back cushion and a lip catching anything that flies high.
    const pitLen = LANE.pitEnd - LANE.deckEnd
    this.box(0, -LANE.pitDepth - 0.1, -(LANE.deckEnd + pitLen / 2), w + gw * 2 + 0.1, 0.2, pitLen, 0.6, 'floor')
    this.box(0, 0.3, -LANE.pitEnd - 0.1, w + gw * 2 + 0.1, 1.8, 0.2, 0.8, 'wall', 0.05)
    this.box(0, 1.05, -(LANE.deckEnd + 0.5), w + gw * 2 + 0.1, 0.1, 1.8, 0.5, 'wall', 0.05)
  }

  private makePin(index: number): Pin {
    const object = new THREE.Object3D()
    const body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(PIN.mass, { x: 0, y: PIN.com, z: 0 }, { x: 0.0185, y: 0.0021, z: 0.0185 }, { x: 0, y: 0, z: 0, w: 1 })
        .setLinearDamping(0.05)
        .setAngularDamping(0.25)
        .setCcdEnabled(true)
        .setCanSleep(true),
    )
    for (const [a, b] of [[0, 0.24], [0.24, 0.381]] as const) {
      const hull = RAPIER.ColliderDesc.convexHull(pinHullPoints(a, b))
      if (!hull) throw new Error('pin hull failed')
      hull.setDensity(0).setCollisionGroups((4 << 16) | 7).setFriction(PIN.friction).setRestitution(PIN.restitution).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(30)
      this.tag(this.physics.world.createCollider(hull, body), { kind: 'pin', index })
    }
    this.physics.bind(body, object)
    return { index, body, object, active: true, maxTilt: 0, touched: false }
  }

  private makeBall(): RAPIER.RigidBody {
    const body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, BALL.radius, 0.4).setLinearDamping(0.02).setAngularDamping(0.05).setCcdEnabled(true),
    )
    const desc = RAPIER.ColliderDesc.ball(BALL.radius)
      .setCollisionGroups((2 << 16) | 5)
      .setMass(BALL.mass)
      .setFriction(BALL.friction)
      .setRestitution(BALL.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(60)
    this.tag(this.physics.world.createCollider(desc, body), { kind: 'ball' })
    this.physics.bind(body, this.ballObject)
    body.setEnabled(false)
    return body
  }

  /**
   * Set pins for the next ball. `fresh` sets a full rack; otherwise pins that are still standing
   * are straightened where they stand and every fallen pin is swept away.
   */
  rack(fresh: boolean): void {
    const standing = this.standing()
    for (const pin of this.pins) {
      const spot = PIN_SPOTS[pin.index]
      const keep = fresh || standing[pin.index]
      pin.maxTilt = 0
      pin.touched = false
      if (!keep) {
        pin.active = false
        pin.body.setEnabled(false)
        pin.body.setTranslation({ x: spot.x, y: -3, z: spot.z }, false)
        pin.object.visible = false
        this.physics.snap(pin.body)
        continue
      }
      const t = pin.body.translation()
      const x = fresh ? spot.x : t.x
      const z = fresh ? spot.z : t.z
      pin.active = true
      pin.object.visible = true
      pin.body.setEnabled(true)
      pin.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false)
      pin.body.setTranslation({ x, y: 0.0005, z }, false)
      pin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
      pin.body.setLinvel({ x: 0, y: 0, z: 0 }, false)
      pin.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
      pin.body.sleep()
      this.physics.snap(pin.body)
    }
  }

  /** Park the ball (disabled) at the approach; rendering places it while aiming. */
  holdBall(x: number): void {
    this.rolling = false
    this.ball.setEnabled(false)
    this.ball.setTranslation({ x, y: BALL.radius, z: 0.35 }, false)
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, false)
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, false)
    this.physics.snap(this.ball)
  }

  release(p: ThrowParams, cond: FrameConditions): void {
    this.cond = cond
    this.spin = Math.max(-1, Math.min(1, p.spin))
    this.t = 0
    this.impactAt = -1
    this.gutterAt = -1
    this.ballGone = -1
    this.calm = 0
    this.hookOn = true
    this.hits.length = 0
    this.releaseRack = this.pins.map(pin => ({ position: { ...pin.body.translation() }, rotation: { ...pin.body.rotation() } }))
    const vx = Math.sin(p.angle) * p.speed
    const vz = -Math.cos(p.angle) * p.speed
    this.ball.setEnabled(true)
    this.ball.collider(0).setCollisionGroups((2 << 16) | 5)
    this.ball.setTranslation({ x: p.x, y: BALL.radius + 0.002, z: 0.05 }, true)
    this.ball.setLinvel({ x: vx, y: 0, z: vz }, true)
    // Mostly rolling forward with some side rotation for the look of a hook ball.
    const roll = p.speed / BALL.radius
    this.ball.setAngvel({ x: -roll * 0.8, y: -this.spin * 14, z: 0 }, true)
    this.physics.snap(this.ball)
    // Pins wake through physical contact; waking an untouched rack introduces solver jitter.
    this.rolling = true
  }

  private applyLaneForces(sub: number): void {
    if (!this.rolling || !this.ball.isEnabled()) return
    const p = this.ball.translation()
    if (this.gutterAt < 0 && Math.abs(p.x) > LANE.width / 2 + BALL.radius * 0.35 && -p.z < LANE.headPin - 0.3) {
      this.gutterAt = this.t
      this.hookOn = false
      // A gutter ball is dead: it may roll in the channel but cannot score through ricochets.
      this.ball.collider(0).setCollisionGroups((2 << 16) | 1)
      // Preserve the pre-roll rack even if a pin was disturbed by solver settling.
      for (const pin of this.pins) if (pin.active) {
        const pose = this.releaseRack[pin.index]
        pin.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
        pin.body.setTranslation(pose.position, false)
        pin.body.setRotation(pose.rotation, false)
        pin.body.setLinvel({ x: 0, y: 0, z: 0 }, false)
        pin.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
        this.physics.snap(pin.body)
      }
    }
    const onLane = Math.abs(p.x) < LANE.width / 2 - 0.01 && p.y > BALL.radius * 0.6 && -p.z < LANE.headPin - 0.5
    if (!onLane || !this.hookOn) return
    const a = laneAccel(-p.z, this.spin, this.cond)
    this.ball.applyImpulse({ x: BALL.mass * a * sub, y: 0, z: 0 }, true)
  }

  /** Advance one fixed step; returns true once the ball is finished and every pin is calm. */
  step(dt: number): boolean {
    this.physics.step(dt)
    this.drainEvents()
    for (let i = 0; i < this.pinCooldown.length; i += 1) this.pinCooldown[i] = Math.max(0, this.pinCooldown[i] - dt)
    if (!this.rolling) return false
    this.t += dt
    const bp = this.ball.translation()
    if (this.ballGone < 0 && (-bp.z > LANE.deckEnd + 0.2 || bp.y < -0.25 || (this.t > 1 && this.ball.linvel().z > -0.3))) this.ballGone = this.t
    let moving = false
    for (const pin of this.pins) {
      if (!pin.active) continue
      const r = pin.body.rotation()
      tmpQ.set(r.x, r.y, r.z, r.w)
      const tilt = Math.acos(Math.min(1, tmpV.copy(UP).applyQuaternion(tmpQ).y))
      if (tilt > pin.maxTilt) pin.maxTilt = tilt
      const v = pin.body.linvel()
      const w = pin.body.angvel()
      if (Math.hypot(v.x, v.y, v.z) > 0.06 || Math.hypot(w.x, w.y, w.z) > 0.6) moving = true
    }
    const started = this.impactAt >= 0 || this.ballGone >= 0
    if (started && !moving) this.calm += dt
    else this.calm = 0
    const since = this.impactAt >= 0 ? this.t - this.impactAt : this.ballGone >= 0 ? this.t - this.ballGone : 0
    const ballDone = this.ballGone >= 0 || this.impactAt >= 0 && this.t - this.impactAt > 1.2
    if (ballDone && (this.calm > SIM.settleCalm || since > SIM.settleMax)) return true
    return this.t > SIM.rollMax
  }

  private drainEvents(): void {
    const q = this.physics.events
    if (!q) return
    q.drainContactForceEvents(e => {
      const a = this.tags.get(e.collider1())
      const b = this.tags.get(e.collider2())
      if (!a || !b) return
      const force = e.totalForceMagnitude()
      const pinTag = a.kind === 'pin' ? a : b.kind === 'pin' ? b : undefined
      const other = pinTag === a ? b : a
      let kind: HitKind | undefined
      if (a.kind === 'ball' || b.kind === 'ball') {
        const o = a.kind === 'ball' ? b : a
        if (o.kind === 'pin') kind = 'ballPin'
        else if (o.kind === 'wall') kind = 'ballWall'
      } else if (pinTag) {
        kind = other.kind === 'pin' ? 'pinPin' : other.kind === 'wall' ? 'pinWall' : 'pinFloor'
      }
      if (!kind) return
      const index = pinTag && pinTag.kind === 'pin' ? pinTag.index : -1
      if (index >= 0) {
        this.pins[index].touched = true
        if (other.kind === 'pin') this.pins[other.index].touched = true
      }
      if (kind === 'ballPin' && this.impactAt < 0) {
        this.impactAt = this.t
        this.hookOn = false
      }
      if (index >= 0 && this.pinCooldown[index] > 0 && kind !== 'ballPin') return
      if (index >= 0) this.pinCooldown[index] = 0.06
      const pos = index >= 0 ? this.pins[index].body.translation() : this.ball.translation()
      this.hits.push({ kind, force, x: pos.x, y: pos.y, z: pos.z, pin: index })
    })
    if (this.hits.length > 64) this.hits.splice(0, this.hits.length - 64)
  }

  /** Which of the ten pins are standing (upright and still on the deck). */
  standing(): boolean[] {
    return this.pins.map(pin => {
      if (!pin.active) return false
      const t = pin.body.translation()
      const r = pin.body.rotation()
      tmpQ.set(r.x, r.y, r.z, r.w)
      const up = tmpV.copy(UP).applyQuaternion(tmpQ).y
      const onDeck = t.y > -0.03 && t.y < 0.05 && Math.abs(t.x) < LANE.width / 2 + 0.01 && -t.z < LANE.deckEnd && -t.z > LANE.headPin - 1.5
      return up > PIN.uprightDot && onDeck
    })
  }

  /** Pins knocked down by the ball just rolled (standing before, not standing now). */
  countDown(before: readonly boolean[]): number {
    if (this.gutterAt >= 0) return 0
    const now = this.standing()
    return before.reduce((n, was, i) => n + (was && !now[i] ? 1 : 0), 0)
  }

  sync(alpha: number): void {
    this.physics.sync(alpha)
  }

  /** Freeze the counted rack until the pinsetter handles it. */
  finishRoll(): void {
    this.rolling = false
    this.ball.setEnabled(false)
    for (const pin of this.pins) if (pin.active) {
      pin.body.setLinvel({ x: 0, y: 0, z: 0 }, false)
      pin.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
      pin.body.sleep()
    }
  }

  dispose(): void {
    this.physics.events?.free()
    this.physics.dispose()
  }
}
