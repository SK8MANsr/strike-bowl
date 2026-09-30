/**
 * All gameplay tuning in one place. Units are metres / seconds / kilograms, using real
 * ten-pin dimensions so the pin action looks right. The lane runs along -Z: the foul line is at
 * z = 0 and the head pin stands at z = -LANE.headPin.
 */
export const LANE = {
  width: 1.054,
  headPin: 18.29,
  /** Pin deck ends here; beyond it the pit drops away. */
  deckEnd: 19.55,
  pitEnd: 20.7,
  pitDepth: 0.5,
  gutterWidth: 0.235,
  gutterDepth: 0.085,
  /** Side walls around the pin deck that bounce pins back into play. */
  kickbackStart: 16.9,
  kickbackHeight: 0.62,
  approach: 4.6,
  pinSpacing: 0.3048,
}

export const BALL = {
  radius: 0.109,
  mass: 6.8,
  friction: 0.06,
  restitution: 0.12,
  /** Stance limits across the approach (ball centre). */
  stanceMax: 0.43,
  stanceSpeed: 0.75,
  /** Aim angle limit (radians) either side of straight. */
  aimMax: 0.07,
  minSpeed: 5.6,
  maxSpeed: 9.8,
  /** Lateral hook acceleration (m/s²) at full spin once the ball leaves the oil. */
  hook: 2.1,
  /** Metres over which the hook ramps in after the oil ends. */
  hookRamp: 3.2,
}

export const PIN = {
  mass: 1.53,
  height: 0.381,
  /** Centre of mass height above the base: pins are bottom heavy. */
  com: 0.145,
  friction: 0.28,
  restitution: 0.28,
  /** A pin counts as standing when its up-axis is within ~22° of vertical and it is on the deck. */
  uprightDot: 0.93,
}

export const SIM = {
  substeps: 4,
  solverIterations: 8,
  /** Seconds (sim time) of calm pins before counting, and hard limits. */
  settleCalm: 0.45,
  settleMax: 4.2,
  rollMax: 9,
}

export const THROW = {
  /** One full sweep of the power meter (0→1) in seconds on frame 1; later frames are faster. */
  chargeSeconds: [1.05, 0.98, 0.9, 0.82, 0.74],
  /** Horizontal drag, as a fraction of the screen width, for full spin. */
  spinDrag: 0.2,
  windup: 0.34,
}

/**
 * Difficulty ramp across the five frames. Guide = fraction of the predicted path drawn,
 * drift = sideways lane "tilt" (m/s², sign from the daily seed), oil = where the hook kicks in.
 */
export const RAMP = {
  guide: [1, 0.78, 0.6, 0.46, 0.34],
  drift: [0, 0.05, 0.085, 0.12, 0.15],
  oilMin: [11.5, 10.8, 10.2, 9.6, 9.0],
  oilSpread: [0.4, 1.2, 1.6, 2.0, 2.4],
}

export const CAMERA = {
  fov: 50,
  stanceBack: 2.35,
  stanceHeight: 1.18,
  followBack: 2.1,
  followHeight: 0.62,
  /** Real-time slow motion around the moment of impact. */
  slowScale: 0.28,
  slowSeconds: 1.15,
}
