import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { useLastMock } from './useLastMock'

afterEach(() => {
  cleanup()
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

const record = (over: Record<string, unknown> = {}) => ({
  id: 1, level: 'n5', mode: 'vocab', questions_answered: 60, correct: 38,
  accuracy: 0.633, projected_score: 112, completed_at_utc: '2026-08-30T10:00:00Z', ...over,
})

function install(results: unknown[], fail = false) {
  const get = vi.fn(async () => {
    if (fail) throw new Error('bridge said no')
    return { results }
  })
  ;(window as { jplearnDesktop?: unknown }).jplearnDesktop = { getJLPTExamHistory: get }
  return get
}

let seen: { mock: unknown; settled: boolean } | null = null
function Probe({ level }: { level: string | null }) {
  seen = useLastMock(level)
  return null
}

describe('the last mock', () => {
  it('reads the figures the panel has been built to show and never shown', async () => {
    /* `levelDetail` takes it, `LevelDetail` carries it, `sectionLine` branches on it, and App.tsx
       passed a hard-coded null -- so the "you scored 38 of 60, projecting 112" branch had never
       once been taken */
    install([record()])
    render(<Probe level="n5" />)
    await waitFor(() => expect(seen!.settled).toBe(true))
    expect(seen!.mock).toEqual({ correct: 38, asked: 60, projected: 112 })
  })

  it('takes the most recent rather than sorting a second opinion', async () => {
    /* the query that builds the table orders it newest first; a second ordering here is how the
       two come apart */
    install([record({ id: 9, correct: 50 }), record({ id: 1, correct: 10 })])
    render(<Probe level="n5" />)
    await waitFor(() => expect(seen!.settled).toBe(true))
    expect((seen!.mock as { correct: number }).correct).toBe(50)
  })

  it('asks for one level, because the bridge is strictly serial', async () => {
    const get = install([record()])
    render(<Probe level="n3" />)
    await waitFor(() => expect(get).toHaveBeenCalledWith('n3'))
  })

  it('asks nothing at all when no panel is open', () => {
    const get = install([record()])
    render(<Probe level={null} />)
    expect(get).not.toHaveBeenCalled()
    expect(seen).toEqual({ mock: null, settled: false })
  })

  it('is unsettled until the answer is in, so "not sat" is never drawn over "not asked"', async () => {
    /* `sectionLine` says NO MOCK SAT YET for a null mock, which would be a lie for a fifth of a
       second every time the panel opens */
    install([])
    render(<Probe level="n5" />)
    expect(seen!.settled).toBe(false)
    await waitFor(() => expect(seen!.settled).toBe(true))
    expect(seen!.mock).toBeNull()
  })

  it('settles empty rather than hanging when the bridge refuses', async () => {
    install([], true)
    render(<Probe level="n5" />)
    await waitFor(() => expect(seen!.settled).toBe(true))
    expect(seen!.mock).toBeNull()
  })

  it('settles empty when the app is not running inside Electron at all', async () => {
    render(<Probe level="n5" />)
    await waitFor(() => expect(seen!.settled).toBe(true))
  })

  it('carries a null projection through rather than inventing one', async () => {
    /* the projection is the BACKEND's, stored on the result: a mock sat before `project_mock_score`
       existed has none, and guessing it here would be this app inventing an exam score */
    install([record({ projected_score: null })])
    render(<Probe level="n5" />)
    await waitFor(() => expect(seen!.settled).toBe(true))
    expect((seen!.mock as { projected: number | null }).projected).toBeNull()
  })
})
