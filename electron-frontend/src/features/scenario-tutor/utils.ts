import { romajiToKana } from '../../lib/romajiToKana'
import type {
  ObjectiveStatus,
  ScenarioCorrectionSummary,
  ScenarioDefinition,
  NpcLine,
  ScenarioMistakeSummary,
  ScenarioObjectiveSummary,
  ScenarioSession,
  ScenarioSummary,
  ScenarioTurnRecord,
  SlotSpec,
  SrsDraft,
} from './types'

// --- Normalisation ------------------------------------------------------------

const DASH_VARIANTS: Record<string, string> = {
  '‐': 'ー', '‑': 'ー', '‒': 'ー', '–': 'ー',
  '—': 'ー', '―': 'ー', '−': 'ー', 'ｰ': 'ー',
}

/** Maps every hiragana mora (incl. dakuten/handakuten/small-y) to its trailing vowel. */
const VOWEL_GROUPS: Record<'a' | 'i' | 'u' | 'e' | 'o', string> = {
  a: 'あかさたなはまやらわがざだばぱゃ',
  i: 'いきしちにひみりぎじぢびぴ',
  u: 'うくすつぬふむゆるぐずづぶぷゅ',
  e: 'えけせてねへめれげぜでべぺ',
  o: 'おこそとのほもよろをごぞどぼぽょ',
}

const VOWEL_KANA: Record<'a' | 'i' | 'u' | 'e' | 'o', string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
}

/** Maps every hiragana mora character to its plain vowel kana (こ -> お, ひ -> い, etc). */
const CHAR_TO_VOWEL = new Map<string, string>()
for (const [vowel, chars] of Object.entries(VOWEL_GROUPS) as [keyof typeof VOWEL_KANA, string][]) {
  const vowelKana = VOWEL_KANA[vowel]
  for (const char of chars) CHAR_TO_VOWEL.set(char, vowelKana)
}
// The plain vowel kana map to themselves (あ -> あ, etc.)
for (const vowelKana of Object.values(VOWEL_KANA)) CHAR_TO_VOWEL.set(vowelKana, vowelKana)

function foldKatakanaToHiragana(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x30a1 && code <= 0x30f6) {
      result += String.fromCodePoint(code - 0x60)
    } else {
      result += char
    }
  }
  return result
}

function unifyDashVariants(value: string): string {
  let result = ''
  for (const char of value) result += DASH_VARIANTS[char] ?? char
  return result
}

/**
 * Expands the prolonged-sound mark (ー) into a repeated vowel kana based on
 * the mora it follows, e.g. コーヒー -> こーひー (after kana folding) ->
 * こおひい. Doing this (rather than deleting ー) makes real chouon-marked
 * text compare equal to romaji input typed with doubled vowels (koohii),
 * since romajiToKana naturally produces the doubled-vowel form already.
 * Falls back to leaving ー untouched when the preceding mora has no known
 * vowel (start of string, after ん/っ, or an unrecognised character).
 */
function expandProlongedMarks(value: string): string {
  let result = ''
  for (const char of value) {
    if (char === 'ー') {
      const previous = result.length > 0 ? result[result.length - 1] : ''
      const vowel = CHAR_TO_VOWEL.get(previous)
      result += vowel ?? 'ー'
    } else {
      result += char
    }
  }
  return result
}

/**
 * Folds the three kana pairs that sound identical but are spelled differently,
 * so a learner is never marked wrong for a spelling convention:
 *   は/わ  こんばんは vs こんばんわ (and romaji "konbanwa")
 *   へ/え  the へ particle vs the え a learner types
 *   を/お  コーヒーをください vs romaji "koohii o kudasai"
 * Applied symmetrically to learner input and authored phrases, so it only ever
 * merges forms that are homophones — it cannot make two different answers
 * collide unless a node authored both spellings as distinct meanings.
 */
const HOMOPHONE_KANA: Record<string, string> = { 'は': 'わ', 'へ': 'え', 'を': 'お' }

