import type {
  AppSettings, CardScores, LastSessionPrefs,
  ScriptStats, StatsByScript, StudySummaryPayload,
} from '../types'
import type { CustomTheme, ThemeScope } from '../features/theme/types'
import {
  getFallbackThemeForMode, getThemeModeForTheme, isThemeKey, isThemeMode, isThemeScope,
  normalizeCustomTheme, resolveThemeMode,
} from '../features/theme/utils'
import { DEFAULT_VOICE_SPEED } from '../features/voice'
import { clampAssistantChatOcrMinConfidence, isAssistantToastLimit } from '../features/tutor'
import { FONT_SIZE_ORDER, MOTION_STYLE_OPTIONS, isAppFontPreset } from '../constants'
import { CURSOR_MODE_OPTIONS, CURSOR_SIZE_OPTIONS, CURSOR_THEME_OPTIONS } from '../features/cursor/constants'
// From constants.ts, not the feature barrel: constants.ts imports only a type, so no cycle back here.
import { PROGRESSION_OVERRIDES_STORAGE_KEY } from '../features/progression/constants'

export const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'

export const SETTINGS_STORAGE_KEY = 'jplearn-desktop-settings-v1'

export const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'

export const SUMMARY_SNAPSHOT_STORAGE_KEY = 'jplearn-desktop-summary-snapshot-v1'

export const SESSION_STORAGE_KEY = 'jplearn-desktop-session-v1'

export const PREFS_STORAGE_KEY = 'jplearn-desktop-session-prefs-v1'

export const SUMMARY_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000

/**
 * The window's own storage that "Back up everything" carries beside the database, and that a
 * restore writes back. Must match BACKUP_WINDOW_STATE_KEYS in electron/ipc_security.cjs, which
 * refuses any other key on the way in and out.
 */
export const BACKUP_WINDOW_STATE_KEYS: readonly string[] = [
  STATS_STORAGE_KEY,
  PROGRESSION_OVERRIDES_STORAGE_KEY,
  PREFS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
]

/**
 * Last-used deck/minigame and session toggles. Read by both App (activeScript,
 * activeGame) and useStudySession (lives/leech/confidence/target), so it lives
 * here rather than in either one.
 */
export function loadSessionPrefs(): LastSessionPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LastSessionPrefs
  } catch {
    return null
  }
}

/**
 * Merge a partial update into the stored prefs.
 *
 * Two independent owners write this blob — `useStudySession` (deck, minigame,
 * session toggles) and block selection — and each knows only its own fields.
 * Writing a freshly built object from either would drop the other's, so both go
 * through here.
 */
export function mergeSessionPrefs(update: Partial<LastSessionPrefs>): void {
  try {
    const existing = loadSessionPrefs() ?? {}
    const merged = { ...existing, ...update, updatedAt: new Date().toISOString() }
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(merged))
  } catch { /* ignore — persistence is best-effort */ }
}


export const EMPTY_SCRIPT_STATS: ScriptStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
}

export function defaultStatsByScript(): StatsByScript {
  return {
    hiragana: { ...EMPTY_SCRIPT_STATS },
    katakana: { ...EMPTY_SCRIPT_STATS },
    kanji_n5: { ...EMPTY_SCRIPT_STATS },
    vocab_n5: { ...EMPTY_SCRIPT_STATS },
    grammar_patterns: { ...EMPTY_SCRIPT_STATS },
    sentence_examples: { ...EMPTY_SCRIPT_STATS },
  }
}

