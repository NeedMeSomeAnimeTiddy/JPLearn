// Scenario Conversation Tutor — content contract, session state, and evaluation
// contracts. This is the single source of truth for scenario shapes; both authored
// content (src/lib/scenarios/) and the engine/evaluator/hook import from here.

export type LearnerLevel = 'beginner' | 'intermediate'

export type ResponseOutcome = 'correct' | 'partial' | 'incorrect' | 'unclear'

export interface ScenarioObjective {
  id: string
  label: string
  required: boolean
}

export interface NpcLine {
  ja: string
  reading: string
  en: string
}

export interface SlotValue {
  id: string
  forms: string[]
}

export interface SlotSpec {
  id: string
  label: string
  required: boolean
  values: SlotValue[]
}

export interface AcceptedPhrase {
  ja: string
  variants?: string[]
  minMatch?: 'exact'
}

export interface MistakePattern {
  id: string
  match: string[]
  classifyAs: 'partial' | 'incorrect'
  correction: string
  /** Kana-only reading of `correction`, shown to beginners alongside it. */
  correctionReading?: string
  /** Romaji of `correction`, so a learner who can't read kana yet can still act on it. */
  correctionRomaji?: string
  explanation: string
}

/**
 * One step of a node's escalating hint ladder. Beginner ladders end with the
 * full model answer; every step carries kana and romaji as well as the English
 * instruction, so the hint is usable whatever the learner can read.
 */
export interface ScenarioHint {
  /** What to do, in English. */
  en: string
  /** Example phrase in Japanese (kana/kanji). */
  ja?: string
  /** Kana-only reading of `ja`. */
  reading?: string
  /** Romaji of `ja`. */
  romaji?: string
}

export interface IntentBranch {
  correct: string
  partial?: string
}

export interface ExpectedIntent {
  id: string
  description: string
  acceptedPhrases: AcceptedPhrase[]
  slots?: SlotSpec[]
  commonMistakes?: MistakePattern[]
  branch: IntentBranch
  // Side branches (asking for a recommendation, asking what a word means, an
  // early "thanks" before the main task is done) resolve to 'correct' like any
  // matched intent, but must NOT mark the node's objectiveIds as met — only
  // the node's primary intent(s) do. Defaults to true.
  satisfiesObjectives?: boolean
}

export interface RecoveryFallbackAdvance {
  modelAnswer: string
  /** Kana reading and romaji of `modelAnswer`, shown with the assisted advance. */
  modelAnswerReading?: string
  modelAnswerRomaji?: string
  line: Record<LearnerLevel, NpcLine>
  countsAsObjective: false
  // Node the engine advances to once maxAttempts is exhausted. Defaults to the
  // node's first intent's `branch.correct` when omitted, so authors need not
  // repeat the same target twice for the common case.
  advanceNodeId?: string
}

export interface RecoveryPath {
  maxAttempts: number
  onIncorrect: Record<LearnerLevel, NpcLine>
  onUnclear: Record<LearnerLevel, NpcLine>
  fallbackAdvance: RecoveryFallbackAdvance
}

export interface NpcNode {
  id: string
  kind: 'npc'
  line: Record<LearnerLevel, NpcLine>
  next: string
}

export interface LearnerNode {
  id: string
  kind: 'learner'
  objectiveIds: string[]
  prompt?: string
  intents: ExpectedIntent[]
  cancelIntent?: ExpectedIntent
  hints: Record<LearnerLevel, ScenarioHint[]>
  recovery: RecoveryPath
}

export interface EndNode {
  id: string
  kind: 'end'
  outcome: 'success' | 'cancelled'
  closingLine?: Record<LearnerLevel, NpcLine>
}

export type ScenarioNode = NpcNode | LearnerNode | EndNode

export interface ScenarioVocabItem {
  id: string
  ja: string
  reading: string
  en: string
  nodeIds: string[]
}

export interface ScenarioGrammarPoint {
  id: string
  label: string
  explanation: string
  nodeIds: string[]
}