function foldHomophoneKana(value: string): string {
  let result = ''
  for (const char of value) result += HOMOPHONE_KANA[char] ?? char
  return result
}

/**
 * Normalises Japanese (or mixed) learner/authored text for scenario answer
 * comparison: Unicode NFKC, strip all punctuation/whitespace, fold katakana
 * to hiragana, unify dash-like glyphs, expand ー into a doubled vowel, then
 * fold homophone kana spellings. Latin letters are lowercased but not
 * stripped, so bare romaji can still be compared once converted (see
 * buildNormalizedCandidates).
 */
export function normalizeJapaneseAnswer(value: string): string {
  const nfkc = value.normalize('NFKC').toLowerCase()
  const stripped = nfkc.replace(/[^\p{L}\p{N}]+/gu, '')
  const folded = foldKatakanaToHiragana(stripped)
  const dashUnified = unifyDashVariants(folded)
  return foldHomophoneKana(expandProlongedMarks(dashUnified))
}

/**
 * Returns every normalised comparison form for a learner's raw input: the
 * direct normalisation, plus (when the input contains Latin letters) the
 * romaji-converted-to-hiragana form, also normalised. Evaluation compares
 * against every candidate and keeps the best result.
 */
export function buildNormalizedCandidates(rawInput: string): string[] {
  const candidates = new Set<string>()
  const direct = normalizeJapaneseAnswer(rawInput)
  if (direct) candidates.add(direct)
  if (/[a-zA-Z]/.test(rawInput)) {
    const converted = normalizeJapaneseAnswer(romajiToKana(rawInput, 'hiragana'))
    if (converted) candidates.add(converted)
  }
  return [...candidates]
}

// --- Fuzzy matching (conservative, length-gated for Japanese) ---------------

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length
  let previousRow: number[] = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const currentRow: number[] = [i]
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1
      currentRow[j] = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + substitutionCost,
      )
    }
    previousRow = currentRow
  }
  return previousRow[right.length]
}

function isAdjacentTransposition(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  const diffs: number[] = []
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) diffs.push(index)
  }
  if (diffs.length !== 2) return false
  const [i, j] = diffs
  return j === i + 1 && left[i] === right[j] && left[j] === right[i]
}

/**
 * Conservative fuzzy match for already-normalised Japanese text. Length-gated
 * so short answers require an exact/near-exact match (a single wrong
 * character in a 2-3 mora word usually changes the word entirely), while
 * longer phrases tolerate a small edit distance for typing/transcription
 * slips.
 */
export function isConservativeFuzzyMatch(normalizedCandidate: string, normalizedTarget: string): boolean {
  if (!normalizedCandidate || !normalizedTarget) return false
  if (normalizedCandidate === normalizedTarget) return true
  const minLength = Math.min(normalizedCandidate.length, normalizedTarget.length)
  if (minLength <= 3) return false
  const distance = levenshteinDistance(normalizedCandidate, normalizedTarget)
  if (minLength >= 4 && isAdjacentTransposition(normalizedCandidate, normalizedTarget)) return true
  if (minLength <= 7) return distance <= 1
  return distance <= 2
}

// --- Slot scanning -------------------------------------------------------------

export interface SlotScanResult {
  matchedSlotIds: string[]
  missingRequiredSlotIds: string[]
}

/** Scans normalised candidate forms for each slot's accepted value forms via substring containment. */
export function scanSlots(slots: SlotSpec[] | undefined, normalizedCandidates: string[]): SlotScanResult {
  if (!slots || slots.length === 0) return { matchedSlotIds: [], missingRequiredSlotIds: [] }
  const matchedSlotIds: string[] = []
  const missingRequiredSlotIds: string[] = []
  for (const slot of slots) {
    const hasMatch = slot.values.some((slotValue) =>
      slotValue.forms.some((form) => {
        const normalizedForm = normalizeJapaneseAnswer(form)
        return normalizedForm.length > 0 && normalizedCandidates.some((candidate) => candidate.includes(normalizedForm))
      }),
    )
    if (hasMatch) {
      matchedSlotIds.push(slot.id)
    } else if (slot.required) {
      missingRequiredSlotIds.push(slot.id)
    }
  }
  return { matchedSlotIds, missingRequiredSlotIds }
}

