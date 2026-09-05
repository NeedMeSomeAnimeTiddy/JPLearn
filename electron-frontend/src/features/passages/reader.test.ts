import { describe, expect, it } from 'vitest'
import {
  PAGE_CHARS, bareLength, bareText, minutesLeft, paginate, pieces, proseSize, sentences, stops,
} from './reader'

/* ==================================================================================================
   THE READER'S MODEL, which is everything about a text that is arithmetic rather than markup.

   These are the shapes the real thirty actually have, not invented ones: furigana written as
   漢字（かんじ）, no newlines in `text_jp` at all, sentences ended with 。 and sometimes closed with
   a bracket after it, and one text with no readings anywhere.
   ================================================================================================== */

describe('pieces', () => {
  it('splits a line into the words the text annotated and the plain runs between them', () => {
    const out = pieces('あのお星（ほし）さま、とっておくれ。')
    expect(out).toEqual([
      { kind: 'plain', text: 'あのお' },
      { kind: 'word', text: '星', reading: 'ほし', at: 0 },
      { kind: 'plain', text: 'さま、とっておくれ。' },
    ])
  })

  it('numbers the words in the order the cursor walks them', () => {
    const out = stops('澄（きよし）ちゃん、あんまり高く（たかく）て、とれません。')
    expect(out.map((w) => [w.at, w.text, w.reading])).toEqual([
      [0, '澄', 'きよし'],
      [1, '高く', 'たかく'],
    ])
  })

  it('gives a text with no readings no stops at all, rather than guessing at words', () => {
    /* `aozora_046940` is set in katakana with no furigana anywhere. Splitting Japanese into words
       is a thing the renderer cannot do, so the honest answer is none. */
    expect(stops('ヤマキチ ハ ヤマオク ノ キコリ ノ コ デアリマシタ。')).toEqual([])
  })

  it('reads a text at its length without the readings, which are furniture', () => {
    expect(bareText('お星（ほし）さま')).toBe('お星さま')
    expect(bareLength('お星（ほし）さま')).toBe(4)
  })
})

describe('sentences', () => {
  it('keeps the punctuation, and the bracket that closes after it', () => {
    expect(sentences('「七時に戻ります。」名前はありません。')).toEqual([
      '「七時に戻ります。」', '名前はありません。',
    ])
  })

  it('keeps a tail that never ends in a full stop', () => {
    expect(sentences('ひとつ。ふたつ')).toEqual(['ひとつ。', 'ふたつ'])
  })
})

describe('paginate', () => {
  const long = (n: number) => `${'あ'.repeat(n - 1)}。`

  it('never lets a page run past the budget while it has a choice', () => {
    const text = [long(50), long(50), long(50), long(50)].join('')
    const pages = paginate(text)
    expect(pages.length).toBeGreaterThan(1)
    for (const p of pages.slice(0, -1)) expect(bareLength(p)).toBeLessThanOrEqual(PAGE_CHARS)
  })

  it('gives a sentence longer than the whole budget a page of its own rather than cutting it', () => {
    const huge = long(PAGE_CHARS + 60)
    const pages = paginate(`${long(30)}${huge}${long(30)}`)
    expect(pages).toContain(huge)
    expect(pages.join('')).toBe(`${long(30)}${huge}${long(30)}`)
  })

  it('loses no text, whatever the shape of it', () => {
    const text = '澄（きよし）ちゃん、なにあげよう。 あのお星（ほし）さま、とっておくれ。 あんまり高く（たかく）て、とれません。'
    expect(paginate(text).join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  })

  it('always gives at least one page, so the reader has something to draw', () => {
    expect(paginate('')).toEqual([''])
  })
})

describe('proseSize', () => {
  it('sets a short page big and a long one small, and never past either end', () => {
    expect(proseSize(20)).toBe(25)
    expect(proseSize(PAGE_CHARS)).toBeLessThan(25)
    expect(proseSize(PAGE_CHARS)).toBeGreaterThan(15)
    expect(proseSize(4000)).toBe(15)
  })

  it('never grows as a page gets longer', () => {
    let last = Infinity
    for (let n = 1; n < 400; n += 7) {
      const size = proseSize(n)
      expect(size).toBeLessThanOrEqual(last)
      last = size
    }
  })
})

describe('minutesLeft', () => {
  const pages = ['あ'.repeat(100), 'あ'.repeat(100), 'あ'.repeat(100), 'あ'.repeat(100)]

  it('counts down as the pages go by, and never reaches nought', () => {
    const all = minutesLeft(400, pages, 0)
    expect(all).toBe(10)
    expect(minutesLeft(400, pages, 2)).toBe(5)
    /* THE LAST PAGE IS NOT NO TIME. A reader standing on it still has it to read, and `0 MIN LEFT`
       over a page of text is the screen contradicting itself. */
    expect(minutesLeft(400, pages, 3)).toBeGreaterThanOrEqual(1)
  })

  it('survives a text with nothing in it', () => {
    expect(minutesLeft(0, [''], 0)).toBe(1)
  })
})
