import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input } from '../src/engine/input'

afterEach(() => vi.unstubAllGlobals())
function create() {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const target = new EventTarget()
  const canvas = Object.assign(target, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), setPointerCapture: () => {} })
  const input = new Input(canvas as unknown as HTMLCanvasElement)
  const event = (type: string, id = 1) => {
    const e = new Event(type)
    Object.assign(e, { button: 0, pointerType: 'touch', pointerId: id, clientX: 50, clientY: 50 })
    target.dispatchEvent(e)
  }
  return { input, event }
}
describe('input regressions', () => {
  it('clears touch movement and held actions on reset', () => {
    const { input } = create()
    input.setTouchMove(1); input.setTouchAction('throw', true); input.reset()
    expect(input.moveAxis()).toBe(0); expect(input.isDown('throw')).toBe(false)
  })
  it('cancels without delivering a release', () => {
    const { input, event } = create()
    event('pointerdown'); input.endStep(); event('pointercancel')
    expect(input.wasCancelled()).toBe(true); expect(input.pointerWasReleased()).toBe(false)
  })
  it('ignores a second pointer releasing the active gesture', () => {
    const { input, event } = create()
    event('pointerdown'); input.endStep(); event('pointerup', 2)
    expect(input.pointer.down).toBe(true)
    event('pointerup'); expect(input.pointerWasReleased()).toBe(true)
  })
  it('cancels on window blur', () => {
    const { input, event } = create()
    event('pointerdown'); window.dispatchEvent(new Event('blur'))
    expect(input.wasCancelled()).toBe(true); expect(input.pointer.down).toBe(false)
  })
  it('requires gamepad release after resetting held menu buttons', () => {
    const { input } = create()
    const button = { pressed: true, value: 1 }
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, 0, 0], buttons: [button] }] })
    input.poll(); expect(input.isDown('throw')).toBe(true)
    input.reset(); input.poll(); expect(input.isDown('throw')).toBe(false)
    button.pressed = false; input.poll(); button.pressed = true; input.poll()
    expect(input.wasPressed('throw')).toBe(true)
  })
  it('cancels a held throw when the gamepad disconnects', () => {
    const { input } = create()
    let connected = true
    vi.stubGlobal('navigator', { getGamepads: () => connected ? [{ connected: true, axes: [0], buttons: [{ pressed: true }] }] : [] })
    input.poll(); input.endStep(); connected = false; input.poll()
    expect(input.wasCancelled()).toBe(true); expect(input.isDown('throw')).toBe(false)
  })
})
