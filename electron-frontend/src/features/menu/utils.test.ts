import { describe, expect, it } from 'vitest'
import type { ProgressionNodeView } from '../progression'
import { rowsFrom } from './utils'

/* THE STUDY ROW'S PLACE ON THE PATH. Only the fields `rowsFrom` reads are filled in. */
function node(
  node_id: string, name: string, status: string, is_tracked: boolean, progressLabel = '',
): ProgressionNodeView {
  return { node_id, name, status, is_tracked, progressLabel } as unknown as ProgressionNodeView
}

const rows = (nodes: ProgressionNodeView[]) => rowsFrom({ nodes, block: null, streakDays: null })

describe('rowsFrom STUDY', () => {
  it('stops at the first measured step not yet mastered', () => {
    const study = rows([
      node('hiragana', 'Hiragana', 'mastered', true, '104/104'),
      node('katakana', 'Katakana', 'unlocked', true, '52/104'),
      node('vocabulary_n5', 'Vocabulary N5', 'locked', true, '0/744'),
    ]).STUDY
    expect(study.val).toBe('STEP 02 · KATAKANA')
    expect(study.pct).toBe(50)
  })

  it('walks past a step the app cannot measure, which can never be mastered', () => {
    /* audit 3, F7: the row used to sit on Sentence Examples for good, with a fallback figure */
    const study = rows([
      node('grammar_n5', 'Grammar N5', 'mastered', true, '88/88'),
      node('sentence_examples', 'Sentence Examples', 'unlocked', false),
      node('scripted_conv', 'Scripted Conversation', 'unlocked', false),
      node('listening', 'Listening', 'unlocked', false),
      node('kanji_n5', 'Basic Kanji (N5)', 'unlocked', true, '33/99'),
      node('free_conv', 'Free Conversation', 'locked', false),
    ]).STUDY
    expect(study.tok).toBe('STEP 05/6')
    expect(study.val).toBe('STEP 05 · BASIC KANJI (N5)')
    /* the kanji step's own figure, not distance along the road */
    expect(study.pct).toBe(33)
  })

  it('reaches the end once every measured step is mastered', () => {
    const study = rows([
      node('kanji_n5', 'Basic Kanji (N5)', 'mastered', true, '99/99'),
      node('reading', 'Reading', 'unlocked', false),
      node('jlpt_n5', 'JLPT N5', 'unlocked', false),
    ]).STUDY
    expect(study.val).toBe('ALL TRACKED STEPS DONE')
  })
})

describe('rowsFrom JLPT', () => {
  it('still counts only mastered JLPT steps, so reached ones do not pass', () => {
    const jlpt = rows([
      node('jlpt_n5', 'JLPT N5', 'unlocked', false),
      node('jlpt_n4', 'JLPT N4', 'unlocked', false),
      node('jlpt_n3', 'JLPT N3', 'unlocked', false),
      node('jlpt_n2', 'JLPT N2', 'unlocked', false),
      node('jlpt_n1', 'JLPT N1', 'unlocked', false),
    ]).JLPT
    expect(jlpt.val).toBe('0 OF 5 MASTERED')
  })
})
