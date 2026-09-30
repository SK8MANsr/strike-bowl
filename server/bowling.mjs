// Shared 5-frame bowling rules. Imported by the browser game (scorecard, flow) and by the
// leaderboard server (recomputing submitted scores from the roll sequence). Pure, no deps.
export const FRAMES = 5
export const MAX_SCORE = FRAMES * 30

/** Classify the result using rack ownership, not merely the number of standing pins. */
export function rollKind(next, down) {
  if (next.fresh && down === 10) return 'strike'
  if (!next.fresh && next.standing > 0 && down === next.standing) return 'spare'
  return 'open'
}

/**
 * Walk a roll list and split it into frames, validating pin counts as it goes.
 * Returns null when the sequence is impossible (too many pins in a frame, bad values).
 * Frames that are not finished yet are included with the rolls seen so far.
 */
export function splitFrames(rolls, frames = FRAMES) {
  if (!Array.isArray(rolls)) return null
  const out = []
  let i = 0
  for (let f = 0; f < frames && i < rolls.length; f += 1) {
    const last = f === frames - 1
    const frame = []
    const take = () => {
      const v = rolls[i]
      if (!Number.isInteger(v) || v < 0 || v > 10) return null
      i += 1
      frame.push(v)
      return v
    }
    const a = take()
    if (a === null) return null
    if (!last) {
      if (a < 10 && i < rolls.length) {
        const b = take()
        if (b === null || a + b > 10) return null
      }
    } else {
      if (i < rolls.length) {
        const b = take()
        if (b === null) return null
        if (a < 10 && a + b > 10) return null
        const bonus = a === 10 || a + b === 10
        if (bonus && i < rolls.length) {
          const c = take()
          if (c === null) return null
          // After X then non-strike, the third ball shares the rack with the second.
          if (a === 10 && b < 10 && b + c > 10) return null
        }
      }
    }
    out.push(frame)
  }
  if (i < rolls.length) return null
  return out
}

function frameDone(frame, last) {
  if (!last) return frame[0] === 10 || frame.length === 2
  if (frame.length < 2) return false
  if (frame[0] === 10 || frame[0] + frame[1] === 10) return frame.length === 3
  return true
}

/** True when the sequence is valid and every frame (including bonus balls) is finished. */
export function isComplete(rolls, frames = FRAMES) {
  const split = splitFrames(rolls, frames)
  if (!split || split.length !== frames) return false
  return split.every((fr, idx) => frameDone(fr, idx === frames - 1))
}

/**
 * Cumulative score per frame; null where the frame's score is not determined yet
 * (e.g. a strike still waiting for its two bonus balls).
 */
export function frameScores(rolls, frames = FRAMES) {
  const split = splitFrames(rolls, frames)
  if (!split) return null
  const flat = split.flat()
  const scores = []
  let total = 0
  let cursor = 0
  for (let f = 0; f < frames; f += 1) {
    const fr = split[f]
    if (!fr) { scores.push(null); continue }
    const last = f === frames - 1
    let value = null
    if (last) {
      if (frameDone(fr, true)) value = fr.reduce((s, v) => s + v, 0)
    } else if (fr[0] === 10) {
      if (flat.length >= cursor + 3) value = 10 + flat[cursor + 1] + flat[cursor + 2]
    } else if (fr.length === 2) {
      if (fr[0] + fr[1] === 10) {
        if (flat.length >= cursor + 3) value = 10 + flat[cursor + 2]
      } else value = fr[0] + fr[1]
    }
    if (value === null || scores.some(s => s === null)) scores.push(null)
    else { total += value; scores.push(total) }
    cursor += fr.length
  }
  return scores
}

/** Final total for a completed game, or null when invalid / unfinished. */
export function scoreGame(rolls, frames = FRAMES) {
  if (!isComplete(rolls, frames)) return null
  const s = frameScores(rolls, frames)
  return s ? s[frames - 1] : null
}

/**
 * Where the next ball goes: frame index, ball index within the frame, and whether the
 * pinsetter must set a fresh full rack. `done` is true when the game is over.
 */
export function nextBall(rolls, frames = FRAMES) {
  const split = splitFrames(rolls, frames)
  if (!split) return null
  if (isComplete(rolls, frames)) return { done: true, frame: frames - 1, ball: 0, fresh: false, standing: 0 }
  if (split.length === 0) return { done: false, frame: 0, ball: 0, fresh: true, standing: 10 }
  let f = split.length - 1
  let fr = split[f]
  const last = f === frames - 1
  if (frameDone(fr, last)) { f += 1; fr = []; return { done: false, frame: f, ball: 0, fresh: true, standing: 10 } }
  const ball = fr.length
  if (!last) return { done: false, frame: f, ball, fresh: false, standing: 10 - fr[0] }
  // Final frame: rack is fresh after a strike or a spare.
  if (ball === 1) return fr[0] === 10 ? { done: false, frame: f, ball, fresh: true, standing: 10 } : { done: false, frame: f, ball, fresh: false, standing: 10 - fr[0] }
  const [a, b] = fr
  if (a === 10 && b === 10) return { done: false, frame: f, ball, fresh: true, standing: 10 }
  if (a === 10) return { done: false, frame: f, ball, fresh: false, standing: 10 - b }
  return { done: false, frame: f, ball, fresh: true, standing: 10 }
}

/** Best score still reachable if every remaining ball knocks all standing pins down. */
export function maxPossible(rolls, frames = FRAMES) {
  const seq = [...rolls]
  for (let guard = 0; guard < 32; guard += 1) {
    const next = nextBall(seq, frames)
    if (!next || next.done) break
    seq.push(next.standing)
  }
  return scoreGame(seq, frames) ?? 0
}

/** Scorecard marks per frame: 'X', '/', '-', or digits. */
export function frameMarks(rolls, frames = FRAMES) {
  const split = splitFrames(rolls, frames) ?? []
  const marks = []
  for (let f = 0; f < frames; f += 1) {
    const fr = split[f] ?? []
    const last = f === frames - 1
    const m = []
    for (let k = 0; k < fr.length; k += 1) {
      const v = fr[k]
      const prev = fr[k - 1]
      const freshRack = k === 0 || (last && (prev === 10 || (k === 2 && fr[0] + fr[1] === 10 && fr[0] !== 10)))
      if (v === 10 && freshRack) m.push('X')
      else if (!freshRack && prev + v === 10 && !(last && k === 2 && fr[0] === 10 && fr[1] === 10)) m.push('/')
      else m.push(v === 0 ? '-' : String(v))
    }
    // Traditional sheets print a strike in the right-hand box of frames 1-4.
    marks.push(!last && m[0] === 'X' ? ['', 'X'] : m)
  }
  return marks
}
