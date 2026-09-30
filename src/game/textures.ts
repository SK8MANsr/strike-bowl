import * as THREE from 'three'
import { LANE } from './config'

function canvas(w: number, h: number): [HTMLCanvasElement | OffscreenCanvas, CanvasRenderingContext2D] {
  const c = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h)
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

function tex(c: HTMLCanvasElement | OffscreenCanvas, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Maple lane boards with the targeting arrows and dots, foul line at the bottom edge.
 * The texture spans `length` metres from the foul line toward the pins.
 */
export function laneTexture(length: number, approach = false): THREE.CanvasTexture {
  const W = 512
  const H = 4096
  const [c, g] = canvas(W, H)
  const boards = 39
  const bw = W / boards
  for (let i = 0; i < boards; i += 1) {
    const hue = approach ? 28 : 34
    const light = (approach ? 38 : 64) + ((i * 37) % 7) - 3
    g.fillStyle = `hsl(${hue} ${approach ? 45 : 58}% ${light}%)`
    g.fillRect(i * bw, 0, bw + 1, H)
    // Grain streaks.
    g.globalAlpha = 0.12
    for (let k = 0; k < 18; k += 1) {
      g.fillStyle = k % 2 ? '#fff4dc' : '#6b3b16'
      const y = ((i * 131 + k * 977) % H)
      g.fillRect(i * bw + ((k * 5) % bw), y, 1.2, 180 + ((k * 53) % 300))
    }
    g.globalAlpha = 1
    g.fillStyle = 'rgba(60,30,10,0.45)'
    g.fillRect(i * bw, 0, 1, H)
  }
  // Board-length joints.
  g.fillStyle = 'rgba(70,35,12,0.35)'
  for (let i = 0; i < boards; i += 1) g.fillRect(i * bw, ((i * 613) % H), bw, 2)
  const yAt = (m: number) => H - (m / length) * H
  const xAt = (board: number) => W - (board - 0.5) * bw
  if (!approach) {
    // Dots at 7 ft, arrows at 15 ft (boards 5, 10, 15, 20, ...).
    g.fillStyle = '#2b1a52'
    for (const b of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
      g.beginPath()
      g.arc(xAt(b), yAt(2.13), 5, 0, Math.PI * 2)
      g.fill()
    }
    const arrow = (b: number, m: number) => {
      const x = xAt(b)
      const y = yAt(m)
      g.beginPath()
      g.moveTo(x, y - 40)
      g.lineTo(x - bw * 0.8, y + 14)
      g.lineTo(x + bw * 0.8, y + 14)
      g.closePath()
      g.fill()
    }
    g.fillStyle = '#5a2d8a'
    const arrowRows: [number, number][] = [[5, 4.57], [10, 4.87], [15, 5.18], [20, 5.49], [25, 5.18], [30, 4.87], [35, 4.57]]
    for (const [b, m] of arrowRows) arrow(b, m)
    // Foul line.
    g.fillStyle = '#ff2f6d'
    g.fillRect(0, H - 10, W, 10)
  } else {
    // Approach dots at 12 and 15 ft behind the foul line (texture runs toward the bowler).
    g.fillStyle = '#26143f'
    for (const m of [3.66, 4.57]) {
      for (const b of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
        g.beginPath()
        g.arc(xAt(b), H - (m / length) * H, 5, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  const t = tex(c)
  t.wrapS = THREE.ClampToEdgeWrapping
  return t
}

/** Neon tube lettering on a transparent canvas. */
export function neonSign(lines: { text: string; color: string; size: number; font?: string }[], w = 1024, h = 256): THREE.CanvasTexture {
  const [c, g] = canvas(w, h)
  g.clearRect(0, 0, w, h)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const total = lines.reduce((s, l) => s + l.size * 1.15, 0)
  let y = h / 2 - total / 2
  for (const l of lines) {
    y += (l.size * 1.15) / 2
    g.font = `900 ${l.size}px ${l.font ?? "'Noto Sans SC', 'Sora', sans-serif"}`
    g.shadowColor = l.color
    for (const blur of [40, 18, 6]) {
      g.shadowBlur = blur
      g.lineWidth = l.size * 0.09
      g.strokeStyle = l.color
      g.strokeText(l.text, w / 2, y)
    }
    g.shadowBlur = 8
    g.fillStyle = '#ffffff'
    g.fillText(l.text, w / 2, y)
    y += (l.size * 1.15) / 2
  }
  return tex(c)
}

/** Retro wall panel: dark base with neon zigzags, stars and circles. */
export function wallTexture(seed: number, colors: string[]): THREE.CanvasTexture {
  const W = 1024
  const H = 256
  const [c, g] = canvas(W, H)
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#1a1033')
  grad.addColorStop(1, '#0c0820')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  // Big zigzag band.
  g.lineWidth = 10
  g.strokeStyle = colors[0]
  g.shadowColor = colors[0]
  g.shadowBlur = 16
  g.beginPath()
  for (let x = -40; x <= W + 40; x += 64) g.lineTo(x, (x / 64) % 2 === 0 ? 70 : 120)
  g.stroke()
  g.strokeStyle = colors[1]
  g.shadowColor = colors[1]
  g.lineWidth = 6
  g.beginPath()
  for (let x = -40; x <= W + 40; x += 64) g.lineTo(x, (x / 64) % 2 === 0 ? 150 : 195)
  g.stroke()
  // Scattered stars and rings.
  for (let i = 0; i < 16; i += 1) {
    const x = rnd() * W
    const y = 20 + rnd() * (H - 40)
    const col = colors[i % colors.length]
    g.strokeStyle = col
    g.shadowColor = col
    g.lineWidth = 3
    if (i % 3 === 0) {
      g.beginPath()
      g.arc(x, y, 8 + rnd() * 10, 0, Math.PI * 2)
      g.stroke()
    } else {
      star(g, x, y, 6 + rnd() * 9)
      g.stroke()
    }
  }
  const t = tex(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.45
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
}

/** Carpet under the seating areas: dark with a small retro confetti pattern. */
export function carpetTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#1d1238'
  g.fillRect(0, 0, 256, 256)
  const cols = ['#ff4fa3', '#39e6ff', '#ffd23f', '#8a5cff']
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 70; i += 1) {
    g.fillStyle = cols[i % cols.length]
    g.globalAlpha = 0.7
    const x = rnd() * 256
    const y = rnd() * 256
    if (i % 2) g.fillRect(x, y, 10, 3)
    else {
      g.beginPath()
      g.arc(x, y, 3, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.globalAlpha = 1
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(10, 10)
  return t
}

export const LANE_TEX_LENGTH = LANE.deckEnd
