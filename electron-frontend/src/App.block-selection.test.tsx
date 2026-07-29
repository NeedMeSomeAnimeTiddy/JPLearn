/**
 * Multi-select over the tracklist strip (issue #78).
 *
 * Before this, a session drew from exactly one block. Kana blocks are five cards,
 * which is too thin for most minigames — the plan's problem P7. These drive the
 * real App rather than the hook, because the behaviour that matters is the pool a
 * session ends up with, and that crosses App, ScriptHubView and useBlockSelection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  } as unknown as typeof window.jplearnDesktop
}

beforeEach(() => {
  window.localStorage.clear()
  window.jplearnDesktop = makeApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function clickTopMenuCard(label: string): void {
  const menuCards = Array.from(document.querySelectorAll('.cassette')) as HTMLButtonElement[]
  const button = menuCards.find(
    (card) => card.querySelector('.cassette-title')?.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )
  if (!button) throw new Error(`Top menu card not found for ${label}`)
  fireEvent.click(button)
  fireEvent.click(button)
}

/** A block row in the tracklist. Named by its own cell, not the whole row —
 *  the row also carries a track number, a mastery figure and a screen-reader
 *  summary. */
function blockRow(name: string): HTMLButtonElement {
  const rows = Array.from(document.querySelectorAll('.hub-track')) as HTMLButtonElement[]
  const row = rows.find((r) => r.querySelector('.hub-track-name')?.textContent?.trim() === name)
  if (!row) throw new Error(`Block row not found: ${name}. Have: ${blockNames().join(', ')}`)
  return row
}

function blockNames(): string[] {
  return (Array.from(document.querySelectorAll('.hub-track-name')) as HTMLElement[])
    .map((n) => n.textContent?.trim() ?? '')
}

function selectedBlockNames(): string[] {
  return (Array.from(document.querySelectorAll('.hub-track')) as HTMLButtonElement[])
    .filter((r) => r.getAttribute('aria-pressed') === 'true')
    .map((r) => r.querySelector('.hub-track-name')?.textContent?.trim() ?? '')
}

/** All / None / Change / Done — the actions above the tracklist. */
function actionChip(name: string): HTMLButtonElement {
  const chips = Array.from(document.querySelectorAll('.hub-block-chip')) as HTMLButtonElement[]
  const chip = chips.find((c) => c.textContent?.trim() === name)
  if (!chip) throw new Error(`Action not found: ${name}. Have: ${actionNames().join(', ')}`)
  return chip
}

function actionNames(): string[] {
  return (Array.from(document.querySelectorAll('.hub-block-chip')) as HTMLButtonElement[])
    .map((c) => c.textContent?.trim() ?? '')
}

/** The "<label> · <n> cards" kicker, which reports the live pool. */
function poolLabel(): string {
  return document.querySelector('.hero-kicker')?.textContent?.trim() ?? ''
}

async function openHiraganaHub(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  clickTopMenuCard('Hiragana')
  await waitFor(() => expect(document.querySelectorAll('.hub-block-chip').length).toBeGreaterThan(0))
}