// --- Summary derivation --------------------------------------------------------

/** Pure derivation of a transcript-backed session summary. No AI, no I/O. */
export function deriveScenarioSummary(
  scenario: ScenarioDefinition,
  transcript: ScenarioTurnRecord[],
  objectiveStatus: Record<string, ObjectiveStatus>,
): ScenarioSummary {
  const objectives: ScenarioObjectiveSummary[] = scenario.objectives.map((objective) => ({
    id: objective.id,
    label: objective.label,
    status: objectiveStatus[objective.id] ?? 'missed',
  }))

  const corrections: ScenarioCorrectionSummary[] = transcript
    .filter((turn) => turn.correction)
    .map((turn) => ({ turnIndex: turn.turnIndex, text: turn.correction! }))

  const traversedNodeIds = new Set(transcript.map((turn) => turn.nodeId))
  const vocabularyPractised = scenario.vocabulary
    .filter((item) => item.nodeIds.some((nodeId) => traversedNodeIds.has(nodeId)))
    .map((item) => item.ja)
  const grammarPractised = scenario.grammarPoints
    .filter((point) => point.nodeIds.some((nodeId) => traversedNodeIds.has(nodeId)))
    .map((point) => point.label)

  const mistakeCounts = new Map<string, number>()
  for (const turn of transcript) {
    if (turn.mistakeId) {
      mistakeCounts.set(turn.mistakeId, (mistakeCounts.get(turn.mistakeId) ?? 0) + 1)
    }
  }
  const mistakeExplanations = new Map<string, string>()
  for (const node of Object.values(scenario.nodes)) {
    if (node.kind !== 'learner') continue
    for (const intent of [...node.intents, ...(node.cancelIntent ? [node.cancelIntent] : [])]) {
      for (const mistake of intent.commonMistakes ?? []) {
        mistakeExplanations.set(mistake.id, mistake.explanation)
      }
    }
  }
  const recurringMistakes: ScenarioMistakeSummary[] = [...mistakeCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([id, count]) => ({ id, count, explanation: mistakeExplanations.get(id) ?? '' }))

  return {
    objectives,
    corrections,
    vocabularyPractised,
    grammarPractised,
    recurringMistakes,
    suggestedNextSteps: scenario.suggestedNextSteps,
  }
}

/** Deterministic SRS draft generation from authored metadata + recorded mistakes actually hit. */
export function generateSrsDrafts(scenario: ScenarioDefinition, transcript: ScenarioTurnRecord[]): SrsDraft[] {
  const traversedNodeIds = new Set(transcript.map((turn) => turn.nodeId))
  const hitMistakeIds = new Set(transcript.filter((turn) => turn.mistakeId).map((turn) => turn.mistakeId as string))
  const drafts: SrsDraft[] = []

  for (const candidate of scenario.srsCandidates) {
    const { trigger } = candidate
    let include = false
    if (trigger.kind === 'vocabulary') {
      const vocab = scenario.vocabulary.find((item) => item.id === trigger.vocabId)
      include = !!vocab && vocab.nodeIds.some((nodeId) => traversedNodeIds.has(nodeId))
    } else if (trigger.kind === 'grammar') {
      const grammar = scenario.grammarPoints.find((item) => item.id === trigger.grammarId)
      include = !!grammar && grammar.nodeIds.some((nodeId) => traversedNodeIds.has(nodeId))
    } else if (trigger.kind === 'mistake') {
      include = hitMistakeIds.has(trigger.mistakeId)
    }
    if (include) {
      drafts.push({
        id: candidate.id,
        front: candidate.front,
        back: candidate.back,
        reading: candidate.reading ?? '',
        notes: candidate.notes ?? '',
        source: trigger.kind === 'mistake' ? 'mistake' : 'authored',
      })
    }
  }
  return drafts
}

