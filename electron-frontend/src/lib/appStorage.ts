import type {
  AppSettings, CardScores, ExpertiseLevel, MinigameStats, MinigameStatsByScript,
  ScriptKey, ScriptStats, StatsByScript, StudySummaryPayload,
} from '../types'
import type { CustomTheme, ThemeScope } from '../features/theme/types'
import {
  getFallbackThemeForMode, getThemeModeForTheme, isThemeKey, isThemeMode, isThemeScope,
  normalizeCustomTheme, resolveThemeMode,
} from '../features/theme/utils'
import { DEFAULT_VOICE_SPEED } from '../features/voice'
import { clampAssistantChatOcrMinConfidence, isAssistantToastLimit } from '../features/tutor'
import { isAppFontPreset } from '../constants'

export const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'

export const SETTINGS_STORAGE_KEY = 'jplearn-desktop-settings-v1'

export const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'

export const SUMMARY_SNAPSHOT_STORAGE_KEY = 'jplearn-desktop-summary-snapshot-v1'

export const SESSION_STORAGE_KEY = 'jplearn-desktop-session-v1'

export const PREFS_STORAGE_KEY = 'jplearn-desktop-session-prefs-v1'

export const SUMMARY_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000


export const EXPERTISE_LEVEL_TO_SCRIPT_KEYS: Record<ExpertiseLevel, ScriptKey[]> = {
  total_beginner:       [],
  know_hiragana:        ['hiragana'],
  know_kana:            ['hiragana', 'katakana'],
  jlpt_n5_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n4_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n3_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n2_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n1_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
}

export function deriveExpertiseLevelFromChecked(checked: Set<string>): ExpertiseLevel {
  if (checked.has('kanji_n1') || checked.has('vocab_n1')) return 'jlpt_n1_foundation'
  if (checked.has('kanji_n2') || checked.has('vocab_n2')) return 'jlpt_n2_foundation'
  if (checked.has('kanji_n3') || checked.has('vocab_n3')) return 'jlpt_n3_foundation'
  if (checked.has('kanji_n4') || checked.has('vocab_n4')) return 'jlpt_n4_foundation'
  if (checked.has('kanji_n5') || checked.has('vocab_n5')) return 'jlpt_n5_foundation'
  if (checked.has('katakana')) return 'know_kana'
  if (checked.has('hiragana')) return 'know_hiragana'
  return 'total_beginner'
}

export const EMPTY_SCRIPT_STATS: ScriptStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
}

export const EMPTY_MINIGAME_STATS: MinigameStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
  points: 0,
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

export function defaultMinigameStatsByScript(): MinigameStatsByScript {
  return {
    hiragana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      handwriting: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      kanji_compound_builder: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    katakana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      handwriting: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      kanji_compound_builder: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    kanji_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      handwriting: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      kanji_compound_builder: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    vocab_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      handwriting: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      kanji_compound_builder: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    grammar_patterns: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      handwriting: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      kanji_compound_builder: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    sentence_examples: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      handwriting: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      kanji_compound_builder: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
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
