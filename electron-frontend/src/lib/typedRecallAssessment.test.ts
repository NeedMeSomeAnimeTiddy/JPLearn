import { describe, expect, it } from 'vitest'
import { assessTypedRecallAnswer } from './typedRecallAssessment'
import { buildRoundDictionaryNote } from './roundContent'
import type { RoundDictionaryNote, ScriptDeck } from '../types'

const dictionaryNote: RoundDictionaryNote = {
  title: 'Dictionary recall',
  copy: 'Stub',
  character: 'です',
  reading: 'です',
  primaryGloss: 'to be',
  secondaryGlosses: ['copula'],
  source: 'offline_dictionary',
}

describe('assessTypedRecallAnswer', () => {
  it('accepts delimited meaning variants for grammar typed recall', () => {
    const result = assessTypedRecallAnswer({
      script: 'grammar_patterns',
      expectedAnswer: 'because / since',
      givenAnswer: 'since',
      dictionaryNote: null,
    })

    expect(result).toBe('exact')
  })

  it('accepts parenthetical-free variants for sentence typed recall', () => {
    const result = assessTypedRecallAnswer({
      script: 'sentence_examples',
      expectedAnswer: 'to be (polite copula)',
      givenAnswer: 'to be',
      dictionaryNote: null,
    })

    expect(result).toBe('exact')
  })

  it('accepts infinitive-free verb variants in grammar typed recall', () => {
    const result = assessTypedRecallAnswer({
      script: 'grammar_patterns',
      expectedAnswer: 'to eat',
      givenAnswer: 'eat',
      dictionaryNote,
    })

    expect(result).toBe('exact')
  })

  it('accepts delimited variants for vocab typed recall', () => {
    const result = assessTypedRecallAnswer({
      script: 'vocab_n5',
      expectedAnswer: 'because / since',
      givenAnswer: 'since',
      dictionaryNote,
    })

    expect(result).toBe('exact')
  })

  it('keeps near-miss tolerance when using variants', () => {
    const result = assessTypedRecallAnswer({
      script: 'sentence_examples',
      expectedAnswer: 'because / since',
      givenAnswer: 'sinse',
      dictionaryNote,
    })

    expect(result).toBe('near_miss')
  })

  it('wants a word of under four letters typed exactly (audit 9: "do" is not "to go")', () => {
    const asked = { script: 'vocab_n5' as const, expectedAnswer: 'to go', dictionaryNote: null }
    expect(assessTypedRecallAnswer({ ...asked, givenAnswer: 'do' })).toBe('incorrect')
    expect(assessTypedRecallAnswer({ ...asked, givenAnswer: 'go' })).toBe('exact')
  })

  it('accepts a one-letter meaning, which is how a kana card stores its romaji (を, ん)', () => {
    const kana = { script: 'hiragana' as const, dictionaryNote: null }
    expect(assessTypedRecallAnswer({ ...kana, expectedAnswer: 'o/wo', givenAnswer: 'o' })).toBe('exact')
    expect(assessTypedRecallAnswer({ ...kana, expectedAnswer: 'o/wo', givenAnswer: 'wo' })).toBe('exact')
    expect(assessTypedRecallAnswer({ ...kana, expectedAnswer: 'n', givenAnswer: 'n' })).toBe('exact')
    expect(assessTypedRecallAnswer({ ...kana, expectedAnswer: 'n', givenAnswer: 'm' })).toBe('incorrect')
  })
})

/* AUDIT 14 F1: a card is matched only to its own dictionary entry, and a card with no exact entry
   carries no summary. The grader takes the dictionary's glosses from that summary alone, so a word
   that is only some other entry's gloss is not accepted for a card that has none. */
describe('typed recall and the dictionary summary', () => {
  const card = (summary: ScriptDeck['cards'][number]['dictionary_summary']) => ({
    id: 1, note_key: 'n', character: 'だめ', romaji: 'dame', meaning: 'no good', tags: [],
    example_sentence: null, dictionary_summary: summary,
  }) as unknown as ScriptDeck['cards'][number]
  const grade = (summary: ScriptDeck['cards'][number]['dictionary_summary']) => assessTypedRecallAnswer({
    script: 'vocab_n5',
    expectedAnswer: 'no good',
    givenAnswer: 'useless',
    dictionaryNote: buildRoundDictionaryNote(card(summary), 'typed_recall'),
  })

  it('rejects an answer that is only a dictionary gloss when the card has no summary', () => {
    expect(grade(null)).toBe('incorrect')
  })

  it('accepts the same answer when the card\'s own summary carries that gloss', () => {
    expect(grade({
      character: 'だめ', reading: 'だめ', primary_gloss: 'no good', glosses: ['no good', 'useless'],
      source: 'offline_dictionary', pitch_accents: [],
    })).toBe('exact')
  })
})
