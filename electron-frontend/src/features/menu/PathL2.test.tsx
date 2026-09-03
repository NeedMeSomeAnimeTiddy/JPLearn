import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { ProgressionNodeView } from '../progression'
import { PathL2 } from './components/PathL2'
import { hereIndex, pathChain, pathRows } from './pathL2'

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

describe('the course as a chain', () => {
  it('splits the sixteen into behind you, here and ahead', () => {
    const rows = pathRows(curriculum())
    const view = pathChain(rows, hereIndex(rows), hereIndex(rows))
    expect(view.cleared).toBe(1)
    expect(view.here).toBe(1)
    /* the tail counted is the one AFTER the step the AHEAD card names */
    expect(view.beyond).toBe(rows.length - 3)
    expect(view.ahead.name).toBe('カタカナ')
    expect(view.ahead.meta).toBe('KATAKANA')
  })

  it('says what the open step wants, with the figure carrying the emphasis', () => {
    const rows = pathRows(curriculum())
    const view = pathChain(rows, 1, 1)
    expect(view.hero.cap).toBe('YOU ARE HERE · STEP 02 OF 10')
    expect(view.hero.gate).toBe('WANTS ')
    expect(view.hero.gateEm).toBe('ALL 46 CHARACTERS')
    expect(view.hero.slabB).toBe('OPEN ITS BLOCKS')
    expect(view.hero.capRight).toBe('STUDIED HERE')
  })

  it('names the section a hand-off lives in rather than pretending it is a deck', () => {
    const rows = pathRows(curriculum())
    const view = pathChain(rows, 8, 8)
    expect(view.hero.capRight).toBe('LIVES IN THE WORLD')
    expect(view.hero.slabB).toBe('GO TO THE WORLD')
  })

  it('says NOT BUILT YET rather than offering a step with nowhere to go', () => {
    const rows = pathRows(curriculum())
    const view = pathChain(rows, 7, 7)
    expect(view.hero.slabB).toBe('NOT BUILT YET')
    expect(view.hero.live).toBe(false)
  })

  it('re-labels the card when a cleared step is being revisited', () => {
    const rows = pathRows(curriculum())
    const view = pathChain(rows, 1, 0)
    expect(view.hero.cap).toBe('REVISITING · STEP 01 OF 10')
    expect(view.hero.pct).toBe(100)
    expect(view.hero.gate).toBe('ALREADY DONE · NOTHING AHEAD MOVES')
    expect(view.hero.slabB).toBe('STUDY IT AGAIN')
  })

  it('counts the whole course on the rail', () => {
    const rows = pathRows(curriculum())
    const view = pathChain(rows, 1, 1)
    expect(view.rail.mid).toBe('10 STEPS · 1 DONE · 10% OF THE COURSE')
    expect(view.rail.right).toBe('STEP 10')
  })
})

describe('the path screen', () => {
  it('opens on the step the learner is on', async () => {
    draw()
    await waitFor(() => expect(document.querySelector('.dk-here')).not.toBeNull())
    expect(document.querySelector('.dk-here .dk-name')?.textContent).toBe('ひらがな')
    expect(document.querySelector('.dk-here .dk-sub span')?.textContent).toBe('HIRAGANA')
  })

  it('counts what is behind you on its own card', () => {
    draw()
    expect(document.querySelector('.dk-behind .dk-bignum b')?.textContent).toBe('1')
    expect(document.querySelector('.dk-behind .dk-bignum i')?.textContent).toBe('STEP DONE')
  })

  it('names the next one without offering it', () => {
    draw()
    expect(document.querySelector('.dk-ahead .dk-next b')?.textContent).toBe('カタカナ')
    /* it is a statement, not a choice — nothing inside it is focusable */
    expect(document.querySelector('.dk-ahead button')).toBeNull()
  })

  it('opens the step with Enter', async () => {
    draw()
    await waitFor(() => expect(document.querySelector('.dk-here')).not.toBeNull())
    fireEvent.keyDown(document.querySelector('.mn-open') as HTMLElement, { key: 'Enter' })
    expect(onOpenNode).toHaveBeenCalledWith('hiragana')
  })

  it('moves between the two cards with the arrows, and the pile is the other one', async () => {
    draw()
    const root = document.querySelector('.mn-open') as HTMLElement
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    await waitFor(() => expect(document.querySelector('.dk-behind.on')).not.toBeNull())
    fireEvent.keyDown(root, { key: 'Enter' })
    await waitFor(() => expect(document.querySelector('.dk-sheet')).not.toBeNull())
    expect(document.querySelector('.dk-sheet .dk-cap b')?.textContent).toBe('STEPS DONE · 1 OF 10')
  })

  it('revisits a cleared step out of the pile', async () => {
    draw()
    const root = document.querySelector('.mn-open') as HTMLElement
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    fireEvent.keyDown(root, { key: 'Enter' })
    await waitFor(() => expect(document.querySelector('.dk-cell')).not.toBeNull())
    fireEvent.click(document.querySelector('.dk-cell') as HTMLElement)
    await waitFor(() => expect(document.querySelector('.dk-here .dk-cap b')?.textContent)
      .toBe('REVISITING · STEP 01 OF 10'))
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
    /* the back control is the mockup's washi tab in the corner now, not a gold line at the top */
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onUp).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    draw()
    await waitFor(() => expect(document.querySelector('.dk-here')).not.toBeNull())

    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})

describe('the chain says no where it cannot go', () => {
  it('refuses a step with no destination, which is the genuinely silent case', () => {
    /* the slab beside it already reads NOT BUILT YET; the refusal is what sends you to read it */
    const nodes = [node({ node_id: 'listening', name: 'Listening', status: 'active', isOpen: true, destination: { kind: 'none' } })]
    draw(nodes)
    fireEvent.keyDown(document.querySelector('.mn-open') as HTMLElement, { key: 'Enter' })
    expect(onOpenNode).not.toHaveBeenCalled()
    expect(document.querySelector('.mn-flash')).not.toBeNull()
  })

  it('does not offer a step that is still shut, which is the whole of the chain shape', () => {
    /* the road let you walk to any of the sixteen and press it. Ten of those could only throw you
       at another section, and the design retired that: only the open one acts. */
    draw()
    const root = document.querySelector('.mn-open') as HTMLElement
    for (let i = 0; i < 4; i++) fireEvent.keyDown(root, { key: 'ArrowRight' })
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onOpenNode).toHaveBeenCalledWith('hiragana')
    expect(onOpenNode).not.toHaveBeenCalledWith('vocabulary_n5')
  })
})
