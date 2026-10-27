/**
 * Leech focus: what the drill screen counts, and how long "Up next" may turn it on.
 *
 * F8 (audit 3): with focus on, the pre-start labels counted the whole deck's leeches while the
 * session drew only the selected blocks' leeches. They now count the pool the session uses.
 *
 * Q2 (audit 3), Robbie's answer "Only for that session": the "Problem items" card in Up next turns
 * focus on for the session it starts, unsaved. Afterwards the learner's own setting applies again.
 * Pressing F or the switch is the learner's own choice and is still saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openDeck, openGame } from './test-entry'
import App from './App'
import { PREFS_STORAGE_KEY } from './lib/appStorage'
import { baseDesktopApi } from './test-fixtures/desktopApi'

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

const KANA = ['あ', 'い', 'う', 'え', 'お', 'か']

function makeCards(leechIds: number[]) {
  const ids = KANA.map((_, id) => id)
  return KANA.map((character, id) => ({
    id,
    character,
    romaji: `r${id}`,
    meaning: `m${id}`,
    tags: ['hiragana'],
    example_sentence: null,
    dictionary_summary: null,
    is_leech: leechIds.includes(id),
    curriculum_stage: 1,
    meaning_distractor_ids: ids.filter((i) => i !== id),
    character_distractor_ids: ids.filter((i) => i !== id),
    note_key: `note:v1:builtin:${id.toString(16).padStart(64, '0')}`,
  }))
}

/** Two unlocked blocks and a locked third, as the deck screen gates them. */
const blocks = [
  { index: 0, name: 'Vowels', card_ids: [0, 1], sample_chars: [], characters: [], meanings: [], romajis: [], mastery: 1, unlocked: true },
  { index: 1, name: 'K-row', card_ids: [2, 3], sample_chars: [], characters: [], meanings: [], romajis: [], mastery: 0.5, unlocked: true },
  { index: 2, name: 'S-row', card_ids: [4, 5], sample_chars: [], characters: [], meanings: [], romajis: [], mastery: 0, unlocked: false },
]

/* A study queue that never answers holds a start in its "ONE MOMENT" state for the round queue's
   1.2 s timeout, which is the window in which the pre-start labels can be read. */
const neverAnswers = () => new Promise<never>(() => undefined)

function storedPrefs(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}')
}

/** The drill screen's two pre-start counts: "DECK n CARDS" and "n cards available". */
function shownCounts(): { deck: string; available: boolean } {
  return {
    deck: document.querySelector('.rd-src')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    available: document.body.textContent?.includes('cards available') ?? false,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('the leech-focus card count (audit 3, F8)', () => {
  it('counts the leeches inside the selected block, which is what the session plays', async () => {
    /* Leeches are card 1 (Vowels) and cards 4 and 5 (the locked S-row). With Vowels selected the
       session plays card 1 alone; the label used to count all three. */
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ leechFocusEnabled: true }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getDeckCards: async () => ({ slug: 'hiragana', name: 'Hiragana', cards: makeCards([1, 4, 5]) }),
      getBlockProgress: async () => ({ slug: 'hiragana', blocks }),
      getStudyQueue: neverAnswers,
    } as unknown as typeof window.jplearnDesktop

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    openDeck('Hiragana')
    await waitFor(() => expect(document.querySelector('.dk-here')).not.toBeNull())
    const vowels = Array.from(document.querySelectorAll('.dk-row'))
      .find((row) => row.querySelector('.t')?.textContent?.trim() === 'Vowels')
    fireEvent.click(vowels as Element)
    await waitFor(() => expect(document.querySelector('.dk-name')?.textContent?.trim()).toBe('Vowels'))
    fireEvent.click(document.querySelector('.dk-slab') as Element)

    await waitFor(() => expect(shownCounts().deck).toBe('DECK 1 CARDS'))
    expect(document.body.textContent).toContain('1 cards available')

    /* and once the held queue times out the session plays that leech, card 1. Waiting for it also
       keeps this start from finishing inside the next test and saving its prefs there. */
    await waitFor(() => expect(document.querySelector('.rd-focus')?.textContent?.trim()).toBe('い'), { timeout: 4000 })
  })
})

/* Cards 0 and 1 are the leeches. (One leech alone is too few cards for Meaning Match.) */
const LEECH_PROMPTS = ['あ', 'い']

