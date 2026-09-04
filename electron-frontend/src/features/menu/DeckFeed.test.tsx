import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import axe from 'axe-core'
import type { BlockInfo, JlptLevelProgress } from '../../types'
import type { VocabFeed, VocabFeedWord } from '../vocab-feed'
import { VOCAB_BUDGET_STEPS } from '../vocab-feed'
import { Deck } from './components/Deck'
import { Feed } from './components/Feed'
import {
  BLOCK_WINDOW, DEFAULT_GATE, blockNameSize, blockWindow, deckChain, gateLine, nameIsWide, railLine,
} from './deck'
import { feedAt, feedHead, feedNote, kanjiOf, wordKanji, wordSize } from './feed'
import { levelForKey, levelStep } from './levels'

/* THE LADDER THE TWO STUDY SCREENS DRAW, as `buildJlptLevelProgressFromLevelDecks` shapes it. */
const LEVELS: JlptLevelProgress[] = (['n5', 'n4', 'n3', 'n2', 'n1'] as const).map((key, i) => ({
  key, label: key.toUpperCase(), cardIds: [], sampleChars: [],
  mastery: [0.81, 0.4, 0.12, 0, 0][i], unlocked: i < 3, total: 100 * (i + 1),
}))

/* a block chain, with `unlocked` a prefix exactly as `compute_unlocked_count` produces it */
const chainOf = (count: number, unlockedCount: number, mastery = 0.5): BlockInfo[] =>
  Array.from({ length: count }, (_, index) => ({
    index,
    name: `Block ${index + 1}`,
    card_ids: Array.from({ length: 8 }, (_, k) => index * 8 + k),
    sample_chars: ['あ', 'い', 'う'],
    characters: [],
    meanings: [],
    romajis: [],
    mastery: index < unlockedCount ? mastery : 0,
    unlocked: index < unlockedCount,
  } as unknown as BlockInfo))

const word = (over: Partial<VocabFeedWord> = {}): VocabFeedWord => ({
  card_id: 1, word: '一日', reading: 'ichinichi', meaning: 'one day',
  theme: 'Time & Days', unknown_kanji: 0, ...over,
})

const feedOf = (over: Partial<VocabFeed> = {}): VocabFeed => ({
  words: [word()], budget: 10, total: 744, readable: 120, knownKanji: 24, started: 40,
  loading: false, error: null, setBudget: vi.fn(), ...over,
})

afterEach(cleanup)

describe('the chain', () => {
  it('reads the frontier as the last unlocked block, not a count of mastered ones', () => {
    /* MEASURED, NOT ASSUMED: `unlocked` is a prefix, so the last true entry is where the learner
       stands. Counting mastered blocks instead would move the cursor a block early the moment a
       cleared block's mastery decayed below the gate it had already paid. */
    const chain = deckChain(chainOf(6, 3, 0.2))
    expect(chain.here).toBe(2)
    expect(chain.cleared).toBe(2)
    expect(chain.blocks.map((b) => b.state)).toEqual(
      ['done', 'done', 'here', 'ahead', 'ahead', 'ahead'],
    )
  })

  it('counts the tail beyond the block the AHEAD card names, not every shut block', () => {
    /* the card NAMES the next block, so its figure is what comes after that one -- six blocks
       standing on the third leaves block 4 named and blocks 5 and 6 behind it */
    expect(deckChain(chainOf(6, 3)).beyond).toBe(2)
    /* standing on the last one has nothing named and nothing after it; never negative */
    expect(deckChain(chainOf(6, 6)).beyond).toBe(0)
    expect(deckChain(chainOf(1, 1)).beyond).toBe(0)
  })

  it('opens on the first block when nothing has been cleared', () => {
    const chain = deckChain(chainOf(6, 1))
    expect(chain.here).toBe(0)
    expect(chain.cleared).toBe(0)
    expect(chain.clearedPct).toBe(0)
  })

  it('counts the deck rather than stating it', () => {
    const chain = deckChain(chainOf(6, 3))
    expect(chain.cards).toBe(48)
    expect(railLine(chain)).toBe('6 BLOCKS · 48 CARDS · 33% CLEARED')
  })

  it('draws no chain at all for a deck that has none', () => {
    const chain = deckChain([])
    expect(chain.here).toBe(-1)
    expect(chain.clearedPct).toBe(0)
    expect(gateLine(chain, false)).toBe('THIS DECK HAS NO BLOCKS')
  })
})