export function loadSavedStats(): StatsByScript {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY)
    if (!raw) return defaultStatsByScript()

    const parsed = JSON.parse(raw) as Partial<StatsByScript>
    return {
      hiragana: { ...EMPTY_SCRIPT_STATS, ...(parsed.hiragana ?? {}) },
      katakana: { ...EMPTY_SCRIPT_STATS, ...(parsed.katakana ?? {}) },
      kanji_n5: { ...EMPTY_SCRIPT_STATS, ...(parsed.kanji_n5 ?? {}) },
      vocab_n5: { ...EMPTY_SCRIPT_STATS, ...(parsed.vocab_n5 ?? {}) },
      grammar_patterns: { ...EMPTY_SCRIPT_STATS, ...(parsed.grammar_patterns ?? {}) },
      sentence_examples: { ...EMPTY_SCRIPT_STATS, ...(parsed.sentence_examples ?? {}) },
    }
  } catch {
    return defaultStatsByScript()
  }
}

export function defaultSettings(): AppSettings {
  return {
    reducedMotion:
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fontSize: 'medium',
    appFont: 'system_ui',
    themeMode: 'dark',
    theme: 'lofi_dusk',
    themeScope: 'preset',
    activeCustomThemeId: null,
    customThemes: [],
    motionStyle: 'glide',
    assistantToastLimit: 1,
    assistantChatEnabled: true,
    assistantChatAudioEnabled: true,
    assistantChatOcrMinConfidence: 0.3,
    scenarioAiEvaluationEnabled: true,
    romajiConversionEnabled: true,
    showKeyboardPrompts: false,
    furiganaEnabled: false,
    furiganaAutoHideMastered: false,
    voiceEnabled: true,
    voiceSpeaker: 'zundamon_normal',
    voiceSpeed: DEFAULT_VOICE_SPEED,
    ambientAudioEnabled: false,
    cursor: { mode: 'system', theme: 'classic', size: 1, color: null },
    pomodoroEnabled: false,
    pomodoroWorkMinutes: 25,
    pomodoroBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroSessionsBeforeLongBreak: 4,
    pomodoroShowTimerInHud: true,
  }
}

/* EVERY FIELD IS CHECKED ON ITS OWN (audit 17, N1). A stored value of the wrong shape falls back to
   its default alone, and its neighbours keep what was saved: a bad `fontSize` used to pass straight
   through and throw when Settings looked it up. */
const isOneOf = <T,>(options: readonly T[], value: unknown): value is T => options.includes(value as T)

function wholeNumberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function loadCursorSettings(stored: unknown, defaults: AppSettings['cursor']): AppSettings['cursor'] {
  const cursor = stored && typeof stored === 'object' ? stored as Partial<Record<keyof AppSettings['cursor'], unknown>> : {}
  return {
    mode: isOneOf(CURSOR_MODE_OPTIONS.map((option) => option.key), cursor.mode) ? cursor.mode : defaults.mode,
    theme: isOneOf(CURSOR_THEME_OPTIONS.map((option) => option.key), cursor.theme) ? cursor.theme : defaults.theme,
    size: isOneOf(CURSOR_SIZE_OPTIONS.map((option) => option.value), cursor.size) ? cursor.size : defaults.size,
    color: typeof cursor.color === 'string' || cursor.color === null ? cursor.color : defaults.color,
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const defaults = defaultSettings()
    const parsedMode = isThemeMode(parsed.themeMode) ? parsed.themeMode : null
    const parsedTheme = isThemeKey(parsed.theme) ? parsed.theme : null
    const normalizedMode = parsedMode ?? (parsedTheme ? getThemeModeForTheme(parsedTheme) : defaults.themeMode)
    const normalizedTheme = parsedTheme && getThemeModeForTheme(parsedTheme) === normalizedMode
      ? parsedTheme
      : getFallbackThemeForMode(normalizedMode)

    const customThemes = Array.isArray(parsed.customThemes)
      ? parsed.customThemes
        .map((item) => normalizeCustomTheme(item))
        .filter((item): item is CustomTheme => item !== null)
      : []

    const parsedThemeScope = isThemeScope(parsed.themeScope) ? parsed.themeScope : 'preset'
    const parsedActiveCustomThemeId = typeof parsed.activeCustomThemeId === 'string'
      ? parsed.activeCustomThemeId
      : null
    const hasSelectedCustomTheme = parsedActiveCustomThemeId
      ? customThemes.some((theme) => theme.id === parsedActiveCustomThemeId)
      : false
    const normalizedThemeScope: ThemeScope =
      parsedThemeScope === 'custom' && hasSelectedCustomTheme ? 'custom' : 'preset'
    const normalizedActiveCustomThemeId = normalizedThemeScope === 'custom' ? parsedActiveCustomThemeId : null

    let resolvedTheme = normalizedTheme
    if (normalizedThemeScope === 'custom' && normalizedActiveCustomThemeId) {
      const activeCustomTheme = customThemes.find((theme) => theme.id === normalizedActiveCustomThemeId)
      if (activeCustomTheme) {
        resolvedTheme = activeCustomTheme.baseThemeByMode[resolveThemeMode(normalizedMode)]
      }
    }

    // One-time migration to the Lofi Dusk restyle: move users still sitting on
    // the previous default (harbor_mist) onto the new default. Runs once and
    // never overrides a theme the user deliberately picked afterwards.
    if (normalizedThemeScope === 'preset') {
      const THEME_MIGRATION_KEY = 'jplearn-desktop-theme-migration-v1'
      if (window.localStorage.getItem(THEME_MIGRATION_KEY) !== 'done') {
        if (resolvedTheme === 'harbor_mist') {
          resolvedTheme = 'lofi_dusk'
        } else if (resolvedTheme === 'harbor_mist_light') {
          resolvedTheme = 'lofi_dusk_light'
        }
        window.localStorage.setItem(THEME_MIGRATION_KEY, 'done')
      }
    }

    return {
      ...defaults,
      ...parsed,
      appFont: isAppFontPreset(parsed.appFont) ? parsed.appFont : defaults.appFont,
      themeMode: normalizedMode,
      theme: resolvedTheme,
      themeScope: normalizedThemeScope,
      activeCustomThemeId: normalizedActiveCustomThemeId,
      customThemes,
      assistantToastLimit: isAssistantToastLimit(parsed.assistantToastLimit)
        ? parsed.assistantToastLimit
        : defaults.assistantToastLimit,
      assistantChatEnabled:
        typeof parsed.assistantChatEnabled === 'boolean'
          ? parsed.assistantChatEnabled
          : defaults.assistantChatEnabled,
      assistantChatAudioEnabled:
        typeof parsed.assistantChatAudioEnabled === 'boolean'
          ? parsed.assistantChatAudioEnabled
          : defaults.assistantChatAudioEnabled,
      assistantChatOcrMinConfidence:
        typeof parsed.assistantChatOcrMinConfidence === 'number'
          ? clampAssistantChatOcrMinConfidence(parsed.assistantChatOcrMinConfidence)
          : defaults.assistantChatOcrMinConfidence,
      scenarioAiEvaluationEnabled:
        typeof parsed.scenarioAiEvaluationEnabled === 'boolean'
          ? parsed.scenarioAiEvaluationEnabled
          : defaults.scenarioAiEvaluationEnabled,
      romajiConversionEnabled:
        typeof parsed.romajiConversionEnabled === 'boolean'
          ? parsed.romajiConversionEnabled
          : defaults.romajiConversionEnabled,
      showKeyboardPrompts:
        typeof parsed.showKeyboardPrompts === 'boolean'
          ? parsed.showKeyboardPrompts
          : defaults.showKeyboardPrompts,
      furiganaEnabled:
        typeof parsed.furiganaEnabled === 'boolean'
          ? parsed.furiganaEnabled
          : defaults.furiganaEnabled,
      furiganaAutoHideMastered:
        typeof parsed.furiganaAutoHideMastered === 'boolean'
          ? parsed.furiganaAutoHideMastered
          : defaults.furiganaAutoHideMastered,
      voiceEnabled:
        typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : defaults.voiceEnabled,
      voiceSpeaker:
        typeof parsed.voiceSpeaker === 'string' ? parsed.voiceSpeaker : defaults.voiceSpeaker,
      voiceSpeed:
        typeof parsed.voiceSpeed === 'number' && parsed.voiceSpeed >= 0.5 && parsed.voiceSpeed <= 2
          ? parsed.voiceSpeed
          : defaults.voiceSpeed,
      ambientAudioEnabled:
        typeof parsed.ambientAudioEnabled === 'boolean'
          ? parsed.ambientAudioEnabled
          : defaults.ambientAudioEnabled,
      fontSize: isOneOf(FONT_SIZE_ORDER, parsed.fontSize) ? parsed.fontSize : defaults.fontSize,
      motionStyle: isOneOf(MOTION_STYLE_OPTIONS.map((option) => option.key), parsed.motionStyle)
        ? parsed.motionStyle
        : defaults.motionStyle,
      reducedMotion: booleanOr(parsed.reducedMotion, defaults.reducedMotion),
      cursor: loadCursorSettings(parsed.cursor, defaults.cursor),
      pomodoroEnabled: booleanOr(parsed.pomodoroEnabled, defaults.pomodoroEnabled),
      pomodoroWorkMinutes: wholeNumberIn(parsed.pomodoroWorkMinutes, 1, 120, defaults.pomodoroWorkMinutes),
      pomodoroBreakMinutes: wholeNumberIn(parsed.pomodoroBreakMinutes, 1, 30, defaults.pomodoroBreakMinutes),
      pomodoroLongBreakMinutes: wholeNumberIn(parsed.pomodoroLongBreakMinutes, 1, 60, defaults.pomodoroLongBreakMinutes),
      pomodoroSessionsBeforeLongBreak: wholeNumberIn(
        parsed.pomodoroSessionsBeforeLongBreak, 1, 10, defaults.pomodoroSessionsBeforeLongBreak,
      ),
      pomodoroShowTimerInHud: booleanOr(parsed.pomodoroShowTimerInHud, defaults.pomodoroShowTimerInHud),
    }
  } catch {
    return defaultSettings()
  }
}

