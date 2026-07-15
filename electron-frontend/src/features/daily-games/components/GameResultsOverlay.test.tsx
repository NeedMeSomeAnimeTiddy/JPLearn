import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as axeCore from 'axe-core'
import { GameResultsOverlay } from './GameResultsOverlay'

const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

describe('GameResultsOverlay', () => {
  it('is a labelled non-modal region with keyboard-operable actions', async () => {
    const onDone = vi.fn()
    const { container } = render(<GameResultsOverlay mode="daily" score={2} pairCount={2} clipboard={{ writeText: async () => undefined }} onDone={onDone} />)

    const results = screen.getByRole('region', { name: 'Match Pairs complete' })
    expect(results.getAttribute('aria-modal')).toBeNull()
    const done = screen.getByRole('button', { name: 'Done' })
    done.focus()
    fireEvent.click(done)
    expect(onDone).toHaveBeenCalledOnce()
    expect((await runAxe(container)).violations).toEqual([])
  })
})
