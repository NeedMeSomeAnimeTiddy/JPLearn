import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScenarioHistoryPanel } from './ScenarioHistoryPanel'
import type { ScenarioHistoryEntry } from '../types'

afterEach(() => {
  cleanup()
})

function entry(overrides: Partial<ScenarioHistoryEntry> = {}): ScenarioHistoryEntry {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    scenarioId: 'cafe-order',
    scenarioTitle: 'Order at a Cafe',
    learnerLevel: 'beginner',
    completedAtUtc: '2026-07-21T00:05:00.000Z',
    summary: {
      objectives: [{ id: 'obj-order', label: 'Order a drink', status: 'met' }],
      corrections: [],
      vocabularyPractised: ['コーヒー'],
      grammarPractised: [],
      recurringMistakes: [],
      suggestedNextSteps: [],
    },
    transcript: [],
    ...overrides,
  }
}

describe('ScenarioHistoryPanel', () => {
  it('shows a loading state', () => {
    render(<ScenarioHistoryPanel entries={null} loading error={null} onDelete={vi.fn()} onClearAll={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('Loading')
  })

  it('shows an empty state when there are no completed sessions', () => {
    render(<ScenarioHistoryPanel entries={[]} loading={false} error={null} onDelete={vi.fn()} onClearAll={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('No completed sessions yet.')).toBeTruthy()
  })

  it('shows an error state', () => {
    render(<ScenarioHistoryPanel entries={null} loading={false} error="Failed to load scenario history." onDelete={vi.fn()} onClearAll={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toContain('Failed to load scenario history.')
  })

  it('opens an entry to show its summary, and Back returns to select', () => {
    const onBack = vi.fn()
    render(<ScenarioHistoryPanel entries={[entry()]} loading={false} error={null} onDelete={vi.fn()} onClearAll={vi.fn()} onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText(/Order a drink — met/)).toBeTruthy()
    expect(screen.getByText('コーヒー')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to scenario list' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('requires confirmation before deleting one entry', () => {
    const onDelete = vi.fn()
    render(<ScenarioHistoryPanel entries={[entry()]} loading={false} error={null} onDelete={onDelete} onClearAll={vi.fn()} onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /delete session/i }))
    const confirmBanner = screen.getByRole('alertdialog', { name: 'Confirm deleting this session' })
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(onDelete).toHaveBeenCalledWith(entry().id)
    expect(confirmBanner).toBeTruthy()
  })

  it('requires confirmation before clearing all entries', () => {
    const onClearAll = vi.fn()
    render(<ScenarioHistoryPanel entries={[entry()]} loading={false} error={null} onDelete={vi.fn()} onClearAll={onClearAll} onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear all' }))
    expect(onClearAll).toHaveBeenCalledOnce()
  })
})
