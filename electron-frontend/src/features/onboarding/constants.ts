import type { KnownItem } from '../../electron'
import type { OnboardingStage } from './types'

export const BEGINNER_PATH_STEPS = [
  { label: 'Hiragana', note: 'The foundational Japanese syllabary' },
  { label: 'Katakana', note: 'For foreign words and emphasis' },
  { label: 'N5 Vocabulary', note: 'Core 800-word beginner vocabulary' },
  { label: 'N5 Grammar', note: 'Essential sentence patterns' },
]

export const LEARNING_GOALS = [
  { key: 'travel',  label: 'Travel to Japan',    emoji: '✈️' },
  { key: 'anime',   label: 'Watch anime / read manga', emoji: '🎌' },
  { key: 'jlpt',    label: 'Pass the JLPT',       emoji: '📜' },
  { key: 'general', label: 'General interest',    emoji: '🌸' },
]

export const DAILY_TIMES = [
  { value: 5,  label: '5 min',  note: 'Light practice' },
  { value: 10, label: '10 min', note: 'Regular habit' },
  { value: 20, label: '20 min', note: 'Solid progress' },
  { value: 30, label: '30+ min', note: 'Deep study' },
]

export const TARGET_LEVELS = [
  { key: 'unsure', label: 'Not sure yet' },
  { key: 'n5',     label: 'JLPT N5' },
  { key: 'n4',     label: 'JLPT N4' },
  { key: 'n3',     label: 'JLPT N3' },
  { key: 'n2',     label: 'JLPT N2' },
  { key: 'n1',     label: 'JLPT N1' },
]

/* Each tick seeds only its own decks on the bridge (audit 12), so every key is a KnownItem. */
export const FAMILIARITY_ITEMS: ReadonlyArray<{ key: KnownItem; label: string; description: string }> = [
  { key: 'hiragana', label: 'Hiragana',      description: 'All 46 basic phonetic characters' },
  { key: 'katakana', label: 'Katakana',      description: 'The script for foreign words' },
  { key: 'kanji_n5', label: 'N5 Kanji',      description: '~100 basic Chinese-origin characters' },
  { key: 'vocab_n5', label: 'N5 Vocabulary', description: '~750 essential beginner words' },
  { key: 'kanji_n4', label: 'N4 Kanji',      description: '~150 more everyday kanji' },
  { key: 'vocab_n4', label: 'N4 Vocabulary', description: '~650 everyday conversation words' },
  { key: 'kanji_n3', label: 'N3 Kanji',      description: '~350 intermediate kanji' },
  { key: 'vocab_n3', label: 'N3 Vocabulary', description: '~2,100 intermediate words' },
]

/* the sentence that leads each failure, by the stage of the save that failed */
export const SUBMIT_FAILURE_LEAD: Record<OnboardingStage, string> = {
  known_items: "Couldn't save what you already know",
  complete: "Couldn't finish onboarding",
}
