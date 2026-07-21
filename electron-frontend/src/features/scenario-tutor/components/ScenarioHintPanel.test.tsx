import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScenarioHintPanel } from './ScenarioHintPanel'
import type { ScenarioHint } from '../types'

afterEach(() => {
  cleanup()
})

const LADDER: ScenarioHint[] = [
  { en: 'Name a drink, then ask for it politely.' },
  { en: 'The pattern is:', ja: '〜をください', reading: '〜をください', romaji: '~ o kudasai' },
  { en: 'For example:', ja: 'コーヒーをください', reading: 'こーひーをください', romaji: 'koohii o kudasai' },
]

describe('ScenarioHintPanel', () => {
  it('renders nothing when the node has no authored hints', () => {
    const { container } = render(
      <ScenarioHintPanel hints={[]} revealedLevel={null} onRevealHint={vi.fn()} resetKey="n-1" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('starts as a closed trigger button — nothing is visible until clicked', () => {
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={null} onRevealHint={vi.fn()} resetKey="n-1" />)

    const trigger = screen.getByRole('button', { name: 'Need a hint?' })
    expect(trigger).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('koohii o kudasai')).toBeNull()
  })

  it('opens a popover on click and closes again on a second click', () => {
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={1} onRevealHint={vi.fn()} resetKey="n-1" />)
    const trigger = screen.getByRole('button', { name: 'Need a hint?' })

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Hints for this turn' })).toBeTruthy()

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows only the steps unlocked so far, each Japanese example inline with romaji', () => {
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={1} onRevealHint={vi.fn()} resetKey="n-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))

    expect(screen.getByText('Name a drink, then ask for it politely.')).toBeTruthy()
    expect(screen.getByText('~ o kudasai', { exact: false })).toBeTruthy()
    // Step 2 (index 2) is not unlocked yet.
    expect(screen.queryByText('koohii o kudasai', { exact: false })).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('reveals another step via the in-popover button, and shows a count badge on the trigger', () => {
    const onRevealHint = vi.fn()
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={0} onRevealHint={onRevealHint} resetKey="n-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))

    fireEvent.click(screen.getByRole('button', { name: 'Show another hint' }))
    expect(onRevealHint).toHaveBeenCalledOnce()
  })

  it('disables "reveal more" once the whole ladder is shown', () => {
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={2} onRevealHint={vi.fn()} resetKey="n-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))
    expect(screen.getByRole('button', { name: 'All hints shown' }).hasAttribute('disabled')).toBe(true)
  })

  it('closes automatically when the turn changes (resetKey changes)', () => {
    const { rerender } = render(<ScenarioHintPanel hints={LADDER} revealedLevel={0} onRevealHint={vi.fn()} resetKey="n-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    rerender(<ScenarioHintPanel hints={LADDER} revealedLevel={null} onRevealHint={vi.fn()} resetKey="n-2" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', () => {
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={0} onRevealHint={vi.fn()} resetKey="n-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is disabled (trigger cannot open) while a leave/restart confirmation is pending', () => {
    render(<ScenarioHintPanel hints={LADDER} revealedLevel={null} onRevealHint={vi.fn()} disabled resetKey="n-1" />)
    expect(screen.getByRole('button', { name: 'Need a hint?' }).hasAttribute('disabled')).toBe(true)
  })
})
