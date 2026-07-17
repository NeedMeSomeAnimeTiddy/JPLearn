import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { KanjiDetailPayload } from '../../../generated/types'
import type { KanjiDetailRequest, KanjiDetailRequestState } from '../types'
import { KanjiDetailPanel } from './KanjiDetailPanel'

const useKanjiDetail = vi.hoisted(() => vi.fn())

vi.mock('../useKanjiDetail', () => ({ useKanjiDetail }))
vi.mock('./KanjiStrokeAnimation', () => ({
  KanjiStrokeAnimation: ({ character }: { character: string }) => (
    <button type="button">Replay stroke order for {character}</button>
  ),
}))

const detail: KanjiDetailPayload = {
  character: '日',
  meanings: ['day', 'sun'],
  on_readings: [
    {
      reading: 'ニチ',
      examples: [{ word: '日', reading: 'にち', meanings: ['day'], is_common: true }],
    },
  ],
  kun_readings: [{ reading: 'ひ', examples: [] }],
  radicals: [{ position: 0, radical: '日', stroke_count: 4, code: 'js72' }],
  jlpt_level: 'N5',
  jlpt_level_source: 'kanjidic',
  stroke_count: 4,
  classical_radical_number: 72,
  tags: ['kanji', 'n5'],
  categories: ['Kanji N5'],
  compounds: [{ word: '日本', reading: 'にほん', meanings: ['Japan'], is_common: true }],
  has_more_compounds: false,
  source: 'offline_dictionary',
}

function request(state: KanjiDetailRequestState): KanjiDetailRequest {
  return { ...state, retry: vi.fn() }
}

afterEach(() => {
  cleanup()
  useKanjiDetail.mockReset()
  document.body.replaceChildren()
})

describe('KanjiDetailPanel', () => {
  it('uses accessible dialog semantics, traps Tab, closes on Escape/backdrop, and restores focus', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open 日'
    document.body.append(trigger)
    trigger.focus()
    const onClose = vi.fn()
    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail }))

    const view = render(<KanjiDetailPanel character="日" onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: /kanji details: 日/i })
    const closeButton = screen.getByRole('button', { name: /close kanji details for 日/i })
    const replayButton = screen.getByRole('button', { name: /replay stroke order for 日/i })

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(closeButton))

    replayButton.focus()
    fireEvent.keyDown(replayButton, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(replayButton)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByTestId('kanji-detail-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)

    view.unmount()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders compact sectioned offline fields, verified examples, and missing per-section data', () => {
    useKanjiDetail.mockReturnValue(request({
      status: 'ready',
      detail: {
        ...detail,
        radicals: [],
        compounds: [],
        on_readings: [{ reading: 'ニチ', examples: [] }],
        kun_readings: [],
      },
    }))

    render(<KanjiDetailPanel character="日" onClose={vi.fn()} />)

    expect(screen.getByText('day · sun')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Readings' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Radicals and components' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Compounds' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Stroke order' })).toBeTruthy()
    expect(screen.getByText('On’yomi')).toBeTruthy()
    expect(screen.getByText('No verified example in the offline dictionary.')).toBeTruthy()
    expect(screen.queryByText('Japan')).toBeNull()
    expect(screen.getAllByText('Not available in the offline data.').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Kanji N5')).toBeTruthy()
  })

  it('renders loading and offline-index-unavailable statuses', () => {
    useKanjiDetail.mockReturnValue(request({ status: 'loading', message: 'Loading kanji details…' }))
    const { rerender } = render(<KanjiDetailPanel character="日" onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('Loading kanji details')

    useKanjiDetail.mockReturnValue(request({
      status: 'unavailable',
      message: 'Kanji details are unavailable. Re-download the offline dictionary to continue.',
    }))
    rerender(<KanjiDetailPanel character="日" onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/re-download the offline dictionary/i)
  })

  it('offers retry for unexpected loading errors', () => {
    const retry = vi.fn()
    useKanjiDetail.mockReturnValue({
      status: 'error',
      message: 'Kanji details could not be loaded. Please try again.',
      retry,
    })

    render(<KanjiDetailPanel character="日" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
