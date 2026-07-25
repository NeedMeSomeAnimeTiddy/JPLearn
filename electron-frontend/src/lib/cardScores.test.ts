import { describe, expect, it } from 'vitest'
import { emptyCardScores, hasAnyCardScore, sectionForDeckSlug, toSectionScores } from './cardScores'

describe('sectionForDeckSlug', () => {
  it('maps the single-deck sections to themselves', () => {
    expect(sectionForDeckSlug('hiragana')).toBe('hiragana')
    expect(sectionForDeckSlug('katakana')).toBe('katakana')
    expect(sectionForDeckSlug('grammar_patterns')).toBe('grammar_patterns')
    expect(sectionForDeckSlug('sentence_examples')).toBe('sentence_examples')
  })

  it('folds every kanji and vocabulary deck into its section', () => {
    for (const slug of ['kanji_n5', 'kanji_numbers_time', 'kanji_n4_society_roles']) {
      expect(sectionForDeckSlug(slug)).toBe('kanji_n5')
    }
    for (const slug of ['vocab_n5', 'vocab_greetings', 'vocab_n1_law_justice']) {
      expect(sectionForDeckSlug(slug)).toBe('vocab_n5')
    }
  })

  it('returns null for a slug that belongs to no section', () => {
    expect(sectionForDeckSlug('scenario_practice')).toBeNull()
  })
})

describe('toSectionScores', () => {
  it('merges deck-keyed rows into the six sections', () => {
    const sectioned = toSectionScores({
      hiragana: { 1: 4 },
      kanji_numbers_time: { 10: 2 },
      kanji_n4_society_roles: { 1200: 1 },
      vocab_greetings: { 1000: 3 },
    })

    expect(sectioned.hiragana).toEqual({ 1: 4 })
    expect(sectioned.kanji_n5).toEqual({ 10: 2, 1200: 1 })
    expect(sectioned.vocab_n5).toEqual({ 1000: 3 })
    expect(sectioned.grammar_patterns).toEqual({})
  })

  it('ignores decks that map to no section', () => {
    expect(toSectionScores({ mystery_deck: { 1: 4 } })).toEqual(emptyCardScores())
  })

  it('tolerates a missing or empty payload', () => {
    expect(toSectionScores({})).toEqual(emptyCardScores())
    expect(toSectionScores(undefined as unknown as Record<string, Record<number, number>>))
      .toEqual(emptyCardScores())
  })

  it('does not share mutable state between results', () => {
    const first = toSectionScores({ hiragana: { 1: 1 } })
    const second = toSectionScores({})
    first.hiragana[2] = 4
    expect(second.hiragana).toEqual({})
  })
})

describe('hasAnyCardScore', () => {
  it('is false for a fresh map and true once anything is scored', () => {
    expect(hasAnyCardScore(emptyCardScores())).toBe(false)
    expect(hasAnyCardScore(toSectionScores({ vocab_greetings: { 1000: 1 } }))).toBe(true)
  })
})
