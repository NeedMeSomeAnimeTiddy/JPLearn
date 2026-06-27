interface DesktopVersions {
  chrome: string
  electron: string
  node: string
}

interface DeckSummary {
  slug: string
  name: string
  total: number
  mastered: number
  due_today: number
  completed_today: number
}

interface StudySummary {
  decks: DeckSummary[]
  streak: {
    current_days: number
    best_days: number
  }
  activity: {
    week: {
      days: number
      reviewed: number
      correct: number
      incorrect: number
      accuracy: number
      points_earned: number
      active_days: number
    }
    month: {
      days: number
      reviewed: number
      correct: number
      incorrect: number
      accuracy: number
      points_earned: number
      active_days: number
    }
  }
  mistakes: Array<{
    key: string
    attempts: number
    mistakes: number
    error_rate: number
  }>
  item_history: Array<{
    key: string
    script_tag: string
    deck: string
    card_id: number
    prompt: string
    trend: 'improving' | 'stable' | 'declining'
    events: Array<{
      reviewed_at_utc: string
      outcome: 'correct' | 'incorrect'
      points_delta: number
    }>
  }>
  curriculum: {
    context_cloze: {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      accuracy_7d: number
      stage_distribution: {
        1: number
        2: number
        3: number
      }
    }
    context_cloze_by_script: Record<ScriptCurriculumSlug, {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      accuracy_7d: number
      stage_distribution: {
        1: number
        2: number
        3: number
      }
    }>
    narrative_story: {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      chapters: Record<'1' | '2' | '3', {
        attempts: number
        accuracy: number
        completion_rate: number
      }>
    }
    narrative_story_by_script: Record<ScriptCurriculumSlug, {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      chapters: Record<'1' | '2' | '3', {
        attempts: number
        accuracy: number
        completion_rate: number
      }>
    }>
  }
}

interface GameCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence?: string | null
  is_leech: boolean
  curriculum_stage: number
  meaning_distractor_ids: number[]
  character_distractor_ids: number[]
}

type DeckSlug =
  | 'hiragana'
  | 'katakana'
  | 'kanji_n5'
  | 'kanji_n4'
  | 'kanji_n3'
  | 'kanji_n2'
  | 'kanji_n1'
  | 'vocab_n5'
  | 'vocab_n4'
  | 'vocab_n3'
  | 'vocab_n2'
  | 'vocab_n1'
  | 'grammar_patterns'
type ScriptCurriculumSlug = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns'
type ExpertiseLevel = 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation'

interface ScriptDeckPayload {
  slug: DeckSlug
  name: string
  cards: GameCard[]
}

interface StudyQueuePayload {
  slug: DeckSlug
  card_ids: number[]
  indices: number[]
}

interface StudyQueueResponse {
  ok: boolean
  queue: StudyQueuePayload
}

interface BlockInfo {
  index: number
  name: string
  card_ids: number[]
  sample_chars: string[]
  characters: string[]
  meanings: string[]
  romajis: string[]
  mastery: number
  unlocked: boolean
}

interface BlockProgressPayload {
  slug: string
  blocks: BlockInfo[]
}

interface OverviewCharacterCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
}

interface OverviewCharacterMasteryPayload {
  blocks: {
    hiragana: BlockInfo[]
    katakana: BlockInfo[]
  }
  kanji_cards: OverviewCharacterCard[]
}

interface SessionGoalPayload {
  session_id: string
  target_items: number
  target_minutes: number | null
  target_accuracy: number | null
  started_at_utc: string
}

interface SessionGoalStartResponse {
  ok: boolean
  goal: SessionGoalPayload
}

interface SessionSummaryPayload {
  session_id: string
  target_items: number
  completed_items: number
  reviewed: number
  correct: number
  accuracy: number
  target_accuracy: number | null
  goal_met: boolean
}

interface SessionSummaryResponse {
  ok: boolean
  summary?: SessionSummaryPayload
  error?: string
}

interface AssistantProfile {
  persona_style: string
  popup_cadence: string
  emotion_persistence: string
  llm_backend: string
  chat_retention: string
  updated_at_utc: string
}

interface AssistantStatePayload {
  mood: string
  momentum: number
  confidence_level: number
  focus_area: string
  last_major_event: string
}

interface AssistantEventPayload {
  id?: number
  event_type: string
  priority: 'info' | 'coaching' | 'critical' | 'celebration'
  message_key: string
  metadata: Record<string, string>
}

interface AssistantSnapshotResponse {
  ok: boolean
  snapshot: {
    profile: AssistantProfile
    state: AssistantStatePayload
    events: AssistantEventPayload[]
  }
}

interface AssistantEventsResponse {
  ok: boolean
  events: Array<AssistantEventPayload & { id: number }>
}

interface AssistantChatTurn {
  role: 'user' | 'assistant'
  content: string
  created_at_utc: string
}

interface AssistantChatHistoryResponse {
  ok: boolean
  turns: AssistantChatTurn[]
}

interface DesktopApi {
  versions: DesktopVersions
  getStudySummary: () => Promise<StudySummary>
  getBlockProgress: (slug: DeckSlug) => Promise<BlockProgressPayload>
  getDeckCards: (slug: DeckSlug) => Promise<ScriptDeckPayload>
  getStudyQueue: (slug: DeckSlug) => Promise<StudyQueueResponse>
  getOverviewCharacterMastery: () => Promise<OverviewCharacterMasteryPayload>
  notifyStartupReady: (payload?: {
    startupReadyMs?: number
    firstSummaryMs?: number | null
    deferredLoadsQueuedAtMs?: number
  }) => Promise<{ ok: boolean }>
  setStartupTheme: (theme: string) => Promise<{ ok: boolean; theme: string }>
  recordGameResult: (payload: {
    slug: DeckSlug
    cardId: number
    isCorrect: boolean
    minigame: string
    curriculumStage?: number
    sessionId?: string
    confidenceScore?: number
  }) => Promise<{
    ok: boolean
    card_id: number
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
    confidence_score?: number | null
    curriculum_stage?: number | null
  }>
  startSessionGoal: (payload: {
    targetItems: number
    targetMinutes?: number
    targetAccuracy?: number
    sessionId?: string
  }) => Promise<SessionGoalStartResponse>
  getSessionSummary: (sessionId: string) => Promise<SessionSummaryResponse>
  applyExpertiseLevel: (level: ExpertiseLevel) => Promise<{
    ok: boolean
    level: ExpertiseLevel
    seeded_cards: number
    decks: string[]
  }>
  getAssistantSnapshot?: (sessionId?: string) => Promise<AssistantSnapshotResponse>
  getAssistantEvents?: (limit?: number) => Promise<AssistantEventsResponse>
  consumeAssistantEvents?: (eventIds: number[]) => Promise<{ ok: boolean; consumed: number }>
  appendAssistantChatTurn?: (payload: {
    role: 'user' | 'assistant'
    content: string
  }) => Promise<{ ok: boolean }>
  getAssistantChatHistory?: (limit?: number) => Promise<AssistantChatHistoryResponse>
  resetStudyDb: () => Promise<{ ok: boolean }>
  minimizeWindow: () => Promise<{ ok: boolean }>
  toggleMaximizeWindow: () => Promise<{ ok: boolean; isMaximized: boolean }>
  isWindowMaximized: () => Promise<{ isMaximized: boolean }>
  onWindowStateChanged?: (listener: (state: { isMaximized: boolean }) => void) => () => void
  closeWindow: () => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    jplearnDesktop: DesktopApi
  }
}

export {}
