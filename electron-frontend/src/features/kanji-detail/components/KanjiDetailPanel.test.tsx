import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { KanjiDetailPayload } from '../../../generated/types'
import type { KanjiDetailRequest, KanjiDetailRequestState } from '../types'
import { KanjiDetailPanel } from './KanjiDetailPanel'

const useKanjiDetail = vi.hoisted(() => vi.fn())
const strokeProps = vi.hoisted(() => vi.fn())

vi.mock('../useKanjiDetail', () => ({ useKanjiDetail }))
vi.mock('./KanjiStrokeAnimation', () => ({
  KanjiStrokeAnimation: (props: { character: string; replaySignal?: number }) => {
    strokeProps(props)
    return <button type="button">Replay stroke order for {props.character}</button>
  },
}))

/* the dictionary's run for 漢, as the approved board draws it */
const dictionary: KanjiDetailPayload = {
  character: '漢',
  meanings: ['Sino-', 'China'],
  on_readings: [
    { reading: 'カン', examples: [{ word: '漢', reading: 'かん', meanings: ['China'], is_common: true }] },
  ],
  kun_readings: [],
  radicals: [],
  components: ['汁', '艾', '口', '一', '大', '二'],
  jlpt_level: 'N3',
  jlpt_level_source: 'kanjidic',
  stroke_count: 13,
  classical_radical_number: 85,
  tags: ['kanji', 'n4'],
  categories: ['Kanji N4'],
  compounds: [
    { word: '漢詩', reading: 'かんし', meanings: ['Chinese poem'], is_common: false },
    { word: '漢語', reading: 'かんご', meanings: ['Sino-Japanese word'], is_common: true },
    { word: '漢字', reading: 'かんじ', meanings: ['kanji'], is_common: true },
    { word: '漢文', reading: 'かんぶん', meanings: ['Chinese classical writing'], is_common: true },
    { word: '漢方', reading: 'かんぽう', meanings: ['Chinese medicine'], is_common: false },
    { word: '漢和', reading: 'かんわ', meanings: ['Chinese-Japanese'], is_common: false },
  ],
  has_more_compounds: true,
  source: 'offline_dictionary',
}

/* and the deck's for 語, which is the state Robbie sees */
const deckOnly: KanjiDetailPayload = {
  ...dictionary,
  character: '語',
  meanings: [],
  on_readings: [],
  kun_readings: [],
  components: ['言', '口', '五'],
  jlpt_level: 'N5',
  jlpt_level_source: 'deck',
  stroke_count: null,
  tags: ['kanji', 'n5'],
  categories: ['Kanji N5'],
  compounds: [],
  has_more_compounds: false,
  source: 'deck_only',
}

function request(state: KanjiDetailRequestState): KanjiDetailRequest {
  return { ...state, retry: vi.fn() }
}

afterEach(() => {
  cleanup()
  useKanjiDetail.mockReset()
  strokeProps.mockReset()
  document.body.replaceChildren()
})

describe('the deck-only sheet', () => {
  it('draws what needs the dictionary as hatched absences, and offers no settings key', () => {
    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail: deckOnly }))
    render(<KanjiDetailPanel character="語" onClose={vi.fn()} backTo="Look it up" />)

    expect(screen.getByText(/FROM THE DECK, NOT THE DICTIONARY/)).toBeTruthy()
    expect(screen.getByText('4 NEED THE DICTIONARY')).toBeTruthy()
    for (const label of ['READINGS', 'MEANINGS', 'COMPOUNDS', 'STROKE COUNT']) {
      expect(screen.getByText(label).closest('.kx-gh')).toBeTruthy()
    }
    expect(screen.getByText(/need the offline dictionary/i)).toBeTruthy()
    expect(screen.getByText('TAGGED FROM THE DECK')).toBeTruthy()
    /* the parts ship with the app, so this column says something without any download */
    expect(screen.getByText('3 PARTS')).toBeTruthy()
    expect(screen.getByText('言')).toBeTruthy()
    expect(screen.getByText('WORKS WITHOUT THE DICTIONARY')).toBeTruthy()
    /* Robbie dropped the ',' settings shortcut from this sheet */
    expect(document.body.textContent).not.toMatch(/PRESS\s*,/)
    expect(document.body.textContent).not.toMatch(/, SETTINGS/)
  })
})

