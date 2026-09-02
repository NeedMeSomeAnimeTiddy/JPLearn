import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import axe from 'axe-core'
import type { Passage } from '../passages'
import type { BadgeEntry } from '../achievements/types'
import { BADGE_METADATA } from '../achievements'
import { Library } from './components/Library'
import { Wall } from './components/Wall'
import { LIBRARY_WINDOW, libraryNote, libraryRows, libraryWindow } from './library'
import { flatSeals, sealGroups, wallStep } from './wall'
import { EXAM_MODES, levelDetail, sectionLine, unscored } from './examLevel'
import { JLPT_UNLOCK_PCT, ascentRungs } from './ascent'
import {
  TAB_W, TAB_W_SEL, drillChapters, drillDecks, drillModes, nearestOffered, railLayout, railStep,
  tabScale,
} from './drills'
import { MINIGAMES, SCRIPT_MINIGAMES } from '../../constants'
import type { LevelReadiness, ReadinessPayload, Rung } from './ascent'

const passage = (id: string, words: number, difficulty: number) => ({
  id, title: id, title_reading: id, author: '作者',
  source: '', source_url: '', original_publication: '',
  difficulty, difficulty_label: 'beginner', word_count: words,
  text_jp: '', raw_text: '', vocabulary: [],
} as unknown as Passage)

const shelf = Array.from({ length: 30 }, (_, i) => passage(`t${i}`, (i + 1) * 40, i / 100))

afterEach(cleanup)