describe('the gate', () => {
  it('says what the percentage opens rather than restating it', () => {
    /* the whole reason `unlock_threshold` is now reported: 62% is not a score, it is a key */
    expect(gateLine(deckChain(chainOf(6, 3), 0.7), false)).toBe('OPENS BLOCK 04 AT 70%')
    expect(gateLine(deckChain(chainOf(12, 5), 0.8), false)).toBe('OPENS BLOCK 06 AT 80%')
  })

  it('has nothing to open on the last block', () => {
    expect(gateLine(deckChain(chainOf(6, 6), 0.7), false))
      .toBe('THE LAST BLOCK · NOTHING IS LOCKED BEHIND IT')
  })

  it('says a revisit moves nothing, because it does not', () => {
    expect(gateLine(deckChain(chainOf(6, 3), 0.7), true))
      .toBe('ALREADY CLEARED · NOTHING AHEAD MOVES')
  })

  it('falls back rather than printing NaN when an older build omits the field', () => {
    expect(DEFAULT_GATE).toBe(0.7)
    expect(gateLine(deckChain(chainOf(6, 3)), false)).toContain('70%')
  })
})

describe('the window onto the blocks', () => {
  const blocks = (n: number) => deckChain(chainOf(n, Math.min(n, 5))).blocks

  it('shows ten of the seventy-six and counts the rest at either end', () => {
    const all = blocks(76)
    const win = blockWindow(all, 40)
    expect(win.blocks).toHaveLength(BLOCK_WINDOW)
    expect(win.behind + win.blocks.length + win.ahead).toBe(all.length)
    expect(win.blocks[win.at].index).toBe(40)
  })

  it('stands the cursor second, so one block of history shows', () => {
    expect(blockWindow(blocks(76), 40).at).toBe(1)
  })

  it('keeps the window on the deck at either end', () => {
    const all = blocks(76)
    expect(blockWindow(all, 0).behind).toBe(0)
    const last = blockWindow(all, all.length - 1)
    expect(last.ahead).toBe(0)
    expect(last.blocks).toHaveLength(BLOCK_WINDOW)
  })

  it('does not fold at all when the whole deck fits', () => {
    const win = blockWindow(blocks(6), 2)
    expect(win.behind).toBe(0)
    expect(win.ahead).toBe(0)
  })

  it('sizes a name against its own alphabet, because the two do not share a divisor', () => {
    /* the Latin italic black averages 0.62em per character and mincho is one full em, which is how
       a two-glyph Japanese name once came out at the size of "Sentence Examples" */
    expect(nameIsWide('漢字')).toBe(true)
    expect(nameIsWide('Basic Vowels')).toBe(false)
    /* fifteen of each, so neither hits the ceiling and the divisor is the only difference */
    expect(blockNameSize('一二三四五六七八九十百千万上下', true)).toBe(28)
    expect(blockNameSize('Abcdefghijklmno', false)).toBe(47)
  })
})

const deckProps = {
  title: { en: 'KANJI N5', jp: '漢字' },
  slug: 'kanji_n5',
  blocks: chainOf(6, 3, 0.62),
  gate: 0.7,
  loading: false,
  error: null,
  mode: 'Romaji Sprint',
  levels: LEVELS,
  level: 'n5' as const,
  onLevel: vi.fn(),
  onStart: vi.fn(),
  onUp: vi.fn(),
}

