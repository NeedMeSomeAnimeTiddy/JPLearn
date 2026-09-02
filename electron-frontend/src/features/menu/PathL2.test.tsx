import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { ProgressionNodeView } from '../progression'
import { PathL2 } from './components/PathL2'
import { hereIndex, pathRows, pathWindow, PATH_WINDOW } from './pathL2'

const onOpenNode = vi.fn()
const onUp = vi.fn()

function node(over: Partial<ProgressionNodeView> & { node_id: string }): ProgressionNodeView {
  return {
    name: over.name ?? over.node_id,
    category: 'script',
    status: over.status ?? 'locked',
    mastered_ratio: over.mastered_ratio ?? 0,
    is_reachable: true,
    mastered_count: 0,
    total_count: 0,
    is_tracked: true,
    isOpen: over.isOpen ?? false,
    isOverridden: over.isOverridden ?? false,
    destination: over.destination ?? { kind: 'script', script: 'hiragana' },
    progressLabel: over.progressLabel ?? '',
    ...over,
  } as ProgressionNodeView
}

/** the real sixteen, shortened where the test does not care */
const curriculum = (): ProgressionNodeView[] => [
  node({ node_id: 'tutorial', name: 'Tutorial', status: 'mastered', mastered_ratio: 1, isOpen: true, progressLabel: '1/1', destination: { kind: 'none' } }),
  node({ node_id: 'hiragana', name: 'Hiragana', status: 'active', mastered_ratio: 0.99, isOpen: true, progressLabel: '103/104' }),
  node({ node_id: 'katakana', name: 'Katakana', status: 'locked', progressLabel: '1/104' }),
  node({ node_id: 'vocabulary_n5', name: 'Vocabulary N5', status: 'locked' }),
  node({ node_id: 'grammar_n5', name: 'Grammar N5', status: 'locked' }),
  node({ node_id: 'sentence_examples', name: 'Sentence Examples', status: 'locked' }),
  node({ node_id: 'scripted_conv', name: 'Scripted Conv', status: 'locked', destination: { kind: 'scenarios' } }),
  node({ node_id: 'listening', name: 'Listening', status: 'locked', destination: { kind: 'none' } }),
  node({ node_id: 'reading', name: 'Reading', status: 'locked', destination: { kind: 'passages' } }),
  node({ node_id: 'jlpt_n5', name: 'JLPT N5', status: 'locked', destination: { kind: 'jlpt' } }),
]

afterEach(() => {
  cleanup()
  onOpenNode.mockReset()
  onUp.mockReset()
})

describe('the path, built from the live curriculum', () => {
  it('takes its labels from the backend and its Japanese from the design', () => {
    const rows = pathRows(curriculum())
    expect(rows[1]).toMatchObject({
      no: '02', en: 'HIRAGANA', jp: 'ひらがな', want: 'all 46 characters',
      state: 'here', pct: 99, count: '103/104',
    })
  })

  it('renders a node the design has never heard of, rather than dropping it', () => {
    /* a seventeenth milestone is a small wrong label; a silently missing one is a large wrong app */
    const rows = pathRows([node({ node_id: 'brand_new', name: 'Brand New', status: 'locked' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].en).toBe('BRAND NEW')
    expect(rows[0].jp).toBe('')
  })

  it('reads the three states off the backend status', () => {
    const rows = pathRows(curriculum())
    expect(rows[0].state).toBe('done')
    expect(rows[1].state).toBe('here')
    expect(rows[2].state).toBe('ahead')
  })

  it('stands the cursor where the learner actually is', () => {
    expect(hereIndex(pathRows(curriculum()))).toBe(1)
  })

  it('stands on the last step when everything is finished, rather than falling off the end', () => {
    const allDone = curriculum().map((n) => ({ ...n, status: 'mastered' as const }))
    const rows = pathRows(allDone)
    expect(hereIndex(rows)).toBe(rows.length - 1)
  })

  it('folds rather than scrolls, and says how many are folded', () => {
    const rows = pathRows(curriculum())
    const win = pathWindow(rows, 8)
    expect(win.rows).toHaveLength(PATH_WINDOW)
    expect(win.behind + win.rows.length + win.ahead).toBe(rows.length)
    expect(win.rows[win.cursorInWindow].id).toBe(rows[8].id)
  })

  it('does not fold when everything fits', () => {
    const rows = pathRows(curriculum().slice(0, 3))
    const win = pathWindow(rows, 1)
    expect(win.behind).toBe(0)
    expect(win.ahead).toBe(0)
  })

  it('keeps the window on the list at either end', () => {
    const rows = pathRows(curriculum())
    expect(pathWindow(rows, 0).behind).toBe(0)
    const last = pathWindow(rows, rows.length - 1)
    expect(last.ahead).toBe(0)
    expect(last.rows).toHaveLength(PATH_WINDOW)
  })
})

describe('the path screen', () => {
  it('opens on the step the learner is on', async () => {
    render(<PathL2 nodes={curriculum()} loading={false} onOpenNode={onOpenNode} onUp={onUp} />)
    await waitFor(() => expect(document.querySelector('.cs-hero')).not.toBeNull())
    expect(document.querySelector('.cs-hero .cs-hen')?.textContent).toBe('HIRAGANA')
  })

  it('counts what is behind you, on the strip under the road', () => {
    /* the count moved off a caption and onto the minimap, which is where the mockup puts it -- the
       caption sat at the top of the stage and the road's tablets stand on top of that */
    render(<PathL2 nodes={curriculum()} loading={false} onOpenNode={onOpenNode} onUp={onUp} />)
    expect(document.querySelector('.cs-cleared')?.textContent).toBe('1 STEP CLEARED')
    expect(document.querySelector('.cs-togo')?.textContent).toBe('8 TO GO')
  })

  it('walks with the arrows and opens with Enter', async () => {
    render(<PathL2 nodes={curriculum()} loading={false} onOpenNode={onOpenNode} onUp={onUp} />)
    const root = document.querySelector('.mn-open') as HTMLElement
    await waitFor(() => expect(document.querySelector('.cs-hero')).not.toBeNull())

    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    await waitFor(() => expect(document.querySelector('.cs-hero .cs-hen')?.textContent).toBe('VOCABULARY N5'))

    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onOpenNode).toHaveBeenCalledWith('vocabulary_n5')
  })

  it('says so when the curriculum answered with nothing', () => {
    render(<PathL2 nodes={[]} loading={false} onOpenNode={onOpenNode} onUp={onUp} />)
    expect(screen.getByText(/THE CURRICULUM DID NOT ANSWER/)).toBeTruthy()
  })

  it('says it is still reading, rather than claiming zero milestones', () => {
    render(<PathL2 nodes={[]} loading onOpenNode={onOpenNode} onUp={onUp} />)
    expect(screen.getByText(/READING THE CURRICULUM/)).toBeTruthy()
    expect(screen.queryByText(/0 OF 0/)).toBeNull()
  })

  it('goes back up a level', () => {
    render(<PathL2 nodes={curriculum()} loading={false} onOpenNode={onOpenNode} onUp={onUp} />)
    /* the back control is the mockup's washi tab in the corner now, not a gold line at the top */
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onUp).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    render(<PathL2 nodes={curriculum()} loading={false} onOpenNode={onOpenNode} onUp={onUp} />)
    await waitFor(() => expect(document.querySelector('.cs-hero')).not.toBeNull())

    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})