describe('block multi-select', () => {
  it('defaults to the furthest unlocked block, as single-select did', async () => {
    await openHiraganaHub()
    expect(selectedBlockNames()).toEqual(['K-row'])
    expect(poolLabel()).toContain('2 cards')
  })

  it('adds a second block and unions the pool', async () => {
    await openHiraganaHub()
    fireEvent.click(blockRow('Vowels'))

    await waitFor(() => expect(selectedBlockNames()).toEqual(['Vowels', 'K-row']))
    expect(poolLabel()).toContain('4 cards')
    expect(poolLabel()).toContain('2 blocks')
  })

  it('deselects a block that is clicked again', async () => {
    await openHiraganaHub()
    fireEvent.click(blockRow('Vowels'))
    await waitFor(() => expect(selectedBlockNames()).toHaveLength(2))

    fireEvent.click(blockRow('K-row'))
    await waitFor(() => expect(selectedBlockNames()).toEqual(['Vowels']))
    expect(poolLabel()).toContain('2 cards')
  })

  it('renders a locked block as a disabled chip that cannot be selected', async () => {
    await openHiraganaHub()
    const locked = blockRow('S-row')

    expect(locked.disabled).toBe(true)
    fireEvent.click(locked)
    await waitFor(() => expect(selectedBlockNames()).toEqual(['K-row']))
  })

  it('selects every unlocked block but never a locked one', async () => {
    await openHiraganaHub()
    fireEvent.click(actionChip('All'))

    await waitFor(() => expect(selectedBlockNames()).toEqual(['Vowels', 'K-row']))
    expect(poolLabel()).toContain('4 cards')
  })

  it('clearing the selection studies the whole deck', async () => {
    await openHiraganaHub()
    fireEvent.click(actionChip('None'))

    await waitFor(() => expect(selectedBlockNames()).toEqual([]))
    // All six cards, including the two behind the locked block: an empty
    // selection means "no block filter", not "no cards".
    expect(poolLabel()).toContain('6 cards')
    expect(poolLabel()).toContain('Whole deck')
  })

  it('persists the selection across a remount', async () => {
    await openHiraganaHub()
    fireEvent.click(blockRow('Vowels'))
    await waitFor(() => expect(selectedBlockNames()).toHaveLength(2))

    cleanup()
    await openHiraganaHub()

    await waitFor(() => expect(selectedBlockNames()).toEqual(['Vowels', 'K-row']))
  })

  it('keeps the selection out of the way of the other session prefs', async () => {
    await openHiraganaHub()
    fireEvent.click(blockRow('Vowels'))

    await waitFor(() => {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}')
      // Both owners write this blob; neither may drop the other's fields.
      expect(prefs.blockSelectionV2).toEqual({ hiragana: [0, 1] })
      expect(prefs.script).toBe('hiragana')
    })
  })

  it('studies the vocabulary level deck, not a category deck', async () => {
    // The regression this half of Phase 3 exists to fix: both levelled sections
    // used to load a *category* deck, so blocks_for_slug's output was computed
    // and never read — a category carries no blocks of its own, it is one.
    const getDeckCards = vi.fn(async () => ({ cards }))
    const getBlockProgress = vi.fn(async () => ({ blocks }))
    window.jplearnDesktop = {
      ...makeApi(), getDeckCards, getBlockProgress,
    } as unknown as typeof window.jplearnDesktop

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    await waitFor(() => expect(getBlockProgress).toHaveBeenCalledWith('vocab_n5'))
    expect(getDeckCards).toHaveBeenCalledWith('vocab_n5')
  })

  it('renders every row inline while the deck is short', async () => {
    // Three blocks are legible at a glance, so the picker must not cost a click.
    await openHiraganaHub()

    expect(actionNames()).toEqual(['All', 'None'])
    expect(blockNames()).toEqual(['Vowels', 'K-row', 'S-row'])
    expect(document.querySelector('.hub-block-strip-summary')).toBeNull()
  })

  it('ignores a selection stored against the pre-theme block layout', async () => {
    // Selections are indices, so they only mean anything against the block list
    // they were made against. `blockSelectionV2` is the post-theme namespace;
    // anything under the old `blockSelection` key is never read at all.
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      script: 'hiragana', blockSelectionV2: { hiragana: [7, 8, 9] },
    }))

    await openHiraganaHub()

    expect(selectedBlockNames()).toEqual(['K-row'])
  })
})

/**
 * Kanji N1 carries 69 blocks and N3/N2 ~22 each. As a wrapped chip cloud that was
 * a wall, and the picker had to collapse behind a "Change" button to stay usable.
 * As a scrolling tracklist it costs a fixed amount of room whatever the deck size,
 * so every row is present from the start — nothing is behind a disclosure.
 */
describe('block tracklist on a long deck', () => {
  const manyCards = Array.from({ length: 20 }, (_, id) => ({
    id,
    character: `char${id}`,
    romaji: `r${id}`,
    meaning: `m${id}`,
    tags: ['hiragana'],
    example_sentence: null,
    dictionary_summary: null,
    is_leech: false,
    curriculum_stage: 1,
    meaning_distractor_ids: [0, 1, 2, 3].filter((i) => i !== id),
    character_distractor_ids: [0, 1, 2, 3].filter((i) => i !== id),
    note_key: `note:v1:builtin:${id.toString(16).padStart(64, '0')}`,
  }))

  const manyBlocks = Array.from({ length: 10 }, (_, index) => ({
    index,
    name: `Block ${index + 1}`,
    card_ids: [index * 2, index * 2 + 1],
    sample_chars: [], characters: [], meanings: [], romajis: [],
    mastery: 1,
    unlocked: true,
  }))

  beforeEach(() => {
    window.jplearnDesktop = {
      ...makeApi(),
      getDeckCards: async () => ({ cards: manyCards }),
      getBlockProgress: async () => ({ blocks: manyBlocks }),
    } as unknown as typeof window.jplearnDesktop
  })

  it('shows every row straight away, with no disclosure to open', async () => {
    await openHiraganaHub()

    expect(blockNames()).toHaveLength(10)
    expect(blockNames()[0]).toBe('Block 1')
    // "Change"/"Done" are gone; only the two bulk actions remain.
    expect(actionNames()).toEqual(['All', 'None'])
  })

  it('selects from a long deck without opening anything first', async () => {
    await openHiraganaHub()

    fireEvent.click(blockRow('Block 1'))
    await waitFor(() => expect(selectedBlockNames()).toEqual(['Block 1', 'Block 10']))
    expect(poolLabel()).toContain('4 cards')
  })

  it('puts every row in one scroll container', async () => {
    await openHiraganaHub()
    const rows = document.querySelector('.hub-tracklist-rows')

    // The height cap on this element is what lets the list stay open at 69
    // blocks — see App.tracklist.css.test.ts for the cap itself.
    expect(rows?.querySelectorAll('.hub-track')).toHaveLength(10)
  })
})
