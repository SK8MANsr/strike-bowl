import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import zh from '../src/i18n/zh-CN.json'
import pt from '../src/i18n/pt-BR.json'
import { detectLocale, resolveLocale } from '../src/engine/i18n'

describe('i18n', () => {
  it('detects Chinese browsers and defaults to English', () => {
    expect(detectLocale(['zh-CN', 'en'])).toBe('zh-CN')
    expect(detectLocale(['zh-TW'])).toBe('zh-CN')
    expect(detectLocale(['ZH'])).toBe('zh-CN')
    expect(detectLocale(['en-US', 'zh-CN'])).toBe('en')
    expect(detectLocale([])).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
    expect(detectLocale(['pt-BR'])).toBe('pt-BR')
    expect(resolveLocale('pt-BR', ['en-US'])).toBe('pt-BR')
  })

  it('lets a saved choice win over detection', () => {
    expect(resolveLocale('en', ['zh-CN'])).toBe('en')
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN')
    expect(resolveLocale('', ['zh-CN'])).toBe('zh-CN')
  })

  it('has the same keys and placeholders in every language', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(en)) expect(vars((zh as Record<string, string>)[key]), key).toEqual(vars(value))
    for (const [key, value] of Object.entries(en)) expect(vars((pt as Record<string, string>)[key]), key).toEqual(vars(value))
  })

  it('provides translated accessible labels for game controls', () => {
    for (const locale of [en, pt, zh]) {
      expect(locale['a11y.pause']).toBeTruthy()
      expect(locale['a11y.left']).toBeTruthy()
      expect(locale['a11y.right']).toBeTruthy()
      expect(locale['a11y.throw']).toBeTruthy()
    }
  })
})
