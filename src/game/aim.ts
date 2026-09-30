import * as THREE from 'three'
import { BALL } from './config'

const MAX = 60

/** Glowing chevrons along the predicted path, a stance ring under the ball and an aim reticle. */
export class AimGuide {
  readonly group = new THREE.Group()
  private chevrons: THREE.InstancedMesh
  private ring: THREE.Mesh
  private arrows: THREE.Group
  private reticle: THREE.Mesh
  private dummy = new THREE.Object3D()
  private color = new THREE.Color()
  private t = 0

  constructor() {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0.06)
    shape.lineTo(0.05, -0.02)
    shape.lineTo(0.03, -0.03)
    shape.lineTo(0, 0.02)
    shape.lineTo(-0.03, -0.03)
    shape.lineTo(-0.05, -0.02)
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    this.chevrons = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), MAX)
    this.chevrons.count = 0
    this.chevrons.frustumCulled = false
    this.chevrons.setColorAt(0, new THREE.Color())
    this.group.add(this.chevrons)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(BALL.radius * 1.35, BALL.radius * 1.75, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ef9ff').multiplyScalar(2.5), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }))
    this.ring.rotation.x = -Math.PI / 2
    this.group.add(this.ring)
    this.arrows = new THREE.Group()
    const triGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.05), new THREE.Vector2(0.06, 0), new THREE.Vector2(0, -0.05)]))
    triGeo.rotateX(-Math.PI / 2)
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(triGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd35c').multiplyScalar(2), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }))
      m.position.x = s * 0.27
      m.rotation.y = s < 0 ? Math.PI : 0
      this.arrows.add(m)
    }
    this.group.add(this.arrows)
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4fa3').multiplyScalar(2.5), transparent: true, toneMapped: false, depthWrite: false }))
    this.reticle.rotation.x = -Math.PI / 2
    this.group.add(this.reticle)
  }

  /** Draw the first `fraction` of `path`; `power` tints the chevrons as the meter fills. */
  show(path: THREE.Vector3[], fraction: number, stanceX: number, power: number | null, reticle: THREE.Vector3 | null, arrows: boolean): void {
    this.group.visible = true
    const n = Math.min(MAX, Math.max(2, Math.floor(path.length * fraction)))
    let count = 0
    for (let i = 1; i < n && count < MAX; i += 1) {
      const a = path[i - 1]
      const b = path[i]
      this.dummy.position.set(b.x, 0.004, b.z)
      this.dummy.rotation.set(0, Math.atan2(-(b.x - a.x), -(b.z - a.z)), 0)
      const fade = 1 - i / n
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 7 - i * 0.55)
      this.dummy.scale.setScalar(0.9 + fade * 0.5)
      this.dummy.updateMatrix()
      this.chevrons.setMatrixAt(count, this.dummy.matrix)
      if (power === null) this.color.setRGB(0.5, 2.4, 2.6)
      else this.color.setRGB(2.6, 2.2 - power * 1.6, 0.6 + power * 1.4)
      this.color.multiplyScalar((0.25 + fade * 0.75) * pulse)
      this.chevrons.setColorAt(count, this.color)
      count += 1
    }
    this.chevrons.count = count
    this.chevrons.instanceMatrix.needsUpdate = true
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true
    this.ring.position.set(stanceX, 0.003, 0.35)
    this.arrows.position.set(stanceX, 0.004, 0.35)
    this.arrows.visible = arrows
    this.reticle.visible = !!reticle
    if (reticle) this.reticle.position.set(reticle.x, 0.005, reticle.z)
  }

  hide(): void {
    this.group.visible = false
  }

  update(dt: number): void {
    this.t += dt
    const s = 1 + Math.sin(this.t * 5) * 0.08
    this.ring.scale.setScalar(s)
    this.reticle.scale.setScalar(1.15 - s * 0.15 + 0.1)
  }
}
