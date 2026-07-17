import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { CardNotePayload } from '../generated/types'
import { DictionaryPopup } from './DictionaryPopup'

const originalGetComputedStyle = window.getComputedStyle

beforeAll(() => {
  window.getComputedStyle = (element: Element) => originalGetComputedStyle(element)
})

afterAll(() => {
  window.getComputedStyle = originalGetComputedStyle
})

const BUILTIN_NOTE_KEY = `note:v1:builtin:${'a'.repeat(64)}`
const SECOND_BUILTIN_NOTE_KEY = `note:v1:builtin:${'b'.repeat(64)}`
const OFFLINE_NOTE_KEY = 'note:v1:offline_dictionary:jmdict:ent-1467640'

function notePayload(noteKey: string, noteText: string): CardNotePayload {
  return {
    note_key: noteKey,
    note_text: noteText,
    created_at_utc: '2026-07-17T10:00:00Z',
    updated_at_utc: '2026-07-17T10:00:01Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installNoteApi(overrides: Partial<Window['jplearnDesktop']> = {}) {
  window.jplearnDesktop = {
    getCardNote: vi.fn(async () => ({ note: null })),
    saveCardNote: vi.fn(async ({ noteKey, noteText }) => notePayload(noteKey, noteText)),
    deleteCardNote: vi.fn(async (noteKey) => ({ note_key: noteKey, deleted: true })),
    ...overrides,
  } as Window['jplearnDesktop']
}

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await (
    axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }
  ).run(container)
  expect(results.violations).toEqual([])
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('DictionaryPopup kanji detail actions', () => {
  it('shows no kanji action for a result without Han characters', async () => {
    window.jplearnDesktop = {} as typeof window.jplearnDesktop

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="かな"
        cards={[{ id: 10, character: 'かな', romaji: 'kana', meaning: 'kana' }]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    expect((await screen.findAllByText('kana')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /kanji/i })).toBeNull()
  })

  it('opens the single Han character directly and preserves Dictionary state', async () => {
    const onOpenKanjiDetail = vi.fn()
    window.localStorage.setItem('jplearn-dictionary-history-v1', JSON.stringify(['previous']))
    window.jplearnDesktop = {} as typeof window.jplearnDesktop

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="日"
        cards={[{ id: 11, character: '日', romaji: 'にち', meaning: 'sun' }]}
        onClose={() => undefined}
        onOpenKanjiDetail={onOpenKanjiDetail}
        onPlayAudio={() => undefined}
      />,
    )

    const searchInput = await screen.findByRole('searchbox', { name: 'Dictionary search' })
    const detailButton = await screen.findByRole('button', { name: 'View details for 日' })
    expect(detailButton.querySelector('svg')).toBeTruthy()
    expect(detailButton.textContent).toBe('')
    expect(detailButton.getAttribute('title')).toBe('Kanji details')
    const resultsPane = document.querySelector('.dictionary-results-pane') as HTMLElement
    const resultsStatus = document.querySelector('.dictionary-section-title-row span') as HTMLElement
    const resultsStatusBeforeOpen = resultsStatus.textContent
    resultsPane.scrollTop = 73
    fireEvent.click(screen.getByRole('button', { name: 'Copy options' }))
    expect(screen.getByRole('menu', { name: 'Copy options' })).toBeTruthy()

    fireEvent.click(detailButton)

    expect(onOpenKanjiDetail).toHaveBeenCalledWith('日', detailButton)
    expect((searchInput as HTMLInputElement).value).toBe('日')
    expect(resultsStatus.textContent).toBe(resultsStatusBeforeOpen)
    expect(screen.getByText('previous')).toBeTruthy()
    expect(resultsPane.scrollTop).toBe(73)
    expect(screen.queryByRole('menu', { name: 'Copy options' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Play pronunciation for 日' })).toBeTruthy()
  })

  it('offers distinct multi-kanji choices in text order and closes the chooser on selection', async () => {
    const onOpenKanjiDetail = vi.fn()
    window.jplearnDesktop = {} as typeof window.jplearnDesktop

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="日本日"
        cards={[{ id: 12, character: '日本日', romaji: 'にほんにち', meaning: 'test word' }]}
        onClose={() => undefined}
        onOpenKanjiDetail={onOpenKanjiDetail}
      />,
    )

    const chooser = await screen.findByRole('button', { name: 'Choose a kanji from 日本日 to view details' })
    expect(chooser.querySelector('svg')).toBeTruthy()
    expect(chooser.textContent).toBe('')
    expect(chooser.getAttribute('title')).toBe('Choose kanji details')
    fireEvent.click(chooser)
    const group = screen.getByRole('group', { name: 'Choose a kanji from 日本日 to view details' })
    const choices = Array.from(group.querySelectorAll('button'))
    expect(choices.map((button) => button.textContent)).toEqual(['日', '本'])

    fireEvent.click(screen.getByRole('button', { name: 'View details for 本' }))

    expect(onOpenKanjiDetail).toHaveBeenCalledWith('本', choices[1])
    expect(screen.queryByRole('group', { name: 'Choose a kanji from 日本日 to view details' })).toBeNull()
    expect((screen.getByRole('searchbox', { name: 'Dictionary search' }) as HTMLInputElement).value).toBe('日本日')
  })
})

describe('DictionaryPopup personal notes', () => {
  it('runs the built-in note lifecycle without disturbing Dictionary state or actions', async () => {
    const load = deferred<{ note: CardNotePayload | null }>()
    const getCardNote = vi.fn(() => load.promise)
    const saveCardNote = vi.fn(async () => notePayload(BUILTIN_NOTE_KEY, 'Updated note'))
    const deleteCardNote = vi.fn(async () => ({ note_key: BUILTIN_NOTE_KEY, deleted: true }))
    const onPlayAudio = vi.fn()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    installNoteApi({ getCardNote, saveCardNote, deleteCardNote })

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="日"
        cards={[
          {
            id: 11,
            note_key: BUILTIN_NOTE_KEY,
            character: '日',
            romaji: 'にち',
            meaning: 'sun',
          },
        ]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
        onPlayAudio={onPlayAudio}
      />,
    )

    const searchInput = await screen.findByRole('searchbox', { name: 'Dictionary search' })
    const resultsPane = document.querySelector('.dictionary-results-pane') as HTMLElement
    const resultsStatus = document.querySelector('.dictionary-section-title-row span') as HTMLElement
    await waitFor(() => expect(resultsStatus.textContent).toBe('1 match'))
    const noteButton = await screen.findByRole('button', { name: 'Open personal note for 日' })
    const resultsStatusBeforeOpen = resultsStatus.textContent
    resultsPane.scrollTop = 64

    fireEvent.click(screen.getByRole('button', { name: 'Copy options' }))
    expect(screen.getByRole('menu', { name: 'Copy options' })).toBeTruthy()
    fireEvent.click(noteButton)

    expect(noteButton.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('menu', { name: 'Copy options' })).toBeNull()
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Loading personal note'),
    )
    expect(getCardNote).toHaveBeenCalledWith(BUILTIN_NOTE_KEY)

    await act(async () => {
      load.resolve({ note: notePayload(BUILTIN_NOTE_KEY, 'Initial note') })
      await load.promise
    })
    expect(await screen.findByText('Initial note')).toBeTruthy()
    expect((searchInput as HTMLInputElement).value).toBe('日')
    expect(resultsStatus.textContent).toBe(resultsStatusBeforeOpen)
    expect(resultsPane.scrollTop).toBe(64)

    fireEvent.click(screen.getByRole('button', { name: 'Play pronunciation for 日' }))
    expect(onPlayAudio).toHaveBeenCalledWith('日')
    fireEvent.click(screen.getByRole('button', { name: 'Copy options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy character' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('日'))

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByRole('textbox', { name: 'Edit personal note' })
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(await screen.findByText('Updated note')).toBeTruthy()
    expect(saveCardNote).toHaveBeenCalledWith({
      noteKey: BUILTIN_NOTE_KEY,
      noteText: 'Updated note',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const confirmRemove = screen.getByRole('button', { name: 'Remove' })
    expect(document.activeElement).toBe(confirmRemove)
    fireEvent.click(screen.getByRole('button', { name: 'Keep note' }))
    expect(screen.getByText('Updated note')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(noteButton.getAttribute('aria-expanded')).toBe('false'))
    expect(deleteCardNote).toHaveBeenCalledWith(BUILTIN_NOTE_KEY)
    expect(document.activeElement).toBe(noteButton)
  })

  it('uses the Python-provided source-backed identity for offline results', async () => {
    const searchDictionary = vi.fn(async () => ({
      query: '猫',
      source: 'offline_dictionary' as const,
      results: [
        {
          id: 3,
          source_id: 'ent-1467640',
          note_key: OFFLINE_NOTE_KEY,
          character: '猫',
          romaji: 'ねこ',
          meaning: 'cat',
          tags: ['offline_dictionary'],
          example_sentence: null,
          pitch_accents: [],
        },
      ],
    }))
    const getCardNote = vi.fn(async () => ({ note: null }))
    installNoteApi({ searchDictionary, getCardNote })

    const { container } = render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="猫"
        cards={[]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    const noteButton = await screen.findByRole('button', { name: 'Open personal note for 猫' })
    fireEvent.click(noteButton)
    expect(await screen.findByRole('textbox', { name: 'Add a personal note' })).toBeTruthy()
    expect(searchDictionary).toHaveBeenCalledWith('猫')
    expect(getCardNote).toHaveBeenCalledWith(OFFLINE_NOTE_KEY)
    expect(noteButton.getAttribute('aria-controls')).toContain(
      encodeURIComponent(OFFLINE_NOTE_KEY),
    )
    await expectNoAxeViolations(container)
  })

  it('does not discard distinct results that reuse a numeric id', async () => {
    installNoteApi()
    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="shared"
        cards={[
          {
            id: 5,
            note_key: BUILTIN_NOTE_KEY,
            character: '日',
            romaji: 'にち',
            meaning: 'shared first',
          },
          {
            id: 5,
            note_key: SECOND_BUILTIN_NOTE_KEY,
            character: '月',
            romaji: 'つき',
            meaning: 'shared second',
          },
          {
            id: 5,
            note_key: 'malformed',
            character: '火',
            romaji: 'ひ',
            meaning: 'shared legacy result',
          },
        ]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    expect(await screen.findByText('shared first')).toBeTruthy()
    expect(screen.getByText('shared second')).toBeTruthy()
    expect(screen.getByText('shared legacy result')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open personal note for 日' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open personal note for 月' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open personal note for 火' })).toBeNull()
  })

  it('guards exactly the dirty Dictionary-owned replacement and navigation interactions', async () => {
    window.localStorage.setItem(
      'jplearn-dictionary-history-v1',
      JSON.stringify(['previous']),
    )
    const getCardNote = vi.fn(async () => ({ note: null }))
    const onClose = vi.fn()
    installNoteApi({ getCardNote })
    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="shared"
        cards={[
          {
            id: 1,
            note_key: BUILTIN_NOTE_KEY,
            character: '日',
            romaji: 'にち',
            meaning: 'shared first',
          },
          {
            id: 2,
            note_key: SECOND_BUILTIN_NOTE_KEY,
            character: '月',
            romaji: 'つき',
            meaning: 'shared second',
          },
        ]}
        onClose={onClose}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    const firstNoteButton = await screen.findByRole('button', {
      name: 'Open personal note for 日',
    })
    const secondNoteButton = screen.getByRole('button', {
      name: 'Open personal note for 月',
    })
    fireEvent.click(firstNoteButton)
    const textarea = await screen.findByRole('textbox', { name: 'Add a personal note' })
    fireEvent.change(textarea, { target: { value: 'unsaved draft' } })

    fireEvent.click(screen.getByRole('button', { name: 'Close dictionary' }))
    fireEvent.click(document.querySelector('.dictionary-backdrop') as HTMLElement)
    fireEvent.click(secondNoteButton)
    expect(onClose).not.toHaveBeenCalled()
    expect(getCardNote).toHaveBeenCalledTimes(1)
    expect(firstNoteButton.getAttribute('aria-expanded')).toBe('true')
    expect(secondNoteButton.getAttribute('aria-expanded')).toBe('false')

    const searchInput = screen.getByRole('searchbox', { name: 'Dictionary search' })
    fireEvent.change(searchInput, { target: { value: 'replacement' } })
    fireEvent.click(screen.getByRole('button', { name: 'previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect((searchInput as HTMLInputElement).value).toBe('shared')
    expect(screen.getByRole('button', { name: 'previous' })).toBeTruthy()

    const escapedShortcut = vi.fn()
    window.addEventListener('keydown', escapedShortcut)
    expect(
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close dictionary' }), {
        key: 'k',
        ctrlKey: true,
      }),
    ).toBe(false)
    expect(
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close dictionary' }), {
        key: '6',
      }),
    ).toBe(false)
    expect(
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close dictionary' }), {
        key: '?',
      }),
    ).toBe(false)
    window.removeEventListener('keydown', escapedShortcut)
    expect(escapedShortcut).not.toHaveBeenCalled()
    expect(
      screen.getByText('Save or cancel your note before continuing.').textContent,
    ).toBe('Save or cancel your note before continuing.')
    expect(document.activeElement).toBe(textarea)

    fireEvent.keyDown(textarea, { key: 'Escape' })
    await waitFor(() => expect(firstNoteButton.getAttribute('aria-expanded')).toBe('false'))
    expect(document.activeElement).toBe(firstNoteButton)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Close dictionary' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('allows clean note switching and has no axe violations in view, error, and delete states', async () => {
    const saveCardNote = vi.fn().mockRejectedValue(new Error('locked'))
    const getCardNote = vi.fn(async (noteKey: string) => ({
      note: notePayload(noteKey, noteKey === BUILTIN_NOTE_KEY ? 'First note' : 'Second note'),
    }))
    installNoteApi({ getCardNote, saveCardNote })
    const { container } = render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="shared"
        cards={[
          {
            id: 1,
            note_key: BUILTIN_NOTE_KEY,
            character: '日',
            romaji: 'にち',
            meaning: 'shared first',
          },
          {
            id: 2,
            note_key: SECOND_BUILTIN_NOTE_KEY,
            character: '月',
            romaji: 'つき',
            meaning: 'shared second',
          },
        ]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    const first = await screen.findByRole('button', { name: 'Open personal note for 日' })
    const second = screen.getByRole('button', { name: 'Open personal note for 月' })
    fireEvent.click(first)
    expect(await screen.findByText('First note')).toBeTruthy()
    await expectNoAxeViolations(container)

    fireEvent.click(second)
    expect(await screen.findByText('Second note')).toBeTruthy()
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(second.getAttribute('aria-expanded')).toBe('true')
    expect(getCardNote).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByRole('textbox', { name: 'Edit personal note' })
    fireEvent.change(textarea, { target: { value: 'failed update' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('could not be saved'),
    )
    expect(document.activeElement).toBe(textarea)
    await expectNoAxeViolations(container)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('Remove this note?')).toBeTruthy()
    await expectNoAxeViolations(container)
  })
})

describe('DictionaryPopup pitch accent', () => {
  it('renders an accessible pitch contour for an enriched result', async () => {
    window.jplearnDesktop = {} as typeof window.jplearnDesktop

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="箸"
        cards={[
          {
            id: 1,
            character: '箸',
            romaji: 'はし',
            meaning: 'chopsticks',
            dictionary_summary: {
              pitch_accents: [
                {
                  reading: 'はし',
                  pitch_positions: [1],
                  mora_count: 2,
                  source: 'Kanjium test data',
                },
              ],
            },
          },
        ]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    expect(await screen.findByRole('img', { name: /はし: Atamadaka \[1\], downstep after mora 1/i })).toBeTruthy()
    expect(screen.getByText('Atamadaka [1]')).toBeTruthy()
  })

  it('does not render an empty pitch section when data is unavailable', async () => {
    window.jplearnDesktop = {} as typeof window.jplearnDesktop

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="橋"
        cards={[{ id: 2, character: '橋', romaji: 'はし', meaning: 'bridge' }]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    expect(await screen.findByText('bridge')).toBeTruthy()
    expect(screen.queryByLabelText('Tokyo Japanese pitch accent')).toBeNull()
  })

  it('withholds malformed pitch data when the source mora count disagrees', async () => {
    window.jplearnDesktop = {} as typeof window.jplearnDesktop

    render(
      <DictionaryPopup
        open
        openSignal={1}
        seedQuery="今日"
        cards={[
          {
            id: 3,
            character: '今日',
            romaji: 'きょう',
            meaning: 'today',
            pitch_accents: [
              {
                reading: 'きょう',
                pitch_positions: [3],
                mora_count: 3,
                source: 'Malformed test data',
              },
            ],
          },
        ]}
        onClose={() => undefined}
        onOpenKanjiDetail={() => undefined}
      />,
    )

    expect(await screen.findByText('today')).toBeTruthy()
    expect(screen.queryByLabelText('Tokyo Japanese pitch accent')).toBeNull()
  })
})
