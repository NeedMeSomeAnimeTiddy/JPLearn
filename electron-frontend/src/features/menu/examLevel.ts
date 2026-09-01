import { JLPT_MODE_META, JLPT_READY_PCT } from '../../constants'
import type { JlptExamMode } from '../../types'
import type { Rung } from './ascent'
import type { LevelReadiness } from './ascent'

/* ==================================================================================================
   ONE RUNG — THE EXAM's level three. The ascent shows the ladder; this shows a level.

   AND IT CARRIES THE ONE FACT NOTHING IN THIS APP STATES. The JLPT does not add your papers up and
   compare the total to a pass mark: the vocabulary-and-grammar section is a SEPARATE GATE, and a
   total above the mark with that section below 19 — or 38 at N4 and N5 — is still a fail. Both
   numbers are on `JLPT_LEVEL_SPECS` and have been reported to the renderer all along, and no screen
   has ever drawn what they are for.

   WHAT THE APP CANNOT PROJECT IS HATCHED, NOT ZEROED. `domain/jlpt_readiness` says it outright:
   listening is not assessed in this system, and at N1 to N3 reading is scored on its own paper too.
   So the app can project ONE section of the exam and never the total out of 180 — 60 points of it
   at N4 and N5, and 120 at N3 upward, simply have no source. A "0" there would be a prediction that
   you fail; an em dash is the truth, which is that nobody asked.
   ================================================================================================== */

/** the papers the app can and cannot speak for, which differs by level */
export interface Unscored {
  /** points of the 180 that this app has no content for */
  points: number
  /** and which papers they are, in the exam's own words */
  papers: string
}

export function unscored(sectionMax: number): Unscored {
  /* 120 means vocabulary, grammar AND reading are one paper here (N4/N5), so only listening is
     missing; 60 means reading is its own paper too and the app speaks for neither it nor listening */
  return sectionMax >= 120
    ? { points: 60, papers: 'LISTENING' }
    : { points: 120, papers: 'READING AND LISTENING' }
}

export interface ExamMode {
  key: JlptExamMode
  label: string
  description: string
  /* WHAT THE MODE IS FOR, which is the difference a learner deciding what to press actually needs.
     Two of the four move the readiness figure, one measures it, one finds which level to aim at —
     and the app's own descriptions, which are about mechanics, never say which is which. */
  purpose: string
}

const PURPOSE: Record<JlptExamMode, string> = {
  diagnostic: 'FINDS YOUR LEVEL',
  mock_exam: 'MEASURES IT',
  adaptive_review: 'MOVES THE NUMBER',
  weak_area_drill: 'MOVES THE NUMBER',
}

export const EXAM_MODES: ExamMode[] = (
  ['diagnostic', 'mock_exam', 'adaptive_review', 'weak_area_drill'] as JlptExamMode[]
).map((key) => ({
  key,
  label: JLPT_MODE_META[key].label,
  description: JLPT_MODE_META[key].description,
  purpose: PURPOSE[key],
}))

export interface LastMock {
  correct: number
  asked: number
  /** the backend's own projection for the section, stored on the result */
  projected: number | null
}

export interface LevelDetail {
  id: string
  pct: number
  state: string
  isReady: boolean
  /** how many points of readiness are still missing, which is what a learner can act on */
  shortBy: number
  kanji: { done: number; total: number; pct: number }
  vocab: { done: number; total: number; pct: number }
  /** the section the app can score, and its own separate pass mark */
  section: { max: number; passMark: number; projected: number | null }
  /** the whole exam's mark, out of 180 */
  passMark: number
  unscored: Unscored
  lastMock: LastMock | null
  locked: boolean
}

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)

export function levelDetail(rung: Rung, data: LevelReadiness, lastMock: LastMock | null): LevelDetail {
  return {
    id: rung.id,
    pct: rung.pct,
    /* THE HEADLINE READS WHAT IS LEFT, not what is done: "18 points short" is something a learner
       can act on and "62%" on its own is not. */
    shortBy: Math.max(0, JLPT_READY_PCT - rung.pct),
    isReady: rung.isReady,
    state: rung.state === 'locked' ? 'LOCKED'
      : rung.isTarget ? 'YOUR TARGET'
        : rung.isReady ? 'READY TO SIT' : 'OPEN',
    kanji: { done: data.mastered_kanji, total: data.total_kanji, pct: pct(data.mastered_kanji, data.total_kanji) },
    vocab: { done: data.mastered_vocab, total: data.total_vocab, pct: pct(data.mastered_vocab, data.total_vocab) },
    section: {
      max: data.vocab_grammar_section_max,
      passMark: data.vocab_grammar_pass_mark,
      projected: lastMock?.projected ?? null,
    },
    passMark: data.pass_mark,
    unscored: unscored(data.vocab_grammar_section_max),
    lastMock,
    locked: rung.state === 'locked',
  }
}

/** what the section line says, which depends on whether a mock has ever been sat */
export function sectionLine(d: LevelDetail): string {
  if (d.locked) return 'LOCKED — NO MOCK CAN BE SAT YET'
  if (d.lastMock === null || d.lastMock.projected === null) {
    return `NO MOCK SAT · PASS MARK ${d.section.passMark} OF ${d.section.max}`
  }
  return `LAST MOCK ${d.lastMock.correct} / ${d.lastMock.asked} → ${d.lastMock.projected} OF `
    + `${d.section.max} · PASS MARK ${d.section.passMark}`
}
