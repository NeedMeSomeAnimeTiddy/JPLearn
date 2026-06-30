// AUTO-GENERATED — do not edit manually.
// Run: python scripts/generate_ts_types.py
// Source: scripts/desktop_bridge.py
//
// These interfaces mirror the Python @dataclass types in desktop_bridge.py.
// Any field-type change in Python should result in a changed file here.
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
}

export interface GameCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence: string | null
  is_leech: boolean
  curriculum_stage: number
  meaning_distractor_ids: number[]
  character_distractor_ids: number[]
}

export interface OverviewCharacterCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence: string | null
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
}
