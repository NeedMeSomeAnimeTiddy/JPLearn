import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DictionaryPopup } from './DictionaryPopup'

afterEach(() => {
  cleanup()
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
      />,
    )

    expect(await screen.findByText('today')).toBeTruthy()
    expect(screen.queryByLabelText('Tokyo Japanese pitch accent')).toBeNull()
  })
})