export type SrsCandidateTrigger =
  | { kind: 'vocabulary'; vocabId: string }
  | { kind: 'grammar'; grammarId: string }
  | { kind: 'mistake'; mistakeId: string }

export interface SrsCandidate {
  id: string
  trigger: SrsCandidateTrigger
  front: string
  back: string
  reading?: string
  notes?: string
}

export interface ScenarioDefinition {
  id: string
  version: number
  title: string
  titleJa: string
  description: string
  npc: { name: string; role: string; voiceSpeaker?: string }
  objectives: ScenarioObjective[]
  startNodeId: string
  nodes: Record<string, ScenarioNode>
  vocabulary: ScenarioVocabItem[]
  grammarPoints: ScenarioGrammarPoint[]
  srsCandidates: SrsCandidate[]
  suggestedNextSteps: string[]
}

// --- Evaluation contracts (deterministic + optional AI) ---------------------

export type EvaluationTier = 'exact' | 'slots-complete' | 'mistake' | 'fuzzy' | 'none'

export type EvaluationSource = 'deterministic' | 'ai'

export interface DeterministicEvaluation {
  outcome: ResponseOutcome
  matchedIntentId: string | null
  matchedSlots: string[]
  missingRequiredSlots: string[]
  mistakeId: string | null
  confidence: number
  tier: EvaluationTier
}

export interface EvaluationResult extends DeterministicEvaluation {
  source: EvaluationSource
  correction?: string
  explanation?: string
}

export type EvaluationInputSource = 'typed' | 'stt'

export interface EvaluateResponseOptions {
  inputSource: EvaluationInputSource
  sttConfidence?: number
}

export interface AiEvaluationRequest {
  scenarioTitle: string
  npcLine: string
  objectiveDescription: string
  expectedIntents: Array<{ id: string; description: string; examplePhrases: string[] }>
  /** Authored slot ids the turn requires. The model may only echo these
   * back in `missingInfo`; anything else fails validation. */
  requiredSlotIds: string[]
  learnerResponse: string
  learnerLevel: LearnerLevel
}

export interface AiEvaluationResult {
  outcome: ResponseOutcome
  matchedIntentId: string | null
  missingInfo: string[]
  correction?: string
  explanation?: string
  confidence: number
}

export interface ScenarioAiEvaluator {
  evaluate: (request: AiEvaluationRequest, signal: AbortSignal) => Promise<AiEvaluationResult | null>
}

// --- Session / transcript state ---------------------------------------------

export type ObjectiveStatus = 'met' | 'assisted' | 'missed'

export interface ScenarioTurnRecord {
  turnIndex: number
  nodeId: string
  npcLine: NpcLine | null
  learnerInput: string | null
  inputSource: EvaluationInputSource | null
  outcome: ResponseOutcome | null
  matchedIntentId: string | null
  correction: string | null
  /** Kana reading and romaji of `correction`, shown compactly alongside it
   * right in the transcript — never as a separate floating box. */
  correctionReading: string | null
  correctionRomaji: string | null
  hintLevel: number
  mistakeId: string | null
  assisted: boolean
  /** Set only on the NPC turn pushed when a node's recovery attempts are
   * exhausted: the model answer the learner could have given, so it can
   * render as a small aside on that turn rather than a standalone banner. */
  assistedAnswer: string | null
  assistedAnswerReading: string | null
  assistedAnswerRomaji: string | null
  createdAtUtc: string
}

export type ScenarioSessionStatus = 'active' | 'success' | 'cancelled'

export interface ScenarioSession {
  sessionId: string
  scenarioId: string
  scenarioVersion: number
  level: LearnerLevel
  currentNodeId: string
  status: ScenarioSessionStatus
  attempts: Record<string, number>
  hintLevels: Record<string, number>
  objectiveStatus: Record<string, ObjectiveStatus>
  transcript: ScenarioTurnRecord[]
  startedAtUtc: string
  completedAtUtc: string | null
}

