import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SrsDraftReviewPanel } from './SrsDraftReviewPanel'
import type { SrsDraftState } from '../types'

afterEach(() => {
  cleanup()
})

function draft(overrides: Partial<SrsDraftState> = {}): SrsDraftState {
  return {
    id: 'srs-coffee',
    front: 'コーヒー',
    back: 'coffee',
    reading: 'こーひー',
    notes: '',
    source: 'authored',
    status: 'pending',
    ...overrides,
  }
}

describe('SrsDraftReviewPanel', () => {
  it('renders only pending drafts and lets the learner edit fields before accepting', () => {
    const onEdit = vi.fn()
    const onAccept = vi.fn()
    render(
      <SrsDraftReviewPanel
        drafts={[draft(), draft({ id: 'srs-dismissed', status: 'dismissed' })]}
        error={null}
        onEdit={onEdit}
        onAccept={onAccept}
        onDismiss={vi.fn()}
        onSkipAll={vi.fn()}
        onReplay={vi.fn()}
        onReturnToTutorMenu={vi.fn()}
      />,
    )

    // Only the pending draft renders as an editable card.
    expect(screen.getAllByRole('button', { name: /accept card/i })).toHaveLength(1)

    const frontInput = screen.getByDisplayValue('コーヒー')
    fireEvent.change(frontInput, { target: { value: 'ホットコーヒー' } })
    expect(onEdit).toHaveBeenCalledWith('srs-coffee', { front: 'ホットコーヒー' })

    fireEvent.click(screen.getByRole('button', { name: /accept card: コーヒー/i }))
    expect(onAccept).toHaveBeenCalledWith('srs-coffee')
  })

  it('shows an empty state when there are no pending drafts, and hides Skip all', () => {
    render(
      <SrsDraftReviewPanel
        drafts={[draft({ status: 'accepted' })]}
        error={null}
        onEdit={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        onSkipAll={vi.fn()}
        onReplay={vi.fn()}
        onReturnToTutorMenu={vi.fn()}
      />,
    )

    expect(screen.getByText('No drafts left to review.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip all' })).toBeNull()
  })

  it('dismiss never triggers a save call and only the local callback', () => {
    const onDismiss = vi.fn()
    const onAccept = vi.fn()
    render(
      <SrsDraftReviewPanel
        drafts={[draft()]}
        error={null}
        onEdit={vi.fn()}
        onAccept={onAccept}
        onDismiss={onDismiss}
        onSkipAll={vi.fn()}
        onReplay={vi.fn()}
        onReturnToTutorMenu={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /dismiss card/i }))
    expect(onDismiss).toHaveBeenCalledWith('srs-coffee')
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('Skip all calls onSkipAll once for every pending draft', () => {
    const onSkipAll = vi.fn()
    render(
      <SrsDraftReviewPanel
        drafts={[draft(), draft({ id: 'srs-tea', front: '紅茶' })]}
        error={null}
        onEdit={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        onSkipAll={onSkipAll}
        onReplay={vi.fn()}
        onReturnToTutorMenu={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Skip all' }))
    expect(onSkipAll).toHaveBeenCalledOnce()
  })

  it('shows a review error and still offers Replay/Return actions', () => {
    const onReturnToTutorMenu = vi.fn()
    render(
      <SrsDraftReviewPanel
        drafts={[draft()]}
        error="Failed to save this SRS draft."
        onEdit={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        onSkipAll={vi.fn()}
        onReplay={vi.fn()}
        onReturnToTutorMenu={onReturnToTutorMenu}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('Failed to save this SRS draft.')
    fireEvent.click(screen.getByRole('button', { name: 'Return to Tutor menu' }))
    expect(onReturnToTutorMenu).toHaveBeenCalledOnce()
  })
})
