import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BALL, LANE } from './config'
import { PIN_PROFILE, PIN_SPOTS } from './pinshape'
import { ScoreScreen } from './screen'
import { carpetTexture, laneTexture, neonSign, wallTexture } from './textures'

export const PALETTES = [
  { a: '#ff4fa3', b: '#39e6ff', c: '#ffd23f', d: '#8a5cff' },
  { a: '#ff5e3a', b: '#35f0c9', c: '#ffe066', d: '#b04dff' },
  { a: '#ff3d7f', b: '#4dc3ff', c: '#b6ff4d', d: '#ff9d2e' },
  { a: '#e64dff', b: '#3dffb5', c: '#ffd23f', d: '#4d7bff' },
]

const PITCH = LANE.width + LANE.gutterWidth * 2 + 0.34
const WALL_X = PITCH * 2 + 1.35
const CEIL = 3.5

/** Emissive colour strong enough to bloom (HDR > 1). */
function neon(color: string, strength = 3): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color).multiplyScalar(strength)
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false })
}

export function pinGeometry(segments = 12): THREE.BufferGeometry {
  const pts = PIN_PROFILE.map(([h, r]) => new THREE.Vector2(r, h))
  const geo = new THREE.LatheGeometry(pts, segments).toNonIndexed()
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const white = new THREE.Color('#fbf6ee')
  const red = new THREE.Color('#e8203f')
  for (let i = 0; i < pos.count; i += 3) {
    const h = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const stripe = (h > 0.247 && h < 0.262) || (h > 0.272 && h < 0.286)
    const col = stripe ? red : white
    for (let k = 0; k < 3; k += 1) col.toArray(colors, (i + k) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

export function pinMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, flatShading: true, envMapIntensity: 0.7 })
}

/** Low-poly glossy ball with a swirl and three finger holes. */
export function ballMesh(color: string, accent: string): THREE.Group {
  const geo = new THREE.IcosahedronGeometry(BALL.radius, 2).toNonIndexed()
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const a = new THREE.Color(color)
  const b = new THREE.Color(accent)
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const swirl = Math.sin(x * 38 + Math.sin(y * 27) * 2.2 + z * 19)
    tmp.copy(a).lerp(b, swirl > 0.35 ? 0.85 : swirl > -0.2 ? 0.25 : 0)
    for (let k = 0; k < 3; k += 1) tmp.toArray(colors, (i + k) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.15, flatShading: true, envMapIntensity: 1.3 }))
  mesh.castShadow = true
  group.add(mesh)
  const holeMat = new THREE.MeshBasicMaterial({ color: '#0b0614' })
  const hole = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8)
  const dirs = [new THREE.Vector3(-0.28, 0.93, 0.2), new THREE.Vector3(0.28, 0.93, 0.2), new THREE.Vector3(0, 0.86, -0.5)]
  for (const d of dirs) {
    d.normalize()
    const h = new THREE.Mesh(hole, holeMat)
    h.position.copy(d).multiplyScalar(BALL.radius - 0.002)
    h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
    group.add(h)
  }
  return group
}

type Figure = { x: number; z: number; y: number; phase: number; seat: boolean; scale: number; rot: number }

export class Alley {
  readonly group = new THREE.Group()
  readonly screen = new ScoreScreen()
  readonly sweep: THREE.Mesh
  readonly pinDeckLight: THREE.SpotLight
  readonly key: THREE.DirectionalLight
  private neonMats: { mat: THREE.MeshBasicMaterial; base: THREE.Color; phase: number }[] = []
  private beams: THREE.Mesh[] = []
  private beamLights: THREE.SpotLight[] = []
  private crowd!: THREE.InstancedMesh
  private figures: Figure[] = []
  private dummy = new THREE.Object3D()
  private hype = 0
  private flash = 0
  private flashColor = new THREE.Color()
  private time = 0
  readonly palette: (typeof PALETTES)[number]

