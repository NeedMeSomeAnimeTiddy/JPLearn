import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DictionaryPopup } from './DictionaryPopup'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
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
