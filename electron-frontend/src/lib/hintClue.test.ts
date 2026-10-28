import { describe, expect, it } from 'vitest'
import { buildHintClue, hintClueIsEmpty, usesHintLadder } from './hintClue'
import type { RoundDictionaryNote, RoundState } from '../types'

const dogNote: RoundDictionaryNote = {
  title: 'Dictionary note', copy: '', character: '犬', reading: 'いぬ',
  primaryGloss: 'dog', secondaryGlosses: ['hound'], source: 'offline_dictionary',
}

function round(overrides: Partial<RoundState>): RoundState {
  return {
    cardId: 1, mode: 'meaning_match', audioText: '', exampleSentenceAudioText: null,
    surprisePrompt: false, curriculumStage: 1, chapterNumber: null, chapterLabel: null,
    hintText: 'Example: 犬がいます。', dictionarySeedQuery: null, dictionaryNote: dogNote,
    promptLabel: '', focusText: '犬', answer: 'dog', options: [],
    ...overrides,
  }
}

describe('buildHintClue', () => {
  it('Typed Recall and Speech Recall: no glosses, the rest stays', () => {
    for (const mode of ['typed_recall', 'speech_recall'] as const) {
      const clue = buildHintClue(round({ mode, hintText: 'Think about what 犬 means.' }))
      expect(clue).toEqual({ text: 'Think about what 犬 means.', character: '犬', reading: 'いぬ', glosses: [] })
    }
  })

  it('Typed Recall: drops a hint line that states an accepted meaning', () => {
    const clue = buildHintClue(round({ mode: 'typed_recall', hintText: 'It is a hound.' }))
    expect(clue.text).toBeNull()
  })

  it('finds an English answer by whole words only', () => {
    // "at" is not found inside "what"
    const clue = buildHintClue(round({ mode: 'typed_recall', answer: 'at', hintText: 'Think about what 犬 means.', dictionaryNote: null }))
    expect(clue.text).toBe('Think about what 犬 means.')
  })

  it('Dictation (vocabulary): no reading, no kana written form, no line holding the kana', () => {
    const coffee: RoundDictionaryNote = { ...dogNote, character: 'コーヒー', reading: 'こーひー', primaryGloss: 'coffee', secondaryGlosses: [] }
    const clue = buildHintClue(round({ mode: 'dictation', answer: 'こおひい', hintText: 'Type the reading you hear in Japanese.', dictionaryNote: coffee }))
    expect(clue).toEqual({ text: 'Type the reading you hear in Japanese.', character: null, reading: null, glosses: ['coffee'] })
  })

  it('Dictation: keeps a written form wholly in kanji, drops one with kana in it', () => {
    expect(buildHintClue(round({ mode: 'dictation', answer: 'いぬ' })).character).toBe('犬')
    const eat = { ...dogNote, character: '食べる', reading: 'たべる' }
    expect(buildHintClue(round({ mode: 'dictation', answer: 'たべる', dictionaryNote: eat })).character).toBeNull()
  })

  it('Dictation (kana deck): drops the line that prints the kana it plays', () => {
    const clue = buildHintClue(round({
      mode: 'dictation', answer: 'かき', hintText: 'Type the romaji for what you hear (e.g., "kaki" → かき).', dictionaryNote: null,
    }))
    expect(clue.text).toBeNull()
    expect(hintClueIsEmpty(clue)).toBe(true)
  })

  it('Romaji Sprint: no reading chip; the written form, glosses and example stay', () => {
    const clue = buildHintClue(round({ mode: 'romaji_sprint', answer: 'inu' }))
    expect(clue).toEqual({ text: 'Example: 犬がいます。', character: '犬', reading: null, glosses: ['dog', 'hound'] })
  })

  it('Meaning Match, Listening: no glosses', () => {
    for (const mode of ['meaning_match', 'listening_audio_first'] as const) {
      expect(buildHintClue(round({ mode })).glosses).toEqual([])
    }
  })

  it('Character Match and Context Cloze: no written form, no reading, no line holding the character', () => {
    for (const mode of ['character_match', 'context_cloze'] as const) {
      const clue = buildHintClue(round({ mode, answer: '犬' }))
      expect(clue).toEqual({ text: null, character: null, reading: null, glosses: ['dog', 'hound'] })
    }
  })

  it('Context Cloze: keeps the line that gives only the meaning', () => {
    const clue = buildHintClue(round({ mode: 'context_cloze', answer: '犬', hintText: 'The missing word means: dog' }))
    expect(clue.text).toBe('The missing word means: dog')
  })

  it('Particle Cloze (grammar): drops the particle and its romaji, keeps what it does', () => {
    const particle: RoundDictionaryNote = {
      ...dogNote, character: 'は', reading: 'wa', primaryGloss: 'marks the topic', secondaryGlosses: [],
    }
    const clue = buildHintClue(round({
      mode: 'particle_cloze', answer: 'は', hintText: 'Example: わたしは学生です。', dictionaryNote: particle,
    }))
    expect(clue).toEqual({ text: null, character: null, reading: null, glosses: ['marks the topic'] })
  })

  it('Particle Cloze and Imposter (vocabulary): the meaning is the answer, so no glosses', () => {
    for (const mode of ['particle_cloze', 'imposter'] as const) {
      expect(buildHintClue(round({ mode })).glosses).toEqual([])
    }
  })

  it('Sentence Assembly: drops the example that is the assembled sentence', () => {
    const clue = buildHintClue(round({
      mode: 'sentence_assembly', answer: 'a|b', answerDisplay: '犬がいます。', dictionaryNote: null,
    }))
    expect(clue.text).toBeNull()
  })

  it('Conjugation Drill: drops anything holding an accepted form', () => {
    const clue = buildHintClue(round({
      mode: 'conjugation_drill', answer: '食べて', acceptedAnswers: ['食べて', 'たべて'],
      hintText: 'Ichidan: drop る, add て (たべて).', dictionaryNote: null,
    }))
    expect(clue.text).toBeNull()
  })

  it('Vibe Check: nothing to hide', () => {
    const clue = buildHintClue(round({ mode: 'vibe_check', answer: 'Polite' }))
    expect(clue).toEqual({ text: 'Example: 犬がいます。', character: '犬', reading: 'いぬ', glosses: ['dog', 'hound'] })
  })
})

describe('usesHintLadder', () => {
  it('is the five modes whose step 2 prints the answer', () => {
    expect(usesHintLadder('typed_recall')).toBe(true)
    expect(usesHintLadder('dictation')).toBe(true)
    expect(usesHintLadder('meaning_match')).toBe(false)
  })
})
