import * as THREE from 'three'

type Particle = { life: number; max: number; pos: THREE.Vector3; vel: THREE.Vector3; size: number; color: THREE.Color; gravity: number; drag: number; spin: THREE.Vector3; rot: THREE.Euler }

class Pool {
  readonly mesh: THREE.InstancedMesh
  private items: Particle[] = []
  private readonly dummy = new THREE.Object3D()
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private readonly max: number, private readonly flutter = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, new THREE.Color())
  }
  add(p: Particle): void {
    if (this.items.length >= this.max) this.items.shift()
    this.items.push(p)
  }
  update(dt: number): void {
    this.items = this.items.filter(p => (p.life += dt) < p.max)
    this.items.forEach((p, i) => {
      p.vel.y += p.gravity * dt
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
      if (this.flutter) p.vel.x += Math.sin(p.life * 7 + p.size * 40) * dt * 1.4
      p.pos.addScaledVector(p.vel, dt)
      p.rot.x += p.spin.x * dt
      p.rot.y += p.spin.y * dt
      p.rot.z += p.spin.z * dt
      const k = this.flutter ? Math.min(1, (p.max - p.life) * 2) : 1 - p.life / p.max
      this.dummy.position.copy(p.pos)
      this.dummy.rotation.copy(p.rot)
      this.dummy.scale.setScalar(p.size * k)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
      this.mesh.setColorAt(i, p.color)
    })
    this.mesh.count = this.items.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
  clear(): void {
    this.items = []
    this.mesh.count = 0
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/**
 * Pooled particle effects on three InstancedMeshes (one draw call each):
 * glowing sparks, confetti and chunky shards.
 */
export class Effects {
  readonly group = new THREE.Group()
  private sparks: Pool
  private confetti: Pool
  private shards: Pool
  /** Scales particle counts (quality tiers). */
  density = 1

  constructor() {
    this.sparks = new Pool(new THREE.OctahedronGeometry(0.02, 0), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 500)
    this.confetti = new Pool(new THREE.PlaneGeometry(0.05, 0.028), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), 700, true)
    this.shards = new Pool(new THREE.TetrahedronGeometry(0.025, 0), new THREE.MeshStandardMaterial({ roughness: 0.4, flatShading: true }), 200)
    this.group.add(this.sparks.mesh, this.confetti.mesh, this.shards.mesh)
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density))
  }

  /** Impact sparks at a pin hit; strength ~0..1. */
  impact(at: THREE.Vector3, strength: number, color: THREE.ColorRepresentation = '#fff2c4'): void {
    const c = new THREE.Color(color).multiplyScalar(3)
    const count = this.n(6 + strength * 22)
    for (let i = 0; i < count; i += 1) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(0.1, 1.2), rand(-1, 1)).normalize()
      this.sparks.add({ life: 0, max: rand(0.25, 0.6), pos: at.clone(), vel: dir.multiplyScalar(rand(1.5, 4.5) * (0.5 + strength)), size: rand(0.6, 1.4), color: c, gravity: -6, drag: 2.5, spin: new THREE.Vector3(9, 7, 0), rot: new THREE.Euler() })
    }
  }

  /** White/red shards bursting off pins for the "exploding rack" look. */
  shatter(at: THREE.Vector3, strength: number): void {
    const count = this.n(3 + strength * 8)
    for (let i = 0; i < count; i += 1) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.4), rand(-1.2, 0.4)).normalize()
      this.shards.add({ life: 0, max: rand(0.5, 0.9), pos: at.clone().add(new THREE.Vector3(0, rand(0.05, 0.3), 0)), vel: dir.multiplyScalar(rand(1, 3.2) * (0.6 + strength)), size: rand(0.6, 1.3), color: new THREE.Color(i % 3 === 0 ? '#e8203f' : '#fbf6ee'), gravity: -9.8, drag: 0.6, spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)), rot: new THREE.Euler() })
    }
  }

  /** Confetti shower over an area (strike / spare / new best). */
  confettiRain(center: THREE.Vector3, spread: number, count: number, colors: string[]): void {
    const n = this.n(count)
    for (let i = 0; i < n; i += 1) {
      const pos = center.clone().add(new THREE.Vector3(rand(-spread, spread), rand(0, 0.8), rand(-spread, spread)))
      this.confetti.add({ life: 0, max: rand(2.2, 3.6), pos, vel: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.2, 0.9), rand(-0.6, 0.6)), size: rand(0.8, 1.5), color: new THREE.Color(colors[i % colors.length]).multiplyScalar(1.6), gravity: -1.1, drag: 1.4, spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), rot: new THREE.Euler(rand(0, 6), rand(0, 6), 0) })
    }
  }

  /** Radial cannon burst of confetti from a point. */
  confettiBurst(at: THREE.Vector3, count: number, colors: string[], speed = 4): void {
    const n = this.n(count)
    for (let i = 0; i < n; i += 1) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(0.4, 1.6), rand(-1, 1)).normalize()
      this.confetti.add({ life: 0, max: rand(1.8, 3), pos: at.clone(), vel: dir.multiplyScalar(rand(0.5, 1) * speed), size: rand(0.8, 1.5), color: new THREE.Color(colors[i % colors.length]).multiplyScalar(1.6), gravity: -2.2, drag: 1.6, spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), rot: new THREE.Euler(rand(0, 6), rand(0, 6), 0) })
    }
  }

  /** Soft dust ring (ball landing, gutter). */
  puff(at: THREE.Vector3, strength = 1, color = '#d9c7ff'): void {
    const c = new THREE.Color(color)
    const count = this.n(8 + strength * 8)
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2
      this.sparks.add({ life: 0, max: rand(0.3, 0.5), pos: at.clone(), vel: new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(0.8 + strength), size: rand(1.4, 2.4), color: c, gravity: 0, drag: 3, spin: new THREE.Vector3(3, 2, 0), rot: new THREE.Euler() })
    }
  }

  update(dt: number): void {
    this.sparks.update(dt)
    this.confetti.update(dt)
    this.shards.update(dt)
  }

  clear(): void {
    this.sparks.clear()
    this.confetti.clear()
    this.shards.clear()
  }
}
