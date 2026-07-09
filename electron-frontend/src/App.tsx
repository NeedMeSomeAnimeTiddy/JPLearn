import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import type { LastSessionPrefs, LearningPathStatus, SectionReadiness, SessionRunReport } from './types'
import type { GameCard } from './generated/types'
import { SetupWizard } from './components/SetupWizard'
import { DictionaryPopup } from './components/DictionaryPopup'
import { ResumeToast } from './components/ResumeToast'
import { MinigameIcon } from './components/MinigameIcon'
import { HomeView } from './views/HomeView'
import { ScriptHubView } from './views/ScriptHubView'
import { MinigameView } from './views/MinigameView'
import { OverviewView } from './views/OverviewView'
import { JLPTPrepView } from './views/JLPTPrepView'
import { OnboardingWizard } from './features/onboarding'
import { ReadinessWarningModal } from './components/ReadinessWarningModal'
import { SessionProvider } from './context/SessionContext'
import { assessTypedAnswer } from './lib/answerAssessment'
import type { TypedAnswerState } from './lib/answerAssessment'
import { assessTypedRecallAnswer } from './lib/typedRecallAssessment'
import { toHiragana } from 'wanakana'
import { Activity, ArrowLeft, ArrowRight, BarChart3, BookText, Bug, CheckCircle2, ChevronDown, Circle, Code2, Copy, Download, Flame, House, ImagePlus, Keyboard, Languages, ListChecks, Menu, MessageCircle, Minus, Palette, PlayCircle, Plus, RefreshCw, RotateCcw, Search, Settings, Square, Trash2, X } from 'lucide-react'
import './App.css'
import { useTheme } from './features/theme'
import { ThemeSettingsTab } from './features/theme/components/ThemeSettingsTab'
import type { ThemeMode, ThemeKey, ThemeScope, CustomTheme } from './features/theme/types'
import { isThemeMode, isThemeKey, isThemeScope, getThemeModeForTheme, getFallbackThemeForMode, normalizeCustomTheme } from './features/theme/utils'
import { useBackground, BackgroundSettingsTab, clampBackgroundBlur, normalizeCustomBackgroundDataUrl, isBackgroundStyle, BACKGROUND_BLUR_DEFAULT } from './features/background'
import type { BackgroundStyle } from './features/background'
import { useVoice, splitSpeechSegments, VoiceSettingsTab } from './features/voice'
import { useModels } from './features/models'
import { useTutor, TutorChatPanel, OcrWorkbench, TutorToast, TutorSettingsTab, TutorTitlebarButton, clampAssistantChatOcrMinConfidence, isAssistantToastLimit } from './features/tutor'
import type { AssistantToast } from './features/tutor'
import { useCursor, CursorFollower, CursorSettingsTab } from './features/cursor'
import { DevDashboard } from './features/devtools'
import { SURPRISE_PROMPTS, SCRIPT_MODE_PROMPT_PACKS, TAG_PROMPT_PACKS, CLOZE_TEMPLATES, STORY_CHAPTERS } from './lib/contentTemplates'
import type { RoundDictionaryNote } from './types'
import {
  SECTION_META,
  MINIGAMES,
  SCRIPT_MINIGAMES,
  SCRIPT_INTERLEAVE_MODES,
  SCRIPT_LABELS,
} from './constants'

type StudySummaryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getStudySummary>
>
type DeckSlugInput = Parameters<typeof window.jplearnDesktop.getDeckCards>[0]
type OverviewCharacterMasteryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getOverviewCharacterMastery>
>
type ScriptDeck = Awaited<ReturnType<typeof window.jplearnDesktop.getDeckCards>>
type BlockProgressPayload = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>
type StudyQueueResponse = Awaited<ReturnType<typeof window.jplearnDesktop.getStudyQueue>>
type GrammarMinigameResponse = Awaited<
  ReturnType<NonNullable<typeof window.jplearnDesktop.getGrammarMinigameData>>
>
type SessionGoalStartResponse = Awaited<ReturnType<typeof window.jplearnDesktop.startSessionGoal>>
type SessionSummaryResponse = Awaited<ReturnType<typeof window.jplearnDesktop.getSessionSummary>>
type SessionSummaryPayload = NonNullable<SessionSummaryResponse['summary']>
type XPProgress = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getXpProgress>>>
type RecommendationItem = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getRecommendations>>>['recommendations'][number]
type BlockInfo = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>['blocks'][number]
type JlptProgressCard = Pick<ScriptDeck['cards'][number], 'id' | 'character' | 'tags'>
type OverviewKanjiCard = OverviewCharacterMasteryPayload['kanji_cards'][number]
type OverviewCategoryBlocks = OverviewCharacterMasteryPayload['category_blocks']
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns' | 'sentence_examples'
type VocabCategory = 'greetings' | 'numbers' | 'time_days' | 'family' | 'body' | 'food_drink' | 'school_study' | 'places' | 'transport' | 'adjectives' | 'verbs' | 'nouns'
type VocabCategorySlug = 'vocab_greetings' | 'vocab_numbers' | 'vocab_time_days' | 'vocab_family' | 'vocab_body' | 'vocab_food_drink' | 'vocab_school_study' | 'vocab_places' | 'vocab_transport' | 'vocab_adjectives' | 'vocab_verbs' | 'vocab_nouns'
type KanjiCategory = 'numbers_time' | 'nature_world' | 'people_body' | 'study_language' | 'actions_travel' | 'n4_society_roles' | 'n4_mind_thought' | 'n4_daily_life' | 'n4_time_action' | 'n3_governance' | 'n3_communication' | 'n3_movement' | 'n3_achievement' | 'n2_professionalism' | 'n2_economics' | 'n2_analysis' | 'n1_law_order' | 'n1_ideology' | 'n1_literary'
type KanjiCategorySlug = 'kanji_numbers_time' | 'kanji_nature_world' | 'kanji_people_body' | 'kanji_study_language' | 'kanji_actions_travel' | 'kanji_n4_society_roles' | 'kanji_n4_mind_thought' | 'kanji_n4_daily_life' | 'kanji_n4_time_action' | 'kanji_n3_governance' | 'kanji_n3_communication' | 'kanji_n3_movement' | 'kanji_n3_achievement' | 'kanji_n2_professionalism' | 'kanji_n2_economics' | 'kanji_n2_analysis' | 'kanji_n1_law_order' | 'kanji_n1_ideology' | 'kanji_n1_literary'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'stroke_order' | 'typed_recall' | 'speech_recall' | 'sentence_assembly' | 'particle_cloze' | 'vibe_check' | 'imposter' | 'listening_audio_first' | 'dictation' | 'interleave_mix'
type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>
type ShortcutSubmenuKey = 'all_maps' | ScriptKey | 'dev_tools' | 'dev_checks'
type InterleaveWeights = Record<'romaji_sprint' | 'meaning_match' | 'character_match' | 'particle_cloze', number>
type AppView = 'home' | 'script_hub' | 'minigame' | 'jlpt_prep'
type NavDirection = 'forward' | 'back'
type FontSize = 'small' | 'medium' | 'large'
type AppFontPreset =
  | 'kiwi_maru'
  | 'bizin_gothic'
  | 'kaisei_decol'
  | 'noto_sans_jp'
  | 'shippori_mincho'
  | 'zen_old_mincho'
  | 'reggae_one'
  | 'system_ui'
type AnimationStyle = 'calm_fade' | 'glide' | 'lively'
type FeedbackTone = 'success' | 'error' | null
type ExpertiseLevel = 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation' | 'jlpt_n4_foundation' | 'jlpt_n3_foundation' | 'jlpt_n2_foundation' | 'jlpt_n1_foundation'
type SettingsTabKey = 'appearance' | 'assistant' | 'system'

interface SettingsCollapsibleSectionProps {
  id: string
  title: string
  description?: string
  meta?: ReactNode
  collapsed: boolean
  onToggle: () => void
  className?: string
  actions?: ReactNode
  children: ReactNode
}

function SettingsCollapsibleSection({
  id,
  title,
  description,
  meta,
  collapsed,
  onToggle,
  className,
  actions,
  children,
}: SettingsCollapsibleSectionProps) {
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }, [onToggle])

  return (
    <section className={`settings-collapsible-card${className ? ` ${className}` : ''}`}>
      <div
        className="settings-collapsible-head"
        role="button"
        tabIndex={0}
        aria-controls={`${id}-body`}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-collapsible-copy">
          <p className="settings-collapsible-title">{title}</p>
          {description ? <p className="settings-collapsible-description">{description}</p> : null}
          {meta ? <p className="settings-collapsible-meta">{meta}</p> : null}
        </div>
        <div className="settings-collapsible-actions">
          {actions ? <div className="settings-collapsible-action-group">{actions}</div> : null}
          <span className={`settings-collapsible-chevron${collapsed ? '' : ' is-open'}`} aria-hidden="true">
            <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
        </div>
      </div>
      <div id={`${id}-body`} className={`settings-collapsible-body${collapsed ? '' : ' is-open'}`}>
        {!collapsed ? children : null}
      </div>
    </section>
  )
}

const PERFORMANCE_PERFECT_MS = 700
const PERFORMANCE_GOOD_MS = 2200
const ROUND_QUEUE_TIMEOUT_MS = 1200
const STUDY_QUEUE_CACHE_TTL_MS = 45000
const DECK_LOAD_TIMEOUT_MS = 15000
const STARTUP_WARMUP_INITIAL_DELAY_MS = 900
const STARTUP_WARMUP_YIELD_DEADLINE_MS = 45

const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string; icon: LucideIcon }> = [
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'assistant', label: 'Assistant', icon: MessageCircle },
  { key: 'system', label: 'System', icon: Settings },
]
const DEFAULT_LIVES = 3
const SESSION_LENGTH_PRESETS = [
  { key: 'short', label: 'Short', items: 8, icon: Minus },
  { key: 'medium', label: 'Medium', items: 12, icon: Square },
  { key: 'long', label: 'Long', items: 20, icon: Plus },
] as const
const DEFAULT_SESSION_LENGTH_PRESET = SESSION_LENGTH_PRESETS[1]
const DEFAULT_INTERLEAVE_WEIGHTS: InterleaveWeights = {
  romaji_sprint: 1,
  meaning_match: 1,
  character_match: 1,
  particle_cloze: 1,
}
const POINT_COMBO_THRESHOLDS = [3, 6, 9] as const




interface AppSettings {
  reducedMotion: boolean
  fontSize: FontSize
  appFont: AppFontPreset
  themeMode: ThemeMode
  theme: ThemeKey
  themeScope: ThemeScope
  activeCustomThemeId: string | null
  customThemes: CustomTheme[]
  motionStyle: AnimationStyle
  backgroundStyle: BackgroundStyle
  backgroundBlur: number
  customBackgroundDataUrl: string | null
  customBackgroundName: string | null
  assistantToastLimit: 0 | 1
  assistantChatEnabled: boolean
  assistantChatAudioEnabled: boolean
  assistantChatOcrMinConfidence: number
  showKeyboardPrompts: boolean
  furiganaEnabled: boolean
  voiceEnabled: boolean
  voiceSpeaker: string
  ambientAudioEnabled: boolean
  cursor: { mode: string; theme: string; size: number; color: string | null }
}



interface RoundOption {
  id: string
  label: string
}

interface RoundState {
  cardId: number
  mode: PlayableMinigame
  audioText: string
  exampleSentenceAudioText: string | null
  surprisePrompt: boolean
  curriculumStage: 1 | 2 | 3
  chapterNumber: 1 | 2 | 3 | null
  chapterLabel: string | null
  hintText: string | null
  dictionarySeedQuery: string | null
  dictionaryNote: RoundDictionaryNote | null
  promptLabel: string
  focusText: string
  answer: string
  answerDisplay?: string | null
  options: RoundOption[]
}

interface ScriptStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
}

interface MinigameStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
  points: number
}

type JlptLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'

interface JlptLevelProgress {
  key: JlptLevel
  label: string
  cardIds: number[]
  sampleChars: string[]
  mastery: number
  unlocked: boolean
  total: number
}

interface CategoryProgress {
  key: string
  label: string
  slug: string
  cardIds: number[]
  sampleChars: string[]
  mastery: number
  unlocked: boolean
  total: number
}

interface StudyPlanCoverageRow {
  key: ScriptKey
  label: string
  mastery: number
  total: number
  unlocked: boolean
  difficulty: number
}

type StudyPlanStage = 'starter' | 'building' | 'advanced'

interface StudyPlanShortcut {
  key: string
  label: string
  note: string
  script: ScriptKey
  minigame: MinigameKey
}

interface StudyPlanSnapshot {
  coverageRows: StudyPlanCoverageRow[]
  focusRows: StudyPlanCoverageRow[]
  overallMastery: number
  recommendedMinutes: number
  sessionNote: string
  learnerStage: StudyPlanStage
  shortcutRows: StudyPlanShortcut[]
}

type StatsByScript = Record<ScriptKey, ScriptStats>
type MinigameStatsByScript = Record<ScriptKey, Record<MinigameKey, MinigameStats>>
type OverviewSectionKey = 'studyActivity' | 'mistakeBreakdown' | 'deckSnapshot'

const ALL_SCRIPT_KEYS = ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns', 'sentence_examples'] as const

const PETAL_STREAM = [
  { x: '6%', drift: '9vw', duration: '11.8s', delay: '-2.1s', size: '14px', opacity: 0.72 },
  { x: '12%', drift: '-8vw', duration: '13.2s', delay: '-5.4s', size: '12px', opacity: 0.66 },
  { x: '18%', drift: '11vw', duration: '14.6s', delay: '-3.6s', size: '16px', opacity: 0.7 },
  { x: '25%', drift: '-9vw', duration: '12.7s', delay: '-8.1s', size: '13px', opacity: 0.64 },
  { x: '32%', drift: '8vw', duration: '15.3s', delay: '-1.8s', size: '15px', opacity: 0.75 },
  { x: '39%', drift: '-7vw', duration: '13.9s', delay: '-6.7s', size: '11px', opacity: 0.62 },
  { x: '47%', drift: '10vw', duration: '16.1s', delay: '-10.4s', size: '14px', opacity: 0.68 },
  { x: '54%', drift: '-11vw', duration: '12.3s', delay: '-7.2s', size: '12px', opacity: 0.65 },
  { x: '61%', drift: '9vw', duration: '14.8s', delay: '-4.8s', size: '16px', opacity: 0.73 },
  { x: '68%', drift: '-8vw', duration: '13.5s', delay: '-9.9s', size: '13px', opacity: 0.64 },
  { x: '74%', drift: '11vw', duration: '15.7s', delay: '-11.1s', size: '15px', opacity: 0.71 },
  { x: '80%', drift: '-9vw', duration: '12.9s', delay: '-6.1s', size: '12px', opacity: 0.66 },
  { x: '87%', drift: '8vw', duration: '14.2s', delay: '-8.6s', size: '14px', opacity: 0.7 },
  { x: '93%', drift: '-7vw', duration: '16.4s', delay: '-12.7s', size: '11px', opacity: 0.6 },
  { x: '9%', drift: '-10vw', duration: '15.6s', delay: '-9.5s', size: '10px', opacity: 0.58 },
  { x: '21%', drift: '7vw', duration: '12.1s', delay: '-1.2s', size: '13px', opacity: 0.63 },
  { x: '35%', drift: '-12vw', duration: '17.3s', delay: '-13.4s', size: '15px', opacity: 0.69 },
  { x: '50%', drift: '9vw', duration: '11.4s', delay: '-4.2s', size: '12px', opacity: 0.61 },
  { x: '65%', drift: '-6vw', duration: '13.8s', delay: '-7.8s', size: '14px', opacity: 0.67 },
  { x: '76%', drift: '10vw', duration: '16.6s', delay: '-14.9s', size: '13px', opacity: 0.65 },
  { x: '89%', drift: '-8vw', duration: '12.6s', delay: '-3.3s', size: '10px', opacity: 0.57 },
] as const


const FONT_SIZE_ORDER: FontSize[] = ['small', 'medium', 'large']
const FONT_SIZE_ICON: Record<FontSize, LucideIcon> = {
  small: Minus,
  medium: Square,
  large: Plus,
}
const FONT_SIZE_LABEL: Record<FontSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

const APP_FONT_OPTIONS: Array<{ key: AppFontPreset; label: string }> = [
  { key: 'kiwi_maru', label: 'Kiwi Maru' },
  { key: 'bizin_gothic', label: 'BIZ UDPGothic' },
  { key: 'kaisei_decol', label: 'Kaisei Decol' },
  { key: 'noto_sans_jp', label: 'Noto Sans JP' },
  { key: 'shippori_mincho', label: 'Shippori Mincho' },
  { key: 'zen_old_mincho', label: 'Zen Old Mincho' },
  { key: 'reggae_one', label: 'Reggae One' },
  { key: 'system_ui', label: 'System UI' },
]

function isAppFontPreset(value: unknown): value is AppFontPreset {
  return (
    value === 'kiwi_maru'
    || value === 'bizin_gothic'
    || value === 'kaisei_decol'
    || value === 'noto_sans_jp'
    || value === 'shippori_mincho'
    || value === 'zen_old_mincho'
    || value === 'reggae_one'
    || value === 'system_ui'
  )
}

const MOTION_STYLE_OPTIONS: Array<{ key: AnimationStyle; label: string }> = [
  { key: 'calm_fade', label: 'Calm Fade' },
  { key: 'glide', label: 'Glide' },
  { key: 'lively', label: 'Lively' },
]

const MOTION_STYLE_LABEL: Record<AnimationStyle, string> = {
  calm_fade: 'Calm Fade',
  glide: 'Glide',
  lively: 'Lively',
}


const JLPT_LEVEL_ORDER: JlptLevel[] = ['n5', 'n4', 'n3', 'n2', 'n1']
const JLPT_LEVEL_LABELS: Record<JlptLevel, string> = {
  n5: 'JLPT N5',
  n4: 'JLPT N4',
  n3: 'JLPT N3',
  n2: 'JLPT N2',
  n1: 'JLPT N1',
}

// ── Thematic category constants ───────────────────────────────────────────────
const CATEGORY_UNLOCK_THRESHOLD = 0.7  // 70% mastery unlocks next category

const VOCAB_CATEGORY_ORDER: VocabCategory[] = [
  'greetings', 'numbers', 'time_days', 'family', 'body',
  'food_drink', 'school_study', 'places', 'transport', 'adjectives', 'verbs', 'nouns',
]

const VOCAB_CATEGORY_LABELS: Record<VocabCategory, string> = {
  greetings: 'Greetings', numbers: 'Numbers', time_days: 'Time & Days',
  family: 'Family', body: 'Body', food_drink: 'Food & Drink',
  school_study: 'School & Study', places: 'Places', transport: 'Transport',
  adjectives: 'Adjectives', verbs: 'Verbs', nouns: 'Common Nouns',
}

const VOCAB_CATEGORY_TO_DECK_SLUG: Record<VocabCategory, VocabCategorySlug> = {
  greetings: 'vocab_greetings', numbers: 'vocab_numbers', time_days: 'vocab_time_days',
  family: 'vocab_family', body: 'vocab_body', food_drink: 'vocab_food_drink',
  school_study: 'vocab_school_study', places: 'vocab_places', transport: 'vocab_transport',
  adjectives: 'vocab_adjectives', verbs: 'vocab_verbs', nouns: 'vocab_nouns',
}

const KANJI_CATEGORY_ORDER: KanjiCategory[] = [
  'numbers_time', 'nature_world', 'people_body', 'study_language', 'actions_travel',
  'n4_society_roles', 'n4_mind_thought', 'n4_daily_life', 'n4_time_action',
  'n3_governance', 'n3_communication', 'n3_movement', 'n3_achievement',
  'n2_professionalism', 'n2_economics', 'n2_analysis',
  'n1_law_order', 'n1_ideology', 'n1_literary',
]

const KANJI_CATEGORY_LABELS: Record<KanjiCategory, string> = {
  numbers_time:      'N5 · Numbers & Time',
  nature_world:      'N5 · Nature & World',
  people_body:       'N5 · People & Body',
  study_language:    'N5 · Study & Language',
  actions_travel:    'N5 · Actions & Travel',
  n4_society_roles:  'N4 · Society & Roles',
  n4_mind_thought:   'N4 · Mind & Thought',
  n4_daily_life:     'N4 · Daily Life',
  n4_time_action:    'N4 · Time & Action',
  n3_governance:     'N3 · Governance',
  n3_communication:  'N3 · Communication',
  n3_movement:       'N3 · Movement',
  n3_achievement:    'N3 · Achievement',
  n2_professionalism:'N2 · Professionalism',
  n2_economics:      'N2 · Economics',
  n2_analysis:       'N2 · Analysis',
  n1_law_order:      'N1 · Law & Order',
  n1_ideology:       'N1 · Society & Power',
  n1_literary:       'N1 · Literary Arts',
}

const KANJI_CATEGORY_TO_DECK_SLUG: Record<KanjiCategory, KanjiCategorySlug> = {
  numbers_time:      'kanji_numbers_time',
  nature_world:      'kanji_nature_world',
  people_body:       'kanji_people_body',
  study_language:    'kanji_study_language',
  actions_travel:    'kanji_actions_travel',
  n4_society_roles:  'kanji_n4_society_roles',
  n4_mind_thought:   'kanji_n4_mind_thought',
  n4_daily_life:     'kanji_n4_daily_life',
  n4_time_action:    'kanji_n4_time_action',
  n3_governance:     'kanji_n3_governance',
  n3_communication:  'kanji_n3_communication',
  n3_movement:       'kanji_n3_movement',
  n3_achievement:    'kanji_n3_achievement',
  n2_professionalism:'kanji_n2_professionalism',
  n2_economics:      'kanji_n2_economics',
  n2_analysis:       'kanji_n2_analysis',
  n1_law_order:      'kanji_n1_law_order',
  n1_ideology:       'kanji_n1_ideology',
  n1_literary:       'kanji_n1_literary',
}

const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'
const SETTINGS_STORAGE_KEY = 'jplearn-desktop-settings-v1'
const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'
const SUMMARY_SNAPSHOT_STORAGE_KEY = 'jplearn-desktop-summary-snapshot-v1'
const SESSION_STORAGE_KEY = 'jplearn-desktop-session-v1'
const PREFS_STORAGE_KEY = 'jplearn-desktop-session-prefs-v1'

interface PersistedSessionRestore {
  sessionScore: number
  sessionRounds: number
  sessionPoints: number
  sessionStreak: number
  sessionBestStreak: number
  sessionConfidenceCount: number
  sessionConfidenceTotal: number
  livesRemaining: number
}

interface PersistedSession {
  activeScript: ScriptKey
  activeGame: MinigameKey
  livesEnabled: boolean
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  sessionTargetItems: number
  seenCardIds: number[]
  sessionStartedAt: string
  restore: PersistedSessionRestore
}

const SUMMARY_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000
const CARD_MASTERY_MAX = 4 // Max score per card; reach this to fully master a card.


const EXPERTISE_LEVEL_TO_SCRIPT_KEYS: Record<ExpertiseLevel, ScriptKey[]> = {
  total_beginner:       [],
  know_hiragana:        ['hiragana'],
  know_kana:            ['hiragana', 'katakana'],
  jlpt_n5_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n4_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n3_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n2_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
  jlpt_n1_foundation:  ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
}

function deriveExpertiseLevelFromChecked(checked: Set<string>): ExpertiseLevel {
  if (checked.has('kanji_n1') || checked.has('vocab_n1')) return 'jlpt_n1_foundation'
  if (checked.has('kanji_n2') || checked.has('vocab_n2')) return 'jlpt_n2_foundation'
  if (checked.has('kanji_n3') || checked.has('vocab_n3')) return 'jlpt_n3_foundation'
  if (checked.has('kanji_n4') || checked.has('vocab_n4')) return 'jlpt_n4_foundation'
  if (checked.has('kanji_n5') || checked.has('vocab_n5')) return 'jlpt_n5_foundation'
  if (checked.has('katakana')) return 'know_kana'
  if (checked.has('hiragana')) return 'know_hiragana'
  return 'total_beginner'
}

const EMPTY_SCRIPT_STATS: ScriptStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
}

const EMPTY_MINIGAME_STATS: MinigameStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
  points: 0,
}

function defaultStatsByScript(): StatsByScript {
  return {
    hiragana: { ...EMPTY_SCRIPT_STATS },
    katakana: { ...EMPTY_SCRIPT_STATS },
    kanji_n5: { ...EMPTY_SCRIPT_STATS },
    vocab_n5: { ...EMPTY_SCRIPT_STATS },
    grammar_patterns: { ...EMPTY_SCRIPT_STATS },
    sentence_examples: { ...EMPTY_SCRIPT_STATS },
  }
}

function defaultMinigameStatsByScript(): MinigameStatsByScript {
  return {
    hiragana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    katakana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    kanji_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    vocab_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    grammar_patterns: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    sentence_examples: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      speech_recall: { ...EMPTY_MINIGAME_STATS },
      sentence_assembly: { ...EMPTY_MINIGAME_STATS },
      particle_cloze: { ...EMPTY_MINIGAME_STATS },
      vibe_check: { ...EMPTY_MINIGAME_STATS },
      imposter: { ...EMPTY_MINIGAME_STATS },
      listening_audio_first: { ...EMPTY_MINIGAME_STATS },
      dictation: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
  }
}

