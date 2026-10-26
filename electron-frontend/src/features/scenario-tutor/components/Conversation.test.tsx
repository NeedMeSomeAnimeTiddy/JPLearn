import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import axe from 'axe-core'
import { Conversation } from './Conversation'
import { useScenarioTutor, type UseScenarioTutorReturn } from '../useScenarioTutor'
import type { MicRecorderState } from '../../../hooks/useMicRecorder'

/* ==================================================================================================
   THE CONVERSATION SCREEN, driven through the real `useScenarioTutor` and the real cafe scenario.
   Only the microphone is faked (jsdom has no recorder), by overriding the hook's mic fields.
   ================================================================================================== */

type Overrides = (tutor: UseScenarioTutorReturn) => Partial<UseScenarioTutorReturn>

function Harness({
  start = false, onLeave = () => {}, overrides,
}: { start?: boolean; onLeave?: () => void; overrides?: Overrides }) {
  const real = useScenarioTutor()
  const [romaji, setRomaji] = useState(false)
  const { screen: at, selectScenario, startScenario } = real
  useEffect(() => {
    if (at === 'select') selectScenario('cafe-order')
    else if (at === 'intro' && start) startScenario('beginner')
  }, [at, start, selectScenario, startScenario])
  const tutor = overrides ? { ...real, ...overrides(real) } : real
  /* the app opens the screen already standing on a scene, so the harness waits until it is */
  const [ready, setReady] = useState(false)
  useEffect(() => { if (at !== 'select') setReady(true) }, [at])
  if (!ready) return null
  return (
    <Conversation
      scenarioTutor={tutor}
      romajiEnabled={romaji}
      onToggleRomaji={() => setRomaji((on) => !on)}
      audioEnabled={false}
      onToggleAudio={() => {}}
      onLeave={onLeave}
    />
  )
}

function rule() {
  return screen.getByRole('textbox', { name: 'Your response' })
}

function say(text: string) {
  fireEvent.change(rule(), { target: { value: text } })
  fireEvent.keyDown(rule(), { key: 'Enter' })
}

function enter() {
  fireEvent.keyDown(document.body, { key: 'Enter' })
}

const saved = (payload: { sessionId: string }) => ({ id: payload.sessionId })

