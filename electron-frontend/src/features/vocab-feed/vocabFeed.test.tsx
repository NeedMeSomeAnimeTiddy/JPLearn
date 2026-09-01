import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VocabFeedPanel } from './components/VocabFeedPanel'
import { isFedDeck, useVocabFeed } from './useVocabFeed'
import type { VocabFeed } from './types'

const WORD = {
  card_id: 1, word: '二十日', reading: 'hatsuka', meaning: 'twenty days',
  theme: 'Days of the Month', unknown_kanji: 0,
}

const payload = (over: Partial<Record<string, unknown>> = {}) => ({
  slug: 'vocab_n5', budget: 10, total: 744, readable: 291, known_kanji: 67,
  started: 3, words: [WORD], ...over,
})

/** Drives the hook and prints what it produced, so the assertions read as behaviour. */
function Harness({ slug }: { slug: string }) {
  const feed = useVocabFeed(slug)
  return (
    <div>
      <span data-testid="count">{feed.words.length}</span>
      <span data-testid="budget">{feed.budget}</span>
      <span data-testid="error">{feed.error ?? ''}</span>
    </div>
  )
}

afterEach(() => {
  // This project's vitest setup does not auto-clean between tests, so without this the
  // DOM accumulates and every query finds the previous render as well as this one.
  cleanup()
  // @ts-expect-error -- the suite owns this global
  delete window.jplearnDesktop
})

describe('isFedDeck', () => {
  it.each(['vocab_n5', 'vocab_n4', 'vocab_n3', 'vocab_n2', 'vocab_n1'])(
    'the vocabulary levels are fed: %s', (slug) => expect(isFedDeck(slug)).toBe(true),
  )

  it.each(['kanji_n5', 'kanji_n1', 'hiragana', 'grammar_patterns', 'vocab_greetings'])(
    'everything with blocks is not: %s', (slug) => expect(isFedDeck(slug)).toBe(false),
  )
})

describe('useVocabFeed', () => {
  it('asks the bridge for a fed deck', async () => {
    const getVocabFeed = vi.fn(async () => payload())
    window.jplearnDesktop = { getVocabFeed } as unknown as typeof window.jplearnDesktop

    render(<Harness slug="vocab_n5" />)
    await waitFor(() => expect(getVocabFeed).toHaveBeenCalledWith('vocab_n5', undefined))
    await waitFor(() => expect(screen.getByTestId('budget').textContent).toBe('10'))
  })

  it('does not ask for a deck that still has blocks', async () => {
    // A feed is an error on a blocked deck at the bridge. A hook that fired it anyway
    // would turn one correct refusal into a console full of them.
    const getVocabFeed = vi.fn(async () => payload())
    window.jplearnDesktop = { getVocabFeed } as unknown as typeof window.jplearnDesktop

    render(<Harness slug="kanji_n5" />)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'))
    expect(getVocabFeed).not.toHaveBeenCalled()
  })

  it('says so rather than throwing when the bridge is too old to answer', async () => {
    window.jplearnDesktop = {} as unknown as typeof window.jplearnDesktop
    render(<Harness slug="vocab_n5" />)
    await waitFor(() => expect(screen.getByTestId('error').textContent).toMatch(/no vocabulary feed/i))
  })

  it('ignores a response that lands after the learner moved on', async () => {
    let release: (value: unknown) => void = () => {}
    const slow = new Promise((resolve) => { release = resolve })
    const getVocabFeed = vi.fn(async (slug: string) => {
      if (slug === 'vocab_n5') { await slow; return payload({ budget: 99 }) }
      return payload({ slug: 'vocab_n3', budget: 10 })
    })
    window.jplearnDesktop = { getVocabFeed } as unknown as typeof window.jplearnDesktop

    const view = render(<Harness slug="vocab_n5" />)
    view.rerender(<Harness slug="vocab_n3" />)
    release(null)
    await waitFor(() => expect(screen.getByTestId('budget').textContent).toBe('10'))
    expect(screen.getByTestId('budget').textContent).not.toBe('99')
  })
})

describe('VocabFeedPanel', () => {
  const base: VocabFeed = {
    words: [WORD], budget: 10, total: 744, readable: 291, knownKanji: 67, started: 3,
    loading: false, error: null, setBudget: () => {},
  }

  it('shows the word with its denominator', () => {
    render(<VocabFeedPanel feed={base} />)
    expect(screen.getByText('二十日')).toBeTruthy()
    expect(screen.getByText(/291 of 744 readable/)).toBeTruthy()
    expect(screen.getByText(/67 kanji known/)).toBeTruthy()
  })

  it('a budget of zero reads as a choice, not an empty state', () => {
    render(<VocabFeedPanel feed={{ ...base, words: [], budget: 0 }} />)
    expect(screen.getByText(/reviews only/i)).toBeTruthy()
  })

  it('a finished level says so instead', () => {
    render(<VocabFeedPanel feed={{ ...base, words: [], started: 744 }} />)
    expect(screen.getByText(/every word in this level/i)).toBeTruthy()
  })

  it('changing the budget goes through the hook rather than the list', () => {
    const setBudget = vi.fn()
    render(<VocabFeedPanel feed={{ ...base, setBudget }} />)
    screen.getByRole('button', { name: /20 new words a day/i }).click()
    expect(setBudget).toHaveBeenCalledWith(20)
  })
})
