import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ChangeEvent } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { LearningPathStatus, SectionReadiness } from './types'
import { SetupWizard } from './components/SetupWizard'
import { DictionaryPopup } from './components/DictionaryPopup'
import { HomeView } from './views/HomeView'
import { ScriptHubView } from './views/ScriptHubView'
import { MinigameView } from './views/MinigameView'
import { OverviewView } from './views/OverviewView'
import { JLPTPrepView } from './views/JLPTPrepView'
import { OnboardingView } from './views/OnboardingView'
import { ReadinessWarningModal } from './components/ReadinessWarningModal'
import { SessionProvider } from './context/SessionContext'
import { assessTypedAnswer } from './lib/answerAssessment'
import type { TypedAnswerState } from './lib/answerAssessment'
import { assessTypedRecallAnswer } from './lib/typedRecallAssessment'
import { AmbientAudioController } from './lib/ambientAudio'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookText, CheckCircle2, ChevronDown, Circle, Code2, Copy, Download, Flame, History, House, ImagePlus, Keyboard, Languages, ListChecks, Menu, MessageCircle, Mic, Minus, Moon, Plus, RefreshCw, RotateCcw, Search, SendHorizontal, Settings, Shuffle, Square, Sun, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import './App.css'
import type { RoundDictionaryNote } from './types'

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
type VoiceStatusPayload = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getVoiceStatus>>>
type TutorReactionItem = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getTutorReactions>>>['reactions'][number]
type RecommendationItem = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getRecommendations>>>['recommendations'][number]
interface SessionRunReport {
  script: ScriptKey
  minigame: MinigameKey
  sectionName: string | null
  completedAt: string
  rounds: number
  correct: number
  wrong: number
  accuracy: number
  points: number
  targetItems: number
  goalCompletionPct: number
  goalDelta: number
  livesEnabled: boolean
  livesRemaining: number
  livesLost: number
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  confidenceCapturedCount: number
  averageConfidenceScore: number | null
}
interface AssistantStatePayload {
  mood: string
  momentum: number
  confidence_level: number
  focus_area: string
  last_major_event: string
}
interface AssistantProfilePayload {
  persona_style: string
  emotion_persistence: string
  llm_backend: string
  chat_retention: string
  updated_at_utc: string
}
interface AssistantEventPayload {
  id: number
  event_type: string
  priority: 'info' | 'coaching' | 'critical' | 'celebration'
  message_key: string
  metadata: Record<string, string>
}
interface AssistantToast {
  id: number
  priority: AssistantEventPayload['priority']
  eventType: string
  messageKey: string
  title: string
  body: string
  targetMode: MinigameKey | null
  focusArea: string | null
  actionType: string | null
  actionLabel: string
}
interface AssistantChatTurn {
  role: 'user' | 'assistant'
  content: string
  created_at_utc: string
}
interface AssistantChatRuntimeStatus {
  loaded: boolean
  loadedAtUtc: string | null
  lastUsedAtUtc: string | null
  inactivityUnloadMs: number
  configuredProvider?: string
  activeProvider?: string
  activeModel?: string
  activePromptAdapter?: string
  adapterManifestPath?: string | null
  lastError?: string | null
}
type BlockInfo = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>['blocks'][number]
type JlptProgressCard = Pick<ScriptDeck['cards'][number], 'id' | 'character' | 'tags'>
type OverviewKanjiCard = OverviewCharacterMasteryPayload['kanji_cards'][number]
type OverviewCategoryBlocks = OverviewCharacterMasteryPayload['category_blocks']
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns' | 'sentence_examples'
type VocabCategory = 'greetings' | 'numbers' | 'time_days' | 'family' | 'body' | 'food_drink' | 'school_study' | 'places' | 'transport' | 'adjectives' | 'verbs' | 'nouns'
type VocabCategorySlug = 'vocab_greetings' | 'vocab_numbers' | 'vocab_time_days' | 'vocab_family' | 'vocab_body' | 'vocab_food_drink' | 'vocab_school_study' | 'vocab_places' | 'vocab_transport' | 'vocab_adjectives' | 'vocab_verbs' | 'vocab_nouns'
type KanjiCategory = 'numbers_time' | 'nature_world' | 'people_body' | 'study_language' | 'actions_travel' | 'n4_society_roles' | 'n4_mind_thought' | 'n4_daily_life' | 'n4_time_action' | 'n3_governance' | 'n3_communication' | 'n3_movement' | 'n3_achievement' | 'n2_professionalism' | 'n2_economics' | 'n2_analysis' | 'n1_law_order' | 'n1_ideology' | 'n1_literary'
type KanjiCategorySlug = 'kanji_numbers_time' | 'kanji_nature_world' | 'kanji_people_body' | 'kanji_study_language' | 'kanji_actions_travel' | 'kanji_n4_society_roles' | 'kanji_n4_mind_thought' | 'kanji_n4_daily_life' | 'kanji_n4_time_action' | 'kanji_n3_governance' | 'kanji_n3_communication' | 'kanji_n3_movement' | 'kanji_n3_achievement' | 'kanji_n2_professionalism' | 'kanji_n2_economics' | 'kanji_n2_analysis' | 'kanji_n1_law_order' | 'kanji_n1_ideology' | 'kanji_n1_literary'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'stroke_order' | 'typed_recall' | 'speech_recall' | 'sentence_assembly' | 'particle_cloze' | 'vibe_check' | 'imposter' | 'listening_audio_first' | 'listening_prompt_first' | 'interleave_mix'
type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>
type ShortcutSubmenuKey = 'all_maps' | ScriptKey | 'dev_tools'
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
type BackgroundStyle =
  | 'classic_scene'
  | 'fuji_view'
  | 'torii_gate'
  | 'temple_reflection'
  | 'garden_bridge'
  | 'autumn_pond'
  | 'custom_upload'
type FeedbackTone = 'success' | 'error' | null
type ExpertiseLevel = 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation' | 'jlpt_n4_foundation' | 'jlpt_n3_foundation' | 'jlpt_n2_foundation' | 'jlpt_n1_foundation'
type ThemeKey =
  | 'lofi_dusk'
  | 'harbor_mist'
  | 'sakura_dawn'
  | 'forest_ink'
  | 'sunset_lacquer'
  | 'midnight_neon'
  | 'paper_crane'
  | 'matcha_stone'
  | 'ocean_glass'
  | 'ember_night'
  | 'plum_garden'
  | 'lofi_dusk_light'
  | 'harbor_mist_light'
  | 'sakura_dawn_light'
  | 'sunset_lacquer_light'
  | 'midnight_neon_light'
  | 'paper_crane_light'
  | 'ember_night_light'
  | 'forest_ink_light'
  | 'ocean_glass_light'
  | 'plum_garden_light'
  | 'matcha_stone_light'
type ThemeMode = 'dark' | 'light'
type ThemeScope = 'preset' | 'custom'
type ThemeVariableKey =
  | '--bg-main'
  | '--bg-subtle'
  | '--text-main'
  | '--text-soft'
  | '--accent'
  | '--accent-soft'
  | '--accent-ink'
  | '--blob-left'
  | '--blob-right'
  | '--blob-top'
  | '--panel-bg'
  | '--panel-bg-alt'
  | '--panel-border'
  | '--panel-shadow'
  | '--tile-bg'
  | '--tile-border'
  | '--chip-bg'
  | '--chip-border'
  | '--button-border'
  | '--button-bg-top'
  | '--button-bg-bottom'
  | '--card-border'
  | '--card-bg-top'
  | '--card-bg-bottom'
  | '--track-bg'
  | '--xp-shell-border'
  | '--xp-shell-bg'
  | '--xp-badge-bg'
  | '--xp-badge-text'
  | '--xp-badge-ring'
  | '--xp-badge-glow'
  | '--xp-track-bg'
  | '--xp-fill-start'
  | '--xp-fill-end'
  | '--xp-label'
  | '--streak-shell-border'
  | '--streak-shell-bg'
  | '--streak-shell-text'
  | '--streak-icon'
  | '--streak-popover-border'
  | '--streak-popover-glow'
  | '--streak-popover-title'
  | '--streak-divider'
  | '--status-error'
  | '--tone-teal'
  | '--tone-ocean'
  | '--tone-amber'
  | '--tone-rose'
type ThemeVariableOverrides = Partial<Record<ThemeVariableKey, string>>
type ThemePalette = Record<ThemeVariableKey, string>

interface CustomTheme {
  id: string
  name: string
  baseThemeByMode: Record<ThemeMode, ThemeKey>
  overridesByMode: Record<ThemeMode, ThemeVariableOverrides>
}

interface ThemeSection {
  id: string
  label: string
  description: string
  keys: ThemeVariableKey[]
}

interface CustomThemeExportPayload {
  version: 1
  exportedAtUtc: string
  themes: CustomTheme[]
}
type SettingsTabKey = 'theme' | 'background' | 'font_size' | 'animations' | 'tutor' | 'voice' | 'shortcuts' | 'data'

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

const FEEDBACK_REVEAL_MS = 2100
const FEEDBACK_REVEAL_SUCCESS_MS = 500
const PERFORMANCE_PERFECT_MS = 700
const PERFORMANCE_GOOD_MS = 2200
const ASSISTANT_EVENT_POLL_MS = 15000
const ASSISTANT_TOAST_TTL_MS = 3800
const ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT = 600
const ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB = 30
const ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_BYTES = ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB * 1024 * 1024
const ASSISTANT_CHAT_IMAGE_MAX_DIMENSION = 2200
const ASSISTANT_CHAT_IMAGE_JPEG_QUALITY = 0.62
const ROUND_QUEUE_TIMEOUT_MS = 1200
const STUDY_QUEUE_CACHE_TTL_MS = 45000
const DECK_LOAD_TIMEOUT_MS = 15000
const STARTUP_WARMUP_INITIAL_DELAY_MS = 900
const STARTUP_WARMUP_YIELD_DEADLINE_MS = 45
const ASSISTANT_MAX_TOASTS = 1
const ASSISTANT_TOAST_LIMIT_OPTIONS: Array<{ value: 0 | 1; label: string }> = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' },
]
const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/
const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string; icon: LucideIcon }> = [
  { key: 'theme', label: 'Theme', icon: Sun },
  { key: 'background', label: 'Background', icon: House },
  { key: 'font_size', label: 'Font', icon: BookText },
  { key: 'animations', label: 'Animations', icon: Activity },
  { key: 'tutor', label: 'Tutor', icon: MessageCircle },
  { key: 'voice', label: 'Voice', icon: Volume2 },
  { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { key: 'data', label: 'Data', icon: Trash2 },
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
const SURPRISE_PROMPTS = [
  'Surprise Drill: trust your first instinct.',
  'Odd Prompt Mode: quick read, clean recall.',
  'Twist Round: stay sharp and answer fast.',
] as const
const SCRIPT_MODE_PROMPT_PACKS: Record<ScriptKey, Partial<Record<PlayableMinigame, string[]>>> = {
  hiragana: {
    romaji_sprint: [
      'Sound Burst: read it aloud, then type it clean.',
      'Kana Echo: lock the vowel sound before you answer.',
    ],
    meaning_match: [
      'Kana Context: choose the meaning with the strongest cue.',
      'Quick Decode: ignore look-alikes and pick the exact sense.',
    ],
    character_match: [
      'Shape Recall: choose the symbol that matches the meaning.',
      'Script Snap: pick the kana form with confidence.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Typed Recall: write the meaning from memory with clean spelling.',
      'No options this round: recall first, then type confidently.',
    ],
    speech_recall: [
      'Voice Recall: speak the meaning aloud, then let the mic catch every syllable.',
      'Say It Clean: trust the sound before you speak.',
    ],
    particle_cloze: [
      'Context Ladder: use sentence clues before touching options.',
      'Meaning Lens: infer the blank, then verify carefully.',
    ],
    imposter: [
      'Story Gate: read the scene and infer what completes the moment.',
      'Chapter Pulse: use narrative clues to choose the strongest fit.',
    ],
    listening_audio_first: [
      'Audio Challenge: listen closely before selecting the meaning.',
      'Ear First: trust what you hear and choose with confidence.',
    ],
    listening_prompt_first: [
      'Sound Reinforcement: see the character and hear it pronounced.',
      'Character-Audio Link: connect the form to its sound and meaning.',
    ],
  },
  katakana: {
    romaji_sprint: [
      'Loanword Sprint: hear the borrowed sound in your head first.',
      'Sharp Script: lock the consonant-vowel pair quickly.',
    ],
    meaning_match: [
      'Katakana Decode: pick the meaning that fits the imported term.',
      'Rapid Borrowing: map sound to meaning before selecting.',
    ],
    character_match: [
      'Glyph Match: choose the katakana symbol tied to the prompt.',
      'Name Lane: select the character used in modern terms.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Typed Recall: write the exact meaning from memory.',
      'No hints mode: type what the prompt means in one shot.',
    ],
    speech_recall: [
      'Voice Recall: speak the exact meaning, trusting the borrowed sound.',
      'Say It Clean: commit to the term you would use in conversation.',
    ],
    particle_cloze: [
      'Loanword Context: let the sentence guide the missing term.',
      'Borrowed Meaning: infer from usage before selecting.',
    ],
    imposter: [
      'Story Gate: follow the borrowed-word scene and pick the right meaning.',
      'Chapter Pulse: use the narrative beat before selecting.',
    ],
    listening_audio_first: [
      'Audio Challenge: listen closely before selecting the meaning.',
      'Ear First: trust what you hear and choose with confidence.',
    ],
    listening_prompt_first: [
      'Sound Reinforcement: see the character and hear it pronounced.',
      'Character-Audio Link: connect the katakana form to its sound.',
    ],
  },
  kanji_n5: {
    romaji_sprint: [
      'Reading Shift: commit to one reading and type decisively.',
      'Kanji Soundline: connect character to reading in one step.',
    ],
    meaning_match: [
      'Meaning Split: separate close definitions and pick the core one.',
      'Concept Lock: choose the strongest semantic match.',
    ],
    character_match: [
      'Symbol Meaning Link: pick the kanji with the right concept.',
      'N5 Recall: choose the character that best fits the cue.',
    ],
    stroke_order: [
      'Writing Trace: start from the meaning and rebuild the character.',
      'Stroke Path: picture the order before you type the kanji.',
    ],
    typed_recall: [
      'Concept Recall: type the meaning directly without choices.',
      'Kanji Memory: commit one meaning and type it exactly.',
    ],
    speech_recall: [
      'Voice Recall: say the meaning aloud, clearly and confidently.',
      'Spoken Kanji: commit to one meaning and speak it out loud.',
    ],
    particle_cloze: [
      'Semantic Context: use nearby clues to fill the blank.',
      'N5 Sentence Drill: infer first, then commit to one meaning.',
    ],
    imposter: [
      'Story Scene: read the situation and resolve the missing idea.',
      'Scene Pulse: infer from the narrative shift before choosing.',
    ],
    listening_audio_first: [
      'Kanji Audio Drill: hear the reading and choose the meaning.',
      'Sound Recognition: identify the kanji from its spoken form.',
    ],
    listening_prompt_first: [
      'Reading Reinforcement: see the kanji while hearing its reading.',
      'Audio Anchor: link the character to its spoken pronunciation.',
    ],
  },
  vocab_n5: {
    romaji_sprint: [
      'Word Recall: read the vocab item and type the reading cleanly.',
      'Sound-to-Word: lock pronunciation before typing.',
    ],
    meaning_match: [
      'Word Sense: choose the exact English meaning.',
      'Precision Match: avoid near-synonyms and commit.',
    ],
    character_match: [
      'Word Form: choose the Japanese form for the meaning.',
      'Lexical Link: pick the correct written word.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Meaning Recall: type the word meaning from memory.',
      'Precision Recall: type the best English gloss directly.',
    ],
    speech_recall: [
      'Voice Recall: speak the word meaning from memory.',
      'Spoken Precision: say the best English gloss aloud.',
    ],
    particle_cloze: [
      'Usage Context: use sentence context to place the right word.',
      'Meaning-in-Use: infer from surrounding clues first.',
    ],
    imposter: [
      'Scene Choice: complete the mini situation with the right word.',
      'Story Fit: pick the option that best matches the scene.',
    ],
    listening_audio_first: [
      'Vocab Audio Drill: hear the word and choose the meaning.',
      'Listening Recognition: identify the vocab from spoken form.',
    ],
    listening_prompt_first: [
      'Word-Sound Pair: see the word and confirm its pronunciation.',
      'Audio Reinforcement: connect reading to meaning through sound.',
    ],
  },
  grammar_patterns: {
    romaji_sprint: [
      'Pattern Read: confirm reading and type with confidence.',
      'Structure Sound: hear the phrase in your head, then type.',
    ],
    meaning_match: [
      'Grammar Sense: choose the best function or meaning.',
      'Pattern Intent: decide what nuance this structure carries.',
    ],
    character_match: [
      'Pattern Form: select the Japanese pattern for this intent.',
      'Structure Recall: pick the exact expression form.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Pattern Recall: type the intended meaning in your own words.',
      'Grammar Recall: type what this expression conveys.',
    ],
    speech_recall: [
      'Voice Recall: say the intended meaning in your own words.',
      'Spoken Pattern: say aloud what this expression conveys.',
    ],
    particle_cloze: [
      'Sentence Pattern: complete the line with the right structure.',
      'Grammar in Context: infer role and choose the best fit.',
    ],
    imposter: [
      'Dialogue Scene: choose the pattern that fits the exchange.',
      'Conversational Fit: select the structure that sounds natural.',
    ],
    listening_audio_first: [
      'Pattern Audio: hear the expression and choose its meaning.',
      'Grammar Ear: recognise patterns by sound before selecting.',
    ],
    listening_prompt_first: [
      'Pattern Sound Link: see the grammar point while hearing it.',
      'Audio Anchor: connect the written form to spoken usage.',
    ],
  },
  sentence_examples: {
    romaji_sprint: [
      'Sentence Read: commit to the reading flow before typing.',
      'Phrase Rhythm: keep sentence cadence while you answer.',
    ],
    meaning_match: [
      'Sentence Meaning: choose the translation that fits best.',
      'Context Precision: pick the meaning that matches full context.',
    ],
    character_match: [
      'Sentence Form: choose the Japanese line that matches the meaning.',
      'Expression Recall: select the most natural sentence form.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Sentence Recall: type the meaning from memory in your own words.',
      'Full-Line Recall: capture the sentence intent clearly.',
    ],
    speech_recall: [
      'Voice Recall: say the sentence meaning clearly and naturally.',
      'Spoken Intent: speak the core meaning in one go.',
    ],
    particle_cloze: [
      'Sentence Cloze: use surrounding context to fill the missing part.',
      'Flow Completion: choose what makes the line sound natural.',
    ],
    imposter: [
      'Scene Sentence: pick the line that fits the moment.',
      'Story Context: complete the exchange with natural phrasing.',
    ],
    listening_audio_first: [
      'Sentence Audio: hear the sentence and choose its meaning.',
      'Ear-First Context: decode the line by sound before selecting.',
    ],
    listening_prompt_first: [
      'Read + Listen: reinforce sentence form with pronunciation.',
      'Audio Anchor: connect sentence text to spoken rhythm.',
    ],
  },
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        reject(new Error('Failed to read image file.'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unsupported image format.'))
    image.src = dataUrl
  })
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid image data. Please try another file.')
  }
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2],
  }
}

async function prepareAssistantChatImagePayload(file: File): Promise<{
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  imageBase64: string
}> {
  const originalDataUrl = await fileToDataUrl(file)
  const originalParsed = parseDataUrl(originalDataUrl)
  const acceptedMime = new Set(['image/png', 'image/jpeg', 'image/webp'])

  const sourceImage = await loadImageElement(originalDataUrl)
  const maxSide = Math.max(sourceImage.width, sourceImage.height, 1)
  const scale = Math.min(1, ASSISTANT_CHAT_IMAGE_MAX_DIMENSION / maxSide)
  const targetWidth = Math.max(1, Math.round(sourceImage.width * scale))
  const targetHeight = Math.max(1, Math.round(sourceImage.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Image processing is unavailable in this environment.')
  }
  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)

  const compressedDataUrl = canvas.toDataURL('image/jpeg', ASSISTANT_CHAT_IMAGE_JPEG_QUALITY)
  const compressedParsed = parseDataUrl(compressedDataUrl)

  const useOriginal = acceptedMime.has(originalParsed.mimeType) && originalParsed.base64.length <= compressedParsed.base64.length
  if (useOriginal) {
    return {
      mimeType: originalParsed.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
      imageBase64: originalParsed.base64,
    }
  }

  return {
    mimeType: 'image/jpeg',
    imageBase64: compressedParsed.base64,
  }
}
const TAG_PROMPT_PACKS: Record<string, string[]> = {
  hiragana: [
    'Foundations First: this kana appears everywhere.',
    'Core Sound Check: nail the basic reading under pressure.',
  ],
  katakana: [
    'Borrowed Word Alert: think modern usage before answering.',
    'Foreign Sound Trace: map the pronunciation to script.',
  ],
  kanji: [
    'Component Clue: use radicals to guide your choice.',
    'Stroke Memory: visualize the character skeleton first.',
  ],
  n5: [
    'JLPT N5 Pulse: treat this like a fast exam checkpoint.',
    'N5 Accuracy Push: prioritize correctness over speed.',
  ],
}
const CLOZE_TEMPLATES: Record<ScriptKey, Record<number, string[]>> = {
  hiragana: {
    1: [
      'The kana {character} is read as ___.',
      'When I see {character}, I write ___.',
    ],
    2: [
      'During reading practice, {character} maps to ___.',
      'I recognised {character} and filled in ___.',
    ],
    3: [
      'Under pressure, {character} still means ___.',
      'In a mixed drill, {character} came up and I chose ___.',
    ],
  },
  katakana: {
    1: [
      'The katakana {character} is read as ___.',
      'For {character}, the reading is ___.',
    ],
    2: [
      'In a loanword context, {character} maps to ___.',
      'I came across {character} in a sentence and filled in ___.',
    ],
    3: [
      'Even at speed, {character} still points to ___.',
      'In a complex sentence, {character} still means ___.',
    ],
  },
  kanji_n5: {
    1: [
      'The kanji {character} is best understood as ___.',
      'In simple text, {character} fits as ___.',
    ],
    2: [
      'Based on the context, {character} means ___.',
      'With one clue missing, {character} fills the gap as ___.',
    ],
    3: [
      'Even in a subtle context, {character} links to ___.',
      'In a compressed phrase, {character} is best read as ___.',
    ],
  },
  vocab_n5: {
    1: [
      'The word {character} means ___.',
      'For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'In this sentence, {character} contributes ___.',
      'From the context clues, {character} means ___.',
    ],
    3: [
      'Even in a subtle context, {character} means ___.',
      'Under pressure, {character} is still ___.',
    ],
  },
  grammar_patterns: {
    1: [
      'The pattern {character} is used for ___.',
      'For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'This exchange uses {character} to express ___.',
      'The grammar pattern {character} signals ___.',
    ],
    3: [
      'In nuanced dialogue, {character} still conveys ___.',
      'The most natural reading of {character} here is ___.',
    ],
  },
  sentence_examples: {
    1: [
      'The sentence {character} most naturally means ___.',
      'For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'From context, {character} expresses ___.',
      'In this exchange, {character} is best read as ___.',
    ],
    3: [
      'In nuanced context, {character} still conveys ___.',
      'Under pressure, the most natural meaning of {character} is ___.',
    ],
  },
}

