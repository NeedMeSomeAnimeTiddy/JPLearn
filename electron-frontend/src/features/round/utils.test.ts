import { describe, expect, it } from 'vitest'
import { TICK_CAP } from './constants'
import { ASK_W, EMPTY_TRAIL, promptSize, roundKind, stepTrail, tickRow } from './utils'

describe('roundKind', () => {
  it('sends the typed modes to an input and the boarded ones to their own panel', () => {
    expect(roundKind('romaji_sprint')).toBe('typed')
    expect(roundKind('conjugation_drill')).toBe('typed')
    expect(roundKind('handwriting')).toBe('panel')
    expect(roundKind('sentence_assembly')).toBe('panel')
  })

  it('gives everything else the slips, which is the fall-through the view already had', () => {
    expect(roundKind('meaning_match')).toBe('choice')
    expect(roundKind('vibe_check')).toBe('choice')
    expect(roundKind('kanji_compound_builder')).toBe('choice')
  })
})

describe('promptSize', () => {
  it('fills the cell with a lone character and shrinks as more arrive', () => {
    expect(promptSize('一')).toBe(132)
    expect(promptSize('しゃ')).toBe(132)
    expect(promptSize('食べる')).toBe(Math.floor(ASK_W / 3))
    expect(promptSize('一二三四')).toBe(Math.floor(ASK_W / 4))
  })

  /* THE JOIN. A seventh character must not make the type bigger than a sixth did. */
  it('never grows when a character is added', () => {
    let last = Infinity
    for (let n = 1; n <= 90; n++) {
      const size = promptSize('あ'.repeat(n))
      expect(size).toBeLessThanOrEqual(last)
      last = size
    }
  })

  it('wraps a sentence rather than shrinking it to nothing', () => {
    const stem = 'きのう、としょかんでほんをかりました。'
    expect(promptSize(stem)).toBeGreaterThanOrEqual(20)
    expect(promptSize(stem)).toBeLessThanOrEqual(45)
    expect(promptSize('あ'.repeat(400))).toBe(20)
  })

  it('counts glyphs rather than code units, so a surrogate pair is one character', () => {
    expect(promptSize('𠮟')).toBe(132)
  })

  it('does not divide by an empty prompt', () => {
    expect(promptSize('')).toBe(132)
  })
})

describe('tickRow', () => {
  it('draws the run so far, then where you are, then what is left', () => {
    const { ticks, folded } = tickRow([true, true, false], 6, 3)
    expect(ticks).toEqual(['on', 'on', 'bad', 'here', 'todo', 'todo'])
    expect(folded).toBe(false)
  })

  it('folds rather than drawing a hundred two-pixel marks', () => {
    const long = tickRow([], TICK_CAP + 1, 0)
    expect(long.ticks).toEqual([])
    expect(long.folded).toBe(true)
    expect(tickRow([], TICK_CAP, 0).ticks).toHaveLength(TICK_CAP)
  })

  it('draws nothing at all when there is no target', () => {
    expect(tickRow([], 0, 0)).toEqual({ ticks: [], folded: false })
  })

  it('does not run past the target when the trail is longer than it', () => {
    expect(tickRow([true, true, true], 2, 3).ticks).toEqual(['on', 'on'])
  })
})

describe('stepTrail', () => {
  it('records a right answer and a wrong one in the order they happened', () => {
    let s = EMPTY_TRAIL
    s = stepTrail(s, 1, 1)
    s = stepTrail(s, 2, 1)
    s = stepTrail(s, 3, 2)
    expect(s.trail).toEqual([true, false, true])
  })

  it('is a no-op when nothing moved, so a re-render cannot add a mark', () => {
    const s = stepTrail(EMPTY_TRAIL, 2, 1)
    expect(stepTrail(s, 2, 1)).toBe(s)
  })

  it('starts again when the counters reset, rather than carrying the last run in', () => {
    let s = stepTrail(EMPTY_TRAIL, 3, 2)
    s = stepTrail(s, 0, 0)
    expect(s.trail).toEqual([])
    s = stepTrail(s, 1, 0)
    expect(s.trail).toEqual([false])
  })

  /* the conservative order: a strip that claims a right answer nobody gave is a lie */
  it('puts the misses first when several rounds arrive in one step', () => {
    expect(stepTrail(EMPTY_TRAIL, 3, 1).trail).toEqual([false, false, true])
  })
})