  constructor(scene: THREE.Scene, paletteIndex: number, shadowMap: number) {
    this.palette = PALETTES[paletteIndex % PALETTES.length]
    const p = this.palette
    scene.background = new THREE.Color('#07041a')
    scene.fog = new THREE.Fog('#07041a', 16, 34)
    scene.add(this.group)
    this.buildEnvironment(scene)

    const laneTex = laneTexture(LANE.deckEnd)
    const approachTex = laneTexture(LANE.approach, true)
    const laneMat = new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.2, metalness: 0, envMapIntensity: 1.1 })
    const approachMat = new THREE.MeshStandardMaterial({ map: approachTex, roughness: 0.35, metalness: 0, envMapIntensity: 0.6 })
    const gutterMat = new THREE.MeshStandardMaterial({ color: '#2b2547', roughness: 0.35, metalness: 0.65, flatShading: true, side: THREE.DoubleSide })
    const capMat = new THREE.MeshStandardMaterial({ color: '#3b2a6e', roughness: 0.5, metalness: 0.1, flatShading: true })
    const deckMat = new THREE.MeshStandardMaterial({ color: '#e9cf9e', roughness: 0.3, envMapIntensity: 0.8 })
    const pinGeo = pinGeometry(10)
    const pinMat = pinMaterial()

    for (let lane = -2; lane <= 2; lane += 1) {
      const ox = lane * PITCH
      const main = lane === 0
      const laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width, LANE.deckEnd), laneMat)
      laneMesh.rotation.x = -Math.PI / 2
      laneMesh.position.set(ox, 0, -LANE.deckEnd / 2)
      laneMesh.receiveShadow = main
      this.group.add(laneMesh)
      const appr = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width + LANE.gutterWidth * 2 + 0.34, LANE.approach), approachMat)
      appr.rotation.x = -Math.PI / 2
      appr.position.set(ox, 0.001, LANE.approach / 2)
      appr.receiveShadow = main
      this.group.add(appr)
      // Gutters: low-poly half pipes.
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(LANE.gutterWidth / 2, LANE.gutterWidth / 2, LANE.deckEnd + 0.4, 6, 1, true, Math.PI / 2, Math.PI)
        const gm = new THREE.Mesh(g, gutterMat)
        gm.rotation.x = -Math.PI / 2
        gm.position.set(ox + s * (LANE.width / 2 + LANE.gutterWidth / 2), 0.0, -(LANE.deckEnd + 0.4) / 2 + 0.2)
        gm.scale.set(1, 1, (LANE.gutterDepth + 0.01) / (LANE.gutterWidth / 2))
        gm.receiveShadow = main
        this.group.add(gm)
      }
      // Capping between lanes with a neon strip on top.
      for (const s of [-1, 1]) {
        const cx = ox + s * (LANE.width / 2 + LANE.gutterWidth + 0.085)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, LANE.headPin - 1), capMat)
        cap.position.set(cx, 0.03, -(LANE.headPin - 1) / 2)
        this.group.add(cap)
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, LANE.headPin - 1), this.track(neon(s < 0 ? p.a : p.b, main ? 3.2 : 1.6), lane + s))
        strip.position.set(cx, 0.076, -(LANE.headPin - 1) / 2)
        this.group.add(strip)
      }
      // Pin deck insert and pit.
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width, LANE.deckEnd - LANE.headPin + 0.5), deckMat)
      deck.rotation.x = -Math.PI / 2
      deck.position.set(ox, 0.001, -(LANE.headPin - 0.5 + LANE.deckEnd) / 2)
      deck.receiveShadow = main
      this.group.add(deck)
      const pit = new THREE.Mesh(new THREE.BoxGeometry(PITCH - 0.1, 0.1, LANE.pitEnd - LANE.deckEnd), new THREE.MeshStandardMaterial({ color: '#0a0714', roughness: 1 }))
      pit.position.set(ox, -LANE.pitDepth, -(LANE.deckEnd + LANE.pitEnd) / 2)
      this.group.add(pit)
      // Kickback walls.
      for (const s of [-1, 1]) {
        const kb = new THREE.Mesh(new THREE.BoxGeometry(0.06, LANE.kickbackHeight + 0.2, LANE.pitEnd - LANE.kickbackStart), new THREE.MeshStandardMaterial({ color: main ? '#2a1d52' : '#1d1540', roughness: 0.6, flatShading: true }))
        kb.position.set(ox + s * (LANE.width / 2 + LANE.gutterWidth + 0.03), LANE.kickbackHeight / 2 - 0.1, -(LANE.kickbackStart + LANE.pitEnd) / 2)
        this.group.add(kb)
        const kstrip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.03, LANE.pitEnd - LANE.kickbackStart), this.track(neon(p.c, main ? 2.4 : 1.2), lane * 2 + s))
        kstrip.position.set(kb.position.x, LANE.kickbackHeight - 0.02, kb.position.z)
        this.group.add(kstrip)
      }
      // Neighbour lanes get a static rack (a few pins down for life).
      if (!main) {
        const inst = new THREE.InstancedMesh(pinGeo, pinMat, 10)
        PIN_SPOTS.forEach((spot, i) => {
          const down = (lane * 7 + i * 3) % 11 === 0
          this.dummy.position.set(ox + spot.x, down ? 0.06 : 0, spot.z)
          this.dummy.rotation.set(down ? Math.PI / 2 : 0, (i * 1.7) % 3, 0)
          this.dummy.updateMatrix()
          inst.setMatrixAt(i, this.dummy.matrix)
        })
        this.group.add(inst)
      }
    }

    // Foul line glow strip across our lane.
    const foul = new THREE.Mesh(new THREE.BoxGeometry(LANE.width + LANE.gutterWidth * 2, 0.006, 0.03), this.track(neon('#ff2f6d', 3), 0))
    foul.position.set(0, 0.004, 0)
    this.group.add(foul)

    // Masking unit above the pin decks with a neon sign over our lane.
    const mask = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 1.9, 0.5), new THREE.MeshStandardMaterial({ color: '#150c33', roughness: 0.8, flatShading: true }))
    mask.position.set(0, 1.0 + 0.95 + 0.1, -LANE.headPin + 0.2)
    this.group.add(mask)
    const signTex = neonSign([
      { text: '好球保龄', color: p.a, size: 150 },
      { text: 'STRIKE BOWL', color: p.b, size: 72, font: "'Sora', sans-serif" },
    ], 1024, 400)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.02), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }))
    sign.position.set(0, 2.0, -LANE.headPin + 0.46)
    this.group.add(sign)
    for (const lane of [-2, -1, 1, 2]) {
      const num = neonSign([{ text: String(lane + 8), color: lane % 2 ? p.c : p.d, size: 200, font: "'Sora', sans-serif" }], 256, 256)
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: num, transparent: true, toneMapped: false }))
      plate.position.set(lane * PITCH, 2.0, -LANE.headPin + 0.46)
      this.group.add(plate)
    }
    // Soft pin-deck glow under the masking unit.
    const glow = new THREE.Mesh(new THREE.BoxGeometry(WALL_X * 2, 0.03, 0.05), this.track(neon(p.b, 2.2), 2))
    glow.position.set(0, 1.04, -LANE.headPin + 0.46)
    this.group.add(glow)

    // Pinsetter sweep bar (animated by the game between balls).
    this.sweep = new THREE.Mesh(new THREE.BoxGeometry(LANE.width + LANE.gutterWidth * 2 + 0.05, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: '#c9c2e8', roughness: 0.4, metalness: 0.6, flatShading: true }))
    this.sweep.position.set(0, 1.25, -LANE.headPin + 0.35)
    this.group.add(this.sweep)
    const sweepStrip = new THREE.Mesh(new THREE.BoxGeometry(LANE.width + LANE.gutterWidth * 2, 0.03, 0.055), this.track(neon(p.a, 2.5), 5))
    sweepStrip.position.y = -0.06
    this.sweep.add(sweepStrip)

    // Hanging scoreboard monitor over the lane.
    const screenGroup = new THREE.Group()
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.62, 1.36, 0.12), new THREE.MeshStandardMaterial({ color: '#1e1540', roughness: 0.5, flatShading: true }))
    screenGroup.add(frame)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }))
    face.position.z = 0.065
    screenGroup.add(face)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.03, 0.13), this.track(neon(p.a, 3), 1))
    edge.position.y = -0.69
    screenGroup.add(edge)
    for (const s of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 5), capMat)
      rod.position.set(s * 1.0, 1.25, 0)
      screenGroup.add(rod)
    }
    screenGroup.position.set(0, 2.62, -8.6)
    screenGroup.rotation.x = 0.08
    this.group.add(screenGroup)

    // Ball return between our lane and the right neighbour.
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 7, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#2e1e66', roughness: 0.4, metalness: 0.3, flatShading: true }))
    hood.rotation.z = Math.PI / 2
    hood.rotation.y = Math.PI / 2
    hood.position.set(PITCH / 2, 0.36, 1.8)
    this.group.add(hood)
    const rackGeo = new THREE.BoxGeometry(0.34, 0.08, 1.4)
    const rack = new THREE.Mesh(rackGeo, capMat)
    rack.position.set(PITCH / 2, 0.38, 3.0)
    this.group.add(rack)
    const cols = [[p.a, p.d], [p.b, '#1b3a8a'], [p.c, '#ff6b2e'], ['#2b2b2b', p.a]]
    cols.forEach(([c1, c2], i) => {
      const b = ballMesh(c1, c2)
      b.position.set(PITCH / 2, 0.42 + BALL.radius, 2.5 + i * 0.3)
      b.rotation.set(i, i * 2, 0)
      this.group.add(b)
    })

    // Lighting.
    scene.add(new THREE.HemisphereLight('#8a7cff', '#1b0d2e', 0.7))
    this.key = new THREE.DirectionalLight('#fff1dc', 1.5)
    this.key.position.set(0.8, 9, -7)
    this.key.target.position.set(0, 0, -9)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(shadowMap, shadowMap)
    const cam = this.key.shadow.camera
    cam.left = -1.6
    cam.right = 1.6
    cam.top = 13
    cam.bottom = -13
    cam.near = 1
    cam.far = 20
    this.key.shadow.bias = -0.0008
    this.key.shadow.normalBias = 0.02
    scene.add(this.key, this.key.target)
    this.pinDeckLight = new THREE.SpotLight('#fff4e0', 7, 6, 0.7, 0.5, 1.2)
    this.pinDeckLight.position.set(0, 1.0, -LANE.headPin + 0.3)
    this.pinDeckLight.target.position.set(0, 0, -LANE.headPin - 0.6)
    scene.add(this.pinDeckLight, this.pinDeckLight.target)
    const fillA = new THREE.PointLight(p.a, 6, 12, 1.4)
    fillA.position.set(-WALL_X + 0.6, 2.4, -5)
    const fillB = new THREE.PointLight(p.b, 6, 12, 1.4)
    fillB.position.set(WALL_X - 0.6, 2.4, -11)
    scene.add(fillA, fillB)
    // Strike show: two coloured moving spotlights with fake volumetric beams.
    for (const [i, col] of [p.a, p.b].entries()) {
      const s = new THREE.SpotLight(col, 0, 16, 0.22, 0.4, 1)
      s.position.set((i ? 1 : -1) * 2.2, CEIL - 0.1, -12)
      s.target.position.set(0, 0, -LANE.headPin)
      scene.add(s, s.target)
      this.beamLights.push(s)
      const beamGeo = new THREE.ConeGeometry(0.9, 8, 10, 1, true)
      beamGeo.translate(0, -4, 0)
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
      beam.position.copy(s.position)
      this.group.add(beam)
      this.beams.push(beam)
    }
  }

  private track(mat: THREE.MeshBasicMaterial, phase: number): THREE.MeshBasicMaterial {
    this.neonMats.push({ mat, base: mat.color.clone(), phase })
    return mat
  }

  private buildEnvironment(_scene: THREE.Scene): void {
    const p = this.palette
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, 16), new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 0.95 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -0.005, 7)
    this.group.add(floor)
    // Side floor strips along the lanes (walkways).
    const walkMat = new THREE.MeshStandardMaterial({ color: '#140b2c', roughness: 0.9 })
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 22), walkMat)
      walk.rotation.x = -Math.PI / 2
      walk.position.set(s * (WALL_X - 0.6), 0.002, -9)
      this.group.add(walk)
    }
    // Walls with retro neon murals.
    const wallTex = wallTexture(7, [p.a, p.b, p.c, p.d])
    wallTex.repeat.set(3, 1)
    const wallMat = new THREE.MeshBasicMaterial({ map: wallTex, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false })
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, CEIL), wallMat)
      wall.position.set(s * WALL_X, CEIL / 2, -6)
      wall.rotation.y = -s * Math.PI / 2
      this.group.add(wall)
      // Neon tube running the length of each wall.
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 34), this.track(neon(s < 0 ? p.b : p.a, 3.5), s * 3))
      tube.position.set(s * (WALL_X - 0.05), CEIL - 0.3, -6)
      this.group.add(tube)
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, CEIL + 1), new THREE.MeshStandardMaterial({ color: '#0a0619', roughness: 1 }))
    back.position.set(0, CEIL / 2, -LANE.pitEnd - 0.3)
    this.group.add(back)
    // Ceiling with rows of light panels (low poly boxes).
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, 34), new THREE.MeshStandardMaterial({ color: '#0d0822', roughness: 1 }))
    ceil.rotation.x = Math.PI / 2
    ceil.position.set(0, CEIL, -6)
    this.group.add(ceil)
    const panels: THREE.BufferGeometry[] = []
    for (let z = 6; z > -16; z -= 3.2) {
      for (const x of [-PITCH * 1.5, -PITCH * 0.5, PITCH * 0.5, PITCH * 1.5]) {
        const g = new THREE.BoxGeometry(0.9, 0.04, 0.5)
        g.translate(x, CEIL - 0.03, z)
        panels.push(g)
      }
    }
    const panelMesh = new THREE.Mesh(mergeGeometries(panels), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9c7').multiplyScalar(1.6), toneMapped: false }))
    this.group.add(panelMesh)
    // Ceiling neon zigzag above the lanes.
    const zig: THREE.BufferGeometry[] = []
    for (let i = 0; i < 12; i += 1) {
      const g = new THREE.BoxGeometry(0.035, 0.035, 1.2)
      g.rotateY(i % 2 ? 0.6 : -0.6)
      g.translate(0, CEIL - 0.08, 4 - i * 1.0)
      zig.push(g)
    }
    const zigMesh = new THREE.Mesh(mergeGeometries(zig), this.track(neon(p.d, 3), 9))
    for (const x of [-PITCH, PITCH]) {
      const z = zigMesh.clone()
      z.position.x = x
      this.group.add(z)
    }

    // Crowd silhouettes along the walkways and on benches behind the approach.
    const body = new THREE.CylinderGeometry(0.17, 0.22, 0.95, 6)
    body.translate(0, 0.62, 0)
    const head = new THREE.IcosahedronGeometry(0.14, 0)
    head.translate(0, 1.26, 0)
    const armL = new THREE.BoxGeometry(0.08, 0.5, 0.08)
    armL.translate(-0.24, 0.85, 0)
    const armR = armL.clone()
    armR.translate(0.48, 0, 0)
    const fig = mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), armL.toNonIndexed(), armR.toNonIndexed()])
    let seed = 3
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i += 1) this.figures.push({ x: s * (WALL_X - 0.45 - rnd() * 0.5), z: 1.5 - i * 1.7 - rnd() * 0.6, y: 0, phase: rnd() * 6, seat: false, scale: 0.9 + rnd() * 0.25, rot: -s * (1.1 + rnd() * 0.4) })
    }
    for (let i = 0; i < 14; i += 1) this.figures.push({ x: -WALL_X + 0.8 + i * ((WALL_X * 2 - 1.6) / 13) + (rnd() - 0.5) * 0.3, z: 6.8 + rnd() * 0.8, y: 0, phase: rnd() * 6, seat: true, scale: 0.9 + rnd() * 0.2, rot: Math.PI })
    this.crowd = new THREE.InstancedMesh(fig, new THREE.MeshStandardMaterial({ color: '#150a2e', roughness: 0.9, emissive: new THREE.Color(p.d).multiplyScalar(0.08), flatShading: true }), this.figures.length)
    this.group.add(this.crowd)
    this.updateCrowd(0)

    // Environment map for glossy reflections: dark room with neon strips.
    const envScene = new THREE.Scene()
    envScene.background = new THREE.Color('#06030f')
    const strips: [string, THREE.Vector3, THREE.Vector3][] = [
      [p.a, new THREE.Vector3(-5, 2.5, 0), new THREE.Vector3(0.3, 0.3, 30)],
      [p.b, new THREE.Vector3(5, 2.5, 0), new THREE.Vector3(0.3, 0.3, 30)],
      ['#fff1dc', new THREE.Vector3(0, 4.5, 0), new THREE.Vector3(3, 0.2, 18)],
      [p.c, new THREE.Vector3(0, 1.5, -12), new THREE.Vector3(8, 0.6, 0.3)],
    ]
    for (const [c, at, size] of strips) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2) }))
      m.position.copy(at)
      envScene.add(m)
    }
    this.envScene = envScene
  }

  envScene?: THREE.Scene

  /** Build the reflection map once a renderer exists. */
  bakeEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.envScene) return
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(this.envScene, 0.03).texture
    pmrem.dispose()
    this.envScene = undefined
  }

  /** Crowd excitement 0..1 (decays), and a colour flash for the strike show. */
  cheer(amount: number): void {
    this.hype = Math.max(this.hype, amount)
  }

  flashLights(color: THREE.ColorRepresentation, amount = 1): void {
    this.flash = Math.max(this.flash, amount)
    this.flashColor.set(color)
  }

  private updateCrowd(t: number): void {
    this.figures.forEach((f, i) => {
      const jump = this.hype * Math.max(0, Math.sin(t * 9 + f.phase)) * 0.22
      const sway = Math.sin(t * 1.3 + f.phase) * 0.04
      this.dummy.position.set(f.x, f.y + jump + (f.seat ? -0.25 : 0), f.z)
      this.dummy.rotation.set(0, f.rot + sway, sway * 0.5)
      this.dummy.scale.setScalar(f.scale)
      this.dummy.updateMatrix()
      this.crowd.setMatrixAt(i, this.dummy.matrix)
    })
    this.crowd.instanceMatrix.needsUpdate = true
  }

  update(dt: number, reducedMotion: boolean): void {
    this.time += dt
    const t = this.time
    this.hype = Math.max(0, this.hype - dt * 0.35)
    this.flash = Math.max(0, this.flash - dt * 0.9)
    this.updateCrowd(t)
    const show = this.flash
    for (const n of this.neonMats) {
      const pulse = 0.88 + 0.12 * Math.sin(t * 2.2 + n.phase)
      const chase = show > 0 && !reducedMotion ? 0.5 + 0.5 * Math.sin(t * 16 + n.phase * 1.7) : 1
      n.mat.color.copy(n.base).multiplyScalar(pulse * (1 + show * 0.9 * chase))
      if (show > 0.05) n.mat.color.lerp(this.flashColor.clone().multiplyScalar(4), show * 0.5 * chase)
    }
    this.beams.forEach((beam, i) => {
      const mat = beam.material as THREE.MeshBasicMaterial
      mat.opacity = show * 0.32
      const sweep = Math.sin(t * 2.6 + i * Math.PI) * 0.55
      beam.rotation.set(0.62 + Math.cos(t * 1.9 + i) * 0.12, 0, sweep)
      const light = this.beamLights[i]
      light.intensity = show * 90
      light.target.position.set(sweep * -3, 0, -LANE.headPin + Math.cos(t * 1.9 + i) * 2)
    })
    this.pinDeckLight.intensity = 7 + show * 9
  }
}