const STORY_CHAPTERS: Record<ScriptKey, Record<1 | 2 | 3, { title: string; lines: string[] }>> = {
  hiragana: {
    1: {
      title: 'Chapter 1: Station Arrival',
      lines: [
        'At the station gate, the sign glows and the missing clue is ___.',
        'A classmate waves from platform two, so the right word is ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Market Errand',
      lines: [
        'At a busy market stand, the sentence only makes sense with ___.',
        'The vendor repeats one key term, and the best fit is ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Festival Night',
      lines: [
        'Lanterns rise over the street, and the final missing meaning is ___.',
        'In the closing scene, one precise word completes the line: ___.',
      ],
    },
  },
  katakana: {
    1: {
      title: 'Chapter 1: City Signs',
      lines: [
        'Neon signs flash loanwords, and the missing concept is ___.',
        'A cafe menu uses katakana terms; the strongest fit is ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Train Transfer',
      lines: [
        'Platform announcements blend borrowed words; fill the blank with ___.',
        'A route map label points to one clear meaning: ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Live Concert',
      lines: [
        'Backstage chatter is fast, but the context still signals ___.',
        'The encore banner uses a key katakana term; choose ___.',
      ],
    },
  },
  kanji_n5: {
    1: {
      title: 'Chapter 1: Morning Routine',
      lines: [
        'A short diary line is missing one core idea: ___.',
        'The morning schedule sentence is complete only with ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Office Tasks',
      lines: [
        'A memo on the desk has one missing concept: ___.',
        'The task list reads naturally when the blank is ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Travel Plan',
      lines: [
        'A ticket note uses {character}, so the missing meaning is ___.',
        'In the final itinerary line, {character} means ___.',
      ],
    },
  },
  vocab_n5: {
    1: {
      title: 'Chapter 1: First Conversation',
      lines: [
        'At introductions, the word {character} completes this line as ___.',
        'In this beginner exchange, {character} fills the blank as ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Daily Routine',
      lines: [
        'In a daily routine scene, {character} fits the blank as ___.',
        'The routine sentence sounds natural only if {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Weekend Plans',
      lines: [
        'Planning with friends uses {character}; choose ___ to complete it.',
        'In this weekend scene, {character} means ___.',
      ],
    },
  },
  grammar_patterns: {
    1: {
      title: 'Chapter 1: Polite Basics',
      lines: [
        'A polite reply uses {character}, so the blank should be ___.',
        'This polite scene hinges on {character}; pick ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Requests and Reasons',
      lines: [
        'A request sentence uses {character} to express ___ here.',
        'The reason-giving line sounds right when {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Natural Conversation',
      lines: [
        'In natural dialogue, {character} conveys ___ in this scene.',
        'In the final exchange, {character} carries the meaning ___.',
      ],
    },
  },
  sentence_examples: {
    1: {
      title: 'Chapter 1: Daily Exchange',
      lines: [
        'A casual line is missing one idea; {character} means ___.',
        'In this daily scene, {character} is best read as ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Practical Situation',
      lines: [
        'Context clues point to one meaning for {character}: ___.',
        'This practical sentence sounds natural only if {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Nuanced Conversation',
      lines: [
        'In a nuanced exchange, {character} conveys ___.',
        'The strongest interpretation of {character} in this scene is ___.',
      ],
    },
  },
}

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
  voiceEnabled: boolean
  voiceSpeaker: string
  ambientAudioEnabled: boolean
}

interface VoiceSynthesisMeta {
  mode: 'single' | 'mixed_stitched'
  profile: 'main' | 'jp' | 'en'
  mixedSegmentCount: number
  streamingAttempted: boolean
  streamingFallbackUsed: boolean
  elapsedMs: number
}

interface SpeechSegment {
  text: string
  language: 'ja' | 'en'
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

const SCRIPT_LABELS: Record<ScriptKey, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
  vocab_n5: 'Vocabulary',
  grammar_patterns: 'Grammar',
  sentence_examples: 'Sentences',
}

const MINIGAMES: Array<{ key: MinigameKey; title: string; description: string }> = [
  {
    key: 'romaji_sprint',
    title: 'Romaji Sprint',
    description: 'Type the romaji reading as quickly as you can.',
  },
  {
    key: 'meaning_match',
    title: 'Meaning Match',
    description: 'Pick the correct meaning from four choices.',
  },
  {
    key: 'character_match',
    title: 'Character Match',
    description: 'Pick the correct character for the meaning.',
  },
  {
    key: 'stroke_order',
    title: 'Stroke Order',
    description: 'Type the kanji from meaning while reinforcing writing sequence.',
  },
  {
    key: 'typed_recall',
    title: 'Typed Recall',
    description: 'Type the meaning directly with near-miss tolerance.',
  },
  {
    key: 'speech_recall',
    title: 'Speech Recall',
    description: 'Say the meaning aloud — transcribed and graded offline.',
  },
  {
    key: 'sentence_assembly',
    title: 'Sentence Assembly',
    description: 'Arrange shuffled sentence chunks into natural Japanese order.',
  },
  {
    key: 'particle_cloze',
    title: 'Particle Cloze',
    description: 'Fill the missing particle using sentence context and word order cues.',
  },
  {
    key: 'vibe_check',
    title: 'Vibe Check',
    description: 'Read social tone and pick the best context for the sentence register.',
  },
  {
    key: 'imposter',
    title: 'Imposter',
    description: 'Find the token with a deliberate grammar error in a sentence.',
  },
  {
    key: 'listening_audio_first',
    title: 'Listening: Audio First',
    description: 'Hear a word and choose its meaning — character hidden until feedback.',
  },
  {
    key: 'listening_prompt_first',
    title: 'Listening: Prompt First',
    description: 'See the character while audio plays, then choose the meaning.',
  },
  {
    key: 'interleave_mix',
    title: 'Interleave Mix',
    description: 'Cycle reading, meaning, and character rounds in one run.',
  },
]

const SCRIPT_MINIGAMES: Record<ScriptKey, MinigameKey[]> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match', 'sentence_assembly', 'particle_cloze', 'imposter', 'speech_recall', 'listening_audio_first', 'listening_prompt_first', 'interleave_mix'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match', 'sentence_assembly', 'particle_cloze', 'imposter', 'speech_recall', 'listening_audio_first', 'listening_prompt_first', 'interleave_mix'],
  kanji_n5: ['romaji_sprint', 'meaning_match', 'character_match', 'stroke_order', 'typed_recall', 'speech_recall', 'sentence_assembly', 'particle_cloze', 'imposter', 'listening_audio_first', 'listening_prompt_first', 'interleave_mix'],
  vocab_n5: ['meaning_match', 'character_match', 'typed_recall', 'speech_recall', 'particle_cloze', 'imposter', 'listening_audio_first', 'listening_prompt_first', 'interleave_mix'],
  grammar_patterns: ['meaning_match', 'character_match', 'typed_recall', 'speech_recall', 'sentence_assembly', 'particle_cloze', 'vibe_check', 'imposter', 'listening_audio_first', 'listening_prompt_first', 'interleave_mix'],
  sentence_examples: ['meaning_match', 'character_match', 'typed_recall', 'speech_recall', 'sentence_assembly', 'imposter', 'listening_audio_first', 'listening_prompt_first', 'interleave_mix'],
}

const SCRIPT_INTERLEAVE_MODES: Record<ScriptKey, Array<keyof InterleaveWeights>> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match'],
  kanji_n5: ['romaji_sprint', 'meaning_match', 'character_match'],
  vocab_n5: ['meaning_match', 'character_match', 'particle_cloze'],
  grammar_patterns: ['meaning_match', 'character_match', 'particle_cloze'],
  sentence_examples: ['meaning_match', 'character_match', 'particle_cloze'],
}

const SECTION_META: Record<ScriptKey, { glyph: string }> = {
  hiragana: { glyph: 'あ' },
  katakana: { glyph: 'ア' },
  kanji_n5: { glyph: '漢' },
  vocab_n5: { glyph: '語' },
  grammar_patterns: { glyph: '話' },
  sentence_examples: { glyph: '文' },
}

const MINIGAME_ICONS: Record<MinigameKey, LucideIcon> = {
  romaji_sprint: Keyboard,
  meaning_match: ListChecks,
  character_match: Languages,
  stroke_order: Keyboard,
  typed_recall: Keyboard,
  speech_recall: Mic,
  sentence_assembly: Shuffle,
  particle_cloze: BookText,
  vibe_check: MessageCircle,
  imposter: History,
  listening_audio_first: Volume2,
  listening_prompt_first: Volume2,
  interleave_mix: Shuffle,
}

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

const THEME_OPTIONS: Array<{ key: ThemeKey; label: string; mode: ThemeMode }> = [
  { key: 'lofi_dusk', label: 'Lofi Dusk', mode: 'dark' },
  { key: 'harbor_mist', label: 'Harbor Mist', mode: 'dark' },
  { key: 'sakura_dawn', label: 'Sakura Dawn', mode: 'dark' },
  { key: 'forest_ink', label: 'Forest Ink', mode: 'dark' },
  { key: 'sunset_lacquer', label: 'Sunset Lacquer', mode: 'dark' },
  { key: 'midnight_neon', label: 'Midnight Neon', mode: 'dark' },
  { key: 'paper_crane', label: 'Paper Crane', mode: 'dark' },
  { key: 'matcha_stone', label: 'Matcha Stone', mode: 'dark' },
  { key: 'ocean_glass', label: 'Ocean Glass', mode: 'dark' },
  { key: 'ember_night', label: 'Ember Night', mode: 'dark' },
  { key: 'plum_garden', label: 'Plum Garden', mode: 'dark' },
  { key: 'lofi_dusk_light', label: 'Lofi Dusk Light', mode: 'light' },
  { key: 'harbor_mist_light', label: 'Harbor Mist Light', mode: 'light' },
  { key: 'sakura_dawn_light', label: 'Sakura Dawn Light', mode: 'light' },
  { key: 'sunset_lacquer_light', label: 'Sunset Lacquer Light', mode: 'light' },
  { key: 'midnight_neon_light', label: 'Midnight Neon Light', mode: 'light' },
  { key: 'paper_crane_light', label: 'Paper Crane Light', mode: 'light' },
  { key: 'ember_night_light', label: 'Ember Night Light', mode: 'light' },
  { key: 'forest_ink_light', label: 'Forest Ink Light', mode: 'light' },
  { key: 'ocean_glass_light', label: 'Ocean Glass Light', mode: 'light' },
  { key: 'plum_garden_light', label: 'Plum Garden Light', mode: 'light' },
  { key: 'matcha_stone_light', label: 'Matcha Stone Light', mode: 'light' },
]

const THEME_MODE_SECTIONS: Array<{ key: ThemeMode; label: string }> = [
  { key: 'dark', label: 'Dark Mode' },
  { key: 'light', label: 'Light Mode' },
]

const DEFAULT_THEME_BY_MODE: Record<ThemeMode, ThemeKey> = {
  dark: 'lofi_dusk',
  light: 'lofi_dusk_light',
}

const THEME_MODE_ICON: Record<ThemeMode, LucideIcon> = {
  dark: Moon,
  light: Sun,
}

const THEME_SWATCH_ACCENT: Record<ThemeKey, string> = {
  lofi_dusk: '#b07a5c',
  harbor_mist: '#7bc5df',
  sakura_dawn: '#ffb1bf',
  forest_ink: '#89d0a4',
  sunset_lacquer: '#ffab73',
  midnight_neon: '#79d5ff',
  paper_crane: '#d4a57d',
  matcha_stone: '#b6d387',
  ocean_glass: '#7ed4d0',
  ember_night: '#ff9a6a',
  plum_garden: '#c89cff',
  lofi_dusk_light: '#b07a5c',
  harbor_mist_light: '#69abc4',
  sakura_dawn_light: '#e48ea2',
  sunset_lacquer_light: '#dd8c62',
  midnight_neon_light: '#66a8d6',
  paper_crane_light: '#b8906d',
  ember_night_light: '#d8836f',
  forest_ink_light: '#74b591',
  ocean_glass_light: '#63b9b3',
  plum_garden_light: '#ae86e6',
  matcha_stone_light: '#9fbf70',
}

const THEME_KEY_SET = new Set<ThemeKey>(THEME_OPTIONS.map((theme) => theme.key))
const THEME_VARIABLE_KEYS: ThemeVariableKey[] = [
  '--bg-main',
  '--bg-subtle',
  '--text-main',
  '--text-soft',
  '--accent',
  '--accent-soft',
  '--accent-ink',
  '--blob-left',
  '--blob-right',
  '--blob-top',
  '--panel-bg',
  '--panel-bg-alt',
  '--panel-border',
  '--panel-shadow',
  '--tile-bg',
  '--tile-border',
  '--chip-bg',
  '--chip-border',
  '--button-border',
  '--button-bg-top',
  '--button-bg-bottom',
  '--card-border',
  '--card-bg-top',
  '--card-bg-bottom',
  '--track-bg',
  '--xp-shell-border',
  '--xp-shell-bg',
  '--xp-badge-bg',
  '--xp-badge-text',
  '--xp-badge-ring',
  '--xp-badge-glow',
  '--xp-track-bg',
  '--xp-fill-start',
  '--xp-fill-end',
  '--xp-label',
  '--streak-shell-border',
  '--streak-shell-bg',
  '--streak-shell-text',
  '--streak-icon',
  '--streak-popover-border',
  '--streak-popover-glow',
  '--streak-popover-title',
  '--streak-divider',
  '--status-error',
  '--tone-teal',
  '--tone-ocean',
  '--tone-amber',
  '--tone-rose',
]

const THEME_SECTION_DEFINITIONS: ThemeSection[] = [
  {
    id: 'surfaces',
    label: 'Background and Surfaces',
    description: 'Main app background and panel surfaces used across cards and chips.',
    keys: ['--bg-main', '--bg-subtle', '--panel-bg', '--panel-bg-alt', '--tile-bg', '--chip-bg', '--track-bg'],
  },
  {
    id: 'text',
    label: 'Text and Readability',
    description: 'Primary text, secondary text, and accent ink for readable contrast.',
    keys: ['--text-main', '--text-soft', '--accent-ink'],
  },
  {
    id: 'accents',
    label: 'Accent Glow and Highlights',
    description: 'Accent colors and ambient gradient glows used for emphasis.',
    keys: ['--accent', '--accent-soft', '--blob-left', '--blob-right', '--blob-top'],
  },
  {
    id: 'borders',
    label: 'Borders and Depth Effects',
    description: 'Panel borders and shadow depth that define component edges.',
    keys: ['--panel-border', '--tile-border', '--chip-border', '--button-border', '--card-border', '--panel-shadow'],
  },
  {
    id: 'components',
    label: 'Buttons and Cards',
    description: 'Button and card gradient colors plus error feedback color.',
    keys: ['--button-bg-top', '--button-bg-bottom', '--card-bg-top', '--card-bg-bottom', '--status-error'],
  },
  {
    id: 'xp',
    label: 'XP Bar',
    description: 'Colors used by the home and titlebar XP indicators.',
    keys: ['--xp-shell-border', '--xp-shell-bg', '--xp-badge-bg', '--xp-badge-text', '--xp-badge-ring', '--xp-badge-glow', '--xp-track-bg', '--xp-fill-start', '--xp-fill-end', '--xp-label'],
  },
  {
    id: 'streak',
    label: 'Streak Chip',
    description: 'Colors used by the titlebar streak chip and its details popover.',
    keys: ['--streak-shell-border', '--streak-shell-bg', '--streak-shell-text', '--streak-icon', '--streak-popover-border', '--streak-popover-glow', '--streak-popover-title', '--streak-divider'],
  },
  {
    id: 'tones',
    label: 'Status and Utility Tones',
    description: 'Reusable teal, ocean, amber, and rose semantic tones.',
    keys: ['--tone-teal', '--tone-ocean', '--tone-amber', '--tone-rose'],
  },
]

const THEME_VARIABLE_SET = new Set<ThemeVariableKey>(THEME_VARIABLE_KEYS)
const THEME_VARIABLE_DISPLAY: Record<ThemeVariableKey, { label: string; description: string }> = {
  '--bg-main': {
    label: 'Main Background',
    description: 'The primary app background color.',
  },
  '--bg-subtle': {
    label: 'Secondary Background',
    description: 'The softer background layer used in gradients.',
  },
  '--text-main': {
    label: 'Main Text',
    description: 'The default text color for most content.',
  },
  '--text-soft': {
    label: 'Muted Text',
    description: 'Used for hints, labels, and less important text.',
  },
  '--accent': {
    label: 'Primary Accent',
    description: 'Main highlight color for active elements.',
  },
  '--accent-soft': {
    label: 'Soft Accent',
    description: 'A softer accent tone used in glow and gradients.',
  },
  '--accent-ink': {
    label: 'Accent Text',
    description: 'Text color used on accent-heavy backgrounds.',
  },
  '--blob-left': {
    label: 'Left Glow',
    description: 'Decorative ambient glow color on the left side.',
  },
  '--blob-right': {
    label: 'Right Glow',
    description: 'Decorative ambient glow color on the right side.',
  },
  '--blob-top': {
    label: 'Top Glow',
    description: 'Decorative ambient glow color near the top.',
  },
  '--panel-bg': {
    label: 'Main Panel Background',
    description: 'Background color for larger UI panels.',
  },
  '--panel-bg-alt': {
    label: 'Secondary Panel Background',
    description: 'Alternate panel/card surface background.',
  },
  '--panel-border': {
    label: 'Panel Border',
    description: 'Border color around panel containers.',
  },
  '--panel-shadow': {
    label: 'Panel Shadow',
    description: 'Shadow style for elevated panel depth.',
  },
  '--tile-bg': {
    label: 'Tile Background',
    description: 'Background for small metric or snapshot tiles.',
  },
  '--tile-border': {
    label: 'Tile Border',
    description: 'Border color for small tiles.',
  },
  '--chip-bg': {
    label: 'Tag Background',
    description: 'Background color for chip/tag elements.',
  },
  '--chip-border': {
    label: 'Tag Border',
    description: 'Border color for chip/tag elements.',
  },
  '--button-border': {
    label: 'Button Border',
    description: 'Border color around buttons.',
  },
  '--button-bg-top': {
    label: 'Button Gradient Top',
    description: 'Top color of button gradient fill.',
  },
  '--button-bg-bottom': {
    label: 'Button Gradient Bottom',
    description: 'Bottom color of button gradient fill.',
  },
  '--card-border': {
    label: 'Card Border',
    description: 'Border color around card elements.',
  },
  '--card-bg-top': {
    label: 'Card Gradient Top',
    description: 'Top color of card gradient fill.',
  },
  '--card-bg-bottom': {
    label: 'Card Gradient Bottom',
    description: 'Bottom color of card gradient fill.',
  },
  '--track-bg': {
    label: 'Track Background',
    description: 'Background for progress and slider tracks.',
  },
  '--xp-shell-border': {
    label: 'XP Shell Border',
    description: 'Border color around XP bar shells.',
  },
  '--xp-shell-bg': {
    label: 'XP Shell Background',
    description: 'Background behind the XP bar shell.',
  },
  '--xp-badge-bg': {
    label: 'XP Badge Background',
    description: 'Background color of the circular XP level badge.',
  },
  '--xp-badge-text': {
    label: 'XP Badge Text',
    description: 'Text color shown inside the XP level badge.',
  },
  '--xp-badge-ring': {
    label: 'XP Badge Ring',
    description: 'Ring color around the XP level badge for emphasis.',
  },
  '--xp-badge-glow': {
    label: 'XP Badge Glow',
    description: 'Glow color behind the XP level badge.',
  },
  '--xp-track-bg': {
    label: 'XP Track Background',
    description: 'Background color of the XP progress track.',
  },
  '--xp-fill-start': {
    label: 'XP Fill Gradient Start',
    description: 'Starting color of the XP fill gradient.',
  },
  '--xp-fill-end': {
    label: 'XP Fill Gradient End',
    description: 'Ending color of the XP fill gradient.',
  },
  '--xp-label': {
    label: 'XP Label Text',
    description: 'Text color used by XP percentage and value labels.',
  },
  '--streak-shell-border': {
    label: 'Streak Chip Border',
    description: 'Border color around the streak chip button.',
  },
  '--streak-shell-bg': {
    label: 'Streak Chip Background',
    description: 'Background color of the streak chip button.',
  },
  '--streak-shell-text': {
    label: 'Streak Chip Text',
    description: 'Text color of the streak chip value.',
  },
  '--streak-icon': {
    label: 'Streak Icon Color',
    description: 'Color used by the streak flame icon.',
  },
  '--streak-popover-border': {
    label: 'Streak Popover Border',
    description: 'Border color around the streak details popover.',
  },
  '--streak-popover-glow': {
    label: 'Streak Popover Glow',
    description: 'Glow color used in the streak details popover background.',
  },
  '--streak-popover-title': {
    label: 'Streak Popover Title',
    description: 'Title color in the streak details popover.',
  },
  '--streak-divider': {
    label: 'Streak Divider',
    description: 'Divider color for streak popover helper text.',
  },
  '--status-error': {
    label: 'Error Color',
    description: 'Used for errors and critical feedback.',
  },
  '--tone-teal': {
    label: 'Teal Utility Tone',
    description: 'Reusable teal tone for UI accents.',
  },
  '--tone-ocean': {
    label: 'Ocean Utility Tone',
    description: 'Reusable blue tone for UI accents.',
  },
  '--tone-amber': {
    label: 'Amber Utility Tone',
    description: 'Reusable warm warning/support tone.',
  },
  '--tone-rose': {
    label: 'Rose Utility Tone',
    description: 'Reusable rose tone for warnings and emphasis.',
  },
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

function isThemeScope(value: unknown): value is ThemeScope {
  return value === 'preset' || value === 'custom'
}

function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && THEME_KEY_SET.has(value as ThemeKey)
}

function isThemeVariableKey(value: unknown): value is ThemeVariableKey {
  return typeof value === 'string' && THEME_VARIABLE_SET.has(value as ThemeVariableKey)
}

function getThemeModeForTheme(theme: ThemeKey): ThemeMode {
  const themeOption = THEME_OPTIONS.find((option) => option.key === theme)
  return themeOption?.mode ?? 'dark'
}

function getThemeVariantForMode(theme: ThemeKey, mode: ThemeMode): ThemeKey {
  if (getThemeModeForTheme(theme) === mode) {
    return theme
  }

  const candidate = mode === 'light'
    ? `${theme}_light`
    : theme.replace(/_light$/, '')
  return isThemeKey(candidate) ? candidate : getFallbackThemeForMode(mode)
}

function getFallbackThemeForMode(mode: ThemeMode): ThemeKey {
  const firstTheme = THEME_OPTIONS.find((theme) => theme.mode === mode)
  return firstTheme?.key ?? DEFAULT_THEME_BY_MODE.dark
}

function createThemePalette(root: HTMLElement): ThemePalette {
  const style = getComputedStyle(root)
  const palette = {} as ThemePalette
  for (const key of THEME_VARIABLE_KEYS) {
    palette[key] = style.getPropertyValue(key).trim()
  }
  return palette
}

function readThemePalette(theme: ThemeKey): ThemePalette | null {
  if (typeof document === 'undefined') {
    return null
  }

  const root = document.documentElement
  const previousMode = root.dataset.themeMode
  const previousTheme = root.dataset.theme
  const previousInline = new Map<ThemeVariableKey, string>()

  for (const key of THEME_VARIABLE_KEYS) {
    previousInline.set(key, root.style.getPropertyValue(key))
    root.style.removeProperty(key)
  }

  root.dataset.themeMode = getThemeModeForTheme(theme)
  root.dataset.theme = theme
  const palette = createThemePalette(root)

  if (previousMode) {
    root.dataset.themeMode = previousMode
  } else {
    delete root.dataset.themeMode
  }

  if (previousTheme) {
    root.dataset.theme = previousTheme
  } else {
    delete root.dataset.theme
  }

  for (const key of THEME_VARIABLE_KEYS) {
    const inlineValue = previousInline.get(key) ?? ''
    if (inlineValue) {
      root.style.setProperty(key, inlineValue)
    } else {
      root.style.removeProperty(key)
    }
  }

  return palette
}

function normalizeThemeOverrides(value: unknown): ThemeVariableOverrides {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const normalized: ThemeVariableOverrides = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isThemeVariableKey(key) || typeof raw !== 'string') {
      continue
    }
    const trimmed = raw.trim()
    if (!trimmed) {
      continue
    }
    normalized[key] = trimmed
  }
  return normalized
}

function normalizeCustomTheme(value: unknown): CustomTheme | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<CustomTheme>
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    return null
  }

  const baseByMode = candidate.baseThemeByMode
  const darkBase = isThemeKey(baseByMode?.dark) ? baseByMode.dark : DEFAULT_THEME_BY_MODE.dark
  const lightBase = isThemeKey(baseByMode?.light) ? baseByMode.light : DEFAULT_THEME_BY_MODE.light

  const overrides = candidate.overridesByMode
  return {
    id: candidate.id,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : 'Custom Theme',
    baseThemeByMode: {
      dark: getThemeVariantForMode(darkBase, 'dark'),
      light: getThemeVariantForMode(lightBase, 'light'),
    },
    overridesByMode: {
      dark: normalizeThemeOverrides(overrides?.dark),
      light: normalizeThemeOverrides(overrides?.light),
    },
  }
}

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

const BACKGROUND_BLUR_MIN = 0
const BACKGROUND_BLUR_MAX = 12
const BACKGROUND_BLUR_DEFAULT = 4
const CUSTOM_BACKGROUND_MAX_BYTES = 15 * 1024 * 1024
const CUSTOM_BACKGROUND_MAX_EDGE = 2200
const CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH = 6_500_000

const BACKGROUND_OPTIONS: Array<{
  key: BackgroundStyle
  label: string
  note: string
  imagePath?: string
}> = [
  {
    key: 'classic_scene',
    label: 'No Background',
    note: 'Uses a neutral app background with no image overlay.',
  },
  {
    key: 'fuji_view',
    label: 'Fuji Outlook',
    note: 'Pagoda and mountain skyline.',
    imagePath: 'backgrounds/fuji.jpg',
  },
  {
    key: 'torii_gate',
    label: 'Water Torii',
    note: 'Floating torii at dusk on calm water.',
    imagePath: 'backgrounds/torii.jpg',
  },
  {
    key: 'temple_reflection',
    label: 'Temple Reflection',
    note: 'Temple architecture mirrored in still water.',
    imagePath: 'backgrounds/house.jpg',
  },
  {
    key: 'garden_bridge',
    label: 'Garden Bridge',
    note: 'Red bridge across deep green garden water.',
    imagePath: 'backgrounds/bridge.jpg',
  },
  {
    key: 'autumn_pond',
    label: 'Autumn Pond',
    note: 'Warm maple tones and morning light rays.',
    imagePath: 'backgrounds/lake.jpg',
  },
  {
    key: 'custom_upload',
    label: 'Custom Image',
    note: 'Use your own image from device storage.',
  },
]

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

function MinigameIcon({ game }: { game: MinigameKey }) {
  const Icon = MINIGAME_ICONS[game]
  return <Icon aria-hidden="true" className="glyph-svg" strokeWidth={2.25} />
}

const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'
const SETTINGS_STORAGE_KEY = 'jplearn-desktop-settings-v1'
const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'
const SUMMARY_SNAPSHOT_STORAGE_KEY = 'jplearn-desktop-summary-snapshot-v1'
const SUMMARY_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000
const CARD_MASTERY_MAX = 4 // Max score per card; reach this to fully master a card.

const FIXED_JAPANESE_VOICE_OPTIONS: VoiceOptionEntry[] = [
  { id: 'zundamon_normal', name: 'Zundamon', jp: 'ずんだもん', search: 'zundamon normal' },
  { id: 'shikoku_metan_normal', name: 'Shikoku Metan', jp: '四国めたん', search: 'shikoku metan normal' },
  { id: 'kasukabe_tsumugi_normal', name: 'Kasukabe Tsumugi', jp: '春日部つむぎ', search: 'kasukabe tsumugi normal' },
  { id: 'namine_ritsu_normal', name: 'Namine Ritsu', jp: '波音リツ', search: 'namine ritsu normal' },
  { id: 'genno_takehiro_normal', name: 'Genno Takehiro', jp: '玄野武宏', search: 'genno takehiro normal' },
  { id: 'shirakami_kotaro_normal', name: 'Shirakami Kotaro', jp: '白上虎太郎', search: 'shirakami kotaro normal' },
  { id: 'meimei_himari_normal', name: 'Meimei Himari', jp: '冥鳴ひまり', search: 'meimei himari normal' },
  { id: 'kyushu_sora_normal', name: 'Kyushu Sora', jp: '九州そら', search: 'kyushu sora normal' },
]
const DEFAULT_VOICE_SPEAKER = FIXED_JAPANESE_VOICE_OPTIONS[0].id
const VOICE_SAMPLE_LINE = 'こんにちは。いっしょにがんばりましょう。'
type VoiceOptionEntry = { id: string; name: string; jp: string; search: string }

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
      listening_prompt_first: { ...EMPTY_MINIGAME_STATS },
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
      listening_prompt_first: { ...EMPTY_MINIGAME_STATS },
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
      listening_prompt_first: { ...EMPTY_MINIGAME_STATS },
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
      listening_prompt_first: { ...EMPTY_MINIGAME_STATS },
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
      listening_prompt_first: { ...EMPTY_MINIGAME_STATS },
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
      listening_prompt_first: { ...EMPTY_MINIGAME_STATS },
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
    appFont: 'kiwi_maru',
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
    assistantToastLimit: ASSISTANT_MAX_TOASTS,
    assistantChatEnabled: true,
    assistantChatAudioEnabled: true,
    assistantChatOcrMinConfidence: 0.3,
    showKeyboardPrompts: false,
    voiceEnabled: true,
    voiceSpeaker: DEFAULT_VOICE_SPEAKER,
    ambientAudioEnabled: false,
  }
}

function splitSpeechSegments(text: string): SpeechSegment[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }
  const splitSentenceByLanguage = (sentence: string): SpeechSegment[] => {
    const tokens = sentence.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー々〆ヵヶ]+|[A-Za-z0-9][A-Za-z0-9'’-]*|[^A-Za-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? [sentence]
    const classifyToken = (token: string): 'ja' | 'en' | 'neutral' => {
      if (JAPANESE_CHAR_REGEX.test(token)) {
        return 'ja'
      }
      if (/[A-Za-z0-9]/.test(token)) {
        return 'en'
      }
      return 'neutral'
    }

    const classified = tokens.map((token) => ({ token, kind: classifyToken(token) }))
    const sentenceSegments: SpeechSegment[] = []

    const findNextConcreteLanguage = (startIndex: number): SpeechSegment['language'] | null => {
      for (let index = startIndex; index < classified.length; index += 1) {
        const kind = classified[index].kind
        if (kind !== 'neutral') {
          return kind
        }
      }
      return null
    }

    for (let index = 0; index < classified.length; index += 1) {
      const entry = classified[index]
      let language: SpeechSegment['language']
      if (entry.kind === 'neutral') {
        const previousLanguage = sentenceSegments[sentenceSegments.length - 1]?.language
        language = previousLanguage ?? findNextConcreteLanguage(index + 1) ?? 'en'
      } else {
        language = entry.kind
      }

      const previous = sentenceSegments[sentenceSegments.length - 1]
      if (previous && previous.language === language) {
        previous.text += entry.token
        continue
      }
      sentenceSegments.push({ text: entry.token, language })
    }

    return sentenceSegments
      .map((segment) => ({ ...segment, text: segment.text.trim() }))
      .filter((segment) => segment.text.length > 0)
  }

  const sentenceMatches = normalized.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) ?? [normalized]
  const segments: SpeechSegment[] = []
  for (const sentence of sentenceMatches) {
    const trimmed = sentence.trim()
    if (!trimmed) {
      continue
    }
    const sentenceSegments = splitSentenceByLanguage(trimmed)
    for (const sentenceSegment of sentenceSegments) {
      const previous = segments[segments.length - 1]
      if (previous && previous.language === sentenceSegment.language) {
        previous.text = `${previous.text} ${sentenceSegment.text}`.trim()
        continue
      }
      segments.push(sentenceSegment)
    }
  }
  return segments
}