function loadSavedStats(): StatsByScript {
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

function defaultSettings(): AppSettings {
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
    backgroundStyle: 'classic_scene',
    backgroundBlur: BACKGROUND_BLUR_DEFAULT,
    customBackgroundDataUrl: null,
    customBackgroundName: null,
    assistantToastLimit: 1,
    assistantChatEnabled: true,
    assistantChatAudioEnabled: true,
    assistantChatOcrMinConfidence: 0.3,
    showKeyboardPrompts: false,
    furiganaEnabled: false,
    voiceEnabled: true,
    voiceSpeaker: 'zundamon_normal',
    ambientAudioEnabled: false,
    cursor: { mode: 'system', theme: 'classic', size: 1, color: null },
  }
}




function loadSettings(): AppSettings {
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
        resolvedTheme = activeCustomTheme.baseThemeByMode[normalizedMode]
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

    const normalizedCustomBackgroundDataUrl = normalizeCustomBackgroundDataUrl(parsed.customBackgroundDataUrl)
    const normalizedCustomBackgroundName = typeof parsed.customBackgroundName === 'string' && parsed.customBackgroundName.trim()
      ? parsed.customBackgroundName.trim().slice(0, 120)
      : null
    const normalizedBackgroundStyle = isBackgroundStyle(parsed.backgroundStyle) ? parsed.backgroundStyle : defaults.backgroundStyle
    const resolvedBackgroundStyle = normalizedBackgroundStyle === 'custom_upload' && !normalizedCustomBackgroundDataUrl
      ? defaults.backgroundStyle
      : normalizedBackgroundStyle

    return {
      ...defaults,
      ...parsed,
      appFont: isAppFontPreset(parsed.appFont) ? parsed.appFont : defaults.appFont,
      themeMode: normalizedMode,
      theme: resolvedTheme,
      themeScope: normalizedThemeScope,
      activeCustomThemeId: normalizedActiveCustomThemeId,
      customThemes,
      backgroundStyle: resolvedBackgroundStyle,
      backgroundBlur: typeof parsed.backgroundBlur === 'number' ? clampBackgroundBlur(parsed.backgroundBlur) : defaults.backgroundBlur,
      customBackgroundDataUrl: normalizedCustomBackgroundDataUrl,
      customBackgroundName: normalizedCustomBackgroundName,
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
      showKeyboardPrompts:
        typeof parsed.showKeyboardPrompts === 'boolean'
          ? parsed.showKeyboardPrompts
          : defaults.showKeyboardPrompts,
      furiganaEnabled:
        typeof parsed.furiganaEnabled === 'boolean'
          ? parsed.furiganaEnabled
          : defaults.furiganaEnabled,
      voiceEnabled:
        typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : defaults.voiceEnabled,
      voiceSpeaker:
        typeof parsed.voiceSpeaker === 'string' ? parsed.voiceSpeaker : defaults.voiceSpeaker,
      ambientAudioEnabled:
        typeof parsed.ambientAudioEnabled === 'boolean'
          ? parsed.ambientAudioEnabled
          : defaults.ambientAudioEnabled,
    }
  } catch {
    return defaultSettings()
  }
}

type CardScores = Record<ScriptKey, Record<number, number>>

function loadCardScores(): CardScores {
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

function loadSummarySnapshot(): StudySummaryPayload | null {
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

function saveSummarySnapshot(payload: StudySummaryPayload): void {
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

function normalizeDeckCards(cards: unknown): ScriptDeck['cards'] {
  return Array.isArray(cards) ? cards as ScriptDeck['cards'] : []
}

const SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT = 1200

function limitRuntimeDeckCards(script: ScriptKey, cards: ScriptDeck['cards']): ScriptDeck['cards'] {
  if (script !== 'sentence_examples') {
    return cards
  }
  if (cards.length <= SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT) {
    return cards
  }
  return cards.slice(0, SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT)
}

function normalizeBlockList(blocks: unknown): BlockInfo[] {
  return Array.isArray(blocks) ? blocks as BlockInfo[] : []
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function chooseUniqueIndices(length: number, count: number, exclude: number): number[] {
  const picks = new Set<number>()
  while (picks.size < Math.min(count, Math.max(0, length - 1))) {
    const candidate = Math.floor(Math.random() * length)
    if (candidate !== exclude) picks.add(candidate)
  }
  return [...picks]
}

function shuffleArray<T>(items: T[]): T[] {
  const clone = [...items]
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]]
  }
  return clone
}

function clampWeight(value: number): number {
  return Math.max(1, Math.min(5, Math.floor(value)))
}

function buildInterleaveSequence(
  weights: InterleaveWeights,
  allowedModes: Array<keyof InterleaveWeights>,
): PlayableMinigame[] {
  const sequence: PlayableMinigame[] = []
  for (const mode of allowedModes) {
    const count = clampWeight(weights[mode])
    for (let i = 0; i < count; i += 1) {
      sequence.push(mode)
    }
  }
  return sequence.length > 0 ? sequence : allowedModes
}

function isParticleClozeMode(mode: MinigameKey): mode is 'particle_cloze' {
  return mode === 'particle_cloze'
}

function isVibeCheckMode(mode: MinigameKey): mode is 'vibe_check' {
  return mode === 'vibe_check'
}

function isImposterMode(mode: MinigameKey): mode is 'imposter' {
  return mode === 'imposter'
}

function isSentenceAssemblyMode(mode: MinigameKey): mode is 'sentence_assembly' {
  return mode === 'sentence_assembly'
}

function isGrammarCurriculumMode(mode: MinigameKey): boolean {
  return isSentenceAssemblyMode(mode) || isParticleClozeMode(mode) || isVibeCheckMode(mode) || isImposterMode(mode)
}

function pickSurprisePrompt(
  script: ScriptKey,
  mode: PlayableMinigame,
  tags: string[],
  seed: number,
): string {
  const scriptPool = SCRIPT_MODE_PROMPT_PACKS[script][mode] ?? []
  const tagPool = tags
    .map((tag) => TAG_PROMPT_PACKS[tag.toLowerCase()])
    .filter((pack): pack is string[] => Boolean(pack))
    .flat()
  const combined = [...tagPool, ...scriptPool, ...SURPRISE_PROMPTS]
  return combined[Math.abs(seed) % combined.length]
}

function curriculumStageFromScore(score: number): 1 | 2 | 3 {
  if (score >= 3) return 3
  if (score >= 1) return 2
  return 1
}

function normalizeCurriculumStage(stage: number): 1 | 2 | 3 {
  if (stage >= 3) return 3
  if (stage >= 2) return 2
  return 1
}

function applyCardTemplate(template: string, card: ScriptDeck['cards'][number]): string {
  return template
    .replaceAll('{character}', card.character)
    .replaceAll('{romaji}', card.romaji)
    .replaceAll('{meaning}', card.meaning)
}

function splitSentenceIntoAssemblyChunks(sentence: string): string[] {
  const chunks: string[] = []
  let buffer = ''
  const particleBreaks = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'の'])
  const punctuationBreaks = new Set(['、', '。', '！', '？'])

  for (const character of sentence) {
    if (character.trim().length === 0) {
      if (buffer.trim().length > 0) {
        chunks.push(buffer.trim())
        buffer = ''
      }
      continue
    }

    buffer += character
    if (particleBreaks.has(character) || punctuationBreaks.has(character)) {
      chunks.push(buffer)
      buffer = ''
    }
  }

  if (buffer.length > 0) {
    chunks.push(buffer)
  }

  return chunks.filter((chunk) => chunk.trim().length > 0)
}

function buildClozeLine(script: ScriptKey, stage: 1 | 2 | 3, seed: number, card: ScriptDeck['cards'][number]): string {
  const templates = CLOZE_TEMPLATES[script][stage]
  return applyCardTemplate(templates[Math.abs(seed) % templates.length], card)
}

function buildStoryChapter(script: ScriptKey, stage: 1 | 2 | 3, seed: number, card: ScriptDeck['cards'][number]): { title: string; line: string } {
  const chapter = STORY_CHAPTERS[script][stage]
  return {
    title: chapter.title,
    line: applyCardTemplate(chapter.lines[Math.abs(seed) % chapter.lines.length], card),
  }
}

function buildRoundDictionaryNote(card: ScriptDeck['cards'][number], mode: PlayableMinigame): RoundDictionaryNote | null {
  const summary = card.dictionary_summary
  if (!summary) return null

  const secondaryGlosses = summary.glosses.filter((gloss) => gloss !== summary.primary_gloss).slice(0, 2)
  const glossList = [summary.primary_gloss, ...secondaryGlosses]
  let title = 'Dictionary note'
  let copy = `${summary.character} (${summary.reading}) is commonly glossed as ${summary.primary_gloss}.`

  if (mode === 'romaji_sprint') {
    title = 'Reading clue'
    copy = `${summary.character} is read ${summary.reading} in the dictionary.`
  } else if (mode === 'sentence_assembly') {
    title = 'Assembly clue'
    copy = `Rebuild the sentence in natural order around ${summary.character} (${summary.reading}).`
  } else if (mode === 'typed_recall') {
    title = 'Dictionary recall'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) is commonly translated as ${glossList.join(', ')}.`
      : `${summary.character} (${summary.reading}) is commonly translated as ${summary.primary_gloss}.`
  } else if (mode === 'speech_recall') {
    title = 'Dictionary recall'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) is commonly translated as ${glossList.join(', ')}. Say it aloud clearly.`
      : `${summary.character} (${summary.reading}) is commonly translated as ${summary.primary_gloss}. Say it aloud clearly.`
  } else if (mode === 'stroke_order') {
    title = 'Writing clue'
    copy = `${summary.character} is read ${summary.reading} and is usually glossed as ${summary.primary_gloss}.`
  } else if (mode === 'meaning_match') {
    title = 'Dictionary sense'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} is read ${summary.reading} and can carry senses like ${glossList.join(', ')}.`
      : `${summary.character} is read ${summary.reading} and often points to ${summary.primary_gloss}.`
  } else if (mode === 'character_match') {
    title = 'Meaning clue'
    copy = secondaryGlosses.length > 0
      ? `Look for the character read ${summary.reading} with meanings like ${glossList.join(', ')}.`
      : `Look for the character read ${summary.reading} that matches ${summary.primary_gloss}.`
  } else if (isParticleClozeMode(mode)) {
    title = 'Context clue'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) fits sentence meanings like ${glossList.join(', ')}.`
      : `${summary.character} (${summary.reading}) fits this kind of sentence as ${summary.primary_gloss}.`
  } else if (isImposterMode(mode)) {
    title = 'Reading note'
    copy = secondaryGlosses.length > 0
      ? `In passages, ${summary.character} is read ${summary.reading} and can suggest ${glossList.join(', ')}.`
      : `In passages, ${summary.character} is read ${summary.reading} and usually suggests ${summary.primary_gloss}.`
  } else if (mode === 'listening_audio_first' || mode === 'dictation') {
    title = 'Listening clue'
    copy = secondaryGlosses.length > 0
      ? `The audio term is ${summary.character}, read ${summary.reading}, with senses like ${glossList.join(', ')}.`
      : `The audio term is ${summary.character}, read ${summary.reading}, and usually means ${summary.primary_gloss}.`
  }

  return {
    title,
    copy,
    character: summary.character,
    reading: summary.reading,
    primaryGloss: summary.primary_gloss,
    secondaryGlosses,
    source: summary.source,
  }
}


function narrativePriorityCards(cards: ScriptDeck['cards']): ScriptDeck['cards'] {
  const stage3 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 3)
  if (stage3.length > 0) return stage3
  const stage2 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 2)
  if (stage2.length > 0) return stage2
  return cards
}

function jlptTagFromCard(card: Pick<ScriptDeck['cards'][number], 'tags'>): JlptLevel {
  for (const tag of card.tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized === 'n5' || normalized === 'n4' || normalized === 'n3' || normalized === 'n2' || normalized === 'n1') {
      return normalized
    }
  }
  return 'n5'
}

function buildJlptLevelProgress(cards: JlptProgressCard[], scores: Record<number, number>): JlptLevelProgress[] {
  let canUnlockNext = true
  return JLPT_LEVEL_ORDER.map((level) => {
    const levelCards = cards.filter((card) => jlptTagFromCard(card) === level)
    const total = levelCards.length
    const totalScore = levelCards.reduce((sum, card) => sum + (scores[card.id] ?? 0), 0)
    const mastery = total > 0 ? totalScore / (CARD_MASTERY_MAX * total) : 0
    const unlocked = total > 0 && canUnlockNext
    if (total > 0 && mastery < 0.8) {
      canUnlockNext = false
    }
    return {
      key: level,
      label: JLPT_LEVEL_LABELS[level],
      cardIds: levelCards.map((card) => card.id),
      sampleChars: levelCards.slice(0, 3).map((card) => card.character),
      mastery,
      unlocked,
      total,
    }
  })
}

function buildJlptLevelProgressFromLevelDecks(
  levelDecks: Record<JlptLevel, ScriptDeck['cards']>,
  scores: Record<number, number>,
): JlptLevelProgress[] {
  let canUnlockNext = true
  return JLPT_LEVEL_ORDER.map((level) => {
    const levelCards = levelDecks[level]
    const total = levelCards.length
    const totalScore = levelCards.reduce((sum, card) => sum + (scores[card.id] ?? 0), 0)
    const mastery = total > 0 ? totalScore / (CARD_MASTERY_MAX * total) : 0
    const unlocked = total > 0 && canUnlockNext
    if (total > 0 && mastery < 0.8) {
      canUnlockNext = false
    }
    return {
      key: level,
      label: JLPT_LEVEL_LABELS[level],
      cardIds: levelCards.map((card) => card.id),
      sampleChars: levelCards.slice(0, 3).map((card) => card.character),
      mastery,
      unlocked,
      total,
    }
  })
}

/** Build thematic category progress for vocab or kanji sections.
 *  First category is always unlocked; subsequent categories unlock when
 *  the previous reaches CATEGORY_UNLOCK_THRESHOLD (70%). */
function buildCategoryProgress<T extends string>(
  categoryOrder: T[],
  categoryLabels: Record<T, string>,
  categoryToSlug: Record<T, string>,
  categoryDecks: Record<T, ScriptDeck['cards']>,
  scores: Record<number, number>,
): CategoryProgress[] {
  let canUnlockNext = true
  return categoryOrder.map((category) => {
    const categoryCards = categoryDecks[category] ?? []
    const total = categoryCards.length
    const totalScore = categoryCards.reduce((sum, card) => sum + (scores[card.id] ?? 0), 0)
    const mastery = total > 0 ? totalScore / (CARD_MASTERY_MAX * total) : 0
    const unlocked = canUnlockNext  // first category always unlocked; rest need prior
    if (total > 0 && mastery < CATEGORY_UNLOCK_THRESHOLD) {
      canUnlockNext = false
    }
    return {
      key: category,
      label: categoryLabels[category],
      slug: categoryToSlug[category],
      cardIds: categoryCards.map((card) => card.id),
      sampleChars: categoryCards.slice(0, 3).map((card) => card.character),
      mastery,
      unlocked,
      total,
    }
  })
}

function getStudyPlanStage(overallMastery: number, trackedCards: number, currentStreak: number): StudyPlanStage {
  if (trackedCards < 12 || currentStreak < 2 || overallMastery < 0.25) return 'starter'
  if (overallMastery < 0.65) return 'building'
  return 'advanced'
}

function getStudyPlanShortcutMinigame(row: StudyPlanCoverageRow, stage: StudyPlanStage, index: number): MinigameKey {
  if (row.key === 'hiragana' || row.key === 'katakana') {
    if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
    if (stage === 'building') return index === 0 ? 'character_match' : 'romaji_sprint'
    return index === 0 ? 'interleave_mix' : 'character_match'
  }

  if (row.key === 'kanji_n5') {
    if (stage === 'starter') return index === 0 ? 'character_match' : 'meaning_match'
    if (stage === 'building') return index === 0 ? 'character_match' : 'typed_recall'
    return index === 0 ? 'typed_recall' : 'stroke_order'
  }

  if (row.key === 'vocab_n5') {
    if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
    if (stage === 'building') return index === 0 ? 'typed_recall' : 'particle_cloze'
    return index === 0 ? 'particle_cloze' : 'imposter'
  }

  if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
  if (stage === 'building') return index === 0 ? 'particle_cloze' : 'typed_recall'
  return index === 0 ? 'imposter' : 'particle_cloze'
}

function getStudyPlanTargetMastery(script: ScriptKey): number {
  if (script === 'hiragana') return 0.9
  if (script === 'katakana') return 0.85
  if (script === 'kanji_n5') return 0.72
  if (script === 'vocab_n5') return 0.72
  if (script === 'sentence_examples') return 0.68
  return 0.68
}

function aggregateDeckMastery(
  decks: StudySummaryPayload['decks'],
  predicate: (slug: string) => boolean,
): { mastery: number; total: number } {
  const matchingDecks = decks.filter((deck) => predicate(deck.slug))
  const total = matchingDecks.reduce((sum, deck) => sum + deck.total, 0)
  if (total <= 0) {
    return { mastery: 0, total: 0 }
  }
  const mastered = matchingDecks.reduce((sum, deck) => sum + deck.mastered, 0)
  return {
    mastery: mastered / total,
    total,
  }
}

function aggregateJlptMastery(levels: JlptLevelProgress[]): { mastery: number; total: number } {
  const total = levels.reduce((sum, row) => sum + row.total, 0)
  if (total <= 0) {
    return { mastery: 0, total: 0 }
  }
  const weighted = levels.reduce((sum, row) => sum + (row.mastery * row.total), 0)
  return {
    mastery: weighted / total,
    total,
  }
}

function buildStudyPlan(
  decks: StudySummaryPayload['decks'],
  kanjiLevels: JlptLevelProgress[],
  vocabLevels: JlptLevelProgress[],
  weeklyActivity: StudySummaryPayload['activity'],
  currentStreak: number,
): StudyPlanSnapshot {
  const hiragana = aggregateDeckMastery(decks, (slug) => slug === 'hiragana')
  const katakana = aggregateDeckMastery(decks, (slug) => slug === 'katakana')
  const grammar = aggregateDeckMastery(decks, (slug) => slug === 'grammar_patterns')
  const sentences = aggregateDeckMastery(decks, (slug) => slug === 'sentence_examples')

  const kanjiFromDecks = aggregateDeckMastery(decks, (slug) => slug.startsWith('kanji_'))
  const vocabFromDecks = aggregateDeckMastery(decks, (slug) => slug.startsWith('vocab_'))
  const kanjiFallback = aggregateJlptMastery(kanjiLevels)
  const vocabFallback = aggregateJlptMastery(vocabLevels)

  const kanji = kanjiFromDecks.total > 0 ? kanjiFromDecks : kanjiFallback
  const vocab = vocabFromDecks.total > 0 ? vocabFromDecks : vocabFallback

  const hiraganaReady = hiragana.mastery >= 0.35
  const kanjiReady = hiragana.mastery >= 0.7 && katakana.mastery >= 0.45
  const vocabReady = hiragana.mastery >= 0.7 && katakana.mastery >= 0.55
  const grammarReady = vocab.mastery >= 0.45
  const sentencesReady = grammar.mastery >= 0.45

  const coverageRows: StudyPlanCoverageRow[] = [
    {
      key: 'hiragana',
      label: SCRIPT_LABELS.hiragana,
      mastery: hiragana.mastery,
      total: hiragana.total,
      unlocked: true,
      difficulty: 0,
    },
    {
      key: 'katakana',
      label: SCRIPT_LABELS.katakana,
      mastery: katakana.mastery,
      total: katakana.total,
      unlocked: hiraganaReady,
      difficulty: 1,
    },
    {
      key: 'kanji_n5',
      label: SCRIPT_LABELS.kanji_n5,
      mastery: kanji.mastery,
      total: kanji.total,
      unlocked: kanjiReady,
      difficulty: 2,
    },
    {
      key: 'vocab_n5',
      label: SCRIPT_LABELS.vocab_n5,
      mastery: vocab.mastery,
      total: vocab.total,
      unlocked: vocabReady,
      difficulty: 3,
    },
    {
      key: 'grammar_patterns',
      label: SCRIPT_LABELS.grammar_patterns,
      mastery: grammar.mastery,
      total: grammar.total,
      unlocked: grammarReady,
      difficulty: 4,
    },
    {
      key: 'sentence_examples',
      label: SCRIPT_LABELS.sentence_examples,
      mastery: sentences.mastery,
      total: sentences.total,
      unlocked: sentencesReady,
      difficulty: 5,
    },
  ]

  const unlockedRows = coverageRows.filter((row) => row.unlocked)
  const needsWorkRows = unlockedRows.filter((row) => row.mastery < getStudyPlanTargetMastery(row.key))

  const focusRows = (needsWorkRows.length > 0 ? needsWorkRows : unlockedRows)
    .sort((left, right) => {
      if (Math.abs(left.mastery - right.mastery) > 0.06) {
        return left.mastery - right.mastery
      }
      return left.difficulty - right.difficulty
    })
    .slice(0, 3)

  const totalCards = coverageRows.reduce((sum, row) => sum + row.total, 0)
  const overallMastery = totalCards > 0
    ? coverageRows.reduce((sum, row) => sum + (row.mastery * row.total), 0) / totalCards
    : 0
  const learnerStage = getStudyPlanStage(overallMastery, totalCards, currentStreak)
  const recommendedMinutes = weeklyActivity.week.reviewed >= 24
    ? 20
    : weeklyActivity.week.reviewed >= 10
      ? 15
      : 10

  const sessionNote = focusRows.length > 0
    ? `Start with ${focusRows[0].label} and move to harder tracks after this block feels steady.`
    : currentStreak > 0
      ? `Keep the streak alive with a short mixed review.`
      : 'Build the plan after your first few rounds and it will highlight your weakest active track.'

  const shortcutRows = focusRows.slice(0, 3).map((row, index) => {
    const minigame = getStudyPlanShortcutMinigame(row, learnerStage, index)
    const script: ScriptKey = row.key
    const title = MINIGAMES.find((game) => game.key === minigame)?.title ?? minigame
    const stageLabel = learnerStage === 'starter'
      ? 'Starter-safe'
      : learnerStage === 'building'
        ? 'Build-up'
        : 'Advanced'

    return {
      key: `${row.key}-${minigame}-${index}`,
      label: title,
      note: `${row.label} · ${stageLabel} route`,
      script,
      minigame,
    }
  })

  return {
    coverageRows,
    focusRows,
    overallMastery,
    recommendedMinutes,
    sessionNote,
    learnerStage,
    shortcutRows,
  }
}

function calculateAwardedPoints(streakAfterCorrect: number): number {
  const comboBonus = POINT_COMBO_THRESHOLDS.reduce(
    (count, threshold) => count + (streakAfterCorrect >= threshold ? 1 : 0),
    0,
  )
  return 1 + comboBonus
}

function classifyRoundPerformance(isCorrect: boolean, responseMs: number): 'PERFECT' | 'GOOD' | 'SLOW' | 'MISS' {
  if (!isCorrect) return 'MISS'
  if (responseMs <= PERFORMANCE_PERFECT_MS) return 'PERFECT'
  if (responseMs <= PERFORMANCE_GOOD_MS) return 'GOOD'
  return 'SLOW'
}



function formatRoundModeLabel(mode: PlayableMinigame): string {
  if (mode === 'romaji_sprint') return 'Romaji Sprint'
  if (mode === 'meaning_match') return 'Meaning Match'
  if (mode === 'character_match') return 'Character Match'
  if (mode === 'stroke_order') return 'Stroke Order'
  if (mode === 'typed_recall') return 'Typed Recall'
  if (mode === 'speech_recall') return 'Speech Recall'
  if (mode === 'sentence_assembly') return 'Sentence Assembly'
  if (mode === 'particle_cloze') return 'Particle Cloze'
  if (mode === 'vibe_check') return 'Vibe Check'
  if (mode === 'imposter') return 'Imposter'
  if (mode === 'listening_audio_first') return 'Recognition'
  if (mode === 'dictation') return 'Dictation'
  return 'Interleave Mix'
}

function getRoundRecoveryTip(mode: PlayableMinigame): string {
  if (mode === 'romaji_sprint') return 'Take a breath and try the next reading.'
  if (mode === 'meaning_match') return 'You are close. Trust your first clear meaning.'
  if (mode === 'character_match') return 'You are building pattern memory one step at a time.'
  if (mode === 'stroke_order') return 'Nice attempt. Visual memory gets stronger with reps.'
  if (mode === 'typed_recall') return 'Great effort. Keep the next answer short and clear.'
  if (mode === 'speech_recall') return 'Great effort. Speak the next answer clearly and confidently.'
  if (mode === 'sentence_assembly') return 'Good try. Keep the chunk order natural and grammatically smooth.'
  if (mode === 'particle_cloze') return 'Good try. Follow the sentence flow and particle role.'
  if (mode === 'vibe_check') return 'Good try. Read the sentence ending and tone cues before deciding register.'
  if (mode === 'imposter') return 'Good attempt. Scan for the token that breaks grammar flow.'
  if (mode === 'listening_audio_first') return 'Keep listening. Audio recognition builds over time.'
  if (mode === 'dictation') return 'Listen carefully and type the romaji for what you hear.'
  return 'Good attempt. Keep the next answer short and clear.'
}

