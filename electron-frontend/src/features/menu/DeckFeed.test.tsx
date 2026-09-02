import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import axe from 'axe-core'
import type { BlockInfo, JlptLevelProgress } from '../../types'
import type { VocabFeed, VocabFeedWord } from '../vocab-feed'
import { VOCAB_BUDGET_STEPS } from '../vocab-feed'
import { Deck } from './components/Deck'
import { Feed } from './components/Feed'
import { DECK_PER_PAGE, DEFAULT_GATE, deckChain, deckSheet, gateLine, railLine } from './deck'
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

describe('the cleared pile', () => {
  it('pages rather than scrolls, so even a long deck is two pages and a grid move', () => {
    const view = deckSheet(43, 0)
    expect(view.pages).toBe(2)
    expect(view.cells).toHaveLength(DECK_PER_PAGE)
    expect(deckSheet(43, 1).cells).toHaveLength(43 - DECK_PER_PAGE)
  })

  it('clamps a page that has stopped existing', () => {
    /* clearing fewer blocks (a level switch) must not leave the pager past its own end */
    expect(deckSheet(5, 9).page).toBe(0)
    expect(deckSheet(5, 9).cells).toEqual([0, 1, 2, 3, 4])
  })

  it('is one empty page rather than none when nothing is cleared', () => {
    expect(deckSheet(0, 0)).toEqual({ cells: [], page: 0, pages: 1 })
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

  it('offers two doors and draws the third', () => {
    const { container } = render(<Deck {...props} />)
    /* AHEAD is deliberately not a button: naming the next block is context, offering it is a lie */
    expect(container.querySelectorAll('.dk-f')).toHaveLength(2)
    expect(container.querySelector('.dk-ahead')?.tagName).toBe('DIV')
  })

  it('hands over the block that was chosen, not the one that was open', () => {
    const onStart = vi.fn()
    const { container } = render(<Deck {...props} onStart={onStart} />)
    fireEvent.click(container.querySelector('.dk-behind') as Element)
    const cells = container.querySelectorAll('.dk-cell')
    expect(cells).toHaveLength(2)
    fireEvent.click(cells[0])
    fireEvent.click(container.querySelector('.dk-here') as Element)
    expect(onStart).toHaveBeenCalledWith(0)
  })

  it('sets the block name from its own length, because the stylesheet cannot', () => {
    /* `.dk-name` declares family, weight and line-height and deliberately no size -- so a port
       that forgot the inline one rendered a 46px headline at the body's 16, which is what this
       card looked like until it was measured in the running app. */
    const short = render(<Deck {...props} blocks={chainOf(2, 2)} />)
    expect((short.container.querySelector('.dk-name') as HTMLElement).style.fontSize).toBe('46px')
    cleanup()
    const long = render(
      <Deck {...props} blocks={chainOf(2, 2).map((b) => ({ ...b, name: 'Old Units and Measures' }))} />,
    )
    /* twenty-two characters is past the point where 46 fits, and it is set down rather than wrapped */
    expect((long.container.querySelector('.dk-name') as HTMLElement).style.fontSize).toBe('34px')
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

  it('will not open a pile that has nothing in it', () => {
    const { container } = render(<Deck {...props} blocks={chainOf(6, 1)} />)
    fireEvent.click(container.querySelector('.dk-behind') as Element)
    expect(container.querySelector('.dk-sheet')).toBeNull()
    expect(container.textContent).toContain('NOTHING BEHIND YOU YET')
  })

  it('closes the pile on Escape without also leaving the screen', () => {
    /* one Escape, one job -- App's window listener must not see this one */
    const onUp = vi.fn()
    const { container } = render(<Deck {...props} onUp={onUp} />)
    fireEvent.click(container.querySelector('.dk-behind') as Element)
    fireEvent.keyDown(container.querySelector('.mn-open') as Element, { key: 'Escape' })
    expect(container.querySelector('.dk-sheet')).toBeNull()
    expect(onUp).not.toHaveBeenCalled()
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

  it('marks position on the rail and never progress', () => {
    /* `next_words` returns what has NOT been started, so studying a word removes it from the list
       rather than ticking it -- there is no "done today" for the rail to draw. */
    const words = Array.from({ length: 4 }, (_, i) => word({ card_id: i }))
    const { container } = render(<Feed {...props} feed={feedOf({ words })} />)
    expect(container.querySelectorAll('.fd-segrow i')).toHaveLength(4)
    expect(container.querySelectorAll('.fd-segrow i.here')).toHaveLength(1)
    expect(container.querySelector('.fd-railcap')?.textContent)
      .toContain('THE LIST IS REBUILT, NOT TICKED OFF')
  })

  it('reads down the queue without giving up the budget axis', () => {
    const words = [word({ card_id: 1, word: '一' }), word({ card_id: 2, word: '二' })]
    const { container } = render(<Feed {...props} feed={feedOf({ words })} />)
    const root = container.querySelector('.mn-open') as Element
    expect(container.querySelector('.fd-cap b')?.textContent).toContain('1 OF 2')
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    expect(container.querySelector('.fd-cap b')?.textContent).toContain('2 OF 2')
    expect(container.querySelector('.fd-word')?.textContent).toBe('二')
  })

  it('names its drill on the slab, the same way the deck screen does', () => {
    const { container } = render(<Feed {...props} mode="Typed Recall" />)
    expect(container.querySelector('.fd-slab em')?.textContent).toContain('TYPED RECALL')
  })

  it('says which empty it is rather than drawing a blank queue', () => {
    const { container } = render(<Feed {...props} feed={feedOf({ words: [], budget: 0 })} />)
    expect(container.textContent).toContain('THE BUDGET IS SET TO NONE')
    expect(container.querySelector('.fd-none')?.textContent).toBe('NO NEW WORDS QUEUED TODAY')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Feed {...props} />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