function isAssistantToastLimit(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1
}

function isBackgroundStyle(value: unknown): value is BackgroundStyle {
  return (
    value === 'classic_scene' ||
    value === 'fuji_view' ||
    value === 'torii_gate' ||
    value === 'temple_reflection' ||
    value === 'garden_bridge' ||
    value === 'autumn_pond' ||
    value === 'custom_upload'
  )
}

function clampBackgroundBlur(value: number): number {
  return Math.max(BACKGROUND_BLUR_MIN, Math.min(BACKGROUND_BLUR_MAX, Math.round(value)))
}

function clampAssistantChatOcrMinConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.3
  }
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function resolveBackgroundImageUrl(imagePath: string): string {
  if (typeof window === 'undefined') return imagePath
  try {
    return new URL(imagePath, window.location.href).toString()
  } catch {
    return imagePath
  }
}

function createBackgroundPreviewDataUrl(source: HTMLImageElement, width: number, height: number): string | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const targetRatio = width / height
  const sourceRatio = sourceWidth / sourceHeight

  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = Math.round(sourceHeight * targetRatio)
    sx = Math.round((sourceWidth - sw) / 2)
  } else if (sourceRatio < targetRatio) {
    sh = Math.round(sourceWidth / targetRatio)
    sy = Math.round((sourceHeight - sh) / 2)
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)

  try {
    return canvas.toDataURL('image/webp', 0.72)
  } catch {
    return canvas.toDataURL('image/jpeg', 0.78)
  }
}

function normalizeCustomBackgroundDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized.startsWith('data:image/')) return null
  if (normalized.length > CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH) return null
  return normalized
}

function hasSupportedImageExtension(fileName: string): boolean {
  const normalizedName = fileName.trim().toLowerCase()
  return normalizedName.endsWith('.png')
    || normalizedName.endsWith('.jpg')
    || normalizedName.endsWith('.jpeg')
    || normalizedName.endsWith('.webp')
    || normalizedName.endsWith('.avif')
    || normalizedName.endsWith('.gif')
    || normalizedName.endsWith('.bmp')
}

function isSupportedBackgroundImageFile(file: File): boolean {
  const mimeType = (file.type || '').trim().toLowerCase()
  if (mimeType.startsWith('image/')) {
    return true
  }
  // Some Windows file pickers provide an empty MIME type for local files.
  return hasSupportedImageExtension(file.name)
}

