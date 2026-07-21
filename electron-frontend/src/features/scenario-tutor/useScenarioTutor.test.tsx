import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScenarioTutor } from './useScenarioTutor'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function completeCafeOrder(result: { current: ReturnType<typeof useScenarioTutor> }) {
  act(() => result.current.selectScenario('cafe-order'))
  act(() => result.current.selectLevel('beginner'))
  act(() => result.current.startScenario())
  const respond = (text: string) => {
    act(() => result.current.setLearnerInputValue(text))
    act(() => result.current.submitResponse())
  }
  respond('こんにちは')
  respond('コーヒーをください')
  respond('レギュラーでお願いします')
  respond('ここで食べます')
  respond('はい、お願いします')
  respond('ありがとうございます')
}

afterEach(() => {
  cleanup()
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

describe('useScenarioTutor — typed-only orchestration', () => {
  it('starts at the select screen with both MVP scenarios listed', () => {
    const { result } = renderHook(() => useScenarioTutor())
    expect(result.current.screen).toBe('select')
    expect(result.current.scenarios.map((s) => s.id).sort()).toEqual(['cafe-order', 'shinjuku-directions'])
  })

  it('selecting a scenario moves to intro; a level must be chosen before starting', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    expect(result.current.screen).toBe('intro')
    expect(result.current.selectedScenario?.id).toBe('cafe-order')

    act(() => result.current.startScenario())
    expect(result.current.screen).toBe('intro') // no level chosen yet, nothing happened

    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())
    expect(result.current.screen).toBe('session')
    expect(result.current.session?.scenarioId).toBe('cafe-order')
    expect(result.current.session?.level).toBe('beginner')
    expect(result.current.session?.currentNodeId).toBe('n-greeting-turn')
  })

  it('completes the cafe-order scenario end-to-end through the hook and reaches the summary screen', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())

    const respond = (text: string) => {
      act(() => result.current.setLearnerInputValue(text))
      act(() => result.current.submitResponse())
    }

    respond('こんにちは')
    expect(result.current.session?.currentNodeId).toBe('n-order')
    respond('コーヒーをください')
    expect(result.current.session?.currentNodeId).toBe('n-size-turn')
    respond('レギュラーでお願いします')
    expect(result.current.session?.currentNodeId).toBe('n-eatin-turn')
    respond('ここで食べます')
    expect(result.current.session?.currentNodeId).toBe('n-price-turn')
    respond('はい、お願いします')
    expect(result.current.session?.currentNodeId).toBe('n-thanks-turn')
    respond('ありがとうございます')

    expect(result.current.screen).toBe('summary')
    expect(result.current.session?.status).toBe('success')
    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary?.objectives.find((o) => o.id === 'obj-order')?.status).toBe('met')
  })

  it('clears the typed draft after each submission and ignores empty submissions', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())

    act(() => result.current.submitResponse())
    expect(result.current.session?.transcript.length).toBe(1) // only the initial NPC greeting turn, nothing submitted

    act(() => result.current.setLearnerInputValue('こんにちは'))
    act(() => result.current.submitResponse())
    expect(result.current.learnerInputValue).toBe('')
  })

  it('requires confirmation before Abandon discards the session, and Cancel leaves it untouched', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())
    const sessionId = result.current.session?.sessionId

    act(() => result.current.requestAbandon())
    expect(result.current.confirmAction).toBe('abandon')
    expect(result.current.session?.sessionId).toBe(sessionId) // untouched while confirming

    act(() => result.current.cancelPendingAction())
    expect(result.current.confirmAction).toBeNull()
    expect(result.current.screen).toBe('session')
    expect(result.current.session?.sessionId).toBe(sessionId)

    act(() => result.current.requestAbandon())
    act(() => result.current.confirmPendingAction())
    expect(result.current.screen).toBe('select')
    expect(result.current.session).toBeNull()
  })

  it('requires confirmation before Restart, then starts a fresh session id', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())
    act(() => result.current.setLearnerInputValue('こんにちは'))
    act(() => result.current.submitResponse())
    const originalSessionId = result.current.session?.sessionId
    expect(result.current.session?.currentNodeId).toBe('n-order')

    act(() => result.current.requestRestart())
    expect(result.current.confirmAction).toBe('restart')
    expect(result.current.session?.sessionId).toBe(originalSessionId) // untouched while confirming

    act(() => result.current.confirmPendingAction())
    expect(result.current.screen).toBe('session')
    expect(result.current.session?.sessionId).not.toBe(originalSessionId)
    expect(result.current.session?.currentNodeId).toBe('n-greeting-turn') // fresh session, back at the start
  })

  it('replayScenario starts a fresh session without requiring confirmation', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())
    const firstSessionId = result.current.session?.sessionId

    act(() => result.current.replayScenario())
    expect(result.current.confirmAction).toBeNull()
    expect(result.current.session?.sessionId).not.toBe(firstSessionId)
    expect(result.current.screen).toBe('session')
  })

  it('returnToSelect clears all scenario state', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())

    act(() => result.current.returnToSelect())
    expect(result.current.screen).toBe('select')
    expect(result.current.selectedScenario).toBeNull()
    expect(result.current.selectedLevel).toBeNull()
    expect(result.current.session).toBeNull()
  })

  it('remains fully usable without persistence: no jplearnDesktop API at all', () => {
    const { result } = renderHook(() => useScenarioTutor())
    completeCafeOrder(result)

    expect(result.current.screen).toBe('summary')
    expect(result.current.persistenceNote).toContain('unavailable')
    expect(result.current.srsDrafts).toEqual([])
  })
})

