import type { PlayableMinigame } from '../../types'

/* ==================================================================================================
   WHAT EACH MODE ASKS, AND WHAT IT ASKS YOU TO DO ABOUT IT.

   These were two ternaries eleven branches deep in the middle of `MinigameView`'s JSX, one for the
   response panel's title and one for its copy, with the mode tested from the top for each. They are
   the authored words and they are kept exactly -- what changes is that a table of sixteen modes is
   now a table, so a new mode is a row rather than a nesting level, and the round's markup does not
   have to be read past to find out what a screen says.

   THE JAPANESE IS TEXTURE, NOT THE LABEL. Every line here is English-led with a short Japanese word
   beside it, which is the same law the heading slab obeys -- see `chrome.ts`. The word you navigate
   by has to be the one you can read at a glance.
   ================================================================================================== */

export interface RoundCopy {
  /** the prompt cell's kicker — the question, in the fewest words that are still a question */
  ask: string
  askJp: string
  /** the work cell's kicker — what you do about it */
  work: string
  workJp: string
  /** the line under the work kicker, when the mode needs one */
  note: string | null
}

const CHOICE: RoundCopy = {
  ask: 'WHAT DOES THIS MEAN?', askJp: '意味',
  work: 'CHOOSE ONE', workJp: '四択',
  note: 'Commit to one answer and keep the run moving.',
}

export const ROUND_COPY: Record<PlayableMinigame, RoundCopy> = {
  meaning_match: CHOICE,
  character_match: {
    ask: 'WHICH CHARACTER IS THIS?', askJp: '字',
    work: 'CHOOSE ONE', workJp: '四択',
    note: 'Commit to one answer and keep the run moving.',
  },
  kanji_compound_builder: {
    ask: 'WHICH KANJI COMPLETES IT?', askJp: '熟語',
    work: 'CHOOSE ONE', workJp: '四択',
    note: 'Commit to one answer and keep the run moving.',
  },
  context_cloze: {
    ask: 'WHAT FILLS THE GAP?', askJp: '穴埋',
    work: 'CHOOSE ONE', workJp: '四択',
    note: 'Commit to one answer and keep the run moving.',
  },
  particle_cloze: {
    ask: 'WHICH PARTICLE IS MISSING?', askJp: '助詞',
    work: 'CHOOSE THE MISSING PARTICLE', workJp: '助詞',
    note: 'Use syntax and particle role to choose the best fit.',
  },
  vibe_check: {
    ask: 'HOW FORMAL IS THIS?', askJp: '語調',
    work: 'READ THE REGISTER VIBE', workJp: '語調',
    note: 'Use sentence endings like です, ます, or ください as tone clues.',
  },
  imposter: {
    ask: 'WHERE IS THE MISTAKE?', askJp: '誤用',
    work: 'SPOT THE GRAMMAR IMPOSTER', workJp: '誤用',
    note: 'Pick the token that introduces the grammar error.',
  },
  listening_audio_first: {
    ask: 'WHAT DID YOU HEAR?', askJp: '聴解',
    work: 'CHOOSE ONE', workJp: '四択',
    note: 'Commit to one answer and keep the run moving.',
  },
  romaji_sprint: {
    ask: 'HOW IS THIS READ?', askJp: '読み',
    work: 'TYPE THE READING', workJp: '入力',
    note: 'Submit as soon as the reading is clear in your head.',
  },
  typed_recall: {
    ask: 'WHAT DOES THIS MEAN?', askJp: '意味',
    work: 'TYPE THE MEANING', workJp: '入力',
    note: 'Short, direct answers work best.',
  },
  dictation: {
    ask: 'WHAT DID YOU HEAR?', askJp: '書取',
    work: 'TYPE THE ROMAJI', workJp: '入力',
    note: 'Type the romaji for what you hear. Use English letters.',
  },
  conjugation_drill: {
    ask: 'PUT IT IN THIS FORM', askJp: '活用',
    work: 'TYPE THE FORM', workJp: '入力',
    note: 'Type here — it converts to kana as you go.',
  },
  speech_recall: {
    ask: 'WHAT DOES THIS MEAN?', askJp: '意味',
    work: 'SPEAK THE MEANING', workJp: '発話',
    note: 'Tap the mic and say your answer clearly.',
  },
  stroke_order: {
    ask: 'BUILD THIS KANJI', askJp: '筆順',
    work: 'BUILD THE MATCHING KANJI', workJp: '筆順',
    note: 'Type the romaji reading to narrow the kanji candidates.',
  },
  handwriting: {
    ask: 'WRITE THIS CHARACTER', askJp: '手書',
    work: 'DRAW THE CHARACTER', workJp: '手書',
    note: null,
  },
  sentence_assembly: {
    ask: 'PUT THIS IN ORDER', askJp: '並替',
    work: 'ASSEMBLE THE SENTENCE', workJp: '並替',
    note: 'Drag chunks into natural order, then submit.',
  },
}

/* THE MODES WHOSE ANSWER IS TYPED, and the ones that bring a board of their own. Everything not in
   either list takes the four slips, which is the same fall-through the view had before -- a mode
   nobody has classified gets the shape most modes have rather than nothing at all. */
export const TYPED_MODES: readonly PlayableMinigame[] = [
  'romaji_sprint', 'typed_recall', 'dictation', 'conjugation_drill',
]

export const PANEL_MODES: readonly PlayableMinigame[] = [
  'handwriting', 'stroke_order', 'sentence_assembly', 'speech_recall',
]

/** how many ticks the foot band will draw before it folds into a figure instead */
export const TICK_CAP = 40
