import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Conversation } from './Conversation'
import { SCENARIO_COPY } from '../constants'
import { useScenarioTutor, type UseScenarioTutorReturn } from '../useScenarioTutor'
import type { ScenarioHistoryEntry } from '../types'

/* ==================================================================================================
   WHAT THE POP-UP'S PARTS PROMISED, KEPT ON THE CONVERSATION SCREEN.

   The scenario pop-up was built from five panels with tests of their own -- the reply field with
   its mic (`LearnerInputPanel`), the hint popover (`ScenarioHintPanel`), the drafted-card review
   (`SrsDraftReviewPanel`) and the history (`ScenarioHistoryPanel`). The panels retired with the
   pop-up; every behaviour their tests held is held here, against the screen that does it now.
   ================================================================================================== */

type Overrides = (tutor: UseScenarioTutorReturn) => Partial<UseScenarioTutorReturn>

function Harness({ start = false, overrides }: { start?: boolean; overrides?: Overrides }) {
  const real = useScenarioTutor()
  const { screen: at, selectScenario, startScenario } = real
  useEffect(() => {
    if (at === 'select') selectScenario('cafe-order')
    else if (at === 'intro' && start) startScenario('beginner')
  }, [at, start, selectScenario, startScenario])
  const [ready, setReady] = useState(false)
  useEffect(() => { if (at !== 'select') setReady(true) }, [at])
  if (!ready) return null
  const tutor = overrides ? { ...real, ...overrides(real) } : real
  return (
    <Conversation
      scenarioTutor={tutor}
      romajiEnabled={false}
      onToggleRomaji={() => {}}
      audioEnabled={false}
      onToggleAudio={() => {}}
      onLeave={() => {}}
    />
  )
}

const rule = () => screen.getByRole('textbox', { name: 'Your response' })
const say = (text: string) => {
  fireEvent.change(rule(), { target: { value: text } })
  fireEvent.keyDown(rule(), { key: 'Enter' })
}

