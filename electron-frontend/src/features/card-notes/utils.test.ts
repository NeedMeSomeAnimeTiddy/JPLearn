import { describe, expect, it } from 'vitest'
import {
  countNoteCharacters,
  dedupeDictionaryCards,
  dictionaryItemRenderKey,
  isValidCardNoteKey,
} from './utils'

const BUILTIN_KEY = `note:v1:builtin:${'a'.repeat(64)}`

describe('card note utilities', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(countNoteCharacters('日😀e\u0301')).toBe(4)
  })

  it('accepts only canonical opaque v1 note keys', () => {
    expect(isValidCardNoteKey(BUILTIN_KEY)).toBe(true)
    expect(isValidCardNoteKey('note:v1:offline_dictionary:jmdict:ent-123-a')).toBe(true)
    expect(
      isValidCardNoteKey(`note:v1:offline_dictionary:fallback:${'0'.repeat(64)}`),
    ).toBe(true)
    expect(isValidCardNoteKey('note:v1:offline_dictionary:jmdict:ENT_123')).toBe(false)
    expect(isValidCardNoteKey('note:v1:builtin:12')).toBe(false)
  })

  it('prefers a valid note identity and never uses a numeric local id', () => {
    const withIdentity = {
      id: 42,
      note_key: BUILTIN_KEY,
      character: '日本',
      romaji: 'nihon',
      meaning: 'Japan',
    }
    const withoutIdentity = { ...withIdentity, note_key: undefined }

    expect(dictionaryItemRenderKey(withIdentity)).toBe(BUILTIN_KEY)
    expect(dictionaryItemRenderKey(withoutIdentity)).not.toContain('42')
  })

  it('uses a normalized display-only fallback for invalid or absent keys', () => {
    const first = dictionaryItemRenderKey({
      note_key: 'invalid',
      character: ' 日本 ',
      romaji: 'ni  hon',
      meaning: 'Japan',
    })
    const second = dictionaryItemRenderKey({
      character: '日本',
      romaji: 'ni hon',
      meaning: 'Japan',
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^display:/u)
  })

  it('deduplicates by note identity while preserving the first card', () => {
    const cards = [
      { id: 1, note_key: BUILTIN_KEY, character: '日', romaji: 'nichi', meaning: 'day' },
      { id: 9, note_key: BUILTIN_KEY, character: '日', romaji: 'hi', meaning: 'sun' },
      { id: 1, character: '月', romaji: 'getsu', meaning: 'month' },
    ]

    expect(dedupeDictionaryCards(cards)).toEqual([cards[0], cards[2]])
  })
})