export function loadCardScores(): CardScores {
  try {
    const raw = window.localStorage.getItem(CARD_SCORES_STORAGE_KEY)
    if (!raw) return { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, sentence_examples: {} }
    const parsed = JSON.parse(raw) as Partial<CardScores>
    return {
      hiragana: parsed.hiragana ?? {},
      katakana: parsed.katakana ?? {},
      kanji_n5: parsed.kanji_n5 ?? {},
      vocab_n5: parsed.vocab_n5 ?? {},
      grammar_patterns: parsed.grammar_patterns ?? {},
      sentence_examples: parsed.sentence_examples ?? {},
    }
  } catch {
    return { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, sentence_examples: {} }
  }
}

export function loadSummarySnapshot(): StudySummaryPayload | null {
  try {
    const raw = window.localStorage.getItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      capturedAtUtc?: string
      payload?: unknown
    }

    if (typeof parsed.capturedAtUtc !== 'string') {
      return null
    }

    const capturedMs = Date.parse(parsed.capturedAtUtc)
    if (!Number.isFinite(capturedMs) || Date.now() - capturedMs > SUMMARY_SNAPSHOT_MAX_AGE_MS) {
      window.localStorage.removeItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
      return null
    }

    if (!parsed.payload || typeof parsed.payload !== 'object') {
      return null
    }

    const payload = parsed.payload as { decks?: unknown }
    if (!Array.isArray(payload.decks)) {
      return null
    }

    return parsed.payload as StudySummaryPayload
  } catch {
    return null
  }
}

export function saveSummarySnapshot(payload: StudySummaryPayload): void {
  try {
    window.localStorage.setItem(
      SUMMARY_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        capturedAtUtc: new Date().toISOString(),
        payload,
      }),
    )
  } catch {
    // Non-fatal: startup can continue even if local snapshot writes fail.
  }
}