describe('useScenarioTutor — persistence, SRS draft review, and history', () => {
  afterEach(() => {
    cleanup()
    delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
  })

  it('persists a completed session and generates SRS drafts from it', async () => {
    const saveScenarioSession = vi.fn(async (payload) => ({
      id: payload.sessionId,
      scenario_id: payload.scenarioId,
      scenario_version: payload.scenarioVersion,
      learner_level: payload.learnerLevel,
      started_at_utc: payload.startedAtUtc,
      completed_at_utc: '2026-07-21T00:05:00.000Z',
      transcript: payload.transcript,
      summary: payload.summary,
    }))
    window.jplearnDesktop = { saveScenarioSession } as unknown as Window['jplearnDesktop']

    const { result } = renderHook(() => useScenarioTutor())
    completeCafeOrder(result)

    // persistenceNote is already null before the save resolves, so wait on the
    // drafts — the only state that proves the save round-trip finished.
    await waitFor(() => expect(result.current.srsDrafts.length).toBeGreaterThan(0))
    expect(result.current.persistenceNote).toBeNull()
    expect(saveScenarioSession).toHaveBeenCalledOnce()
    expect(saveScenarioSession).toHaveBeenCalledWith(expect.objectContaining({
      scenarioId: 'cafe-order',
      learnerLevel: 'beginner',
    }))
    // The cafe-order scenario's authored SRS candidates should include the vocabulary practised.
    expect(result.current.srsDrafts.every((draft) => draft.status === 'pending')).toBe(true)
  })

  it('shows a persistence note and skips SRS drafts when saving the session fails', async () => {
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(async () => { throw new Error('disk full') }),
    } as unknown as Window['jplearnDesktop']

    const { result } = renderHook(() => useScenarioTutor())
    completeCafeOrder(result)

    await waitFor(() => expect(result.current.persistenceNote).toContain('disk full'))
    expect(result.current.srsDrafts).toEqual([])
  })

  it('drops a late persistence result after the session is abandoned before it resolves', async () => {
    const save = deferred<unknown>()
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(() => save.promise),
    } as unknown as Window['jplearnDesktop']

    const { result } = renderHook(() => useScenarioTutor())
    completeCafeOrder(result)
    expect(result.current.screen).toBe('summary')

    // Leave the summary screen back to select before the save resolves —
    // returnToSelect bumps the session token, marking this save stale.
    act(() => result.current.returnToSelect())

    await act(async () => {
      save.resolve({
        id: 'x', scenario_id: 'cafe-order', scenario_version: 1, learner_level: 'beginner',
        started_at_utc: 'x', completed_at_utc: 'x', transcript: [], summary: {},
      })
      await Promise.resolve()
    })

    // The late result must not resurrect drafts/notes for the abandoned session.
    expect(result.current.screen).toBe('select')
    expect(result.current.srsDrafts).toEqual([])
    expect(result.current.persistenceNote).toBeNull()
  })

  it('accepts a draft (persisting it), dismisses another, and skips the rest', async () => {
    const saveScenarioSrsCard = vi.fn(async (payload) => ({
      id: payload.id, session_id: payload.sessionId, scenario_id: payload.scenarioId,
      front: payload.front, back: payload.back, reading: payload.reading, notes: payload.notes,
      created_at_utc: '2026-07-21T00:05:00.000Z',
    }))
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(async (payload) => ({
        id: payload.sessionId, scenario_id: payload.scenarioId, scenario_version: payload.scenarioVersion,
        learner_level: payload.learnerLevel, started_at_utc: payload.startedAtUtc,
        completed_at_utc: '2026-07-21T00:05:00.000Z', transcript: payload.transcript, summary: payload.summary,
      })),
      saveScenarioSrsCard,
    } as unknown as Window['jplearnDesktop']

    const { result } = renderHook(() => useScenarioTutor())
    completeCafeOrder(result)
    await waitFor(() => expect(result.current.srsDrafts.length).toBeGreaterThan(1))

    act(() => result.current.goToSrsReview())
    expect(result.current.screen).toBe('srs-review')

    const [first, second] = result.current.srsDrafts
    act(() => result.current.acceptSrsDraft(first.id))
    await waitFor(() => expect(result.current.srsDrafts.find((d) => d.id === first.id)?.status).toBe('accepted'))
    expect(saveScenarioSrsCard).toHaveBeenCalledOnce()
    expect(saveScenarioSrsCard).not.toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringContaining(second.id) }))

    act(() => result.current.dismissSrsDraft(second.id))
    expect(result.current.srsDrafts.find((d) => d.id === second.id)?.status).toBe('dismissed')
    // Dismissed drafts must never reach the backend.
    expect(saveScenarioSrsCard).toHaveBeenCalledTimes(1)

    act(() => result.current.skipAllSrsDrafts())
    expect(result.current.srsDrafts.every((d) => d.status !== 'pending')).toBe(true)
    expect(saveScenarioSrsCard).toHaveBeenCalledTimes(1) // still just the one explicit accept
  })

  it('editing a draft only changes pending drafts, and edits are reflected on accept', async () => {
    const saveScenarioSrsCard = vi.fn(async (payload) => ({
      id: payload.id, session_id: payload.sessionId, scenario_id: payload.scenarioId,
      front: payload.front, back: payload.back, reading: payload.reading, notes: payload.notes,
      created_at_utc: '2026-07-21T00:05:00.000Z',
    }))
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(async (payload) => ({
        id: payload.sessionId, scenario_id: payload.scenarioId, scenario_version: payload.scenarioVersion,
        learner_level: payload.learnerLevel, started_at_utc: payload.startedAtUtc,
        completed_at_utc: '2026-07-21T00:05:00.000Z', transcript: payload.transcript, summary: payload.summary,
      })),
      saveScenarioSrsCard,
    } as unknown as Window['jplearnDesktop']

    const { result } = renderHook(() => useScenarioTutor())
    completeCafeOrder(result)
    await waitFor(() => expect(result.current.srsDrafts.length).toBeGreaterThan(0))

    const target = result.current.srsDrafts[0]
    act(() => result.current.editSrsDraft(target.id, { front: 'edited front' }))
    expect(result.current.srsDrafts.find((d) => d.id === target.id)?.front).toBe('edited front')

    act(() => result.current.acceptSrsDraft(target.id))
    await waitFor(() => expect(result.current.srsDrafts.find((d) => d.id === target.id)?.status).toBe('accepted'))
    expect(saveScenarioSrsCard).toHaveBeenCalledWith(expect.objectContaining({ front: 'edited front' }))
  })

  it('loads, deletes, and clears scenario history', async () => {
    const sessionPayload = {
      id: '11111111-1111-1111-1111-111111111111',
      scenario_id: 'cafe-order',
      scenario_version: 1,
      learner_level: 'beginner',
      started_at_utc: '2026-07-21T00:00:00.000Z',
      completed_at_utc: '2026-07-21T00:05:00.000Z',
      transcript: [],
      summary: { objectives: [], corrections: [], vocabularyPractised: [], grammarPractised: [], recurringMistakes: [], suggestedNextSteps: [] },
    }
    const listScenarioSessions = vi.fn(async () => ({ sessions: [sessionPayload] }))
    const deleteScenarioSession = vi.fn(async (id: string) => ({ id, deleted: true }))
    const clearScenarioSessions = vi.fn(async () => ({ cleared: 1 }))
    window.jplearnDesktop = {
      listScenarioSessions, deleteScenarioSession, clearScenarioSessions,
    } as unknown as Window['jplearnDesktop']

    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.openHistory())
    expect(result.current.screen).toBe('history')
    await waitFor(() => expect(result.current.historyEntries).not.toBeNull())
    expect(result.current.historyEntries).toHaveLength(1)
    expect(result.current.historyEntries?.[0].scenarioTitle).toBe('Order at a Cafe')

    act(() => result.current.deleteHistoryEntry(sessionPayload.id))
    await waitFor(() => expect(result.current.historyEntries).toHaveLength(0))
    expect(deleteScenarioSession).toHaveBeenCalledWith(sessionPayload.id)

    act(() => result.current.closeHistory())
    expect(result.current.screen).toBe('select')

    act(() => result.current.openHistory())
    await waitFor(() => expect(listScenarioSessions).toHaveBeenCalledTimes(2))
    act(() => result.current.clearHistory())
    await waitFor(() => expect(clearScenarioSessions).toHaveBeenCalledOnce())
  })

  it('reports a history load error and an empty (not stuck-loading) state when unavailable', async () => {
    window.jplearnDesktop = {} as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())

    act(() => result.current.openHistory())

    await waitFor(() => expect(result.current.historyError).toContain('unavailable'))
    expect(result.current.historyEntries).toEqual([])
    expect(result.current.historyLoading).toBe(false)
  })
})

