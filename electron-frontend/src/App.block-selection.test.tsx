/**
 * Which block a session ends up drawing from.
 *
 * These drive the real App rather than the hook, because the behaviour that matters crosses three
 * files: the menu's deck screen picks the block, `useBlockSelection` holds and persists it, and
 * `startSession` builds the round out of the pool that results.
 *
 * WHAT USED TO BE HERE was multi-select over the script hub's tracklist strip — All, None, and
 * toggling several blocks into one union pool (issue #78). The hub is gone and the deck screen
 * offers one block at a time, which is what the chain says anyway: `compute_unlocked_count` walks
 * the blocks in order and stops at the first one under the gate, so exactly one is open and
 * everything before it is revisitable one at a time. `unionBlockCards` still takes a list and
 * `blockSelectionV2` is still an array per deck — the storage shape outlived the interface that
 * filled it, and its own rules are tested in `features/block-selection/utils.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openDeck } from './test-entry'
import App from './App'
import { PREFS_STORAGE_KEY } from './lib/appStorage'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => (
    <span>{typeof sequence[0] === 'string' ? sequence[0] : ''}</span>
  ),
}))

vi.mock('./features/onboarding/useTypewriter', () => ({
  useTypewriter: (text: string, onComplete: () => void) => {
    onComplete()
    return text
  },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class MockObserver {
  constructor(_c?: unknown) {}
  disconnect(): void {}
  observe(_t?: Element): void {}
  unobserve(_t?: Element): void {}
  takeRecords(): [] { return [] }
}
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockObserver })
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: MockObserver })
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: MockObserver })
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: MockObserver })
if (!Element.prototype.scrollBy) {
  Element.prototype.scrollBy = function scrollBy() {}
}

const cards = Array.from({ length: 6 }, (_, id) => ({
  id,
  character: `char${id}`,
  romaji: `r${id}`,
  meaning: `m${id}`,
  tags: ['hiragana'],
  example_sentence: null,
  dictionary_summary: null,
  is_leech: false,
  curriculum_stage: 1,
  meaning_distractor_ids: [0, 1, 2, 3, 4, 5].filter((i) => i !== id),
  character_distractor_ids: [0, 1, 2, 3, 4, 5].filter((i) => i !== id),
  note_key: `note:v1:builtin:${id.toString(16).padStart(64, '0')}`,
}))

/** Two unlocked blocks of two, and a locked third — the shape the strip gates on. */
const blocks = [
  { index: 0, name: 'Vowels', card_ids: [0, 1], sample_chars: [], characters: [], meanings: [], romajis: [], mastery: 1, unlocked: true },
  { index: 1, name: 'K-row', card_ids: [2, 3], sample_chars: [], characters: [], meanings: [], romajis: [], mastery: 0.5, unlocked: true },
  { index: 2, name: 'S-row', card_ids: [4, 5], sample_chars: [], characters: [], meanings: [], romajis: [], mastery: 0, unlocked: false },
]

const emptyActivity = {
  days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0,
}

function makeApi() {
  return {
    versions: { chrome: '0', electron: '0', node: '0' },
    getStudySummary: async () => ({
      decks: [], streak: { current_days: 0, best_days: 0, freezes_available: 0 },
      activity: { week: emptyActivity, month: { ...emptyActivity, days: 30 } },
      mistakes: [], minigame_performance: [], session_history: [], item_history: [],
      generated_at: '2026-01-01T00:00:00+00:00',
    }),
    getDeckCards: async () => ({ cards }),
    getBlockProgress: async () => ({ blocks }),
    getStudyQueue: async () => ({ items: [] }),
    getOverviewCharacterMastery: async () => ({
      blocks: { hiragana: [], katakana: [] },
      category_blocks: { vocab_n5: [], grammar_patterns: [] },
      kanji_cards: [],
    }),
    recordGameResult: async () => ({
      ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5,
    }),
    notifyStartupReady: async () => ({ ok: true }),
    setStartupTheme: async () => ({ ok: true, theme: 'lofi_dusk' }),
    getCardNote: async () => ({ note: null }),
    startSessionGoal: async () => ({
      ok: true,
      goal: {
        session_id: 'test', target_items: 10, target_minutes: null,
        target_accuracy: null, started_at_utc: '2026-01-01T00:00:00+00:00',
      },
    }),
  } as unknown as typeof window.jplearnDesktop
}

beforeEach(() => {
  window.localStorage.clear()
    /* this suite clears storage in its own beforeEach, which runs after the setup file's --
       so the classic front door is re-stated here. These tests are about the flow behind
       the door, not the door. */
  window.jplearnDesktop = makeApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})


/** The deck screen's open card, once the bridge has answered with a chain. */
async function openHiraganaDeck(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  openDeck('Hiragana')
  await waitFor(() => expect(document.querySelector('.dk-here')).not.toBeNull())
}

