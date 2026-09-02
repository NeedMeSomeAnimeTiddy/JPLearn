import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { StudySummaryPayload } from '../../types'
import { Lanes } from './components/Lanes'
import { dueToday, practiceLanes, type Lane } from './lanes'

const onPick = vi.fn()
const onUp = vi.fn()

const summary = (...due: number[]) => ({
  decks: due.map((d, i) => ({ slug: `d${i}`, name: `D${i}`, total: 10, mastered: 1, due_today: d, completed_today: 0 })),
} as unknown as StudySummaryPayload)

function show(lanes: Lane[]) {
  render(<Lanes section="DRILLS" jp="練習" en="PRACTICE" note="NOTE" lanes={lanes} onPick={onPick} onUp={onUp} />)
}

afterEach(() => {
  cleanup()
  onPick.mockReset()
  onUp.mockReset()
})

describe('what the practice lanes are made of', () => {
  it('adds the due count across every deck', () => {
    expect(dueToday(summary(3, 0, 9))).toBe(12)
  })

  it('says not-counted-yet rather than zero when there is no summary', () => {
    expect(dueToday(null)).toBeNull()
    const lanes = practiceLanes(null)
    expect(lanes[0]).toMatchObject({ fig: '—', figLab: 'NOT COUNTED YET', absent: true })
  })

  it('draws a clear day as an absence, not as zero cards due', () => {
    const review = practiceLanes(summary(0, 0))[0]
    expect(review.fig).toBe('—')
    expect(review.figLab).toBe('NOTHING DUE')
    expect(review.absent).toBe(true)
    /* and it stops being an obligation, so it stops wearing the vermilion */
    expect(review.duty).toBe(false)
  })

  it('makes reviews the obligation only when something is actually due', () => {
    expect(practiceLanes(summary(2))[0].duty).toBe(true)
    expect(practiceLanes(summary(0))[0].duty).toBe(false)
  })

  it('counts the drills and the puzzles rather than stating them', () => {
    const [, drills, games] = practiceLanes(summary(1))
    /* the exact numbers belong to the app and may change; what must hold is that they were
       counted from the real lists and are not placeholder text */
    expect(Number(drills.fig)).toBeGreaterThan(0)
    expect(drills.figLab).toBe('MODES')
    expect(Number(games.fig)).toBeGreaterThan(0)
    expect(games.foot).toMatch(/CROSSWORD/)
  })
})

describe('the lanes screen', () => {
  it('draws one card per lane, with the first selected', () => {
    show(practiceLanes(summary(2)))
    expect(document.querySelectorAll('.pr-lane')).toHaveLength(3)
    expect(document.querySelector('.pr-lane.on .pr-cap b')?.textContent).toBe('REVIEW')
  })

  it('only the obligation carries the vermilion', () => {
    show(practiceLanes(summary(2)))
    const duty = document.querySelectorAll('.pr-lane.duty')
    expect(duty).toHaveLength(1)
    expect(duty[0].querySelector('.pr-cap b')?.textContent).toBe('REVIEW')
  })

  it('walks sideways and opens with Enter', async () => {
    show(practiceLanes(summary(2)))
    const root = document.querySelector('.mn-open') as HTMLElement

    fireEvent.keyDown(root, { key: 'ArrowRight' })
    await waitFor(() => expect(document.querySelector('.pr-lane.on .pr-cap b')?.textContent).toBe('DRILLS'))

    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('drills')
  })

  it('does not walk off either end', async () => {
    show(practiceLanes(summary(2)))
    const root = document.querySelector('.mn-open') as HTMLElement
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    await waitFor(() => expect(document.querySelector('.pr-lane.on .pr-cap b')?.textContent).toBe('REVIEW'))

    for (let i = 0; i < 6; i++) fireEvent.keyDown(root, { key: 'ArrowRight' })
    await waitFor(() => expect(document.querySelector('.pr-lane.on .pr-cap b')?.textContent).toBe('DAILY GAMES'))
  })

  it('a shut lane says what opens it and goes nowhere', () => {
    show([{
      key: 'talk', en: 'TALK', jp: '会話', glyph: '会', desc: 'd',
      fig: '—', figLab: 'x', foot: 'f', act: 'GO', shut: true, opens: 'reach GRAMMAR on the path',
    }])
    fireEvent.click(document.querySelector('.pr-lane') as HTMLElement)
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByText(/reach GRAMMAR on the path/)).toBeTruthy()
  })

  it('goes back up a level', () => {
    show(practiceLanes(summary(2)))
    /* the back control is the mockup's washi tab in the corner now, not a gold line at the top */
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onUp).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    show(practiceLanes(summary(2)))
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})
