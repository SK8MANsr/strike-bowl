import qrcode from 'qrcode-generator'
import { frameMarks, frameScores } from '../../server/bowling.mjs'

export type CardData = {
  score: number
  rolls: number[]
  name: string
  day: string
  rank: number | null
  players: number | null
  beatPct: number | null
  link: string
  t: (key: string, vars?: Record<string, string | number>) => string
  zh: boolean
}

/** Challenge link: same page with ?c=<score>&n=<name>. Built from the page the player is on. */
export function challengeLink(score: number, name: string): string {
  const url = new URL(location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('c', String(score))
  if (name) url.searchParams.set('n', name)
  return url.toString()
}

/** Read a challenge from the current URL; ignores anything out of range. */
export function readChallenge(search = location.search): { score: number; name: string } | null {
  const p = new URLSearchParams(search)
  const raw = p.get('c')
  if (raw === null || !/^\d{1,3}$/.test(raw)) return null
  const score = Number(raw)
  if (score < 1 || score > 150) return null
  const name = [...(p.get('n') ?? '').replace(/[\u0000-\u001f<>]/g, '').trim()].slice(0, 16).join('')
  return { score, name }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, font: string, stroke = '#120828', glow?: string): void {
  g.font = `900 ${size}px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  // Hard offset shadow for the chunky game look.
  g.fillStyle = stroke
  g.lineWidth = size * 0.2
  g.strokeStyle = stroke
  g.strokeText(text, x + size * 0.05, y + size * 0.07)
  g.fillText(text, x + size * 0.05, y + size * 0.07)
  if (glow) {
    g.shadowColor = glow
    g.shadowBlur = size * 0.35
  }
  g.strokeText(text, x, y)
  g.shadowBlur = 0
  g.fillStyle = fill
  g.fillText(text, x, y)
}

/** Draw the 1080×1350 share card. */
export function drawShareCard(d: CardData): HTMLCanvasElement {
  const W = 1080
  const H = 1350
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const font = d.zh ? "'Noto Sans SC', 'Sora', sans-serif" : "'Sora', 'Noto Sans SC', sans-serif"
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#2a0f5c')
  bg.addColorStop(0.55, '#140a33')
  bg.addColorStop(1, '#3a0d3f')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // Perspective lane lines receding to a vanishing point.
  g.save()
  g.globalAlpha = 0.25
  for (let i = -8; i <= 8; i += 1) {
    g.strokeStyle = i % 2 ? '#39e6ff' : '#ff4fa3'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(W / 2, 360)
    g.lineTo(W / 2 + i * 180, H)
    g.stroke()
  }
  g.restore()
  // Starburst behind the score.
  g.save()
  g.translate(W / 2, 560)
  for (let i = 0; i < 18; i += 1) {
    g.fillStyle = i % 2 ? 'rgba(255,211,92,0.10)' : 'rgba(255,79,163,0.10)'
    g.beginPath()
    g.moveTo(0, 0)
    const a = (i / 18) * Math.PI * 2
    g.arc(0, 0, 620, a, a + Math.PI / 18)
    g.closePath()
    g.fill()
  }
  g.restore()
  // Frame.
  g.strokeStyle = '#ff4fa3'
  g.lineWidth = 14
  roundRect(g, 26, 26, W - 52, H - 52, 40)
  g.stroke()
  g.strokeStyle = '#39e6ff'
  g.lineWidth = 4
  roundRect(g, 48, 48, W - 96, H - 96, 30)
  g.stroke()

  outlined(g, d.zh ? '好球保龄' : 'STRIKE BOWL', W / 2, 150, d.zh ? 118 : 104, '#ffd35c', font, '#120828', '#ff4fa3')
  outlined(g, d.zh ? 'STRIKE BOWL' : '5 FRAMES · 150 MAX', W / 2, 250, 44, '#7ef9ff', "'Sora', sans-serif")
  outlined(g, String(d.score), W / 2, 540, 300, '#ffffff', "'Sora', sans-serif", '#120828', '#ffd35c')
  outlined(g, d.zh ? `/ 150 分` : '/ 150 POINTS', W / 2, 720, 50, '#ffd35c', font)
  if (d.rank !== null && d.beatPct !== null) outlined(g, d.t('share.rank', { rank: d.rank, pct: d.beatPct }), W / 2, 800, 50, '#ff8fc8', font)

  // Mini scorecard.
  const marks = frameMarks(d.rolls)
  const totals = frameScores(d.rolls) ?? []
  const cw = 170
  const x0 = (W - cw * 5) / 2
  const y0 = 860
  for (let f = 0; f < 5; f += 1) {
    const x = x0 + f * cw
    g.fillStyle = '#fff7e8'
    roundRect(g, x + 6, y0, cw - 12, 150, 16)
    g.fill()
    g.strokeStyle = '#120828'
    g.lineWidth = 6
    g.stroke()
    g.fillStyle = '#120828'
    g.font = `800 26px ${font}`
    g.textAlign = 'left'
    g.fillText(String(f + 1), x + 18, y0 + 26)
    const m = marks[f] ?? []
    const boxes = f === 4 ? 3 : 2
    for (let k = 0; k < boxes; k += 1) {
      const bx = x + cw - 12 - (boxes - k) * 42
      g.strokeStyle = '#120828'
      g.lineWidth = 3
      g.strokeRect(bx, y0 + 8, 40, 40)
      const mark = m[k] ?? ''
      g.fillStyle = mark === 'X' ? '#e8203f' : mark === '/' ? '#1b7bd6' : '#120828'
      g.font = `900 30px 'Sora', sans-serif`
      g.textAlign = 'center'
      g.fillText(mark, bx + 20, y0 + 30)
    }
    const tot = totals[f]
    g.fillStyle = '#120828'
    g.font = `900 52px 'Sora', sans-serif`
    g.textAlign = 'center'
    g.fillText(tot === null || tot === undefined ? '' : String(tot), x + cw / 2, y0 + 108)
  }

  // Challenge text + QR code.
  outlined(g, d.t('share.text', { score: d.score }), W / 2, 1080, d.zh ? 44 : 38, '#ffffff', font)
  const qr = qrcode(0, 'M')
  qr.addData(d.link)
  qr.make()
  const n = qr.getModuleCount()
  const size = 190
  const cell = size / n
  const qx = 110
  const qy = 1130
  g.fillStyle = '#ffffff'
  roundRect(g, qx - 14, qy - 14, size + 28, size + 28, 16)
  g.fill()
  g.fillStyle = '#120828'
  for (let r = 0; r < n; r += 1) for (let col = 0; col < n; col += 1) if (qr.isDark(r, col)) g.fillRect(qx + col * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell))
  g.textAlign = 'left'
  g.fillStyle = '#ffd35c'
  g.font = `900 46px ${font}`
  g.fillText(d.t('share.scan'), qx + size + 50, qy + 50)
  g.fillStyle = '#c9c2e8'
  g.font = `600 26px 'Sora', sans-serif`
  const short = d.link.replace(/^https?:\/\//, '')
  const line = short.length > 44 ? `${short.slice(0, 44)}…` : short
  g.fillText(line, qx + size + 50, qy + 110)
  g.fillStyle = '#7ef9ff'
  g.font = `700 28px ${font}`
  g.fillText(`${d.name || '—'} · ${d.day}`, qx + size + 50, qy + 160)
  return c
}
