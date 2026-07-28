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

function blockChip(name: string): HTMLButtonElement {
  const chips = Array.from(document.querySelectorAll('.hub-block-chip')) as HTMLButtonElement[]
  const chip = chips.find((c) => c.textContent?.trim() === name)
  if (!chip) throw new Error(`Block chip not found: ${name}. Have: ${chips.map((c) => c.textContent).join(', ')}`)
  return chip
}

function selectedChipNames(): string[] {
  return (Array.from(document.querySelectorAll('.hub-block-chip')) as HTMLButtonElement[])
    .filter((c) => c.getAttribute('aria-pressed') === 'true')
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
    expect(selectedChipNames()).toEqual(['K-row'])
    expect(poolLabel()).toContain('2 cards')
  })

  it('adds a second block and unions the pool', async () => {
    await openHiraganaHub()
    fireEvent.click(blockChip('Vowels'))

    await waitFor(() => expect(selectedChipNames()).toEqual(['Vowels', 'K-row']))
    expect(poolLabel()).toContain('4 cards')
    expect(poolLabel()).toContain('2 blocks')
  })

  it('deselects a block that is clicked again', async () => {
    await openHiraganaHub()
    fireEvent.click(blockChip('Vowels'))
    await waitFor(() => expect(selectedChipNames()).toHaveLength(2))

    fireEvent.click(blockChip('K-row'))
    await waitFor(() => expect(selectedChipNames()).toEqual(['Vowels']))
    expect(poolLabel()).toContain('2 cards')
  })

  it('renders a locked block as a disabled chip that cannot be selected', async () => {
    await openHiraganaHub()
    const locked = blockChip('S-row')

    expect(locked.disabled).toBe(true)
    fireEvent.click(locked)
    await waitFor(() => expect(selectedChipNames()).toEqual(['K-row']))
  })

  it('selects every unlocked block but never a locked one', async () => {
    await openHiraganaHub()
    fireEvent.click(blockChip('All'))

    await waitFor(() => expect(selectedChipNames()).toEqual(['Vowels', 'K-row']))
    expect(poolLabel()).toContain('4 cards')
  })

  it('clearing the selection studies the whole deck', async () => {
    await openHiraganaHub()
    fireEvent.click(blockChip('None'))

    await waitFor(() => expect(selectedChipNames()).toEqual([]))
    // All six cards, including the two behind the locked block: an empty
    // selection means "no block filter", not "no cards".
    expect(poolLabel()).toContain('6 cards')
    expect(poolLabel()).toContain('Whole deck')
  })

  it('persists the selection across a remount', async () => {
    await openHiraganaHub()
    fireEvent.click(blockChip('Vowels'))
    await waitFor(() => expect(selectedChipNames()).toHaveLength(2))

    cleanup()
    await openHiraganaHub()

    await waitFor(() => expect(selectedChipNames()).toEqual(['Vowels', 'K-row']))
  })

  it('keeps the selection out of the way of the other session prefs', async () => {
    await openHiraganaHub()
    fireEvent.click(blockChip('Vowels'))

    await waitFor(() => {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}')
      // Both owners write this blob; neither may drop the other's fields.
      expect(prefs.blockSelection).toEqual({ hiragana: [0, 1] })
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

  it('ignores a stored selection the deck no longer has room for', async () => {
    // Issue #78 changed how many blocks these decks have, so a stored index can
    // outlive the deck it was made against.
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      script: 'hiragana', blockSelection: { hiragana: [7, 8, 9] },
    }))

    await openHiraganaHub()

    expect(selectedChipNames()).toEqual(['K-row'])
  })
})
