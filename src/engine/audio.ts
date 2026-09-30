/**
 * Web Audio mixer with music and SFX buses. Browsers only allow audio after a user gesture, so
 * call `unlock()` from the first click/key press (the title screen does this).
 *
 * Everything is synthesised at runtime (no audio files): pin clatter, ball rumble, crowd,
 * fanfares and a looping retro synth groove. All sounds are original.
 */
export type Sfx = 'ui' | 'tick' | 'release' | 'gutter' | 'strike' | 'spare' | 'miss' | 'split' | 'best' | 'sweep' | 'cheer' | 'aww' | 'wobble' | 'combo' | 'start' | 'end'

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private musicDuck: GainNode
  private sfx: GainNode
  private musicTimer = 0
  private musicOn = false
  private noise: AudioBuffer
  private roll?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }
  private charge?: { osc: OscillatorNode; gain: GainNode }
  private lastHit = 0
  private step = 0
  private nextNote = 0

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.musicDuck = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.music.connect(this.musicDuck).connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(comp).connect(this.ctx.destination)
    const len = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.5, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.9, t, 0.05)
  }

  private get ok(): boolean {
    return this.ctx.state === 'running'
  }

  private tone(freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0, dest: AudioNode = this.sfx): void {
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private burst(dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, delay = 0, dest: AudioNode = this.sfx, attack = 0.004): void {
    const t = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(dest)
    src.start(t, Math.random())
    src.stop(t + dur + 0.05)
  }

  /** Wooden pin clack; `force` roughly 0..1, `heavy` for ball contact. */
  hit(force: number, heavy = false): void {
    if (!this.ok) return
    const now = this.ctx.currentTime
    if (now - this.lastHit < 0.012) return
    this.lastHit = now
    const v = Math.min(1, Math.max(0.05, force))
    const pitch = 0.85 + Math.random() * 0.35
    if (heavy) {
      this.tone(120, 50, 0.22, 'sine', 0.5 * v + 0.2)
      this.burst(0.3, 0.45 * v + 0.15, 'lowpass', 1800, 0.7)
    }
    this.burst(0.06 + v * 0.05, 0.22 + v * 0.45, 'bandpass', 2400 * pitch, 2.5)
    this.tone(900 * pitch, 700 * pitch, 0.09, 'triangle', 0.12 + v * 0.22)
    this.tone(1640 * pitch, 1400 * pitch, 0.06, 'sine', 0.06 + v * 0.12)
  }

  /** Continuous ball roll rumble; call every frame while rolling (speed m/s, 0 = stop). */
  setRoll(speed: number, gutter = false): void {
    if (!this.ok) return
    if (!this.roll && speed > 0.2) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 220
      filter.Q.value = 3
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(filter).connect(gain).connect(this.sfx)
      src.start()
      this.roll = { src, gain, filter }
    }
    if (!this.roll) return
    const t = this.ctx.currentTime
    const level = speed <= 0.2 ? 0 : Math.min(1, speed / 9) * (gutter ? 0.9 : 0.75)
    this.roll.gain.gain.setTargetAtTime(level, t, 0.08)
    this.roll.filter.frequency.setTargetAtTime(gutter ? 520 : 140 + speed * 22, t, 0.1)
    if (level === 0) {
      const r = this.roll
      this.roll = undefined
      r.src.stop(t + 0.5)
    }
  }

  /** Rising charge hum while the power meter fills; value 0..1, null stops it. */
  setCharge(value: number | null): void {
    if (!this.ok) return
    const t = this.ctx.currentTime
    if (value === null) {
      if (this.charge) {
        this.charge.gain.gain.setTargetAtTime(0, t, 0.03)
        this.charge.osc.stop(t + 0.2)
        this.charge = undefined
      }
      return
    }
    if (!this.charge) {
      const osc = this.ctx.createOscillator()
      osc.type = 'triangle'
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain).connect(this.sfx)
      osc.start()
      this.charge = { osc, gain }
    }
    this.charge.osc.frequency.setTargetAtTime(180 + value * 520, t, 0.02)
    this.charge.gain.gain.setTargetAtTime(0.05 + value * 0.06, t, 0.03)
  }

  /** Temporarily lower the music (strike shows). */
  duck(amount = 0.35, seconds = 2.2): void {
    const t = this.ctx.currentTime
    this.musicDuck.gain.cancelScheduledValues(t)
    this.musicDuck.gain.setTargetAtTime(amount, t, 0.05)
    this.musicDuck.gain.setTargetAtTime(1, t + seconds, 0.4)
  }

  play(name: Sfx): void {
    if (!this.ok) return
    const arp = (notes: number[], gap: number, dur: number, type: OscillatorType, vol: number, delay = 0) => notes.forEach((f, i) => this.tone(f, f * 1.003, dur, type, vol, delay + i * gap))
    switch (name) {
      case 'ui': this.tone(660, 720, 0.06, 'triangle', 0.16); break
      case 'tick': this.tone(1200, 1100, 0.025, 'square', 0.035); break
      case 'release':
        this.burst(0.28, 0.18, 'bandpass', 900, 0.8, 0, this.sfx, 0.08)
        this.tone(220, 110, 0.18, 'sine', 0.25)
        break
      case 'gutter':
        this.tone(140, 60, 0.35, 'sawtooth', 0.12)
        this.burst(0.4, 0.2, 'lowpass', 600, 1)
        break
      case 'strike':
        this.duck(0.3, 2.6)
        arp([523, 659, 784, 1047, 1319], 0.07, 0.35, 'square', 0.1)
        arp([1047, 1319, 1568], 0, 0.9, 'triangle', 0.12, 0.38)
        arp([262, 330, 392], 0, 1.1, 'sawtooth', 0.05, 0.38)
        this.cheer(1)
        break
      case 'spare':
        this.duck(0.5, 1.6)
        arp([587, 740, 880, 1175], 0.08, 0.3, 'triangle', 0.16)
        this.cheer(0.6)
        break
      case 'combo':
        arp([784, 988, 1175, 1568, 1976], 0.05, 0.25, 'square', 0.08, 0.7)
        break
      case 'miss': arp([392, 370], 0.14, 0.25, 'triangle', 0.12); break
      case 'split':
        this.tone(330, 250, 0.4, 'sawtooth', 0.08)
        this.tone(335, 240, 0.45, 'sawtooth', 0.08, 0.05)
        break
      case 'aww': this.aww(); break
      case 'wobble':
        for (let i = 0; i < 4; i += 1) this.tone(700 + (i % 2) * 90, 690, 0.06, 'sine', 0.08, i * 0.07)
        break
      case 'best':
        this.duck(0.3, 2.5)
        arp([523, 659, 784, 1047, 784, 1047, 1319], 0.09, 0.28, 'square', 0.1)
        this.cheer(0.9)
        break
      case 'sweep':
        this.burst(0.5, 0.06, 'bandpass', 380, 4, 0, this.sfx, 0.1)
        this.tone(95, 70, 0.4, 'square', 0.03)
        break
      case 'cheer': this.cheer(0.7); break
      case 'start': arp([392, 523, 659, 784], 0.06, 0.18, 'square', 0.09); break
      case 'end': arp([784, 659, 784, 1047], 0.12, 0.4, 'triangle', 0.14); break
    }
  }

  /** Crowd cheer: a swell of band-passed noise with a fast amplitude flutter plus whistles. */
  private cheer(amount: number): void {
    const t = this.ctx.currentTime
    const dur = 1.4 + amount * 1.2
    for (const [freq, q] of [[900, 0.6], [1800, 1], [3200, 1.4]] as const) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const f = this.ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = freq
      f.Q.value = q
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.16 * amount, t + 0.25)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      const lfo = this.ctx.createOscillator()
      const lfoGain = this.ctx.createGain()
      lfo.frequency.value = 7 + Math.random() * 5
      lfoGain.gain.value = 0.05 * amount
      lfo.connect(lfoGain).connect(g.gain)
      src.connect(f).connect(g).connect(this.sfx)
      src.start(t, Math.random())
      lfo.start(t)
      src.stop(t + dur + 0.1)
      lfo.stop(t + dur + 0.1)
    }
    if (amount > 0.6) {
      this.tone(1800, 2600, 0.3, 'sine', 0.05, 0.3)
      this.tone(2600, 1900, 0.35, 'sine', 0.05, 0.62)
    }
  }

  /** Disappointed crowd "aww": formant-filtered sawtooths gliding down. */
  private aww(): void {
    const t = this.ctx.currentTime
    for (const base of [180, 240, 300]) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(base * 1.3, t)
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.9)
      const f = this.ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.setValueAtTime(900, t)
      f.frequency.exponentialRampToValueAtTime(500, t + 0.9)
      f.Q.value = 3
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.12)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1)
      o.connect(f).connect(g).connect(this.sfx)
      o.start(t)
      o.stop(t + 1.1)
    }
  }

  /**
   * Original retro synth groove at 104 BPM: drums, a bass line and chord stabs over a
   * i–VI–III–VII progression, scheduled slightly ahead with a look-ahead timer.
   */
  startMusic(): void {
    if (this.musicOn) return
    this.musicOn = true
    const bpm = 104
    const sixteenth = 60 / bpm / 4
    const roots = [110, 87.31, 130.81, 98]
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]]
    const bassPattern = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]
    const lead = [0, 0, 7, 0, 5, 0, 3, 0, 0, 0, 7, 0, 10, 0, 7, 0]
    this.nextNote = this.ctx.currentTime + 0.1
    this.step = 0
    const tick = () => {
      if (!this.musicOn) return
      while (this.nextNote < this.ctx.currentTime + 0.25) {
        const s = this.step % 16
        const bar = Math.floor(this.step / 16) % 4
        const phrase = Math.floor(this.step / 64) % 2
        const t = this.nextNote
        const at = Math.max(0, t - this.ctx.currentTime)
        if (s % 4 === 0) this.kick(t)
        if (s === 4 || s === 12) this.snare(t)
        if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.05 : 0.03)
        if (bassPattern[s]) this.tone(roots[bar], roots[bar] * 0.99, sixteenth * 1.8, 'sawtooth', 0.09, at, this.music)
        if (s === 0 || s === 10) for (const f of chords[bar]) this.tone(f, f, sixteenth * 3, 'square', 0.018, at, this.music)
        if (phrase === 1 && lead[s] && s % 2 === 0) {
          const f = roots[bar] * 4 * Math.pow(2, lead[s] / 12)
          this.tone(f, f, sixteenth * 1.6, 'triangle', 0.035, at, this.music)
        }
        this.nextNote += sixteenth
        this.step += 1
      }
      this.musicTimer = window.setTimeout(tick, 60)
    }
    tick()
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    g.gain.setValueAtTime(0.32, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(g).connect(this.music)
    o.start(t)
    o.stop(t + 0.22)
  }

  private snare(t: number): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 1500
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    src.connect(f).connect(g).connect(this.music)
    src.start(t, Math.random())
    src.stop(t + 0.2)
  }

  private hat(t: number, vol: number): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
    src.connect(f).connect(g).connect(this.music)
    src.start(t, Math.random())
    src.stop(t + 0.06)
  }

  stopMusic(): void {
    this.musicOn = false
    clearTimeout(this.musicTimer)
  }
}