/** The block the open card is standing on. */
function openBlock(): string {
  return document.querySelector('.dk-name')?.textContent?.trim() ?? ''
}

/** Open the cleared pile and stand the card on one of them. */
async function revisit(name: string): Promise<void> {
  fireEvent.click(document.querySelector('.dk-behind') as Element)
  const cell = Array.from(document.querySelectorAll('.dk-cell'))
    .find((c) => c.querySelector('em')?.textContent?.trim() === name)
  if (!cell) throw new Error(`No cleared block called ${name}`)
  fireEvent.click(cell)
  await waitFor(() => expect(openBlock()).toBe(name))
}

function storedSelection(): unknown {
  return JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}').blockSelectionV2
}

describe('the block a session draws from', () => {
  it('opens on the furthest unlocked block, which is where the chain has got to', async () => {
    await openHiraganaDeck()
    expect(openBlock()).toBe('K-row')
    expect(document.querySelector('.dk-here .dk-cap b')?.textContent).toContain('BLOCK 02 OF 3')
  })

  it('draws a locked block as ahead rather than as a choice', async () => {
    await openHiraganaDeck()
    /* AHEAD is a div, not a button: naming the next block is context, offering it is a lie */
    const ahead = document.querySelector('.dk-ahead') as HTMLElement
    expect(ahead.tagName).toBe('DIV')
    expect(ahead.textContent).toContain('S-row')
  })

  it('studies the block the pile handed over, not the one that was open', async () => {
    await openHiraganaDeck()
    await revisit('Vowels')
    /* the pile only moves the card; START is what hands the block over */
    expect(storedSelection()).toBeUndefined()

    fireEvent.click(document.querySelector('.dk-here') as Element)
    await waitFor(() => expect(storedSelection()).toEqual({ hiragana: [0] }))
  })

  it('builds the round out of the block that was just chosen, not the one before it', async () => {
    /* THE RACE THIS EXISTS FOR. `startSession` closes over `activeBlockCards`, a render-time
       value, so starting in the same handler that changed the selection would draw the round from
       the block you were standing on a moment ago. Vowels is cards 0 and 1; K-row, which the
       screen opened on, is 2 and 3. */
    await openHiraganaDeck()
    await revisit('Vowels')
    fireEvent.click(document.querySelector('.dk-here') as Element)

    await waitFor(() => expect(document.querySelector('.game-prompt-main')).not.toBeNull())
    const shown = document.querySelector('.game-prompt-main')?.textContent?.trim() ?? ''
    expect(['char0', 'char1']).toContain(shown)
  })

  it('remembers what you studied, though the screen still opens where the chain is', async () => {
    /* TWO DIFFERENT FACTS, and it is worth saying which is which. The stored selection is the
       POOL -- what a drill launched from the titlebar, with no screen in between, will draw. The
       deck screen's card is the CHAIN -- the one block that is open and the only one that moves
       the deck on. Revisiting a cleared block does not move the frontier, so coming back to the
       screen shows the frontier again. */
    await openHiraganaDeck()
    await revisit('Vowels')
    fireEvent.click(document.querySelector('.dk-here') as Element)
    await waitFor(() => expect(storedSelection()).toEqual({ hiragana: [0] }))

    cleanup()
    await openHiraganaDeck()
    expect(openBlock()).toBe('K-row')
    expect(storedSelection()).toEqual({ hiragana: [0] })
  })

  it('keeps the choice out of the way of the other session prefs', async () => {
    await openHiraganaDeck()
    await revisit('Vowels')
    fireEvent.click(document.querySelector('.dk-here') as Element)

    await waitFor(() => {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}')
      /* both owners write this blob; neither may drop the other's fields */
      expect(prefs.blockSelectionV2).toEqual({ hiragana: [0] })
      expect(prefs.script).toBe('hiragana')
    })
  })

  it('ignores a selection stored against a block layout that no longer exists', async () => {
    /* selections are indices, so they only mean anything against the list they were made against */
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      script: 'hiragana', blockSelectionV2: { hiragana: [7, 8, 9] },
    }))
    await openHiraganaDeck()
    expect(openBlock()).toBe('K-row')
  })

  it('studies the vocabulary level deck, not a category deck', async () => {
    /* the regression this half of Phase 3 exists to fix: both levelled sections used to load a
       CATEGORY deck, so `blocks_for_slug`'s output was computed and never read -- a category
       carries no blocks of its own, it is one */
    const getDeckCards = vi.fn(async () => ({ cards }))
    const getBlockProgress = vi.fn(async () => ({ blocks }))
    window.jplearnDesktop = {
      ...makeApi(), getDeckCards, getBlockProgress,
    } as unknown as typeof window.jplearnDesktop

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    openDeck('Vocabulary')

    await waitFor(() => expect(getDeckCards).toHaveBeenCalledWith('vocab_n5'))
  })
})
