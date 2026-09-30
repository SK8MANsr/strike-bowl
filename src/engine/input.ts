/**
 * Unified input for keyboard, mouse/touch pointer and gamepad. Gameplay reads actions and axes
 * each fixed step and never touches DOM events directly.
 *
 * Bowling controls:
 * - move   : A/D, stick X, touch ◀ ▶   (choose stance before the throw)
 * - aim    : ←/→, right stick X         (fine aim; the mouse aims by pointing)
 * - throw  : hold Space / gamepad A / mouse / touch; release to bowl
 * - spin   : while holding, drag sideways (mouse/touch) or push a stick / keys left or right
 */
export type Action = 'throw' | 'confirm' | 'pause' | 'back' | 'restart'
export type Method = 'keyboard' | 'gamepad' | 'touch'

const KEYMAP: Record<string, Action[]> = {
  Space: ['throw', 'confirm'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  KeyR: ['restart'],
}

export type PointerState = {
  /** Normalised device coords (-1..1) of the pointer over the canvas. */
  x: number
  y: number
  inside: boolean
  down: boolean
  /** Screen pixels at press, for drag measurement. */
  startX: number
  startY: number
  px: number
  py: number
  type: string
}

export class Input {
  method: Method = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard'
  readonly pointer: PointerState = { x: 0, y: 0, inside: false, down: false, startX: 0, startY: 0, px: 0, py: 0, type: 'mouse' }
  private keys = new Set<string>()
  private held = new Set<Action>()
  private pressed = new Set<Action>()
  private released = new Set<Action>()
  private padHeld = new Set<Action>()
  private blockedPad = new Set<Action>()
  private touchHeld = new Set<Action>()
  private touchMove = 0
  private pointerPressed = false
  private pointerReleased = false
  private cancelled = false
  private pointerId: number | null = null
  /** Mouse moved since last read (switches aiming back to the pointer). */
  pointerMoved = false
  private padAxes = { lx: 0, ly: 0, rx: 0, trigger: 0 }

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      this.method = 'keyboard'
      if (e.repeat) return
      this.keys.add(e.code)
      for (const a of KEYMAP[e.code] ?? []) this.press(a)
    })
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code)
      for (const a of KEYMAP[e.code] ?? []) this.release(a)
    })
    window.addEventListener('blur', () => {
      this.cancelThrow()
    })
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.pointerId !== null) return
      this.pointerId = e.pointerId
      this.method = e.pointerType === 'touch' ? 'touch' : 'keyboard'
      this.track(e)
      this.pointer.down = true
      this.pointer.startX = e.clientX
      this.pointer.startY = e.clientY
      this.pointer.type = e.pointerType
      this.pointerPressed = true
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // Synthetic events in tests have no active pointer.
      }
    })
    canvas.addEventListener('pointermove', e => {
      if (this.pointerId !== null && e.pointerId !== this.pointerId) return
      this.track(e)
      if (e.pointerType === 'mouse') this.pointerMoved = true
    })
    const up = (e: PointerEvent) => {
      if (!this.pointer.down || e.pointerId !== this.pointerId) return
      this.track(e)
      this.pointer.down = false
      this.pointerReleased = true
      this.pointerId = null
    }
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', e => {
      if (e.pointerId === this.pointerId) this.cancelThrow()
    })
    canvas.addEventListener('lostpointercapture', e => {
      if (e.pointerId === this.pointerId) this.cancelThrow()
    })
    canvas.addEventListener('pointerleave', () => (this.pointer.inside = false))
    canvas.addEventListener('contextmenu', e => e.preventDefault())
  }

  private track(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect()
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    this.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    this.pointer.px = e.clientX
    this.pointer.py = e.clientY
    this.pointer.inside = true
  }

  private press(a: Action): void {
    if (!this.held.has(a)) this.pressed.add(a)
    this.held.add(a)
  }

  private release(a: Action): void {
    if (this.keysHold(a) || this.padHeld.has(a) || this.touchHeld.has(a)) return
    if (this.held.has(a)) this.released.add(a)
    this.held.delete(a)
  }

  private keysHold(a: Action): boolean {
    for (const k of this.keys) if (KEYMAP[k]?.includes(a)) return true
    return false
  }

  /** Poll gamepads; call once per rendered frame before gameplay reads input. */
  poll(): void {
    const pads = navigator.getGamepads?.() ?? []
    const pad = [...pads].find(p => p && p.connected)
    const next = new Set<Action>()
    if (pad) {
      const b = (i: number) => !!pad.buttons[i]?.pressed
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v)
      this.padAxes.lx = dead(pad.axes[0] ?? 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0)
      this.padAxes.ly = dead(pad.axes[1] ?? 0)
      this.padAxes.rx = dead(pad.axes[2] ?? 0) + (b(5) ? 0.5 : 0) - (b(4) ? 0.5 : 0)
      this.padAxes.trigger = pad.buttons[7]?.value ?? 0
      if (b(0) || this.padAxes.trigger > 0.5) next.add('throw')
      if (b(0)) next.add('confirm')
      if (b(9)) next.add('pause')
      if (b(1)) next.add('back')
      if (b(3)) next.add('restart')
      if (next.size || Math.abs(this.padAxes.lx) + Math.abs(this.padAxes.rx) > 0.3) this.method = 'gamepad'
    } else {
      if (this.padHeld.size) this.cancelThrow()
      this.padAxes = { lx: 0, ly: 0, rx: 0, trigger: 0 }
    }
    for (const a of [...this.blockedPad]) if (!next.has(a)) this.blockedPad.delete(a)
    for (const a of next) if (!this.padHeld.has(a)) {
      this.padHeld.add(a)
      if (!this.blockedPad.has(a)) this.press(a)
    }
    for (const a of [...this.padHeld]) if (!next.has(a)) {
      this.padHeld.delete(a)
      this.release(a)
    }
  }

  /** Touch overlay buttons feed actions here. */
  setTouchAction(a: Action, down: boolean): void {
    this.method = 'touch'
    if (down) {
      this.touchHeld.add(a)
      this.press(a)
    } else {
      this.touchHeld.delete(a)
      this.release(a)
    }
  }

  setTouchMove(v: number): void {
    this.method = 'touch'
    this.touchMove = v
  }

  held_(a: Action): boolean {
    return this.held.has(a)
  }

  isDown(a: Action): boolean {
    return this.held.has(a)
  }

  wasPressed(a: Action): boolean {
    return this.pressed.has(a)
  }

  wasReleased(a: Action): boolean {
    return this.released.has(a)
  }

  pointerWasPressed(): boolean {
    return this.pointerPressed
  }

  pointerWasReleased(): boolean {
    return this.pointerReleased
  }

  wasCancelled(): boolean { return this.cancelled }

  cancelThrow(): void {
    this.reset()
    this.cancelled = true
  }

  /** Stance movement axis -1..1. */
  moveAxis(): number {
    const k = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
    return Math.max(-1, Math.min(1, k + this.padAxes.lx + this.touchMove))
  }

  /** Fine aim axis -1..1 (arrow keys / right stick). */
  aimAxis(): number {
    const k = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0)
    return Math.max(-1, Math.min(1, k + this.padAxes.rx))
  }

  /** Spin input from keys/sticks while charging (-1..1). */
  spinAxis(): number {
    const k = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0)
    return Math.max(-1, Math.min(1, k + this.padAxes.lx + this.padAxes.rx + this.touchMove))
  }

  /** Clear edge-triggered state; call at the end of every fixed step that consumed input. */
  endStep(): void {
    this.pressed.clear()
    this.released.clear()
    this.pointerPressed = false
    this.pointerReleased = false
    this.cancelled = false
  }

  /** Forget everything held (after menus) so a click on a button does not bowl. */
  reset(): void {
    this.blockedPad = new Set([...this.blockedPad, ...this.padHeld])
    this.keys.clear()
    this.touchMove = 0
    this.padAxes = { lx: 0, ly: 0, rx: 0, trigger: 0 }
    this.pointerMoved = false
    this.pointerId = null
    this.cancelled = false
    this.pressed.clear()
    this.released.clear()
    this.held.clear()
    this.padHeld.clear()
    this.touchHeld.clear()
    this.pointer.down = false
    this.pointerPressed = false
    this.pointerReleased = false
  }
}
