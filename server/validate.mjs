// Gameplay-specific validation for Strike Bowl submissions. Pure; unit tested.
import { FRAMES, MAX_SCORE, isComplete, scoreGame } from './bowling.mjs';

/** Minimum honest real time per ball: approach + ~18 m roll + pin action. */
export const MIN_MS_PER_BALL = 2200;
/** A 5-frame game never needs more than 11 balls or fewer than 6. */
export const MIN_BALLS = FRAMES + 1;
export const MAX_BALLS = FRAMES * 2 + 1;
export const MAX_DURATION_MS = 30 * 60 * 1000;

export function validateSubmission(data) {
  const { score, durationMs, rolls } = data ?? {};
  if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) return { ok: false, code: 'invalid_score' };
  if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) return { ok: false, code: 'invalid_duration' };
  if (!Array.isArray(rolls) || rolls.length < MIN_BALLS || rolls.length > MAX_BALLS) return { ok: false, code: 'invalid_rolls' };
  if (!rolls.every((v) => Number.isInteger(v) && v >= 0 && v <= 10)) return { ok: false, code: 'invalid_rolls' };
  if (!isComplete(rolls)) return { ok: false, code: 'incomplete_game' };
  const recomputed = scoreGame(rolls);
  if (recomputed !== score) return { ok: false, code: 'score_mismatch' };
  const minDurationMs = rolls.length * MIN_MS_PER_BALL;
  if (durationMs < minDurationMs) return { ok: false, code: 'run_too_fast' };
  return { ok: true, score: recomputed, minDurationMs };
}

/** Trim, collapse whitespace, drop control characters; 1..16 visible characters. */
export function cleanDisplayName(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  const chars = [...name];
  if (chars.length < 1 || chars.length > 16) return null;
  return name;
}
