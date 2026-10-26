import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as axeCore from 'axe-core'
import { PuzzleEnding } from './PuzzleEnding'

const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

const missed = [
  { word: { deck_slug: 'n5', deck_name: 'N5', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' }, miss_count: 1 },
  { word: { deck_slug: 'n5', deck_name: 'N5', card_id: 2, character: '犬', romaji: 'inu', meaning: 'dog', source: 'deck' }, miss_count: 1 },
]

afterEach(cleanup)

/* PORTED FROM `GameResultsOverlay`, which this replaces: the result is the work cell of the sheet
   now rather than a panel of its own, and it is still a labelled, non-modal region. */
describe('PuzzleEnding', () => {
  it('is a labelled non-modal region with keyboard-operable actions', async () => {
    const onDone = vi.fn()
    const { container } = render(
      <PuzzleEnding mode="daily" puzzle="Match Pairs" title="Match Pairs complete" message="Done." score={2} count={2} clipboard={{ writeText: async () => undefined }} onDone={onDone} />,
    )

    const results = screen.getByRole('region', { name: 'Match Pairs complete' })
    expect(results.getAttribute('aria-modal')).toBeNull()
    const back = screen.getByRole('button', { name: /back to the road/i })
    back.focus()
    fireEvent.click(back)
    expect(onDone).toHaveBeenCalledOnce()
    expect((await runAxe(container)).violations).toEqual([])
  })

  it('leads with REVIEW MISSED · n in vermilion when a daily run missed words, with Share as the calm second slab', async () => {
    const onReviewMissedWords = vi.fn(async () => undefined)
    render(
      <PuzzleEnding mode="daily" puzzle="Typing Blitz" title="Typing Blitz complete" message="Done." score={0} count={2} clipboard={{ writeText: async () => undefined }} onDone={vi.fn()} missedWords={missed} onReviewMissedWords={onReviewMissedWords} />,
    )

    const review = screen.getByRole('button', { name: /review missed words · 2/i })
    expect(review.textContent).toContain('REVIEW MISSED · 2')
    expect(review.classList.contains('calm')).toBe(false)
    expect(screen.getByRole('button', { name: /share result/i }).classList.contains('calm')).toBe(true)
    expect(screen.getByRole('list', { name: 'MISSED' }).querySelectorAll('li.bad')).toHaveLength(2)

    fireEvent.click(review)
    await waitFor(() => expect(onReviewMissedWords).toHaveBeenCalledWith(missed))
  })

  it('shows the review failing and lets it be pressed again', async () => {
    const onReviewMissedWords = vi.fn(async () => { throw new Error('no') })
    render(
      <PuzzleEnding mode="daily" puzzle="Typing Blitz" title="Typing Blitz complete" message="Done." score={0} count={2} clipboard={{ writeText: async () => undefined }} onDone={vi.fn()} missedWords={missed} onReviewMissedWords={onReviewMissedWords} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /review missed words/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not open missed-word review/i)
    expect((screen.getByRole('button', { name: /review missed words/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shares a result that names the puzzle it came from', async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) }
    render(
      <PuzzleEnding mode="practice" puzzle="Word Search" title="Word Search complete" message="Done." score={3} count={4} clipboard={clipboard} onDone={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /share result/i }))
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('JPLearn Word Search: 3/4 (practice).'))
  })

  it('offers practice runs no review slab, only the road back', () => {
    render(
      <PuzzleEnding mode="practice" puzzle="Typing Blitz" title="Typing Blitz complete" message="Done." score={0} count={2} clipboard={{ writeText: async () => undefined }} onDone={vi.fn()} missedWords={missed} onReviewMissedWords={vi.fn(async () => undefined)} />,
    )
    expect(screen.queryByRole('button', { name: /review missed/i })).toBeNull()
    expect(screen.getByRole('button', { name: /back to the road/i })).toBeTruthy()
  })
})