const feedProps = {
  title: { en: 'VOCABULARY N5', jp: '語彙' },
  feed: feedOf(),
  mode: 'Meaning Match',
  levels: LEVELS,
  level: 'n5' as const,
  onLevel: vi.fn(),
  onStart: vi.fn(),
  onUp: vi.fn(),
}

describe('the ladder two of the six decks stand on', () => {
  it('reads a printed digit as the level it is printed on', () => {
    expect(levelForKey(LEVELS, '1')).toBe('n5')
    expect(levelForKey(LEVELS, '3')).toBe('n3')
  })

  it('names nothing for a digit the row does not draw', () => {
    /* bounded by the row rather than by CATEGORY_LEVEL_ORDER: a build whose bridge answered with
       three levels must not be askable for a fourth */
    expect(levelForKey(LEVELS.slice(0, 3), '4')).toBeNull()
    expect(levelForKey(LEVELS, '0')).toBeNull()
    expect(levelForKey(LEVELS, 'Enter')).toBeNull()
  })

  it('clamps at both ends rather than wrapping', () => {
    /* wrapping would make one press on this row skip four decks */
    expect(levelStep(LEVELS, 'n5', -1)).toBe('n5')
    expect(levelStep(LEVELS, 'n1', 1)).toBe('n1')
    expect(levelStep(LEVELS, 'n4', 1)).toBe('n3')
  })

  it('draws no row at all for a deck that is one deck', () => {
    /* four of the six are not laddered, and a control with one choice on it reads as broken */
    const { container } = render(<Deck {...deckProps} levels={[]} />)
    expect(container.querySelector('.lvb')).toBeNull()
    expect(container.textContent).not.toContain('Level')
  })

  it('carries what you have done to each rung, not only its name', () => {
    const { container } = render(<Deck {...deckProps} />)
    const chips = container.querySelectorAll('.lvb-chip')
    expect(chips).toHaveLength(5)
    expect(chips[0].textContent).toBe('1N581%')
    expect(container.querySelector('.lvb-chip.on b')?.textContent).toBe('N5')
  })

  it('changes level on the digit the chip prints', () => {
    const onLevel = vi.fn()
    const { container } = render(<Deck {...deckProps} onLevel={onLevel} />)
    fireEvent.keyDown(container.querySelector('.mn-open') as Element, { key: '3' })
    expect(onLevel).toHaveBeenCalledWith('n3')
  })

  it('keeps the press to itself, because App binds the same digits on the window', () => {
    /* 1 through 5 are also App's route into a deck from anywhere the menu is not listening. A
       press that bubbled would change the level and then leave the screen it had just changed --
       the same collision `MenuL1`'s row numbers hit, and the same fix. */
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    try {
      const { container } = render(<Deck {...deckProps} />)
      const root = container.querySelector('.mn-open') as Element
      fireEvent.keyDown(root, { key: '3' })
      expect(seen).not.toHaveBeenCalled()
      /* and a digit the row does NOT draw is left alone rather than swallowed */
      fireEvent.keyDown(root, { key: '7' })
      expect(seen).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', seen)
    }
  })

  it('is drawn on the feed as well, since vocabulary is five decks behind one milestone', () => {
    const onLevel = vi.fn()
    const { container } = render(<Feed {...feedProps} onLevel={onLevel} />)
    expect(container.querySelectorAll('.lvb-chip')).toHaveLength(5)
    fireEvent.keyDown(container.querySelector('.mn-open') as Element, { key: '2' })
    expect(onLevel).toHaveBeenCalledWith('n4')
  })
})