function buildRoundCoachToast(
  id: number,
  payload: {
    isCorrect: boolean
    mode: PlayableMinigame
    nextStreak: number
    answer: string
    completedRoundsAfterAnswer: number
    targetRounds: number
    typedAssessment: TypedAnswerState | null
  },
): AssistantToast | null {
  if (!payload.isCorrect) {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_recovery',
      title: 'You are still doing great',
      body: getRoundRecoveryTip(payload.mode),
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Keep going',
    }
  }

  if (payload.mode === 'typed_recall' && payload.typedAssessment === 'near_miss') {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_near_miss',
      title: 'Nice save',
      body: 'That was close and you handled it well.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Got it',
    }
  }

  if (payload.mode === 'speech_recall' && payload.typedAssessment === 'near_miss') {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_near_miss',
      title: 'Nice save',
      body: 'Close call on the transcript, but that counts.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Got it',
    }
  }

  if (payload.nextStreak === 3 || payload.nextStreak === 6 || payload.nextStreak === 9) {
    return {
      id,
      priority: 'celebration',
      eventType: 'round_feedback',
      messageKey: 'coach.round_streak',
      title: `Streak x${payload.nextStreak}`,
      body: `Lovely rhythm. ${formatRoundModeLabel(payload.mode)} is clicking for you.`,
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Nice',
    }
  }

  if (payload.completedRoundsAfterAnswer === payload.targetRounds - 1) {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_final_push',
      title: 'Almost there',
      body: 'One more card. You have got this.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Finish run',
    }
  }

  if (payload.nextStreak > 0 && payload.nextStreak % 2 === 0) {
    return {
      id,
      priority: 'info',
      eventType: 'round_feedback',
      messageKey: 'coach.round_encouragement',
      title: 'Nice one',
      body: 'Clean answer. Keep this gentle pace.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Yay',
    }
  }

  return null
}