describe('the dictionary sheet', () => {
  it('fills the same three columns with readings, compounds and parts, folding overflow to a count', () => {
    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail: dictionary }))
    render(<KanjiDetailPanel character="漢" onClose={vi.fn()} />)

    expect(screen.getByText(/FROM THE DICTIONARY/)).toBeTruthy()
    expect(screen.getByText('Sino- · China')).toBeTruthy()
    expect(screen.getByText('1 ON · 0 KUN')).toBeTruthy()
    expect(screen.getByText('カン')).toBeTruthy()
    /* the kun-reading the dictionary does not have is a row that says so, not a missing row */
    expect(screen.getByText('Not available in the offline data.')).toBeTruthy()
    /* two reading rows leave four compounds, common ones first, and the rest is a count */
    expect(screen.getByText('4 OF 6+ · COMMON FIRST')).toBeTruthy()
    const compounds = Array.from(document.querySelectorAll('.kx-cp b')).map((b) => b.textContent)
    expect(compounds).toEqual(['漢語', '漢字', '漢文', '漢詩'])
    expect(screen.getByText('6 PARTS')).toBeTruthy()
    expect(screen.getByText('13 STROKES')).toBeTruthy()
    expect(screen.queryByText(/NEED THE DICTIONARY/)).toBeNull()
  })
})

describe('KanjiDetailPanel', () => {
  it('is a modal dialog that takes focus, traps Tab, closes on Escape and the scrim, and restores focus', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open 漢'
    document.body.append(trigger)
    trigger.focus()
    const onClose = vi.fn()
    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail: dictionary }))

    const view = render(<KanjiDetailPanel character="漢" onClose={onClose} backTo="Look it up" />)
    const dialog = screen.getByRole('dialog', { name: 'Kanji details: 漢' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const sheet = dialog.querySelector('.kx-sheet') as HTMLElement
    await waitFor(() => expect(document.activeElement).toBe(sheet))

    const esc = dialog.querySelector('.kx-esc') as HTMLElement
    expect(esc.getAttribute('aria-label')).toBe('Back to Look it up')
    const replay = screen.getByRole('button', { name: /replay stroke order for 漢/i })
    replay.focus()
    fireEvent.keyDown(replay, { key: 'Tab' })
    expect(document.activeElement).toBe(esc)
    fireEvent.keyDown(esc, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(replay)

    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog.querySelector('.lk-scrim') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(dialog.querySelector('.mx-hint')?.textContent).toContain('BACK TO LOOK IT UP')

    view.unmount()
    expect(document.activeElement).toBe(trigger)
  })

  it('replays the strokes on ENTER, and leaves ENTER on a button to the button', () => {
    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail: dictionary }))
    render(<KanjiDetailPanel character="漢" onClose={vi.fn()} />)
    const sheet = document.querySelector('.kx-sheet') as HTMLElement

    fireEvent.keyDown(sheet, { key: 'Enter' })
    expect(strokeProps).toHaveBeenLastCalledWith(expect.objectContaining({ replaySignal: 1 }))
    fireEvent.keyDown(document.querySelector('.kx-esc') as HTMLElement, { key: 'Enter' })
    expect(strokeProps).toHaveBeenLastCalledWith(expect.objectContaining({ replaySignal: 1 }))
  })

  it('draws loading and unavailable on the same sheet, and the stroke order still works without data', () => {
    useKanjiDetail.mockReturnValue(request({ status: 'loading', message: 'Loading kanji details…' }))
    const { rerender } = render(<KanjiDetailPanel character="日" onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('Loading kanji details')
    expect(screen.getByRole('button', { name: /replay stroke order for 日/i })).toBeTruthy()

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

  it('has no accessibility violations in either state', async () => {
    const run = (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string }> }> }).run
    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail: deckOnly }))
    const { rerender } = render(<KanjiDetailPanel character="語" onClose={vi.fn()} backTo="Look it up" />)
    expect((await run(document.querySelector('.kx-open') as Element)).violations).toEqual([])

    useKanjiDetail.mockReturnValue(request({ status: 'ready', detail: dictionary }))
    rerender(<KanjiDetailPanel character="漢" onClose={vi.fn()} />)
    expect((await run(document.querySelector('.kx-open') as Element)).violations).toEqual([])
  })
})