describe('the deck screen', () => {
  const props = deckProps

  it('names the deck it drew, not only the milestone that led there', () => {
    /* the mockup's own recorded bug: kanji N1's blocks under a heading reading HIRAGANA */
    const { container } = render(<Deck {...props} slug="kanji_n3" />)
    expect(container.textContent).toContain('KANJI N3')
  })

  it('draws every block it can fit as a row, and only offers the ones it may', () => {
    /* AHEAD IS DELIBERATELY NOT PRESSABLE: naming the next block is context, offering it is a lie.
       It used to be a whole card saying so; it is a dimmed row now, and there are eight more of
       them in the same space. */
    const { container } = render(<Deck {...props} />)
    const rows = [...container.querySelectorAll('.dk-row')]
    expect(rows).toHaveLength(6)
    expect(rows[2].className).toContain('on')
    expect(rows[0].className).toContain('done')
    expect(rows[3].getAttribute('aria-disabled')).toBe('true')
    expect(rows[3].querySelector('.s')?.textContent).toBe('SHUT')
  })

  it('hands over the block that was chosen, not the one that was open', () => {
    /* the rows ARE the pile now -- a cleared block is reached by pressing it rather than by
       opening a paged overlay that existed because three cards had nowhere to put it */
    const onStart = vi.fn()
    const { container } = render(<Deck {...props} onStart={onStart} />)
    fireEvent.click(container.querySelectorAll('.dk-row')[0])
    expect(container.querySelector('.dk-cap')?.textContent).toContain('ALREADY CLEARED')
    fireEvent.click(container.querySelector('.dk-slab') as Element)
    expect(onStart).toHaveBeenCalledWith(0)
  })

  it('will not walk past the frontier, which is the whole of the gate', () => {
    const onStart = vi.fn()
    const { container } = render(<Deck {...props} onStart={onStart} />)
    const root = container.querySelector('.mn-open') as Element
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onStart).toHaveBeenCalledWith(2)
  })

  it('jumps to any block from the strip, which is the reach a long deck needs', () => {
    /* ten rows cannot walk seventy-six blocks, so the whole-deck strip in the foot band is the
       scrubber the pile sheet used to be */
    const { container } = render(<Deck {...props} blocks={chainOf(44, 12)} />)
    fireEvent.click(container.querySelectorAll('.dk-segrow i')[3])
    expect(container.querySelector('.dk-cap')?.textContent).toContain('BLOCK 04 OF 44')
    /* and a shut block is not a place the strip can send you */
    fireEvent.click(container.querySelectorAll('.dk-segrow i')[40])
    expect(container.querySelector('.dk-cap')?.textContent).toContain('BLOCK 04 OF 44')
  })

  it('sets the block name from its own length, because the stylesheet cannot', () => {
    /* `.dk-name` declares family, weight and line-height and deliberately no size -- so a port
       that forgot the inline one rendered a 46px headline at the body's 16, which is what this
       card looked like until it was measured in the running app. */
    const short = render(<Deck {...props} blocks={chainOf(2, 2)} />)
    expect((short.container.querySelector('.dk-name') as HTMLElement).style.fontSize).toBe('52px')
    cleanup()
    const long = render(
      <Deck {...props} blocks={chainOf(2, 2).map((b) => ({ ...b, name: 'Old Units and Measures' }))} />,
    )
    /* twenty-two characters is past the point where 52 fits, and it is set down rather than wrapped */
    expect((long.container.querySelector('.dk-name') as HTMLElement).style.fontSize).toBe('32px')
  })

  it('names the drill its one button is about to run', () => {
    /* the slab used to read THE ONLY WAY ON over a button that opened a picker. It starts a round
       now, and a button that performs an action has to say which action. */
    const { container } = render(<Deck {...props} mode="Stroke Order" />)
    expect(container.querySelector('.dk-slab em')?.textContent).toBe('STROKE ORDER')
    expect(container.querySelector('.dk-slab b')?.textContent).toContain('START THIS BLOCK')
  })

  it('offers a deck it could not cut rather than leaving you at a dead end', () => {
    /* while this screen was a stop on the way to a hub, "not cut into blocks" was a fact you read
       and carried on past. It is the last screen before the round now. */
    const onStart = vi.fn()
    const { container } = render(<Deck {...props} blocks={[]} onStart={onStart} />)
    const door = container.querySelector('.pj-go') as HTMLButtonElement
    expect(door.textContent).toContain('STUDY IT WHOLE')
    fireEvent.click(door)
    expect(onStart).toHaveBeenCalledWith(-1)
  })

  it('has nothing behind it on the first block, and says so by having no cleared rows', () => {
    const { container } = render(<Deck {...props} blocks={chainOf(6, 1)} />)
    expect(container.querySelectorAll('.dk-row.done')).toHaveLength(0)
    expect(container.querySelector('.dk-row')?.className).toContain('on')
  })

  it('puts one segment on the rail per block, whatever the deck is', () => {
    const six = render(<Deck {...props} />).container.querySelectorAll('.dk-segrow i')
    cleanup()
    const many = render(<Deck {...props} blocks={chainOf(44, 12)} />)
      .container.querySelectorAll('.dk-segrow i')
    expect(six).toHaveLength(6)
    expect(many).toHaveLength(44)
  })

  it('says a deck did not answer rather than drawing it empty', () => {
    const { container } = render(<Deck {...props} blocks={[]} error="bridge refused" />)
    expect(container.textContent).toContain('BRIDGE REFUSED')
    expect(container.querySelector('.dk-row')).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Deck {...props} />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

describe('the words a feed hands over', () => {
  it('takes the distinct kanji in written order and ignores the kana', () => {
    expect(kanjiOf('お父さん')).toEqual(['父'])
    expect(kanjiOf('ともだち')).toEqual([])
    expect(kanjiOf('日曜日')).toEqual(['日', '曜'])
  })

  it('says how many are new, never which — because the payload does not carry which', () => {
    /* `unknown_kanji` is a COUNT. The set it was computed against is not reported, so colouring
       a specific chip would be drawing a claim out of a figure that does not hold one. */
    expect(wordKanji(word({ word: '日曜日', unknown_kanji: 1 })).note).toBe('1 OF 2 IS NEW TO YOU')
    expect(wordKanji(word({ word: '一日', unknown_kanji: 0 })).note).toBe('ALL 2 KANJI ARE ONES YOU HAVE MET')
    expect(wordKanji(word({ word: '本', unknown_kanji: 0 })).note).toBe('ITS KANJI IS ONES YOU HAVE MET')
    expect(wordKanji(word({ word: 'ともだち' })).note).toBe('NO KANJI IN IT — READABLE ON DAY ONE')
  })

  it('never reports more unknown than the word has characters', () => {
    expect(wordKanji(word({ word: '本', unknown_kanji: 4 })).unknown).toBe(1)
  })

  it('sets the word from its own length, under a ceiling short words all reach', () => {
    /* MEASURED: 上 and お父さん are the SAME size, because 360/4 is still over the 72 cap -- the
       ceiling does the work up to five characters and the divisor only bites past that. Asserting
       the short one is bigger was asserting a behaviour the numbers do not produce. */
    expect(wordSize('上')).toBe(72)
    expect(wordSize('お父さん')).toBe(72)
    expect(wordSize('とてもながいことばです')).toBeLessThan(72)
    expect(wordSize('とてもとてもながすぎることばでございます')).toBe(34)
  })
})

describe('the feed', () => {
  it('gives four different reasons for a short queue', () => {
    expect(feedNote(feedOf({ budget: 0, words: [] }))).toContain('SET TO NONE')
    expect(feedNote(feedOf({ words: [], started: 744 })))
      .toBe('EVERY WORD IN THIS LEVEL HAS BEEN BEGUN')
    expect(feedNote(feedOf({ words: [], started: 40 }))).toBe('NOTHING NEW TO ADD RIGHT NOW')
    expect(feedNote(feedOf({ words: [word()], budget: 10 })))
      .toBe('ONLY 1 LEFT UNSTARTED · THE BUDGET IS 10')
  })

  it('says the budget plainly when the queue is full', () => {
    const words = Array.from({ length: 10 }, (_, i) => word({ card_id: i }))
    expect(feedNote(feedOf({ words, budget: 10 }))).toBe('10 A DAY · REVIEWS ARE NOT CAPPED')
  })

  it('turns the counts the bridge sends into the denominators the screen shows', () => {
    const head = feedHead(feedOf())
    expect(head.readablePct).toBe(16)
    expect(head.startedPct).toBe(5)
    expect(head.queued).toBe(1)
  })

  it('holds the reader inside the queue rather than off its end', () => {
    const words = [word({ card_id: 1 }), word({ card_id: 2 })]
    expect(feedAt(feedOf({ words }), 9)?.card_id).toBe(2)
    expect(feedAt(feedOf({ words }), -3)?.card_id).toBe(1)
    expect(feedAt(feedOf({ words: [] }), 0)).toBeNull()
  })
})

describe('the feed screen', () => {
  const props = feedProps

  it('offers the shared budget steps rather than a second copy of them', () => {
    const { container } = render(<Feed {...props} />)
    expect(container.querySelectorAll('.fd-step')).toHaveLength(VOCAB_BUDGET_STEPS.length)
    expect(container.querySelector('.fd-step.set')?.textContent).toBe('10')
  })

  it('separates what is set from where the cursor is', () => {
    /* collapsing them makes arrowing past a step look exactly like changing it */
    const { container } = render(<Feed {...props} />)
    const root = container.querySelector('.mn-open') as Element
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(container.querySelector('.fd-step.on')?.textContent).toBe('NONE')
    expect(container.querySelector('.fd-step.set')?.textContent).toBe('10')
  })

  it('changes the budget only when the step is picked', () => {
    const setBudget = vi.fn()
    const { container } = render(<Feed {...props} feed={feedOf({ setBudget })} />)
    const root = container.querySelector('.mn-open') as Element
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(setBudget).not.toHaveBeenCalled()
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(setBudget).toHaveBeenCalledWith(0)
  })

  it('draws the whole queue rather than one word and a rail of anonymous ticks', () => {
    /* THE RAIL MARKED POSITION IN A LIST YOU COULD NOT SEE. `next_words` returns what has NOT been
       started, so studying a word removes it rather than ticking it -- there was never a "done
       today" for the rail to draw, and its only remaining job was saying which of forty invisible
       words you were on. The words are on the screen now, so it is gone. */
    const words = Array.from({ length: 4 }, (_, i) => word({ card_id: i }))
    const { container } = render(<Feed {...props} feed={feedOf({ words })} />)
    expect(container.querySelectorAll('.fd-row')).toHaveLength(4)
    expect(container.querySelectorAll('.fd-row.on')).toHaveLength(1)
    expect(container.querySelector('.fd-rail')).toBeNull()
  })

  it('reads down the queue without giving up the budget axis', () => {
    const words = [word({ card_id: 1, word: '一' }), word({ card_id: 2, word: '二' })]
    const { container } = render(<Feed {...props} feed={feedOf({ words })} />)
    const root = container.querySelector('.mn-open') as Element
    expect(container.querySelector('.fd-cap')?.textContent).toContain('1 OF 2')
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    expect(container.querySelector('.fd-cap')?.textContent).toContain('2 OF 2')
    expect(container.querySelector('.fd-word')?.textContent).toBe('二')
  })

  it('names its drill on the slab, the same way the deck screen does', () => {
    const { container } = render(<Feed {...props} mode="Typed Recall" />)
    expect(container.querySelector('.fd-slab em')?.textContent).toContain('TYPED RECALL')
  })

  it('says which empty it is rather than drawing a blank queue', () => {
    const { container } = render(<Feed {...props} feed={feedOf({ words: [], budget: 0 })} />)
    expect(container.textContent).toContain('THE BUDGET IS SET TO NONE')
    /* WHICH ABSENCE IT IS: a budget of nought is a choice you made, and a queue that ran dry is
       not -- the column says so where the words would have been. */
    expect(container.querySelector('.fd-none')?.textContent)
      .toBe('NO NEW WORDS TODAY · REVIEWS ONLY')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Feed {...props} />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
