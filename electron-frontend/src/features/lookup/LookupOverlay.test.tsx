import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { KanjiDetailPayload } from '../../generated/types'
import { LookupOverlay } from './components/LookupOverlay'
import { useLookup } from './useLookup'

/* The overlay is driven entirely by the controller, so the harness mounts the real hook and drives
   the pair -- the sequencing lives in the hook and the absence-drawing lives in the component, and
   either one alone would pass while the two together failed.

   Real timers throughout: the hook debounces by 180ms and `waitFor` polls on real timers, so fake
   ones make the two deadlock rather than making the test faster. */
const onOpenKanjiDetail = vi.fn()
const onOpenDictionary = vi.fn()

function Harness({ seed = '' }: { seed?: string }) {
  const controller = useLookup()
  return (
    <>
      <button type="button" onClick={() => controller.open(seed)}>open lookup</button>
      <LookupOverlay
        controller={controller}
        onOpenKanjiDetail={onOpenKanjiDetail}
        onOpenDictionary={onOpenDictionary}
      />
    </>
  )
}

function kanjiDetail(overrides: Partial<KanjiDetailPayload> = {}): KanjiDetailPayload {
  return {
    character: '語',
    meanings: [],
    on_readings: [],
    kun_readings: [],
    radicals: [],
    components: ['言', '口', '五'],
    jlpt_level: 'N5',
    jlpt_level_source: 'deck',
    stroke_count: null,
    classical_radical_number: null,
    tags: [],
    categories: ['Kanji N5'],
    compounds: [],
    has_more_compounds: false,
    source: 'committed',
    ...overrides,
  } as KanjiDetailPayload
}

function installApi(overrides: Record<string, unknown> = {}) {
  window.jplearnDesktop = {
    getKanjiDetail: vi.fn(async () => kanjiDetail()),
    searchDictionary: vi.fn(async (query: string) => ({
      query, source: 'loaded_cards' as const, results: [],
    })),
    lookupSentence: vi.fn(async () => ({ jp: null, en: null, romaji: null })),
    ...overrides,
  } as unknown as Window['jplearnDesktop']
}

function open(seed: string) {
  render(<Harness seed={seed} />)
  fireEvent.click(screen.getByText('open lookup'))
}

const field = () => screen.getByLabelText('What to look up')

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
  onOpenKanjiDetail.mockReset()
  onOpenDictionary.mockReset()
})

describe('LookupOverlay', () => {
  it('is closed until it is opened, and closes again on Escape', async () => {
    installApi()
    render(<Harness />)
    expect(document.querySelector('.lk-open')).toBeNull()

    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    fireEvent.keyDown(field(), { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('.lk-open')).toBeNull())
  })

  it('asks kanji-detail for a single kanji and shows what it got', async () => {
    installApi()
    open('語')

    await waitFor(() => expect(window.jplearnDesktop.getKanjiDetail).toHaveBeenCalledWith('語'))
    await waitFor(() => expect(screen.getByText(/N5/)).toBeTruthy())
    expect(screen.getByText('言')).toBeTruthy()
    expect(screen.getByText('五')).toBeTruthy()
  })

  it('draws a missing download as an absence, not as an empty row', async () => {
    installApi()
    open('語')

    const readings = await screen.findByText(/on and kun readings need the offline dictionary/i)
    /* the absent styling IS the fact: an empty value drawn like a real one would be a lie */
    expect(readings.closest('.lk-line')?.className).toContain('none')
    expect(screen.getByText(/THE OFFLINE DICTIONARY IS NOT INSTALLED/i)).toBeTruthy()
  })

  it('does not ask kanji-detail for something that is not one kanji', async () => {
    installApi()
    open('学校')

    await waitFor(() => expect(window.jplearnDesktop.searchDictionary).toHaveBeenCalledWith('学校'))
    expect(window.jplearnDesktop.getKanjiDetail).not.toHaveBeenCalled()
  })

  it('says when a word came from the decks rather than the dictionary', async () => {
    installApi({
      searchDictionary: vi.fn(async (query: string) => ({
        query,
        source: 'loaded_cards' as const,
        results: [{
          id: 1, source_id: null, note_key: 'n1', character: '学校', romaji: 'gakkou',
          meaning: 'school', tags: [], example_sentence: null, pitch_accents: [],
        }],
      })),
    })
    open('学校')

    expect(await screen.findByText(/FROM YOUR OWN DECKS/i)).toBeTruthy()
  })

  it('asks the bridge one command at a time, because it is serial', async () => {
    const order: string[] = []
    let inFlight = 0
    let overlapped = false
    const track = <T,>(name: string, value: T) => async () => {
      order.push(name)
      inFlight += 1
      if (inFlight > 1) overlapped = true
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight -= 1
      return value
    }
    installApi({
      getKanjiDetail: vi.fn(track('kanji', kanjiDetail())),
      searchDictionary: vi.fn(track('word', { query: '語', source: 'loaded_cards', results: [] })),
      lookupSentence: vi.fn(track('phrase', { jp: null, en: null, romaji: null })),
    })

    open('語')
    await waitFor(() => expect(order.length).toBe(3))

    expect(overlapped).toBe(false)
    /* and the route the query asked for goes first, so the answer that matters arrives first */
    expect(order[0]).toBe('kanji')
  })

  it('hands a kanji off to the panel that already draws it properly', async () => {
    installApi()
    open('語')
    await waitFor(() => expect(window.jplearnDesktop.getKanjiDetail).toHaveBeenCalled())
    await screen.findByText(/N5/)

    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onOpenKanjiDetail).toHaveBeenCalledWith('語', expect.anything())
    await waitFor(() => expect(document.querySelector('.lk-open')).toBeNull())
  })

  it('names the two model-backed routes without pretending to answer them', async () => {
    installApi()
    open('語')
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    const tutor = screen.getByTitle(/^assistant-chat needs a running model$/i) as HTMLButtonElement
    const ocr = screen.getByTitle(/assistant-chat-ocr needs a running model/i) as HTMLButtonElement
    expect(tutor.disabled).toBe(true)
    expect(ocr.disabled).toBe(true)
  })

  it('survives the desktop bridge being absent entirely', async () => {
    window.jplearnDesktop = undefined as unknown as Window['jplearnDesktop']
    open('語')

    expect(await screen.findByText(/desktop bridge is not available/i)).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    installApi()
    open('語')
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())
    await screen.findByText(/N5/)

    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.lk-open') as Element)
    expect(results.violations).toEqual([])
  })
})
