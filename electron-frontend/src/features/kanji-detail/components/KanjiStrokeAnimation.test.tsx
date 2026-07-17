import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KanjiStrokeAnimation } from './KanjiStrokeAnimation'

const writer = vi.hoisted(() => ({
  animateCharacter: vi.fn(),
  cancelQuiz: vi.fn(),
  _renderState: { cancelAll: vi.fn() },
}))
const createWriter = vi.hoisted(() => vi.fn())
const loadHandwritingCharacterData = vi.hoisted(() => vi.fn())

vi.mock('hanzi-writer', () => ({
  default: { create: createWriter },
}))

vi.mock('../../handwriting/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../handwriting/utils')>()
  return { ...actual, loadHandwritingCharacterData }
})

const characterData = { strokes: ['M1'], medians: [[[0, 0], [1, 1]]] }
const originalMatchMedia = window.matchMedia

function setReducedMotion(matches: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })
}

afterEach(() => {
  cleanup()
  writer.animateCharacter.mockReset()
  writer.cancelQuiz.mockReset()
  writer._renderState.cancelAll.mockReset()
  createWriter.mockReset()
  loadHandwritingCharacterData.mockReset()
  window.matchMedia = originalMatchMedia
  delete document.documentElement.dataset.reducedMotion
})

describe('KanjiStrokeAnimation', () => {
  it('loads one character chunk on mount, animates only after replay, and cleans up on unmount', async () => {
    setReducedMotion(false)
    loadHandwritingCharacterData.mockResolvedValue(characterData)
    createWriter.mockImplementation((target: HTMLElement) => {
      target.append(document.createElement('svg'))
      return writer
    })

    const view = render(<KanjiStrokeAnimation character="日" strokeCount={4} />)
    const canvas = document.querySelector('.kanji-detail-stroke-canvas') as HTMLDivElement
    expect(loadHandwritingCharacterData).toHaveBeenCalledOnce()
    await waitFor(() => expect(createWriter).toHaveBeenCalledOnce())
    expect(createWriter.mock.calls[0][1]).toBe('日')
    expect(createWriter.mock.calls[0][2]).toMatchObject({ width: 176, height: 176, padding: 8 })
    expect(createWriter.mock.calls[0][2].charDataLoader()).toEqual(characterData)

    fireEvent.click(screen.getByRole('button', { name: 'Replay stroke order' }))
    expect(writer.animateCharacter).toHaveBeenCalledOnce()
    expect(screen.getByText('4 strokes')).toBeTruthy()

    expect(canvas.children.length).toBe(1)
    view.unmount()
    expect(writer.cancelQuiz).toHaveBeenCalled()
    expect(writer._renderState.cancelAll).toHaveBeenCalled()
    expect(canvas.children.length).toBe(0)
  })

  it('replaces and cleans up its writer when the character changes', async () => {
    setReducedMotion(false)
    loadHandwritingCharacterData.mockResolvedValue(characterData)
    createWriter.mockReturnValue(writer)

    const { rerender } = render(<KanjiStrokeAnimation character="日" strokeCount={4} />)
    await waitFor(() => expect(createWriter).toHaveBeenCalledOnce())
    rerender(<KanjiStrokeAnimation character="月" strokeCount={4} />)

    await waitFor(() => expect(createWriter).toHaveBeenCalledTimes(2))
    expect(loadHandwritingCharacterData).toHaveBeenNthCalledWith(1, '日')
    expect(loadHandwritingCharacterData).toHaveBeenNthCalledWith(2, '月')
    expect(writer._renderState.cancelAll).toHaveBeenCalled()
  })

  it('uses a static reduced-motion state until the learner explicitly opts in', async () => {
    setReducedMotion(true)
    loadHandwritingCharacterData.mockResolvedValue(characterData)
    createWriter.mockReturnValue(writer)

    render(<KanjiStrokeAnimation character="日" strokeCount={4} />)
    await screen.findByText('Stroke-order animation disabled by reduced-motion preference.')
    expect(screen.queryByRole('button', { name: 'Replay stroke order' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enable stroke-order animation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replay stroke order' }))
    expect(writer.animateCharacter).toHaveBeenCalledOnce()
  })

  it('honors the persisted reduced-motion setting as well as the OS preference', async () => {
    setReducedMotion(false)
    document.documentElement.dataset.reducedMotion = 'true'
    loadHandwritingCharacterData.mockResolvedValue(characterData)
    createWriter.mockReturnValue(writer)

    render(<KanjiStrokeAnimation character="日" strokeCount={4} />)
    expect(await screen.findByText('Stroke-order animation disabled by reduced-motion preference.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Replay stroke order' })).toBeNull()
  })

  it('keeps the detail view intact when verified stroke data is unavailable', async () => {
    setReducedMotion(false)
    loadHandwritingCharacterData.mockRejectedValue(new Error('unavailable'))

    render(<KanjiStrokeAnimation character="日" strokeCount={4} />)
    expect(await screen.findByText('Stroke-order data is not available for this kanji.')).toBeTruthy()
    expect(loadHandwritingCharacterData).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Replay stroke order' })).toBeNull()
  })
})
