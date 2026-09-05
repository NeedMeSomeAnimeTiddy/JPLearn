import { describe, expect, it } from 'vitest'
import { LIST_ROWS, listWindow, masteryGroups, masteryNote } from './mastery'
import type { MasteryInput, RawBlock, RawKanji } from './mastery'
import type { CardScores } from '../../types'

/* ==================================================================================================
   THE COUNTS BEHIND "EVERY CHARACTER". The shapes here are the ones the bridge really sends:
   `card_ids` with parallel `characters`/`romajis`/`meanings` arrays for kana and the word decks, and
   flat kanji cards carrying a JLPT tag and the name of the block they are taught in.
   ================================================================================================== */

const raw = (index: number, name: string, ids: number[]): RawBlock => ({
  index,
  name,
  card_ids: ids,
  characters: ids.map((i) => `字${i}`),
  romajis: ids.map((i) => `yomi${i}`),
  meanings: ids.map((i) => `meaning ${i}`),
})

const kanji = (id: number, level: string, theme: string): RawKanji => ({
  id, character: `漢${id}`, romaji: `on${id}`, meaning: `sense ${id}`, tags: [level], theme,
})

function scores(over: Partial<Record<keyof CardScores, Record<number, number>>> = {}): CardScores {
  return {
    hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {},
    ...over,
  } as CardScores
}

function input(over: Partial<MasteryInput> = {}): MasteryInput {
  return {
    blocks: { hiragana: [raw(0, 'Vowels', [1, 2])], katakana: [] },
    categoryBlocks: {},
    kanji: [],
    scores: scores(),
    ...over,
  }
}

describe('masteryGroups', () => {
  it('scores a block out of four a card, not out of one', () => {
    const groups = masteryGroups(input({ scores: scores({ hiragana: { 1: 4, 2: 2 } }) }))
    const vowels = groups[0].blocks[0]
    /* six of a possible eight */
    expect(vowels.pct).toBe(75)
    expect(vowels.known).toBe(1)
    expect(vowels.chars.map((c) => [c.char, c.reading, c.score]))
      .toEqual([['字1', 'yomi1', 4], ['字2', 'yomi2', 2]])
  })

  it('leaves out a set the account has nothing in, rather than drawing an empty rail row', () => {
    const groups = masteryGroups(input())
    expect(groups.map((g) => g.key)).toEqual(['hiragana'])
  })

  it('splits kanji by level and then by the block they are taught in', () => {
    const groups = masteryGroups(input({
      blocks: {},
      kanji: [
        kanji(1, 'n5', 'Numbers & Time'),
        kanji(2, 'n5', 'Numbers & Time'),
        kanji(3, 'n5', 'People & Body'),
        kanji(4, 'n4', 'Numbers & Time'),
      ],
    }))
    expect(groups.map((g) => g.en)).toEqual(['KANJI N5', 'KANJI N4'])
    expect(groups[0].blocks.map((b) => [b.name, b.chars.length]))
      .toEqual([['Numbers & Time', 2], ['People & Body', 1]])
    expect(groups[0].cards).toBe(3)
  })

  it('reads every kanji level out of the one score map they share', () => {
    /* `cardScores` is keyed by SCRIPT and the five levels are decks under `kanji_n5`; a per-level
       key finds nothing and draws two thousand characters as untouched. */
    const groups = masteryGroups(input({
      blocks: {},
      kanji: [kanji(1, 'n5', 'A'), kanji(90, 'n1', 'B')],
      scores: scores({ kanji_n5: { 1: 4, 90: 4 } }),
    }))
    expect(groups.map((g) => g.pct)).toEqual([100, 100])
  })

  it('caps a score that has run past full marks', () => {
    const groups = masteryGroups(input({ scores: scores({ hiragana: { 1: 9, 2: 9 } }) }))
    expect(groups[0].pct).toBe(100)
  })
})

describe('listWindow', () => {
  const rows = Array.from({ length: 40 }, (_, i) => i)

  it('shows everything when everything fits, and folds nothing', () => {
    const view = listWindow([1, 2, 3], 1)
    expect(view.rows).toEqual([1, 2, 3])
    expect([view.above, view.below]).toEqual([0, 0])
  })

  it('moves a window over a long list and says what is left at each end', () => {
    const view = listWindow(rows, 20)
    expect(view.rows.length).toBe(LIST_ROWS)
    expect(view.above + view.rows.length + view.below).toBe(rows.length)
    expect(view.rows[view.cursorInWindow]).toBe(20)
  })

  it('clamps at both ends so the first and last rows are reachable', () => {
    const first = listWindow(rows, 0)
    expect(first.above).toBe(0)
    expect(first.rows[first.cursorInWindow]).toBe(0)
    const last = listWindow(rows, rows.length - 1)
    expect(last.below).toBe(0)
    expect(last.rows[last.cursorInWindow]).toBe(rows.length - 1)
  })
})

describe('masteryNote', () => {
  it('counts the cards and the ones at full score', () => {
    const groups = masteryGroups(input({ scores: scores({ hiragana: { 1: 4, 2: 1 } }) }))
    expect(masteryNote(groups)).toBe('2 CARDS · 1 AT FULL SCORE')
  })

  it('says nothing is counted rather than counting nothing', () => {
    expect(masteryNote([])).toBe('NOTHING COUNTED YET')
  })
})
