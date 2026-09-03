import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { ProgressionNodeView } from '../progression'
import { PathL2 } from './components/PathL2'
import { hereIndex, pathRows, reachIndex, runWindow, RUN_WINDOW } from './pathL2'

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

const draw = (nodes = curriculum(), loading = false) =>
  render(<PathL2 nodes={nodes} loading={loading} onOpenNode={onOpenNode} onUp={onUp} />)

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
})

describe('the window onto the run', () => {
  it('shows six of the sixteen and counts the rest at either end', () => {
    const rows = pathRows(curriculum())
    const win = runWindow(rows, 4)
    expect(win.rows).toHaveLength(RUN_WINDOW)
    expect(win.behind + win.rows.length + win.ahead).toBe(rows.length)
    expect(win.rows[win.at].id).toBe(rows[4].id)
  })

  it('stands the cursor second, so one step of history shows', () => {
    const rows = pathRows(curriculum())
    expect(runWindow(rows, 4).at).toBe(1)
  })

  it('keeps the window on the list at either end', () => {
    const rows = pathRows(curriculum())
    expect(runWindow(rows, 0).behind).toBe(0)
    const last = runWindow(rows, rows.length - 1)
    expect(last.ahead).toBe(0)
    expect(last.rows).toHaveLength(RUN_WINDOW)
  })

  it('does not fold at all when the whole run fits', () => {
    const rows = pathRows(curriculum().slice(0, 3))
    const win = runWindow(rows, 1)
    expect(win.behind).toBe(0)
    expect(win.ahead).toBe(0)
  })

  it('reaches past the frontier where the course forks', () => {
    /* `grammar_n5` opens both of its children at once, so two steps are open and the cursor has
       to be able to get to the second -- see `reachIndex`. */
    const rows = pathRows(curriculum())
    expect(reachIndex(rows)).toBe(1)
    const forked = curriculum().map((n, i) => (i <= 1 ? { ...n, status: 'mastered' as const }
      : i <= 3 ? { ...n, status: 'active' as const } : n))
    expect(reachIndex(pathRows(forked))).toBe(3)
    expect(hereIndex(pathRows(forked))).toBe(2)
  })
})

describe('the path screen', () => {
  it('opens on the step the learner is on, set at poster size beside the run', async () => {
    draw()
    await waitFor(() => expect(document.querySelector('.pa-here')).not.toBeNull())
    expect(document.querySelector('.pa-name')?.textContent).toBe('ひらがな')
    expect(document.querySelector('.pa-sub b')?.textContent).toBe('HIRAGANA')
    expect(document.querySelector('.pa-kick')?.textContent).toBe('YOU ARE HERE · STEP 02 OF 10')
  })

  it('draws the run as rows, with the open one inverted', () => {
    draw()
    const rows = [...document.querySelectorAll('.pa-row')]
    expect(rows).toHaveLength(6)
    expect(rows[1].className).toContain('on')
    expect(rows[0].className).toContain('done')
    expect(rows[0].querySelector('.s')?.textContent).toBe('済 DONE')
    expect(rows[2].querySelector('.s')?.textContent).toBe('SHUT')
  })

  it('counts what will not fit rather than cutting a row off', () => {
    draw()
    expect(document.querySelector('.pa-fold b')?.textContent).toBe('4')
    expect(document.querySelector('.pa-fold i')?.textContent).toBe('MORE STEPS AHEAD OF YOU')
  })

  it('says what the open step wants, with the figure carrying the emphasis', () => {
    draw()
    expect(document.querySelector('.pa-gate')?.textContent)
      .toBe('WANTS ALL 46 CHARACTERS BEFORE THE NEXT STEP OPENS')
    expect(document.querySelector('.pa-gate em')?.textContent).toBe('ALL 46 CHARACTERS')
    expect(document.querySelector('.pa-go b')?.textContent).toBe('OPEN ITS BLOCKS ▸')
  })

  it('opens the step with Enter', async () => {
    draw()
    await waitFor(() => expect(document.querySelector('.pa-here')).not.toBeNull())
    fireEvent.keyDown(document.querySelector('.mn-open') as HTMLElement, { key: 'Enter' })
    expect(onOpenNode).toHaveBeenCalledWith('hiragana')
  })

  it('walks back over what is finished, and the window follows', async () => {
    draw()
    const root = document.querySelector('.mn-open') as HTMLElement
    fireEvent.keyDown(root, { key: 'ArrowUp' })
    await waitFor(() => expect(document.querySelector('.pa-kick')?.textContent)
      .toBe('ALREADY DONE · STEP 01 OF 10'))
    /* the tutorial is the one step the app deliberately has no door back into, so the slab says
       so rather than promising a revisit it cannot perform */
    expect(document.querySelector('.pa-go b')?.textContent).toBe('NOT BUILT YET ▸')
    expect(document.querySelector('.pa-go')?.getAttribute('data-live')).toBe('0')
  })

  it('will not walk past the frontier, which is the whole of the chain rule', async () => {
    draw()
    const root = document.querySelector('.mn-open') as HTMLElement
    for (let i = 0; i < 6; i += 1) fireEvent.keyDown(root, { key: 'ArrowDown' })
    await waitFor(() => expect(document.querySelector('.pa-kick')?.textContent)
      .toBe('YOU ARE HERE · STEP 02 OF 10'))
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onOpenNode).toHaveBeenCalledWith('hiragana')
    expect(onOpenNode).not.toHaveBeenCalledWith('vocabulary_n5')
  })

  it('shows the whole course once, in the foot band', () => {
    draw()
    expect([...document.querySelectorAll('.pa-ticks i')]).toHaveLength(10)
    expect(document.querySelectorAll('.pa-strip .cap')[1]?.textContent)
      .toBe('10 STEPS · 1 DONE · 10%')
  })

  it('says so when the curriculum answered with nothing', () => {
    draw([])
    expect(screen.getByText(/THE CURRICULUM DID NOT ANSWER/)).toBeTruthy()
  })

  it('says it is still reading, rather than claiming zero milestones', () => {
    draw([], true)
    expect(screen.getByText(/READING THE CURRICULUM/)).toBeTruthy()
    expect(screen.queryByText(/0 OF 0/)).toBeNull()
  })

  it('goes back up a level', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onUp).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    draw()
    await waitFor(() => expect(document.querySelector('.pa-here')).not.toBeNull())
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })

  it('refuses a step with no destination, which is the genuinely silent case', () => {
    /* the slab beside it already reads NOT BUILT YET; the refusal is what sends you to read it */
    const nodes = [node({ node_id: 'listening', name: 'Listening', status: 'active', isOpen: true, destination: { kind: 'none' } })]
    draw(nodes)
    fireEvent.keyDown(document.querySelector('.mn-open') as HTMLElement, { key: 'Enter' })
    expect(onOpenNode).not.toHaveBeenCalled()
    expect(document.querySelector('.mn-flash')).not.toBeNull()
  })
})
