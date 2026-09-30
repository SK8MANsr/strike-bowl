import { LANE } from './config'

/** Pin silhouette as (height, radius) pairs in metres, base to crown. Shared by mesh and colliders. */
export const PIN_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.0],
  [0, 0.027],
  [0.018, 0.04],
  [0.055, 0.054],
  [0.105, 0.0605],
  [0.15, 0.058],
  [0.2, 0.046],
  [0.24, 0.031],
  [0.262, 0.0235],
  [0.285, 0.0245],
  [0.315, 0.031],
  [0.345, 0.031],
  [0.366, 0.023],
  [0.378, 0.012],
  [0.381, 0.0],
]

/** Standard pin numbering 1..10; rows go away from the bowler, pins left (-x) to right. */
export type PinSpot = { number: number; row: number; x: number; z: number }

export const PIN_SPOTS: PinSpot[] = (() => {
  const spots: PinSpot[] = []
  const rowGap = LANE.pinSpacing * Math.sin(Math.PI / 3)
  for (let row = 0; row < 4; row += 1) {
    for (let k = 0; k <= row; k += 1) {
      spots.push({ number: spots.length + 1, row, x: (k - row / 2) * LANE.pinSpacing, z: -LANE.headPin - row * rowGap })
    }
  }
  return spots
})()

/** Ring of points for a convex-hull collider slice of the pin between two heights. */
export function pinHullPoints(fromH: number, toH: number, segments = 10): Float32Array {
  const pts: number[] = []
  for (const [h, r] of PIN_PROFILE) {
    if (h < fromH - 1e-6 || h > toH + 1e-6) continue
    if (r < 1e-4) {
      pts.push(0, h, 0)
      continue
    }
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2
      pts.push(Math.cos(a) * r, h, Math.sin(a) * r)
    }
  }
  return new Float32Array(pts)
}

/** Well-known leaves, for the "split" callout. */
export function isSplit(standing: readonly boolean[]): boolean {
  if (standing[0]) return false
  const up = standing.map((s, i) => (s ? i : -1)).filter(i => i >= 0)
  if (up.length < 2) return false
  // Split: head pin down and two standing groups with a gap in every row they share.
  const xs = up.map(i => PIN_SPOTS[i].x).sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i += 1) if (xs[i] - xs[i - 1] > LANE.pinSpacing * 1.4) return true
  return false
}