afterEach(() => {
  cleanup()
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

describe('Conversation — before it starts', () => {
  it('draws the scene, its objectives and the two levels, and starts on ENTER', async () => {
    render(<Harness />)
    expect(await screen.findByText('BARISTA · CAFE STAFF')).toBeTruthy()
    expect(screen.getByText('カフェで注文する')).toBeTruthy()
    expect(screen.getByText(/^\d NEEDED · \d OPTIONAL$/)).toBeTruthy()
    expect(screen.getByText('0 OF 4 NEEDED · 2 OPTIONAL')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Beginner' }).getAttribute('aria-pressed')).toBe('true'))

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(screen.getByRole('button', { name: 'Intermediate' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: 'Beginner' }).getAttribute('aria-pressed')).toBe('true')

    enter()
    expect(await screen.findByRole('textbox', { name: 'Your response' })).toBeTruthy()
    /* the English is always on the sheet beside the Japanese */
    expect(screen.getByText('Welcome!')).toBeTruthy()
  })

  it('goes back to the scenes on ESC, and keeps the past sessions a tab away', async () => {
    const onLeave = vi.fn()
    window.jplearnDesktop = {
      listScenarioSessions: async () => ({
        sessions: [{
          id: 's1', scenario_id: 'cafe-order', scenario_version: 1, learner_level: 'beginner',
          started_at_utc: '2026-10-01T00:00:00Z', completed_at_utc: '2026-10-01T00:05:00Z', transcript: [],
          summary: { objectives: [{ id: 'o', label: 'Order a drink', status: 'met' }], corrections: [], vocabularyPractised: ['コーヒー'], grammarPractised: [], recurringMistakes: [], suggestedNextSteps: [] },
        }],
      }),
      deleteScenarioSession: vi.fn(async () => ({ ok: true })),
    } as unknown as Window['jplearnDesktop']
    render(<Harness onLeave={onLeave} />)
    await screen.findByText('BARISTA · CAFE STAFF')

    fireEvent.click(screen.getByRole('button', { name: 'Past sessions' }))
    expect(await screen.findByText('Order at a Cafe')).toBeTruthy()
    const summary = screen.getByRole('region', { name: 'Summary for Order at a Cafe' })
    expect(within(summary).getByText('Order a drink')).toBeTruthy()

    /* deleting asks on the slab first */
    fireEvent.click(screen.getByRole('button', { name: 'Delete session: Order at a Cafe' }))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm deleting this session' })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(ask).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(await screen.findByText('BARISTA · CAFE STAFF')).toBeTruthy()
    expect(onLeave).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onLeave).toHaveBeenCalledOnce()
  })
})

describe('Conversation — answering', () => {
  it('holds the answer and its correction on the sheet until ENTER', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })

    say('こんにちは')
    expect(await screen.findByText('YOU SAID')).toBeTruthy()
    expect(screen.getByText('RIGHT')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Your response' })).toBeNull()
    enter()
    await screen.findByRole('textbox', { name: 'Your response' })

    /* a bare drink name: understood, but missing the polite request */
    say('コーヒー')
    expect(await screen.findByText('PARTIAL')).toBeTruthy()
    const fix = screen.getByText('TRY SAYING IT LIKE THIS').closest('.cv-slip') as HTMLElement
    expect(fix.textContent).toContain('コーヒーをください')
    expect(fix.textContent).toContain('ko-hi- wo kudasai')
    expect(screen.getByText(/^THE BARISTA, NEXT$/)).toBeTruthy()

    /* it stays through anything that is not ENTER */
    fireEvent.keyDown(document.body, { key: 'a' })
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(screen.getByText('TRY SAYING IT LIKE THIS')).toBeTruthy()

    enter()
    expect(await screen.findByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.queryByText('TRY SAYING IT LIKE THIS')).toBeNull()
  })

  it('shows hints only when asked, one more each time, without spending the turn', async () => {
    render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect(screen.queryByText("kon'nichiwa")).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))
    expect(screen.getByText('Greet them back — any normal greeting works here.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show another hint' }))
    expect(screen.getByText('こんにちは')).toBeTruthy()
    expect(screen.getByText("kon'nichiwa")).toBeTruthy()

    expect(rule()).toBeTruthy()
    say('こんにちは')
    await screen.findByText('YOU SAID')
    enter()
    expect(await screen.findByText('What would you like to order?')).toBeTruthy()
  })

  it('asks on the slab before leaving, and ESC again keeps going', async () => {
    const onLeave = vi.fn()
    render(<Harness start onLeave={onLeave} />)
    await screen.findByRole('textbox', { name: 'Your response' })

    fireEvent.keyDown(document.body, { key: 'Escape' })
    const ask = screen.getByRole('alertdialog', { name: 'Confirm leaving the scenario' })
    expect(within(ask).getByText('LEAVE THIS SCENARIO?')).toBeTruthy()
    expect(screen.getByText('Your progress in this session will be discarded.')).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onLeave).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Leave scenario' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'YES, DISCARD' }))
    await waitFor(() => expect(onLeave).toHaveBeenCalledOnce())
  })

  it('toggles the microphone with CTRL+M, from the rule as well as the sheet', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    let micState: MicRecorderState = 'idle'
    const overrides: Overrides = () => ({
      speechInputAvailable: true, micState, startRecording: start, stopRecording: stop,
    })
    const { rerender } = render(<Harness start overrides={overrides} />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect(screen.getByText('CTRL+M', { selector: '.hints b' })).toBeTruthy()

    fireEvent.keyDown(rule(), { key: 'm', ctrlKey: true })
    expect(start).toHaveBeenCalledOnce()
    expect(stop).not.toHaveBeenCalled()

    micState = 'recording'
    rerender(<Harness start overrides={overrides} />)
    expect(screen.getByRole('button', { name: 'Stop recording' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'M', ctrlKey: true })
    expect(stop).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
  })

  it('has no CTRL+M and no mic when speech recognition is not available', async () => {
    const start = vi.fn()
    render(<Harness start overrides={() => ({ speechInputAvailable: false, startRecording: start })} />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect(screen.queryByRole('button', { name: 'Start recording your response' })).toBeNull()
    fireEvent.keyDown(rule(), { key: 'm', ctrlKey: true })
    expect(start).not.toHaveBeenCalled()
  })
})

