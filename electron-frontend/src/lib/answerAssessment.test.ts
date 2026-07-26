import { describe, expect, it } from 'vitest'
import { assessConjugationAnswer, assessTypedAnswer } from './answerAssessment'

describe('assessConjugationAnswer', () => {
  const accepted = ['食べて', 'たべて']

  it('accepts the kanji spelling', () => {
    expect(assessConjugationAnswer(accepted, '食べて')).toBe('exact')
  })

  it('accepts the kana spelling', () => {
    expect(assessConjugationAnswer(accepted, 'たべて')).toBe('exact')
  })

  it('rejects a different form that is one character away', () => {
    // This is the whole reason the mode does not reuse assessTypedAnswer:
    // 食べた is the past, not the te-form, and the two differ by one kana.
    expect(assessTypedAnswer('食べて', '食べた')).toBe('near_miss')
    expect(assessConjugationAnswer(accepted, '食べた')).toBe('incorrect')
    expect(assessConjugationAnswer(accepted, 'たべた')).toBe('incorrect')
  })

  it('rejects an unconjugated dictionary form', () => {
    expect(assessConjugationAnswer(accepted, '食べる')).toBe('incorrect')
  })

  it('accepts either standard negative of a na-adjective', () => {
    const negatives = ['静かじゃない', 'しずかじゃない', '静かではない', 'しずかではない']
    expect(assessConjugationAnswer(negatives, '静かではない')).toBe('exact')
    expect(assessConjugationAnswer(negatives, 'しずかじゃない')).toBe('exact')
  })

  it('ignores surrounding whitespace and width', () => {
    expect(assessConjugationAnswer(accepted, '  食べて  ')).toBe('exact')
  })

  it('treats an empty answer as incorrect', () => {
    expect(assessConjugationAnswer(accepted, '')).toBe('incorrect')
    expect(assessConjugationAnswer(accepted, '   ')).toBe('incorrect')
  })

  it('is incorrect when no spellings were supplied', () => {
    expect(assessConjugationAnswer([], '食べて')).toBe('incorrect')
  })
})
