import { describe, expect, it } from 'vitest'
import {
  assessConjugationAnswer,
  assessJapaneseAnswer,
  assessTypedAnswer,
  foldKana,
  formatKanaSpellings,
  type TypedAnswerState,
} from './answerAssessment'
import typedAnswerCases from './typedAnswerCases.json'

describe('assessTypedAnswer', () => {
  // tests/test_typed_answer.py runs the same table against domain/answer_check.py.
  it.each(typedAnswerCases as { expected: string; given: string; state: TypedAnswerState }[])(
    '$expected / $given -> $state',
    ({ expected, given, state }) => {
      expect(assessTypedAnswer(expected, given)).toBe(state)
    },
  )
})

describe('foldKana', () => {
  it('folds the stored reading, the typed long-vowel mark and katakana of coffee alike', () => {
    expect(foldKana('こおひい')).toBe('こおひい')
    expect(foldKana('こーひー')).toBe('こおひい')
    expect(foldKana('コーヒー')).toBe('こおひい')
    expect(foldKana('こうひい')).toBe('こおひい')
  })

  it('gives a long-vowel mark the vowel of the kana before it', () => {
    expect(foldKana('ケーキ')).toBe('けえき')
    expect(foldKana('スーパー')).toBe('すうぱあ')
    expect(foldKana('ジュース')).toBe('じゅうす')
  })

  it('leaves a long-vowel mark with no vowel before it alone', () => {
    expect(foldKana('んー')).toBe('んー')
    expect(foldKana('ー')).toBe('ー')
  })
})

describe('assessJapaneseAnswer', () => {
  it('accepts every spelling of coffee', () => {
    for (const given of ['こおひい', 'こーひー', 'コーヒー']) {
      expect(assessJapaneseAnswer(['こおひい'], given)).toBe('exact')
    }
  })

  it('accepts katakana against katakana and hiragana alike', () => {
    expect(assessJapaneseAnswer(['カキ'], 'カキ')).toBe('exact')
    expect(assessJapaneseAnswer(['カキ'], 'かき')).toBe('exact')
  })

  it('calls an answer one kana off close, never correct', () => {
    expect(assessJapaneseAnswer(['がき'], 'かき')).toBe('close')
    expect(assessJapaneseAnswer(['いぬ'], 'いえ')).toBe('close')
  })

  it('calls a single wrong kana plain wrong', () => {
    expect(assessJapaneseAnswer(['か'], 'け')).toBe('incorrect')
  })

  it('calls an answer two kana off wrong', () => {
    expect(assessJapaneseAnswer(['いぬ'], 'ねこ')).toBe('incorrect')
  })

  it('accepts each spelling of a reading stored with alternatives', () => {
    expect(assessJapaneseAnswer(['なん・なに'], 'なに')).toBe('exact')
    expect(assessJapaneseAnswer(['nan/nani'], 'nan')).toBe('exact')
  })

  it('treats an empty answer as incorrect', () => {
    expect(assessJapaneseAnswer(['いぬ'], '  ')).toBe('incorrect')
  })
})

describe('formatKanaSpellings', () => {
  it('joins stored alternatives readably', () => {
    expect(formatKanaSpellings('なん/なに')).toBe('なん or なに')
    expect(formatKanaSpellings('なん・なに')).toBe('なん or なに')
    expect(formatKanaSpellings('いぬ')).toBe('いぬ')
  })
})

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
    // 食べさせた is the past, not the te-form, and the two differ by one kana.
    expect(assessTypedAnswer('食べさせて', '食べさせた')).toBe('near_miss')
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