async function optimizeBackgroundFileToDataUrl(file: File): Promise<string> {
  let bitmap: ImageBitmap | null = null
  let objectUrl: string | null = null

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas context unavailable.')
    }

    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file)
      } catch {
        bitmap = null
      }
    }

    if (bitmap) {
      const sourceWidth = bitmap.width
      const sourceHeight = bitmap.height
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Invalid image dimensions.')
      }

      const scale = Math.min(1, CUSTOM_BACKGROUND_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
      const width = Math.max(1, Math.round(sourceWidth * scale))
      const height = Math.max(1, Math.round(sourceHeight * scale))

      canvas.width = width
      canvas.height = height
      context.drawImage(bitmap, 0, 0, width, height)

      try {
        return canvas.toDataURL('image/webp', 0.8)
      } catch {
        return canvas.toDataURL('image/jpeg', 0.86)
      }
    }

    objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl

    try {
      await image.decode()
    } catch {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Unable to decode image file.'))
      })
    }

    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error('Invalid image dimensions.')
    }

    const scale = Math.min(1, CUSTOM_BACKGROUND_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    canvas.width = width
    canvas.height = height

    context.drawImage(image, 0, 0, width, height)

    try {
      return canvas.toDataURL('image/webp', 0.8)
    } catch {
      return canvas.toDataURL('image/jpeg', 0.86)
    }
  } finally {
    if (bitmap) {
      bitmap.close()
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
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
      voiceEnabled:
        typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : defaults.voiceEnabled,
      voiceSpeaker:
        typeof parsed.voiceSpeaker === 'string'
          && FIXED_JAPANESE_VOICE_OPTIONS.some((option) => option.id === parsed.voiceSpeaker)
          ? parsed.voiceSpeaker
          : defaults.voiceSpeaker,
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
  } else if (mode === 'listening_audio_first' || mode === 'listening_prompt_first') {
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

function formatAssistantEventTitle(event: AssistantEventPayload): string {
  if (event.event_type === 'session_goal_met') return 'You did it'
  if (event.event_type === 'streak_milestone') return 'Streak glow'
  if (event.event_type === 'leech_intervention') return 'Keep going'
  if (event.event_type === 'weakness_spike') return 'You are improving'
  if (event.event_type === 'curriculum_stall') return 'Progress takes time'
  if (event.event_type === 'activity_nudge') return 'Small steps count'
  if (event.event_type === 'session_recovery') return 'Fresh start'
  if (event.event_type === 'momentum_encouragement') return 'Nice momentum'
  return 'You are doing great'
}

function formatAssistantEventBody(event: AssistantEventPayload): string {
  if (event.message_key === 'coach.goal_met') {
    return 'Great focus. Keep that same calm pace on the next card.'
  }
  if (event.message_key === 'coach.streak_milestone') {
    const days = event.metadata.days ?? '0'
    return `${days}-day streak. Your consistency is paying off.`
  }
  if (event.message_key === 'coach.leech_intervention') {
    return 'Tough cards happen. You are still moving forward.'
  }
  if (event.message_key === 'coach.weakness_focus') {
    return 'This is a growth zone, not a setback. Keep practicing.'
  }
  if (event.message_key === 'coach.curriculum_stall') {
    return 'Learning curves are normal. Your next clean answer matters most.'
  }
  if (event.message_key === 'coach.activity_nudge') {
    return 'Even short sessions build real progress. Nice effort today.'
  }
  if (event.message_key === 'coach.session_recovery') {
    return 'New round, new chance. You have got this.'
  }
  if (event.message_key === 'coach.momentum_encouragement') {
    return 'You are in a good flow right now. Keep riding it.'
  }
  return 'Nice work showing up and practicing. Keep going.'
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
  if (mode === 'listening_audio_first') return 'Listening: Audio First'
  if (mode === 'listening_prompt_first') return 'Listening: Prompt First'
  return 'Interleave Mix'
}

function formatExpectedAnswer(rawAnswer: string): string {
  const compact = rawAnswer.trim().replace(/\s+/g, ' ')
  if (!compact) return rawAnswer

  const parts = compact
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length <= 1) return compact
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`

  return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`
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
  if (mode === 'listening_prompt_first') return 'Connect the sound to the character. It gets natural.'
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

function normalizeTrackTerms(text: string): string {
  return text
    .replace(/Vocabulary\s*N5/gi, 'Vocabulary (N5)')
    .replace(/Grammar\s*N5/gi, 'Grammar (N5)')
}

function inferScriptFromFocusArea(focusArea: string | null): ScriptKey | null {
  if (!focusArea) return null
  const normalized = focusArea.trim().toLowerCase()
  if (normalized === 'hiragana') return 'hiragana'
  if (normalized === 'katakana') return 'katakana'
  if (normalized.includes('kanji')) return 'kanji_n5'
  if (normalized.includes('vocab')) return 'vocab_n5'
  if (normalized.includes('grammar') || normalized.includes('conversational')) return 'grammar_patterns'
  return null
}

function makeCustomThemeId(seed = Date.now()): string {
  const randomPart = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return `custom_${seed.toString(36)}_${randomPart}`
}

function formatThemeVariableLabel(key: ThemeVariableKey): string {
  return THEME_VARIABLE_DISPLAY[key].label
}

function mergeThemePalette(base: ThemePalette, overrides: ThemeVariableOverrides): ThemePalette {
  const merged = { ...base }
  for (const key of THEME_VARIABLE_KEYS) {
    const overrideValue = overrides[key]
    if (overrideValue && overrideValue.trim()) {
      merged[key] = overrideValue.trim()
    }
  }
  return merged
}

function isColorLikeValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('#')
    || normalized.startsWith('rgb(')
    || normalized.startsWith('rgba(')
    || normalized.startsWith('hsl(')
    || normalized.startsWith('hsla(')
    || normalized.startsWith('oklch(')
    || normalized.startsWith('oklab(')
    || normalized.startsWith('color(')
}

function supportsColorPickerForKey(key: ThemeVariableKey): boolean {
  return key !== '--panel-shadow'
}

function getColorInputValue(value: string | undefined): string {
  const normalized = (value ?? '').trim()
  if (/^#[\da-f]{6}$/i.test(normalized)) {
    return normalized
  }
  if (/^#[\da-f]{3}$/i.test(normalized)) {
    const r = normalized[1]
    const g = normalized[2]
    const b = normalized[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#7bc5df'
}

function parseImportedCustomThemes(value: unknown): CustomTheme[] {
  const candidateThemes: unknown[] = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && Array.isArray((value as Partial<CustomThemeExportPayload>).themes)
      ? (value as Partial<CustomThemeExportPayload>).themes ?? []
      : [])

  return candidateThemes
    .map((item) => normalizeCustomTheme(item))
    .filter((item): item is CustomTheme => item !== null)
}

function makeCustomThemeExportPayload(themes: CustomTheme[]): CustomThemeExportPayload {
  return {
    version: 1,
    exportedAtUtc: new Date().toISOString(),
    themes,
  }
}

function sanitizeOcrTranslationText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const leadingBoilerplate = [
    /^\*{0,2}English Translation\*{0,2}:?\s*$/i,
    /^English:\s*Here's the translation and explanation:?\s*$/i,
    /^English:?\s*$/i,
    /^Here's the translation and explanation:?\s*$/i,
    /^Translation:?\s*$/i,
    /^Translated Text:?\s*$/i,
  ]

  const trailingBoilerplate = [
    /^notes?:?$/i,
    /^vocabulary notes?:?$/i,
    /^explanation:?$/i,
    /^clarification:?$/i,
    /^context:?$/i,
    /^literal translation:?$/i,
    /^alternative translation:?$/i,
    /^if you want/i,
    /^let me know/i,
  ]

  while (lines.length > 0) {
    const first = lines[0]?.trim() ?? ''
    if (!first) {
      lines.shift()
      continue
    }
    if (leadingBoilerplate.some((pattern) => pattern.test(first))) {
      lines.shift()
      continue
    }
    break
  }

  if (lines.length === 0) {
    return ''
  }

  lines[0] = (lines[0] ?? '')
    .replace(/^\*{0,2}English Translation\*{0,2}\s*:?\s*/i, '')
    .replace(/^English:\s*Here's the translation and explanation:?\s*/i, '')
    .replace(/^English:\s*/i, '')
    .replace(/^Here's the translation and explanation:?\s*/i, '')

  const cleanedLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && trailingBoilerplate.some((pattern) => pattern.test(trimmed))) {
      break
    }
    cleanedLines.push(line)
  }

  return cleanedLines.join('\n').trim()
}

function normalizeTranslationWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function parseProgressMethod(logMessage: string | null | undefined): string | null {
  if (!logMessage) return null
  const match = logMessage.match(/downloading:\s*\d+%\s*\[([^\]]+)\]/i)
  if (!match) return null
  const method = match[1]?.trim()
  return method ? method : null
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
    void api.isFirstRun().then((first: boolean) => setShowWizard(first)).catch(() => setShowWizard(false))
  }, [])

  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(() => loadSummarySnapshot())
  const [error, setError] = useState<string | null>(null)
  const viewHistoryRef = useRef<AppView[]>(['home'])
  const viewHistoryIndexRef = useRef(0)
  const isHistoryNavigationRef = useRef(false)
  const [loading, setLoading] = useState<boolean>(() => loadSummarySnapshot() === null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [, setAssistantState] = useState<AssistantStatePayload | null>(null)
  const [, setAssistantProfile] = useState<AssistantProfilePayload | null>(null)
  const [assistantToasts, setAssistantToasts] = useState<AssistantToast[]>([])
  const [assistantChatOpen, setAssistantChatOpen] = useState(false)
  const [assistantChatInput, setAssistantChatInput] = useState('')
  const [assistantChatMessages, setAssistantChatMessages] = useState<AssistantChatTurn[]>([])
  const [assistantChatLoading, setAssistantChatLoading] = useState(false)
  const [assistantChatError, setAssistantChatError] = useState<string | null>(null)
  const [ocrWorkbenchOpen, setOcrWorkbenchOpen] = useState(false)
  const [ocrWorkbenchBusy, setOcrWorkbenchBusy] = useState(false)
  const [ocrWorkbenchError, setOcrWorkbenchError] = useState<string | null>(null)
  const [ocrWorkbenchResult, setOcrWorkbenchResult] = useState<{
    fileName: string
    lineCount: number
    japaneseText: string
    englishText: string
  } | null>(null)
  const [assistantSpeakingTurnKey, setAssistantSpeakingTurnKey] = useState<string | null>(null)
  const [assistantChatStatus, setAssistantChatStatus] = useState<AssistantChatRuntimeStatus | null>(null)
  const [, setAssistantChatWarmup] = useState(false)
  const [, setAssistantChatFallbackNote] = useState<string | null>(null)

  const [activeScript, setActiveScript] = useState<ScriptKey>('hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>('romaji_sprint')
  const [deckCards, setDeckCards] = useState<ScriptDeck['cards']>([])
  const [blockProgress, setBlockProgress] = useState<BlockInfo[]>([])
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0)
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)

  const [sessionActive, setSessionActive] = useState<boolean>(false)
  const [roundState, setRoundState] = useState<RoundState | null>(null)
  const [roundInput, setRoundInput] = useState<string>('')
  const [voiceBusy, setVoiceBusy] = useState<boolean>(false)
  const [voiceUnavailable, setVoiceUnavailable] = useState<boolean>(false)
  const [lastVoiceSynthesis, setLastVoiceSynthesis] = useState<VoiceSynthesisMeta | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatusPayload | null>(null)
  const [voiceStatusChecked, setVoiceStatusChecked] = useState(false)
  const [tutorInstallInfo, setTutorInstallInfo] = useState<{
    totalRamGb: number
    models: Array<{
      tier: 'low' | 'medium' | 'high' | 'ultra'
      filename: string
      sizeMb: number
      embedderSizeMb?: number
      combinedSizeMb?: number
      label: string
      description: string
      installed: boolean
      estimatedDownloadMinutes?: number | null
    }>
    recommendedTier: 'low' | 'medium' | 'high' | 'ultra'
    activeModelTier?: 'low' | 'medium' | 'high' | 'ultra' | null
    activeEmbedderTier?: 'e5_small' | 'e5_base' | 'e5_large' | null
    activeEmbedderLabel?: string | null
    activeEmbedderInstalled?: boolean
    activeEmbedderEnabled?: boolean
    llamaCppInstalled: boolean
    gpuVramGb?: number | null
    voiceInstalled: boolean
    voiceModels: Array<{
      tier: '0.6b'
      filename: string
      sizeMb: number
      combinedSizeMb: number
      label: string
      description: string
      installed: boolean
      estimatedDownloadMinutes?: number | null
    }>
    activeVoiceModel?: '0.6b' | null
    fontsInstalled: boolean
    dictionaryInstalled: boolean
    llamaCppEstimatedDownloadMinutes?: number | null
    dictionaryEstimatedDownloadMinutes?: number | null
    speechModels: Array<{
      tier: 'fast' | 'balanced' | 'high' | 'ultra'
      label: string
      description: string
      sizeMb: number
      installed: boolean
      estimatedDownloadMinutes?: number | null
    }>
    recommendedSpeechTier?: 'fast' | 'balanced' | 'high' | 'ultra'
    activeSpeechModelTier?: 'fast' | 'balanced' | 'high' | 'ultra' | null
    ocrModels?: Array<{
      tier: 'standard'
      label: string
      description: string
      sizeMb: number
      installed: boolean
      estimatedDownloadMinutes?: number | null
    }>
    recommendedOcrTier?: 'standard'
    activeOcrModelTier?: 'standard' | null
    ocrInstalled?: boolean
    translationModels?: Array<{
      tier: 'qwen_ja_en'
      label: string
      badge?: 'Qwen Translation'
      description: string
      sizeMb: number
      installed: boolean
      estimatedDownloadMinutes?: number | null
    }>
    recommendedTranslationTier?: 'qwen_ja_en'
    activeTranslationModelTier?: 'qwen_ja_en' | null
    translationInstalled?: boolean
    translationProfiles?: Array<{
      tier: 'ocr_qwen_local'
      label: string
      badge?: 'Recommended'
      description: string
      sizeMb: number
      installed: boolean
      estimatedDownloadMinutes?: number | null
    }>
    activeTranslationProfileTier?: 'ocr_qwen_local' | null
  } | null>(null)
  const [voiceOptions] = useState<VoiceOptionEntry[]>(FIXED_JAPANESE_VOICE_OPTIONS)
  const [tutorDownloadingTier, setTutorDownloadingTier] = useState<'low' | 'medium' | 'high' | 'ultra' | null>(null)
  const [tutorDownloadProgress, setTutorDownloadProgress] = useState<{ percent: number; mb: number | null; totalMb: number | null } | null>(null)
  const [tutorDownloadMethod, setTutorDownloadMethod] = useState<string | null>(null)
  const [tutorModelActionTier, setTutorModelActionTier] = useState<'low' | 'medium' | 'high' | 'ultra' | null>(null)
  const [dictionaryDownloading, setDictionaryDownloading] = useState(false)
  const [dictionaryProgress, setDictionaryProgress] = useState<number>(0)
  const [dictionaryDownloadMethod, setDictionaryDownloadMethod] = useState<string | null>(null)
  const [speechDownloadingTier, setSpeechDownloadingTier] = useState<'fast' | 'balanced' | 'high' | 'ultra' | null>(null)
  const [speechDownloadProgress, setSpeechDownloadProgress] = useState<number>(0)
  const [speechDownloadMethod, setSpeechDownloadMethod] = useState<string | null>(null)
  const [speechModelActionTier, setSpeechModelActionTier] = useState<'fast' | 'balanced' | 'high' | 'ultra' | null>(null)
  const [translationProfileApplyingTier, setTranslationProfileApplyingTier] = useState<'ocr_qwen_local' | null>(null)
  const [translationProfileProgress, setTranslationProfileProgress] = useState<number>(0)
  const [translationProfileMethod, setTranslationProfileMethod] = useState<string | null>(null)
  const [voiceEngineDownloadingTier, setVoiceEngineDownloadingTier] = useState<'0.6b' | null>(null)
  const [voiceEngineDownloadProgress, setVoiceEngineDownloadProgress] = useState<number>(0)
  const [voiceEngineDownloadMethod, setVoiceEngineDownloadMethod] = useState<string | null>(null)
  const [roundFeedback, setRoundFeedback] = useState<string | null>(null)
  const [roundFeedbackTone, setRoundFeedbackTone] = useState<FeedbackTone>(null)
  const [roundFeedbackPoints, setRoundFeedbackPoints] = useState<number | null>(null)
  const [roundFeedbackAnswer, setRoundFeedbackAnswer] = useState<string | null>(null)
  const [roundPerformanceLabel, setRoundPerformanceLabel] = useState<'PERFECT' | 'GOOD' | 'SLOW' | 'MISS' | null>(null)
  const [isRoundResolving, setIsRoundResolving] = useState<boolean>(false)
  const [feedbackAdvanceMs, setFeedbackAdvanceMs] = useState<number>(FEEDBACK_REVEAL_MS)
  const [sessionScore, setSessionScore] = useState<number>(0)
  const [sessionRounds, setSessionRounds] = useState<number>(0)
  const [sessionPoints, setSessionPoints] = useState<number>(0)
  const [sessionStreak, setSessionStreak] = useState<number>(0)
  const [sessionBestStreak, setSessionBestStreak] = useState<number>(0)
  const [roundComboBonus, setRoundComboBonus] = useState<number>(0)
  const [roundMilestoneStreak, setRoundMilestoneStreak] = useState<number | null>(null)
  const [sessionTargetItems, setSessionTargetItems] = useState<number>(DEFAULT_SESSION_LENGTH_PRESET.items)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [lastSessionSummary, setLastSessionSummary] = useState<SessionSummaryPayload | null>(null)
  const [sessionRunReport, setSessionRunReport] = useState<SessionRunReport | null>(null)
  const [resumeRequest, setResumeRequest] = useState<{ script: ScriptKey; minigame: MinigameKey } | null>(null)
  const [sessionStartPending, setSessionStartPending] = useState<boolean>(false)
  const [sessionSummaryLoading, setSessionSummaryLoading] = useState<boolean>(false)
  const [sessionGoalError, setSessionGoalError] = useState<string | null>(null)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)
  const [leechFocusEnabled, setLeechFocusEnabled] = useState<boolean>(false)
  const [interleaveWeights] = useState<InterleaveWeights>({ ...DEFAULT_INTERLEAVE_WEIGHTS })
  const [interleaveSurpriseEnabled] = useState<boolean>(true)
  const [interleaveSurpriseEvery] = useState<number>(5)
  const [confidenceCaptureEnabled, setConfidenceCaptureEnabled] = useState<boolean>(false)
  const [roundConfidenceScore, setRoundConfidenceScore] = useState<number>(3)
  const [sessionConfidenceCount, setSessionConfidenceCount] = useState<number>(0)
  const [sessionConfidenceTotal, setSessionConfidenceTotal] = useState<number>(0)

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
  const [homeStudyPlanExpanded, setHomeStudyPlanExpanded] = useState(false)
  const [xpProgress, setXpProgress] = useState<XPProgress | null>(null)
  const [tutorReactions, setTutorReactions] = useState<TutorReactionItem[]>([])
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
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>('theme')
  const [xpDetailsOpen, setXpDetailsOpen] = useState(false)
  const [streakDetailsOpen, setStreakDetailsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [collapsedSettingsSections, setCollapsedSettingsSections] = useState<Partial<Record<string, boolean>>>({})
  const [customThemeActionMessage, setCustomThemeActionMessage] = useState<string | null>(null)
  const [customBackgroundActionMessage, setCustomBackgroundActionMessage] = useState<string | null>(null)
  const [themePaletteCache, setThemePaletteCache] = useState<Partial<Record<ThemeKey, ThemePalette>>>({})
  const [backgroundPreviewUrls, setBackgroundPreviewUrls] = useState<Partial<Record<BackgroundStyle, string>>>({})
  const [showOverview, setShowOverview] = useState(false)
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0)
  const [resettingDb, setResettingDb] = useState(false)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false)
  const [activeShortcutFlyout, setActiveShortcutFlyout] = useState<ShortcutSubmenuKey | null>(null)
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const ambientAudioRef = useRef<AmbientAudioController | null>(null)
  const shortcutsSectionRef = useRef<HTMLDivElement | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)
  const roundPresentedAtRef = useRef<number>(0)
  const scriptLoadRequestIdRef = useRef<number>(0)
  const lastLoadedScriptRef = useRef<ScriptKey>('hiragana')
  const startupBootMarkRef = useRef<number>(performance.now())
  const startupFirstSummaryMsRef = useRef<number | null>(null)
  const startupReadySentRef = useRef(false)
  const assistantChatHistoryHydratedRef = useRef(false)
  const assistantChatLogRef = useRef<HTMLDivElement | null>(null)
  const ocrWorkbenchImageInputRef = useRef<HTMLInputElement | null>(null)
  const assistantChatClearTokenRef = useRef(0)
  const assistantSpeechRunIdRef = useRef(0)
  const xpDetailsRef = useRef<HTMLDivElement | null>(null)
  const streakDetailsRef = useRef<HTMLDivElement | null>(null)
  const localToastIdRef = useRef(-1)
  const previousSessionActiveRef = useRef(false)
  const feedbackTimerRef = useRef<number | null>(null)
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
  const backgroundImageCacheRef = useRef<Partial<Record<BackgroundStyle, HTMLImageElement>>>({})
  const assistantSeenEventIdsRef = useRef<Set<number>>(new Set())
  const customThemeImportInputRef = useRef<HTMLInputElement | null>(null)
  const customBackgroundImportInputRef = useRef<HTMLInputElement | null>(null)
  const translationProfileTierRef = useRef<'ocr_qwen_local' | null>(null)
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

  const openDictionary = useCallback((seedQuery = '') => {
    setShowSettings(false)
    setShowOverview(false)
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
    setAssistantChatOpen(false)
    setOcrWorkbenchOpen(false)
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

  const closeOcrWorkbench = useCallback(() => {
    setOcrWorkbenchOpen(false)
    setOcrWorkbenchError(null)
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

  const playQuestionAudio = useCallback(async (text: string, speaker?: string) => {
    const spoken = typeof text === 'string' ? text.trim() : ''
    if (!spoken || voiceBusy) {
      return
    }
    const speak = window.jplearnDesktop.speakText
    if (!speak) {
      setVoiceUnavailable(true)
      return
    }
    setVoiceBusy(true)
    try {
      const result = await speak({
        text: spoken,
        speaker: speaker ?? settings.voiceSpeaker,
      })
      if (result?.audioBase64) {
        setLastVoiceSynthesis((result.synthesis as VoiceSynthesisMeta | undefined) ?? null)
        if (voiceAudioRef.current) {
          voiceAudioRef.current.pause()
        }
        const audio = new Audio(`data:audio/wav;base64,${result.audioBase64}`)
        voiceAudioRef.current = audio
        await audio.play()
        setVoiceUnavailable(false)
      } else {
        setVoiceUnavailable(true)
      }
    } catch {
      setVoiceUnavailable(true)
    } finally {
      setVoiceBusy(false)
    }
  }, [voiceBusy, settings.voiceSpeaker])

  const cancelAssistantSpeech = useCallback(() => {
    assistantSpeechRunIdRef.current += 1
    setAssistantSpeakingTurnKey(null)
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current = null
    }
  }, [])

  const playVoiceRuntimeAudio = useCallback(async (
    text: string,
    runId: number,
  ): Promise<boolean> => {
    const speak = window.jplearnDesktop.speakText
    if (!speak) {
      return false
    }
    try {
      const result = await speak({
        text,
        speaker: settings.voiceSpeaker,
      })
      if (!result?.audioBase64 || assistantSpeechRunIdRef.current !== runId) {
        return false
      }
      setLastVoiceSynthesis((result.synthesis as VoiceSynthesisMeta | undefined) ?? null)
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(`data:audio/wav;base64,${result.audioBase64}`)
        if (voiceAudioRef.current) {
          voiceAudioRef.current.pause()
        }
        voiceAudioRef.current = audio
        audio.onended = () => resolve()
        audio.onerror = () => reject(new Error('Unable to play voice runtime audio.'))
        void audio.play().catch(reject)
      })
      return true
    } catch {
      return false
    }
  }, [settings.voiceSpeaker])

  const speakAssistantReply = useCallback(async (text: string, turnKey?: string): Promise<void> => {
    if (!settings.assistantChatAudioEnabled) {
      return
    }
    const segments = splitSpeechSegments(text)
    if (segments.length <= 0) {
      return
    }

    const runId = assistantSpeechRunIdRef.current + 1
    assistantSpeechRunIdRef.current = runId
    setAssistantSpeakingTurnKey(turnKey ?? null)

    try {
      for (const segment of segments) {
        if (assistantSpeechRunIdRef.current !== runId) {
          return
        }
        const playedByRuntime = await playVoiceRuntimeAudio(segment.text, runId)
        if (!playedByRuntime) {
          setVoiceUnavailable(true)
          return
        }
      }
    } finally {
      if (assistantSpeechRunIdRef.current === runId) {
        setAssistantSpeakingTurnKey(null)
      }
    }
  }, [playVoiceRuntimeAudio, settings.assistantChatAudioEnabled])

  const replayAssistantTurn = useCallback((content: string, turnKey: string) => {
    void speakAssistantReply(content, turnKey)
  }, [speakAssistantReply])

  const formatModelSize = useCallback((sizeMb: number) => {
    if (!Number.isFinite(sizeMb)) {
      return '—'
    }
    if (sizeMb >= 1000) {
      return `${(sizeMb / 1000).toFixed(1)} GB`
    }
    return `${Math.round(sizeMb)} MB`
  }, [])

  // Chatbot tier cards show combined footprint (chatbot + its hidden, auto-installed
  // embedder) so the displayed size matches what setup actually downloads.
  const formatCombinedModelSize = useCallback((sizeMb: number, embedderSizeMb?: number) => {
    if (!Number.isFinite(sizeMb)) {
      return '—'
    }
    if (!embedderSizeMb || !Number.isFinite(embedderSizeMb) || embedderSizeMb <= 0) {
      return formatModelSize(sizeMb)
    }
    return `${formatModelSize(sizeMb)} + ${formatModelSize(embedderSizeMb)}`
  }, [formatModelSize])

  const formatMinutes = useCallback((minutes?: number | null) => {
    if (!Number.isFinite(minutes ?? Number.NaN) || !minutes || minutes <= 0) {
      return 'time unknown'
    }
    return `${minutes} min`
  }, [])

  const getTutorModelHardwareFit = useCallback((tier: 'low' | 'medium' | 'high' | 'ultra') => {
    const totalRamGb = tutorInstallInfo?.totalRamGb ?? 0
    const gpuVramGb = tutorInstallInfo?.gpuVramGb ?? 0
    const minRequirements: Record<'low' | 'medium' | 'high' | 'ultra', { ram: number; vram: number }> = {
      low: { ram: 2, vram: 1 },
      medium: { ram: 4, vram: 2 },
      high: { ram: 3, vram: 4 },
      ultra: { ram: 8, vram: 11 },
    }
    const makeFit = (
      badge: string,
      detail: string,
      isOk: boolean,
      tone: 'soft' | 'warning' = isOk ? 'soft' : 'warning',
    ) => ({ badge, detail, isOk, tone })

    const mins = minRequirements[tier]
    const ramOnlyFit = totalRamGb >= mins.ram && gpuVramGb < mins.vram
    if (ramOnlyFit) {
      return makeFit(
        'Usable (slower)',
        `This tier can still run because your RAM meets the minimum (${mins.ram} GB), but GPU VRAM is below the ${mins.vram} GB target. Expect slower performance.`,
        true,
        'warning',
      )
    }

    if (tier === 'low') {
      if (totalRamGb >= 8 || gpuVramGb >= 4) {
        return makeFit(
          'Recommended fit',
          'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 6 || gpuVramGb >= 4) {
        return makeFit(
          'Comfortable fit',
          'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 2 || gpuVramGb >= 1) {
        return makeFit(
          'Minimum fit',
          'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
          true,
          'warning',
        )
      }
      return makeFit(
        'Too heavy',
        'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
        false,
      )
    }

    if (tier === 'medium') {
      if (totalRamGb >= 10 || gpuVramGb >= 6) {
        return makeFit(
          'Recommended fit',
          'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 8 || gpuVramGb >= 4) {
        return makeFit(
          'Comfortable fit',
          'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 4 || gpuVramGb >= 2) {
        return makeFit(
          'Minimum fit',
          'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
          true,
          'warning',
        )
      }
      return makeFit(
        'Too heavy',
        'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
        false,
      )
    }

    if (tier === 'high') {
      if (totalRamGb >= 12 || gpuVramGb >= 8) {
        return makeFit(
          'Recommended fit',
          'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 8 || gpuVramGb >= 6) {
        return makeFit(
          'Comfortable fit',
          'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 3 || gpuVramGb >= 4) {
        return makeFit(
          'Minimum fit',
          'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
          true,
          'warning',
        )
      }
      return makeFit(
        'Too heavy',
        'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
        false,
      )
    }

    if (tier === 'ultra') {
      if (totalRamGb >= 24 || gpuVramGb >= 24) {
        return makeFit(
          'Recommended fit',
          'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 16 || gpuVramGb >= 16) {
        return makeFit(
          'Comfortable fit',
          'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
          true,
        )
      }
      if (totalRamGb >= 8 || gpuVramGb >= 11) {
        return makeFit(
          'Minimum fit',
          'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
          true,
          'warning',
        )
      }
      return makeFit(
        'Too heavy',
        'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
        false,
      )
    }

    return makeFit('Unsupported tier', 'Unable to evaluate this model tier on this system.', false)
  }, [tutorInstallInfo?.gpuVramGb, tutorInstallInfo?.totalRamGb])

  const getSpeechModelHardwareFit = useCallback((tier: 'fast' | 'balanced' | 'high' | 'ultra') => {
    const totalRamGb = tutorInstallInfo?.totalRamGb ?? 0
    const gpuVramGb = tutorInstallInfo?.gpuVramGb ?? 0
    const makeFit = (
      badge: string,
      detail: string,
      isOk: boolean,
      tone: 'soft' | 'warning' = isOk ? 'soft' : 'warning',
    ) => ({ badge, detail, isOk, tone })

    if (tier === 'fast') {
      if (totalRamGb >= 6 || gpuVramGb >= 2) {
        return makeFit('Recommended fit', 'Fastest option. Comfortable on most systems.', true)
      }
      if (totalRamGb >= 4 || gpuVramGb >= 1) {
        return makeFit('Comfortable fit', 'Fastest option. Comfortable on most systems.', true)
      }
      return makeFit('Minimum fit', 'Fastest option. Comfortable on most systems.', true, 'warning')
    }

    if (tier === 'balanced') {
      if (totalRamGb >= 12 || gpuVramGb >= 4) {
        return makeFit('Recommended fit', 'Good balance of speed and recognition quality.', true)
      }
      if (totalRamGb >= 10 || gpuVramGb >= 2) {
        return makeFit('Comfortable fit', 'Good balance of speed and recognition quality.', true)
      }
      if (totalRamGb >= 6) {
        return makeFit('Minimum fit', 'Good balance of speed and recognition quality.', true, 'warning')
      }
      return makeFit('Too heavy', 'Works best with around 10 GB RAM or more.', false)
    }

    if (tier === 'high') {
      if (totalRamGb >= 24 || gpuVramGb >= 12) {
        return makeFit('Recommended fit', 'Strong quality with lower latency than Ultra.', true)
      }
      if (totalRamGb >= 16 || gpuVramGb >= 8) {
        return makeFit('Comfortable fit', 'Strong quality with lower latency than Ultra.', true)
      }
      if (totalRamGb >= 8 || gpuVramGb >= 4) {
        return makeFit('Minimum fit', 'Strong quality with lower latency than Ultra.', true, 'warning')
      }
      return makeFit('Too heavy', 'Best with around 16 GB RAM or 8 GB GPU VRAM.', false)
    }

    if (totalRamGb >= 32 || gpuVramGb >= 16) {
      return makeFit('Recommended fit', 'Highest recognition quality; heaviest tier.', true)
    }
    if (totalRamGb >= 24 || gpuVramGb >= 12) {
      return makeFit('Comfortable fit', 'Highest recognition quality; heaviest tier.', true)
    }
    if (totalRamGb >= 12 || gpuVramGb >= 8) {
      return makeFit('Minimum fit', 'Highest recognition quality; heaviest tier.', true, 'warning')
    }
    return makeFit('Too heavy', 'Best with around 24 GB RAM or 12 GB GPU VRAM.', false)
  }, [tutorInstallInfo?.gpuVramGb, tutorInstallInfo?.totalRamGb])

  const refreshTutorInstallInfo = useCallback(async () => {
    const getSetupSystemInfo = window.jplearnDesktop.getSetupSystemInfo
    if (!getSetupSystemInfo) {
      return
    }
    try {
      const setupInfo = await getSetupSystemInfo()
      setTutorInstallInfo({
        totalRamGb: setupInfo.totalRamGb,
        models: setupInfo.models ?? [],
        recommendedTier: setupInfo.recommendedTier,
        activeModelTier: setupInfo.activeModelTier ?? null,
        activeEmbedderTier: setupInfo.activeEmbedderTier ?? null,
        activeEmbedderLabel: setupInfo.activeEmbedderLabel ?? null,
        activeEmbedderInstalled: setupInfo.activeEmbedderInstalled ?? false,
        activeEmbedderEnabled: setupInfo.activeEmbedderEnabled ?? false,
        llamaCppInstalled: setupInfo.llamaCppInstalled,
        gpuVramGb: setupInfo.gpuVramGb ?? null,
        voiceInstalled: setupInfo.voiceInstalled ?? false,
        voiceModels: setupInfo.voiceModels ?? [],
        activeVoiceModel: setupInfo.activeVoiceModel ?? null,
        fontsInstalled: setupInfo.fontsInstalled,
        dictionaryInstalled: setupInfo.dictionaryInstalled,
        llamaCppEstimatedDownloadMinutes: setupInfo.llamaCppEstimatedDownloadMinutes ?? null,
        dictionaryEstimatedDownloadMinutes: setupInfo.dictionaryEstimatedDownloadMinutes ?? null,
        speechModels: setupInfo.speechModels ?? [],
        recommendedSpeechTier: setupInfo.recommendedSpeechTier,
        activeSpeechModelTier: setupInfo.activeSpeechModelTier ?? null,
        ocrModels: setupInfo.ocrModels ?? [],
        recommendedOcrTier: setupInfo.recommendedOcrTier,
        activeOcrModelTier: setupInfo.activeOcrModelTier ?? null,
        ocrInstalled: setupInfo.ocrInstalled ?? false,
        translationModels: setupInfo.translationModels ?? [],
        recommendedTranslationTier: setupInfo.recommendedTranslationTier,
        activeTranslationModelTier: setupInfo.activeTranslationModelTier ?? null,
        translationInstalled: setupInfo.translationInstalled ?? false,
        translationProfiles: setupInfo.translationProfiles ?? [],
        activeTranslationProfileTier: setupInfo.activeTranslationProfileTier ?? null,
      })
    } catch {
      // Best effort only.
    }
  }, [])

  const refreshVoiceStatus = useCallback(async (): Promise<VoiceStatusPayload | null> => {
    const getVoiceStatus = window.jplearnDesktop.getVoiceStatus
    if (!getVoiceStatus) {
      setVoiceStatusChecked(true)
      return null
    }
    try {
      const status = await getVoiceStatus()
      setVoiceStatus(status)
      setVoiceStatusChecked(true)
      return status
    } catch {
      setVoiceStatusChecked(true)
      return null
    }
  }, [])

  useEffect(() => {
    void refreshTutorInstallInfo()
  }, [refreshTutorInstallInfo])

  useEffect(() => {
    void refreshVoiceStatus()
  }, [refreshVoiceStatus])

  useEffect(() => {
    if (view !== 'script_hub') {
      return
    }
    void refreshVoiceStatus()
  }, [refreshVoiceStatus, view])

  useEffect(() => {
    if (!showSettings || activeSettingsTab !== 'tutor') {
      return
    }
    void refreshTutorInstallInfo()
  }, [activeSettingsTab, refreshTutorInstallInfo, showSettings])

  useEffect(() => {
    if (!showSettings || activeSettingsTab !== 'voice') {
      return
    }

    void refreshVoiceStatus()
    const intervalHandle = window.setInterval(() => {
      void refreshVoiceStatus()
    }, 3000)

    return () => {
      window.clearInterval(intervalHandle)
    }
  }, [activeSettingsTab, refreshVoiceStatus, showSettings])

  useEffect(() => {
    const onSetupProgress = window.jplearnDesktop.onSetupProgress
    if (!onSetupProgress) {
      return
    }
    const unsubscribe = onSetupProgress((evt) => {
      const method = parseProgressMethod(evt.logMessage)
      if (evt.id === 'dictionary') {
        setDictionaryProgress(evt.percent)
        if (method) setDictionaryDownloadMethod(method)
        return
      }
      if (evt.id === 'voice') {
        setVoiceEngineDownloadProgress(evt.percent)
        if (method) setVoiceEngineDownloadMethod(method)
        return
      }
      if (evt.id === 'speech') {
        setSpeechDownloadProgress(evt.percent)
        if (method) setSpeechDownloadMethod(method)
        return
      }
      if (evt.id === 'ocr') {
        const activeTier = translationProfileTierRef.current
        if (activeTier) {
          const bounded = Math.max(0, Math.min(100, evt.percent))
          const staged = Math.round((bounded / 100) * 50)
          setTranslationProfileProgress((prev) => Math.max(prev, staged))
        }
        if (method) setTranslationProfileMethod(method)
        return
      }
      if (evt.id === 'translation') {
        const activeTier = translationProfileTierRef.current
        if (activeTier) {
          const bounded = Math.max(0, Math.min(100, evt.percent))
          const staged = Math.round(50 + (bounded / 100) * 50)
          setTranslationProfileProgress((prev) => Math.max(prev, staged))
        }
        if (method) setTranslationProfileMethod(method)
        return
      }
      if (evt.id !== 'model') {
        return
      }
      if (method) setTutorDownloadMethod(method)
      setTutorDownloadProgress({ percent: evt.percent, mb: evt.mb, totalMb: evt.totalMb })
    })
    return unsubscribe
  }, [])

  const downloadTutorModel = useCallback(async (tier: 'low' | 'medium' | 'high' | 'ultra') => {
    const downloadModel = window.jplearnDesktop.downloadModel
    if (!downloadModel || tutorDownloadingTier) {
      return
    }
    setTutorDownloadingTier(tier)
    setTutorDownloadProgress({ percent: 0, mb: null, totalMb: null })
    setTutorDownloadMethod(null)
    try {
      await downloadModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setTutorDownloadingTier(null)
      setTutorDownloadProgress(null)
    }
  }, [refreshTutorInstallInfo, tutorDownloadingTier])

  const selectTutorModel = useCallback(async (tier: 'low' | 'medium' | 'high' | 'ultra') => {
    const setActiveTutorModel = window.jplearnDesktop.setActiveTutorModel
    if (!setActiveTutorModel || tutorModelActionTier) {
      return
    }
    setTutorModelActionTier(tier)
    try {
      await setActiveTutorModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setTutorModelActionTier(null)
    }
  }, [refreshTutorInstallInfo, tutorModelActionTier])

  const uninstallTutorModel = useCallback(async (tier: 'low' | 'medium' | 'high' | 'ultra') => {
    const uninstallModel = window.jplearnDesktop.uninstallTutorModel
    if (!uninstallModel || tutorModelActionTier) {
      return
    }
    setTutorModelActionTier(tier)
    try {
      await uninstallModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setTutorModelActionTier(null)
    }
  }, [refreshTutorInstallInfo, tutorModelActionTier])

  const downloadOfflineDictionary = useCallback(async () => {
    const downloadDictionary = window.jplearnDesktop.downloadDictionary
    if (!downloadDictionary || dictionaryDownloading) {
      return
    }
    setDictionaryDownloading(true)
    setDictionaryProgress(0)
    setDictionaryDownloadMethod(null)
    try {
      await downloadDictionary()
      await refreshTutorInstallInfo()
    } finally {
      setDictionaryDownloading(false)
      setDictionaryProgress(0)
    }
  }, [dictionaryDownloading, refreshTutorInstallInfo])

  const downloadSpeechModel = useCallback(async (tier: 'fast' | 'balanced' | 'high' | 'ultra') => {
    const downloadModel = window.jplearnDesktop.downloadSpeechModel
    if (!downloadModel || speechDownloadingTier) {
      return
    }
    setSpeechDownloadingTier(tier)
    setSpeechDownloadProgress(0)
    setSpeechDownloadMethod(null)
    try {
      await downloadModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setSpeechDownloadingTier(null)
      setSpeechDownloadProgress(0)
    }
  }, [refreshTutorInstallInfo, speechDownloadingTier])

  const selectSpeechModel = useCallback(async (tier: 'fast' | 'balanced' | 'high' | 'ultra') => {
    const setActiveSpeechModel = window.jplearnDesktop.setActiveSpeechModel
    if (!setActiveSpeechModel || speechModelActionTier) {
      return
    }
    setSpeechModelActionTier(tier)
    try {
      await setActiveSpeechModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setSpeechModelActionTier(null)
    }
  }, [refreshTutorInstallInfo, speechModelActionTier])

  const uninstallSpeechModel = useCallback(async (tier: 'fast' | 'balanced' | 'high' | 'ultra') => {
    const uninstallModel = window.jplearnDesktop.uninstallSpeechModel
    if (!uninstallModel || speechModelActionTier) {
      return
    }
    setSpeechModelActionTier(tier)
    try {
      await uninstallModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setSpeechModelActionTier(null)
    }
  }, [refreshTutorInstallInfo, speechModelActionTier])

  const applyTranslationProfile = useCallback(async (tier: 'ocr_qwen_local') => {
    const applyProfile = window.jplearnDesktop.applyTranslationProfile
    if (!applyProfile || translationProfileApplyingTier) {
      return
    }
    translationProfileTierRef.current = tier
    setTranslationProfileApplyingTier(tier)
    setTranslationProfileProgress(0)
    setTranslationProfileMethod(null)
    try {
      await applyProfile(tier, { force: true })
      await refreshTutorInstallInfo()
    } finally {
      translationProfileTierRef.current = null
      setTranslationProfileApplyingTier(null)
      setTranslationProfileProgress(0)
    }
  }, [refreshTutorInstallInfo, translationProfileApplyingTier])

  const downloadVoiceEngineModel = useCallback(async (tier: '0.6b') => {
    const downloadVoiceEngine = window.jplearnDesktop.downloadVoiceEngine
    if (!downloadVoiceEngine || voiceEngineDownloadingTier) {
      return
    }
    setVoiceEngineDownloadingTier(tier)
    setVoiceEngineDownloadProgress(0)
    setVoiceEngineDownloadMethod(null)
    try {
      await downloadVoiceEngine(tier)
      await refreshTutorInstallInfo()
      const preloadVoice = window.jplearnDesktop.preloadVoice
      if (preloadVoice) {
        await preloadVoice(settings.voiceSpeaker)
      }
    } finally {
      setVoiceEngineDownloadingTier(null)
      setVoiceEngineDownloadProgress(0)
    }
  }, [refreshTutorInstallInfo, settings.voiceSpeaker, voiceEngineDownloadingTier])

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
    void window.jplearnDesktop.reloadLocalFonts?.().catch(() => undefined)
  }, [])

  const availableThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => theme.mode === settings.themeMode),
    [settings.themeMode],
  )

  const activeCustomTheme = useMemo(
    () => settings.customThemes.find((theme) => theme.id === settings.activeCustomThemeId) ?? null,
    [settings.activeCustomThemeId, settings.customThemes],
  )

  const effectiveTheme = useMemo(() => {
    if (settings.themeScope === 'custom' && activeCustomTheme) {
      return activeCustomTheme.baseThemeByMode[settings.themeMode]
    }
    return getThemeVariantForMode(settings.theme, settings.themeMode)
  }, [activeCustomTheme, settings.theme, settings.themeMode, settings.themeScope])

  const ensureThemePaletteCached = useCallback((theme: ThemeKey): ThemePalette | null => {
    const cached = themePaletteCache[theme]
    if (cached) {
      return cached
    }
    const palette = readThemePalette(theme)
    if (palette) {
      setThemePaletteCache((prev) => ({ ...prev, [theme]: palette }))
    }
    return palette
  }, [themePaletteCache])

  const activeBasePalette = useMemo(() => {
    if (!activeCustomTheme) {
      return null
    }
    return themePaletteCache[activeCustomTheme.baseThemeByMode[settings.themeMode]] ?? null
  }, [activeCustomTheme, settings.themeMode, themePaletteCache])

  const customThemePreviewById = useMemo(() => {
    const previews: Record<string, { accent: string; baseLabel: string }> = {}
    for (const theme of settings.customThemes) {
      const baseTheme = theme.baseThemeByMode[settings.themeMode]
      const basePalette = themePaletteCache[baseTheme]
      const mergedPalette = basePalette ? mergeThemePalette(basePalette, theme.overridesByMode[settings.themeMode]) : null
      const baseOption = THEME_OPTIONS.find((option) => option.key === baseTheme)
      previews[theme.id] = {
        accent: mergedPalette?.['--accent'] ?? THEME_SWATCH_ACCENT[baseTheme],
        baseLabel: baseOption?.label ?? baseTheme,
      }
    }
    return previews
  }, [settings.customThemes, settings.themeMode, themePaletteCache])

  const createCustomTheme = useCallback(() => {
    setSettings((prev) => {
      const baseDark = getThemeVariantForMode(prev.theme, 'dark')
      const baseLight = getThemeVariantForMode(prev.theme, 'light')
      const nextId = makeCustomThemeId()
      const nextTheme: CustomTheme = {
        id: nextId,
        name: `Custom ${prev.customThemes.length + 1}`,
        baseThemeByMode: {
          dark: baseDark,
          light: baseLight,
        },
        overridesByMode: {
          dark: {},
          light: {},
        },
      }
      return {
        ...prev,
        themeScope: 'custom',
        activeCustomThemeId: nextId,
        customThemes: [...prev.customThemes, nextTheme],
        theme: nextTheme.baseThemeByMode[prev.themeMode],
      }
    })
  }, [])

  const selectPresetTheme = useCallback((theme: ThemeKey, mode: ThemeMode) => {
    setSettings((prev) => ({
      ...prev,
      themeScope: 'preset',
      activeCustomThemeId: null,
      themeMode: mode,
      theme,
    }))
  }, [])

  const selectCustomTheme = useCallback((id: string) => {
    setSettings((prev) => {
      const selected = prev.customThemes.find((theme) => theme.id === id)
      if (!selected) return prev
      return {
        ...prev,
        themeScope: 'custom',
        activeCustomThemeId: id,
        theme: selected.baseThemeByMode[prev.themeMode],
      }
    })
  }, [])

  const renameCustomTheme = useCallback((id: string, name: string) => {
    setSettings((prev) => ({
      ...prev,
      customThemes: prev.customThemes.map((theme) => (
        theme.id === id
          ? {
            ...theme,
            name: name.trim() || 'Custom Theme',
          }
          : theme
      )),
    }))
  }, [])

  const deleteCustomTheme = useCallback((id: string) => {
    setSettings((prev) => {
      const remaining = prev.customThemes.filter((theme) => theme.id !== id)
      if (prev.activeCustomThemeId !== id) {
        return {
          ...prev,
          customThemes: remaining,
        }
      }

      const fallbackCustom = remaining[0] ?? null
      if (fallbackCustom) {
        return {
          ...prev,
          customThemes: remaining,
          activeCustomThemeId: fallbackCustom.id,
          themeScope: 'custom',
          theme: fallbackCustom.baseThemeByMode[prev.themeMode],
        }
      }

      return {
        ...prev,
        customThemes: remaining,
        activeCustomThemeId: null,
        themeScope: 'preset',
        theme: getFallbackThemeForMode(prev.themeMode),
      }
    })
  }, [])

  const duplicateCustomTheme = useCallback((id: string) => {
    setSettings((prev) => {
      const sourceTheme = prev.customThemes.find((theme) => theme.id === id)
      if (!sourceTheme) {
        return prev
      }
      const nextId = makeCustomThemeId()
      const duplicatedTheme: CustomTheme = {
        ...sourceTheme,
        id: nextId,
        name: `${sourceTheme.name} Copy`,
        overridesByMode: {
          dark: { ...sourceTheme.overridesByMode.dark },
          light: { ...sourceTheme.overridesByMode.light },
        },
      }
      return {
        ...prev,
        themeScope: 'custom',
        activeCustomThemeId: nextId,
        customThemes: [...prev.customThemes, duplicatedTheme],
        theme: duplicatedTheme.baseThemeByMode[prev.themeMode],
      }
    })
    setCustomThemeActionMessage('Custom theme duplicated.')
  }, [])

  const importCustomThemesPayload = useCallback((payload: unknown): number => {
    const importedThemes = parseImportedCustomThemes(payload)
    if (importedThemes.length <= 0) {
      return 0
    }

    setSettings((prev) => {
      const existingIds = new Set(prev.customThemes.map((theme) => theme.id))
      const dedupedThemes = importedThemes.map((theme) => {
        let nextId = theme.id
        while (existingIds.has(nextId)) {
          nextId = makeCustomThemeId()
        }
        existingIds.add(nextId)
        return {
          ...theme,
          id: nextId,
        }
      })

      const nextCustomThemes = [...prev.customThemes, ...dedupedThemes]
      if (prev.activeCustomThemeId || dedupedThemes.length <= 0) {
        return {
          ...prev,
          customThemes: nextCustomThemes,
        }
      }

      const firstImported = dedupedThemes[0]
      return {
        ...prev,
        customThemes: nextCustomThemes,
        themeScope: 'custom',
        activeCustomThemeId: firstImported.id,
        theme: firstImported.baseThemeByMode[prev.themeMode],
      }
    })

    return importedThemes.length
  }, [])

  const exportCustomThemesToFile = useCallback(() => {
    if (settings.customThemes.length <= 0) {
      setCustomThemeActionMessage('No custom themes to export.')
      return
    }

    const payload = makeCustomThemeExportPayload(settings.customThemes)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `jplearn-custom-themes-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setCustomThemeActionMessage('Exported custom themes as JSON.')
  }, [settings.customThemes])

  const copyCustomThemesToClipboard = useCallback(async () => {
    if (settings.customThemes.length <= 0) {
      setCustomThemeActionMessage('No custom themes to copy.')
      return
    }

    try {
      const payload = makeCustomThemeExportPayload(settings.customThemes)
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCustomThemeActionMessage('Copied custom themes JSON to clipboard.')
    } catch {
      setCustomThemeActionMessage('Clipboard copy failed in this environment.')
    }
  }, [settings.customThemes])

  const openCustomThemeImportPicker = useCallback(() => {
    customThemeImportInputRef.current?.click()
  }, [])

  const importCustomThemesFromClipboard = useCallback(async () => {
    try {
      const raw = await navigator.clipboard.readText()
      const payload = JSON.parse(raw)
      const importedCount = importCustomThemesPayload(payload)
      setCustomThemeActionMessage(
        importedCount > 0
          ? `Imported ${importedCount} custom theme${importedCount === 1 ? '' : 's'} from clipboard.`
          : 'Clipboard data did not contain custom themes.',
      )
    } catch {
      setCustomThemeActionMessage('Clipboard import failed. Paste valid JSON and try again.')
    }
  }, [importCustomThemesPayload])

  const handleCustomThemeFileImport = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const rawText = typeof reader.result === 'string' ? reader.result : ''
        const payload = JSON.parse(rawText)
        const importedCount = importCustomThemesPayload(payload)
        setCustomThemeActionMessage(
          importedCount > 0
            ? `Imported ${importedCount} custom theme${importedCount === 1 ? '' : 's'} from file.`
            : 'Selected file did not contain custom themes.',
        )
      } catch {
        setCustomThemeActionMessage('Could not parse selected JSON file.')
      }
    }
    reader.onerror = () => {
      setCustomThemeActionMessage('Could not read selected file.')
    }
    reader.readAsText(file)
    event.currentTarget.value = ''
  }, [importCustomThemesPayload])

  const openCustomBackgroundPicker = useCallback(() => {
    customBackgroundImportInputRef.current?.click()
  }, [])

  const clearCustomBackground = useCallback(() => {
    setSettings((previous) => ({
      ...previous,
      customBackgroundDataUrl: null,
      customBackgroundName: null,
      backgroundStyle: previous.backgroundStyle === 'custom_upload' ? 'classic_scene' : previous.backgroundStyle,
    }))
    setCustomBackgroundActionMessage('Custom background removed.')
  }, [])

  const handleCustomBackgroundFileImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) {
      return
    }
    if (!isSupportedBackgroundImageFile(file)) {
      setCustomBackgroundActionMessage('Please choose an image file.')
      return
    }
    if (file.size > CUSTOM_BACKGROUND_MAX_BYTES) {
      setCustomBackgroundActionMessage('Image is too large. Choose a file under 15 MB.')
      return
    }

    try {
      const dataUrl = await optimizeBackgroundFileToDataUrl(file)
      if (dataUrl.length > CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH) {
        setCustomBackgroundActionMessage('Image is still too large after compression. Choose a smaller image.')
        return
      }
      setSettings((previous) => ({
        ...previous,
        backgroundStyle: 'custom_upload',
        customBackgroundDataUrl: dataUrl,
        customBackgroundName: file.name,
      }))
      setCustomBackgroundActionMessage(`Custom background set: ${file.name}`)
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
      setCustomBackgroundActionMessage(`Could not process selected image${detail}`)
    }
  }, [])

  const updateCustomThemeBase = useCallback((id: string, mode: ThemeMode, baseTheme: ThemeKey) => {
    setSettings((prev) => {
      const normalizedTheme = getThemeVariantForMode(baseTheme, mode)
      const customThemes = prev.customThemes.map((theme) => (
        theme.id === id
          ? {
            ...theme,
            baseThemeByMode: {
              ...theme.baseThemeByMode,
              [mode]: normalizedTheme,
            },
          }
          : theme
      ))
      const activeCustomTheme = customThemes.find((theme) => theme.id === prev.activeCustomThemeId)
      return {
        ...prev,
        customThemes,
        theme: prev.themeScope === 'custom' && activeCustomTheme
          ? activeCustomTheme.baseThemeByMode[prev.themeMode]
          : prev.theme,
      }
    })
  }, [])

  const updateCustomThemeOverride = useCallback((id: string, mode: ThemeMode, key: ThemeVariableKey, value: string) => {
    setSettings((prev) => {
      const trimmed = value.trim()
      return {
        ...prev,
        customThemes: prev.customThemes.map((theme) => {
          if (theme.id !== id) {
            return theme
          }
          const nextOverrides = { ...theme.overridesByMode[mode] }
          if (trimmed) {
            nextOverrides[key] = trimmed
          } else {
            delete nextOverrides[key]
          }
          return {
            ...theme,
            overridesByMode: {
              ...theme.overridesByMode,
              [mode]: nextOverrides,
            },
          }
        }),
      }
    })
  }, [])

  const resetCustomThemeSection = useCallback((id: string, mode: ThemeMode, section: ThemeSection) => {
    setSettings((prev) => ({
      ...prev,
      customThemes: prev.customThemes.map((theme) => {
        if (theme.id !== id) {
          return theme
        }
        const nextOverrides = { ...theme.overridesByMode[mode] }
        for (const key of section.keys) {
          delete nextOverrides[key]
        }
        return {
          ...theme,
          overridesByMode: {
            ...theme.overridesByMode,
            [mode]: nextOverrides,
          },
        }
      }),
    }))
  }, [])

  const toggleThemeSectionCollapsed = useCallback((sectionId: string) => {
    setCollapsedSettingsSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }, [])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setSettings((prev) => {
      if (prev.themeMode === mode) return prev
      const activeCustomTheme = prev.customThemes.find((theme) => theme.id === prev.activeCustomThemeId)
      const nextTheme = prev.themeScope === 'custom' && activeCustomTheme
        ? activeCustomTheme.baseThemeByMode[mode]
        : getThemeVariantForMode(prev.theme, mode)
      return {
        ...prev,
        themeMode: mode,
        theme: nextTheme,
      }
    })
  }, [])

  useEffect(() => {
    const themeKeys = new Set<ThemeKey>()
    themeKeys.add(effectiveTheme)
    for (const customTheme of settings.customThemes) {
      themeKeys.add(customTheme.baseThemeByMode.dark)
      themeKeys.add(customTheme.baseThemeByMode.light)
    }
    themeKeys.forEach((themeKey) => {
      ensureThemePaletteCached(themeKey)
    })
  }, [effectiveTheme, ensureThemePaletteCached, settings.customThemes])

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

      const request = window.jplearnDesktop
        .getStudyQueue(slug)
        .then((payload) => {
          studyQueueCacheRef.current.set(cacheKey, {
            payload,
            cachedAtMs: performance.now(),
          })
          return payload
        })
        .finally(() => {
          if (studyQueueInFlightRef.current.get(cacheKey) === request) {
            studyQueueInFlightRef.current.delete(cacheKey)
          }
        })

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
    document.documentElement.dataset.themeMode = settings.themeMode
    document.documentElement.dataset.theme = effectiveTheme
    document.documentElement.dataset.motionStyle = settings.motionStyle

    for (const key of THEME_VARIABLE_KEYS) {
      document.documentElement.style.removeProperty(key)
    }

    if (settings.themeScope === 'custom' && activeCustomTheme) {
      const basePalette = themePaletteCache[effectiveTheme] ?? ensureThemePaletteCached(effectiveTheme)
      if (basePalette) {
        const mergedPalette = mergeThemePalette(basePalette, activeCustomTheme.overridesByMode[settings.themeMode])
        for (const key of THEME_VARIABLE_KEYS) {
          const value = mergedPalette[key]
          if (value) {
            document.documentElement.style.setProperty(key, value)
          }
        }
      }
    }

    void window.jplearnDesktop.setStartupTheme(effectiveTheme).catch(() => undefined)
  }, [activeCustomTheme, effectiveTheme, ensureThemePaletteCached, settings, themePaletteCache])

  // Ambient audio lifecycle
  useEffect(() => {
    if (settings.ambientAudioEnabled) {
      if (!ambientAudioRef.current) {
        ambientAudioRef.current = new AmbientAudioController({
          sources: ['/audio/lofi-loop.mp3', '/audio/lofi-loop.ogg'],
          volume: 0.35,
          fadeMs: 1200,
        })
      }
      ambientAudioRef.current.start()
    } else {
      ambientAudioRef.current?.stop()
    }

    return () => ambientAudioRef.current?.dispose()
  }, [settings.ambientAudioEnabled])

  const activePetalStream = useMemo(() => {
    if (settings.reducedMotion || settings.motionStyle === 'calm_fade') return []
    const count = settings.motionStyle === 'lively' ? 14 : 10
    return PETAL_STREAM.slice(0, count)
  }, [settings.motionStyle, settings.reducedMotion])

  const showPetalLayer = activePetalStream.length > 0 && !(view === 'minigame' && sessionActive)

  useEffect(() => {
    let mounted = true
    void window.jplearnDesktop
      .isWindowMaximized()
      .then((state) => {
        if (mounted) setIsWindowMaximized(state.isMaximized)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  // Onboarding is now gated entirely by learningPathStatus.onboarding_complete from the backend.

  useEffect(() => {
    const onWindowStateChanged = window.jplearnDesktop.onWindowStateChanged
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
      isRoundResolving ||
      (roundState.mode !== 'romaji_sprint' && roundState.mode !== 'typed_recall' && roundState.mode !== 'stroke_order')
    ) {
      return
    }

    const focusHandle = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(focusHandle)
  }, [isRoundResolving, roundState, sessionActive, view])

  useEffect(() => {
    const previouslyActive = previousSessionActiveRef.current
    previousSessionActiveRef.current = sessionActive

    if (!previouslyActive || sessionActive || !activeSessionId) return

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
    })

    setSessionSummaryLoading(true)
    setSessionGoalError(null)
    void window.jplearnDesktop
      .getSessionSummary(activeSessionId)
      .then((response) => {
        if (!response.ok || !response.summary) {
          setSessionGoalError(response.error ?? 'Unable to load session summary.')
          setLastSessionSummary(null)
          return
        }
        setLastSessionSummary(response.summary)
      })
      .catch((error: unknown) => {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to load session summary.')
        setLastSessionSummary(null)
      })
      .finally(() => {
        setSessionSummaryLoading(false)
      })

    // Refresh XP after each session so the titlebar badge stays current (Q1-A: pull after session end).
    const getXpProgress = window.jplearnDesktop.getXpProgress
    if (getXpProgress) {
      void getXpProgress().then((xp) => { if (xp) setXpProgress(xp) }).catch(() => undefined)
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
  ])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await window.jplearnDesktop.getStudySummary()
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

  const notifyStartupReady = useCallback((deferredLoadsQueuedAtMs?: number) => {
    if (startupReadySentRef.current) return
    startupReadySentRef.current = true

    const startupReadyMs = Math.round(performance.now() - startupBootMarkRef.current)
    void window.jplearnDesktop
      .notifyStartupReady({
        startupReadyMs,
        firstSummaryMs: startupFirstSummaryMsRef.current,
        deferredLoadsQueuedAtMs,
      })
      .catch(() => undefined)
  }, [])

  const trackAssistantToastInteraction = useCallback(
    async (
      toast: AssistantToast,
      interactionType: 'clicked' | 'ignored' | 'expired',
      extraMetadata?: Record<string, string>,
    ): Promise<void> => {
      // Negative IDs are locally-generated toasts (not in the DB); nothing to track.
      if (toast.id <= 0) {
        return
      }

      const trackAssistantEvent = window.jplearnDesktop.trackAssistantEvent
      if (!trackAssistantEvent) {
        return
      }

      const metadata: Record<string, string> = {
        event_type: toast.eventType,
        message_key: toast.messageKey,
      }

      if (toast.targetMode) metadata.target_mode = toast.targetMode
      if (toast.focusArea) metadata.focus_area = toast.focusArea
      if (toast.actionType) metadata.action_type = toast.actionType
      if (extraMetadata) {
        for (const [key, value] of Object.entries(extraMetadata)) {
          const normalizedKey = key.trim()
          const normalizedValue = value.trim()
          if (normalizedKey && normalizedValue) {
            metadata[normalizedKey] = normalizedValue
          }
        }
      }

      try {
        await trackAssistantEvent({
          eventId: toast.id,
          interactionType,
          metadata,
        })
      } catch {
        // Telemetry path is best-effort only.
      }
    },
    [],
  )

  const queueAssistantToast = useCallback((toast: AssistantToast | null) => {
    if (!toast || settings.assistantToastLimit <= 0) {
      return
    }
    setAssistantToasts([toast])
  }, [settings.assistantToastLimit])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  // Fetch XP progress, study recommendations, and tutor reactions
  // on mount and whenever the summary refreshes.
  useEffect(() => {
    let mounted = true
    const getXp = window.jplearnDesktop.getXpProgress
    const getRecs = window.jplearnDesktop.getRecommendations
    const getTutor = window.jplearnDesktop.getTutorReactions
    const getPath = window.jplearnDesktop.getLearningPathStatus
    void Promise.all([
      getXp ? getXp().catch(() => null) : Promise.resolve(null),
      getRecs ? getRecs().catch(() => null) : Promise.resolve(null),
      getTutor ? getTutor().catch(() => null) : Promise.resolve(null),
      getPath ? getPath().catch(() => null) : Promise.resolve(null),
    ]).then(([xp, recs, tutor, path]) => {
      if (!mounted) return
      if (xp) setXpProgress(xp)
      if (recs) setRecommendations(recs.recommendations)
      if (tutor) setTutorReactions(tutor.reactions)
      if (path) setLearningPathStatus(path as LearningPathStatus)
    })
    return () => { mounted = false }
  }, [summary])

  useEffect(() => {
    const getAssistantSnapshotFn = window.jplearnDesktop.getAssistantSnapshot
    if (!getAssistantSnapshotFn) {
      return
    }

    let cancelled = false

    async function refreshAssistantSnapshot(): Promise<void> {
      try {
        const response = await getAssistantSnapshotFn!(activeSessionId ?? undefined)
        if (!response.ok || cancelled) return
        setAssistantProfile(response.snapshot.profile)
        setAssistantState(response.snapshot.state)
      } catch {
        // Snapshot is supplementary; keep study loop uninterrupted.
      }
    }

    void refreshAssistantSnapshot()

    return () => {
      cancelled = true
    }
  }, [activeSessionId, summary])

  useEffect(() => {
    const getAssistantEventsFn = window.jplearnDesktop.getAssistantEvents
    const consumeAssistantEventsFn = window.jplearnDesktop.consumeAssistantEvents
    if (!getAssistantEventsFn || !consumeAssistantEventsFn) {
      return
    }

    let disposed = false

    async function pullAssistantEvents(): Promise<void> {
      try {
        const response = await getAssistantEventsFn!(8)
        if (!response.ok || disposed || response.events.length === 0) {
          return
        }

        const fresh = response.events.filter((event) => !assistantSeenEventIdsRef.current.has(event.id))
        for (const event of fresh) {
          assistantSeenEventIdsRef.current.add(event.id)
        }

        const canShowToast = view === 'minigame' && sessionActive && roundState !== null
        if (fresh.length > 0 && settings.assistantToastLimit > 0 && canShowToast) {
          const priorityWeight: Record<AssistantEventPayload['priority'], number> = {
            critical: 4,
            coaching: 3,
            celebration: 2,
            info: 1,
          }
          const selectedEvent = fresh.reduce((best, candidate) => (
            priorityWeight[candidate.priority] >= priorityWeight[best.priority] ? candidate : best
          ))
          queueAssistantToast({
            id: selectedEvent.id,
            priority: selectedEvent.priority,
            eventType: selectedEvent.event_type,
            messageKey: selectedEvent.message_key,
            title: formatAssistantEventTitle(selectedEvent),
            body: formatAssistantEventBody(selectedEvent),
            targetMode: null,
            focusArea: selectedEvent.metadata.focus_area ?? null,
            actionType: null,
            actionLabel: 'Got it',
          })
        }

        await consumeAssistantEventsFn!(response.events.map((event) => event.id))
      } catch {
        // Non-blocking polling path.
      }
    }

    void pullAssistantEvents()
    const pollHandle = window.setInterval(() => {
      void pullAssistantEvents()
    }, ASSISTANT_EVENT_POLL_MS)

    return () => {
      disposed = true
      window.clearInterval(pollHandle)
    }
  }, [queueAssistantToast, roundState, sessionActive, settings.assistantToastLimit, view])

  useEffect(() => {
    if (settings.assistantToastLimit <= 0) {
      setAssistantToasts([])
      return
    }
    setAssistantToasts((previous) => previous.slice(-settings.assistantToastLimit))
  }, [settings.assistantToastLimit])

  useEffect(() => {
    if (view === 'minigame' && sessionActive && roundState !== null) {
      return
    }
    setAssistantToasts([])
  }, [roundState, sessionActive, view])

  useEffect(() => {
    if (assistantToasts.length <= 0) {
      return
    }

    const timeoutHandle = window.setTimeout(() => {
      const expiredToast = assistantToasts[0]
      void trackAssistantToastInteraction(expiredToast, 'expired', { reason: 'ttl' })
      setAssistantToasts((previous) => previous.slice(1))
    }, ASSISTANT_TOAST_TTL_MS)

    return () => {
      window.clearTimeout(timeoutHandle)
    }
  }, [assistantToasts, trackAssistantToastInteraction])

  const refreshAssistantChatHistory = useCallback(async (): Promise<boolean> => {
    const getAssistantChatHistory = window.jplearnDesktop.getAssistantChatHistory
    if (!getAssistantChatHistory) {
      return false
    }
    const clearTokenAtStart = assistantChatClearTokenRef.current
    try {
      const response = await getAssistantChatHistory(20)
      if (assistantChatClearTokenRef.current !== clearTokenAtStart) {
        // The chat was cleared while this read was in flight; do not resurrect
        // the old turns with stale data.
        return false
      }
      if (response.ok) {
        setAssistantChatMessages(response.turns)
        return true
      }
      return false
    } catch {
      // Chat history is optional and should never block study flow.
      return false
    }
  }, [])

  const refreshAssistantChatStatus = useCallback(async (): Promise<AssistantChatRuntimeStatus | null> => {
    const getAssistantChatRuntimeStatus = window.jplearnDesktop.getAssistantChatRuntimeStatus
    if (!getAssistantChatRuntimeStatus) {
      return null
    }
    try {
      const status = await getAssistantChatRuntimeStatus()
      setAssistantChatStatus(status)
      return status
    } catch {
      // Runtime status is optional metadata.
      return null
    }
  }, [])

  const hydrateAssistantChatFromPreloaded = useCallback(async (): Promise<boolean> => {
    const getPreloadedAssistantChatHistory = window.jplearnDesktop.getPreloadedAssistantChatHistory
    if (!getPreloadedAssistantChatHistory) {
      return false
    }
    const clearTokenAtStart = assistantChatClearTokenRef.current
    try {
      const response = await getPreloadedAssistantChatHistory()
      if (assistantChatClearTokenRef.current !== clearTokenAtStart) {
        return false
      }
      if (!response.ok || !response.runtimeActive) {
        return false
      }
      setAssistantChatMessages(response.turns)
      assistantChatHistoryHydratedRef.current = true
      return true
    } catch {
      return false
    }
  }, [])

  const isAssistantServerActive = useCallback((status: AssistantChatRuntimeStatus | null): boolean => {
    if (!status?.loaded) {
      return false
    }
    return String(status.activeProvider || '').trim().toLowerCase() === 'llama.cpp'
  }, [])

  const hydrateAssistantChatFromRuntime = useCallback(async (): Promise<boolean> => {
    const status = await refreshAssistantChatStatus()
    if (!isAssistantServerActive(status)) {
      return false
    }
    const hydrated = await refreshAssistantChatHistory()
    if (hydrated) {
      assistantChatHistoryHydratedRef.current = true
    }
    return hydrated
  }, [isAssistantServerActive, refreshAssistantChatHistory, refreshAssistantChatStatus])

  useEffect(() => {
    if (!settings.assistantChatEnabled) {
      return
    }

    let disposed = false

    const tryHydrate = async (): Promise<void> => {
      if (assistantChatHistoryHydratedRef.current || disposed) {
        return
      }
      const hydratedFromPreload = await hydrateAssistantChatFromPreloaded()
      if (hydratedFromPreload || assistantChatHistoryHydratedRef.current) {
        return
      }
      const hydratedFromRuntime = await hydrateAssistantChatFromRuntime()
      if (hydratedFromRuntime || assistantChatHistoryHydratedRef.current || disposed) {
        return
      }
      // No live runtime (e.g. local model not installed): load any persisted
      // chat history directly so earlier conversations appear on startup.
      const loadedFromStore = await refreshAssistantChatHistory()
      if (loadedFromStore) {
        assistantChatHistoryHydratedRef.current = true
      }
    }

    void tryHydrate()

    const startupHydrationPollHandle = window.setInterval(() => {
      void tryHydrate()
    }, 2000)

    return () => {
      disposed = true
      window.clearInterval(startupHydrationPollHandle)
    }
  }, [hydrateAssistantChatFromPreloaded, hydrateAssistantChatFromRuntime, refreshAssistantChatHistory, settings.assistantChatEnabled])

  useEffect(() => {
    if (settings.assistantChatAudioEnabled && assistantChatOpen) {
      return
    }
    cancelAssistantSpeech()
  }, [assistantChatOpen, cancelAssistantSpeech, settings.assistantChatAudioEnabled])

  useEffect(() => {
    if (!settings.assistantChatEnabled || !assistantChatOpen) {
      return
    }

    let disposed = false

    async function hydrateAssistantChatPanel(): Promise<void> {
      // Always surface persisted history when the panel opens, then layer in
      // any live-runtime hydration on top.
      await refreshAssistantChatHistory()
      if (disposed) return
      await hydrateAssistantChatFromRuntime()
      if (disposed) return
    }

    void hydrateAssistantChatPanel()

    const statusPollHandle = window.setInterval(() => {
      void hydrateAssistantChatFromRuntime()
    }, 10000)

    return () => {
      disposed = true
      window.clearInterval(statusPollHandle)
    }
  }, [assistantChatOpen, hydrateAssistantChatFromRuntime, refreshAssistantChatHistory, refreshAssistantChatStatus, settings.assistantChatEnabled])

  useEffect(() => {
    if (settings.assistantChatEnabled) {
      return
    }

    assistantChatHistoryHydratedRef.current = false
    setAssistantChatOpen(false)
    setAssistantChatLoading(false)
    setAssistantChatWarmup(false)
    setAssistantChatError(null)
    setAssistantChatFallbackNote(null)

    const unloadAssistantChatRuntime = window.jplearnDesktop.unloadAssistantChatRuntime
    if (!unloadAssistantChatRuntime) {
      return
    }
    void unloadAssistantChatRuntime().catch(() => undefined)
  }, [settings.assistantChatEnabled])

  // Avoid background tutor runtime warmup on startup.
  // Runtime loads lazily when the user sends a chat request.

  const closeAssistantChat = useCallback(() => {
    cancelAssistantSpeech()
    setAssistantChatOpen(false)
    setAssistantChatError(null)
    setAssistantChatWarmup(false)
    setAssistantChatFallbackNote(null)
  }, [cancelAssistantSpeech])

  const clearAssistantChat = useCallback(async () => {
    // Invalidate any in-flight history reads so a slow background fetch can't
    // resurrect the conversation after the user clears it.
    assistantChatClearTokenRef.current += 1
    assistantChatHistoryHydratedRef.current = true
    setAssistantChatMessages([])
    setAssistantChatError(null)
    const clearHistory = window.jplearnDesktop.clearAssistantChatHistory
    if (!clearHistory) {
      return
    }
    try {
      await clearHistory()
    } catch {
      // Clearing persisted history is best effort; the visible log is already empty.
    }
  }, [])

  useEffect(() => {
    if (!assistantChatOpen) {
      return
    }
    const log = assistantChatLogRef.current
    if (!log) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [assistantChatOpen, assistantChatMessages, assistantChatLoading])

  const sendAssistantChat = useCallback(async (forcedMessage?: string) => {
    if (!settings.assistantChatEnabled) {
      setAssistantChatError('Chatbot is disabled in settings.')
      return
    }

    const sendAssistantChatMessage = window.jplearnDesktop.sendAssistantChatMessage
    if (!sendAssistantChatMessage) {
      setAssistantChatError('Assistant chat runtime is unavailable in this build.')
      return
    }

    const message = (forcedMessage ?? assistantChatInput).trim()
    if (!message) {
      return
    }
    if (message.length > ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT) {
      setAssistantChatError(`User chat is limited to ${ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT} characters.`)
      return
    }

    // Optimistically render the user's message immediately, then show a typing
    // indicator while the model responds (refreshAssistantChatHistory replaces
    // these turns with the authoritative server history once the reply lands).
    const optimisticTurn: AssistantChatTurn = {
      role: 'user',
      content: message,
      created_at_utc: new Date().toISOString(),
    }
    setAssistantChatMessages((previous) => [...previous, optimisticTurn])
    setAssistantChatInput('')
    setAssistantChatLoading(true)
    setAssistantChatError(null)
    setAssistantChatWarmup(!assistantChatStatus?.loaded)
    try {
      const response = await sendAssistantChatMessage({
        message,
        context: {
          session_id: activeSessionId ?? '',
        },
      })
      if (response.provider === 'scripted-fallback' || response.provider === 'stub-fallback') {
        setAssistantChatFallbackNote('Local model unavailable. Scripted coach mode is active for this chat turn.')
      } else {
        setAssistantChatFallbackNote(null)
      }
      await refreshAssistantChatStatus()
      await refreshAssistantChatHistory()
      if (response.text) {
        void speakAssistantReply(response.text)
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'Unable to send assistant chat message.'
      if (/llama\.cpp exited with code 130/i.test(detail) || /inference cancelled/i.test(detail)) {
        setAssistantChatError('Chat inference cancelled.')
      } else {
        setAssistantChatError(detail)
      }
    } finally {
      setAssistantChatWarmup(false)
      setAssistantChatLoading(false)
    }
  }, [activeSessionId, assistantChatInput, assistantChatStatus?.loaded, refreshAssistantChatHistory, refreshAssistantChatStatus, settings.assistantChatEnabled, speakAssistantReply])

  const handleOcrWorkbenchImageSelected = useCallback(async (file: File) => {
    if (file.size > ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_BYTES) {
      setOcrWorkbenchError(`Image uploads are limited to ${ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB} MB.`)
      return
    }
    if (!file.type.startsWith('image/')) {
      setOcrWorkbenchError('Please choose a PNG, JPEG, or WEBP image.')
      return
    }

    const extractAssistantChatImageText = window.jplearnDesktop.extractAssistantChatImageText
    if (!extractAssistantChatImageText) {
      setOcrWorkbenchError('Image Translation is unavailable in this build.')
      return
    }
    if (!tutorInstallInfo?.ocrInstalled) {
      setOcrWorkbenchError('Image Translation is not installed. Install it in Settings > Tutor > Image Translation.')
      return
    }
    const translateAssistantChatOcrText = window.jplearnDesktop.translateAssistantChatOcrText
    if (!translateAssistantChatOcrText) {
      setOcrWorkbenchError('Offline OCR translation runtime is unavailable in this build.')
      return
    }

    setOcrWorkbenchBusy(true)
    setOcrWorkbenchError(null)
    try {
      const payload = await prepareAssistantChatImagePayload(file)
      const ocrResponse = await extractAssistantChatImageText({
        ...payload,
        minConfidence: settings.assistantChatOcrMinConfidence,
      })
      const extractedText = typeof ocrResponse?.text === 'string' ? ocrResponse.text.trim() : ''
      if (!extractedText) {
        setOcrWorkbenchError('No readable text was found in that image.')
        return
      }

      const translationResponse = await translateAssistantChatOcrText({
        text: extractedText,
        sourceLang: 'ja',
        targetLang: 'en',
        fastMode: true,
      })
      const rawEnglishText = (translationResponse?.text ?? '').trim()
      const finalEnglishText = normalizeTranslationWhitespace(sanitizeOcrTranslationText(rawEnglishText))

      if (!finalEnglishText) {
        setOcrWorkbenchError('No translation text returned.')
        return
      }

      const lineCount = Number.isFinite(ocrResponse?.lineCount)
        ? Math.max(0, Math.trunc(ocrResponse.lineCount))
        : extractedText.split(/\n+/).filter(Boolean).length
      setOcrWorkbenchResult({
        fileName: file.name,
        lineCount,
        japaneseText: extractedText,
        englishText: finalEnglishText,
      })
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'Unable to process image translation.'
      setOcrWorkbenchError(detail)
    } finally {
      setOcrWorkbenchBusy(false)
      if (ocrWorkbenchImageInputRef.current) {
        ocrWorkbenchImageInputRef.current.value = ''
      }
    }
  }, [settings.assistantChatOcrMinConfidence, tutorInstallInfo?.ocrInstalled])

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
          void getBlockProgressDeduped(script)
            .then((blockPayload) => {
              if (cancelled) return
              scriptBlockCacheRef.current[script] = normalizeBlockList(blockPayload.blocks)
            })
            .catch(() => undefined)
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

    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
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
    setLivesRemaining(DEFAULT_LIVES)
    setLeechFocusEnabled(false)
    resetRoundCycle()

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
          void getDeckCardsDeduped(KANJI_CATEGORY_TO_DECK_SLUG[cat])
            .then((payload) => {
              const normalizedCards = normalizeDeckCards(payload.cards)
              kanjiCategoryDeckCacheRef.current[cat] = normalizedCards
              setKanjiDeckCardsByCategory((previous) => ({
                ...previous,
                [cat]: normalizedCards,
              }))
            })
            .catch(() => undefined)

          void getBlockProgressDeduped(KANJI_CATEGORY_TO_DECK_SLUG[cat])
            .then((payload) => {
              kanjiCategoryBlockCacheRef.current[cat] = normalizeBlockList(payload.blocks)
            })
            .catch(() => undefined)
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
          void getDeckCardsDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
            .then((payload) => {
              const normalizedCards = normalizeDeckCards(payload.cards)
              vocabCategoryDeckCacheRef.current[cat] = normalizedCards
              setVocabDeckCardsByCategory((previous) => ({
                ...previous,
                [cat]: normalizedCards,
              }))
            })
            .catch(() => undefined)

          void getBlockProgressDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
            .then((payload) => {
              vocabCategoryBlockCacheRef.current[cat] = normalizeBlockList(payload.blocks)
            })
            .catch(() => undefined)
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

        if (!resolvedCards) {
          const deckPayload = await getDeckCardsDeduped(script)
          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }
          resolvedCards = limitRuntimeDeckCards(script, normalizeDeckCards(deckPayload.cards))
          scriptDeckCacheRef.current[script] = resolvedCards
        }

        setDeckCards(resolvedCards ?? [])

        if (resolvedBlocks) {
          const blocks = resolvedBlocks
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
          setBlockProgress([])
          setActiveBlockIndex(0)
          void getBlockProgressDeduped(script)
            .then((payload) => {
              if (scriptLoadRequestIdRef.current !== requestId) {
                return
              }
              const normalizedBlocks = normalizeBlockList(payload.blocks)
              scriptBlockCacheRef.current[script] = normalizedBlocks
              setBlockProgress(normalizedBlocks)
              if (normalizedBlocks.length > 0) {
                const lastUnlocked = normalizedBlocks.reduce(
                  (best, b) => (b.unlocked ? b.index : best),
                  0,
                )
                setActiveBlockIndex(lastUnlocked)
              }
            })
            .catch(() => undefined)
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
    void window.jplearnDesktop
      .getOverviewCharacterMastery()
      .then((payload) => {
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      })
      .catch(() => undefined)
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

    const getGrammarData = window.jplearnDesktop.getGrammarMinigameData
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

      if (minigame === 'listening_prompt_first') {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-listening-prompt-meaning`,
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
          hintText: exampleSentenceHint ?? `Hear ${card.character} and choose its meaning.`,
          dictionarySeedQuery,
          dictionaryNote,
          promptLabel: surprisePrompt ? surpriseLabel : 'Hear the pronunciation and choose the meaning.',
          focusText: card.character,
          answer: card.meaning,
          options,
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

  const startSession = useCallback(async (selectedGame: MinigameKey = activeGame) => {
    setSessionStartPending(true)
    resetRoundCycle()
    setSessionGoalError(null)
    setLastSessionSummary(null)
    setSessionRunReport(null)
    setActiveSessionId(null)

    setSessionScore(0)
    setSessionRounds(0)
    setSessionPoints(0)
    setSessionConfidenceCount(0)
    setSessionConfidenceTotal(0)
    setLivesRemaining(DEFAULT_LIVES)

    try {
      const leechPool = activeBlockCards.filter((card) => card.is_leech)
      const sourceCards = leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards
      const modeSelection = nextRoundMode(selectedGame)
      const modeCards = isImposterMode(modeSelection.mode)
        ? narrativePriorityCards(sourceCards)
        : sourceCards
      const goalTargetItems = Math.max(1, Math.floor(sessionTargetItems))

      const goalRequest = window.jplearnDesktop.startSessionGoal({
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
        if (leechFocusEnabled && leechPool.length === 0) {
          setGameError('No active leech cards in this block yet. Disable focused review mode to continue.')
        } else {
          setGameError('Not enough cards in this block for the selected minigame yet.')
        }
        return
      }

      setSessionActive(true)
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
      void goalRequest
        .then((goalResponse: SessionGoalStartResponse) => {
          if (!goalResponse.ok) {
            setSessionGoalError('Unable to start session goal.')
            return
          }
          setActiveSessionId(goalResponse.goal.session_id)
        })
        .catch((error: unknown) => {
          setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session goal.')
        })
    } catch (error: unknown) {
      setSessionActive(false)
      setRoundState(null)
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
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = null
      feedbackAdvanceRef.current?.()
      feedbackAdvanceRef.current = null
    }
  }, [])

  const launchAssistantToastAction = useCallback((toast: AssistantToast) => {
    void trackAssistantToastInteraction(toast, 'clicked', { reason: 'cta-click' })
    const suggestedScript = inferScriptFromFocusArea(toast.focusArea) ?? activeScript
    const suggestedGame = toast.targetMode ?? 'interleave_mix'
    const minigame = resolveScriptMinigame(suggestedScript, suggestedGame)

    setActiveGame(minigame)
    setNavDirection('forward')
    setView('minigame')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setLivesRemaining(DEFAULT_LIVES)
    resetRoundCycle()
    setAssistantToasts((previous) => previous.filter((item) => item.id !== toast.id))

    if (suggestedScript !== activeScript) {
      setActiveScript(suggestedScript)
      setResumeRequest({ script: suggestedScript, minigame })
      return
    }

    void startSession(minigame)
  }, [activeScript, resetRoundCycle, resolveScriptMinigame, startSession, trackAssistantToastInteraction])

  const continueLastSession = useCallback(() => {
    if (!sessionRunReport) return

    const script = sessionRunReport.script
    const minigame = resolveScriptMinigame(script, sessionRunReport.minigame)

    setActiveGame(minigame)
    setNavDirection('forward')
    setView('minigame')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setLivesRemaining(DEFAULT_LIVES)
    resetRoundCycle()

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
      setRoundState(null)
      setSessionActive(false)
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
            : null
      const isCorrect =
        typedAssessment !== null
          ? typedAssessment !== 'incorrect'
          : normalizeText(answer) === normalizeText(roundState.answer)
      const responseMs =
        roundPresentedAtRef.current > 0
          ? Math.max(0, performance.now() - roundPresentedAtRef.current)
          : PERFORMANCE_GOOD_MS
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
        if ((roundState.mode === 'typed_recall' || roundState.mode === 'speech_recall') && typedAssessment === 'near_miss') {
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
      } else {
        if (livesEnabled) {
          nextLives = Math.max(0, livesRemaining - 1)
          setLivesRemaining(nextLives)
        }
        if (isImposterMode(roundState.mode)) {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage - 1)
          setRoundFeedback(`Not quite. Stage ${roundState.curriculumStage} → ${nextStage}.`)
        } else {
          setRoundFeedback('Not quite — the answer is shown below.')
        }
        setRoundFeedbackTone('error')
        setRoundFeedbackPoints(0)
        setRoundFeedbackAnswer(
          roundState.answerDisplay && roundState.answerDisplay.trim().length > 0
            ? roundState.answerDisplay
            : formatExpectedAnswer(roundState.answer),
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
      }

      const nextFeedbackAdvanceMs = isCorrect ? FEEDBACK_REVEAL_SUCCESS_MS : FEEDBACK_REVEAL_MS
      setFeedbackAdvanceMs(nextFeedbackAdvanceMs)

      const confidenceForAnswer = confidenceCaptureEnabled ? roundConfidenceScore : undefined

      const resultSlug: DeckSlugInput =
        activeScript === 'kanji_n5'
          ? KANJI_CATEGORY_TO_DECK_SLUG[activeKanjiCategory]
          : activeScript === 'vocab_n5'
            ? VOCAB_CATEGORY_TO_DECK_SLUG[activeVocabCategory]
            : activeScript
      studyQueueCacheRef.current.delete(resultSlug)

      void window.jplearnDesktop.recordGameResult({
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
      }).then((result) => {
        if (
          !isGrammarCurriculumMode(roundState.mode) ||
          typeof result.curriculum_stage !== 'number'
        ) {
          return
        }
        const resolvedStage = normalizeCurriculumStage(result.curriculum_stage)
        setDeckCards((previousCards) =>
          previousCards.map((entry) =>
            entry.id === roundState.cardId
              ? { ...entry, curriculum_stage: resolvedStage }
              : entry,
          ),
        )
      }).catch(() => undefined)

      if (typeof confidenceForAnswer === 'number') {
        setSessionConfidenceCount((value) => value + 1)
        setSessionConfidenceTotal((value) => value + confidenceForAnswer)
      }

      const nextToastId = localToastIdRef.current - 1
      localToastIdRef.current = nextToastId
      queueAssistantToast(buildRoundCoachToast(nextToastId, {
        isCorrect,
        mode: roundState.mode,
        nextStreak,
        answer: roundState.answer,
        completedRoundsAfterAnswer,
        targetRounds,
        typedAssessment,
      }))

      const advanceFeedback = () => {
        feedbackTimerRef.current = null
        feedbackAdvanceRef.current = null
        if (!isCorrect && livesEnabled && nextLives <= 0) {
          setSessionActive(false)
          setRoundState(null)
          setGameError('Out of lives. Press Play to start a new run.')
          setRoundFeedback(null)
          setRoundFeedbackTone(null)
          setRoundFeedbackPoints(null)
          setRoundFeedbackAnswer(null)
          setIsRoundResolving(false)
          return
        }

        if (completedRoundsAfterAnswer >= targetRounds) {
          setSessionActive(false)
          setRoundState(null)
          setRoundFeedback(null)
          setRoundFeedbackTone(null)
          setRoundFeedbackPoints(null)
          setRoundFeedbackAnswer(null)
          setIsRoundResolving(false)
          return
        }

        void nextRound()
        setRoundFeedback(null)
        setRoundFeedbackTone(null)
        setRoundFeedbackPoints(null)
        setRoundFeedbackAnswer(null)
        setIsRoundResolving(false)
      }
      feedbackAdvanceRef.current = advanceFeedback
      feedbackTimerRef.current = window.setTimeout(advanceFeedback, nextFeedbackAdvanceMs)
    },
    [activeGame, activeKanjiCategory, activeScript, activeSessionId, activeVocabCategory, confidenceCaptureEnabled, isRoundResolving, livesEnabled, livesRemaining, nextRound, queueAssistantToast, roundConfidenceScore, roundState, scriptStats, sessionRounds, sessionTargetItems],
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
          setAssistantChatOpen(false)
          setOcrWorkbenchOpen(false)
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

        if (assistantChatOpen) {
          closeAssistantChat()
          return
        }

        if (ocrWorkbenchOpen) {
          closeOcrWorkbench()
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

      if (showSettings || assistantChatOpen || ocrWorkbenchOpen || isInput) return

      if (event.key === '6') {
        setDictionaryOpen(false)
        setShowOverview(true)
        setShowSettings(false)
        setOcrWorkbenchOpen(false)
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

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [assistantChatOpen, closeAssistantChat, closeOcrWorkbench, loadSummary, ocrWorkbenchOpen, selectedChar, shortcutMenuOpen, showOverview, showSettings, view])

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

  const activeScriptStats = scriptStats[activeScript]
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

  const speechRecognitionModelEnabled = useMemo(() => {
    if (!tutorInstallInfo) {
      return true
    }
    const activeTier = tutorInstallInfo.activeSpeechModelTier
    if (!activeTier) {
      return false
    }
    return tutorInstallInfo.speechModels.some((model) => model.tier === activeTier && model.installed)
  }, [tutorInstallInfo])
  const speechRecognitionLockReason = 'Install and enable a speech recognition model in Settings > Voice to use Speech Recall.'

  const voiceRuntimeRunning = useMemo(() => {
    const hasVoiceStatusApi = typeof window.jplearnDesktop.getVoiceStatus === 'function'
    if (!hasVoiceStatusApi || !voiceStatusChecked) {
      return true
    }
    if (!voiceStatus) {
      return false
    }
    return voiceStatus.available && voiceStatus.modelReady && !voiceStatus.downloading
  }, [voiceStatus, voiceStatusChecked])

  const listeningLockReason = useMemo(() => {
    if (voiceRuntimeRunning) {
      return null
    }
    const detail = voiceStatus?.lastError?.trim()
    if (detail) {
      return `VOICEVOX runtime is not running (${detail}). Start it in Settings > Voice.`
    }
    return 'VOICEVOX runtime is not running. Start it in Settings > Voice.'
  }, [voiceRuntimeRunning, voiceStatus?.lastError])

  const minigameLockReasons = useMemo(() => {
    const reasons: Partial<Record<MinigameKey, string>> = {}
    if (!speechRecognitionModelEnabled) {
      reasons.speech_recall = speechRecognitionLockReason
    }
    if (listeningLockReason) {
      reasons.listening_audio_first = listeningLockReason
      reasons.listening_prompt_first = listeningLockReason
    }
    return reasons
  }, [listeningLockReason, speechRecognitionModelEnabled])

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
    void window.jplearnDesktop.getOverviewCharacterMastery()
      .then((payload) => {
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      })
      .catch(() => undefined)
      .finally(() => setOverviewBlocksLoading(false))
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
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    resetRoundCycle()
    setShowSettings(false)
    setOcrWorkbenchOpen(false)
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
    setAssistantChatOpen(false)
    setOcrWorkbenchOpen(false)
    void loadSummary()
    closeShortcutMenu()
  }, [closeShortcutMenu, loadSummary])

  const jumpToScriptHub = useCallback((script: ScriptKey) => {
    setNavDirection('forward')
    setActiveScript(script)
    setView('script_hub')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    resetRoundCycle()
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
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setLivesRemaining(DEFAULT_LIVES)
    resetRoundCycle()

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
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setLivesRemaining(DEFAULT_LIVES)
    resetRoundCycle()
    closeShortcutMenu()
  }, [closeShortcutMenu, resetRoundCycle, resolveScriptMinigame])

  const openSettingsFromMenu = useCallback(() => {
    setDictionaryOpen(false)
    setShowSettings(true)
    setShowOverview(false)
    setAssistantChatOpen(false)
    setOcrWorkbenchOpen(false)
    closeShortcutMenu()
  }, [closeShortcutMenu])

  const refreshDataFromMenu = useCallback(() => {
    void loadSummary()
    closeShortcutMenu()
  }, [closeShortcutMenu, loadSummary])

  const inspectElementFromMenu = useCallback(async () => {
    try {
      await window.jplearnDesktop.openInspectElement?.()
    } catch {
      // Devtools action is best effort in development contexts.
    } finally {
      closeShortcutMenu()
    }
  }, [closeShortcutMenu])

  const resetStudyDb = useCallback(async () => {
    setResettingDb(true)
    setError(null)
    try {
      await window.jplearnDesktop.resetStudyDb()
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
      setCardScores(emptyScores)
      setScriptStats(emptyStats)
      setMinigameStats(defaultMinigameStatsByScript())
      setSessionActive(false)
      setRoundState(null)
      setRoundInput('')
      setRoundFeedback(null)
      setRoundFeedbackTone(null)
      setRoundFeedbackPoints(null)
      setRoundFeedbackAnswer(null)
      setIsRoundResolving(false)
      setSessionStartPending(false)
      setSessionSummaryLoading(false)
      setSessionGoalError(null)
      setLastSessionSummary(null)
      setSessionRunReport(null)
      setActiveSessionId(null)
      setGameError(null)
      setLivesRemaining(DEFAULT_LIVES)
      resetRoundCycle()
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
    void window.jplearnDesktop.minimizeWindow()
  }, [])

  const toggleMaximizeWindow = useCallback(() => {
    void window.jplearnDesktop
      .toggleMaximizeWindow()
      .then(() => window.jplearnDesktop.isWindowMaximized())
      .then((state) => {
        setIsWindowMaximized(state.isMaximized)
      })
      .catch(() => undefined)
  }, [])

  const closeWindow = useCallback(() => {
    void window.jplearnDesktop.closeWindow()
  }, [])

  // Handles completion of the onboarding form: seeds deck expertise, persists answers, sets path.
  const handleOnboardingComplete = useCallback(async (
    pathId: string | null,
    checkedItems: Set<string>,
    answers: { goal?: string; dailyMinutes?: number; targetLevel?: string },
  ) => {
    const level = deriveExpertiseLevelFromChecked(checkedItems)
    try {
      await window.jplearnDesktop.applyExpertiseLevel(level)
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
      const result = await window.jplearnDesktop.setLearningPath?.(pathId).catch(() => undefined)
      if (result) setLearningPathStatus(result as LearningPathStatus)
    } else {
      const result = await window.jplearnDesktop.completeOnboarding?.(answers).catch(() => undefined)
      if (result) setLearningPathStatus(result as LearningPathStatus)
    }
    await loadSummary()
  }, [getDeckCardsDeduped, loadSummary, refreshDeckProgressAfterSeedChange])

  const resolvedBackgroundUrls = useMemo(() => {
    const next: Partial<Record<BackgroundStyle, string>> = {}
    BACKGROUND_OPTIONS.forEach((option) => {
      if (!option.imagePath) return
      next[option.key] = resolveBackgroundImageUrl(option.imagePath)
    })
    return next
  }, [])

  useEffect(() => {
    let cancelled = false

    async function preloadBackgroundAssets(): Promise<void> {
      const photoOptions = BACKGROUND_OPTIONS.filter(
        (option): option is (typeof BACKGROUND_OPTIONS)[number] & { imagePath: string } => Boolean(option.imagePath),
      )

      const previewMap: Partial<Record<BackgroundStyle, string>> = {}

      await Promise.all(
        photoOptions.map(async (option) => {
          const src = resolvedBackgroundUrls[option.key]
          if (!src) return

          const image = new Image()
          image.decoding = 'async'
          image.src = src

          try {
            await image.decode()
          } catch {
            await new Promise<void>((resolve) => {
              image.onload = () => resolve()
              image.onerror = () => resolve()
            })
          }

          if (cancelled) return
          backgroundImageCacheRef.current[option.key] = image

          const previewDataUrl = createBackgroundPreviewDataUrl(image, 272, 112)
          if (previewDataUrl) {
            previewMap[option.key] = previewDataUrl
          }
        }),
      )

      if (!cancelled) {
        setBackgroundPreviewUrls((previous) => ({
          ...previous,
          ...previewMap,
        }))
      }
    }

    void preloadBackgroundAssets()

    return () => {
      cancelled = true
    }
  }, [resolvedBackgroundUrls])

  const selectedBackgroundOption =
    BACKGROUND_OPTIONS.find((option) => option.key === settings.backgroundStyle) ?? BACKGROUND_OPTIONS[0]
  const selectedBackgroundUrl = selectedBackgroundOption.key === 'custom_upload'
    ? settings.customBackgroundDataUrl ?? undefined
    : (selectedBackgroundOption.imagePath
      ? resolvedBackgroundUrls[selectedBackgroundOption.key]
      : undefined)
  const appShellStyle = {
    '--background-image': selectedBackgroundUrl ? `url("${selectedBackgroundUrl}")` : 'none',
    '--background-blur': `${clampBackgroundBlur(settings.backgroundBlur)}px`,
  } as CSSProperties

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
  const activeAssistantToast = assistantToasts[0] ?? null
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
    const getPath = window.jplearnDesktop.getLearningPathStatus
    if (getPath) {
      void getPath().then((path) => {
        if (path) {
          setLearningPathStatus(path as LearningPathStatus)
        }
      }).catch(() => undefined)
    }
    void loadSummary()
    void refreshTutorInstallInfo()
  }, [loadSummary, refreshTutorInstallInfo])

  const hasInstalledTutorModel = Boolean(
    tutorInstallInfo?.llamaCppInstalled
      && (tutorInstallInfo?.models ?? []).some((model) => model.installed),
  )
  const showOnboardingChatbotSection = tutorInstallInfo ? hasInstalledTutorModel : true
  const showOnboardingVoiceSection = tutorInstallInfo ? tutorInstallInfo.voiceInstalled : true
  const showOnboardingFontSection = tutorInstallInfo ? tutorInstallInfo.fontsInstalled : true

  // Show setup wizard on first run (all hooks above must run unconditionally)
  if (showWizard === true) {
    return <SetupWizard onComplete={handleSetupWizardComplete} />
  }
  if (showWizard === null) {
    // Brief check in progress — render nothing to avoid flash
    return null
  }

  return (
    <main className="app-shell" data-background-style={settings.backgroundStyle} style={appShellStyle}>
      <header className="window-titlebar" aria-label="Window controls">
        <span className="window-titlebar-wordmark" aria-hidden="true">JPLearn</span>
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
                      aria-expanded={activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools'}
                      onClick={() => {
                        setActiveShortcutFlyout((current) => (
                          current === null || current === 'dev_tools'
                            ? 'all_maps'
                            : null
                        ))
                      }}
                    >
                      <ListChecks className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                      All Maps
                      <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' ? '▾' : '▸'}</span>
                    </button>

                    {activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' ? (
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
                      aria-expanded={activeShortcutFlyout === 'dev_tools'}
                      onClick={() => {
                        setActiveShortcutFlyout((current) => (current === 'dev_tools' ? null : 'dev_tools'))
                      }}
                    >
                      <Code2 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                      Developer Tools
                      <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout === 'dev_tools' ? '▾' : '▸'}</span>
                    </button>

                    {activeShortcutFlyout === 'dev_tools' ? (
                      <div className="titlebar-shortcut-righttree" role="group" aria-label="Developer tools">
                        <button
                          type="button"
                          role="menuitem"
                          className="titlebar-shortcut-item titlebar-shortcut-leaf"
                          onClick={() => { void inspectElementFromMenu() }}
                        >
                          <span className="titlebar-shortcut-glyph" aria-hidden="true">&lt;/&gt;</span>
                          Inspect Element
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
                setAssistantChatOpen(false)
                setAssistantChatError(null)
                setOcrWorkbenchOpen((open) => !open)
                setOcrWorkbenchError(null)
              }}
              aria-expanded={ocrWorkbenchOpen}
              aria-controls="ocr-workbench-panel"
              aria-label={ocrWorkbenchOpen ? 'Close OCR translator' : 'Open OCR translator'}
              title={ocrWorkbenchOpen ? 'Close OCR translator' : 'Open OCR translator'}
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
            {settings.assistantChatEnabled ? (
              <button
                type="button"
                className="window-nav-button"
                onClick={() => {
                  setDictionaryOpen(false)
                  setShowOverview(false)
                  setShowSettings(false)
                  setOcrWorkbenchOpen(false)
                  setShortcutMenuOpen(false)
                  setActiveShortcutFlyout(null)
                  setAssistantChatOpen((open) => !open)
                  setAssistantChatError(null)
                }}
                aria-expanded={assistantChatOpen}
                aria-controls="assistant-chat-panel"
                aria-label={assistantChatOpen ? 'Close tutor chat' : 'Open tutor chat'}
                title={assistantChatOpen ? 'Close tutor chat' : 'Open tutor chat'}
              >
                <MessageCircle className="window-nav-icon" strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
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
                <span className="titlebar-xp-percent">{xpPercent}%</span>
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
          <div className="page-loading-widget">
            <span className="page-loading-label">{pageLoadingLabel}</span>
            <div className="page-loading-track">
              <div className="page-loading-fill" />
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
        isRoundResolving,
        feedbackAdvanceMs,
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
        voiceBusy,
        voiceUnavailable,
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
        playAudio: (text) => { void playQuestionAudio(text) },
      }}>
      {/* Home is the main landing surface; keep it mounted only for home view. */}
      {view === 'home' && !loading && learningPathStatus && !learningPathStatus.onboarding_complete ? (
        <OnboardingView
          navDirection={navDirection}
          showChatbotSection={showOnboardingChatbotSection}
          assistantChatEnabled={settings.assistantChatEnabled}
          onAssistantChatToggle={() => {
            setSettings((prev) => ({ ...prev, assistantChatEnabled: !prev.assistantChatEnabled }))
          }}
          showVoiceSection={showOnboardingVoiceSection}
          voiceOptions={voiceOptions}
          voiceEnabled={settings.voiceEnabled}
          voiceSpeaker={settings.voiceSpeaker}
          voiceBusy={voiceBusy}
          onVoiceToggle={() => setSettings((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
            onVoiceSelect={(id) => {
            setSettings((prev) => ({ ...prev, voiceSpeaker: id }))
            void playQuestionAudio(VOICE_SAMPLE_LINE, id)
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
          onSelectPath={(pathId, checkedItems, answers) => {
            void handleOnboardingComplete(pathId, checkedItems, answers)
          }}
          onSkip={(checkedItems, answers) => {
            void handleOnboardingComplete(null, checkedItems, answers)
          }}
        />
      ) : view === 'home' ? (
        <HomeView
          navDirection={navDirection}
          studyPlan={studyPlan}
          homeStudyPlanExpanded={homeStudyPlanExpanded}
          learningPathStatus={learningPathStatus}
          tutorBanner={tutorReactions[0] ? {
            dedupKey: tutorReactions[0].dedup_key,
            headline: normalizeTrackTerms(tutorReactions[0].headline),
            body: normalizeTrackTerms(tutorReactions[0].body),
            cta: normalizeTrackTerms(tutorReactions[0].cta),
            messageType: tutorReactions[0].message_type,
          } : null}
          recommendations={recommendations.map((r) => ({
            nodeId: r.node_id,
            displayLabel: r.display_label,
            reviewCount: r.review_count,
            difficulty: r.difficulty,
            reason: r.reason,
          }))}
          onDismissTutorBanner={(key) => {
            setTutorReactions((prev) => prev.filter((r) => r.dedup_key !== key))
            void window.jplearnDesktop.dismissTutorReaction?.(key).catch(() => undefined)
          }}
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
            setAssistantChatOpen(false)
            setOcrWorkbenchOpen(false)
            setNavDirection('forward')
            setView('jlpt_prep')
          }}
          onToggleStudyPlan={() => setHomeStudyPlanExpanded((expanded) => !expanded)}
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
            setAssistantChatOpen(false)
            setOcrWorkbenchOpen(false)
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
          leechCardsLength={leechCards.length}
          minigameStats={minigameStats}
          availableMinigames={availableMinigames}
          activeScriptStats={activeScriptStats}
          activeSectionName={activeSectionName}
          minigameLockReasons={minigameLockReasons}
          onBack={goHome}
          onOpenSettings={openSettingsFromMenu}
          onSelectBlock={(index) => {
            setActiveBlockIndex(index)
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
          }}
          onSelectKanjiLevel={(level) => {
            setActiveKanjiLevel(level)
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
          }}
          onSelectVocabLevel={(level) => {
            setActiveVocabLevel(level)
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
          }}
          onSelectKanjiCategory={(cat) => {
            setActiveKanjiCategory(cat)
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
          }}
          onSelectVocabCategory={(cat) => {
            setActiveVocabCategory(cat)
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
          }}
          onToggleLearningPath={() => setLearningPathExpanded((expanded) => !expanded)}
          onSelectGame={(game) => {
            setActiveGame(game)
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
          }}
          onPlayGame={(game) => {
            setActiveGame(game)
            setNavDirection('forward')
            setView('minigame')
            setSessionActive(false)
            setRoundState(null)
            setRoundFeedback(null)
            setRoundFeedbackTone(null)
            setRoundFeedbackPoints(null)
            setRoundFeedbackAnswer(null)
            setIsRoundResolving(false)
            setLivesRemaining(DEFAULT_LIVES)
            resetRoundCycle()
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
          activeBlockCards={activeBlockCards}
          onBack={() => {
            setNavDirection('back')
            setView('script_hub')
          }}
          onOpenDictionary={(seedQuery) => openDictionary(seedQuery ?? '')}
          onOpenSettings={openSettingsFromMenu}
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
            className="overview-popup-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Study Overview"
            onClick={(e) => e.stopPropagation()}
          >
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
        onPlayAudio={(text) => { void playQuestionAudio(text) }}
        voiceBusy={voiceBusy}
        voiceUnavailable={voiceUnavailable}
      />

      {ocrWorkbenchOpen ? (
        <div
          className="modal-backdrop assistant-backdrop ocr-workbench-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeOcrWorkbench()
            }
          }}
        >
          <section
            id="ocr-workbench-panel"
            className="assistant-chat-panel assistant-chat-window"
            role="dialog"
            aria-modal="true"
            aria-label="OCR translator panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="assistant-chat-header">
              <div className="assistant-chat-identity">
                <span className="assistant-chat-avatar" aria-hidden="true">
                  <ImagePlus size={18} strokeWidth={2.2} />
                  <span className="assistant-chat-presence" />
                </span>
                <span className="assistant-chat-identity-text">
                  <span className="assistant-chat-title">OCR Translator</span>
                  <span className="assistant-chat-subtitle">
                    {ocrWorkbenchBusy ? 'Reading image…' : 'Upload Japanese text image to translate'}
                  </span>
                </span>
              </div>
              <div className="assistant-chat-header-actions">
                <button
                  type="button"
                  className="assistant-chat-clear"
                  onClick={() => {
                    setOcrWorkbenchResult(null)
                    setOcrWorkbenchError(null)
                  }}
                  disabled={ocrWorkbenchBusy || (!ocrWorkbenchResult && !ocrWorkbenchError)}
                  aria-label="Clear OCR result"
                  title="Clear"
                >
                  <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="assistant-chat-close"
                  onClick={closeOcrWorkbench}
                  aria-label="Close OCR translator"
                >
                  <X size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="assistant-chat-log" role="log" aria-live="polite">
              {!ocrWorkbenchResult ? (
                <p className="assistant-chat-empty">Select an image to extract Japanese text and get an English translation in one response.</p>
              ) : (
                <article className="assistant-chat-turn assistant-chat-turn-assistant ocr-workbench-result-card" style={{ maxWidth: '100%' }}>
                  <div className="assistant-chat-turn-meta">
                    <span className="assistant-chat-turn-role">OCR + Tutor</span>
                  </div>
                  <div className="ocr-workbench-source-meta">
                    <span className="ocr-workbench-source-label">Source image</span>
                    <span className="ocr-workbench-source-value">{ocrWorkbenchResult.fileName}</span>
                    <span className="ocr-workbench-source-lines">{`${ocrWorkbenchResult.lineCount} line${ocrWorkbenchResult.lineCount === 1 ? '' : 's'}`}</span>
                  </div>
                  <div className="ocr-workbench-flow" role="group" aria-label="Japanese to English translation flow">
                    <section className="ocr-workbench-box ocr-workbench-box-japanese" aria-label="Japanese text">
                      <h3>Japanese</h3>
                      <p>{ocrWorkbenchResult.japaneseText}</p>
                    </section>
                    <span className="ocr-workbench-flow-arrow" aria-hidden="true">
                      <ArrowRight size={22} strokeWidth={2.4} />
                    </span>
                    <section className="ocr-workbench-box ocr-workbench-box-english" aria-label="English text">
                      <h3>English</h3>
                      <p>{ocrWorkbenchResult.englishText}</p>
                    </section>
                  </div>
                </article>
              )}
            </div>

            {ocrWorkbenchError ? (
              <p className="assistant-chat-error">{ocrWorkbenchError}</p>
            ) : null}

            <footer className="assistant-chat-composer">
              <div className="assistant-chat-input-wrap ocr-workbench-controls">
                <button
                  type="button"
                  className="assistant-chat-upload ocr-workbench-upload"
                  onClick={() => ocrWorkbenchImageInputRef.current?.click()}
                  disabled={ocrWorkbenchBusy}
                  aria-label="Upload image for OCR"
                  title={`Upload image (max ${ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB} MB)`}
                >
                  {ocrWorkbenchBusy
                    ? <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" className="spin-icon" />
                    : <ImagePlus size={16} strokeWidth={2.2} aria-hidden="true" />}
                  <span>Upload image</span>
                </button>
                <label className="ocr-workbench-confidence" htmlFor="ocr-workbench-confidence-slider">
                  <span className="ocr-workbench-confidence-label">Confidence</span>
                  <div className="ocr-workbench-confidence-row">
                    <input
                      id="ocr-workbench-confidence-slider"
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
                    <span className="ocr-workbench-confidence-value">{Math.round(settings.assistantChatOcrMinConfidence * 100)}%</span>
                  </div>
                </label>
                <input
                  ref={ocrWorkbenchImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    if (!file) {
                      return
                    }
                    void handleOcrWorkbenchImageSelected(file)
                  }}
                />
              </div>
            </footer>
          </section>
        </div>
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
            className="modal-panel settings-panel settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-sheet-grabber" aria-hidden="true" />
            <div className="settings-modal-header">
              <div>
                <h2 id="settings-title" className="settings-modal-title">Control Panel</h2>
                <p className="settings-modal-subtitle">Quick app controls</p>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                x
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
                {activeSettingsTab === 'theme' ? (
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-theme"
                  aria-labelledby="settings-tab-theme"
                >
                  <div className="settings-control-content">
                    <div className="settings-theme-card">
                      <p className="settings-section-label">Theme</p>
                      <div className="settings-theme-mode-toggle" role="radiogroup" aria-label="Appearance mode">
                        {THEME_MODE_SECTIONS.map((modeSection) => {
                          const ModeIcon = THEME_MODE_ICON[modeSection.key]
                          const isActive = settings.themeMode === modeSection.key
                          return (
                            <button
                              key={modeSection.key}
                              type="button"
                              className={`settings-icon-entry settings-theme-mode-entry ${isActive ? 'is-active' : ''}`}
                              onClick={() => setThemeMode(modeSection.key)}
                              aria-label={`Use ${modeSection.label}`}
                              aria-pressed={isActive}
                              title={modeSection.label}
                            >
                              <span className={`settings-mode-icon-button ${isActive ? 'is-enabled' : ''}`} aria-hidden="true">
                                <ModeIcon size={18} strokeWidth={2.25} aria-hidden="true" />
                              </span>
                              <span className="settings-icon-entry-label">{modeSection.label}</span>
                            </button>
                          )
                        })}
                      </div>
                      <p className="settings-theme-mode-label">
                        {settings.themeMode === 'dark' ? 'Dark Mode Themes' : 'Light Mode Themes'}
                      </p>
                      <div className="settings-theme-grid" role="radiogroup" aria-label={`${settings.themeMode} premade theme selection`}>
                        {availableThemes.map((theme) => (
                          <button
                            key={theme.key}
                            type="button"
                            className={`settings-icon-entry settings-theme-entry ${settings.themeScope === 'preset' && settings.theme === theme.key ? 'is-active' : ''}`}
                            style={{ '--theme-color': THEME_SWATCH_ACCENT[theme.key] } as CSSProperties}
                            onClick={() => selectPresetTheme(theme.key, theme.mode)}
                            aria-label={`Use ${theme.label} theme`}
                            aria-pressed={settings.themeScope === 'preset' && settings.theme === theme.key}
                            title={theme.label}
                          >
                            <span className={`settings-theme-chip ${settings.themeScope === 'preset' && settings.theme === theme.key ? 'is-active' : ''}`} aria-hidden="true">
                              <span className="settings-theme-chip-core" aria-hidden="true" />
                            </span>
                            <span className="settings-icon-entry-label">{theme.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="settings-theme-card settings-theme-card-custom">
                      <div className="settings-theme-custom-head">
                        <p className="settings-section-label">Custom Themes</p>
                        <div className="settings-inline-action-group">
                          <button
                            type="button"
                            className="settings-inline-button"
                            onClick={createCustomTheme}
                          >
                            Create Theme
                          </button>
                          <button
                            type="button"
                            className="settings-inline-button"
                            onClick={exportCustomThemesToFile}
                          >
                            Export JSON
                          </button>
                          <button
                            type="button"
                            className="settings-inline-button"
                            onClick={() => void copyCustomThemesToClipboard()}
                          >
                            <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
                            <span>Copy</span>
                          </button>
                          <button
                            type="button"
                            className="settings-inline-button"
                            onClick={openCustomThemeImportPicker}
                          >
                            Import File
                          </button>
                          <button
                            type="button"
                            className="settings-inline-button"
                            onClick={() => void importCustomThemesFromClipboard()}
                          >
                            Paste JSON
                          </button>
                        </div>
                      </div>
                    <input
                      ref={customThemeImportInputRef}
                      type="file"
                      accept="application/json"
                      className="settings-hidden-file-input"
                      onChange={handleCustomThemeFileImport}
                    />
                    {customThemeActionMessage ? (
                      <p className="settings-help settings-help-inline">{customThemeActionMessage}</p>
                    ) : null}

                    {settings.customThemes.length <= 0 ? (
                      <p className="settings-help">Create a custom theme to edit every theme color variable by section.</p>
                    ) : (
                      <div className="settings-custom-theme-list" role="radiogroup" aria-label="Custom themes">
                        {settings.customThemes.map((customTheme) => {
                          const isActive = settings.themeScope === 'custom' && settings.activeCustomThemeId === customTheme.id
                          const preview = customThemePreviewById[customTheme.id]
                          return (
                            <div key={customTheme.id} className="settings-custom-theme-row">
                              <button
                                type="button"
                                className={`settings-icon-entry settings-theme-entry ${isActive ? 'is-active' : ''}`}
                                style={{ '--theme-color': preview?.accent ?? THEME_SWATCH_ACCENT[getFallbackThemeForMode(settings.themeMode)] } as CSSProperties}
                                onClick={() => selectCustomTheme(customTheme.id)}
                                aria-label={`Use custom theme ${customTheme.name}`}
                                aria-pressed={isActive}
                                title={customTheme.name}
                              >
                                <span className={`settings-theme-chip ${isActive ? 'is-active' : ''}`} aria-hidden="true">
                                  <span className="settings-theme-chip-core" aria-hidden="true" />
                                </span>
                                <span className="settings-custom-theme-copy">
                                  <span className="settings-icon-entry-label">{customTheme.name}</span>
                                  <span className="settings-theme-note">Base: {preview?.baseLabel ?? 'Preset'}</span>
                                </span>
                              </button>
                              <div className="settings-custom-theme-actions">
                                <button
                                  type="button"
                                  className="settings-inline-icon-button"
                                  onClick={() => duplicateCustomTheme(customTheme.id)}
                                  aria-label={`Duplicate ${customTheme.name}`}
                                  title="Duplicate custom theme"
                                >
                                  <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className="settings-inline-icon-button"
                                  onClick={() => deleteCustomTheme(customTheme.id)}
                                  aria-label={`Delete ${customTheme.name}`}
                                  title="Delete custom theme"
                                >
                                  <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {activeCustomTheme ? (
                      <div className="settings-custom-editor" aria-label="Custom theme editor">
                        <div className="settings-custom-editor-head">
                          <div className="settings-custom-editor-row">
                            <label className="settings-small-label" htmlFor="custom-theme-name">Theme Name</label>
                            <span className="settings-theme-note">Rename selected theme</span>
                          </div>
                          <input
                            id="custom-theme-name"
                            className="settings-text-input"
                            value={activeCustomTheme.name}
                            onChange={(event) => renameCustomTheme(activeCustomTheme.id, event.currentTarget.value)}
                            placeholder="Custom Theme"
                          />
                        </div>

                        <div className="settings-custom-editor-head">
                          <label className="settings-small-label">Base Preset ({settings.themeMode})</label>
                          <div className="settings-theme-grid" role="radiogroup" aria-label={`Base preset selection for ${settings.themeMode} mode`}>
                            {availableThemes.map((theme) => {
                              const isBaseTheme = activeCustomTheme.baseThemeByMode[settings.themeMode] === theme.key
                              return (
                                <button
                                  key={theme.key}
                                  type="button"
                                  className={`settings-icon-entry settings-theme-entry ${isBaseTheme ? 'is-active' : ''}`}
                                  style={{ '--theme-color': THEME_SWATCH_ACCENT[theme.key] } as CSSProperties}
                                  onClick={() => updateCustomThemeBase(activeCustomTheme.id, settings.themeMode, theme.key)}
                                  aria-label={`Use ${theme.label} as base preset`}
                                  aria-pressed={isBaseTheme}
                                  title={theme.label}
                                >
                                  <span className={`settings-theme-chip ${isBaseTheme ? 'is-active' : ''}`} aria-hidden="true">
                                    <span className="settings-theme-chip-core" aria-hidden="true" />
                                  </span>
                                  <span className="settings-icon-entry-label">{theme.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {THEME_SECTION_DEFINITIONS.map((section) => {
                          const modeOverrides = activeCustomTheme.overridesByMode[settings.themeMode]
                          const isCollapsed = Boolean(collapsedSettingsSections[section.id])
                          const overrideCount = section.keys.reduce(
                            (count, key) => count + (modeOverrides[key] ? 1 : 0),
                            0,
                          )
                          return (
                            <section key={section.id} className="settings-theme-section-editor">
                              <div className="settings-theme-section-head">
                                <div>
                                  <p className="settings-theme-section-title">{section.label}</p>
                                  <p className="settings-theme-section-copy">{section.description}</p>
                                  <p className="settings-theme-section-subtitle">{overrideCount} override{overrideCount === 1 ? '' : 's'}</p>
                                </div>
                                <div className="settings-inline-action-group">
                                  <button
                                    type="button"
                                    className="settings-inline-button"
                                    onClick={() => toggleThemeSectionCollapsed(section.id)}
                                  >
                                    {isCollapsed ? 'Expand' : 'Collapse'}
                                  </button>
                                  <button
                                    type="button"
                                    className="settings-inline-button"
                                    onClick={() => resetCustomThemeSection(activeCustomTheme.id, settings.themeMode, section)}
                                    disabled={overrideCount <= 0}
                                  >
                                    Reset section
                                  </button>
                                </div>
                              </div>

                              {!isCollapsed ? (
                              <div className="settings-theme-variable-grid">
                                {section.keys.map((key) => {
                                  const overrideValue = activeCustomTheme.overridesByMode[settings.themeMode][key] ?? ''
                                  const baseValue = activeBasePalette?.[key] ?? ''
                                  const resolvedValue = overrideValue || baseValue
                                  const isOverride = Boolean(overrideValue)
                                  const showColorPicker = supportsColorPickerForKey(key) && isColorLikeValue(resolvedValue)
                                  const variableDisplay = THEME_VARIABLE_DISPLAY[key]
                                  return (
                                    <label key={key} className="settings-theme-variable-field">
                                      <span className="settings-theme-variable-head">
                                        <span className="settings-theme-variable-title-block">
                                          <span className="settings-theme-variable-label">{formatThemeVariableLabel(key)}</span>
                                          <span className="settings-theme-variable-help">{variableDisplay.description}</span>
                                        </span>
                                        <span className={`settings-theme-variable-badge ${isOverride ? 'is-override' : ''}`}>
                                          {isOverride ? 'Override' : 'Inherited'}
                                        </span>
                                      </span>
                                      <span className={`settings-theme-variable-input-wrap ${showColorPicker ? 'is-picker' : ''}`}>
                                        {showColorPicker ? (
                                          <span
                                            className="settings-theme-variable-swatch settings-theme-variable-swatch-picker"
                                            style={isColorLikeValue(resolvedValue) ? { background: resolvedValue } : undefined}
                                            title={`Pick color for ${formatThemeVariableLabel(key)}`}
                                          >
                                            <input
                                              type="color"
                                              className="settings-theme-variable-color-picker"
                                              value={getColorInputValue(resolvedValue)}
                                              onChange={(event) => {
                                                updateCustomThemeOverride(
                                                  activeCustomTheme.id,
                                                  settings.themeMode,
                                                  key,
                                                  event.currentTarget.value,
                                                )
                                              }}
                                              aria-label={`Pick color for ${formatThemeVariableLabel(key)}`}
                                            />
                                          </span>
                                        ) : (
                                          <>
                                            <span
                                              className="settings-theme-variable-swatch"
                                              style={isColorLikeValue(resolvedValue) ? { background: resolvedValue } : undefined}
                                              aria-hidden="true"
                                            />
                                            <input
                                              className="settings-text-input"
                                              value={overrideValue}
                                              placeholder={baseValue || 'Enter CSS color'}
                                              onChange={(event) => {
                                                updateCustomThemeOverride(
                                                  activeCustomTheme.id,
                                                  settings.themeMode,
                                                  key,
                                                  event.currentTarget.value,
                                                )
                                              }}
                                            />
                                          </>
                                        )}
                                      </span>
                                      <span className="settings-theme-variable-key">{key}</span>
                                    </label>
                                  )
                                })}
                              </div>
                              ) : null}
                            </section>
                          )
                        })}
                      </div>
                    ) : null}
                    </div>
                  </div>
                </div>
                ) : null}

                {activeSettingsTab === 'background' ? (
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-background"
                  aria-labelledby="settings-tab-background"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Background</p>
                    <div className="settings-background-grid" role="radiogroup" aria-label="Background selection">
                      {BACKGROUND_OPTIONS.map((background) => {
                        const isActive = settings.backgroundStyle === background.key
                        const customPreview = background.key === 'custom_upload' ? settings.customBackgroundDataUrl : null
                        const previewSrc = customPreview ?? backgroundPreviewUrls[background.key] ?? resolvedBackgroundUrls[background.key]
                        const hasPreview = Boolean(previewSrc)
                        return (
                          <button
                            key={background.key}
                            type="button"
                            className={`settings-icon-entry settings-background-entry ${isActive ? 'is-active' : ''}`}
                            onClick={() => {
                              if (background.key === 'custom_upload' && !settings.customBackgroundDataUrl) {
                                openCustomBackgroundPicker()
                                setCustomBackgroundActionMessage('Pick an image to enable custom background.')
                                return
                              }
                              setSettings((prev) => ({ ...prev, backgroundStyle: background.key }))
                            }}
                            aria-label={`Use ${background.label} background`}
                            aria-pressed={isActive}
                            title={background.label}
                          >
                            <span
                              className={`settings-background-preview ${hasPreview ? 'is-photo' : 'is-classic'}`}
                              aria-hidden="true"
                            >
                              {previewSrc ? (
                                <img
                                  className="settings-background-preview-image"
                                  src={previewSrc}
                                  alt=""
                                  loading="eager"
                                  decoding="async"
                                />
                              ) : null}
                            </span>
                            <span className="settings-background-copy">
                              <span className="settings-icon-entry-label">{background.label}</span>
                              <span className="settings-background-note">{background.note}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="settings-inline-action-group" style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="settings-inline-button"
                        onClick={openCustomBackgroundPicker}
                      >
                        Choose Image
                      </button>
                      <button
                        type="button"
                        className="settings-inline-button"
                        onClick={clearCustomBackground}
                        disabled={!settings.customBackgroundDataUrl}
                      >
                        Remove Custom
                      </button>
                    </div>
                    <input
                      ref={customBackgroundImportInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp"
                      className="settings-hidden-file-input"
                      onChange={(event) => { void handleCustomBackgroundFileImport(event) }}
                    />
                    {customBackgroundActionMessage ? (
                      <p className="settings-help settings-help-inline">{customBackgroundActionMessage}</p>
                    ) : null}

                    <div className="settings-background-slider">
                      <div className="settings-background-slider-head">
                        <span>Blur amount</span>
                        <span>{clampBackgroundBlur(settings.backgroundBlur)}px</span>
                      </div>
                      <input
                        type="range"
                        min={BACKGROUND_BLUR_MIN}
                        max={BACKGROUND_BLUR_MAX}
                        step={1}
                        className="settings-range"
                        value={clampBackgroundBlur(settings.backgroundBlur)}
                        onChange={(event) => {
                          const nextBlur = Number(event.currentTarget.value)
                          setSettings((prev) => ({ ...prev, backgroundBlur: clampBackgroundBlur(nextBlur) }))
                        }}
                        aria-label="Background blur amount"
                        disabled={settings.backgroundStyle === 'classic_scene'}
                      />
                      <p className="settings-help">
                        Applies to image backgrounds, including your custom upload. Choose No Background to restore the simpler pre-drawing background.
                      </p>
                    </div>
                  </div>
                </div>
                ) : null}

                {activeSettingsTab === 'font_size' ? (
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
                ) : null}

                {activeSettingsTab === 'animations' ? (
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
                </div>
                ) : null}

                {activeSettingsTab === 'tutor' ? (
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-tutor"
                  aria-labelledby="settings-tab-tutor"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Tutor Companion</p>
                    <div className="settings-animation-grid" role="group" aria-label="Tutor companion controls">
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.assistantChatEnabled ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, assistantChatEnabled: !prev.assistantChatEnabled }))}
                        aria-label={settings.assistantChatEnabled ? 'Chat with Tutor enabled. Activate to disable.' : 'Chat with Tutor disabled. Activate to enable.'}
                        aria-pressed={settings.assistantChatEnabled}
                        title={settings.assistantChatEnabled ? 'Chat with Tutor enabled' : 'Chat with Tutor disabled'}
                      >
                        <span className={`settings-mode-icon-button ${settings.assistantChatEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                          <MessageCircle size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">Chat with Tutor</span>
                      </button>

                      {ASSISTANT_TOAST_LIMIT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.assistantToastLimit === option.value ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, assistantToastLimit: option.value }))}
                          aria-label={`Set tutor toast amount to ${option.label}`}
                          aria-pressed={settings.assistantToastLimit === option.value}
                          title={`Toast amount: ${option.label}`}
                        >
                          <span className={`settings-mode-icon-button ${settings.assistantToastLimit === option.value ? 'is-enabled' : ''}`} aria-hidden="true">
                            <AlertTriangle size={18} strokeWidth={2.25} aria-hidden="true" />
                          </span>
                          <span className="settings-icon-entry-label">Toasts {option.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="settings-help">Turn Chat with Tutor off to unload the local model runtime. Set toasts to Off to disable popup notifications.</p>
                  </div>
                </div>
                ) : null}

                {activeSettingsTab === 'tutor' ? (
                <SettingsCollapsibleSection
                  id="tutor-models"
                  title="Tutor models"
                  description="Download or reinstall the local model tiers used by the Tutor runtime."
                  meta={(
                    <>
                      {tutorInstallInfo?.llamaCppInstalled ? 'llama.cpp installed' : 'llama.cpp not installed'}
                      {' '}· Recommended tier: <strong style={{ color: 'var(--text-main)' }}>{tutorInstallInfo?.models.find((model) => model.tier === tutorInstallInfo.recommendedTier)?.label ?? '—'}</strong>
                    </>
                  )}
                  collapsed={Boolean(collapsedSettingsSections['tutor-models'])}
                  onToggle={() => toggleThemeSectionCollapsed('tutor-models')}
                  className="settings-theme-card"
                >
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {(tutorInstallInfo?.models ?? []).map((model) => {
                      const isDownloadingThis = tutorDownloadingTier === model.tier
                      const isActioningThis = tutorModelActionTier === model.tier
                      const isActiveTier = tutorInstallInfo?.activeModelTier === model.tier
                      const hardwareFit = getTutorModelHardwareFit(model.tier)
                      const showRecommendedBadge = model.tier === tutorInstallInfo?.recommendedTier
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
                            borderRadius: '12px',
                            background: 'color-mix(in oklab, var(--panel-bg-alt) 58%, transparent)',
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
                                {formatCombinedModelSize(model.sizeMb, model.embedderSizeMb)} · {formatMinutes(model.estimatedDownloadMinutes)}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                {model.installed ? 'Installed' : model.description}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.2rem', color: hardwareFit.isOk ? 'rgba(242, 181, 111, 0.92)' : '#ffb3a7' }}>
                                {hardwareFit.detail}
                              </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              {model.installed ? (
                                <button
                                  type="button"
                                  className={`settings-card-icon-button ${isActiveTier ? 'is-active' : ''}`}
                                  onClick={() => { void selectTutorModel(model.tier) }}
                                  disabled={isActiveTier || tutorModelActionTier !== null || tutorDownloadingTier !== null}
                                  aria-label={isActiveTier ? `${model.label} is the active Tutor model` : `Use ${model.label} for the Tutor`}
                                  title={isActiveTier ? 'Currently active' : 'Use this model'}
                                >
                                  {isActiveTier ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" /> : <Circle size={18} strokeWidth={2.25} aria-hidden="true" />}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="settings-card-icon-button"
                                onClick={() => { void downloadTutorModel(model.tier) }}
                                disabled={tutorDownloadingTier !== null || tutorModelActionTier !== null}
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
                                  onClick={() => { void uninstallTutorModel(model.tier) }}
                                  disabled={tutorModelActionTier !== null || tutorDownloadingTier !== null}
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
                                <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, tutorDownloadProgress?.percent ?? 0))}%` }} />
                              </div>
                              <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                {tutorDownloadProgress?.mb != null && tutorDownloadProgress?.totalMb != null
                                  ? `${tutorDownloadProgress.mb.toFixed(0)} / ${tutorDownloadProgress.totalMb.toFixed(0)} MB · ${Math.round(tutorDownloadProgress.percent)}%${tutorDownloadMethod ? ` [${tutorDownloadMethod}]` : ''}`
                                  : `Downloading… ${Math.round(tutorDownloadProgress?.percent ?? 0)}%${tutorDownloadMethod ? ` [${tutorDownloadMethod}]` : ''}`}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                    {(() => {
                      const embedderLabel = tutorInstallInfo?.activeEmbedderLabel
                        ?? (tutorInstallInfo?.activeEmbedderTier ? tutorInstallInfo.activeEmbedderTier.replace('_', '-').toUpperCase() : null)
                      if (!embedderLabel) {
                        return 'Embedder: none active yet. Select a Tutor model to enable retrieval embeddings.'
                      }
                      const installState = tutorInstallInfo?.activeEmbedderInstalled ? 'installed' : 'not installed'
                      const enabledState = tutorInstallInfo?.activeEmbedderEnabled ? 'enabled' : 'disabled'
                      return `Embedder: ${embedderLabel} · ${installState} · ${enabledState}`
                    })()}
                  </p>
                  <p className="settings-help" style={{ marginTop: '0.45rem' }}>
                    Select the circle icon to switch the Tutor to that model. Changes apply automatically without restarting the app.
                  </p>
                </SettingsCollapsibleSection>
                ) : null}

                {activeSettingsTab === 'tutor' ? (
                <SettingsCollapsibleSection
                  id="offline-dictionary"
                  title="Offline Dictionary"
                  description="Lets Tutor chat translate Japanese↔English words without an internet connection. Downloaded from the open-source jmdict-simplified project (~30 MB)."
                  meta={tutorInstallInfo?.dictionaryInstalled ? 'Installed' : `Not installed • ${formatMinutes(tutorInstallInfo?.dictionaryEstimatedDownloadMinutes)}`}
                  collapsed={Boolean(collapsedSettingsSections['offline-dictionary'])}
                  onToggle={() => toggleThemeSectionCollapsed('offline-dictionary')}
                  className="settings-theme-card"
                  actions={(
                    <button
                      type="button"
                      className="settings-card-icon-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void downloadOfflineDictionary()
                      }}
                      disabled={dictionaryDownloading || tutorInstallInfo?.dictionaryInstalled}
                      aria-label={tutorInstallInfo?.dictionaryInstalled ? 'Offline dictionary installed' : 'Download offline dictionary'}
                      title={tutorInstallInfo?.dictionaryInstalled ? 'Offline dictionary installed' : 'Download offline dictionary'}
                    >
                      {dictionaryDownloading
                        ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                        : tutorInstallInfo?.dictionaryInstalled
                          ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                          : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                    </button>
                  )}
                >
                  {dictionaryDownloading ? (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div className="settings-progress-track">
                        <div
                          className="settings-progress-fill"
                          style={{ width: `${Math.min(100, Math.max(0, dictionaryProgress))}%` }}
                        />
                      </div>
                      <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                        Downloading… {Math.round(dictionaryProgress)}%{dictionaryDownloadMethod ? ` [${dictionaryDownloadMethod}]` : ''}
                      </p>
                    </div>
                  ) : null}
                </SettingsCollapsibleSection>
                ) : null}

                {activeSettingsTab === 'tutor' ? (
                <SettingsCollapsibleSection
                  id="image-ocr"
                  title="Image Translation"
                  description="Install the offline OCR extraction package (PaddleOCR) for imported Japanese text images."
                  meta={(tutorInstallInfo?.ocrModels ?? []).some((model) => model.installed) ? 'Installed' : 'Not installed'}
                  collapsed={Boolean(collapsedSettingsSections['image-ocr'])}
                  onToggle={() => toggleThemeSectionCollapsed('image-ocr')}
                  className="settings-theme-card"
                >
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {(tutorInstallInfo?.translationProfiles ?? []).map((model) => {
                      const isApplyingThis = translationProfileApplyingTier === model.tier
                      const isActiveTier = tutorInstallInfo?.activeTranslationProfileTier === model.tier

                      return (
                        <div
                          key={model.tier}
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '12px',
                            background: 'color-mix(in oklab, var(--panel-bg-alt) 58%, transparent)',
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
                                {formatModelSize(model.sizeMb)} · {formatMinutes(model.estimatedDownloadMinutes)}
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
                                onClick={() => { void applyTranslationProfile(model.tier) }}
                                disabled={translationProfileApplyingTier !== null}
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
                                <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, translationProfileProgress))}%` }} />
                              </div>
                              <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                Installing... {Math.round(translationProfileProgress)}%{translationProfileMethod ? ` [${translationProfileMethod}]` : ''}
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
                ) : null}

                {activeSettingsTab === 'voice' ? (
                <SettingsCollapsibleSection
                  id="speech-recognition"
                  title="Speech Recognition"
                  description="Local offline speech-to-text used to answer minigame questions by speaking. Runs entirely on your device."
                  meta={(tutorInstallInfo?.speechModels ?? []).some((model) => model.installed) ? 'Installed' : 'Not installed'}
                  collapsed={Boolean(collapsedSettingsSections['speech-recognition'])}
                  onToggle={() => toggleThemeSectionCollapsed('speech-recognition')}
                  className="settings-theme-card"
                >
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {(tutorInstallInfo?.speechModels ?? []).map((model) => {
                      const isDownloadingThis = speechDownloadingTier === model.tier
                      const isActioningThis = speechModelActionTier === model.tier
                      const isActiveTier = tutorInstallInfo?.activeSpeechModelTier === model.tier
                      const speechHardwareFit = getSpeechModelHardwareFit(model.tier)

                      return (
                        <div
                          key={model.tier}
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '12px',
                            background: 'color-mix(in oklab, var(--panel-bg-alt) 58%, transparent)',
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
                                {formatModelSize(model.sizeMb)} · {formatMinutes(model.estimatedDownloadMinutes)}
                              </p>
                              <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                {model.installed ? 'Installed' : model.description}
                              </p>
                              <p
                                className="settings-help"
                                style={{
                                  marginTop: '0.2rem',
                                  color: speechHardwareFit.tone === 'warning'
                                    ? 'rgba(242, 181, 111, 0.92)'
                                    : 'var(--text-soft)',
                                }}
                              >
                                {speechHardwareFit.badge} · {speechHardwareFit.detail}
                              </p>
                              {tutorInstallInfo?.recommendedSpeechTier === model.tier ? (
                                <p className="settings-help" style={{ marginTop: '0.2rem', color: 'var(--accent, #7eb8ea)' }}>
                                  Recommended for this hardware
                                </p>
                              ) : null}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              {model.installed ? (
                                <button
                                  type="button"
                                  className={`settings-card-icon-button ${isActiveTier ? 'is-active' : ''}`}
                                  onClick={() => { void selectSpeechModel(model.tier) }}
                                  disabled={isActiveTier || speechModelActionTier !== null || speechDownloadingTier !== null}
                                  aria-label={isActiveTier ? `${model.label} is the active speech model` : `Use ${model.label} for speech recognition`}
                                  title={isActiveTier ? 'Currently active' : 'Use this model'}
                                >
                                  {isActiveTier ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" /> : <Circle size={18} strokeWidth={2.25} aria-hidden="true" />}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="settings-card-icon-button"
                                onClick={() => { void downloadSpeechModel(model.tier) }}
                                disabled={speechDownloadingTier !== null || speechModelActionTier !== null}
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
                                  onClick={() => { void uninstallSpeechModel(model.tier) }}
                                  disabled={speechModelActionTier !== null || speechDownloadingTier !== null}
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
                                <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, speechDownloadProgress))}%` }} />
                              </div>
                              <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                Downloading… {Math.round(speechDownloadProgress)}%{speechDownloadMethod ? ` [${speechDownloadMethod}]` : ''}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                    Select the circle icon to switch the active speech recognition model. If no model is
                    installed, speech-answer minigame rounds fall back to typed answers.
                  </p>
                </SettingsCollapsibleSection>
                ) : null}

                {activeSettingsTab === 'voice' ? (
                <div
                  className="settings-section settings-control-row settings-control-row-no-icon"
                  role="tabpanel"
                  id="settings-panel-voice"
                  aria-labelledby="settings-tab-voice"
                >
                  <div className="settings-control-content">
                    <p className="settings-section-label">Voice</p>
                    <div className="settings-animation-grid" role="group" aria-label="Japanese voice controls">
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.voiceEnabled ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
                        aria-label={settings.voiceEnabled ? 'Spoken prompts enabled. Activate to disable.' : 'Spoken prompts disabled. Activate to enable.'}
                        aria-pressed={settings.voiceEnabled}
                        title={settings.voiceEnabled ? 'Spoken prompts enabled' : 'Spoken prompts disabled'}
                      >
                        <span className={`settings-mode-icon-button ${settings.voiceEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">{settings.voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
                      </button>

                      {settings.ambientAudioEnabled !== undefined ? (
                        <button
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.ambientAudioEnabled ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, ambientAudioEnabled: !prev.ambientAudioEnabled }))}
                          aria-label={settings.ambientAudioEnabled ? 'Ambient audio enabled. Activate to disable.' : 'Ambient audio disabled. Activate to enable.'}
                          aria-pressed={settings.ambientAudioEnabled}
                          title={settings.ambientAudioEnabled ? 'Ambient audio on' : 'Ambient audio off'}
                        >
                          <span className={`settings-mode-icon-button ${settings.ambientAudioEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                            <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
                          </span>
                          <span className="settings-icon-entry-label">{settings.ambientAudioEnabled ? 'Ambience On' : 'Ambience Off'}</span>
                        </button>
                      ) : null}

                      {settings.voiceEnabled
                        ? voiceOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`settings-icon-entry settings-theme-entry ${settings.voiceSpeaker === option.id ? 'is-active' : ''}`}
                            onClick={() => {
                              setSettings((prev) => ({ ...prev, voiceSpeaker: option.id }))
                              void playQuestionAudio(VOICE_SAMPLE_LINE, option.id)
                            }}
                            disabled={voiceBusy}
                            aria-label={`Use voice ${option.name} (${option.search}) and hear a sample`}
                            aria-pressed={settings.voiceSpeaker === option.id}
                            title={`${option.name} · ${option.search} — click to hear a sample`}
                          >
                            <span className={`settings-mode-icon-button ${settings.voiceSpeaker === option.id ? 'is-enabled' : ''}`} aria-hidden="true">
                              <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
                            </span>
                            <span className="settings-icon-entry-label">{option.name}</span>
                          </button>
                        ))
                        : null}

                    </div>

                    <p className="settings-help" style={{ marginTop: '0.65rem' }}>
                      {settings.voiceEnabled
                        ? 'Click a voice to hear a sample. The speaker button in games reads prompts aloud.'
                        : 'Turn Voice on to read prompts aloud with the speaker button in games.'}
                      {voiceUnavailable ? ' (Voice runtime unavailable right now.)' : ''}
                    </p>
                    <p className="settings-help">
                      VOICEVOX runtime: {
                        !voiceStatusChecked
                          ? 'Checking status…'
                          : voiceRuntimeRunning
                            ? 'Running'
                            : 'Not running'
                      }
                      {!voiceRuntimeRunning && voiceStatus?.lastError
                        ? ` (${voiceStatus.lastError})`
                        : ''}
                    </p>
                    <p className="settings-help">
                      Synthesis debug: {lastVoiceSynthesis
                        ? `${lastVoiceSynthesis.mode}, ${lastVoiceSynthesis.profile}, ${Math.max(0, Math.round(lastVoiceSynthesis.elapsedMs))}ms`
                        : 'No playback yet.'}
                    </p>

                    <SettingsCollapsibleSection
                      id="voicevox-runtime"
                      title="VOICEVOX Runtime"
                      description="Install VOICEVOX from Settings and use it for local Japanese speech playback."
                      meta={tutorInstallInfo?.voiceInstalled ? 'Already installed' : 'Not installed'}
                      collapsed={Boolean(collapsedSettingsSections['voicevox-runtime'])}
                      onToggle={() => toggleThemeSectionCollapsed('voicevox-runtime')}
                      className="settings-theme-card"
                    >
                      <div style={{ display: 'grid', gap: '0.65rem' }}>
                        {(tutorInstallInfo?.voiceModels ?? []).map((model) => {
                          const isDownloadingThis = voiceEngineDownloadingTier === model.tier
                          const isActiveTier = tutorInstallInfo?.activeVoiceModel === model.tier

                          return (
                            <div
                              key={model.tier}
                              style={{
                                padding: '0.75rem 0.9rem',
                                borderRadius: '12px',
                                background: 'color-mix(in oklab, var(--panel-bg-alt) 58%, transparent)',
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
                                    {model.installed ? 'Installed' : model.description}
                                  </p>
                                  <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                    {formatMinutes(model.estimatedDownloadMinutes)}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    className="settings-card-icon-button"
                                    onClick={() => { void downloadVoiceEngineModel(model.tier) }}
                                    disabled={voiceEngineDownloadingTier !== null}
                                    aria-label={model.installed ? `Reinstall ${model.label}` : `Install ${model.label}`}
                                    title={model.installed ? `Reinstall ${model.label}` : `Install ${model.label}`}
                                  >
                                    {isDownloadingThis
                                      ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                                      : model.installed
                                        ? <RotateCcw size={18} strokeWidth={2.25} aria-hidden="true" />
                                        : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                                  </button>
                                </div>
                              </div>
                              {isDownloadingThis ? (
                                <div>
                                  <div className="settings-progress-track">
                                    <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, voiceEngineDownloadProgress))}%` }} />
                                  </div>
                                  <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                    Installing… {Math.round(voiceEngineDownloadProgress)}%{voiceEngineDownloadMethod ? ` [${voiceEngineDownloadMethod}]` : ''}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                      <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                        Installing from this section will also warm up the voice runtime so playback can start immediately.
                      </p>
                    </SettingsCollapsibleSection>
                  </div>
                </div>
                ) : null}

                {activeSettingsTab === 'shortcuts' ? (
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
                ) : null}

                {activeSettingsTab === 'data' ? (
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
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {assistantChatOpen ? (
        <div
          className="modal-backdrop assistant-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAssistantChat()
          }}
        >
          <section
            id="assistant-chat-panel"
            className="assistant-chat-panel assistant-chat-window"
            role="dialog"
            aria-modal="true"
            aria-label="Tutor chat panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="assistant-chat-header">
              <div className="assistant-chat-identity">
                <span className="assistant-chat-avatar" aria-hidden="true">
                  <MessageCircle size={18} strokeWidth={2.2} />
                  <span className="assistant-chat-presence" />
                </span>
                <span className="assistant-chat-identity-text">
                  <span className="assistant-chat-title">Study Coach</span>
                  <span className="assistant-chat-subtitle">
                    {assistantChatLoading ? 'Typing…' : 'Online · here to help'}
                  </span>
                </span>
              </div>
              <div className="assistant-chat-header-actions">
                <button
                  type="button"
                  className={`assistant-chat-audio-toggle ${settings.assistantChatAudioEnabled ? 'is-on' : 'is-off'}`}
                  onClick={() => {
                    if (settings.assistantChatAudioEnabled) {
                      cancelAssistantSpeech()
                    }
                    setSettings((previous) => ({
                      ...previous,
                      assistantChatAudioEnabled: !previous.assistantChatAudioEnabled,
                    }))
                  }}
                  aria-label={settings.assistantChatAudioEnabled ? 'Turn coach audio off' : 'Turn coach audio on'}
                  aria-pressed={settings.assistantChatAudioEnabled}
                  title={settings.assistantChatAudioEnabled ? 'Coach audio on' : 'Coach audio off'}
                >
                  {settings.assistantChatAudioEnabled ? (
                    <Volume2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <VolumeX size={14} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="assistant-chat-clear"
                  onClick={() => void clearAssistantChat()}
                  disabled={assistantChatMessages.length <= 0 || assistantChatLoading}
                  aria-label="Clear chat history"
                  title="Clear chat"
                >
                  <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="assistant-chat-close"
                  onClick={closeAssistantChat}
                  aria-label="Close tutor chat"
                >
                  <X size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="assistant-chat-log" role="log" aria-live="polite" ref={assistantChatLogRef}>
              {assistantChatMessages.length <= 0 && !assistantChatLoading ? (
                <p className="assistant-chat-empty">Start a chat when you want strategy help or encouragement.</p>
              ) : (
                <>
                  {assistantChatMessages.map((turn, index) => {
                    const turnKey = `${turn.created_at_utc}-${index}`
                    const isReplaySpeaking = assistantSpeakingTurnKey === turnKey
                    return (
                      <article key={turnKey} className={`assistant-chat-turn assistant-chat-turn-${turn.role}`}>
                        <div className="assistant-chat-turn-meta">
                          <span className="assistant-chat-turn-role">{turn.role === 'assistant' ? 'Coach' : 'You'}</span>
                          {turn.role === 'assistant' ? (
                            <button
                              type="button"
                              className={`assistant-chat-turn-replay ${isReplaySpeaking ? 'is-speaking' : ''}`}
                              onClick={() => {
                                if (isReplaySpeaking) {
                                  cancelAssistantSpeech()
                                  return
                                }
                                replayAssistantTurn(turn.content, turnKey)
                              }}
                              disabled={!settings.assistantChatAudioEnabled}
                              aria-label={settings.assistantChatAudioEnabled
                                ? (isReplaySpeaking ? 'Stop coach message audio' : 'Replay coach message audio')
                                : 'Enable chat audio to replay this message'}
                              title={settings.assistantChatAudioEnabled
                                ? (isReplaySpeaking ? 'Stop audio' : 'Replay audio')
                                : 'Enable chat audio to replay'}
                            >
                              <Volume2 size={12} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                        <p>{turn.content}</p>
                      </article>
                    )
                  })}
                  {assistantChatLoading ? (
                    <article className="assistant-chat-turn assistant-chat-turn-assistant assistant-chat-turn-typing" aria-label="Coach is typing">
                      <div className="assistant-chat-turn-meta">
                        <span className="assistant-chat-turn-role">Coach</span>
                      </div>
                      <p className="assistant-chat-typing" aria-hidden="true">
                        <span className="assistant-chat-typing-dot" />
                        <span className="assistant-chat-typing-dot" />
                        <span className="assistant-chat-typing-dot" />
                      </p>
                    </article>
                  ) : null}
                </>
              )}
            </div>

            {assistantChatError ? (
              <p className="assistant-chat-error">{assistantChatError}</p>
            ) : null}

            <footer className="assistant-chat-composer">
              <div className="assistant-chat-input-wrap">
                <textarea
                  value={assistantChatInput}
                  onChange={(event) => {
                    setAssistantChatInput(event.currentTarget.value)
                    if (assistantChatError?.startsWith('User chat is limited to')) {
                      setAssistantChatError(null)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.shiftKey) {
                      return
                    }
                    event.preventDefault()
                    if (assistantChatLoading || assistantChatInput.trim().length === 0) {
                      return
                    }
                    void sendAssistantChat()
                  }}
                  placeholder="Ask your coach for help with your current weak area..."
                  rows={2}
                  maxLength={ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT}
                  disabled={assistantChatLoading}
                />
                <span className="assistant-chat-limit" aria-hidden="true">
                  {assistantChatInput.length}/{ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT}
                </span>
                <button
                  type="button"
                  className="assistant-chat-send"
                  onClick={() => void sendAssistantChat()}
                  disabled={assistantChatLoading || assistantChatInput.trim().length === 0}
                  aria-label="Send tutor chat message"
                  title="Send"
                >
                  <SendHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

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
        {settings.assistantToastLimit > 0 && activeAssistantToast ? (
          <div className="assistant-toast-stack" role="status" aria-label="Tutor updates">
            <article key={activeAssistantToast.id} className={`assistant-toast assistant-toast-${activeAssistantToast.priority}`}>
              <h3>{activeAssistantToast.title}</h3>
              <p>{activeAssistantToast.body}</p>
              {activeAssistantToast.targetMode ? (
                <div className="assistant-toast-controls">
                  <button
                    type="button"
                    className="assistant-toast-action"
                    onClick={() => launchAssistantToastAction(activeAssistantToast)}
                  >
                    {activeAssistantToast.actionLabel}
                  </button>
                </div>
              ) : null}
              <div className="assistant-toast-advance-track" aria-hidden="true">
                <span
                  key={activeAssistantToast.id}
                  className="assistant-toast-advance-fill"
                  style={{ animationDuration: `${ASSISTANT_TOAST_TTL_MS}ms` }}
                />
              </div>
            </article>
          </div>
        ) : null}
      </aside>

      </div>
    </main>
  )
}

export default App