function problemItemsApi(queue: { hold: boolean }) {
  return {
    ...baseDesktopApi,
    getDeckCards: async () => ({ slug: 'hiragana', name: 'Hiragana', cards: makeCards([0, 1]) }),
    getStudyQueue: async () => {
      if (queue.hold) return neverAnswers()
      return { ok: true, queue: { slug: 'hiragana', card_ids: [], indices: [], buckets_due: 0, buckets_leech: 0, buckets_new: 0, buckets_review: 0 } }
    },
    getRecommendations: async () => ({
      recommendations: [{
        node_id: 'hiragana',
        display_label: 'Review your problem items',
        review_count: 2,
        difficulty: 'normal',
        reason: 'leeches_detected',
        priority: 1,
        section: 'hiragana',
        minigame: 'meaning_match',
        section_label: 'Hiragana',
        leech_focus_enabled: true,
      }],
      learner_stage: 'starter',
      stage_label: 'Starter-safe',
      session_minutes: 10,
      session_note: '',
    }),
  } as unknown as typeof window.jplearnDesktop
}

const continueButton = () =>
  screen.queryByRole('button', { name: /continue immediately/i }) as HTMLButtonElement | null

/** Answer `rounds` Meaning Match rounds correctly, checking each prompt is one of `prompts`. */
async function answerRounds(rounds: number, prompts: string[]): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await waitFor(() => {
      expect(continueButton()).toBeNull()
      expect(prompts).toContain(document.querySelector('.rd-focus')?.textContent?.trim())
      expect(document.querySelectorAll('.rd-slip').length).toBeGreaterThan(0)
    }, { timeout: 4000 })
    const answer = `m${KANA.indexOf(document.querySelector('.rd-focus')?.textContent?.trim() ?? '')}`
    const correct = Array.from(document.querySelectorAll('.rd-slip'))
      .find((slip) => slip.querySelector('b')?.textContent?.trim() === answer)
    fireEvent.click(correct as Element)
    /* the feedback card holds until its answer has saved */
    await waitFor(() => expect(continueButton()?.disabled).toBe(false), { timeout: 4000 })
    fireEvent.click(continueButton() as HTMLButtonElement)
  }
}

describe('"Problem items" from Up next (audit 3, Q2)', () => {
  it('plays only problem cards for its session, then leaves the learner\'s own setting', async () => {
    /* the learner's own focus setting is off; the run is the shortest preset, eight rounds */
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      script: 'hiragana', game: 'meaning_match', leechFocusEnabled: false, sessionTargetItems: 8,
    }))
    const queue = { hold: false }
    window.jplearnDesktop = problemItemsApi(queue)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /UP NEXT/i }))

    /* every round of the session it starts is a leech, and nothing is saved */
    await answerRounds(8, LEECH_PROMPTS)
    await screen.findByText(/RUN IT AGAIN/, {}, { timeout: 4000 })

    /* the saved preference is still the learner's own */
    expect(storedPrefs().leechFocusEnabled).toBe(false)

    /* and the next drill draws from every card, not the two leeches */
    queue.hold = true
    await openGame('Hiragana', 'Meaning Match')
    await waitFor(() => expect(shownCounts().deck).toBe('DECK 6 CARDS'))
    expect(storedPrefs().leechFocusEnabled).toBe(false)
    /* let the held start finish here rather than inside the next test */
    await waitFor(() => expect(document.querySelector('.rd-slip')).not.toBeNull(), { timeout: 4000 })
    expect(storedPrefs().leechFocusEnabled).toBe(false)
  })

  it('keeps focus for its whole session when launched while another drill was still live', async () => {
    /* Back from a live round leaves that session running. The hero then ends it and starts its own
       in one press, so the end of the old one must not drop the new one's focus. Five leech rounds
       in a row from a six-card pool would be a 1-in-81 fluke without it. */
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      script: 'hiragana', game: 'meaning_match', leechFocusEnabled: false, sessionTargetItems: 8,
    }))
    window.jplearnDesktop = problemItemsApi({ hold: false })

    render(<App />)
    await openGame('Hiragana', 'Meaning Match')
    await answerRounds(1, KANA)
    await waitFor(() => expect(document.querySelector('.rd-focus')).not.toBeNull(), { timeout: 4000 })
    fireEvent.keyDown(window, { key: 'Escape' })

    fireEvent.click(await screen.findByRole('button', { name: /UP NEXT/i }))
    await answerRounds(5, LEECH_PROMPTS)
    expect(storedPrefs().leechFocusEnabled).toBe(false)
  })
})
