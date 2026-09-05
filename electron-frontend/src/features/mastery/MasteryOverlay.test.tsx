import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MasteryOverlay } from './components/MasteryOverlay'
import type { CardScores } from '../../types'

/* ==================================================================================================
   THE THREE COLUMNS AND THE THREE CURSORS. What these hold onto: the sets a learner has nothing in
   are not drawn, a long list of blocks folds rather than scrolls, the characters say what they mean
   without anything opening, and a kanji still hands off to the panel that draws one properly.
   ================================================================================================== */

const scores = (over: Partial<Record<keyof CardScores, Record<number, number>>> = {}) => ({
  hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, ...over,
}) as CardScores

const block = (index: number, name: string, ids: number[]) => ({
  index, name, card_ids: ids,
  characters: ids.map((i) => `字${i}`),
  romajis: ids.map((i) => `yomi${i}`),
  meanings: ids.map((i) => `meaning ${i}`),
})

const show = (over: Partial<Parameters<typeof MasteryOverlay>[0]> = {}) => render(
  <MasteryOverlay
    open
    loading={false}
    error={null}
    blocks={{ hiragana: [block(0, 'Vowels', [1, 2]), block(1, 'K-row', [3])] }}
    categoryBlocks={{}}
    kanji={[{ id: 9, character: '水', romaji: 'mizu', meaning: 'water', tags: ['n5'], theme: 'Nature' }]}
    scores={scores({ hiragana: { 1: 4 } })}
    onClose={vi.fn()}
    onRefresh={vi.fn()}
    onOpenKanjiDetail={vi.fn()}
    {...over}
  />,
)

const rail = () => [...document.querySelectorAll('.mx-rail button')].map((b) => b.textContent ?? '')
const list = () => [...document.querySelectorAll('.mx-list button')].map((b) => b.textContent ?? '')
const chips = () => [...document.querySelectorAll('.mx-chip')]
const said = () => document.querySelector('.mx-said')?.textContent ?? ''

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('MasteryOverlay', () => {
  it('draws nothing at all when it is not open', () => {
    show({ open: false })
    expect(document.querySelector('.mx-sheet')).toBeNull()
  })

  it('rails the sets the account actually has, with each one\'s share', () => {
    show()
    expect(rail()[0]).toContain('HIRAGANA')
    /* one card of three at full marks: four of a possible twelve */
    expect(rail()[0]).toContain('33%')
    expect(rail()[1]).toContain('KANJI N5')
    expect(rail().some((r) => r.includes('KATAKANA'))).toBe(false)
  })

  it('opens on the first block of the first set, with its characters beside it', () => {
    show()
    expect(list()[0]).toContain('Vowels')
    expect(chips().map((c) => c.textContent)).toEqual(['字1', '字2'])
    expect(said()).toContain('字1')
    expect(said()).toContain('4 / 4')
  })

  it('marks a character at full score differently from one part way there', () => {
    show()
    expect(chips()[0].className).toContain('done')
    expect(chips()[1].className).not.toContain('done')
  })

  it('walks the blocks with the arrows once the cursor is in that column', () => {
    show()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.querySelector('.mx-list button.on')?.textContent).toContain('K-row')
    expect(chips().map((c) => c.textContent)).toEqual(['字3'])
  })

  it('says what the character under the cursor means without opening anything', () => {
    show()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(said()).toContain('字2')
    expect(said()).toContain('meaning 2')
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1)
  })

  it('folds a long list of blocks rather than scrolling it', () => {
    show({
      blocks: {},
      kanji: Array.from({ length: 30 }, (_, i) => ({
        id: i, character: `漢${i}`, romaji: `on${i}`, meaning: `sense ${i}`,
        tags: ['n5'], theme: `Block ${i}`,
      })),
    })
    expect(document.querySelectorAll('.mx-list button').length).toBeLessThan(30)
    expect(document.querySelector('.mx-list .mx-fold')?.textContent).toContain('BELOW')
  })

  it('hands a kanji to the panel that draws one properly, and closes on the way', () => {
    const onOpenKanjiDetail = vi.fn()
    const onClose = vi.fn()
    show({ blocks: {}, onOpenKanjiDetail, onClose })

    fireEvent.click(screen.getByRole('button', { name: /水, mizu, water/ }))
    expect(onClose).toHaveBeenCalled()
    expect(onOpenKanjiDetail).toHaveBeenCalledWith('水', expect.anything())
  })

  it('closes on escape', () => {
    const onClose = vi.fn()
    show({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('says it is still counting rather than reporting a total it does not have', () => {
    show({ loading: true })
    expect(document.querySelector('.lk-cap s')?.textContent).toBe('COUNTING…')
    expect((screen.getByRole('button', { name: 'Count it again' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('says why the counts are missing when the bridge would not give them', () => {
    show({ error: 'bridge is down' })
    expect(screen.getByRole('alert').textContent).toContain('bridge is down')
  })
})