// --- The conversation screen ----------------------------------------------------
// What the sheet works out before it can draw itself: the objective ticks under it, the answer it
// holds until ENTER, and the finished session's pages. Pure, so the screen is props and arithmetic.

export type ObjectiveMark = 'todo' | 'here' | 'on' | 'given'

export interface ObjectiveTick {
  id: string
  label: string
  required: boolean
  mark: ObjectiveMark
}

export interface ObjectiveTally {
  ticks: ObjectiveTick[]
  needed: number
  neededMet: number
  optional: number
  optionalMet: number
  /** met only because the scenario gave the answer after the last attempt */
  given: number
}

/** Each objective's mark: met is gold, given is a gold edge, the ones this turn is about are `here`. */
export function objectiveTally(scenario: ScenarioDefinition, session: ScenarioSession | null): ObjectiveTally {
  const status = session?.objectiveStatus ?? {}
  const node = session && session.status === 'active' ? scenario.nodes[session.currentNodeId] : undefined
  const here = new Set(node && node.kind === 'learner' ? node.objectiveIds : [])
  const ticks: ObjectiveTick[] = scenario.objectives.map((objective) => ({
    id: objective.id,
    label: objective.label.replace(/\s*\(optional\)$/i, ''),
    required: objective.required,
    mark: status[objective.id] === 'met' ? 'on'
      : status[objective.id] === 'assisted' ? 'given'
        : here.has(objective.id) ? 'here' : 'todo',
  }))
  const required = ticks.filter((tick) => tick.required)
  const optional = ticks.filter((tick) => !tick.required)
  return {
    ticks,
    needed: required.length,
    neededMet: required.filter((tick) => tick.mark === 'on').length,
    optional: optional.length,
    optionalMet: optional.filter((tick) => tick.mark === 'on').length,
    given: ticks.filter((tick) => tick.mark === 'given').length,
  }
}

/** The foot band's sentence: what is owed before, how it is going during, how it went after. */
export function objectiveFoot(tally: ObjectiveTally, phase: 'before' | 'during' | 'after'): string {
  const needed = `${tally.neededMet} OF ${tally.needed} NEEDED`
  if (phase === 'before') return tally.optional ? `${needed} · ${tally.optional} OPTIONAL` : needed
  if (phase === 'during') return tally.optional ? `${needed} · ${tally.optionalMet} OPTIONAL MET` : needed
  return tally.given ? `${needed} · ${tally.given} GIVEN` : needed
}

/** The class each tick takes in the round's foot band. */
export function objectiveTickClass(tick: ObjectiveTick): string {
  const mark = tick.mark === 'todo' ? '' : tick.mark === 'given' ? 'cv-given' : tick.mark
  return [tick.required ? '' : 'cv-opt', mark].filter(Boolean).join(' ')
}

/** The newest line the character has said before `before`, and how many turns came ahead of it. */
export function latestNpcTurn(
  transcript: ScenarioTurnRecord[],
  before = transcript.length,
): { line: NpcLine; earlier: number } | null {
  for (let i = Math.min(before, transcript.length) - 1; i >= 0; i--) {
    const line = transcript[i].npcLine
    if (line) return { line, earlier: i }
  }
  return null
}

export interface HeldAnswer {
  /** the learner's own turn, with its outcome and any correction */
  turn: ScenarioTurnRecord
  /** which try at this line it was, of how many the line allows */
  attempt: number
  maxAttempts: number
  /** what the character says next, in order */
  next: NpcLine[]
  /** the model answer, when the attempts ran out and the scenario moved on without you */
  given: { answer: string; reading: string | null; romaji: string | null } | null
  /** the line you were answering */
  answering: { line: NpcLine; earlier: number } | null
}

