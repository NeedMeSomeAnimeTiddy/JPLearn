import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PassageHubView } from './PassageHubView'
import { clearGlossCache } from '../features/passages'

/* ==================================================================================================
   THE READER, WHICH IS NOW A SHEET WITH A CURSOR ON IT.

   What these hold onto: the text is dealt a page at a time and never scrolls, the cursor's stops are
   the words the text annotated, and the prompt cell is never empty -- a dictionary that is missing
   costs the English and nothing else, because the reading came off the page.
   ================================================================================================== */

/* TWO SENTENCES THAT WILL NOT SHARE A PAGE. Sixty-five characters each once the readings are taken
   out, which is over the budget together and under it apart -- so the reader has to deal them one at
   a time, and the test is about the paging rather than about a particular sentence's length. */
const PAD = 'あ'.repeat(50)
const LINE_A = `あのお星（ほし）さま、あんまり高く（たかく）て${PAD}。`
const LINE_B = `そんなら、あたいが水（みず）をくんで${PAD}。`

function passage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    title: 'お星さま',
    title_reading: 'おほしさま',
    author: '小川 未明',
    source: 'Aozora Bunko (Public Domain)',
    source_url: 'https://example.invalid',
    original_publication: '1921',
    difficulty: 0,
    difficulty_label: 'beginner',
    word_count: 120,
    text_jp: `${LINE_A}${LINE_B}`,
    raw_text: 'plain',
    vocabulary: [],
    ...over,
  }
}

function installApi(over: Record<string, unknown> = {}) {
  const api = {
    getPassages: async () => ({ passages: [passage()] }),
    searchDictionary: async () => { throw new Error('Offline dictionary index is not installed') },
    ...over,
  }
  // @ts-expect-error a partial desktop API is all this view calls
  window.jplearnDesktop = api
  return api
}

const show = (over: Partial<{
  passageId: string; onBack: () => void; onOpenDictionary: (q?: string) => void
  onPlayAudio: (t: string) => void; voiceBusy: boolean
}> = {}) => render(
  <PassageHubView
    passageId={over.passageId ?? 'p1'}
    onBack={over.onBack ?? vi.fn()}
    onOpenDictionary={over.onOpenDictionary ?? vi.fn()}
    onPlayAudio={over.onPlayAudio ?? vi.fn()}
    voiceBusy={over.voiceBusy ?? false}
  />,
)

const prose = () => document.querySelector('.rd-prose')
const words = () => [...document.querySelectorAll('.rd-word')]
const here = () => document.querySelector('.rd-word.on')?.textContent ?? null
const foot = () => document.querySelector('.rd-foot > b')?.textContent ?? ''
const chips = () => [...document.querySelectorAll('.rd-run .stat-chip')]
  .map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())

beforeEach(() => { clearGlossCache() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('PassageHubView', () => {
  it('deals the text a page at a time instead of scrolling it', async () => {
    installApi()
    show()

    await waitFor(() => expect(prose()).toBeTruthy())
    /* both sentences together are past the budget, so the first page is the first of them */
    expect(prose()?.textContent).toContain('あのお')
    expect(prose()?.textContent).not.toContain('あたい')
    expect(foot()).toBe('2 PAGES')
    expect(chips()[0]).toContain('01')
  })

  it('walks the cursor over the words the text annotated, and nothing else', async () => {
    installApi()
    show()

    await waitFor(() => expect(words().length).toBe(2))
    /* `あのお星（ほし）` is four characters of kana and one annotated word — the cursor stands on
       the word, not on the run before it */
    expect(words().map((w) => w.textContent)).toEqual(['星ほし', '高くたかく'])
    expect(here()).toBe('星ほし')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(here()).toBe('高くたかく')
  })

  it('runs the cursor off the end of a page onto the next one', async () => {
    installApi()
    show()

    await waitFor(() => expect(words().length).toBe(2))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    await waitFor(() => expect(prose()?.textContent).toContain('あたい'))
    expect(chips()[0]).toContain('02')
  })

  it('keeps the prompt cell full when the dictionary cannot answer', async () => {
    /* THE READING IS FREE AND THE MEANING IS NOT. A machine with no offline index still gets the
       word and the reading the text printed, and is told once why there is no English. */
    installApi()
    show()

    await waitFor(() => expect(here()).toBe('星ほし'))
    expect(document.querySelector('.rd-term b')?.textContent).toBe('星')
    await waitFor(() => {
      expect(document.querySelector('.rd-src')?.textContent).toContain('NOT INSTALLED')
    }, { timeout: 3000 })
    /* the reading takes the headline when the meaning cannot be had, rather than the cell emptying */
    expect(document.querySelector('.rd-term i')?.textContent).toBe('ほし')
  })

  it('prints the meaning when the dictionary has one', async () => {
    installApi({
      searchDictionary: async () => ({
        query: '星', source: 'offline_dictionary',
        results: [{ character: '星', romaji: 'ほし', meaning: 'star', tags: [], example_sentence: null }],
      }),
    })
    show()

    await waitFor(() => {
      expect(document.querySelector('.rd-term p')?.textContent).toBe('star')
    }, { timeout: 3000 })
    expect(document.querySelector('.rd-term i')?.textContent).toBe('ほし')
  })

  it('takes the readings off the page with F, and puts them back', async () => {
    installApi()
    show()

    await waitFor(() => expect(words().length).toBe(2))
    expect(prose()?.querySelector('rt')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'f' })
    await waitFor(() => expect(prose()?.querySelector('rt')).toBeNull())
    /* the words are still there to stand on — furigana changes what the text says, not its shape */
    expect(words().length).toBe(2)
  })

  it('ends the text from the last page rather than from a scroll position', async () => {
    const onBack = vi.fn()
    installApi()
    show({ onBack })

    await waitFor(() => expect(prose()).toBeTruthy())
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() => expect(chips()[0]).toContain('02'))

    fireEvent.click(screen.getByRole('button', { name: 'Finish this text' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('opens the full entry for the word under the cursor', async () => {
    const onOpenDictionary = vi.fn()
    installApi()
    show({ onOpenDictionary })

    await waitFor(() => expect(here()).toBe('星ほし'))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onOpenDictionary).toHaveBeenCalledWith('星')
  })

  it('says so when the shelf does not have the text the library asked for', async () => {
    installApi()
    show({ passageId: 'nope' })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('no longer on the shelf')
    })
    expect(document.querySelector('.rd-prose')).toBeNull()
  })
})