// The engine used to also emit a transient 'show-feedback' effect alongside
// these two, but everything it carried (the NPC's recovery line, a partial
// answer's correction, the fallback model answer) is already written onto a
// ScenarioTurnRecord in the transcript — a separate floating banner only
// duplicated it and ate vertical space. The transcript is now the only place
// this information lives.
export type ScenarioEngineEffect =
  | { type: 'speak-npc-line'; line: NpcLine }
  | { type: 'complete-session'; outcome: 'success' | 'cancelled' }

export interface ScenarioAdvanceResult {
  session: ScenarioSession
  effects: ScenarioEngineEffect[]
}

// --- Summary / SRS review ----------------------------------------------------

export interface ScenarioObjectiveSummary {
  id: string
  label: string
  status: ObjectiveStatus
}

export interface ScenarioCorrectionSummary {
  turnIndex: number
  text: string
}

export interface ScenarioMistakeSummary {
  id: string
  count: number
  explanation: string
}

export interface ScenarioSummary {
  objectives: ScenarioObjectiveSummary[]
  corrections: ScenarioCorrectionSummary[]
  vocabularyPractised: string[]
  grammarPractised: string[]
  recurringMistakes: ScenarioMistakeSummary[]
  suggestedNextSteps: string[]
}

export interface SrsDraft {
  id: string
  front: string
  back: string
  reading: string
  notes: string
  source: 'authored' | 'mistake'
}

// --- Persistence payloads (renderer-side shape; see Phase 5 for bridge shapes) ---

export interface ScenarioSessionRecord {
  id: string
  scenarioId: string
  scenarioVersion: number
  learnerLevel: LearnerLevel
  startedAtUtc: string
  completedAtUtc: string
  transcript: ScenarioTurnRecord[]
  summary: ScenarioSummary
}

export interface ScenarioSrsCardRecord {
  id: string
  sessionId: string
  scenarioId: string
  front: string
  back: string
  reading: string
  notes: string
  createdAtUtc: string
}

// --- Voice injection (useScenarioTutor) --------------------------------------

/** The slice of the shared voice runtime Scenario Practice needs, injected by
 * App.tsx. Structurally compatible with the tutor feature's VoiceDeps so both
 * activities share one audio channel (and therefore one run-id): starting NPC
 * playback cancels a chat reply mid-sentence, and vice versa. */
export interface ScenarioVoiceDeps {
  playVoiceRuntimeAudio: (text: string, runId: number, speedScale?: number) => Promise<boolean>
  cancelAssistantSpeech: () => void
  assistantSpeechRunIdRef: { current: number }
  /** True once the voice runtime has proven unavailable — NPC text is always
   * rendered regardless; this only hides the audio controls. */
  voiceUnavailable?: boolean
}

export interface UseScenarioTutorOptions {
  voice?: ScenarioVoiceDeps
  /** Shared Tutor voice toggle. When false, NPC lines are text-only. */
  audioEnabled?: boolean
  /** Settings toggle for consulting an installed local model on responses the
   * deterministic evaluator can't classify. Off, or with no model installed,
   * those turns take the authored recovery path instead. */
  aiEvaluationEnabled?: boolean
  /** Overridable for tests; defaults to the IPC-backed evaluator. */
  aiEvaluator?: ScenarioAiEvaluator
}

/** A speech transcription accepted by the STT confidence pre-gate and placed in
 * the input box for the learner to confirm or edit before submitting. */
export interface ScenarioTranscription {
  text: string
  confidence: number
}

// --- Orchestration / screen state (useScenarioTutor) -------------------------

export type ScenarioActivityScreen = 'select' | 'intro' | 'session' | 'summary' | 'srs-review' | 'history'

export type ScenarioConfirmAction = 'abandon' | 'restart' | null

export type SrsDraftStatus = 'pending' | 'accepted' | 'dismissed'

export interface SrsDraftState extends SrsDraft {
  status: SrsDraftStatus
}

/** One completed session as shown in the Scenario Practice history list —
 * adapted from the persisted bridge payload for display/re-reading. */
export interface ScenarioHistoryEntry {
  id: string
  scenarioId: string
  scenarioTitle: string
  learnerLevel: LearnerLevel
  completedAtUtc: string
  summary: ScenarioSummary
  transcript: ScenarioTurnRecord[]
}