function App() {
  // First-run setup wizard check — must be the first hooks so the conditional
  // return (added near the bottom of App) comes after all other hooks.
  const [showWizard, setShowWizard] = useState<boolean | null>(null)
  useEffect(() => {
    const api = window.jplearnDesktop
    if (typeof api?.isFirstRun !== 'function') {
      setShowWizard(false)
      return
    }
    const isFirstRun = api.isFirstRun // narrowed reference
    const check = async () => {
      try {
        const first = await isFirstRun() as boolean
        setShowWizard(first)
      } catch {
        setShowWizard(false)
      }
    }
    void check()
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return
      const parsed: PersistedSession = JSON.parse(raw)
      if (!parsed.activeScript || !parsed.activeGame || !Array.isArray(parsed.seenCardIds) || !parsed.restore) return
      const timer = setTimeout(() => {
        setResumeData(parsed)
        setShowResumeToast(true)
      }, 2000)
      return () => clearTimeout(timer)
    } catch { /* ignore */ }
  }, [])

  // Functions used in state initializers below
  function loadSessionPrefs(): LastSessionPrefs | null {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as LastSessionPrefs
    } catch {
      return null
    }
  }

  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(() => loadSummarySnapshot())
  const [error, setError] = useState<string | null>(null)
  const viewHistoryRef = useRef<AppView[]>(['home'])
  const viewHistoryIndexRef = useRef(0)
  const isHistoryNavigationRef = useRef(false)
  const [loading, setLoading] = useState<boolean>(() => loadSummarySnapshot() === null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [activeScript, setActiveScript] = useState<ScriptKey>(() => loadSessionPrefs()?.script ?? 'hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>(() => loadSessionPrefs()?.game ?? 'romaji_sprint')
  const [deckCards, setDeckCards] = useState<ScriptDeck['cards']>([])
  const [blockProgress, setBlockProgress] = useState<BlockInfo[]>([])
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0)
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)

  const [sessionActive, setSessionActive] = useState<boolean>(false)
  const [roundState, setRoundState] = useState<RoundState | null>(null)
  const [roundInput, setRoundInput] = useState<string>('')
  const [roundFeedback, setRoundFeedback] = useState<string | null>(null)
  const [roundFeedbackTone, setRoundFeedbackTone] = useState<FeedbackTone>(null)
  const [roundFeedbackPoints, setRoundFeedbackPoints] = useState<number | null>(null)
  const [roundFeedbackAnswer, setRoundFeedbackAnswer] = useState<string | null>(null)
  const [roundPerformanceLabel, setRoundPerformanceLabel] = useState<'PERFECT' | 'GOOD' | 'SLOW' | 'MISS' | null>(null)
  const [isRoundResolving, setIsRoundResolving] = useState<boolean>(false)
  const [roundResponseMs, setRoundResponseMs] = useState<number | null>(null)
  const [roundSrsResult, setRoundSrsResult] = useState<{
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
  } | null>(null)
  const [roundExampleSentence, setRoundExampleSentence] = useState<{
    jp: string
    en: string
    romaji: string
  } | null>(null)
  const [sessionScore, setSessionScore] = useState<number>(0)
  const [sessionRounds, setSessionRounds] = useState<number>(0)
  const [sessionPoints, setSessionPoints] = useState<number>(0)
  const [sessionStreak, setSessionStreak] = useState<number>(0)
  const [sessionBestStreak, setSessionBestStreak] = useState<number>(0)
  const [roundComboBonus, setRoundComboBonus] = useState<number>(0)
  const [roundMilestoneStreak, setRoundMilestoneStreak] = useState<number | null>(null)
  const [sessionTargetItems, setSessionTargetItems] = useState<number>(() => loadSessionPrefs()?.sessionTargetItems ?? DEFAULT_SESSION_LENGTH_PRESET.items)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [lastSessionSummary, setLastSessionSummary] = useState<SessionSummaryPayload | null>(null)
  const [sessionRunReport, setSessionRunReport] = useState<SessionRunReport | null>(null)
  const [resumeRequest, setResumeRequest] = useState<{ script: ScriptKey; minigame: MinigameKey } | null>(null)
  const [sessionStartPending, setSessionStartPending] = useState<boolean>(false)
  const [sessionSummaryLoading, setSessionSummaryLoading] = useState<boolean>(false)
  const [sessionGoalError, setSessionGoalError] = useState<string | null>(null)
  const [showResumeToast, setShowResumeToast] = useState<boolean>(false)
  const [resumeData, setResumeData] = useState<PersistedSession | null>(null)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(() => loadSessionPrefs()?.livesEnabled ?? false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)
  const [leechFocusEnabled, setLeechFocusEnabled] = useState<boolean>(() => loadSessionPrefs()?.leechFocusEnabled ?? false)
  const [interleaveWeights] = useState<InterleaveWeights>({ ...DEFAULT_INTERLEAVE_WEIGHTS })
  const [interleaveSurpriseEnabled] = useState<boolean>(true)
  const [interleaveSurpriseEvery] = useState<number>(5)
  const [confidenceCaptureEnabled, setConfidenceCaptureEnabled] = useState<boolean>(() => loadSessionPrefs()?.confidenceCaptureEnabled ?? false)
  const [roundConfidenceScore, setRoundConfidenceScore] = useState<number>(3)
  const [sessionConfidenceCount, setSessionConfidenceCount] = useState<number>(0)
  const [sessionConfidenceTotal, setSessionConfidenceTotal] = useState<number>(0)

  useEffect(() => {
    saveSessionPrefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScript, activeGame, livesEnabled, leechFocusEnabled, confidenceCaptureEnabled, sessionTargetItems])

  const [scriptStats, setScriptStats] = useState<StatsByScript>(() => loadSavedStats())
  const [minigameStats, setMinigameStats] = useState<MinigameStatsByScript>(() => defaultMinigameStatsByScript())
  const [cardScores, setCardScores] = useState<CardScores>(() => loadCardScores())
  const [overviewBlocks, setOverviewBlocks] = useState<Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>>({})
  const [overviewCategoryBlocks, setOverviewCategoryBlocks] = useState<OverviewCategoryBlocks>({
    vocab_n5: [],
    grammar_patterns: [],
  })
  const [overviewKanjiDeck, setOverviewKanjiDeck] = useState<OverviewKanjiCard[]>([])
  const [activeKanjiLevel, setActiveKanjiLevel] = useState<JlptLevel>('n5')
  const [activeVocabLevel, setActiveVocabLevel] = useState<JlptLevel>('n5')
  const [kanjiDeckCardsByLevel] = useState<Record<JlptLevel, ScriptDeck['cards']>>({
    n5: [], n4: [], n3: [], n2: [], n1: [],
  })
  const [vocabDeckCardsByLevel] = useState<Record<JlptLevel, ScriptDeck['cards']>>({
    n5: [], n4: [], n3: [], n2: [], n1: [],
  })
  const [activeKanjiCategory, setActiveKanjiCategory] = useState<KanjiCategory>('numbers_time')
  const [activeVocabCategory, setActiveVocabCategory] = useState<VocabCategory>('greetings')
  const [kanjiDeckCardsByCategory, setKanjiDeckCardsByCategory] = useState<Record<KanjiCategory, ScriptDeck['cards']>>({
    numbers_time: [], nature_world: [], people_body: [], study_language: [], actions_travel: [],
    n4_society_roles: [], n4_mind_thought: [], n4_daily_life: [], n4_time_action: [],
    n3_governance: [], n3_communication: [], n3_movement: [], n3_achievement: [],
    n2_professionalism: [], n2_economics: [], n2_analysis: [],
    n1_law_order: [], n1_ideology: [], n1_literary: [],
  })
  const [vocabDeckCardsByCategory, setVocabDeckCardsByCategory] = useState<Record<VocabCategory, ScriptDeck['cards']>>({
    greetings: [], numbers: [], time_days: [], family: [], body: [],
    food_drink: [], school_study: [], places: [], transport: [],
    adjectives: [], verbs: [], nouns: [],
  })
  const [kanjiOverviewPage, setKanjiOverviewPage] = useState<Partial<Record<JlptLevel, number>>>({})
  const [overviewBlocksLoading, setOverviewBlocksLoading] = useState(false)

  const pageLoading = loading || gameLoading
  const pageLoadingLabel = gameLoading ? 'Loading deck cards…' : 'Loading…'
  const [charMasteryExpanded, setCharMasteryExpanded] = useState(false)
  const [expandedBlocks, setExpandedBlocks] = useState<string | null>(null)
  const [xpProgress, setXpProgress] = useState<XPProgress | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [learningPathStatus, setLearningPathStatus] = useState<LearningPathStatus | null>(null)
  const [warningModal, setWarningModal] = useState<{
    sectionId: ScriptKey | 'jlpt_prep'
    label: string
    readiness: SectionReadiness
    reason: string
  } | null>(null)
  const warnedSectionsRef = useRef<Set<string>>(new Set())
  const [learningPathExpanded, setLearningPathExpanded] = useState(false)
  const [overviewSectionExpanded, setOverviewSectionExpanded] = useState<Record<OverviewSectionKey, boolean>>({
    studyActivity: false,
    mistakeBreakdown: false,
    deckSnapshot: false,
  })

  interface SelectedChar {
    character: string
    romaji: string
    meaning: string
    label: string
    score: number
  }
  const [selectedChar, setSelectedChar] = useState<SelectedChar | null>(null)
    const [dictionaryOpen, setDictionaryOpen] = useState(false)
    const [dictionarySeedQuery, setDictionarySeedQuery] = useState('')
    const [dictionaryOpenSignal, setDictionaryOpenSignal] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>('appearance')
  const [xpDetailsOpen, setXpDetailsOpen] = useState(false)
  const [streakDetailsOpen, setStreakDetailsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [collapsedSettingsSections, setCollapsedSettingsSections] = useState<Partial<Record<string, boolean>>>({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const theme = useTheme(
    settings as any,
    setSettings as any,
    (t: string) => { void window.jplearnDesktop?.setStartupTheme(t) },
    setCollapsedSettingsSections,
  )
  const { toggleThemeSectionCollapsed } = theme
  const background = useBackground(
    settings as any,
    setSettings as any,
  )
  const [showOverview, setShowOverview] = useState(false)
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0)
  const [resettingDb, setResettingDb] = useState(false)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false)
  const [activeShortcutFlyout, setActiveShortcutFlyout] = useState<ShortcutSubmenuKey | null>(null)
  const [devDashboardOpen, setDevDashboardOpen] = useState(false)
  const [pendingDevCheck, setPendingDevCheck] = useState<string | null>(null)
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const shortcutsSectionRef = useRef<HTMLDivElement | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)
  const roundPresentedAtRef = useRef<number>(0)
  const scriptLoadRequestIdRef = useRef<number>(0)
  const lastLoadedScriptRef = useRef<ScriptKey>('hiragana')
  const startupBootMarkRef = useRef<number>(performance.now())
  const startupFirstSummaryMsRef = useRef<number | null>(null)
  const startupReadySentRef = useRef(false)
  const xpDetailsRef = useRef<HTMLDivElement | null>(null)
  const streakDetailsRef = useRef<HTMLDivElement | null>(null)
  const localToastIdRef = useRef(-1)
  const previousSessionActiveRef = useRef(false)
  const seenCardIdsRef = useRef<number[]>([])
  const wrongCardIdsRef = useRef<number[]>([])
  const nearMissCardIdsRef = useRef<number[]>([])
  const feedbackAdvanceRef = useRef<(() => void) | null>(null)
  const kanjiCategoryDeckCacheRef = useRef<Partial<Record<KanjiCategory, ScriptDeck['cards']>>>({})
  const vocabCategoryDeckCacheRef = useRef<Partial<Record<VocabCategory, ScriptDeck['cards']>>>({})
  const kanjiCategoryBlockCacheRef = useRef<Partial<Record<KanjiCategory, BlockInfo[]>>>({})
  const vocabCategoryBlockCacheRef = useRef<Partial<Record<VocabCategory, BlockInfo[]>>>({})
  const scriptDeckCacheRef = useRef<Partial<Record<ScriptKey, ScriptDeck['cards']>>>({})
  const scriptBlockCacheRef = useRef<Partial<Record<ScriptKey, BlockInfo[]>>>({})
  const deckCardsInFlightRef = useRef<Map<string, Promise<ScriptDeck>>>(new Map())
  const blockProgressInFlightRef = useRef<Map<string, Promise<BlockProgressPayload>>>(new Map())
  const studyQueueInFlightRef = useRef<Map<string, Promise<StudyQueueResponse>>>(new Map())
  const studyQueueCacheRef = useRef<Map<string, { payload: StudyQueueResponse; cachedAtMs: number }>>(new Map())
  const roundCycleRef = useRef<number[]>([])
  const roundCursorRef = useRef<number>(0)
  const interleaveCursorRef = useRef<number>(0)
  const availableMinigames = useMemo(() => SCRIPT_MINIGAMES[activeScript], [activeScript])

  const dictionaryCards = useMemo(() => {
    const byId = new Map<number, ScriptDeck['cards'][number]>()
    for (const card of deckCards) {
      byId.set(card.id, card)
    }
    for (const card of overviewKanjiDeck) {
      if (!byId.has(card.id)) {
        byId.set(card.id, card as ScriptDeck['cards'][number])
      }
    }
    return Array.from(byId.values())
  }, [deckCards, overviewKanjiDeck])

  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  const openDictionary = useCallback((seedQuery = '') => {
    setShowSettings(false)
    setShowOverview(false)
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
    tutor.setAssistantChatOpen(false)
    tutor.setOcrWorkbenchOpen(false)
    setXpDetailsOpen(false)
    setStreakDetailsOpen(false)
    setSelectedChar(null)
    setDictionarySeedQuery(seedQuery)
    setDictionaryOpen(true)
    setDictionaryOpenSignal((previous) => previous + 1)
  }, [])

  const closeDictionary = useCallback(() => {
    setDictionaryOpen(false)
    setDictionarySeedQuery('')
  }, [])

  const availableInterleaveModes = useMemo(() => SCRIPT_INTERLEAVE_MODES[activeScript], [activeScript])
  const interleaveSequence = useMemo(
    () => buildInterleaveSequence(interleaveWeights, availableInterleaveModes),
    [interleaveWeights, availableInterleaveModes],
  )

  useEffect(() => {
    if (availableMinigames.includes(activeGame)) return
    setActiveGame(availableMinigames[0])
  }, [activeGame, availableMinigames])

  const resolveScriptMinigame = useCallback((script: ScriptKey, minigame: MinigameKey): MinigameKey => {
    const allowedMinigames = SCRIPT_MINIGAMES[script]
    return allowedMinigames.includes(minigame) ? minigame : allowedMinigames[0]
  }, [])

  const resetRoundCycle = useCallback(() => {
    roundCycleRef.current = []
    roundCursorRef.current = 0
    interleaveCursorRef.current = 0
  }, [])

  /** Tears down active minigame session state — core pattern. */
  function resetSessionCore(): void {
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    resetRoundCycle()
  }

  /** Core + lives reset. Used when starting a new run. */
  function resetSessionWithLives(): void {
    resetSessionCore()
    setLivesRemaining(DEFAULT_LIVES)
  }

  /** Full session wipe including score/counters/input. Used when loading new deck cards. */
  function resetSessionFull(): void {
    resetSessionWithLives()
    setRoundInput('')
    setSessionScore(0)
    setSessionRounds(0)
    setSessionPoints(0)
    setSessionStreak(0)
    setSessionBestStreak(0)
    setRoundComboBonus(0)
    setRoundMilestoneStreak(null)
    setRoundPerformanceLabel(null)
    setSessionConfidenceCount(0)
    setSessionConfidenceTotal(0)
    setSessionGoalError(null)
  }

  /** End-of-session reset: core without cycle reset + per-round state + optional error message. */
  function resetSessionEnd(options?: { errorMessage?: string }): void {
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setRoundResponseMs(null)
    setRoundSrsResult(null)
    setRoundExampleSentence(null)
    if (options?.errorMessage) {
      setGameError(options.errorMessage)
    }
  }

  function saveSessionPrefs(): void {
    try {
      const prefs: LastSessionPrefs = {
        script: activeScript,
        game: activeGame,
        livesEnabled,
        leechFocusEnabled,
        confidenceCaptureEnabled,
        sessionTargetItems,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
    } catch { /* ignore */ }
  }

  // Chatbot tier cards show combined footprint (chatbot + its hidden, auto-installed
  // embedder) so the displayed size matches what setup actually downloads.





  const models = useModels()

  const voice = useVoice(
    settings as any,
    setSettings as any,
    {
      tutorInstallInfo: models.tutorInstallInfo as any,
      refreshTutorInstallInfo: models.refreshTutorInstallInfo,
    },
  )

  const isInMinigameSession = view === 'minigame' && sessionActive && roundState !== null

  const cursor = useCursor(settings as any, setSettings as any)

  const tutor = useTutor(
    settings as any,
    {
      voice: {
        playVoiceRuntimeAudio: voice.playVoiceRuntimeAudio,
        cancelAssistantSpeech: voice.cancelAssistantSpeech,
        assistantSpeechRunIdRef: voice.assistantSpeechRunIdRef,
        splitSpeechSegments,
      },
      isInMinigameSession,
      activeSessionId,
      activeScript,
      ocrInstalled: models.tutorInstallInfo?.ocrInstalled ?? false,
      onToastNavigate: (script, game, differentScript) => {
        const minigame = resolveScriptMinigame(script, game)
        setActiveGame(minigame)
        setNavDirection('forward')
        setView('minigame')
        resetSessionWithLives()
        if (differentScript) {
          setActiveScript(script)
          setResumeRequest({ script, minigame })
          return
        }
        void startSession(minigame)
      },
    },
  )


  // oxlint-disable react-hooks/exhaustive-deps — models from useModels hook is not a stable ref
  useEffect(() => {
    void models.refreshTutorInstallInfo()
  }, [models.refreshTutorInstallInfo])

  // oxlint-disable react-hooks/exhaustive-deps — voice from useVoice hook is not a stable ref
  useEffect(() => {
    if (view !== 'script_hub') return
    void voice.refreshVoiceStatus()
  }, [voice.refreshVoiceStatus, view])

  // oxlint-disable react-hooks/exhaustive-deps — voice from useVoice hook is not a stable ref
  useEffect(() => {
    if (!showSettings || activeSettingsTab !== 'assistant') return
    const h = window.setInterval(() => { void voice.refreshVoiceStatus() }, 3000)
    return () => { window.clearInterval(h) }
  }, [activeSettingsTab, voice.refreshVoiceStatus, showSettings])












  // Do not warm voice runtime automatically in the background.
  // Keep startup and menu-open flows quiet; runtime initializes on first use.

  const toggleOverviewSection = useCallback((section: OverviewSectionKey) => {
    setOverviewSectionExpanded((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }, [])

  const advanceFontSize = useCallback(() => {
    const currentIndex = FONT_SIZE_ORDER.indexOf(settings.fontSize)
    const nextIndex = (currentIndex + 1) % FONT_SIZE_ORDER.length
    const nextSize = FONT_SIZE_ORDER[nextIndex]
    setSettings((prev) => ({ ...prev, fontSize: nextSize }))
  }, [settings.fontSize])

  const reloadLocalFonts = useCallback(() => {
    void window.jplearnDesktop?.reloadLocalFonts?.().catch(() => undefined)
  }, [])


  const activeDeckSlug = useMemo(() => {
    if (activeScript === 'kanji_n5') return KANJI_CATEGORY_TO_DECK_SLUG[activeKanjiCategory]
    if (activeScript === 'vocab_n5') return VOCAB_CATEGORY_TO_DECK_SLUG[activeVocabCategory]
    return activeScript
  }, [activeKanjiCategory, activeScript, activeVocabCategory])

  const getDeckCardsDeduped = useCallback((slug: DeckSlugInput): Promise<ScriptDeck> => {
    if (typeof window === 'undefined' || !window.jplearnDesktop?.getDeckCards) {
      return Promise.reject(new Error('Deck cards API unavailable'))
    }

    const inFlight = deckCardsInFlightRef.current.get(slug)
    if (inFlight) return inFlight

    const request = Promise.race<ScriptDeck>([
      window.jplearnDesktop.getDeckCards(slug),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error(`Loading deck cards timed out for ${slug}`)), DECK_LOAD_TIMEOUT_MS)
      }),
    ]).finally(() => {
      if (deckCardsInFlightRef.current.get(slug) === request) {
        deckCardsInFlightRef.current.delete(slug)
      }
    })
    deckCardsInFlightRef.current.set(slug, request)
    return request
  }, [])

  const getBlockProgressDeduped = useCallback((slug: DeckSlugInput): Promise<BlockProgressPayload> => {
    if (typeof window === 'undefined' || !window.jplearnDesktop?.getBlockProgress) {
      return Promise.reject(new Error('Block progress API unavailable'))
    }

    const inFlight = blockProgressInFlightRef.current.get(slug)
    if (inFlight) return inFlight

    const request = Promise.race<BlockProgressPayload>([
      window.jplearnDesktop.getBlockProgress(slug),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error(`Loading block progress timed out for ${slug}`)), DECK_LOAD_TIMEOUT_MS)
      }),
    ]).finally(() => {
      if (blockProgressInFlightRef.current.get(slug) === request) {
        blockProgressInFlightRef.current.delete(slug)
      }
    })
    blockProgressInFlightRef.current.set(slug, request)
    return request
  }, [])

  const getStudyQueueDeduped = useCallback(
    (slug: DeckSlugInput, options?: { preferCache?: boolean }): Promise<StudyQueueResponse> => {
      if (typeof window === 'undefined' || !window.jplearnDesktop?.getStudyQueue) {
        return Promise.reject(new Error('Study queue API unavailable'))
      }

      const cacheKey = slug
      const preferCache = options?.preferCache ?? true
      if (preferCache) {
        const cached = studyQueueCacheRef.current.get(cacheKey)
        if (cached && performance.now() - cached.cachedAtMs <= STUDY_QUEUE_CACHE_TTL_MS) {
          return Promise.resolve(cached.payload)
        }
      }

      const inFlight = studyQueueInFlightRef.current.get(cacheKey)
      if (inFlight) return inFlight

      const fetchQueue = async (): Promise<StudyQueueResponse> => {
        try {
          const payload = await window.jplearnDesktop.getStudyQueue(slug)
          studyQueueCacheRef.current.set(cacheKey, {
            payload,
            cachedAtMs: performance.now(),
          })
          return payload
        } finally {
          if (studyQueueInFlightRef.current.get(cacheKey) === request) {
            studyQueueInFlightRef.current.delete(cacheKey)
          }
        }
      }
      const request = fetchQueue()
      studyQueueInFlightRef.current.set(cacheKey, request)
      return request
    },
    [],
  )

  const buildQueueCycle = useCallback((queue: StudyQueueResponse, sourceCards: ScriptDeck['cards']): number[] => {
    const idToIndex = new Map<number, number>()
    sourceCards.forEach((card, index) => {
      idToIndex.set(card.id, index)
    })

    const ordered: number[] = []
    const seen = new Set<number>()
    for (const cardId of queue.queue.card_ids) {
      const sourceIndex = idToIndex.get(cardId)
      if (sourceIndex === undefined || seen.has(sourceIndex)) continue
      ordered.push(sourceIndex)
      seen.add(sourceIndex)
    }

    for (let index = 0; index < sourceCards.length; index += 1) {
      if (seen.has(index)) continue
      ordered.push(index)
    }

    return shuffleArray(ordered)
  }, [])

  const hydrateRoundCycle = useCallback(async (sourceCards: ScriptDeck['cards']): Promise<void> => {
    if (sourceCards.length <= 0) {
      resetRoundCycle()
      return
    }

    try {
      // Keep round startup responsive even if queue IPC is temporarily slow.
      const queuePromise = getStudyQueueDeduped(activeDeckSlug)
        .catch(() => null)
      const queue = await Promise.race<StudyQueueResponse | null>([
        queuePromise,
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), ROUND_QUEUE_TIMEOUT_MS)
        }),
      ])
      roundCycleRef.current = queue
        ? buildQueueCycle(queue, sourceCards)
        : shuffleArray([...Array(sourceCards.length).keys()])
    } catch {
      roundCycleRef.current = shuffleArray([...Array(sourceCards.length).keys()])
    }
    roundCursorRef.current = 0
  }, [activeDeckSlug, buildQueueCycle, getStudyQueueDeduped, resetRoundCycle])

  const nextCardIndex = useCallback((cardsLength: number): number | null => {
    if (cardsLength <= 0) return null

    if (roundCycleRef.current.length !== cardsLength || roundCursorRef.current >= roundCycleRef.current.length) {
      return null
    }

    const index = roundCycleRef.current[roundCursorRef.current]
    roundCursorRef.current += 1
    return index
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(scriptStats))
  }, [scriptStats])

  useEffect(() => {
    window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(cardScores))
  }, [cardScores])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    document.documentElement.dataset.fontSize = settings.fontSize
    document.documentElement.dataset.appFont = settings.appFont
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion)
    document.documentElement.dataset.motionStyle = settings.motionStyle
  }, [settings])


  const activePetalStream = useMemo(() => {
    if (settings.reducedMotion || settings.motionStyle === 'calm_fade') return []
    const count = settings.motionStyle === 'lively' ? 14 : 10
    return PETAL_STREAM.slice(0, count)
  }, [settings.motionStyle, settings.reducedMotion])

  const showPetalLayer = activePetalStream.length > 0 && !(view === 'minigame' && sessionActive)

  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const state = await window.jplearnDesktop?.isWindowMaximized()
        if (mounted && state) setIsWindowMaximized(state.isMaximized)
      } catch { /* ignore */ }
    }
    void check()

    return () => {
      mounted = false
    }
  }, [])

  // Onboarding is now gated entirely by learningPathStatus.onboarding_complete from the backend.

  useEffect(() => {
    const onWindowStateChanged = window.jplearnDesktop?.onWindowStateChanged
    if (!onWindowStateChanged) {
      return
    }

    const unsubscribe = onWindowStateChanged((state) => {
      setIsWindowMaximized(state.isMaximized)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (
      view !== 'minigame' ||
      !sessionActive ||
      !roundState ||
      isRoundResolving
    ) {
      return
    }

    const focusHandle = window.setTimeout(() => {
      answerInputRef.current?.focus()
    }, 60)

    return () => window.clearTimeout(focusHandle)
  }, [isRoundResolving, roundState, roundInput, sessionActive, view])

  const clearPersistedSession = useCallback(() => {
    seenCardIdsRef.current = []
    wrongCardIdsRef.current = []
    nearMissCardIdsRef.current = []
    try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const previouslyActive = previousSessionActiveRef.current
    previousSessionActiveRef.current = sessionActive

    if (!previouslyActive || sessionActive || !activeSessionId) return

    const capturedWrongCardIds = [...wrongCardIdsRef.current]
    const capturedNearMissCardIds = [...nearMissCardIdsRef.current]
    clearPersistedSession()

    const completedRounds = sessionRounds
    const completedCorrect = sessionScore
    const completedWrong = Math.max(0, completedRounds - completedCorrect)
    const accuracy = completedRounds > 0 ? Math.round((completedCorrect / completedRounds) * 100) : 0
    const goalCompletionPct = sessionTargetItems > 0
      ? Math.min(999, Math.round((completedRounds / sessionTargetItems) * 100))
      : 0
    const goalDelta = completedRounds - sessionTargetItems
    const livesLost = livesEnabled ? Math.max(0, DEFAULT_LIVES - livesRemaining) : 0
    const averageConfidenceScore =
      sessionConfidenceCount > 0
        ? Number((sessionConfidenceTotal / sessionConfidenceCount).toFixed(2))
        : null

    setSessionRunReport({
      script: activeScript,
      minigame: activeGame,
      sectionName: null,
      completedAt: new Date().toLocaleTimeString(),
      rounds: completedRounds,
      correct: completedCorrect,
      wrong: completedWrong,
      accuracy,
      points: sessionPoints,
      targetItems: sessionTargetItems,
      goalCompletionPct,
      goalDelta,
      livesEnabled,
      livesRemaining,
      livesLost,
      leechFocusEnabled,
      confidenceCaptureEnabled,
      confidenceCapturedCount: sessionConfidenceCount,
      averageConfidenceScore,
      wrongCardIds: capturedWrongCardIds,
      nearMissCardIds: capturedNearMissCardIds,
    })

    setSessionSummaryLoading(true)
    setSessionGoalError(null)
    const fetchSummary = async () => {
      try {
        const response = await window.jplearnDesktop?.getSessionSummary(activeSessionId)
        if (!response.ok || !response.summary) {
          setSessionGoalError(response.error ?? 'Unable to load session summary.')
          setLastSessionSummary(null)
          return
        }
        setLastSessionSummary(response.summary)
      } catch (error: unknown) {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to load session summary.')
        setLastSessionSummary(null)
      } finally {
        setSessionSummaryLoading(false)
      }
    }
    void fetchSummary()

    // Refresh XP after each session so the titlebar badge stays current (Q1-A: pull after session end).
    const getXpProgress = window.jplearnDesktop?.getXpProgress
    if (getXpProgress) {
      const refreshXp = async () => {
        try {
          const xp = await getXpProgress()
          if (xp) setXpProgress(xp)
        } catch { /* ignore */ }
      }
      void refreshXp()
    }
  }, [
    activeGame,
    activeScript,
    activeSessionId,
    confidenceCaptureEnabled,
    leechFocusEnabled,
    livesEnabled,
    livesRemaining,
    sessionActive,
    sessionConfidenceCount,
    sessionConfidenceTotal,
    sessionPoints,
    sessionRounds,
    sessionScore,
    sessionTargetItems,
    clearPersistedSession,
  ])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await window.jplearnDesktop?.getStudySummary()
      setSummary(payload)
      saveSummarySnapshot(payload)
      if (startupFirstSummaryMsRef.current === null) {
        startupFirstSummaryMsRef.current = Math.round(performance.now() - startupBootMarkRef.current)
      }
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown desktop bridge error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  // Fetch XP progress, study recommendations, and learning path
  // on mount and whenever the summary refreshes.
  useEffect(() => {
    let mounted = true
    const getXp = window.jplearnDesktop?.getXpProgress
    const getRecs = window.jplearnDesktop?.getRecommendations
    const getPath = window.jplearnDesktop?.getLearningPathStatus

    const safeResolve = async <T,>(fn: (() => Promise<T>) | undefined): Promise<T | null> => {
      if (!fn) return null
      try { return await fn() } catch { return null }
    }

    const doFetch = async () => {
      const [xp, recs, path] = await Promise.all([
        safeResolve(getXp),
        safeResolve(getRecs),
        safeResolve(getPath),
      ])
      if (!mounted) return
      if (xp) setXpProgress(xp)
      if (recs) setRecommendations(recs.recommendations)
      if (path) setLearningPathStatus(path as LearningPathStatus)
    }
    void doFetch()

    return () => { mounted = false }
  }, [summary])

  const notifyStartupReady = useCallback((deferredLoadsQueuedAtMs?: number) => {
    if (startupReadySentRef.current) return
    startupReadySentRef.current = true

    const startupReadyMs = Math.round(performance.now() - startupBootMarkRef.current)
    void window.jplearnDesktop?.notifyStartupReady({
      startupReadyMs,
      firstSummaryMs: startupFirstSummaryMsRef.current,
      deferredLoadsQueuedAtMs,
    }).catch(() => undefined)
  }, [])


















  // Avoid background tutor runtime warmup on startup.
  // Runtime loads lazily when the user sends a chat request.






  useEffect(() => {
    let cancelled = false
    let warmupStartHandle: number | null = null
    let lastYieldAt = performance.now()

    const yieldToMain = async () => {
      if (typeof globalThis.scheduler !== 'undefined' && typeof globalThis.scheduler.yield === 'function') {
        await globalThis.scheduler.yield()
        return
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })
    }

    const maybeYieldToMain = async () => {
      if (performance.now() - lastYieldAt < STARTUP_WARMUP_YIELD_DEADLINE_MS) {
        return
      }
      await yieldToMain()
      lastYieldAt = performance.now()
    }

    async function preloadStartupDeckData(): Promise<void> {
      const startupScripts: ScriptKey[] = ['hiragana', 'katakana']
      const deferredLoadsQueuedAtMs = Math.round(performance.now() - startupBootMarkRef.current)

      // Signal startup-ready as soon as core UI mounts; keep deck warmups fully backgrounded.
      notifyStartupReady(deferredLoadsQueuedAtMs)

      const preloadScript = async (script: ScriptKey): Promise<void> => {
        if (scriptDeckCacheRef.current[script] && scriptBlockCacheRef.current[script]) {
          return
        }

        if (!scriptDeckCacheRef.current[script]) {
          const deckPayload = await getDeckCardsDeduped(script)
          if (cancelled) return
          scriptDeckCacheRef.current[script] = limitRuntimeDeckCards(script, normalizeDeckCards(deckPayload.cards))
        }

        if (!scriptBlockCacheRef.current[script]) {
          try {
            const blockPayload = await getBlockProgressDeduped(script)
            if (cancelled) return
            scriptBlockCacheRef.current[script] = normalizeBlockList(blockPayload.blocks)
          } catch { /* ignore preload failure */ }
        }
      }

      try {
        // Keep post-open warmup lightweight to avoid blocking input shortly
        // after first paint.
        for (const script of startupScripts) {
          await preloadScript(script)
          if (cancelled) return
          await maybeYieldToMain()
        }
      } catch {
        // Allow startup to continue even if preloading fails on some decks.
      }
    }

    warmupStartHandle = window.setTimeout(() => {
      if (!cancelled) {
        void preloadStartupDeckData()
      }
    }, STARTUP_WARMUP_INITIAL_DELAY_MS)

    return () => {
      cancelled = true
      if (warmupStartHandle !== null) {
        window.clearTimeout(warmupStartHandle)
      }
    }
  }, [getBlockProgressDeduped, getDeckCardsDeduped, notifyStartupReady])

  const loadScriptCards = useCallback(async (
    script: ScriptKey,
    kanjiCategory: KanjiCategory = activeKanjiCategory,
    vocabCategory: VocabCategory = activeVocabCategory,
  ) => {
    const requestId = scriptLoadRequestIdRef.current + 1
    scriptLoadRequestIdRef.current = requestId
    setGameLoading(true)
    setGameError(null)

    resetSessionFull()

    try {
      if (script === 'kanji_n5') {
        const selectedKanjiSlug = KANJI_CATEGORY_TO_DECK_SLUG[kanjiCategory]
        const cachedCards = kanjiCategoryDeckCacheRef.current[kanjiCategory]
        const cachedBlocks = kanjiCategoryBlockCacheRef.current[kanjiCategory]

        let selectedCards = cachedCards
        let selectedBlocks = cachedBlocks

        if (!selectedCards || !selectedBlocks) {
          const [selectedDeckPayload, blockPayload] = await Promise.all([
            getDeckCardsDeduped(selectedKanjiSlug),
            getBlockProgressDeduped(selectedKanjiSlug),
          ])

          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }

          selectedCards = normalizeDeckCards(selectedDeckPayload.cards)
          selectedBlocks = normalizeBlockList(blockPayload.blocks)
          kanjiCategoryDeckCacheRef.current[kanjiCategory] = selectedCards
          kanjiCategoryBlockCacheRef.current[kanjiCategory] = selectedBlocks
          setKanjiDeckCardsByCategory((previous) => ({
            ...previous,
            [kanjiCategory]: selectedCards,
          }))
        }

        const resolvedKanjiCards = selectedCards ?? []
        const resolvedKanjiBlocks = selectedBlocks ?? []

        setDeckCards(resolvedKanjiCards)

        // Preload remaining kanji categories in background
        for (const cat of KANJI_CATEGORY_ORDER) {
          if (cat === kanjiCategory || kanjiCategoryDeckCacheRef.current[cat]) continue
          void (async () => {
            try {
              const payload = await getDeckCardsDeduped(KANJI_CATEGORY_TO_DECK_SLUG[cat])
              const normalizedCards = normalizeDeckCards(payload.cards)
              kanjiCategoryDeckCacheRef.current[cat] = normalizedCards
              setKanjiDeckCardsByCategory((previous) => ({
                ...previous,
                [cat]: normalizedCards,
              }))
            } catch { /* ignore preload failure */ }
          })()
          void (async () => {
            try {
              const payload = await getBlockProgressDeduped(KANJI_CATEGORY_TO_DECK_SLUG[cat])
              kanjiCategoryBlockCacheRef.current[cat] = normalizeBlockList(payload.blocks)
            } catch { /* ignore preload failure */ }
          })()
        }

        const blocks = resolvedKanjiBlocks
        setBlockProgress(blocks)
        if (blocks.length > 0) {
          const lastUnlocked = blocks.reduce(
            (best, b) => (b.unlocked ? b.index : best),
            0,
          )
          setActiveBlockIndex(lastUnlocked)
        } else {
          setActiveBlockIndex(0)
        }
      } else if (script === 'vocab_n5') {
        const selectedVocabSlug = VOCAB_CATEGORY_TO_DECK_SLUG[vocabCategory]
        const cachedCards = vocabCategoryDeckCacheRef.current[vocabCategory]
        const cachedBlocks = vocabCategoryBlockCacheRef.current[vocabCategory]

        let selectedCards = cachedCards
        let selectedBlocks = cachedBlocks

        if (!selectedCards || !selectedBlocks) {
          const [selectedDeckPayload, blockPayload] = await Promise.all([
            getDeckCardsDeduped(selectedVocabSlug),
            getBlockProgressDeduped(selectedVocabSlug),
          ])

          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }

          selectedCards = normalizeDeckCards(selectedDeckPayload.cards)
          selectedBlocks = normalizeBlockList(blockPayload.blocks)
          vocabCategoryDeckCacheRef.current[vocabCategory] = selectedCards
          vocabCategoryBlockCacheRef.current[vocabCategory] = selectedBlocks
          setVocabDeckCardsByCategory((previous) => ({
            ...previous,
            [vocabCategory]: selectedCards,
          }))
        }

        const resolvedVocabCards = selectedCards ?? []
        const resolvedVocabBlocks = selectedBlocks ?? []

        setDeckCards(resolvedVocabCards)

        // Preload remaining vocab categories in background
        for (const cat of VOCAB_CATEGORY_ORDER) {
          if (cat === vocabCategory || vocabCategoryDeckCacheRef.current[cat]) continue
          void (async () => {
            try {
              const payload = await getDeckCardsDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
              const normalizedCards = normalizeDeckCards(payload.cards)
              vocabCategoryDeckCacheRef.current[cat] = normalizedCards
              setVocabDeckCardsByCategory((previous) => ({
                ...previous,
                [cat]: normalizedCards,
              }))
            } catch { /* ignore preload failure */ }
          })()
          void (async () => {
            try {
              const payload = await getBlockProgressDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
              vocabCategoryBlockCacheRef.current[cat] = normalizeBlockList(payload.blocks)
            } catch { /* ignore preload failure */ }
          })()
        }

        const blocks = resolvedVocabBlocks
        setBlockProgress(blocks)
        if (blocks.length > 0) {
          const lastUnlocked = blocks.reduce(
            (best, b) => (b.unlocked ? b.index : best),
            0,
          )
          setActiveBlockIndex(lastUnlocked)
        } else {
          setActiveBlockIndex(0)
        }
      } else {
        const cachedDeck = scriptDeckCacheRef.current[script]
        const cachedBlocks = scriptBlockCacheRef.current[script]

        let resolvedCards = cachedDeck
        let resolvedBlocks = cachedBlocks

        if (!resolvedCards || !resolvedBlocks) {
          const [deckPayload, blockPayload] = await Promise.all([
            resolvedCards ? Promise.resolve({ cards: resolvedCards }) : getDeckCardsDeduped(script),
            resolvedBlocks ? Promise.resolve({ blocks: resolvedBlocks }) : getBlockProgressDeduped(script),
          ])
          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }

          if (!resolvedCards) {
            resolvedCards = limitRuntimeDeckCards(script, normalizeDeckCards(deckPayload.cards))
            scriptDeckCacheRef.current[script] = resolvedCards
          }
          if (!resolvedBlocks) {
            resolvedBlocks = normalizeBlockList(blockPayload.blocks)
            scriptBlockCacheRef.current[script] = resolvedBlocks
          }
        }

        setDeckCards(resolvedCards ?? [])

        const blocks = resolvedBlocks ?? []
        setBlockProgress(blocks)
        if (blocks.length > 0) {
          const lastUnlocked = blocks.reduce(
            (best, b) => (b.unlocked ? b.index : best),
            0,
          )
          setActiveBlockIndex(lastUnlocked)
        } else {
          setActiveBlockIndex(0)
        }
      }

      lastLoadedScriptRef.current = script
    } catch (err) {
      if (scriptLoadRequestIdRef.current !== requestId) {
        return
      }
      setDeckCards([])
      setBlockProgress([])
      setActiveBlockIndex(0)
      setGameError(err instanceof Error ? err.message : 'Unknown game bridge error')
    } finally {
      if (scriptLoadRequestIdRef.current === requestId) {
        setGameLoading(false)
      }
    }
  }, [activeKanjiCategory, activeVocabCategory, getBlockProgressDeduped, getDeckCardsDeduped, resetRoundCycle])

  // After the backend SRS states change wholesale (onboarding seeding or a reset),
  // the cached deck/block progress no longer matches the database. Drop every cache
  // and refetch so the minigame learning path and overview block tiles reflect the
  // new unlock/mastery state instead of showing stale "locked"/0% data.
  const refreshDeckProgressAfterSeedChange = useCallback(() => {
    scriptDeckCacheRef.current = {}
    scriptBlockCacheRef.current = {}
    kanjiCategoryDeckCacheRef.current = {}
    kanjiCategoryBlockCacheRef.current = {}
    vocabCategoryDeckCacheRef.current = {}
    vocabCategoryBlockCacheRef.current = {}
    studyQueueCacheRef.current.clear()

    void loadScriptCards(activeScript, activeKanjiCategory, activeVocabCategory)
    void (async () => {
      try {
        const payload = await window.jplearnDesktop?.getOverviewCharacterMastery()
        if (!payload) return
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      } catch { /* ignore */ }
    })()
  }, [activeScript, activeKanjiCategory, activeVocabCategory, loadScriptCards])

  useEffect(() => {
    void loadScriptCards(activeScript, activeKanjiCategory, activeVocabCategory)
  }, [activeScript, activeKanjiCategory, activeVocabCategory, loadScriptCards])

  const buildBridgeGrammarRound = useCallback(async (
    card: ScriptDeck['cards'][number],
    minigame: PlayableMinigame,
    options: {
      curriculumStage: 1 | 2 | 3
      surprisePrompt: boolean
      surpriseLabel: string
      promptSeed: number
      exampleSentenceAudioText: string | null
      dictionarySeedQuery: string | null
      dictionaryNote: RoundDictionaryNote | null
      exampleSentenceHint: string | null
    },
  ): Promise<RoundState | null> => {
    const {
      curriculumStage,
      surprisePrompt,
      surpriseLabel,
      promptSeed,
      exampleSentenceAudioText,
      dictionarySeedQuery,
      dictionaryNote,
      exampleSentenceHint,
    } = options

    const getGrammarData = window.jplearnDesktop?.getGrammarMinigameData
    if (!getGrammarData) return null

    const sourceSentence = card.example_sentence?.trim() || card.character
    if (!sourceSentence) return null

    const gameType = isSentenceAssemblyMode(minigame)
      ? 'sentence_assembly'
      : isParticleClozeMode(minigame)
        ? 'particle_cloze'
        : isVibeCheckMode(minigame)
          ? 'vibe_check'
        : isImposterMode(minigame)
          ? 'imposter'
          : null
    if (!gameType) return null

    let response: GrammarMinigameResponse
    try {
      response = await getGrammarData({
        gameType,
        sentence: sourceSentence,
        seed: promptSeed,
      })
    } catch {
      return null
    }

    const data = response.data as Record<string, unknown>

    if (isSentenceAssemblyMode(minigame)) {
      const promptSentence = typeof data.sentence === 'string' ? data.sentence : sourceSentence
      const shuffledChunks = Array.isArray(data.shuffled_chunks)
        ? data.shuffled_chunks.filter((entry): entry is { id: string; text: string } => {
          if (entry === null || typeof entry !== 'object') return false
          const id = (entry as Record<string, unknown>).id
          const text = (entry as Record<string, unknown>).text
          return typeof id === 'string' && id.trim().length > 0 && typeof text === 'string' && text.trim().length > 0
        })
        : []
      const answerOrder = Array.isArray(data.answer_order)
        ? data.answer_order.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
      if (shuffledChunks.length < 2 || answerOrder.length < 2) return null

      const options = shuffledChunks.map((chunk) => ({
        id: chunk.id,
        label: chunk.text,
      }))
      const chunkLookup = Array.isArray(data.chunks)
        ? new Map(
          data.chunks
            .filter((entry): entry is { id: string; text: string } => {
              if (entry === null || typeof entry !== 'object') return false
              const id = (entry as Record<string, unknown>).id
              const text = (entry as Record<string, unknown>).text
              return typeof id === 'string' && typeof text === 'string'
            })
            .map((chunk) => [chunk.id, chunk.text]),
        )
        : new Map(options.map((option) => [option.id, option.label]))
      const answerDisplay = answerOrder.map((chunkId) => chunkLookup.get(chunkId) ?? '').join('').trim()

      return {
        cardId: card.id,
        mode: minigame,
        audioText: sourceSentence,
        exampleSentenceAudioText,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: exampleSentenceHint ?? 'Arrange chunks to restore a natural sentence flow.',
        dictionarySeedQuery,
        dictionaryNote,
        promptLabel: surprisePrompt ? surpriseLabel : 'Rebuild the sentence in natural order.',
        focusText: promptSentence,
        answer: answerOrder.join('|'),
        answerDisplay: answerDisplay.length > 0 ? answerDisplay : null,
        options,
      }
    }

    if (isParticleClozeMode(minigame)) {
      const prompt = typeof data.prompt === 'string' ? data.prompt : sourceSentence
      const answer = typeof data.correct_particle === 'string' ? data.correct_particle : ''
      const rawOptions = Array.isArray(data.options)
        ? data.options.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []
      if (!answer || rawOptions.length === 0) return null
      const options = shuffleArray(Array.from(new Set(rawOptions))).map((label, index) => ({
        id: `${card.id}-particle-${index}`,
        label,
      }))

      return {
        cardId: card.id,
        mode: minigame,
        audioText: sourceSentence,
        exampleSentenceAudioText,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: exampleSentenceHint ?? 'Use sentence flow to pick the correct particle.',
        dictionarySeedQuery,
        dictionaryNote,
        promptLabel: surprisePrompt ? surpriseLabel : 'Fill in the missing particle.',
        focusText: prompt,
        answer,
        options,
      }
    }

    if (isVibeCheckMode(minigame)) {
      const answer = typeof data.correct_label === 'string' ? data.correct_label : ''
      const rawOptions = Array.isArray(data.options)
        ? data.options.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []
      if (!answer || rawOptions.length === 0) return null

      const dedupedOptions = Array.from(new Set(rawOptions))
      if (!dedupedOptions.includes(answer)) {
        dedupedOptions.unshift(answer)
      }

      const options = shuffleArray(dedupedOptions.slice(0, 4)).map((label, index) => ({
        id: `${card.id}-vibe-${index}`,
        label,
      }))

      return {
        cardId: card.id,
        mode: minigame,
        audioText: sourceSentence,
        exampleSentenceAudioText,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: exampleSentenceHint ?? 'Look at sentence endings and politeness markers to infer social context.',
        dictionarySeedQuery,
        dictionaryNote,
        promptLabel: surprisePrompt ? surpriseLabel : 'Pick the social register that best fits this sentence.',
        focusText: sourceSentence,
        answer,
        options,
      }
    }

    if (isImposterMode(minigame)) {
      const mutatedSentence = typeof data.mutated_sentence === 'string' ? data.mutated_sentence : sourceSentence
      const answer = typeof data.mutated_token === 'string' ? data.mutated_token : ''
      const rawTokens = Array.isArray(data.mutated_tokens)
        ? data.mutated_tokens.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []
      if (!answer || rawTokens.length === 0) return null

      const dedupedOptions = Array.from(new Set(rawTokens)).slice(0, 4)
      if (!dedupedOptions.includes(answer)) {
        dedupedOptions.unshift(answer)
      }
      const options = shuffleArray(dedupedOptions.slice(0, 4)).map((label, index) => ({
        id: `${card.id}-imposter-${index}`,
        label,
      }))

      return {
        cardId: card.id,
        mode: minigame,
        audioText: sourceSentence,
        exampleSentenceAudioText,
        surprisePrompt,
        curriculumStage,
        chapterNumber: curriculumStage,
        chapterLabel: null,
        hintText: 'Find the grammatically incorrect token in this sentence.',
        dictionarySeedQuery,
        dictionaryNote,
        promptLabel: surprisePrompt ? surpriseLabel : 'Spot the grammatical imposter.',
        focusText: mutatedSentence,
        answer,
        options,
      }
    }

    return null
  }, [])

  const buildRound = useCallback(
    (
      cards: ScriptDeck['cards'],
      minigame: PlayableMinigame,
      cardIndex: number,
      surprisePrompt: boolean,
      promptSeed: number,
    ): RoundState | null => {
      if (cards.length === 0) return null

      const card = cards[cardIndex]
      const surpriseLabel = pickSurprisePrompt(activeScript, minigame, card.tags, promptSeed)
      const currentScore = cardScores[activeScript][card.id] ?? 0
      const persistedStage = normalizeCurriculumStage(card.curriculum_stage)
      const scoreStage = curriculumStageFromScore(currentScore)
      const curriculumStage = isGrammarCurriculumMode(minigame)
        ? persistedStage
        : scoreStage
      const exampleSentenceAudioText = card.example_sentence?.trim() || null
      const exampleSentenceHint = card.example_sentence
        ? `Example: ${card.example_sentence}`
        : null
      const dictionaryNote = buildRoundDictionaryNote(card, minigame)
      const dictionarySeedQuery = card.character || card.romaji || null

      if (minigame === 'romaji_sprint') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'What is the reading? Type in romaji.'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel,
          focusText: card.character,
          answer: card.romaji,
          options: [],
        }
      }

      if (minigame === 'typed_recall') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'What does this mean? Type your answer.'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? `Think about what ${card.character} means.`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel,
          focusText: card.character,
          answer: card.meaning,
          options: [],
        }
      }

      if (minigame === 'speech_recall') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'What does this mean? Say your answer aloud.'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? `Think about what ${card.character} means.`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel,
          focusText: card.character,
          answer: card.meaning,
          options: [],
        }
      }

      if (minigame === 'stroke_order') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'Type the romaji reading to see kanji options.'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: 'Type the reading, then select the matching kanji from the options.',
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel,
          focusText: card.meaning,
          answer: card.character,
          options: [],
        }
      }

      if (isSentenceAssemblyMode(minigame)) {
        const sourceSentence = card.example_sentence?.trim() || ''
        const chunks = splitSentenceIntoAssemblyChunks(sourceSentence)
        if (chunks.length < 2) return null

        const orderedOptions = chunks.map((chunk, index) => ({
          id: `${card.id}-assembly-${index}`,
          label: chunk,
        }))
        const options = shuffleArray(orderedOptions)

        return {
          cardId: card.id,
          mode: minigame,
          audioText: sourceSentence,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? 'Place each chunk where the sentence sounds most natural.',
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : 'Arrange the chunks to rebuild the original sentence.',
          focusText: sourceSentence,
          answer: orderedOptions.map((option) => option.id).join('|'),
          answerDisplay: chunks.join(''),
          options,
        }
      }

      if (cards.length < 2) return null

      const cardsById = new Map(cards.map((entry) => [entry.id, entry]))

      function pickDistractorsFromPool(poolIds: number[], desiredCount: number): ScriptDeck['cards'] {
        const selected: ScriptDeck['cards'] = []
        const seen = new Set<number>()
        for (const candidateId of poolIds) {
          if (candidateId === card.id || seen.has(candidateId)) continue
          const candidate = cardsById.get(candidateId)
          if (!candidate) continue
          selected.push(candidate)
          seen.add(candidateId)
          if (selected.length >= desiredCount) return selected
        }

        // Prefer same-tag distractors to keep options semantically coherent.
        const cardTagSet = new Set(card.tags.map((tag) => tag.toLowerCase()))
        for (const candidate of cards) {
          if (candidate.id === card.id || seen.has(candidate.id)) continue
          const sharesTag = candidate.tags.some((tag) => cardTagSet.has(tag.toLowerCase()))
          if (!sharesTag) continue
          selected.push(candidate)
          seen.add(candidate.id)
          if (selected.length >= desiredCount) return selected
        }

        // Final fallback when ranked pool and tag pool are insufficient.
        for (const fallbackIndex of chooseUniqueIndices(cards.length, desiredCount * 2, cardIndex)) {
          const fallbackCard = cards[fallbackIndex]
          if (fallbackCard.id === card.id || seen.has(fallbackCard.id)) continue
          selected.push(fallbackCard)
          seen.add(fallbackCard.id)
          if (selected.length >= desiredCount) break
        }

        return selected
      }

      if (minigame === 'meaning_match') {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-meaning`,
            label: candidate.meaning,
          })),
        ])

        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: activeScript === 'kanji_n5'
            ? 'Think about how this kanji looks — its structure can help you recall it.'
            : exampleSentenceHint,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : 'What does this character mean?',
          focusText: card.character,
          answer: card.meaning,
          options,
        }
      }

      if (isParticleClozeMode(minigame)) {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-cloze-meaning`,
            label: candidate.meaning,
          })),
        ])
        const clozeSentence = buildClozeLine(activeScript, curriculumStage, promptSeed, card).replace('___', '_____')

        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? `The word is ${card.character} (${card.romaji}).`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : 'Fill in the blank.',
          focusText: clozeSentence,
          answer: card.meaning,
          options,
        }
      }

      if (isVibeCheckMode(minigame)) {
        const sourceSentence = card.example_sentence?.trim() || card.character
        const options = shuffleArray([
          { id: `${card.id}-vibe-0`, label: 'Casual / Plain' },
          { id: `${card.id}-vibe-1`, label: 'Polite' },
          { id: `${card.id}-vibe-2`, label: 'Formal Request' },
          { id: `${card.id}-vibe-3`, label: 'Unclear / Context Needed' },
        ])

        const answer =
          sourceSentence.includes('ください')
            ? 'Formal Request'
            : sourceSentence.includes('です') || sourceSentence.includes('ます')
              ? 'Polite'
              : 'Casual / Plain'

        return {
          cardId: card.id,
          mode: minigame,
          audioText: sourceSentence,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? 'Read the sentence ending to judge whether it sounds casual, polite, or request-formal.',
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : 'Which social context best fits this sentence?',
          focusText: sourceSentence,
          answer,
          options,
        }
      }

      if (isImposterMode(minigame)) {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-story-meaning`,
            label: candidate.meaning,
          })),
        ])
        const chapter = buildStoryChapter(activeScript, curriculumStage, promptSeed, card)
        const readingPassage = card.example_sentence?.trim() ?? ''
        const readingFocusText = readingPassage.length > 0 ? readingPassage : chapter.line.replace('___', '_____')

        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: curriculumStage,
          chapterLabel: null,
          hintText: readingPassage.length > 0
            ? `The sentence uses ${card.character} — choose its meaning.`
            : exampleSentenceHint ?? `This scene features ${card.character} — read as "${card.romaji}".`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : readingPassage.length > 0
              ? 'Read the passage and choose the best answer.'
              : 'Which word best completes this scene?',
          focusText: readingFocusText,
          answer: card.meaning,
          options,
        }
      }

      if (minigame === 'listening_audio_first') {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-listening-audio-meaning`,
            label: candidate.meaning,
          })),
        ])
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: `The character is ${card.character} (${card.romaji}).`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt ? surpriseLabel : 'Listen and choose the meaning.',
          focusText: card.character,
          answer: card.meaning,
          options,
        }
      }

      if (minigame === 'dictation') {
        const isKanaScript = activeScript === 'hiragana' || activeScript === 'katakana'
        const dictationAnswer = isKanaScript
          ? card.character
          : toHiragana(card.romaji.replace(/\s+/g, ''))
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          exampleSentenceAudioText,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: isKanaScript
            ? `Type the romaji for what you hear (e.g., "ka" for か).`
            : `Type the reading you hear in Japanese.`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt ? surpriseLabel
            : isKanaScript
              ? 'Listen and type the romaji for what you hear.'
              : 'Listen and type the reading in Japanese.',
          focusText: card.character,
          answer: dictationAnswer,
          options: [],
        }
      }

      const rankedCharacterDistractors = pickDistractorsFromPool(card.character_distractor_ids, 3)
      const options = shuffleArray([
        { id: `${card.id}-correct`, label: card.character },
        ...rankedCharacterDistractors.map((candidate) => ({
          id: `${candidate.id}-character`,
          label: candidate.character,
        })),
      ])

      return {
        cardId: card.id,
        mode: minigame,
        audioText: card.character,
        exampleSentenceAudioText,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: activeScript === 'kanji_n5'
          ? 'Think about how this kanji looks — its structure can help you recall it.'
          : exampleSentenceHint,
        dictionarySeedQuery,
        dictionaryNote,
        promptLabel: surprisePrompt
          ? surpriseLabel
          : 'Which character matches this meaning?',
        focusText: card.meaning,
        answer: card.character,
        options,
      }
    },
    [activeScript, cardScores],
  )

  const buildRoundWithBridge = useCallback(async (
    cards: ScriptDeck['cards'],
    minigame: PlayableMinigame,
    cardIndex: number,
    surprisePrompt: boolean,
    promptSeed: number,
  ): Promise<RoundState | null> => {
    if (cards.length === 0) return null

    const card = cards[cardIndex]
    const surpriseLabel = pickSurprisePrompt(activeScript, minigame, card.tags, promptSeed)
    const currentScore = cardScores[activeScript][card.id] ?? 0
    const persistedStage = normalizeCurriculumStage(card.curriculum_stage)
    const scoreStage = curriculumStageFromScore(currentScore)
    const curriculumStage = isGrammarCurriculumMode(minigame)
      ? persistedStage
      : scoreStage
    const exampleSentenceAudioText = card.example_sentence?.trim() || null
    const exampleSentenceHint = card.example_sentence
      ? `Example: ${card.example_sentence}`
      : null
    const dictionaryNote = buildRoundDictionaryNote(card, minigame)
    const dictionarySeedQuery = card.character || card.romaji || null

    const bridgeRound = await buildBridgeGrammarRound(card, minigame, {
      curriculumStage,
      surprisePrompt,
      surpriseLabel,
      promptSeed,
      exampleSentenceAudioText,
      dictionarySeedQuery,
      dictionaryNote,
      exampleSentenceHint,
    })
    if (bridgeRound) return bridgeRound

    return buildRound(cards, minigame, cardIndex, surprisePrompt, promptSeed)
  }, [activeScript, buildBridgeGrammarRound, buildRound, cardScores])

  const nextRoundMode = useCallback((selectedMode: MinigameKey): { mode: PlayableMinigame; surprisePrompt: boolean; promptSeed: number } => {
    if (selectedMode !== 'interleave_mix') {
      return { mode: selectedMode, surprisePrompt: false, promptSeed: 0 }
    }

    const cursor = interleaveCursorRef.current
    interleaveCursorRef.current += 1
    return {
      mode: interleaveSequence[cursor % interleaveSequence.length],
      surprisePrompt: interleaveSurpriseEnabled && cursor % Math.max(interleaveSurpriseEvery, 1) === 0,
      promptSeed: cursor,
    }
  }, [interleaveSequence, interleaveSurpriseEnabled, interleaveSurpriseEvery])

  const leechCards = useMemo(
    () => deckCards.filter((card) => card.is_leech),
    [deckCards],
  )

  const kanjiLevelProgress = useMemo(
    () => buildJlptLevelProgressFromLevelDecks(kanjiDeckCardsByLevel, cardScores.kanji_n5),
    [kanjiDeckCardsByLevel, cardScores.kanji_n5],
  )

  const vocabLevelProgress = useMemo(
    () => buildJlptLevelProgressFromLevelDecks(vocabDeckCardsByLevel, cardScores.vocab_n5),
    [vocabDeckCardsByLevel, cardScores.vocab_n5],
  )

  const kanjiCategoryProgress = useMemo(
    () => buildCategoryProgress(
      KANJI_CATEGORY_ORDER, KANJI_CATEGORY_LABELS, KANJI_CATEGORY_TO_DECK_SLUG,
      kanjiDeckCardsByCategory, cardScores.kanji_n5,
    ),
    [kanjiDeckCardsByCategory, cardScores.kanji_n5],
  )

  const vocabCategoryProgress = useMemo(
    () => buildCategoryProgress(
      VOCAB_CATEGORY_ORDER, VOCAB_CATEGORY_LABELS, VOCAB_CATEGORY_TO_DECK_SLUG,
      vocabDeckCardsByCategory, cardScores.vocab_n5,
    ),
    [vocabDeckCardsByCategory, cardScores.vocab_n5],
  )

  const overviewKanjiLevelProgress = useMemo(
    () => buildJlptLevelProgress(overviewKanjiDeck, cardScores.kanji_n5),
    [overviewKanjiDeck, cardScores.kanji_n5],
  )

  // Cards restricted to the active block when block progression is available.
  const activeBlockCards = useMemo(() => {
    if (blockProgress.length === 0) {
      return deckCards
    }
    const block = blockProgress.find((entry) => entry.index === activeBlockIndex)
    if (!block) return deckCards
    const idSet = new Set(block.card_ids)
    const matchingCards = deckCards.filter((c) => idSet.has(c.id))
    // Fallback to full deck when block metadata does not map to loaded card IDs.
    return matchingCards.length > 0 ? matchingCards : deckCards
  }, [deckCards, blockProgress, activeBlockIndex])

  const activeSessionLengthPreset = useMemo(
    () => SESSION_LENGTH_PRESETS.find((preset) => preset.items === sessionTargetItems) ?? null,
    [sessionTargetItems],
  )

  useEffect(() => {
    if (activeSessionLengthPreset) return
    setSessionTargetItems(DEFAULT_SESSION_LENGTH_PRESET.items)
  }, [activeSessionLengthPreset])

  const startSession = useCallback(async (selectedGame: MinigameKey = activeGame, customCards?: GameCard[], customTargetItems?: number, restore?: PersistedSessionRestore) => {
    setSessionStartPending(true)
    resetRoundCycle()
    setSessionGoalError(null)
    setLastSessionSummary(null)
    setSessionRunReport(null)
    setActiveSessionId(null)
    seenCardIdsRef.current = []
    wrongCardIdsRef.current = []
    nearMissCardIdsRef.current = []

    setSessionScore(restore?.sessionScore ?? 0)
    setSessionRounds(restore?.sessionRounds ?? 0)
    setSessionPoints(restore?.sessionPoints ?? 0)
    setSessionStreak(restore?.sessionStreak ?? 0)
    setSessionBestStreak(restore?.sessionBestStreak ?? 0)
    setSessionConfidenceCount(restore?.sessionConfidenceCount ?? 0)
    setSessionConfidenceTotal(restore?.sessionConfidenceTotal ?? 0)
    setLivesRemaining(restore?.livesRemaining ?? DEFAULT_LIVES)

    try {
      const sourceCards = customCards
        ?? (leechFocusEnabled && activeBlockCards.filter((card) => card.is_leech).length > 0
          ? activeBlockCards.filter((card) => card.is_leech)
          : activeBlockCards)
      const modeSelection = nextRoundMode(selectedGame)
      const modeCards = isImposterMode(modeSelection.mode)
        ? narrativePriorityCards(sourceCards)
        : sourceCards
      const goalTargetItems = Math.max(1, Math.floor(customTargetItems ?? sessionTargetItems))

      const goalRequest = window.jplearnDesktop?.startSessionGoal({
          targetItems: goalTargetItems,
        })

      await hydrateRoundCycle(modeCards)
      const index = nextCardIndex(modeCards.length)
      const nextRound = index === null
        ? null
        : await buildRoundWithBridge(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
      if (!nextRound) {
        setSessionActive(false)
        setRoundState(null)
        if (leechFocusEnabled && activeBlockCards.filter((card) => card.is_leech).length === 0) {
          setGameError('No active leech cards in this block yet. Disable focused review mode to continue.')
        } else {
          setGameError('Not enough cards in this block for the selected minigame yet.')
        }
        return
      }

      setSessionActive(true)
      saveSessionPrefs()
      setRoundState(nextRound)
      roundPresentedAtRef.current = performance.now()
      setRoundInput('')
      setRoundFeedback(null)
      setRoundFeedbackTone(null)
      setRoundFeedbackPoints(null)
      setRoundFeedbackAnswer(null)
      setRoundPerformanceLabel(null)
      setIsRoundResolving(false)
      setGameError(null)
      setRoundConfidenceScore(3)
      try {
        const goalResponse: SessionGoalStartResponse = await goalRequest
        if (!goalResponse.ok) {
          setSessionGoalError('Unable to start session goal.')
        } else {
          setActiveSessionId(goalResponse.goal.session_id)
        }
      } catch (error: unknown) {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session goal.')
      }
    } catch (error: unknown) {
      resetSessionCore()
      setGameError(error instanceof Error ? error.message : 'Unable to start session.')
      setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session.')
    } finally {
      setSessionStartPending(false)
    }
  }, [
    activeBlockCards,
    activeGame,
    buildRoundWithBridge,
    hydrateRoundCycle,
    leechFocusEnabled,
    nextCardIndex,
    nextRoundMode,
    resetRoundCycle,
    sessionTargetItems,
  ])

  const skipFeedback = useCallback(() => {
    feedbackAdvanceRef.current?.()
    feedbackAdvanceRef.current = null
  }, [])


  const continueLastSession = useCallback(() => {
    if (!sessionRunReport) return

    const script = sessionRunReport.script
    const minigame = resolveScriptMinigame(script, sessionRunReport.minigame)

    setActiveGame(minigame)
    setNavDirection('forward')
    setView('minigame')
    resetSessionWithLives()

    if (script !== activeScript) {
      setActiveScript(script)
      setResumeRequest({ script, minigame })
      return
    }

    void startSession(minigame)
  }, [activeScript, resetRoundCycle, resolveScriptMinigame, sessionRunReport, startSession])

  useEffect(() => {
    if (!resumeRequest) return
    if (activeScript !== resumeRequest.script) return
    if (gameLoading || sessionStartPending) return

    const { minigame } = resumeRequest
    setResumeRequest(null)
    void startSession(minigame)
  }, [activeScript, gameLoading, resumeRequest, sessionStartPending, startSession])

  const handleResume = useCallback(async () => {
    if (!resumeData) return
    const data = resumeData
    setShowResumeToast(false)
    setResumeData(null)
    clearPersistedSession()

    setActiveScript(data.activeScript)
    setActiveGame(data.activeGame)
    setLivesEnabled(data.livesEnabled)
    setLeechFocusEnabled(data.leechFocusEnabled)
    setConfidenceCaptureEnabled(data.confidenceCaptureEnabled)

    try {
      const deckPayload = await window.jplearnDesktop.getDeckCards(data.activeScript)
      const seenSet = new Set(data.seenCardIds)
      const remainingCards = deckPayload.cards.filter((c) => !seenSet.has(c.id))
      const targetItems = Math.max(1, remainingCards.length)
      setSessionTargetItems(targetItems)

      setNavDirection('forward')
      setView('minigame')

      if (targetItems > 0) {
        setTimeout(() => {
          startSession(data.activeGame, remainingCards, targetItems, data.restore)
        }, 100)
      }
    } catch {
      setNavDirection('forward')
      setView('minigame')
      startSession(data.activeGame)
    }
  }, [resumeData, startSession, clearPersistedSession])

  const handleDismissResume = useCallback(() => {
    setShowResumeToast(false)
    setResumeData(null)
    clearPersistedSession()
  }, [clearPersistedSession])

  const handleRetry = useCallback((cardIds: number[]) => {
    const retryCards = deckCards.filter((c) => cardIds.includes(c.id))
    if (retryCards.length > 0) {
      startSession(activeGame, retryCards)
    }
  }, [activeGame, deckCards, startSession])

  const nextRound = useCallback(async () => {
    const leechPool = activeBlockCards.filter((card) => card.is_leech)
    const sourceCards = leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards
    const modeSelection = nextRoundMode(activeGame)
    const modeCards = isImposterMode(modeSelection.mode)
      ? narrativePriorityCards(sourceCards)
      : sourceCards
    let index = nextCardIndex(modeCards.length)
    if (index === null) {
      await hydrateRoundCycle(modeCards)
      index = nextCardIndex(modeCards.length)
    }
    const candidate = index === null
      ? null
      : await buildRoundWithBridge(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
    if (!candidate) {
      resetSessionCore()
      return
    }

    setRoundState(candidate)
    roundPresentedAtRef.current = performance.now()
    setRoundInput('')
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setRoundPerformanceLabel(null)
      setRoundComboBonus(0)
      setRoundMilestoneStreak(null)
  }, [activeBlockCards, activeGame, buildRoundWithBridge, hydrateRoundCycle, leechFocusEnabled, nextCardIndex, nextRoundMode])

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!roundState || isRoundResolving) return

      setIsRoundResolving(true)
      const completedRoundsAfterAnswer = sessionRounds + 1
      const targetRounds = Math.max(1, Math.floor(sessionTargetItems))

      const typedAssessment =
        roundState.mode === 'typed_recall'
          ? assessTypedRecallAnswer({
            script: activeScript,
            expectedAnswer: roundState.answer,
            givenAnswer: answer,
            dictionaryNote: roundState.dictionaryNote,
          })
          : roundState.mode === 'speech_recall'
            ? (() => {
              const candidates = [
                roundState.answer,
                roundState.focusText,
                roundState.dictionaryNote?.reading,
                roundState.dictionaryNote?.primaryGloss,
                ...(roundState.dictionaryNote?.secondaryGlosses ?? []),
              ]
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value) => value.length > 0)

              let bestAssessment: TypedAnswerState = 'incorrect'
              for (const candidate of candidates) {
                const candidateAssessment = assessTypedAnswer(candidate, answer)
                if (candidateAssessment === 'exact') {
                  return 'exact'
                }
                if (candidateAssessment === 'near_miss') {
                  bestAssessment = 'near_miss'
                }
              }
              return bestAssessment
            })()
            : roundState.mode === 'dictation'
              ? assessTypedAnswer(roundState.answer, answer)
              : roundState.mode === 'romaji_sprint'
                ? (() => {
                    const variants = roundState.answer.split('/').map(v => normalizeText(v.trim()))
                    return variants.some(v => normalizeText(answer) === v) ? 'exact' : 'incorrect'
                  })()
                : null
      const isCorrect =
        typedAssessment !== null
          ? typedAssessment !== 'incorrect'
          : normalizeText(answer) === normalizeText(roundState.answer)
      const responseMs =
        roundPresentedAtRef.current > 0
          ? Math.max(0, performance.now() - roundPresentedAtRef.current)
          : PERFORMANCE_GOOD_MS
      setRoundResponseMs(responseMs)
      const performanceLabel = classifyRoundPerformance(isCorrect, responseMs)
      const previousScript = scriptStats[activeScript]
      const nextStreak = isCorrect ? previousScript.currentStreak + 1 : 0
      const awardedPoints = isCorrect ? calculateAwardedPoints(nextStreak) : 0
      const comboBonus = Math.max(0, awardedPoints - 1)
      const isMilestone = nextStreak === 3 || nextStreak === 6 || nextStreak === 9
      const pointsCopy = `+${awardedPoints} ${awardedPoints === 1 ? 'point' : 'points'}`
      const comboCopy = comboBonus > 0 ? ` (streak bonus +${comboBonus})` : ''
      let nextLives = livesRemaining

      setScriptStats((previous) => {
        return {
          ...previous,
          [activeScript]: {
            attempted: previous[activeScript].attempted + 1,
            correct: isCorrect ? previous[activeScript].correct + 1 : previous[activeScript].correct,
            currentStreak: nextStreak,
            bestStreak: Math.max(previous[activeScript].bestStreak, nextStreak),
          },
        }
      })

      setMinigameStats((previous) => {
        const previousGameStats = previous[activeScript][activeGame]
        const nextGameStreak = isCorrect ? previousGameStats.currentStreak + 1 : 0
        return {
          ...previous,
          [activeScript]: {
            ...previous[activeScript],
            [activeGame]: {
              attempted: previousGameStats.attempted + 1,
              correct: isCorrect ? previousGameStats.correct + 1 : previousGameStats.correct,
              currentStreak: nextGameStreak,
              bestStreak: Math.max(previousGameStats.bestStreak, nextGameStreak),
              points: isCorrect ? previousGameStats.points + awardedPoints : previousGameStats.points,
            },
          },
        }
      })

      setSessionRounds((value) => value + 1)
      setSessionStreak(nextStreak)
      setSessionBestStreak((value) => Math.max(value, nextStreak))
      setRoundComboBonus(comboBonus)
      setRoundMilestoneStreak(isMilestone ? nextStreak : null)
      setRoundPerformanceLabel(performanceLabel)
      if (isCorrect) {
        setSessionScore((value) => value + 1)
        setSessionPoints((value) => value + awardedPoints)
        if ((roundState.mode === 'typed_recall' || roundState.mode === 'speech_recall' || roundState.mode === 'dictation') && typedAssessment === 'near_miss') {
          setRoundFeedback(`Close enough — we’ll count it! ${pointsCopy}${comboCopy}.`)
        } else if (isImposterMode(roundState.mode)) {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage + 1)
          setRoundFeedback(`Nice work! ${pointsCopy}${comboCopy}. Stage ${roundState.curriculumStage} → ${nextStage}.`)
        } else {
          setRoundFeedback(`Nice work! ${pointsCopy}${comboCopy}.`)
        }
        setRoundFeedbackTone('success')
        setRoundFeedbackPoints(awardedPoints)
        setRoundFeedbackAnswer(null)

        // Update per-card score: correct → +1 (capped at CARD_MASTERY_MAX).
        const answeredCardId = roundState.cardId
        setCardScores((prev) => {
          const current = prev[activeScript][answeredCardId] ?? 0
          return {
            ...prev,
            [activeScript]: {
              ...prev[activeScript],
              [answeredCardId]: Math.min(current + 1, CARD_MASTERY_MAX),
            },
          }
        })

        // Track near-misses alongside wrong answers for session-end retry
        if (typedAssessment === 'near_miss' && !nearMissCardIdsRef.current.includes(answeredCardId)) {
          nearMissCardIdsRef.current.push(answeredCardId)
        }
      } else {
        if (livesEnabled) {
          nextLives = Math.max(0, livesRemaining - 1)
          setLivesRemaining(nextLives)
        }
        if (isImposterMode(roundState.mode)) {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage - 1)
          setRoundFeedback(`Not quite. Stage ${roundState.curriculumStage} → ${nextStage}.`)
        } else {
          setRoundFeedback('Not quite.')
        }
        setRoundFeedbackTone('error')
        setRoundFeedbackPoints(0)
        setRoundFeedbackAnswer(
          roundState.mode === 'sentence_assembly' && roundState.options
            ? (() => {
                const chunkMap = new Map(roundState.options.map((o) => [o.id, o.label]))
                return answer.split('|').map((id) => chunkMap.get(id) ?? '').join('')
              })()
            : answer,
        )

        // Wrong answer deducts 1 from the card score (floored at 0).
        const answeredCardId = roundState.cardId
        setCardScores((prev) => {
          const current = prev[activeScript][answeredCardId] ?? 0
          return {
            ...prev,
            [activeScript]: {
              ...prev[activeScript],
              [answeredCardId]: Math.max(current - 1, 0),
            },
          }
        })
        if (!wrongCardIdsRef.current.includes(answeredCardId)) {
          wrongCardIdsRef.current.push(answeredCardId)
        }
      }

      const answeredCardId = roundState.cardId
      if (!seenCardIdsRef.current.includes(answeredCardId)) {
        seenCardIdsRef.current.push(answeredCardId)
      }

      const confidenceForAnswer = confidenceCaptureEnabled ? roundConfidenceScore : undefined

      try {
        const data: PersistedSession = {
          activeScript,
          activeGame,
          livesEnabled,
          leechFocusEnabled,
          confidenceCaptureEnabled,
          sessionTargetItems,
          seenCardIds: [...seenCardIdsRef.current],
          sessionStartedAt: new Date().toISOString(),
          restore: {
            sessionScore: isCorrect ? sessionScore + 1 : sessionScore,
            sessionRounds: sessionRounds + 1,
            sessionPoints: isCorrect ? sessionPoints + awardedPoints : sessionPoints,
            sessionStreak: nextStreak,
            sessionBestStreak: Math.max(sessionBestStreak, nextStreak),
            sessionConfidenceCount:
              typeof confidenceForAnswer === 'number' ? sessionConfidenceCount + 1 : sessionConfidenceCount,
            sessionConfidenceTotal:
              typeof confidenceForAnswer === 'number' ? sessionConfidenceTotal + confidenceForAnswer : sessionConfidenceTotal,
            livesRemaining: nextLives,
          },
        }
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
      } catch { /* ignore storage errors */ }

      const resultSlug: DeckSlugInput =
        activeScript === 'kanji_n5'
          ? KANJI_CATEGORY_TO_DECK_SLUG[activeKanjiCategory]
          : activeScript === 'vocab_n5'
            ? VOCAB_CATEGORY_TO_DECK_SLUG[activeVocabCategory]
            : activeScript
      studyQueueCacheRef.current.delete(resultSlug)

      void (async () => {
        try {
          const result = await window.jplearnDesktop?.recordGameResult({
            slug: resultSlug,
            cardId: roundState.cardId,
            isCorrect,
            minigame: roundState.mode,
            curriculumStage:
              isGrammarCurriculumMode(roundState.mode)
                ? roundState.curriculumStage
                : undefined,
            sessionId: activeSessionId ?? undefined,
            confidenceScore: confidenceForAnswer,
          })
          if (
            isGrammarCurriculumMode(roundState.mode) &&
            typeof result.curriculum_stage === 'number'
          ) {
            const resolvedStage = normalizeCurriculumStage(result.curriculum_stage)
            setDeckCards((previousCards) =>
              previousCards.map((entry) =>
                entry.id === roundState.cardId
                  ? { ...entry, curriculum_stage: resolvedStage }
                  : entry,
              ),
            )
          }
          if (result.repetitions != null) {
            setRoundSrsResult({
              repetitions: result.repetitions,
              interval: result.interval,
              next_review: result.next_review,
              ease_factor: result.ease_factor,
            })
          }
        } catch { /* background record — ignore */ }
      })()

      void (async () => {
        try {
          const query = roundState.focusText || roundState.answer
          if (!query) return
          const sentence = await window.jplearnDesktop?.lookupSentence?.({ query })
          if (sentence?.jp) {
            setRoundExampleSentence({ jp: sentence.jp, en: sentence.en ?? '', romaji: sentence.romaji ?? '' })
          }
        } catch { /* optional — ignore */ }
      })()

      if (typeof confidenceForAnswer === 'number') {
        setSessionConfidenceCount((value) => value + 1)
        setSessionConfidenceTotal((value) => value + confidenceForAnswer)
      }

      const nextToastId = localToastIdRef.current - 1
      localToastIdRef.current = nextToastId
      tutor.queueAssistantToast(buildRoundCoachToast(nextToastId, {
        isCorrect,
        mode: roundState.mode,
        nextStreak,
        answer: roundState.answer,
        completedRoundsAfterAnswer,
        targetRounds,
        typedAssessment,
      }))

      const advanceFeedback = () => {
        feedbackAdvanceRef.current = null
        if (!isCorrect && livesEnabled && nextLives <= 0) {
          resetSessionEnd({ errorMessage: 'Out of lives. Press Play to start a new run.' })
          return
        }

        if (completedRoundsAfterAnswer >= targetRounds) {
          resetSessionEnd()
          return
        }

        void nextRound()
        setRoundFeedback(null)
        setRoundFeedbackTone(null)
        setRoundFeedbackPoints(null)
        setRoundFeedbackAnswer(null)
        setRoundResponseMs(null)
        setRoundSrsResult(null)
        setRoundExampleSentence(null)
        setIsRoundResolving(false)
      }
      feedbackAdvanceRef.current = advanceFeedback
    },
    // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
    [activeGame, activeKanjiCategory, activeScript, activeSessionId, activeVocabCategory, confidenceCaptureEnabled, isRoundResolving, leechFocusEnabled, livesEnabled, livesRemaining, nextRound, roundConfidenceScore, roundState, scriptStats, sessionBestStreak, sessionConfidenceCount, sessionConfidenceTotal, sessionPoints, sessionRounds, sessionScore, sessionTargetItems],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        if (showSettings) {
          setShowSettings(false)
        } else {
          setDictionaryOpen(false)
          tutor.setAssistantChatOpen(false)
          tutor.setOcrWorkbenchOpen(false)
          setShowOverview(false)
          setShowSettings(true)
        }
        return
      }

      if (event.key === 'Escape') {
        if (shortcutMenuOpen) {
          setShortcutMenuOpen(false)
          setActiveShortcutFlyout(null)
          return
        }

        if (selectedChar) {
          setSelectedChar(null)
          return
        }

        if (showSettings) {
          setShowSettings(false)
          return
        }

        if (tutor.assistantChatOpen) {
          tutor.closeAssistantChat()
          return
        }

        if (tutor.ocrWorkbenchOpen) {
          tutor.closeOcrWorkbench()
          return
        }

        if (view === 'minigame') {
          setNavDirection('back')
          setView('script_hub')
          return
        }

        if (view === 'script_hub') {
          setNavDirection('back')
          setView('home')
          return
        }

        if (view === 'jlpt_prep') {
          setNavDirection('back')
          setView('home')
          return
        }

        if (showOverview) {
          setShowOverview(false)
          return
        }
      }

      if (showSettings || tutor.assistantChatOpen || tutor.ocrWorkbenchOpen || isInput) return

      if (event.key === '6') {
        setDictionaryOpen(false)
        setShowOverview(true)
        setShowSettings(false)
        tutor.setOcrWorkbenchOpen(false)
        void loadSummary()
        setShortcutMenuOpen(false)
        setActiveShortcutFlyout(null)
        return
      }

      if (view === 'home') {
        if (event.key === '1') {
          setNavDirection('forward')
          setActiveScript('hiragana')
          setView('script_hub')
        }
        if (event.key === '2') {
          setNavDirection('forward')
          setActiveScript('katakana')
          setView('script_hub')
        }
        if (event.key === '3') {
          setNavDirection('forward')
          setActiveScript('kanji_n5')
          setView('script_hub')
        }
        if (event.key === '4') {
          setNavDirection('forward')
          setActiveScript('vocab_n5')
          setView('script_hub')
        }
        if (event.key === '5') {
          setNavDirection('forward')
          setActiveScript('grammar_patterns')
          setView('script_hub')
        }
        if (event.key === '7') {
          setNavDirection('forward')
          setActiveScript('sentence_examples')
          setView('script_hub')
        }
      }
    }

    // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tutor.assistantChatOpen, tutor.closeAssistantChat, tutor.closeOcrWorkbench, loadSummary, tutor.ocrWorkbenchOpen, selectedChar, shortcutMenuOpen, showOverview, showSettings, view])

  const decks = useMemo(() => summary?.decks ?? [], [summary])
  const streak = useMemo(
    () => summary?.streak ?? { current_days: 0, best_days: 0 },
    [summary],
  )
  const activity = useMemo(
    () =>
      summary?.activity ?? {
        week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
        month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
      },
    [summary],
  )
  const mistakes = useMemo(() => summary?.mistakes ?? [], [summary])
  const studyPlan = useMemo(
    () => buildStudyPlan(decks, kanjiLevelProgress, vocabLevelProgress, activity, streak.current_days),
    [activity, decks, kanjiLevelProgress, streak.current_days, vocabLevelProgress],
  )
  const learningPathTrackRows = useMemo(
    () => {
      const trackedKeys: ScriptKey[] = ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5']
      return trackedKeys
        .map((key) => studyPlan.coverageRows.find((row) => row.key === key))
        .filter((row): row is StudyPlanCoverageRow => row !== undefined)
    },
    [studyPlan.coverageRows],
  )

  const activeRunCards = leechFocusEnabled && leechCards.length > 0 ? leechCards : activeBlockCards

  // Use backend block mastery/unlock values so script hub and overview stay consistent.
  const blockProgressWithMastery = useMemo(() => {
    return blockProgress
  }, [blockProgress])

  useEffect(() => {
    if (blockProgressWithMastery.length === 0) return

    const current = blockProgressWithMastery.find((block) => block.index === activeBlockIndex)
    if (current?.unlocked) return

    const firstUnlocked = blockProgressWithMastery.find((block) => block.unlocked)
    if (firstUnlocked) {
      setActiveBlockIndex(firstUnlocked.index)
      return
    }

    if (activeBlockIndex !== 0) {
      setActiveBlockIndex(0)
    }
  }, [blockProgressWithMastery, activeBlockIndex])

  const activeSectionName = useMemo(() => {
    if (blockProgressWithMastery.length > 0) {
      return blockProgressWithMastery.find((block) => block.index === activeBlockIndex)?.name ?? null
    }
    if (activeScript === 'kanji_n5') {
      return kanjiCategoryProgress.find((cat) => cat.key === activeKanjiCategory)?.label ?? null
    }
    if (activeScript === 'vocab_n5') {
      return vocabCategoryProgress.find((cat) => cat.key === activeVocabCategory)?.label ?? null
    }
    return null
  }, [blockProgressWithMastery, activeBlockIndex, activeScript, kanjiCategoryProgress, activeKanjiCategory, vocabCategoryProgress, activeVocabCategory])




  const minigameLockReasons = useMemo(() => {
    const reasons: Partial<Record<MinigameKey, string>> = {}
    if (!voice.speechRecognitionModelEnabled) {
      reasons.speech_recall = voice.speechRecognitionLockReason
    }
    if (voice.listeningLockReason) {
      reasons.listening_audio_first = voice.listeningLockReason
      reasons.dictation = voice.listeningLockReason
    }
    return reasons
  // oxlint-disable react-hooks/exhaustive-deps — voice.speechRecognitionLockReason is a constant string, voice hook return is not stable
  }, [voice.listeningLockReason, voice.speechRecognitionModelEnabled])

  // Block session is complete when every card in the active block has reached max score.
  // sessionRounds > 0 ensures we don't trigger on a pre-mastered block before answering.
  const blockSessionComplete = useMemo(() => {
    if (!sessionActive || sessionRounds === 0 || activeBlockCards.length === 0) return false
    const scores = cardScores[activeScript]
    return activeBlockCards.every((c) => (scores[c.id] ?? 0) >= CARD_MASTERY_MAX)
  }, [sessionActive, sessionRounds, activeBlockCards, cardScores, activeScript])
  const hasAnyActivity = activity.week.reviewed > 0 || activity.month.reviewed > 0
  const hasMistakeData = mistakes.length > 0

  useEffect(() => {
    if (activeScript !== 'kanji_n5' || blockProgress.length > 0) return
    const activeCat = kanjiCategoryProgress.find((cat) => cat.key === activeKanjiCategory)
    if (activeCat?.total && activeCat.total > 0) return
    const fallback = kanjiCategoryProgress.find((cat) => cat.unlocked) ?? kanjiCategoryProgress.find((cat) => cat.total > 0)
    if (!fallback || fallback.key === activeKanjiCategory) return
    setActiveKanjiCategory(fallback.key as KanjiCategory)
  }, [activeScript, blockProgress.length, kanjiCategoryProgress, activeKanjiCategory])

  useEffect(() => {
    if (activeScript !== 'vocab_n5' || blockProgress.length > 0) return
    const activeCat = vocabCategoryProgress.find((cat) => cat.key === activeVocabCategory)
    if (activeCat?.total && activeCat.total > 0) return
    const fallback = vocabCategoryProgress.find((cat) => cat.unlocked) ?? vocabCategoryProgress.find((cat) => cat.total > 0)
    if (!fallback || fallback.key === activeVocabCategory) return
    setActiveVocabCategory(fallback.key as VocabCategory)
  }, [activeScript, blockProgress.length, vocabCategoryProgress, activeVocabCategory])

  // Lazy-load block data for hiragana + katakana when the overview popup opens.
  useEffect(() => {
    if (!showOverview) return
    setOverviewBlocksLoading(true)
    const fetchMastery = async () => {
      try {
        const payload = await window.jplearnDesktop?.getOverviewCharacterMastery()
        if (!payload) return
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      } catch { /* ignore */ }
      finally { setOverviewBlocksLoading(false) }
    }
    void fetchMastery()
  }, [showOverview])

  useEffect(() => {
    if (isHistoryNavigationRef.current) {
      isHistoryNavigationRef.current = false
      return
    }

    const currentHistory = viewHistoryRef.current
    const currentIndex = viewHistoryIndexRef.current
    if (currentHistory[currentIndex] === view) return

    const nextHistory = currentHistory.slice(0, currentIndex + 1)
    nextHistory.push(view)
    viewHistoryRef.current = nextHistory
    viewHistoryIndexRef.current = nextHistory.length - 1
  }, [view])

  const goHome = useCallback(() => {
    setNavDirection('back')
    setView('home')
    resetSessionCore()
    setShowSettings(false)
    tutor.setOcrWorkbenchOpen(false)
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [resetRoundCycle])

  const closeShortcutMenu = useCallback(() => {
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
  }, [])

  const jumpToMainMenu = useCallback(() => {
    goHome()
    closeShortcutMenu()
  }, [closeShortcutMenu, goHome])

  const jumpToOverview = useCallback(() => {
    setDictionaryOpen(false)
    setShowOverview(true)
    setShowSettings(false)
    tutor.setAssistantChatOpen(false)
    tutor.setOcrWorkbenchOpen(false)
    void loadSummary()
    closeShortcutMenu()
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [closeShortcutMenu, loadSummary])

  const jumpToScriptHub = useCallback((script: ScriptKey) => {
    setNavDirection('forward')
    setActiveScript(script)
    setView('script_hub')
    resetSessionCore()
    closeShortcutMenu()
  }, [closeShortcutMenu, resetRoundCycle])

  const jumpToScriptHubMinigame = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setNavDirection('forward')
    setShowOverview(false)
    setShowSettings(false)
    setLastSessionSummary(null)
    setSessionRunReport(null)
    setActiveGame(resolvedMinigame)
    setView('minigame')
    resetSessionWithLives()

    if (script !== activeScript) {
      setActiveScript(script)
      setResumeRequest({ script, minigame: resolvedMinigame })
      closeShortcutMenu()
      return
    }

    void startSession(resolvedMinigame)
    closeShortcutMenu()
  }, [activeScript, closeShortcutMenu, resetRoundCycle, resolveScriptMinigame, startSession])

  const jumpToScriptHubSetup = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setNavDirection('forward')
    setActiveScript(script)
    setActiveGame(resolvedMinigame)
    setView('script_hub')
    resetSessionWithLives()
    closeShortcutMenu()
  }, [closeShortcutMenu, resetRoundCycle, resolveScriptMinigame])

  const openSettingsFromMenu = useCallback(() => {
    setDictionaryOpen(false)
    setShowSettings(true)
    setShowOverview(false)
    tutor.setAssistantChatOpen(false)
    tutor.setOcrWorkbenchOpen(false)
    closeShortcutMenu()
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [closeShortcutMenu])

  const refreshDataFromMenu = useCallback(() => {
    void loadSummary()
    closeShortcutMenu()
  }, [closeShortcutMenu, loadSummary])

  const inspectElementFromMenu = useCallback(async () => {
    try {
      await window.jplearnDesktop?.openInspectElement?.()
    } catch {
      // Devtools action is best effort in development contexts.
    } finally {
      closeShortcutMenu()
    }
  }, [closeShortcutMenu])

  const openDevDashboard = useCallback(() => {
    closeShortcutMenu()
    setDevDashboardOpen(true)
  }, [closeShortcutMenu])

  const runCheckFromMenu = useCallback((checkName: string) => {
    closeShortcutMenu()
    setPendingDevCheck(checkName)
    setDevDashboardOpen(true)
  }, [closeShortcutMenu])

  const restartBridgeFromMenu = useCallback(async () => {
    closeShortcutMenu()
    try {
      await window.jplearnDesktop?.restartBridge?.()
    } catch {
      // best effort
    }
  }, [closeShortcutMenu])

  const clearCachesFromMenu = useCallback(async () => {
    closeShortcutMenu()
    try {
      await window.jplearnDesktop?.clearBridgeCaches?.()
    } catch {
      // best effort
    }
  }, [closeShortcutMenu])

  const resetStudyDb = useCallback(async () => {
    setResettingDb(true)
    setError(null)
    try {
      await window.jplearnDesktop?.resetStudyDb()
      const emptyScores: CardScores = { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, sentence_examples: {} }
      const emptyStats: StatsByScript = {
        hiragana: { ...EMPTY_SCRIPT_STATS },
        katakana: { ...EMPTY_SCRIPT_STATS },
        kanji_n5: { ...EMPTY_SCRIPT_STATS },
        vocab_n5: { ...EMPTY_SCRIPT_STATS },
        grammar_patterns: { ...EMPTY_SCRIPT_STATS },
        sentence_examples: { ...EMPTY_SCRIPT_STATS },
      }
      window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(emptyScores))
      window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(emptyStats))
      window.localStorage.removeItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      setCardScores(emptyScores)
      setScriptStats(emptyStats)
      setMinigameStats(defaultMinigameStatsByScript())
      resetSessionFull()
      setSessionStartPending(false)
      setSessionSummaryLoading(false)
      setLastSessionSummary(null)
      setSessionRunReport(null)
      setActiveSessionId(null)
      setGameError(null)
      setShowSettings(false)
      setShowOverview(false)
      setShortcutMenuOpen(false)
      setLearningPathStatus((prev) => {
        if (prev) {
          return { ...prev, onboarding_complete: false }
        }
        return {
          path_id: null,
          path_name: null,
          onboarding_complete: false,
          suggested_next: null,
          steps: [],
        }
      })
      setNavDirection('back')
      setView('home')
      setResetConfirmStep(0)
      refreshDeckProgressAfterSeedChange()
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown reset error')
    } finally {
      setResettingDb(false)
    }
  }, [loadSummary, refreshDeckProgressAfterSeedChange, resetRoundCycle])

  const minimizeWindow = useCallback(() => {
    void window.jplearnDesktop?.minimizeWindow()
  }, [])

  const toggleMaximizeWindow = useCallback(() => {
    void (async () => {
      try {
        await window.jplearnDesktop?.toggleMaximizeWindow()
        const state = await window.jplearnDesktop?.isWindowMaximized()
        setIsWindowMaximized(state.isMaximized)
      } catch { /* ignore */ }
    })()
  }, [])

  const closeWindow = useCallback(() => {
    void window.jplearnDesktop?.closeWindow()
  }, [])

  // Handles completion of the onboarding form: seeds deck expertise, persists answers, sets path.
  const handleOnboardingComplete = useCallback(async (
    pathId: string | null,
    checkedItems: Set<string>,
    answers: { goal?: string; dailyMinutes?: number; targetLevel?: string },
  ) => {
    const level = deriveExpertiseLevelFromChecked(checkedItems)
    try {
      await window.jplearnDesktop?.applyExpertiseLevel(level)
      if (level === 'total_beginner') {
        setCardScores({ hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, sentence_examples: {} })
      } else {
        const targetScripts = EXPERTISE_LEVEL_TO_SCRIPT_KEYS[level]
        const payloads = await Promise.all(targetScripts.map((slug) => getDeckCardsDeduped(slug)))
        setCardScores((previous) => {
          const next: CardScores = {
            hiragana: { ...previous.hiragana },
            katakana: { ...previous.katakana },
            kanji_n5: { ...previous.kanji_n5 },
            vocab_n5: { ...previous.vocab_n5 },
            grammar_patterns: { ...previous.grammar_patterns },
            sentence_examples: { ...previous.sentence_examples },
          }
          targetScripts.forEach((scriptKey, index) => {
            const deck = payloads[index]
            const seeded = { ...next[scriptKey] }
            deck.cards.forEach((card) => { seeded[card.id] = CARD_MASTERY_MAX })
            next[scriptKey] = seeded
          })
          return next
        })
      }
      refreshDeckProgressAfterSeedChange()
    } catch {
      // Expertise seeding is best-effort; proceed to mark onboarding complete.
    }

    if (pathId) {
      const result = await window.jplearnDesktop?.setLearningPath?.(pathId).catch(() => undefined)
      if (result) setLearningPathStatus(result as LearningPathStatus)
    } else {
      const result = await window.jplearnDesktop?.completeOnboarding?.(answers).catch(() => undefined)
      if (result) setLearningPathStatus(result as LearningPathStatus)
    }
  }, [getDeckCardsDeduped, refreshDeckProgressAfterSeedChange])


  const titlebarHistoryBack = useCallback(() => {
    const currentIndex = viewHistoryIndexRef.current
    if (currentIndex <= 0) return

    const nextIndex = currentIndex - 1
    viewHistoryIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    setNavDirection('back')
    setView(viewHistoryRef.current[nextIndex])
  }, [])

  const titlebarHistoryForward = useCallback(() => {
    const currentIndex = viewHistoryIndexRef.current
    const nextIndex = currentIndex + 1
    if (nextIndex >= viewHistoryRef.current.length) return

    viewHistoryIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    setNavDirection('forward')
    setView(viewHistoryRef.current[nextIndex])
  }, [])

  const canTitlebarBack = viewHistoryIndexRef.current > 0
  const canTitlebarForward = viewHistoryIndexRef.current < viewHistoryRef.current.length - 1
  const xpInLevel = xpProgress ? Math.max(0, xpProgress.xp_for_current_level - xpProgress.xp_to_next_level) : 0
  const xpLevelCap = xpProgress?.xp_for_current_level ?? 0
  const xpPercent = xpLevelCap > 0 ? Math.round((xpInLevel / xpLevelCap) * 100) : 0

  useEffect(() => {
    if (!shortcutMenuOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (shortcutMenuRef.current?.contains(target)) return
      closeShortcutMenu()
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [closeShortcutMenu, shortcutMenuOpen])

  useEffect(() => {
    if (!xpDetailsOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (xpDetailsRef.current?.contains(target)) return
      setXpDetailsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [xpDetailsOpen])

  useEffect(() => {
    if (!streakDetailsOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (streakDetailsRef.current?.contains(target)) return
      setStreakDetailsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [streakDetailsOpen])

  const handleSetupWizardComplete = useCallback(() => {
    setShowWizard(false)
    const getPath = window.jplearnDesktop?.getLearningPathStatus
    if (getPath) {
      void (async () => {
        try {
          const path = await getPath()
          if (path) {
            setLearningPathStatus(path as LearningPathStatus)
          }
        } catch { /* ignore */ }
      })()
    }
    void loadSummary()
    void models.refreshTutorInstallInfo()
  // oxlint-disable react-hooks/exhaustive-deps — models from useModels hook is not a stable ref
  }, [loadSummary])

  const hasInstalledTutorModel = Boolean(
    models.tutorInstallInfo?.llamaCppInstalled
      && (models.tutorInstallInfo?.models ?? []).some((model) => model.installed),
  )

  const showOnboardingChatbotSection = models.tutorInstallInfo ? hasInstalledTutorModel : true
  const showOnboardingVoiceSection = models.tutorInstallInfo ? models.tutorInstallInfo.voiceInstalled : true
  const showOnboardingFontSection = models.tutorInstallInfo ? models.tutorInstallInfo.fontsInstalled : true

  {/* ── Early-return gate: setup wizard ────────────────────── */}
  if (showWizard === true) {
    return <>
      {cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}
      <SetupWizard onComplete={handleSetupWizardComplete} />
    </>
  }
  if (showWizard === null) {
    return null
  }

  // Show onboarding wizard when onboarding is not complete
  if (!loading && learningPathStatus && !learningPathStatus.onboarding_complete) {
    return <>
      {cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}
      <OnboardingWizard
        showChatbotSection={showOnboardingChatbotSection}
        assistantChatEnabled={settings.assistantChatEnabled}
        onAssistantChatToggle={() => {
          setSettings((prev) => ({ ...prev, assistantChatEnabled: !prev.assistantChatEnabled }))
        }}
        showVoiceSection={showOnboardingVoiceSection}
        voiceOptions={voice.voiceOptions}
        voiceEnabled={settings.voiceEnabled}
        voiceSpeaker={settings.voiceSpeaker}
        voiceBusy={voice.voiceBusy}
        onVoiceToggle={() => setSettings((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
        onVoiceSelect={(id) => {
          setSettings((prev) => ({ ...prev, voiceSpeaker: id }))
          void voice.playQuestionAudio('こんにちは。いっしょにがんばりましょう。', id)
        }}
        showFontSection={showOnboardingFontSection}
        appFont={settings.appFont}
        fontOptions={APP_FONT_OPTIONS}
        onAppFontSelect={(key) => {
          if (!isAppFontPreset(key)) {
            return
          }
          setSettings((prev) => ({ ...prev, appFont: key }))
        }}
        fontSize={settings.fontSize}
        fontSizeOptions={FONT_SIZE_ORDER.map((size) => ({ key: size, label: FONT_SIZE_LABEL[size] }))}
        onFontSizeSelect={(key) => {
          setSettings((prev) => ({ ...prev, fontSize: key }))
        }}
        onComplete={(pathId, checkedItems, answers) => {
          void handleOnboardingComplete(pathId, checkedItems, answers)
        }}
        onSkip={(checkedItems, answers) => {
          void handleOnboardingComplete(null, checkedItems, answers)
        }}
      />
    </>
  }

  return (
    <main className="app-shell" data-background-style={settings.backgroundStyle} style={background.appShellStyle}>
      <header className="window-titlebar" aria-label="Window controls">
        <div className="window-titlebar-drag">
          <div className="window-titlebar-nav" role="group" aria-label="App navigation">
            <div className="titlebar-shortcut-wrap" ref={shortcutMenuRef}>
              <button
                type="button"
                className="window-nav-button"
                aria-label="Open shortcuts"
                title="Shortcuts"
                aria-haspopup="menu"
                aria-expanded={shortcutMenuOpen}
                onClick={() => {
                  setShortcutMenuOpen((open) => !open)
                  setActiveShortcutFlyout(null)
                }}
              >
                <Menu className="window-nav-icon" strokeWidth={2.2} />
              </button>
              {shortcutMenuOpen ? (
                <div className="titlebar-shortcut-menu" role="menu" aria-label="Quick locations">
                  <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={jumpToMainMenu}>
                    <House className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Main Menu
                  </button>

                  <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={jumpToOverview}>
                    <BarChart3 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Study Overview
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="titlebar-shortcut-item"
                    onClick={() => { setView('jlpt_prep'); setShortcutMenuOpen(false) }}
                    title="JLPT Prep"
                  >
                    <Languages className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    JLPT Prep
                  </button>

                  <div className="titlebar-shortcut-tree-anchor">
                    <button
                      type="button"
                      role="menuitem"
                      className="titlebar-shortcut-item titlebar-shortcut-parent"
                      aria-haspopup="true"
                      aria-expanded={activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' && activeShortcutFlyout !== 'dev_checks'}
                      onClick={() => {
                        setActiveShortcutFlyout((current) => (
                          current === null || current === 'dev_tools' || current === 'dev_checks'
                            ? 'all_maps'
                            : null
                        ))
                      }}
                    >
                      <ListChecks className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                      All Maps
                      <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' ? '▾' : '▸'}</span>
                    </button>

                    {activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' && activeShortcutFlyout !== 'dev_checks' ? (
                      <div className="titlebar-shortcut-righttree" role="group" aria-label="Maps and minigames">
                        {ALL_SCRIPT_KEYS.map((script) => {
                          const isScriptExpanded = activeShortcutFlyout === script
                          return (
                            <div key={script} className="titlebar-shortcut-map-group">
                              <button
                                type="button"
                                role="menuitem"
                                className="titlebar-shortcut-item titlebar-shortcut-child"
                                aria-haspopup="true"
                                aria-expanded={isScriptExpanded}
                                onClick={() => {
                                  setActiveShortcutFlyout((current) => (current === script ? 'all_maps' : script))
                                }}
                              >
                                <span className="titlebar-shortcut-glyph" aria-hidden="true">{SECTION_META[script].glyph}</span>
                                {SCRIPT_LABELS[script]} Map
                                <span className="titlebar-shortcut-caret" aria-hidden="true">{isScriptExpanded ? '▾' : '▸'}</span>
                              </button>
                              {isScriptExpanded ? (
                                <div className="titlebar-shortcut-childmenu" role="group" aria-label={`${SCRIPT_LABELS[script]} minigames`}>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                    onClick={() => jumpToScriptHub(script)}
                                  >
                                    <span className="titlebar-shortcut-glyph" aria-hidden="true">↗</span>
                                    Open Map
                                  </button>
                                  {SCRIPT_MINIGAMES[script].map((gameKey) => {
                                    const gameTitle = MINIGAMES.find((entry) => entry.key === gameKey)?.title ?? gameKey
                                    return (
                                      <button
                                        key={gameKey}
                                        type="button"
                                        role="menuitem"
                                        className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                        onClick={() => jumpToScriptHubMinigame(script, gameKey)}
                                      >
                                        <MinigameIcon game={gameKey} />
                                        {gameTitle}
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>

                  <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={openSettingsFromMenu}>
                    <Settings className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="titlebar-shortcut-item"
                    onClick={refreshDataFromMenu}
                  >
                    <Activity className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Refresh Data
                  </button>

                  <div className="titlebar-shortcut-tree-anchor">
                    <button
                      type="button"
                      role="menuitem"
                      className="titlebar-shortcut-item titlebar-shortcut-parent"
                      aria-haspopup="true"
                      aria-expanded={activeShortcutFlyout === 'dev_tools' || activeShortcutFlyout === 'dev_checks'}
                      onClick={() => {
                        setActiveShortcutFlyout((current) => (current === 'dev_tools' || current === 'dev_checks' ? null : 'dev_tools'))
                      }}
                    >
                      <Code2 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                      Developer Tools
                      <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout === 'dev_tools' || activeShortcutFlyout === 'dev_checks' ? '▾' : '▸'}</span>
                    </button>

                    {(activeShortcutFlyout === 'dev_tools' || activeShortcutFlyout === 'dev_checks') ? (
                      <div className="titlebar-shortcut-righttree" role="group" aria-label="Developer tools">
                        <button
                          type="button"
                          role="menuitem"
                          className="titlebar-shortcut-item titlebar-shortcut-leaf"
                          onClick={openDevDashboard}
                        >
                          <Bug className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                          Developer Dashboard
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          className="titlebar-shortcut-item titlebar-shortcut-leaf"
                          onClick={() => { void inspectElementFromMenu() }}
                        >
                          <span className="titlebar-shortcut-glyph" aria-hidden="true">&lt;/&gt;</span>
                          Inspect Element
                        </button>

                        <div className="titlebar-shortcut-tree-anchor">
                          <button
                            type="button"
                            role="menuitem"
                            className="titlebar-shortcut-item titlebar-shortcut-parent"
                            aria-haspopup="true"
                            aria-expanded={activeShortcutFlyout === 'dev_checks'}
                            onClick={() => {
                              setActiveShortcutFlyout((current) => (current === 'dev_checks' ? 'dev_tools' : 'dev_checks'))
                            }}
                          >
                            <PlayCircle className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                            Run Checks
                            <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout === 'dev_checks' ? '▾' : '▸'}</span>
                          </button>

                          {activeShortcutFlyout === 'dev_checks' ? (
                            <div className="titlebar-shortcut-childmenu" role="group" aria-label="Run checks">
                              <button
                                type="button"
                                role="menuitem"
                                className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                onClick={() => runCheckFromMenu('arch')}
                              >
                                Architecture Check
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                onClick={() => runCheckFromMenu('db')}
                              >
                                DB Schema Check
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                onClick={() => runCheckFromMenu('srs')}
                              >
                                SRS Integrity Check
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          role="menuitem"
                          className="titlebar-shortcut-item titlebar-shortcut-leaf"
                          onClick={() => { void restartBridgeFromMenu() }}
                        >
                          <RotateCcw className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                          Restart Bridge
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          className="titlebar-shortcut-item titlebar-shortcut-leaf"
                          onClick={() => { void clearCachesFromMenu() }}
                        >
                          <Trash2 className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                          Clear Caches
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="window-nav-button"
              onClick={titlebarHistoryBack}
              aria-label="Back"
              title="Back"
              disabled={!canTitlebarBack}
            >
              <ArrowLeft className="window-nav-icon" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="window-nav-button"
              onClick={titlebarHistoryForward}
              aria-label="Forward"
              title="Forward"
              disabled={!canTitlebarForward}
            >
              <ArrowRight className="window-nav-icon" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="window-nav-button"
              onClick={jumpToOverview}
              aria-label="Open study overview"
              title="Study Overview"
            >
              <BookText className="window-nav-icon" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="window-nav-button"
              onClick={() => openDictionary(roundState?.focusText ?? roundState?.answer ?? '')}
              aria-label="Open dictionary"
              title="Dictionary"
            >
              <Search className="window-nav-icon" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="window-nav-button"
              onClick={() => {
                setDictionaryOpen(false)
                setShowOverview(false)
                setShowSettings(false)
                setShortcutMenuOpen(false)
                setActiveShortcutFlyout(null)
                tutor.setAssistantChatOpen(false)
                
                tutor.setOcrWorkbenchOpen((open) => !open)
                
              }}
              aria-expanded={tutor.ocrWorkbenchOpen}
              aria-controls="ocr-workbench-panel"
              aria-label={tutor.ocrWorkbenchOpen ? 'Close OCR translator' : 'Open OCR translator'}
              title={tutor.ocrWorkbenchOpen ? 'Close OCR translator' : 'Open OCR translator'}
            >
              <ImagePlus className="window-nav-icon" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="window-nav-button"
              onClick={openSettingsFromMenu}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings className="window-nav-icon" strokeWidth={2.2} />
            </button>
            <TutorTitlebarButton
              assistantChatEnabled={settings.assistantChatEnabled}
              assistantChatOpen={tutor.assistantChatOpen}
              onToggle={() => {
                setDictionaryOpen(false)
                setShowOverview(false)
                setShowSettings(false)
                tutor.setOcrWorkbenchOpen(false)
                setShortcutMenuOpen(false)
                setActiveShortcutFlyout(null)
                tutor.setAssistantChatOpen((open) => !open)
              }}
            />
          </div>
        </div>
        <div className="titlebar-progress-cluster">
          <div className="titlebar-streak" ref={streakDetailsRef}>
            <button
              type="button"
              className="titlebar-streak-chip"
              onClick={() => setStreakDetailsOpen((open) => !open)}
              title="View streak details"
              aria-label={`${streak.current_days} day streak`}
              aria-expanded={streakDetailsOpen}
              aria-controls="titlebar-streak-details"
            >
              <Flame className="titlebar-streak-icon" strokeWidth={2.1} aria-hidden="true" />
              <span className="titlebar-streak-value">{streak.current_days}</span>
            </button>
            <div
              id="titlebar-streak-details"
              className={`titlebar-streak-details ${streakDetailsOpen ? 'is-open' : ''}`}
              role="dialog"
              aria-label="Streak details"
            >
              <p className="titlebar-streak-details-title">
                {streak.current_days > 0 ? `${streak.current_days}-day streak 🔥` : 'No active streak'}
              </p>
              <p className="titlebar-streak-details-row">Best: {streak.best_days} days</p>
              <p className="titlebar-streak-details-tip">
                {streak.current_days > 0
                  ? 'Keep it up — review something today!'
                  : 'Complete a session to start your streak.'}
              </p>
            </div>
          </div>

          {xpProgress ? (
            <div className="titlebar-xp" ref={xpDetailsRef}>
              <button
                type="button"
                className="titlebar-xp-button"
                title={`Level ${xpProgress.level} — ${xpInLevel} / ${xpLevelCap} XP`}
                aria-label={`Level ${xpProgress.level}. ${xpPercent}% to next level.`}
                aria-expanded={xpDetailsOpen}
                aria-controls="titlebar-xp-details"
                onClick={() => setXpDetailsOpen((open) => !open)}
              >
                <span className="titlebar-xp-badge" aria-hidden="true">{xpProgress.level}</span>
                <div
                  className="titlebar-xp-track"
                  role="progressbar"
                  aria-valuenow={xpPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="titlebar-xp-fill"
                    style={{ '--xp-pct': `${xpPercent}%` } as CSSProperties}
                  />
                </div>

              </button>
              <div
                id="titlebar-xp-details"
                className={`titlebar-xp-details ${xpDetailsOpen ? 'is-open' : ''}`}
                role="dialog"
                aria-label="XP details"
              >
                <p className="titlebar-xp-details-title">Level {xpProgress.level}</p>
                <p className="titlebar-xp-details-row">Progress: {xpInLevel} / {xpLevelCap} XP</p>
                <p className="titlebar-xp-details-row">To next level: {Math.max(0, xpProgress.xp_to_next_level)} XP</p>
                <p className="titlebar-xp-details-row">Completion: {xpPercent}%</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="window-controls" role="group" aria-label="Window actions">
          <button type="button" className="window-control-button" onClick={minimizeWindow} aria-label="Minimize window">
            <Minus className="window-control-icon" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="window-control-button window-control-button-maximize"
            onClick={toggleMaximizeWindow}
            aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'}
          >
            <span className={`window-control-icon-stack ${isWindowMaximized ? 'is-maximized' : ''}`} aria-hidden="true">
              <Square className="window-control-icon window-control-icon-maximize" strokeWidth={2} />
              <Copy className="window-control-icon window-control-icon-restore" strokeWidth={1.9} />
            </span>
          </button>
          <button type="button" className="window-control-button window-control-close" onClick={closeWindow} aria-label="Close window">
            <X className="window-control-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>
      <div className="atmosphere atmosphere-left" aria-hidden="true" />
      <div className="atmosphere atmosphere-right" aria-hidden="true" />
      <div className="atmosphere atmosphere-top" aria-hidden="true" />
      {showPetalLayer ? (
        <div className="petal-layer" aria-hidden="true">
          {activePetalStream.map((petal, index) => (
            <span
              key={`petal-${index}`}
              className="petal"
              style={{
                left: petal.x,
                '--petal-drift': petal.drift,
                '--petal-duration': petal.duration,
                '--petal-delay': petal.delay,
                '--petal-size': petal.size,
                opacity: petal.opacity,
              } as CSSProperties}
            />
          ))}
        </div>
      ) : null}

      {pageLoading ? (
        <div className="page-loading-overlay" role="status" aria-label={pageLoadingLabel}>
          <div className="page-loading-crt" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
          <div className="page-loading-widget">
            <span
              className="page-loading-label page-loading-glitch"
              data-text={pageLoadingLabel}
            >
              {pageLoadingLabel}
            </span>
            <div className="page-loading-track">
              <div className="page-loading-fill" />
            </div>
            <div className="page-loading-eq" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-shell-scroll">
      <SessionProvider value={{
        sessionActive,
        roundState,
        roundInput,
        roundFeedback,
        roundFeedbackTone,
        roundFeedbackAnswer,
        roundFeedbackPoints,
        roundPerformanceLabel,
        roundResponseMs,
        roundSrsResult,
        roundExampleSentence,
        isRoundResolving,
        sessionScore,
        sessionRounds,
        sessionPoints,
        sessionStreak,
        sessionBestStreak,
        sessionTargetItems,
        blockSessionComplete,
        roundComboBonus,
        roundMilestoneStreak,
        sessionRunReport,
        sessionStartPending,
        sessionSummaryLoading,
        sessionGoalError,
        lastSessionSummary,
        livesEnabled,
        livesRemaining,
        leechFocusEnabled,
        confidenceCaptureEnabled,
        roundConfidenceScore,
        activeSessionLengthPreset,
        voiceBusy: voice.voiceBusy,
        voiceUnavailable: voice.voiceUnavailable,
        answerInputRef,
        startSession: (game) => { void startSession(game) },
        submitAnswer,
        continueLastSession,
        skipFeedback,
        setRoundInput,
        setRoundConfidence: setRoundConfidenceScore,
        setSessionLength: setSessionTargetItems,
        toggleLives: () => {
          setLivesEnabled((previous) => !previous)
          setLivesRemaining(DEFAULT_LIVES)
        },
        toggleLeechFocus: () => setLeechFocusEnabled((previous) => !previous),
        toggleConfidence: () => setConfidenceCaptureEnabled((previous) => !previous),
        playAudio: (text) => { void voice.playQuestionAudio(text) },
      }}>
      {/* Home is the main landing surface; keep it mounted only for home view. */}
      {view === 'home' ? (
        <HomeView
          navDirection={navDirection}
          studyPlan={studyPlan}
          learningPathStatus={learningPathStatus}
          recommendations={recommendations.map((r) => ({
            nodeId: r.node_id,
            displayLabel: r.display_label,
            reviewCount: r.review_count,
            difficulty: r.difficulty,
            reason: r.reason,
          }))}
          onStartRecommendation={(nodeId) => {
            const scriptMap: Record<string, string> = {
              hiragana: 'hiragana', katakana: 'katakana',
              vocabulary_n5: 'vocab_n5', grammar_n5: 'grammar_patterns', kanji_n5: 'kanji_n5',
            }
            const script = scriptMap[nodeId] as ScriptKey | undefined
            if (script) jumpToScriptHub(script)
          }}
          onContinuePath={(sectionId) => {
            const script = sectionId as ScriptKey
            setNavDirection('forward')
            setActiveScript(script)
            setView('script_hub')
          }}
          onChangePath={() => {
            // Re-open onboarding by resetting onboarding_complete in local state
            setLearningPathStatus((prev) => prev ? { ...prev, onboarding_complete: false } : prev)
          }}
          onSelectScript={(script) => {
            // Check readiness before navigating — show modal for challenging/advanced
            const readiness = learningPathStatus?.steps.find((s) => s.section_id === script)?.readiness
            const needsWarning = (readiness === 'challenging' || readiness === 'advanced') && !warnedSectionsRef.current.has(script)
            if (needsWarning) {
              const LABELS: Record<ScriptKey, string> = {
                hiragana: 'Hiragana', katakana: 'Katakana', kanji_n5: 'Kanji (N5)',
                vocab_n5: 'N5 Vocabulary', grammar_patterns: 'N5 Grammar', sentence_examples: 'Sentences',
              }
              setWarningModal({
                sectionId: script,
                label: LABELS[script] ?? script,
                readiness: readiness as SectionReadiness,
                reason: readiness === 'advanced'
                  ? 'This section builds on content you haven\'t started yet.'
                  : 'Prerequisites are still in progress.',
              })
            } else {
              setNavDirection('forward')
              setActiveScript(script)
              setView('script_hub')
            }
          }}
          onOpenJlptPrep={() => {
            const sectionId = 'jlpt_prep'
            const shouldWarn = !warnedSectionsRef.current.has(sectionId)
            if (shouldWarn) {
              setWarningModal({
                sectionId,
                label: 'JLPT Preparation',
                readiness: 'advanced',
                reason: 'JLPT prep combines multiple skills and is most effective once your foundations are in place.',
              })
              return
            }

            setDictionaryOpen(false)
            setShowOverview(false)
            setShowSettings(false)
            tutor.setAssistantChatOpen(false)
            tutor.setOcrWorkbenchOpen(false)
            setNavDirection('forward')
            setView('jlpt_prep')
          }}
          onJumpToSetup={jumpToScriptHubSetup}
        />
      ) : null}

      {/* Readiness warning modal — shown before navigating to a non-recommended section */}
      {warningModal && (
        <ReadinessWarningModal
          sectionLabel={warningModal.label}
          readiness={warningModal.readiness}
          reason={warningModal.reason}
          onCancel={() => setWarningModal(null)}
          onContinue={() => {
            const { sectionId } = warningModal
            warnedSectionsRef.current.add(sectionId)
            setWarningModal(null)
            setDictionaryOpen(false)
            setShowOverview(false)
            setShowSettings(false)
            tutor.setAssistantChatOpen(false)
            tutor.setOcrWorkbenchOpen(false)
            setNavDirection('forward')

            if (sectionId === 'jlpt_prep') {
              setView('jlpt_prep')
              return
            }

            setActiveScript(sectionId)
            setView('script_hub')
          }}
        />
      )}

      {/* ScriptHub uses a full view so setup content has enough space. */}
      {view === 'script_hub' ? (
        <ScriptHubView
          navDirection={navDirection}
          activeScript={activeScript}
          activeGame={activeGame}
          activeBlockIndex={activeBlockIndex}
          gameLoading={gameLoading}
          gameError={gameError}
          blockProgressWithMastery={blockProgressWithMastery}
          activeBlockCards={activeBlockCards}
          kanjiLevelProgress={kanjiLevelProgress}
          vocabLevelProgress={vocabLevelProgress}
          activeKanjiLevel={activeKanjiLevel}
          activeVocabLevel={activeVocabLevel}
          kanjiCategoryProgress={kanjiCategoryProgress}
          vocabCategoryProgress={vocabCategoryProgress}
          activeKanjiCategory={activeKanjiCategory}
          activeVocabCategory={activeVocabCategory}
          learningPathExpanded={learningPathExpanded}
          learningPathTrackRows={learningPathTrackRows}
          minigameStats={minigameStats}
          availableMinigames={availableMinigames}
          activeSectionName={activeSectionName}
          minigameLockReasons={minigameLockReasons}
          onBack={goHome}
          onSelectBlock={(index) => {
            setActiveBlockIndex(index)
            resetSessionWithLives()
          }}
          onSelectKanjiLevel={(level) => {
            setActiveKanjiLevel(level)
            resetSessionWithLives()
          }}
          onSelectVocabLevel={(level) => {
            setActiveVocabLevel(level)
            resetSessionWithLives()
          }}
          onSelectKanjiCategory={(cat) => {
            setActiveKanjiCategory(cat)
            resetSessionWithLives()
          }}
          onSelectVocabCategory={(cat) => {
            setActiveVocabCategory(cat)
            resetSessionWithLives()
          }}
          onToggleLearningPath={() => setLearningPathExpanded((expanded) => !expanded)}
          onSelectGame={(game) => {
            setActiveGame(game)
            resetSessionWithLives()
          }}
          onPlayGame={(game) => {
            setActiveGame(game)
            setNavDirection('forward')
            setView('minigame')
            resetSessionWithLives()
            void startSession(game)
          }}
        />
      ) : null}

      {view === 'minigame' ? (
        <MinigameView
          navDirection={navDirection}
          activeScript={activeScript}
          activeGame={activeGame}
          activeSectionName={activeSectionName}
          gameLoading={gameLoading}
          gameError={gameError}
          activeRunCardsLength={activeRunCards.length}
          voiceEnabled={settings.voiceEnabled}
          showKeyboardPrompts={settings.showKeyboardPrompts}
          furiganaEnabled={settings.furiganaEnabled}
          activeBlockCards={activeBlockCards}
          onBack={() => {
            setNavDirection('back')
            setView('script_hub')
          }}
          onOpenDictionary={(seedQuery) => openDictionary(seedQuery ?? '')}
          onOpenSettings={openSettingsFromMenu}
          onRetry={handleRetry}
        />
      ) : null}

      {view === 'jlpt_prep' ? (
        <JLPTPrepView
          onBack={() => {
            setNavDirection('back')
            setView('home')
          }}
        />
      ) : null}

      {/* Study Overview popup — accessible on top of any view */}
      {showOverview ? (
        <div
          className="modal-backdrop overview-backdrop"
          role="presentation"
          onClick={() => setShowOverview(false)}
        >
          <div
            className="overview-popup-panel crt-scanlines"
            role="dialog"
            aria-modal="true"
            aria-label="Study Overview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="crt-vhs-line" />
            <OverviewView
              loading={loading}
              error={error}
              lastUpdated={lastUpdated}
              streak={streak}
              decks={decks}
              activity={activity}
              overviewBlocks={overviewBlocks}
              overviewCategoryBlocks={overviewCategoryBlocks}
              overviewKanjiDeck={overviewKanjiDeck}
              overviewKanjiLevelProgress={overviewKanjiLevelProgress}
              overviewBlocksLoading={overviewBlocksLoading}
              mistakes={mistakes}
              hasAnyActivity={hasAnyActivity}
              hasMistakeData={hasMistakeData}
              charMasteryExpanded={charMasteryExpanded}
              expandedBlocks={expandedBlocks}
              overviewSectionExpanded={overviewSectionExpanded}
              cardScores={cardScores}
              kanjiOverviewPage={kanjiOverviewPage}
              onClose={() => setShowOverview(false)}
              onRefresh={() => void loadSummary()}
              onToggleCharMastery={() => setCharMasteryExpanded((v) => !v)}
              onSetExpandedBlocks={setExpandedBlocks}
              onToggleSection={toggleOverviewSection}
              onSetKanjiOverviewPage={setKanjiOverviewPage}
              onSetSelectedChar={setSelectedChar}
            />
          </div>
        </div>
      ) : null}

      <DictionaryPopup
        open={dictionaryOpen}
        openSignal={dictionaryOpenSignal}
        seedQuery={dictionarySeedQuery}
        cards={dictionaryCards}
        onClose={closeDictionary}
        onPlayAudio={(text) => { void voice.playQuestionAudio(text) }}
        voiceBusy={voice.voiceBusy}
        voiceUnavailable={voice.voiceUnavailable}
      />

      {tutor.ocrWorkbenchOpen ? (
        <OcrWorkbench tutor={tutor} settings={settings as any} setSettings={setSettings as any} />
      ) : null}

      </SessionProvider>

      {showSettings ? (
        <div
          className="modal-backdrop settings-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false)
          }}
        >
          <div
            className="modal-panel settings-panel settings-sheet crt-scanlines"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="crt-vhs-line" />
            <div className="settings-sheet-grabber" aria-hidden="true" />
            <div className="settings-modal-header cassette-panel-header">
              <div />
              <div className="cassette-panel-header-center">
                <span className="cassette-panel-header-catalog">QUICK APP CONTROLS</span>
                <h2 id="settings-title" className="cassette-panel-header-title">Control Panel</h2>
              </div>
              <button
                type="button"
                className="panel-close-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                <X size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div className="settings-sheet-body">
              <div className="settings-tab-list" role="tablist" aria-label="Settings sections">
                {SETTINGS_TABS.map((tab) => {
                  const TabIcon = tab.icon
                  const isActive = activeSettingsTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`settings-panel-${tab.key}`}
                      id={`settings-tab-${tab.key}`}
                      className={`settings-tab-button ${isActive ? 'is-active' : ''}`}
                      onClick={() => setActiveSettingsTab(tab.key)}
                    >
                      <TabIcon size={15} strokeWidth={2.2} aria-hidden="true" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="settings-control-grid">
                <div style={{ display: activeSettingsTab === 'appearance' ? undefined : 'none' }}>
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-theme"
                  aria-labelledby="settings-tab-theme"
                >
                  <div className="settings-control-content">
                    <ThemeSettingsTab
                      {...theme}
                      settings={settings}
                      collapsedSettingsSections={collapsedSettingsSections}
                    />
                  </div>
                </div>

                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-background"
                  aria-labelledby="settings-tab-background"
                >
                  <div className="settings-control-content">
                    <BackgroundSettingsTab background={background} />
                  </div>
                </div>


                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-font_size"
                  aria-labelledby="settings-tab-font_size"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Font Size</p>
                    <button
                      type="button"
                      className="settings-icon-entry settings-icon-entry-button"
                      onClick={advanceFontSize}
                      aria-label={`Font size: ${FONT_SIZE_LABEL[settings.fontSize]}. Activate to cycle.`}
                      title={`Font size: ${FONT_SIZE_LABEL[settings.fontSize]}`}
                    >
                      <span className="settings-mode-icon-button" aria-hidden="true">
                        {(() => {
                          const Icon = FONT_SIZE_ICON[settings.fontSize]
                          return <Icon className="settings-option-glyph" size={18} strokeWidth={2.25} aria-hidden="true" />
                        })()}
                      </span>
                      <span className="settings-icon-entry-label">{FONT_SIZE_LABEL[settings.fontSize]}</span>
                    </button>

                    <p className="settings-section-label" style={{ marginTop: 12 }}>Font Family</p>
                    <div className="settings-animation-grid" role="radiogroup" aria-label="App font family">
                      {APP_FONT_OPTIONS.map((fontOption) => (
                        <button
                          key={fontOption.key}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.appFont === fontOption.key ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, appFont: fontOption.key }))}
                          aria-label={`Use ${fontOption.label} font`}
                          aria-pressed={settings.appFont === fontOption.key}
                          title={fontOption.label}
                        >
                          <span className={`settings-mode-icon-button ${settings.appFont === fontOption.key ? 'is-enabled' : ''}`} aria-hidden="true">
                            <BookText size={18} strokeWidth={2.25} aria-hidden="true" />
                          </span>
                          <span className="settings-icon-entry-label">{fontOption.label}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="settings-icon-entry settings-icon-entry-button"
                      onClick={reloadLocalFonts}
                      aria-label="Reload local font files"
                      title="Reload local fonts"
                      style={{ marginTop: 12 }}
                    >
                      <span className="settings-mode-icon-button" aria-hidden="true">
                        <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <span className="settings-icon-entry-label">Reload Local Fonts</span>
                    </button>
                    <p className="settings-help">Applies to interface text across the app.</p>
                  </div>
                </div>
                
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-animations"
                  aria-labelledby="settings-tab-animations"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Motion Style</p>
                    <div className="settings-animation-grid" role="radiogroup" aria-label="Animation style">
                      {MOTION_STYLE_OPTIONS.map((motionStyle) => (
                        <button
                          key={motionStyle.key}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.motionStyle === motionStyle.key ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, motionStyle: motionStyle.key }))}
                          aria-label={`Use ${motionStyle.label} animation style`}
                          aria-pressed={settings.motionStyle === motionStyle.key}
                          title={motionStyle.label}
                        >
                          <span className={`settings-mode-icon-button ${settings.motionStyle === motionStyle.key ? 'is-enabled' : ''}`} aria-hidden="true">
                            {motionStyle.key === 'calm_fade' ? (
                              <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
                            ) : motionStyle.key === 'glide' ? (
                              <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
                            ) : (
                              <Flame size={18} strokeWidth={2.25} aria-hidden="true" />
                            )}
                          </span>
                          <span className="settings-icon-entry-label">{MOTION_STYLE_LABEL[motionStyle.key]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="settings-theme-card settings-collapsible-card-inline" style={{ marginTop: 10 }}>
                      <p className="settings-section-label" style={{ marginBottom: 8 }}>Reduce Motion</p>
                      <button
                        type="button"
                        className={`settings-toggle settings-reduced-motion-toggle ${settings.reducedMotion ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
                        aria-label={settings.reducedMotion ? 'Reduce motion enabled. Activate to disable.' : 'Reduce motion disabled. Activate to enable.'}
                        aria-pressed={settings.reducedMotion}
                        title={settings.reducedMotion ? 'Reduce motion enabled' : 'Reduce motion disabled'}
                      >
                        <span className={`settings-mode-icon-button ${settings.reducedMotion ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Activity size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-toggle-copy">
                          <span className="settings-icon-entry-label">Reduce Motion</span>
                          <span className="settings-note">Minimize movement across the interface.</span>
                        </span>
                      </button>
                  </div>
                </div>
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-furigana"
                  aria-labelledby="settings-tab-furigana"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Study Display</p>
                    <div className="settings-animation-grid" role="group" aria-label="Reading aid controls">
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.furiganaEnabled ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, furiganaEnabled: !prev.furiganaEnabled }))}
                        aria-label={settings.furiganaEnabled ? 'Furigana reading aid visible. Activate to hide.' : 'Furigana reading aid hidden. Activate to show.'}
                        aria-pressed={settings.furiganaEnabled}
                        title={settings.furiganaEnabled ? 'Furigana visible' : 'Furigana hidden'}
                      >
                        <span className={`settings-mode-icon-button ${settings.furiganaEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Languages size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">Show furigana (kana above kanji)</span>
                      </button>
                    </div>
                    <p className="settings-help">When on, kana readings appear above kanji during review to help build reading confidence. Turn off as you progress.</p>
                  </div>
                </div>
              </div>
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-cursor"
                  aria-labelledby="settings-tab-cursor"
                >
                  <div className="settings-control-content">
                    <CursorSettingsTab cursor={cursor} />
                  </div>
                </div>
              </div>
              <div style={{ display: activeSettingsTab === 'assistant' ? undefined : 'none' }}>
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-tutor"
                  aria-labelledby="settings-tab-tutor"
                >
                  <div className="settings-control-content">
                    <TutorSettingsTab settings={settings as any} setSettings={setSettings as any} />
                  </div>
                </div>
                
                <SettingsCollapsibleSection
                  id="tutor-models"
                  title="Tutor models"
                  description="Download or reinstall the local model tiers used by the Tutor runtime."
                  meta={(
                    <>
                      {models.tutorInstallInfo?.llamaCppInstalled ? 'llama.cpp installed' : 'llama.cpp not installed'}
                      {' '}· Recommended tier: <strong style={{ color: 'var(--text-main)' }}>{models.tutorInstallInfo?.models.find((model) => model.tier === models.tutorInstallInfo?.recommendedTier)?.label ?? '—'}</strong>
                    </>
                  )}
                  collapsed={Boolean(collapsedSettingsSections['tutor-models'])}
                  onToggle={() => toggleThemeSectionCollapsed('tutor-models')}
                  className="settings-theme-card"
                >
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {(models.tutorInstallInfo?.models ?? []).map((model) => {
                      const isDownloadingThis = models.tutorDownloadingTier === model.tier
                      const isActioningThis = models.tutorModelActionTier === model.tier
                      const isActiveTier = models.tutorInstallInfo?.activeModelTier === model.tier
                      const hardwareFit = models.getTutorModelHardwareFit(model.tier)
                      const showRecommendedBadge = model.tier === models.tutorInstallInfo?.recommendedTier
                        && hardwareFit.badge === 'Recommended fit'
                      const badges = [
                        showRecommendedBadge ? 'Recommended' : null,
                        isActiveTier ? 'Active' : null,
                        hardwareFit.badge,
                      ].filter(Boolean).join(' · ')

                      return (
                        <div
                          key={model.tier}
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '2px',
                            background: 'color-mix(in oklab, var(--panel-bg-alt) 60%, transparent)',
                            border: isActiveTier
                              ? '1px solid color-mix(in oklab, var(--accent) 62%, var(--panel-border))'
                              : showRecommendedBadge
                                ? '1px solid color-mix(in oklab, var(--accent) 42%, var(--panel-border))'
                                : '1px solid color-mix(in oklab, var(--panel-border) 86%, transparent)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 600 }}>
                                {model.label}
                                {badges ? ` · ${badges}` : ''}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.25rem' }}>
                                {models.formatCombinedModelSize(model.sizeMb, model.embedderSizeMb)} · {models.formatMinutes(model.estimatedDownloadMinutes)}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                {model.installed ? 'Installed' : model.description}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.2rem', color: hardwareFit.isOk ? 'rgba(242, 181, 111, 0.92)' : 'var(--status-error)' }}>
                                {hardwareFit.detail}
                              </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              {model.installed ? (
                                <button
                                  type="button"
                                  className={`settings-card-icon-button ${isActiveTier ? 'is-active' : ''}`}
                                  onClick={() => { void models.selectTutorModel(model.tier) }}
                                  disabled={isActiveTier || models.tutorModelActionTier !== null || models.tutorDownloadingTier !== null}
                                  aria-label={isActiveTier ? `${model.label} is the active Tutor model` : `Use ${model.label} for the Tutor`}
                                  title={isActiveTier ? 'Currently active' : 'Use this model'}
                                >
                                  {isActiveTier ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" /> : <Circle size={18} strokeWidth={2.25} aria-hidden="true" />}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="settings-card-icon-button"
                                onClick={() => { void models.downloadTutorModel(model.tier) }}
                                disabled={models.tutorDownloadingTier !== null || models.tutorModelActionTier !== null}
                                aria-label={model.installed ? `Reinstall ${model.label}` : `Download ${model.label}`}
                                title={model.installed ? `Reinstall ${model.label}` : `Download ${model.label}`}
                              >
                                {isDownloadingThis
                                  ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                                  : model.installed
                                    ? <RotateCcw size={18} strokeWidth={2.25} aria-hidden="true" />
                                    : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                              </button>
                              {model.installed ? (
                                <button
                                  type="button"
                                  className="settings-inline-icon-button"
                                  onClick={() => { void models.uninstallTutorModel(model.tier) }}
                                  disabled={models.tutorModelActionTier !== null || models.tutorDownloadingTier !== null}
                                  aria-label={`Uninstall ${model.label}`}
                                  title={`Uninstall ${model.label}`}
                                >
                                  {isActioningThis
                                    ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                                    : <Trash2 size={18} strokeWidth={2.25} aria-hidden="true" />}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          {isDownloadingThis ? (
                            <div>
                              <div className="settings-progress-track">
                                <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, models.tutorDownloadProgress?.percent ?? 0))}%` }} />
                              </div>
                              <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                {models.tutorDownloadProgress?.mb != null && models.tutorDownloadProgress?.totalMb != null
                                  ? `${models.tutorDownloadProgress.mb.toFixed(0)} / ${models.tutorDownloadProgress.totalMb.toFixed(0)} MB · ${Math.round(models.tutorDownloadProgress.percent)}%${models.tutorDownloadMethod ? ` [${models.tutorDownloadMethod}]` : ''}`
                                  : `Downloading… ${Math.round(models.tutorDownloadProgress?.percent ?? 0)}%${models.tutorDownloadMethod ? ` [${models.tutorDownloadMethod}]` : ''}`}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                    {(() => {
                      const embedderLabel = models.tutorInstallInfo?.activeEmbedderLabel
                        ?? (models.tutorInstallInfo?.activeEmbedderTier ? models.tutorInstallInfo.activeEmbedderTier.replace('_', '-').toUpperCase() : null)
                      if (!embedderLabel) {
                        return 'Embedder: none active yet. Select a Tutor model to enable retrieval embeddings.'
                      }
                      const installState = models.tutorInstallInfo?.activeEmbedderInstalled ? 'installed' : 'not installed'
                      const enabledState = models.tutorInstallInfo?.activeEmbedderEnabled ? 'enabled' : 'disabled'
                      return `Embedder: ${embedderLabel} · ${installState} · ${enabledState}`
                    })()}
                  </p>
                  <p className="settings-help" style={{ marginTop: '0.45rem' }}>
                    Select the circle icon to switch the Tutor to that model. Changes apply automatically without restarting the app.
                  </p>
                </SettingsCollapsibleSection>
                
                <SettingsCollapsibleSection
                  id="offline-dictionary"
                  title="Offline Dictionary"
                  description="Lets Tutor chat translate Japanese↔English words without an internet connection. Downloaded from the open-source jmdict-simplified project (~30 MB)."
                  meta={models.tutorInstallInfo?.dictionaryInstalled ? 'Installed' : `Not installed • ${models.formatMinutes(models.tutorInstallInfo?.dictionaryEstimatedDownloadMinutes)}`}
                  collapsed={Boolean(collapsedSettingsSections['offline-dictionary'])}
                  onToggle={() => toggleThemeSectionCollapsed('offline-dictionary')}
                  className="settings-theme-card"
                  actions={(
                    <button
                      type="button"
                      className="settings-card-icon-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void models.downloadOfflineDictionary()
                      }}
                      disabled={models.dictionaryDownloading || models.tutorInstallInfo?.dictionaryInstalled}
                      aria-label={models.tutorInstallInfo?.dictionaryInstalled ? 'Offline dictionary installed' : 'Download offline dictionary'}
                      title={models.tutorInstallInfo?.dictionaryInstalled ? 'Offline dictionary installed' : 'Download offline dictionary'}
                    >
                      {models.dictionaryDownloading
                        ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                        : models.tutorInstallInfo?.dictionaryInstalled
                          ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                          : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                    </button>
                  )}
                >
                  {models.dictionaryDownloading ? (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div className="settings-progress-track">
                        <div
                          className="settings-progress-fill"
                          style={{ width: `${Math.min(100, Math.max(0, models.dictionaryProgress))}%` }}
                        />
                      </div>
                      <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                        Downloading… {Math.round(models.dictionaryProgress)}%{models.dictionaryDownloadMethod ? ` [${models.dictionaryDownloadMethod}]` : ''}
                      </p>
                    </div>
                  ) : null}
                </SettingsCollapsibleSection>
                
                <SettingsCollapsibleSection
                  id="image-ocr"
                  title="Image Translation"
                  description="Install the offline OCR extraction package (PaddleOCR) for imported Japanese text images."
                  meta={(models.tutorInstallInfo?.ocrModels ?? []).some((model) => model.installed) ? 'Installed' : 'Not installed'}
                  collapsed={Boolean(collapsedSettingsSections['image-ocr'])}
                  onToggle={() => toggleThemeSectionCollapsed('image-ocr')}
                  className="settings-theme-card"
                >
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {(models.tutorInstallInfo?.translationProfiles ?? []).map((model) => {
                      const isApplyingThis = models.translationProfileApplyingTier === model.tier
                      const isActiveTier = models.tutorInstallInfo?.activeTranslationProfileTier === model.tier

                      return (
                        <div
                          key={model.tier}
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '2px',
                            background: 'color-mix(in oklab, var(--panel-bg-alt) 60%, transparent)',
                            border: isActiveTier
                              ? '1px solid color-mix(in oklab, var(--accent) 62%, var(--panel-border))'
                              : '1px solid color-mix(in oklab, var(--panel-border) 86%, transparent)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 600 }}>
                                {model.label}
                                {isActiveTier ? ' · Active' : ''}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.25rem' }}>
                                {models.formatModelSize(model.sizeMb)} · {models.formatMinutes(model.estimatedDownloadMinutes)}
                                {model.badge ? ` · ${model.badge}` : ''}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                {model.installed ? 'Installed' : model.description}
                              </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <button
                                type="button"
                                className="settings-card-icon-button"
                                onClick={() => { void models.applyTranslationProfile(model.tier) }}
                                disabled={models.translationProfileApplyingTier !== null}
                                aria-label={model.installed ? `Reapply ${model.label}` : `Apply ${model.label}`}
                                title={model.installed ? `Reapply ${model.label}` : `Apply ${model.label}`}
                              >
                                {isApplyingThis
                                  ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                                  : isActiveTier
                                    ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                                    : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                              </button>
                            </div>
                          </div>
                          {isApplyingThis ? (
                            <div>
                              <div className="settings-progress-track">
                                <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, models.translationProfileProgress))}%` }} />
                              </div>
                              <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                Installing... {Math.round(models.translationProfileProgress)}%{models.translationProfileMethod ? ` [${models.translationProfileMethod}]` : ''}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                    OCR translation now uses a single profile: OCR extraction + Qwen3.5-0.8B-JP local translation.
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <label className="settings-help" htmlFor="assistant-chat-ocr-confidence-slider" style={{ display: 'block', marginBottom: '0.35rem' }}>
                      OCR confidence filter: {Math.round(settings.assistantChatOcrMinConfidence * 100)}%
                    </label>
                    <input
                      id="assistant-chat-ocr-confidence-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.assistantChatOcrMinConfidence}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value)
                        setSettings((prev) => ({
                          ...prev,
                          assistantChatOcrMinConfidence: clampAssistantChatOcrMinConfidence(value),
                        }))
                      }}
                      aria-label="OCR confidence filter"
                    />
                    <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                      Higher values ignore uncertain OCR lines; lower values capture more text with more noise.
                    </p>
                  </div>
                </SettingsCollapsibleSection>
                
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-voice"
                  aria-labelledby="settings-tab-voice"
                >
                  <div className="settings-control-content">
                    <VoiceSettingsTab
                      voice={voice}
                      settings={settings as any}
                      setSettings={setSettings as any}
                      collapsedSettingsSections={collapsedSettingsSections}
                      toggleThemeSectionCollapsed={toggleThemeSectionCollapsed}
                      formatModelSize={models.formatModelSize}
                      formatMinutes={models.formatMinutes}
                      tutorInstallInfo={models.tutorInstallInfo as any}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: activeSettingsTab === 'system' ? undefined : 'none' }}>
                <div
                  className="settings-section settings-control-row"
                  role="tabpanel"
                  id="settings-panel-shortcuts"
                  aria-labelledby="settings-tab-shortcuts"
                >
                  <button
                    type="button"
                    className="settings-icon-tile"
                    onClick={() => shortcutsSectionRef.current?.focus()}
                    aria-label="Focus keyboard shortcuts"
                  >
                    <Keyboard size={18} strokeWidth={2.1} />
                  </button>
                  <div ref={shortcutsSectionRef} className="settings-control-content" tabIndex={-1}>
                    <p className="settings-section-label">Keyboard Shortcuts</p>
                    <div className="settings-animation-grid" role="group" aria-label="Keyboard prompt controls">
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.showKeyboardPrompts ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, showKeyboardPrompts: !prev.showKeyboardPrompts }))}
                        aria-label={settings.showKeyboardPrompts ? 'Keyboard prompts visible. Activate to hide.' : 'Keyboard prompts hidden. Activate to show.'}
                        aria-pressed={settings.showKeyboardPrompts}
                        title={settings.showKeyboardPrompts ? 'Keyboard prompts visible' : 'Keyboard prompts hidden'}
                      >
                        <span className={`settings-mode-icon-button ${settings.showKeyboardPrompts ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Keyboard size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">Show key prompts</span>
                      </button>
                    </div>
                    <div className="settings-shortcuts">
                      <code className="command-hint">Ctrl+,</code><span>Settings</span>
                      <code className="command-hint">Esc</code><span>Close modal / back</span>
                      <code className="command-hint">1 / 2 / 3 / 4 / 5</code><span>Learning tracks (home)</span>
                      <code className="command-hint">6</code><span>Study overview (home)</span>
                    </div>
                    <p className="settings-help">When off, shortcut keys still work but hint labels stay hidden in game rounds.</p>
                  </div>
                </div>
                
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-data"
                  aria-labelledby="settings-tab-data"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Data Management</p>
                    <p className="settings-help">
                      Reset all study progress — review history, streaks, leech data, and locally-tracked scores.
                      This cannot be undone.
                    </p>
                    {resetConfirmStep === 0 ? (
                      <button
                        type="button"
                        className="settings-reset-button"
                        onClick={() => setResetConfirmStep(1)}
                        disabled={resettingDb}
                      >
                        <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                        Reset all progress
                      </button>
                    ) : resetConfirmStep === 1 ? (
                      <div className="settings-reset-confirm">
                        <p className="settings-reset-warning">Are you sure? All progress will be permanently deleted.</p>
                        <div className="reset-confirm-actions">
                          <button
                            type="button"
                            className="danger-button"
                        onClick={() => setResetConfirmStep(2)}
                            disabled={resettingDb}
                          >
                            I understand — continue
                          </button>
                          <button type="button" onClick={() => setResetConfirmStep(0)} disabled={resettingDb}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="settings-reset-confirm">
                        <p className="settings-reset-warning"><strong>Final step:</strong> this will erase everything.</p>
                        <div className="reset-confirm-actions">
                          <button
                            type="button"
                            className="danger-button danger-button-final"
                            onClick={() => void resetStudyDb()}
                            disabled={resettingDb}
                          >
                            {resettingDb ? 'Resetting…' : '⚠ Yes, delete everything'}
                          </button>
                          <button type="button" onClick={() => setResetConfirmStep(0)} disabled={resettingDb}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: tutor.assistantChatOpen ? undefined : 'none' }}>
        <TutorChatPanel tutor={tutor} settings={settings as any} setSettings={setSettings as any} cancelAssistantSpeech={voice.cancelAssistantSpeech} />
      </div>

      {cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}

      {selectedChar ? (
        <div
          className="char-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Character detail: ${selectedChar.character}`}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedChar(null) }}
        >
          <div className="char-detail-card">
            <button
              type="button"
              className="char-detail-close"
              onClick={() => setSelectedChar(null)}
              aria-label="Close"
            >✕</button>
            <div className="char-detail-label">{selectedChar.label}</div>
            <div className="char-detail-char" lang="ja">{selectedChar.character}</div>
            <div className="char-detail-romaji">{selectedChar.romaji}</div>
            {selectedChar.meaning !== selectedChar.romaji ? (
              <div className="char-detail-meaning">{selectedChar.meaning}</div>
            ) : null}
            <div className="char-detail-score-bar-wrap">
              {Array.from({ length: CARD_MASTERY_MAX }, (_, i) => (
                <span
                  key={i}
                  className={`char-detail-pip ${i < selectedChar.score ? 'is-filled' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="char-detail-score-label">
              {selectedChar.score === 0 && 'Not studied yet'}
              {selectedChar.score === 1 && 'Just started'}
              {selectedChar.score === 2 && 'Getting there'}
              {selectedChar.score === 3 && 'Almost mastered'}
              {selectedChar.score === CARD_MASTERY_MAX && 'Mastered ✓'}
            </div>
          </div>
        </div>
      ) : null}

      <aside className="assistant-toast-anchor" aria-live="polite" aria-label="Tutor updates">
        {settings.assistantToastLimit > 0 && tutor.activeAssistantToast ? (
          <TutorToast toast={tutor.activeAssistantToast} onDismiss={tutor.dismissAssistantToast} onAction={tutor.launchAssistantToastAction} />
        ) : null}
      </aside>

      {showResumeToast && resumeData ? (
        <ResumeToast
          deck={resumeData.activeScript}
          mode={MINIGAMES.find((m) => m.key === resumeData.activeGame)?.title ?? resumeData.activeGame}
          onResume={handleResume}
          onDismiss={handleDismissResume}
        />
      ) : null}

      {devDashboardOpen ? (
        <DevDashboard
          pendingCheck={pendingDevCheck}
          onClose={() => { setDevDashboardOpen(false); setPendingDevCheck(null) }}
        />
      ) : null}

      </div>
    </main>
  )
}

export default App