/**
 * THE ANSWER THE SHEET HOLDS UNTIL ENTER. The engine applies a turn at once and moves on, so the
 * transcript already holds the reply, its correction and the character's next line; `from` is how
 * long the transcript was when the reply was sent, and everything after it is this answer.
 */
export function heldAnswer(
  scenario: ScenarioDefinition,
  transcript: ScenarioTurnRecord[],
  from: number,
): HeldAnswer | null {
  const index = transcript.findIndex((turn, i) => i >= from && turn.learnerInput !== null)
  if (index < 0) return null
  const turn = transcript[index]
  let attempt = 0
  for (let i = index; i >= 0; i--) {
    const earlier = transcript[i]
    if (earlier.learnerInput === null) continue
    if (earlier.nodeId !== turn.nodeId) break
    attempt += 1
  }
  const node = scenario.nodes[turn.nodeId]
  const after = transcript.slice(index + 1)
  const givenTurn = after.find((entry) => entry.assistedAnswer)
  return {
    turn,
    attempt,
    maxAttempts: node && node.kind === 'learner' ? node.recovery.maxAttempts : attempt,
    next: after.flatMap((entry) => (entry.npcLine ? [entry.npcLine] : [])),
    given: givenTurn?.assistedAnswer
      ? { answer: givenTurn.assistedAnswer, reading: givenTurn.assistedAnswerReading, romaji: givenTurn.assistedAnswerRomaji }
      : null,
    answering: latestNpcTurn(transcript, index),
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 'S'}`
}

/** What a finished session's summary holds, as one line of counts. */
export function summaryFold(summary: ScenarioSummary): string {
  return [
    summary.corrections.length ? plural(summary.corrections.length, 'CORRECTION') : null,
    summary.vocabularyPractised.length ? plural(summary.vocabularyPractised.length, 'WORD') : null,
    summary.grammarPractised.length ? plural(summary.grammarPractised.length, 'PATTERN') : null,
    summary.recurringMistakes.length ? plural(summary.recurringMistakes.length, 'REPEATED MISTAKE') : null,
    summary.suggestedNextSteps.length ? plural(summary.suggestedNextSteps.length, 'NEXT STEP') : null,
  ].filter(Boolean).join(' · ')
}

export interface DetailLine {
  cap: string
  text: string
  /** set when the line is Japanese, so it is set in the Japanese face */
  jp?: boolean
}

/** Everything the summary and the transcript say, cut into pages of `rows` lines. */
export function summaryPages(
  scenario: ScenarioDefinition,
  transcript: ScenarioTurnRecord[],
  summary: ScenarioSummary,
  rows: number,
): DetailLine[][] {
  const npc = scenario.npc.name.toUpperCase()
  const lines: DetailLine[] = [
    ...summary.corrections.map((c) => ({ cap: 'CORRECTION', text: c.text, jp: true })),
    ...(summary.vocabularyPractised.length ? [{ cap: 'WORDS', text: summary.vocabularyPractised.join('、'), jp: true }] : []),
    ...summary.grammarPractised.map((text) => ({ cap: 'PATTERN', text })),
    ...summary.recurringMistakes.map((m) => ({ cap: 'REPEATED', text: `${m.explanation} (${m.count}×)` })),
    ...summary.suggestedNextSteps.map((text) => ({ cap: 'NEXT STEP', text })),
    ...transcript.map((turn) => (turn.npcLine
      ? { cap: npc, text: turn.npcLine.ja, jp: true }
      : { cap: 'YOU', text: turn.learnerInput ?? '', jp: true })),
  ]
  const size = Math.max(1, rows)
  const pages: DetailLine[][] = []
  for (let i = 0; i < lines.length; i += size) pages.push(lines.slice(i, i + size))
  return pages
}

/** The character's line is the prompt: as large as the cell lets it be, smaller as it grows. */
export function lineSize(text: string): number {
  const n = [...text].length
  if (n <= 12) return 28
  if (n <= 20) return 24
  return 20
}
