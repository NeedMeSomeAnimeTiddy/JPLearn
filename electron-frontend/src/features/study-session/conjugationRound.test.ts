import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONJUGATION_POOL_FLOOR,
  buildConjugationDrillRound,
  buildConjugationPool,
  isConjugationDrillCandidate,
} from './conjugationRound'
import type { ScriptDeck } from '../../types'

type Card = ScriptDeck['cards'][number]

const CARD = {
  id: 1104,
  character: '食べる',
  romaji: 'taberu',
  meaning: 'to eat',
  tags: ['vocab', 'n5'],
} as unknown as Card

const PAYLOAD = {
  game_type: 'conjugation_drill',
  word: '食べる',
  reading: 'たべる',
  word_class: 'ichidan',
  form: 'te',
  form_label: 'te-form',
  prompt: 'Put this verb into its te-form.',
  expected: '食べて',
  expected_reading: 'たべて',
  accepted: ['食べて', 'たべて'],
  rule_hint: 'Ichidan verb: drop る, then attach the ending.',
  stage: 1,
}

const OPTIONS = {
  curriculumStage: 1 as const,
  surprisePrompt: false,
  surpriseLabel: 'Surprise!',
  promptSeed: 3,
  dictionarySeedQuery: '食べる',
  dictionaryNote: null,
}

function mockBridge(impl: () => unknown) {
  vi.stubGlobal('window', {
    ...globalThis.window,
    jplearnDesktop: { getConjugationDrillData: vi.fn(impl) },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildConjugationDrillRound', () => {
  it('carries every accepted spelling into the round', async () => {
    mockBridge(async () => ({ ok: true, game_type: 'conjugation_drill', seed: 3, data: PAYLOAD }))

    const round = await buildConjugationDrillRound(CARD, OPTIONS)

    expect(round).not.toBeNull()
    expect(round?.mode).toBe('conjugation_drill')
    expect(round?.answer).toBe('食べて')
    expect(round?.acceptedAnswers).toEqual(['食べて', 'たべて'])
    expect(round?.focusText).toBe('食べる')
    expect(round?.promptLabel).toContain('te-form')
    expect(round?.options).toEqual([])
  })

  it('shows the reading alongside a kanji answer', async () => {
    mockBridge(async () => ({ ok: true, game_type: 'conjugation_drill', seed: 3, data: PAYLOAD }))

    const round = await buildConjugationDrillRound(CARD, OPTIONS)

    expect(round?.answerDisplay).toBe('食べて（たべて）')
  })

  it('does not repeat the reading when the word is written in kana', async () => {
    mockBridge(async () => ({
      ok: true,
      game_type: 'conjugation_drill',
      seed: 3,
      data: { ...PAYLOAD, word: 'みる', expected: 'みて', expected_reading: 'みて', accepted: ['みて'] },
    }))

    const round = await buildConjugationDrillRound(CARD, OPTIONS)

    expect(round?.answerDisplay).toBe('みて')
  })

  it('passes the curriculum stage through so form gating applies', async () => {
    const spy = vi.fn(async () => ({
      ok: true, game_type: 'conjugation_drill', seed: 3, data: PAYLOAD,
    }))
    vi.stubGlobal('window', {
      ...globalThis.window,
      jplearnDesktop: { getConjugationDrillData: spy },
    })

    await buildConjugationDrillRound(CARD, { ...OPTIONS, curriculumStage: 3 })

    expect(spy).toHaveBeenCalledWith({ word: '食べる', stage: 3, seed: 3 })
  })

  it('returns null when the bridge rejects the word, so the card falls back', async () => {
    mockBridge(async () => {
      throw new Error("'本' is not a conjugatable dictionary form")
    })

    expect(await buildConjugationDrillRound(CARD, OPTIONS)).toBeNull()
  })

  it('returns null when the bridge is unavailable', async () => {
    vi.stubGlobal('window', { ...globalThis.window, jplearnDesktop: {} })

    expect(await buildConjugationDrillRound(CARD, OPTIONS)).toBeNull()
  })

  it('returns null on a malformed payload rather than asking an empty question', async () => {
    mockBridge(async () => ({
      ok: true,
      game_type: 'conjugation_drill',
      seed: 3,
      data: { ...PAYLOAD, expected: '', accepted: [] },
    }))

    expect(await buildConjugationDrillRound(CARD, OPTIONS)).toBeNull()
  })

  it('returns null for a card with no character to conjugate', async () => {
    mockBridge(async () => ({ ok: true, game_type: 'conjugation_drill', seed: 3, data: PAYLOAD }))

    const blank = { ...CARD, character: '   ' } as Card
    expect(await buildConjugationDrillRound(blank, OPTIONS)).toBeNull()
  })
})

describe('isConjugationDrillCandidate', () => {
  it('accepts verbs and adjectives that the classifier confirmed', () => {
    expect(isConjugationDrillCandidate('会う')).toBe(true)
    expect(isConjugationDrillCandidate('食べる')).toBe(true)
    expect(isConjugationDrillCandidate('高い')).toBe(true)
  })

  it('rejects nouns', () => {
    expect(isConjugationDrillCandidate('青')).toBe(false)
    expect(isConjugationDrillCandidate('電車')).toBe(false)
    expect(isConjugationDrillCandidate('')).toBe(false)
  })

  it('rejects the い-final non-adjectives a spelling heuristic accepted', () => {
    // These two were the entire Greetings-block pool, and neither is drillable.
    expect(isConjugationDrillCandidate('おやすみなさい')).toBe(false)
    expect(isConjugationDrillCandidate('ごめんなさい')).toBe(false)
  })
})

describe('buildConjugationPool', () => {
  const card = (character: string) => ({ id: character.length, character, meaning: '', romaji: '' } as unknown as Card)
  const deck = [card('会う'), card('食べる'), card('読む'), card('高い'), card('飲む'),
    card('書く'), card('話す'), card('待つ'), card('泳ぐ'), card('遊ぶ')]

  it('keeps only eligible cards from the block', () => {
    const block = [card('会う'), card('青'), card('電車')]
    const pool = buildConjugationPool(block, [], 1)
    expect(pool.map((c) => c.character)).toEqual(['会う'])
  })

  it('tops up a thin block from the parent deck', () => {
    const block = [card('おやすみなさい'), card('ごめんなさい')]
    const pool = buildConjugationPool(block, deck)
    expect(pool.length).toBe(CONJUGATION_POOL_FLOOR)
  })

  it('keeps the block cards ahead of the top-up', () => {
    const block = [card('走る'), card('青')]
    const pool = buildConjugationPool(block, deck)
    expect(pool[0].character).toBe('走る')
    expect(pool.length).toBe(CONJUGATION_POOL_FLOOR)
  })

  it('does not duplicate a card present in both block and deck', () => {
    const block = [card('会う')]
    const pool = buildConjugationPool(block, deck)
    const characters = pool.map((c) => c.character)
    expect(new Set(characters).size).toBe(characters.length)
  })

  it('leaves a healthy block untouched', () => {
    const pool = buildConjugationPool(deck, [])
    expect(pool.length).toBe(deck.length)
  })

  it('returns empty when nothing anywhere is eligible, so the mode can lock', () => {
    expect(buildConjugationPool([card('青')], [card('電車')])).toEqual([])
  })
})