afterEach(() => {
  cleanup()
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

describe('the reply (was LearnerInputPanel)', () => {
  it('always has the typed rule, with no mic when speech input is unavailable', async () => {
    render(<Harness start />)
    expect(await screen.findByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: SCENARIO_COPY.micStart })).toBeNull()
  })

  it('starts recording when idle and stops it while recording', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const { rerender } = render(<Harness start overrides={() => ({ speechInputAvailable: true, micState: 'idle', startRecording: start, stopRecording: stop })} />)
    fireEvent.click(await screen.findByRole('button', { name: SCENARIO_COPY.micStart }))
    expect(start).toHaveBeenCalledOnce()
    rerender(<Harness start overrides={() => ({ speechInputAvailable: true, micState: 'recording', startRecording: start, stopRecording: stop })} />)
    fireEvent.click(screen.getByRole('button', { name: SCENARIO_COPY.micStop }))
    expect(stop).toHaveBeenCalledOnce()
  })

  it.each(['requesting-permission', 'processing'] as const)('disables the mic while it is %s', async (micState) => {
    render(<Harness start overrides={() => ({ speechInputAvailable: true, micState })} />)
    const mic = await screen.findByRole('button', { name: SCENARIO_COPY.micStart })
    expect((mic as HTMLButtonElement).disabled).toBe(true)
  })

  it('counts down while listening', async () => {
    render(<Harness start overrides={() => ({ speechInputAvailable: true, micState: 'recording', micElapsedMs: 2500, micMaxDurationMs: 8000 })} />)
    expect(await screen.findByText('LISTENING · 6S LEFT · CTRL+M TO STOP')).toBeTruthy()
  })

  it.each([
    ['permission', SCENARIO_COPY.micPermissionDenied],
    ['no-device', SCENARIO_COPY.micNoDevice],
    ['unsupported', SCENARIO_COPY.micUnsupported],
    ['unknown', SCENARIO_COPY.micFailed],
  ] as const)('says why the mic failed (%s), and the rule still works', async (reason, copy) => {
    render(<Harness start overrides={() => ({ speechInputAvailable: true, micState: 'error', micErrorReason: reason })} />)
    expect((await screen.findByRole('alert')).textContent).toBe(copy)
    expect((rule() as HTMLInputElement).disabled).toBe(false)
  })

  it('shows a transcription error as an alert beside a usable rule', async () => {
    render(<Harness start overrides={() => ({ sttError: SCENARIO_COPY.sttUnusable })} />)
    expect((await screen.findByRole('alert')).textContent).toBe(SCENARIO_COPY.sttUnusable)
    expect((rule() as HTMLInputElement).disabled).toBe(false)
  })

  it('offers the heard transcript for checking before it is sent', async () => {
    render(<Harness start overrides={() => ({ heardTranscript: 'こんにちは' })} />)
    const heard = (await screen.findByText('HEARD')).closest('p') as HTMLElement
    expect(heard.textContent).toContain('こんにちは')
    expect(heard.textContent).toContain(SCENARIO_COPY.heardHint)
  })

  it('will not send an empty reply, nor one while leaving is being asked', async () => {
    const submit = vi.fn()
    render(<Harness start overrides={() => ({ submitResponse: submit })} />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect((screen.getByRole('button', { name: 'Submit response' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(rule(), { key: 'Enter' })
    expect(submit).not.toHaveBeenCalled()

    fireEvent.change(rule(), { target: { value: 'こんにちは' } })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect((rule() as HTMLInputElement).disabled).toBe(true)
    expect(submit).not.toHaveBeenCalled()
  })

  it('sends on ENTER', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    say('こんにちは')
    expect(await screen.findByText('YOU SAID')).toBeTruthy()
  })
})

describe('the hints (was ScenarioHintPanel)', () => {
  it('has no hint button when the line has no hints', async () => {
    render(<Harness start overrides={() => ({ currentHints: [] })} />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect(screen.queryByRole('button', { name: SCENARIO_COPY.hintReveal })).toBeNull()
  })

  it('shows nothing until asked, then one more step each time, Japanese with romaji, counted on the run', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect(screen.queryByText('HINTS', { selector: '.rd-kick span' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: SCENARIO_COPY.hintReveal }))
    expect(screen.getByText('HINTS', { selector: '.rd-kick span' })).toBeTruthy()
    expect(document.querySelectorAll('.cv-slip').length).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: SCENARIO_COPY.hintRevealMore }))
    const slips = document.querySelectorAll('.cv-slip')
    expect(slips.length).toBe(2)
    expect(slips[1].textContent).toContain('こんにちは')
    expect(slips[1].textContent).toContain("kon'nichiwa")
    expect(document.querySelector('.rd-run')?.textContent).toMatch(/2OF \d HINTS/)
  })

  it('stops offering more once every step is showing', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    fireEvent.click(screen.getByRole('button', { name: SCENARIO_COPY.hintReveal }))
    for (let i = 0; i < 5; i++) {
      const more = screen.queryByRole('button', { name: SCENARIO_COPY.hintRevealMore })
      if (!more) break
      fireEvent.click(more)
    }
    expect((screen.getByRole('button', { name: SCENARIO_COPY.hintAllRevealed }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('puts the hints away when the conversation moves to the next line', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    fireEvent.click(screen.getByRole('button', { name: SCENARIO_COPY.hintReveal }))
    expect(screen.getByText('HINTS', { selector: '.rd-kick span' })).toBeTruthy()
    say('こんにちは')
    await screen.findByText('YOU SAID')
    fireEvent.keyDown(document.body, { key: 'Enter' })
    await screen.findByRole('textbox', { name: 'Your response' })
    expect(screen.queryByText('HINTS', { selector: '.rd-kick span' })).toBeNull()
  })

  it('cannot be asked for while leaving is being asked', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect((screen.getByRole('button', { name: SCENARIO_COPY.hintReveal }) as HTMLButtonElement).disabled).toBe(true)
  })
})

async function finishCafe() {
  await screen.findByRole('textbox', { name: 'Your response' })
  for (const line of ['こんにちは', 'コーヒーをください', 'レギュラーでお願いします', 'ここで食べます', 'はい、お願いします', 'ありがとうございます']) {
    say(line)
    await screen.findByText('YOU SAID')
    fireEvent.keyDown(document.body, { key: 'Enter' })
  }
  await screen.findByText('SESSION COMPLETE')
}

function installSaves() {
  const saveScenarioSrsCard = vi.fn(async () => ({ ok: true }))
  window.jplearnDesktop = {
    saveScenarioSession: vi.fn(async (payload: { sessionId: string }) => ({ id: payload.sessionId })),
    saveScenarioSrsCard,
  } as unknown as Window['jplearnDesktop']
  return saveScenarioSrsCard
}

describe('the drafted cards (was SrsDraftReviewPanel)', () => {
  it('shows only pending cards, and an edit before ACCEPT is what gets saved', async () => {
    const saveScenarioSrsCard = installSaves()
    render(<Harness start />)
    await finishCafe()
    const card = await screen.findByRole('group', { name: /^Card 1: / })
    fireEvent.change(within(card).getByLabelText('NOTES'), { target: { value: 'my own note' } })
    fireEvent.click(screen.getByRole('button', { name: /^Accept card: / }))
    await waitFor(() => expect(saveScenarioSrsCard).toHaveBeenCalledWith(expect.objectContaining({ notes: 'my own note' })))
    /* the accepted card leaves the list */
    await waitFor(() => expect(screen.queryByDisplayValue('my own note')).toBeNull())
  })

  it('DISMISS never saves', async () => {
    const saveScenarioSrsCard = installSaves()
    render(<Harness start />)
    await finishCafe()
    const before = Number(/CARDS TO KEEP · (\d+)/.exec(document.body.textContent ?? '')?.[1])
    fireEvent.click(await screen.findByRole('button', { name: /^Dismiss card: / }))
    expect(screen.getByText(`CARDS TO KEEP · ${before - 1}`)).toBeTruthy()
    expect(saveScenarioSrsCard).not.toHaveBeenCalled()
  })

  it('SKIP ALL dismisses every pending card without saving, and then says there are none', async () => {
    const saveScenarioSrsCard = installSaves()
    render(<Harness start />)
    await finishCafe()
    fireEvent.click(await screen.findByRole('button', { name: 'Skip all' }))
    expect(await screen.findByText('NO CARDS LEFT TO REVIEW')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip all' })).toBeNull()
    expect(saveScenarioSrsCard).not.toHaveBeenCalled()
  })

  it('says why a card did not save, and still offers replay and the way back', async () => {
    installSaves()
    render(<Harness start overrides={(t) => (t.screen === 'summary' ? { srsReviewError: 'disk full' } : {})} />)
    await finishCafe()
    expect((await screen.findByRole('alert')).textContent).toBe('disk full')
    expect(screen.getByRole('button', { name: 'Replay scenario' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to the scenes' })).toBeTruthy()
  })
})

function entry(overrides: Partial<ScenarioHistoryEntry> = {}): ScenarioHistoryEntry {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    scenarioId: 'cafe-order',
    scenarioTitle: 'Order at a Cafe',
    learnerLevel: 'beginner',
    completedAtUtc: '2026-07-21T00:05:00.000Z',
    summary: {
      objectives: [{ id: 'obj-order', label: 'Order a drink', status: 'met' }],
      corrections: [], vocabularyPractised: ['コーヒー'], grammarPractised: [], recurringMistakes: [], suggestedNextSteps: [],
    },
    transcript: [],
    ...overrides,
  }
}

function History({ overrides }: { overrides: Partial<UseScenarioTutorReturn> }) {
  return <Harness overrides={() => ({ screen: 'history', ...overrides })} />
}

describe('past sessions (was ScenarioHistoryPanel)', () => {
  it('says it is loading', async () => {
    render(<History overrides={{ historyEntries: null, historyLoading: true }} />)
    expect(await screen.findByText('LOADING…')).toBeTruthy()
  })

  it('says when there are none', async () => {
    render(<History overrides={{ historyEntries: [], historyLoading: false }} />)
    expect(await screen.findByText('No completed sessions yet.')).toBeTruthy()
  })

  it('says why they could not be read', async () => {
    render(<History overrides={{ historyEntries: [], historyError: 'locked' }} />)
    expect((await screen.findByRole('alert')).textContent).toBe('locked')
  })

  it('reads out the one the cursor is on, and the arrows move it', async () => {
    const second = entry({ id: '2', scenarioTitle: 'Directions in Shinjuku', summary: { ...entry().summary, objectives: [{ id: 'a', label: 'Ask the way', status: 'assisted' }] } })
    render(<History overrides={{ historyEntries: [entry(), second] }} />)
    expect(await screen.findByRole('region', { name: 'Summary for Order at a Cafe' })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    const region = screen.getByRole('region', { name: 'Summary for Directions in Shinjuku' })
    expect(within(region).getByText('Ask the way')).toBeTruthy()
    expect(within(region).getByText('ASSISTED')).toBeTruthy()
  })

  it('asks before deleting one session', async () => {
    const del = vi.fn()
    render(<History overrides={{ historyEntries: [entry()], deleteHistoryEntry: del }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete session: Order at a Cafe' }))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm deleting this session' })
    fireEvent.click(within(ask).getByRole('button', { name: 'KEEP IT' }))
    expect(del).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete session: Order at a Cafe' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'YES, DELETE' }))
    expect(del).toHaveBeenCalledWith(entry().id)
  })

  it('asks before clearing them all', async () => {
    const clear = vi.fn()
    render(<History overrides={{ historyEntries: [entry()], clearHistory: clear }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm clearing all sessions' })
    fireEvent.click(within(ask).getByRole('button', { name: 'KEEP THEM' }))
    expect(clear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'YES, CLEAR ALL' }))
    expect(clear).toHaveBeenCalledOnce()
  })
})
