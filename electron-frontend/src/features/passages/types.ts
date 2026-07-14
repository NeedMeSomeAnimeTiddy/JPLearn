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

export interface ReaderSettings {
  furiganaVisible: boolean
  fontSize: 'small' | 'medium' | 'large'
}

export type PassageProgress = 'not-started' | 'in-progress' | 'completed'

export interface PassageProgressEntry {
  passageId: string
  status: PassageProgress
  lastPosition: number
  completedAt: string | null
}
