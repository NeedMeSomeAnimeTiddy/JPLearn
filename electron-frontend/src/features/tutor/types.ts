import type { LucideIcon } from 'lucide-react'
import type { ScriptKey } from '../../types'

export type { ScriptKey }
export type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'stroke_order' | 'typed_recall' | 'speech_recall' | 'sentence_assembly' | 'particle_cloze' | 'vibe_check' | 'imposter' | 'listening_audio_first' | 'dictation' | 'interleave_mix'

export interface SpeechSegment {
  text: string
  language: 'ja' | 'en'
}

export interface AssistantStatePayload {
  mood: string
  momentum: number
  confidence_level: number
  focus_area: string
  last_major_event: string
}

export interface AssistantProfilePayload {
  persona_style: string
  emotion_persistence: string
  llm_backend: string
  chat_retention: string
  updated_at_utc: string
}

export interface AssistantEventPayload {
  id: number
  event_type: string
  priority: 'info' | 'coaching' | 'critical' | 'celebration'
  message_key: string
  metadata: Record<string, string>
}

export interface AssistantToast {
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

export interface AssistantChatTurn {
  role: 'user' | 'assistant'
  content: string
  created_at_utc: string
}

export interface AssistantChatRuntimeStatus {
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

export interface OcrWorkbenchResult {
  fileName: string
  lineCount: number
  japaneseText: string
  englishText: string
}

export interface TutorSettingsFields {
  assistantToastLimit: 0 | 1
  assistantChatEnabled: boolean
  assistantChatAudioEnabled: boolean
  assistantChatOcrMinConfidence: number
  /** Whether Scenario Practice may consult an installed local model for
   * responses deterministic evaluation can't classify confidently. Has no
   * effect when no model is installed — the scenario always falls back to
   * authored recovery either way. */
  scenarioAiEvaluationEnabled: boolean
  /** Whether the Tutor chat and Scenario Practice inputs convert typed
   * romaji to kana as-you-type. Off leaves the field as a plain textarea, so
   * a real OS Japanese IME's own kanji conversion is never competed with. */
  romajiConversionEnabled: boolean
}

export interface VoiceDeps {
  playVoiceRuntimeAudio: (text: string, runId: number) => Promise<boolean>
  cancelAssistantSpeech: () => void
  assistantSpeechRunIdRef: React.RefObject<number>
  splitSpeechSegments: (text: string) => SpeechSegment[]
}

export interface TutorDeps {
  voice: VoiceDeps
  isInMinigameSession: boolean
  activeSessionId: string | null
  activeScript: ScriptKey
  ocrInstalled: boolean
  onToastNavigate: (script: ScriptKey, minigame: MinigameKey, differentScript: boolean) => void
}

// --- Shared Tutor popup: menu + mode navigation ------------------------------

/** Which activity the shared Tutor popup is showing. 'menu' lists the activities. */
export type TutorPanelMode = 'menu' | 'chat' | 'scenarios' | 'ocr'

export interface TutorMenuItem {
  mode: Exclude<TutorPanelMode, 'menu'>
  label: string
  description: string
  icon: LucideIcon
}

export interface TutorPanelHeaderCopy {
  title: string
  catalog: string
}
