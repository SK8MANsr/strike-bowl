import * as THREE from 'three'
import { PIN_SPOTS } from './pinshape'

export type ScreenState = {
  frame: number
  ball: number
  total: number
  standing: boolean[]
  /** Localised small caption, e.g. "FRAME 3 · BALL 1". */
  caption: string
  target?: string
}

export type ScreenShow = { kind: 'strike' | 'spare' | 'count' | 'gutter' | 'split' | 'final'; big: string; small: string; combo?: number }

const W = 1024
const H = 512

/**
 * The big hanging scoreboard above the lane. A canvas texture redrawn only when its content
 * changes or while an animation plays.
 */
export class ScoreScreen {
  readonly texture: THREE.CanvasTexture
  private readonly g: CanvasRenderingContext2D
  private state: ScreenState = { frame: 0, ball: 0, total: 0, standing: Array(10).fill(true), caption: '' }
  private show?: ScreenShow & { t: number }
  private dirty = true
  private acc = 0
  font = "'Noto Sans SC', 'Sora', sans-serif"

  constructor() {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    this.g = c.getContext('2d')!
    this.texture = new THREE.CanvasTexture(c)
    this.texture.colorSpace = THREE.SRGBColorSpace
  }

  set(state: Partial<ScreenState>): void {
    this.state = { ...this.state, ...state }
    this.dirty = true
  }

  play(show: ScreenShow): void {
    this.show = { ...show, t: 0 }
    this.dirty = true
  }

  clearShow(): void {
    this.show = undefined
    this.dirty = true
  }

  update(dt: number): void {
    if (this.show) {
      this.show.t += dt
      const dur = this.show.kind === 'strike' || this.show.kind === 'final' ? 3.2 : 2.2
      if (this.show.t > dur) this.show = undefined
      this.acc += dt
      if (this.acc < 1 / 30) return
      this.acc = 0
      this.dirty = true
    }
    if (!this.dirty) return
    this.dirty = false
    this.draw()
    this.texture.needsUpdate = true
  }

  private draw(): void {
    const g = this.g
    const bg = g.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#1b0f3d')
    bg.addColorStop(1, '#090518')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    // Scanlines for the retro CRT look.
    g.fillStyle = 'rgba(255,255,255,0.035)'
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2)
    g.strokeStyle = '#ff4fa3'
    g.lineWidth = 10
    g.strokeRect(10, 10, W - 20, H - 20)
    if (this.show) this.drawShow(this.show)
    else this.drawIdle()
  }

  private text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', glow = color): void {
    const g = this.g
    g.font = `900 ${size}px ${this.font}`
    g.textAlign = align
    g.textBaseline = 'middle'
    g.shadowColor = glow
    g.shadowBlur = size * 0.3
    g.lineWidth = size * 0.14
    g.strokeStyle = '#120828'
    g.strokeText(s, x, y)
    g.fillStyle = color
    g.fillText(s, x, y)
    g.shadowBlur = 0
  }

  private drawPins(cx: number, cy: number, scale: number, standing: boolean[]): void {
    const g = this.g
    for (const spot of PIN_SPOTS) {
      const x = cx + spot.x * scale
      const y = cy + (spot.z + 18.29) * scale
      const up = standing[spot.number - 1]
      g.beginPath()
      g.arc(x, y, scale * 0.1, 0, Math.PI * 2)
      g.fillStyle = up ? '#fff7e8' : 'rgba(255,255,255,0.12)'
      g.shadowColor = up ? '#7ef9ff' : 'transparent'
      g.shadowBlur = up ? 18 : 0
      g.fill()
      g.shadowBlur = 0
      if (up) {
        g.fillStyle = '#ff2f6d'
        g.fillRect(x - scale * 0.06, y - scale * 0.015, scale * 0.12, scale * 0.03)
      }
    }
  }

  private drawIdle(): void {
    const s = this.state
    this.text(s.caption, 60, 70, 44, '#7ef9ff', 'left')
    this.text(String(s.total), W - 70, 150, 150, '#ffd35c', 'right', '#ff9d2e')
    if (s.target) this.text(s.target, W - 70, 270, 38, '#ff8fc8', 'right')
    this.drawPins(290, 170, 360, s.standing)
    const up = s.standing.filter(Boolean).length
    this.text(`${up} / 10`, 290, 440, 48, '#fff7e8')
  }

  private drawShow(show: ScreenShow & { t: number }): void {
    const g = this.g
    const t = show.t
    const hot = show.kind === 'strike' || show.kind === 'final'
    if (hot) {
      // Rotating starburst.
      g.save()
      g.translate(W / 2, H / 2)
      g.rotate(t * 0.8)
      const cols = ['#ff4fa3', '#ffd35c', '#7ef9ff', '#8a5cff']
      for (let i = 0; i < 16; i += 1) {
        g.fillStyle = cols[(i + Math.floor(t * 6)) % cols.length]
        g.globalAlpha = 0.35
        g.beginPath()
        g.moveTo(0, 0)
        const a = (i / 16) * Math.PI * 2
        g.arc(0, 0, 900, a, a + Math.PI / 16)
        g.closePath()
        g.fill()
      }
      g.restore()
      g.globalAlpha = 1
    }
    const pop = Math.min(1, t / 0.18)
    const bounce = 1 + Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.18
    const size = (hot ? 190 : show.kind === 'spare' ? 170 : 150) * pop * bounce
    const color = show.kind === 'strike' ? (Math.floor(t * 8) % 2 ? '#ffd35c' : '#ffffff') : show.kind === 'spare' ? '#7ef9ff' : show.kind === 'gutter' ? '#ff6b6b' : show.kind === 'split' ? '#ff8fc8' : '#fff7e8'
    this.text(show.big, W / 2, H / 2 - 30, size, color, 'center', hot ? '#ff4fa3' : color)
    if (show.small) this.text(show.small, W / 2, H - 90, 56, '#ffffff', 'center', '#8a5cff')
  }
}
