import { describe, expect, it } from 'vitest'
import { assessTypedRecallAnswer } from './typedRecallAssessment'
import type { RoundDictionaryNote } from '../types'

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
})