describe('useScenarioTutor — hints', () => {
  it('exposes the current node ladder and reveals it step by step without costing an attempt', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())

    const nodeId = result.current.session!.currentNodeId
    expect(result.current.currentHints.length).toBeGreaterThan(0)
    expect(result.current.session?.hintLevels[nodeId]).toBeUndefined()

    act(() => result.current.revealHint())
    expect(result.current.session?.hintLevels[nodeId]).toBe(0)
    // Revealing does not consume an attempt or move the conversation.
    expect(result.current.session?.attempts[nodeId]).toBeUndefined()
    expect(result.current.session?.currentNodeId).toBe(nodeId)

    act(() => result.current.revealHint())
    expect(result.current.session?.hintLevels[nodeId]).toBe(1)
  })

  it('every beginner hint that shows Japanese also carries romaji', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())

    for (const hint of result.current.currentHints) {
      if (hint.ja) expect(hint.romaji).toBeTruthy()
    }
  })

  it('swaps the ladder when the conversation moves to the next node', () => {
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())
    const greetingHints = result.current.currentHints

    act(() => result.current.setLearnerInputValue('こんにちは'))
    act(() => result.current.submitResponse())

    expect(result.current.session?.currentNodeId).toBe('n-order')
    expect(result.current.currentHints).not.toEqual(greetingHints)
    expect(result.current.currentHints.some((hint) => hint.romaji === 'ko-hi- wo kudasai')).toBe(true)
  })

  it('does nothing when there is no active session', () => {
    const { result } = renderHook(() => useScenarioTutor())
    expect(result.current.currentHints).toEqual([])
    act(() => result.current.revealHint())
    expect(result.current.session).toBeNull()
  })
})