async function finishCafe() {
  await screen.findByRole('textbox', { name: 'Your response' })
  for (const line of ['こんにちは', 'コーヒーをください', 'レギュラーでお願いします', 'ここで食べます', 'はい、お願いします', 'ありがとうございます']) {
    say(line)
    await screen.findByText('YOU SAID')
    enter()
  }
  return screen.findByText('SESSION COMPLETE')
}

describe('Conversation — finished', () => {
  it('opens one drafted card at a time with one ACCEPT, and the arrows move between them', async () => {
    const saveScenarioSrsCard = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(async (payload: { sessionId: string }) => saved(payload)),
      saveScenarioSrsCard,
    } as unknown as Window['jplearnDesktop']
    render(<Harness start />)
    await finishCafe()

    const first = await screen.findByRole('group', { name: /^Card 1: / })
    /* one card is open: four fields, one DISMISS, and the slab is the only ACCEPT */
    expect(within(first).getAllByRole('textbox')).toHaveLength(4)
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /^Accept card: / })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Dismiss card: / })).toHaveLength(1)

    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    const second = screen.getByRole('group', { name: /^Card 2: / })
    const front = (within(second).getByLabelText('FRONT') as HTMLInputElement).value
    expect(screen.getByRole('button', { name: `Accept card: ${front}` })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'ArrowUp' })
    expect(screen.getByRole('group', { name: /^Card 1: / })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })

    enter()
    await waitFor(() => expect(saveScenarioSrsCard).toHaveBeenCalledOnce())
    expect(saveScenarioSrsCard).toHaveBeenCalledWith(expect.objectContaining({ front }))

    fireEvent.click(screen.getByRole('button', { name: 'Skip all' }))
    expect(await screen.findByText(/NO CARDS LEFT TO REVIEW · 1 KEPT/)).toBeTruthy()
    expect(saveScenarioSrsCard).toHaveBeenCalledOnce()
  })

  it('offers TRY SAVING AGAIN when the save fails, and drafts the cards once it lands', async () => {
    let calls = 0
    const saveScenarioSession = vi.fn(async (payload: { sessionId: string }) => {
      calls += 1
      if (calls === 1) throw new Error('database is locked')
      return saved(payload)
    })
    window.jplearnDesktop = { saveScenarioSession, saveScenarioSrsCard: vi.fn() } as unknown as Window['jplearnDesktop']
    render(<Harness start />)
    await finishCafe()

    const reason = await screen.findByRole('alert')
    expect(reason.textContent).toContain('could not be saved (database is locked)')
    expect(screen.queryByRole('button', { name: /^Accept card: / })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /TRY SAVING AGAIN/ }))
    expect(await screen.findByRole('button', { name: /^Accept card: / })).toBeTruthy()
    expect(saveScenarioSession).toHaveBeenCalledTimes(2)
  })

  it('pages the details and the transcript instead of scrolling them', async () => {
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(async (payload: { sessionId: string }) => saved(payload)),
    } as unknown as Window['jplearnDesktop']
    render(<Harness start />)
    await finishCafe()
    expect(screen.getByText('NEEDED OBJECTIVES MET')).toBeTruthy()
    const pager = screen.getByText(/^PAGE/).querySelector('i') as HTMLElement
    const pages = Number(pager.textContent?.split(' OF ')[1])
    expect(pages).toBeGreaterThan(1)

    fireEvent.click(screen.getByRole('button', { name: 'Show the details and the full transcript' }))
    expect(screen.queryByText('NEEDED OBJECTIVES MET')).toBeNull()
    expect(screen.getAllByText('YOU').length).toBeGreaterThan(0)
    act(() => { for (let i = 1; i < pages; i++) fireEvent.keyDown(document.body, { key: 'PageDown' }) })
    expect(screen.getByText('NEEDED OBJECTIVES MET')).toBeTruthy()
  })

  it('has no accessibility violations while asking or when finished', async () => {
    window.jplearnDesktop = {
      saveScenarioSession: vi.fn(async (payload: { sessionId: string }) => saved(payload)),
    } as unknown as Window['jplearnDesktop']
    const { container } = render(<Harness start />)
    await screen.findByRole('textbox', { name: 'Your response' })
    expect((await axe.run(container)).violations).toEqual([])
    await finishCafe()
    await screen.findByRole('button', { name: /^Accept card: / })
    expect((await axe.run(container)).violations).toEqual([])
  })
})
