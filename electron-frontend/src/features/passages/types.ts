export interface Passage {
  id: string
  title: string
  title_reading: string
  author: string
  source: string
  source_url: string
  original_publication: string
  difficulty: number
  difficulty_label: DifficultyLabel
  word_count: number
  text_jp: string
  raw_text: string
  vocabulary: PassageWord[]
}

export interface PassageWord {
  word: string
  reading: string
}

export type DifficultyLabel = 'beginner' | 'elementary'

/* ONE SETTING, BECAUSE THE OTHER ONE WAS A SCROLLER'S ANSWER. The old reader let you pick a text
   size, which is what you need when a page is however tall the window is. The sheet is 1280x720
   zoomed to whatever it lands in, so the board already scales with the window, and how much goes
   on a page is solved from the cell (`reader.proseSize`) rather than chosen. Furigana stays: it
   changes what the text SAYS, not how much of it fits. */
export interface ReaderSettings {
  furiganaVisible: boolean
}

export type PassageProgress = 'not-started' | 'in-progress' | 'completed'

export interface PassageProgressEntry {
  passageId: string
  status: PassageProgress
  lastPosition: number
  completedAt: string | null
}