describe('the library', () => {
  it('counts the shelf rather than stating it', () => {
    const rows = libraryRows(shelf)
    expect(rows).toHaveLength(30)
    expect(libraryNote(rows)).toMatch(/^30 TEXTS · ALL BEGINNER/)
  })

  it('says not-counted-yet rather than an empty shelf', () => {
    expect(libraryRows(null)).toEqual([])
    expect(libraryNote([])).toBe('NOT COUNTED YET')
  })

  it('turns a word count into minutes at a stated pace', () => {
    /* forty words a minute is a beginner reading aloud, and is the one assumption on the screen */
    expect(libraryRows([passage('a', 400, 0)])[0].minutes).toBe(10)
    /* and nothing is ever zero minutes long */
    expect(libraryRows([passage('b', 3, 0)])[0].minutes).toBe(1)
  })

  it('opens on the easiest, in the order the hub itself uses', () => {
    const rows = libraryRows([passage('hard', 100, 0.9), passage('easy', 100, 0.1)])
    expect(rows.map((r) => r.id)).toEqual(['easy', 'hard'])
  })

  describe('the window, which is how this menu handles overflow', () => {
    it('shows six of thirty and says how many are folded away', () => {
      const rows = libraryRows(shelf)
      const view = libraryWindow(rows, 0)
      expect(view.rows).toHaveLength(LIBRARY_WINDOW)
      expect(view.above).toBe(0)
      expect(view.above + view.rows.length + view.below).toBe(30)
    })

    it('clamps at both ends so the first and last are reachable', () => {
      const rows = libraryRows(shelf)
      expect(libraryWindow(rows, 0).above).toBe(0)
      const end = libraryWindow(rows, rows.length - 1)
      expect(end.below).toBe(0)
      expect(end.rows.at(-1)?.id).toBe(rows.at(-1)?.id)
    })

    it('does not fold at all when everything fits', () => {
      const view = libraryWindow(libraryRows(shelf.slice(0, 4)), 0)
      expect(view.above).toBe(0)
      expect(view.below).toBe(0)
    })
  })

  it('walks down and opens the one under the cursor', () => {
    const onOpen = vi.fn()
    render(<Library rows={libraryRows(shelf)} loading={false} onOpen={onOpen} onUp={vi.fn()} />)
    const root = document.querySelector('.mn-open') as HTMLElement
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(libraryRows(shelf)[1].id)
  })

  it('has no accessibility violations', async () => {
    render(<Library rows={libraryRows(shelf)} loading={false} onOpen={vi.fn()} onUp={vi.fn()} />)
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})

describe('the wall', () => {
  const all = Object.keys(BADGE_METADATA)
  const earned = (...ids: string[]): BadgeEntry[] =>
    all.map((d) => ({ descriptor: d, earned: ids.includes(d) }))

  it('shows every badge the catalog has, not only the ones the backend mentioned', () => {
    /* a wall shows what there is to earn, so a badge nobody has heard of still gets a seal */
    const groups = sealGroups([])
    expect(flatSeals(groups)).toHaveLength(all.length)
    expect(flatSeals(groups).every((s) => !s.earned)).toBe(true)
  })

  it('groups by the catalog\'s own category and counts each group', () => {
    const groups = sealGroups(earned(all[0]))
    expect(groups.length).toBeGreaterThan(1)
    expect(groups.reduce((a, g) => a + g.seals.length, 0)).toBe(all.length)
    expect(groups.reduce((a, g) => a + g.earned, 0)).toBe(1)
  })

  it('names each group in something short enough to fit the slot it is drawn in', () => {
    /* `.bw-lab` is 186px and holds the Japanese, the English and the count on ONE baseline.
       'HOW FAR YOU HAVE COME' needed 189 of it: the label wrapped, the row's label block doubled
       from 19px to 38, and the count broke across two lines as "1 /" over "9". Measured live, at
       this face the English runs about 5.9px per character and the rest of the row takes 73, so
       eighteen characters is the whole budget. The mockup's own labels here were single words.
       A length check is a poor substitute for measuring type, but it is the one that runs. */
    for (const group of sealGroups([])) expect(group.en.length).toBeLessThanOrEqual(18)
  })

  it('carries the catalog\'s sentence as what the badge takes', () => {
    /* the description IS the requirement, so an unearned seal has something to say without a
       second field being invented for it */
    const first = flatSeals(sealGroups([]))[0]
    expect(first.takes).toBe(BADGE_METADATA[first.descriptor].description)
    expect(first.takes.length).toBeGreaterThan(0)
  })

  describe('walking it, which is two axes', () => {
    const groups = sealGroups([])

    it('runs left and right across the whole set in order', () => {
      expect(wallStep(groups, 0, 1, 0)).toBe(1)
      expect(wallStep(groups, 0, -1, 0)).toBe(0)
      const last = flatSeals(groups).length - 1
      expect(wallStep(groups, last, 1, 0)).toBe(last)
    })

    it('jumps a whole group up and down', () => {
      const firstRow = groups[0].seals.length
      /* from the head of the first group, down lands at the head of the second */
      expect(wallStep(groups, 0, 0, 1)).toBe(firstRow)
      expect(wallStep(groups, firstRow, 0, -1)).toBe(0)
    })

    it('keeps the column where it can when the next row is shorter', () => {
      /* moving between rows of different lengths has to land somewhere, and the nearest seat in
         the shorter row is the least surprising one */
      const longest = groups.reduce((a, g) => (g.seals.length > a.seals.length ? g : a))
      const start = flatSeals(groups).indexOf(longest.seals[longest.seals.length - 1])
      const moved = wallStep(groups, start, 0, -1)
      expect(moved).toBeGreaterThanOrEqual(0)
      expect(moved).toBeLessThan(flatSeals(groups).length)
    })
  })

  it('has no accessibility violations', async () => {
    render(<Wall onUp={vi.fn()} />)
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})

/* ==================================================================================================
   THE GATE BETWEEN LEVELS, WHICH USED TO BE TESTED SOMEWHERE ELSE.

   `JLPTPrepView`'s dashboard drew five readiness cards and enforced this rule on each of them, and
   three of its tests covered it. That dashboard is gone -- ASCENT draws the same rule as one line
   across all five levels instead -- so the tests come with it rather than being deleted. A rule that
   moves keeps its coverage; that is the whole difference between retiring a screen and losing one.
   ================================================================================================== */
describe('the gate the ascent draws across the ladder', () => {
  const level = (over: Partial<LevelReadiness>): LevelReadiness => ({
    level: 'n5', mastered_vocab: 0, total_vocab: 100, mastered_kanji: 0, total_kanji: 80,
    readiness_pct: 0, is_ready: false, pass_mark: 60,
    vocab_grammar_section_max: 120, vocab_grammar_pass_mark: 38, ...over,
  })
  const payload = (n5pct: number): ReadinessPayload => ({
    recommended_target: 'n5',
    levels: {
      n5: level({ level: 'n5', readiness_pct: n5pct }),
      n4: level({ level: 'n4' }), n3: level({ level: 'n3' }),
      n2: level({ level: 'n2' }), n1: level({ level: 'n1' }),
    },
  } as ReadinessPayload)

  it('shuts a level whose predecessor is below the gate', () => {
    const rungs = ascentRungs(payload(JLPT_UNLOCK_PCT - 1))
    expect(rungs[0].state).not.toBe('locked')
    expect(rungs[1].state).toBe('locked')
  })

  it('opens it the moment the one below clears', () => {
    const rungs = ascentRungs(payload(JLPT_UNLOCK_PCT))
    expect(rungs[1].state).not.toBe('locked')
  })

  it('says which level opens it and how far off it is, rather than only that it is shut', () => {
    /* the old dashboard printed "Reach 30% readiness in JLPT N5 to unlock" on every locked card;
       the ascent carries the same three facts and draws them once, as a line */
    const shut = ascentRungs(payload(12))[1]
    expect(shut.opensAt).toEqual({ id: 'N5', need: JLPT_UNLOCK_PCT, at: 12 })
  })

  it('has nothing to draw when readiness has not arrived', () => {
    expect(ascentRungs(null)).toEqual([])
  })
})

describe('one rung of the ascent', () => {
  const data = (over: Partial<LevelReadiness> = {}): LevelReadiness => ({
    level: 'n4', mastered_vocab: 561, total_vocab: 666, mastered_kanji: 148, total_kanji: 177,
    readiness_pct: 84, is_ready: true, pass_mark: 90,
    vocab_grammar_section_max: 120, vocab_grammar_pass_mark: 38, ...over,
  })
  const rung = (over: Partial<Rung> = {}): Rung => ({
    level: 'n4', id: 'N4', pct: 84, state: 'target', done: 709, total: 843,
    opensAt: null, isTarget: true, isReady: true, passMark: 90, x: 0, w: 118, ...over,
  })

  it('reads the headline as what is LEFT, not what is done', () => {
    /* "18 points short" is something a learner can act on and "62%" on its own is not */
    expect(levelDetail(rung({ pct: 62 }), data(), null).shortBy).toBe(18)
    expect(levelDetail(rung(), data(), null).shortBy).toBe(0)
  })

  it('knows which papers this app has no content for, and it differs by level', () => {
    /* N4/N5 score vocabulary, grammar AND reading as one 120 paper, so only listening is missing;
       N1-N3 score the section alone out of 60 and neither reading nor listening has a source */
    expect(unscored(120)).toEqual({ points: 60, papers: 'LISTENING' })
    expect(unscored(60)).toEqual({ points: 120, papers: 'READING AND LISTENING' })
  })

  it('never projects a section it has no mock for', () => {
    const d = levelDetail(rung(), data(), null)
    expect(d.section.projected).toBeNull()
    expect(sectionLine(d)).toBe('NO MOCK SAT · PASS MARK 38 OF 120')
  })

  it(`uses the backend's own projection when a mock has been sat`, () => {
    /* `project_mock_score` already ran in `domain/jlpt_sessions` and its answer is stored on the
       result, so nothing here recomputes it */
    const d = levelDetail(rung(), data(), { correct: 19, asked: 30, projected: 76 })
    expect(d.section.projected).toBe(76)
    expect(sectionLine(d)).toMatch(/LAST MOCK 19 \/ 30 → 76 OF 120 · PASS MARK 38/)
  })

  it('says a locked level cannot be sat rather than showing it a mark', () => {
    const d = levelDetail(rung({ state: 'locked', isTarget: false, isReady: false }), data(), null)
    expect(d.locked).toBe(true)
    expect(sectionLine(d)).toMatch(/LOCKED/)
  })

  it('gives each of the four ways in a purpose the app never states', () => {
    expect(EXAM_MODES).toHaveLength(4)
    expect(EXAM_MODES.every((m) => m.purpose && m.label && m.description)).toBe(true)
    /* two of the four move the readiness figure, one measures it, one finds your level */
    expect(EXAM_MODES.filter((m) => m.purpose === 'MOVES THE NUMBER')).toHaveLength(2)
  })
})

describe('the drills road', () => {
  const modes = drillModes()

  it('carries every mode the picker renders, and no more', () => {
    expect(modes).toHaveLength(MINIGAMES.length)
    expect(new Set(modes.map((m) => m.key)).size).toBe(MINIGAMES.length)
  })

  it('orders them by group so the road reads as chapters', () => {
    /* MINIGAMES is in catalogue order, which interleaves the groups -- this is a derived ordering
       rather than a second list to keep in step */
    const orders = modes.map((m) => m.groupOrder)
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b))
    expect(drillChapters(modes).length).toBeGreaterThan(1)
  })

  it('counts each deck’s offering out of the map rather than stating it', () => {
    for (const d of drillDecks(modes)) {
      expect(d.offers).toBe(SCRIPT_MINIGAMES[d.key].length)
      expect(d.offers).toBeLessThanOrEqual(modes.length)
    }
  })

  it('reads the deck map the other way round for each mode', () => {
    const first = modes[0]
    for (const deck of first.decks) expect(SCRIPT_MINIGAMES[deck]).toContain(first.key)
  })

  describe('the fold, which is in the widths', () => {
    it('gives an unoffered mode width zero and leaves it out of the walk', () => {
      const deck = 'sentence_examples' as const
      const layout = railLayout(modes, deck, nearestOffered(modes, deck, 0))
      expect(layout.list.length).toBe(SCRIPT_MINIGAMES[deck].length)
      expect(layout.list.length).toBeLessThan(modes.length)
      modes.forEach((m, i) => {
        if (!m.decks.includes(deck)) expect(layout.widths[i]).toBe(0)
      })
    })

    it('never lets the cursor rest on a folded mode', () => {
      /* changing deck snaps outward from where you were, so the road never focuses a gap */
      const deck = 'sentence_examples' as const
      for (let i = 0; i < modes.length; i++) {
        const landed = nearestOffered(modes, deck, i)
        expect(modes[landed].decks).toContain(deck)
      }
    })

    it('walks the offered list and stops at both of its ends', () => {
      const deck = 'hiragana' as const
      const start = nearestOffered(modes, deck, 0)
      const layout = railLayout(modes, deck, start)
      expect(railStep(layout, start, -1)).toBe(start)
      const last = layout.list[layout.list.length - 1]
      expect(railStep(railLayout(modes, deck, last), last, 1)).toBe(last)
    })
  })

  it('gives the selection the wide tab and shrinks the rest with distance', () => {
    const deck = 'hiragana' as const
    const sel = nearestOffered(modes, deck, 0)
    const layout = railLayout(modes, deck, sel)
    expect(layout.widths[sel]).toBe(TAB_W_SEL)
    const others = layout.list.filter((i) => i !== sel)
    expect(Math.max(...others.map((i) => layout.widths[i]))).toBeLessThanOrEqual(TAB_W)
    /* floored, so the far end of the road stays readable rather than collapsing */
    expect(tabScale(99)).toBe(tabScale(5))
    expect(tabScale(0)).toBe(1)
  })
})

describe('the shelf is a map, which means it can be travelled', () => {
  it('goes to the text whose bar you press', () => {
    /* the strip drew all thirty rows sized by their distance from the cursor -- a genuine minimap
       -- and none of it did anything. On a shelf this long it is the only control that can cross
       the whole thing in one gesture: the rail steps one row at a time and holds six. */
    render(<Library rows={libraryRows(shelf)} loading={false} onOpen={vi.fn()} onUp={vi.fn()} />)
    const bars = document.querySelectorAll('.lb-bar')
    expect(bars.length).toBe(libraryRows(shelf).length)
    fireEvent.click(bars[bars.length - 1] as HTMLElement)
    expect(document.querySelector('.lb-row.on .lb-jp')?.textContent)
      .toBe(libraryRows(shelf)[libraryRows(shelf).length - 1].title)
  })

  it('makes every bar a real button, so the keyboard reaches them too', () => {
    render(<Library rows={libraryRows(shelf)} loading={false} onOpen={vi.fn()} onUp={vi.fn()} />)
    expect((document.querySelector('.lb-bar') as HTMLElement).tagName).toBe('BUTTON')
  })

  it('opens a band onto the first of its texts, which is all it could mean', () => {
    render(<Library rows={libraryRows(shelf)} loading={false} onOpen={vi.fn()} onUp={vi.fn()} />)
    const plate = document.querySelector('.lb-plate') as HTMLElement
    expect(plate.tagName).toBe('BUTTON')
    fireEvent.keyDown(document.querySelector('.mn-open') as HTMLElement, { key: 'ArrowDown' })
    fireEvent.click(plate)
    expect(document.querySelector('.lb-row.on .lb-jp')?.textContent)
      .toBe(libraryRows(shelf)[0].title)
  })
})
