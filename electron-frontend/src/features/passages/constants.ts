import type { DifficultyLabel, ReaderSettings } from './types'

export const DIFFICULTY_ORDER: Record<DifficultyLabel, number> = {
  beginner: 0,
  elementary: 1,
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  furiganaVisible: true,
}

/* ==================================================================================================
   FORTY WORDS A MINUTE, which is a beginner reading aloud and is what these thirty texts are for.

   IT LIVES HERE RATHER THAN ON THE SHELF that first needed it. The library screen prints how long
   each text takes and the reader prints how much of one is left, and a shelf and a reader
   disagreeing about the same text would be two answers to one question. It is the only number in
   either of them that is an assumption rather than a measurement, so it is named rather than buried
   in an expression.
   ================================================================================================== */
export const READING_PACE = 40
