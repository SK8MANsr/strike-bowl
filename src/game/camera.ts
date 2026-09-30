import * as THREE from 'three'
import { LANE } from './config'

export type CamMode = 'title' | 'stance' | 'follow' | 'impact' | 'results'

/**
 * Smoothly blends the camera between shots. Gameplay sets the mode and a few inputs (stance x,
 * ball position); the director eases position, look target and FOV, and adds trauma shake.
 */
export class CameraDirector {
  mode: CamMode = 'title'
  readonly camera: THREE.PerspectiveCamera
  private pos = new THREE.Vector3(3, 2.4, 4)
  private look = new THREE.Vector3(0, 0.5, -10)
  private fov = 50
  private trauma = 0
  private t = 0
  private impactSide = 1
  stanceX = 0
  ball = new THREE.Vector3()
  ballVel = new THREE.Vector3()
  reducedMotion = false

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.05, 80)
    this.camera.position.copy(this.pos)
  }

  set(mode: CamMode, snap = false): void {
    if (mode === 'impact' && this.mode !== 'impact') this.impactSide = this.ball.x > 0 ? -1 : 1
    this.mode = mode
    if (snap) {
      const { pos, look, fov } = this.target()
      this.pos.copy(pos)
      this.look.copy(look)
      this.fov = fov
    }
  }

  shake(amount: number): void {
    if (this.reducedMotion) amount *= 0.3
    this.trauma = Math.min(1, this.trauma + amount)
  }

  private target(): { pos: THREE.Vector3; look: THREE.Vector3; fov: number; rate: number } {
    const t = this.t
    switch (this.mode) {
      case 'title': {
        const a = Math.sin(t * 0.12) * 0.55
        return {
          pos: new THREE.Vector3(Math.sin(a) * 3.2, 1.9 + Math.sin(t * 0.2) * 0.2, 4.6 - Math.cos(a) * 0.8),
          look: new THREE.Vector3(0, 0.6, -12),
          fov: 50,
          rate: 1.2,
        }
      }
      case 'stance':
        return { pos: new THREE.Vector3(this.stanceX * 0.55, 1.36, 2.85), look: new THREE.Vector3(this.stanceX * 0.2, 0, -6.2), fov: 44, rate: 5 }
      case 'follow': {
        // Chase behind the ball, then park a few metres before the rack.
        const z = Math.max(this.ball.z + 2.1, -LANE.headPin + 3.3)
        const x = THREE.MathUtils.clamp(this.ball.x * 0.7, -0.5, 0.5)
        const h = THREE.MathUtils.lerp(0.62, 0.78, THREE.MathUtils.smoothstep(-this.ball.z, 8, 15))
        return { pos: new THREE.Vector3(x, h, z), look: new THREE.Vector3(this.ball.x * 0.5, 0.18, Math.min(this.ball.z - 3.5, -LANE.headPin + 0.2)), fov: 46, rate: 7 }
      }
      case 'impact': {
        // Low, slightly to one side, close on the exploding rack.
        return {
          pos: new THREE.Vector3(this.impactSide * 0.5, 0.62, -LANE.headPin + 2.7),
          look: new THREE.Vector3(0, 0.12, -LANE.headPin - 0.45),
          fov: 44,
          rate: 3.2,
        }
      }
      case 'results': {
        const a = t * 0.1
        return { pos: new THREE.Vector3(Math.sin(a) * 0.9, 1.1, -LANE.headPin + 3.6), look: new THREE.Vector3(0, 0.4, -LANE.headPin - 0.4), fov: 48, rate: 1.5 }
      }
    }
  }

  update(dt: number): void {
    this.t += dt
    const { pos, look, fov, rate } = this.target()
    const k = 1 - Math.exp(-rate * dt)
    this.pos.lerp(pos, k)
    this.look.lerp(look, k)
    this.fov += (fov - this.fov) * k
    this.camera.position.copy(this.pos)
    this.trauma = Math.max(0, this.trauma - dt * 1.6)
    const s = this.trauma * this.trauma
    if (s > 0) {
      const n = this.t * 38
      this.camera.position.x += Math.sin(n * 1.3) * 0.06 * s
      this.camera.position.y += Math.sin(n * 1.7 + 1) * 0.045 * s
    }
    this.camera.lookAt(this.look)
    if (s > 0) this.camera.rotateZ(Math.sin(this.t * 31) * 0.02 * s)
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov
      this.camera.updateProjectionMatrix()
    }
  }
}
