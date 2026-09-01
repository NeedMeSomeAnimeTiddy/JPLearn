// AUTO-GENERATED — do not edit manually.
// Run: python scripts/generate_ts_types.py
// Source: scripts/desktop_bridge.py, data/dictionary_repository.py, data/conjugation_drill.py
//
// These interfaces mirror the Python @dataclass types declared in the source
// files above. Any field-type change in Python should result in a changed
// file here.
export interface DeckSummary {
  slug: string
  name: string
  total: number
  mastered: number
  due_today: number
  completed_today: number
}

export interface StudyStreak {
  current_days: number
  best_days: number
  freezes_available: number
}

export interface VocabFeedWord {
  card_id: number
  word: string
  reading: string
  meaning: string
  theme: string
  unknown_kanji: number
}

export interface VocabFeedPayload {
  slug: string
  budget: number
  total: number
  readable: number
  known_kanji: number
  started: number
  words: VocabFeedWord[]
}

export interface CardNotePayload {
  note_key: string
  note_text: string
  created_at_utc: string
  updated_at_utc: string
}

export interface CardNoteLookupPayload {
  note: CardNotePayload | null
}

export interface CardNoteDeletePayload {
  note_key: string
  deleted: boolean
}

export interface ScenarioSessionPayload {
  id: string
  scenario_id: string
  scenario_version: number
  learner_level: string
  started_at_utc: string
  completed_at_utc: string
  transcript: unknown[]
  summary: Record<string, unknown>
}

export interface ScenarioSessionListPayload {
  sessions: ScenarioSessionPayload[]
}

export interface ScenarioSessionLookupPayload {
  session: ScenarioSessionPayload | null
}

export interface ScenarioSessionDeletePayload {
  id: string
  deleted: boolean
}

export interface ScenarioSessionsClearPayload {
  cleared: number
}

export interface ScenarioSrsCardPayload {
  id: string
  session_id: string
  scenario_id: string
  front: string
  back: string
  reading: string
  notes: string
  created_at_utc: string
}

export interface GameCard {
  id: number
  note_key: string
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence: string | null
  dictionary_summary: DictionaryCardSummary | null
  is_leech: boolean
  curriculum_stage: number
  meaning_distractor_ids: number[]
  character_distractor_ids: number[]
}

export interface OverviewCharacterCard {
  id: number
  note_key: string
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence: string | null
  theme: string
}

export interface SessionGoalPayload {
  session_id: string
  target_items: number
  target_minutes: number | null
  target_accuracy: number | null
  started_at_utc: string
}

export interface SessionSummaryPayload {
  session_id: string
  target_items: number
  completed_items: number
  reviewed: number
  correct: number
  accuracy: number
  target_accuracy: number | null
  goal_met: boolean
}

export interface StudyQueuePayload {
  slug: string
  card_ids: number[]
  indices: number[]
  buckets_due: number
  buckets_leech: number
  buckets_new: number
  buckets_review: number
}

export interface ProgressionNodeStatusPayload {
  node_id: string
  name: string
  category: string
  status: string
  mastered_ratio: number
  is_reachable: boolean
  mastered_count: number
  total_count: number
  is_tracked: boolean
}

export interface FeatureRequirementPayload {
  node_id: string
  status: string
}

export interface FeatureStatusPayload {
  feature_id: string
  name: string
  category: string
  is_unlocked: boolean
  badges: string[]
  just_unlocked: boolean
  unlocked_at: string | null
  requires: FeatureRequirementPayload[]
}

export interface XPProgressPayload {
  level: number
  total_xp: number
  xp_to_next_level: number
  xp_for_current_level: number
}

export interface RecommendationPayload {
  node_id: string
  display_label: string
  review_count: number
  difficulty: string
  reason: string
  priority: number
  section: string
  minigame: string
  section_label: string
  leech_focus_enabled: boolean | null
}

export interface StudyBlockPayload {
  recommendations: RecommendationPayload[]
  learner_stage: string
  stage_label: string
  session_minutes: number
  session_note: string
}

export interface TutorReactionPayload {
  dedup_key: string
  event_type: string
  priority: string
  message_type: string
  headline: string
  body: string
  cta: string
}

export interface DailyGamesWordPayload {
  deck_slug: string
  deck_name: string
  card_id: number
  character: string
  romaji: string
  meaning: string
  source: string
}

export interface DailyGamesPoolPayload {
  day: string
  algorithm_version: number
  words: DailyGamesWordPayload[]
  game_seeds: Record<string, number>
}

export interface DailyGamesStreakPayload {
  last_completed_day: string | null
  current_streak_days: number
  best_streak_days: number
  freezes_available: number
  freeze_month: string | null
}

export interface DailyGamesAttemptOutcomePayload {
  pool_position: number
  outcome: string
}

export interface DailyGamesAttemptPayload {
  attempt_id: number
  pool_day: string
  game_type: string
  mode: string
  score: number
  completed: boolean
  duration_seconds: number | null
  completed_at_utc: string
  outcomes: DailyGamesAttemptOutcomePayload[]
}

export interface DailyGamesMissedWordPayload {
  word: DailyGamesWordPayload
  miss_count: number
}

export interface DailyGamesProgressPayload {
  attempt_count: number
  completed_daily_game_types: string[]
  missed_words: DailyGamesMissedWordPayload[]
}

export interface DailyGamesStatePayload {
  pool: DailyGamesPoolPayload
  streak: DailyGamesStreakPayload
  attempts: DailyGamesAttemptPayload[]
  progress: DailyGamesProgressPayload
}

export interface DailyGamesPracticeSeedPayload {
  pool_day: string
  game_type: string
  seed: number
}

export interface CardMasteryScoresPayload {
  scores: Record<string, Record<number, number>>
}

export interface CardMasteryImportPayload {
  imported: boolean
  cards_imported: number
  cards_unresolved: number
  decks_written: number
}

export interface PitchAccent {
  reading: string
  pitch_positions: number[]
  mora_count: number
  source: string
}

export interface DictionaryCardSummary {
  character: string
  reading: string
  primary_gloss: string
  glosses: string[]
  source: string
  pitch_accents: PitchAccent[]
}

export interface KanjiRadical {
  position: number
  radical: string
  stroke_count: number | null
  code: string | null
}

export interface KanjiReadingExample {
  word: string
  reading: string
  meanings: string[]
  is_common: boolean
}

export interface KanjiReading {
  reading: string
  examples: KanjiReadingExample[]
}

export interface KanjiCompound {
  word: string
  reading: string
  meanings: string[]
  is_common: boolean
}

export interface KanjiDetailPayload {
  character: string
  meanings: string[]
  on_readings: KanjiReading[]
  kun_readings: KanjiReading[]
  radicals: KanjiRadical[]
  components: string[]
  jlpt_level: string | null
  jlpt_level_source: string | null
  stroke_count: number | null
  classical_radical_number: number | null
  tags: string[]
  categories: string[]
  compounds: KanjiCompound[]
  has_more_compounds: boolean
  source: string
}

export interface ConjugationDrillPayload {
  game_type: string
  word: string
  reading: string
  word_class: string
  form: string
  form_label: string
  prompt: string
  expected: string
  expected_reading: string
  accepted: string[]
  rule_hint: string
  stage: number
}
