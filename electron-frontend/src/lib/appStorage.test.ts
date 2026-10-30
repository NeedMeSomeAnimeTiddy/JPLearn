import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY, defaultSettings, loadSettings } from './appStorage'

/* audit 17, N1: every stored setting is checked on its own, and a bad one falls back alone */
describe('loadSettings', () => {
  const store = (value: unknown) => window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
  })
  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('keeps well-formed values', () => {
    store({
      fontSize: 'large', motionStyle: 'lively', reducedMotion: true,
      cursor: { mode: 'animated', theme: 'sakura', size: 3, color: '#ffffff' },
      pomodoroEnabled: true, pomodoroWorkMinutes: 50, pomodoroBreakMinutes: 10,
      pomodoroLongBreakMinutes: 30, pomodoroSessionsBeforeLongBreak: 6, pomodoroShowTimerInHud: false,
    })
    const settings = loadSettings()
    expect(settings.fontSize).toBe('large')
    expect(settings.motionStyle).toBe('lively')
    expect(settings.reducedMotion).toBe(true)
    expect(settings.cursor).toEqual({ mode: 'animated', theme: 'sakura', size: 3, color: '#ffffff' })
    expect(settings.pomodoroWorkMinutes).toBe(50)
    expect(settings.pomodoroSessionsBeforeLongBreak).toBe(6)
    expect(settings.pomodoroShowTimerInHud).toBe(false)
  })

  it('drops a bad font size, motion style and reduced-motion flag to their defaults', () => {
    store({ fontSize: 'huge', motionStyle: 'spin', reducedMotion: 'yes', voiceEnabled: false })
    const settings = loadSettings()
    const defaults = defaultSettings()
    expect(settings.fontSize).toBe(defaults.fontSize)
    expect(settings.motionStyle).toBe(defaults.motionStyle)
    expect(settings.reducedMotion).toBe(defaults.reducedMotion)
    /* a sibling saved correctly is kept */
    expect(settings.voiceEnabled).toBe(false)
  })

  it('checks the cursor field by field, the theme against its list', () => {
    store({ cursor: { mode: 'animated', theme: 'rainbow', size: 9, color: 4 } })
    const defaults = defaultSettings().cursor
    expect(loadSettings().cursor).toEqual({ mode: 'animated', theme: defaults.theme, size: defaults.size, color: defaults.color })
    store({ cursor: 'neon' })
    expect(loadSettings().cursor).toEqual(defaults)
  })

  it('holds the timer to whole minutes in range, each number on its own', () => {
    store({
      pomodoroWorkMinutes: 121, pomodoroBreakMinutes: 2.5, pomodoroLongBreakMinutes: 60,
      pomodoroSessionsBeforeLongBreak: 0, pomodoroEnabled: 1,
    })
    const settings = loadSettings()
    const defaults = defaultSettings()
    expect(settings.pomodoroWorkMinutes).toBe(defaults.pomodoroWorkMinutes)
    expect(settings.pomodoroBreakMinutes).toBe(defaults.pomodoroBreakMinutes)
    expect(settings.pomodoroLongBreakMinutes).toBe(60)
    expect(settings.pomodoroSessionsBeforeLongBreak).toBe(defaults.pomodoroSessionsBeforeLongBreak)
    expect(settings.pomodoroEnabled).toBe(defaults.pomodoroEnabled)
    store({ pomodoroWorkMinutes: Number.NaN, pomodoroBreakMinutes: '5' })
    expect(loadSettings().pomodoroWorkMinutes).toBe(defaults.pomodoroWorkMinutes)
    expect(loadSettings().pomodoroBreakMinutes).toBe(defaults.pomodoroBreakMinutes)
  })
})
