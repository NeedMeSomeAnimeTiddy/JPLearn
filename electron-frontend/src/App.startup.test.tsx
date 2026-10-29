import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import App from './App'
import { baseDesktopApi } from './test-fixtures/desktopApi'
import { saveSummarySnapshot } from './lib/appStorage'
import { useTutor } from './features/tutor'
import type { TutorDeps, TutorSettingsFields } from './features/tutor/types'
import type { StudySummaryPayload } from './types'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => <span>{sequence[0]}</span>,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

const ENGINE_FAILED = "JPLearn couldn't start its study engine."

/** a recommendation with five cards due, so the hero has something true to say */
const BLOCK = {
  recommendations: [{
    node_id: 'hiragana', display_label: 'Warm up with Hiragana', review_count: 5,
    difficulty: 'easy', reason: 'overdue_reviews', priority: 1, section: 'study',
    minigame: 'recognition', section_label: 'Hiragana', leech_focus_enabled: null,
  }],
  learner_stage: 'starter', stage_label: 'Starter', session_minutes: 10, session_note: '',
}

const PATH = { onboarding_complete: true }
const XP = { level: 1, total_xp: 0, xp_to_next_level: 100, xp_for_current_level: 100 }

function mount(overrides: Record<string, unknown> = {}) {
  window.jplearnDesktop = { ...baseDesktopApi, ...overrides } as unknown as typeof window.jplearnDesktop
  return render(<App />)
}

async function palette(label: string) {
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
  const search = await screen.findByRole('textbox', { name: /search commands/i })
  fireEvent.change(search, { target: { value: label } })
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

/** lets every pending bridge promise settle, so a call that is coming has come */
const settle = () => new Promise((resolve) => { window.setTimeout(resolve, 50) })

describe('a study engine that fails at launch (audit 11, F1)', () => {
  it('says so in place of the hero, and a Retry that works brings the home data back', async () => {
    const summary = await baseDesktopApi.getStudySummary()
    let engineUp = false
    const getStudySummary = vi.fn(async () => {
      if (!engineUp) throw new Error('No module named fugashi')
      return summary
    })
    const getRecommendations = vi.fn(async () => {
      if (!engineUp) throw new Error('No module named fugashi')
      return BLOCK
    })
    mount({ getStudySummary, getRecommendations })

    expect(await screen.findByText(ENGINE_FAILED)).toBeTruthy()
    expect(screen.getByText('No module named fugashi')).toBeTruthy()
    // never drawn as a clear day
    expect(screen.queryByText(/nothing due/i, { selector: '.sh-fig em' })).toBeNull()
    expect(getRecommendations).toHaveBeenCalledTimes(1)

    engineUp = true
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.queryByText(ENGINE_FAILED)).toBeNull())
    await waitFor(() => expect(document.querySelector('.sh-fig b')?.textContent).toBe('5'))
    expect(document.querySelector('.sh-fig i')?.textContent).toBe('CARDS DUE')
    expect(getRecommendations).toHaveBeenCalledTimes(2)
    expect(getStudySummary).toHaveBeenCalledTimes(2)
  })

  it('does not show a saved snapshot as current while the engine has failed', async () => {
    const summary = await baseDesktopApi.getStudySummary()
    saveSummarySnapshot({
      ...summary,
      streak: { current_days: 37, best_days: 37, freezes_available: 0 },
    } as unknown as StudySummaryPayload)

    /* the control: with the engine still thinking, the snapshot is what shows */
    mount({ getStudySummary: () => new Promise(() => undefined) })
    expect(await screen.findByLabelText('Streak — 37 days')).toBeTruthy()
    cleanup()

    mount({ getStudySummary: async () => { throw new Error('Database unavailable: locked') } })
    expect(await screen.findByText(ENGINE_FAILED)).toBeTruthy()
    expect(screen.queryByLabelText('Streak — 37 days')).toBeNull()
  })

  it('treats a missing summary API as a failure, not as a summary', async () => {
    mount({ getStudySummary: async () => undefined })
    expect(await screen.findByText(ENGINE_FAILED)).toBeTruthy()
  })

  it('ignores a second Retry while the first is still out', async () => {
    let calls = 0
    const getStudySummary = vi.fn(() => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('Bridge exited'))
      return new Promise(() => undefined)
    })
    mount({ getStudySummary })
    expect(await screen.findByText(ENGINE_FAILED)).toBeTruthy()

    const retry = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    await waitFor(() => expect(retry.getAttribute('aria-disabled')).toBe('true'))
    fireEvent.click(retry)
    expect(getStudySummary).toHaveBeenCalledTimes(2)
  })
})

describe('the home data at launch (audit 11, F5)', () => {
  it('is fetched once, not again when the first summary arrives, and again after a later refresh', async () => {
    const getXpProgress = vi.fn(async () => XP)
    const getRecommendations = vi.fn(async () => BLOCK)
    const getLearningPathStatus = vi.fn(async () => PATH)
    const getStudySummary = vi.fn(baseDesktopApi.getStudySummary)
    mount({ getXpProgress, getRecommendations, getLearningPathStatus, getStudySummary })

    await waitFor(() => expect(document.querySelector('.sh-fig b')?.textContent).toBe('5'))
    await waitFor(() => expect(getStudySummary).toHaveBeenCalledTimes(1))
    await settle()
    expect(getXpProgress).toHaveBeenCalledTimes(1)
    expect(getRecommendations).toHaveBeenCalledTimes(1)
    expect(getLearningPathStatus).toHaveBeenCalledTimes(1)

    await palette('Refresh Data')
    await waitFor(() => expect(getStudySummary).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(2))
    expect(getXpProgress).toHaveBeenCalledTimes(2)
    expect(getLearningPathStatus).toHaveBeenCalledTimes(2)
  })

  it('drops a slower old answer that comes back after a newer one', async () => {
    const empty = { ...BLOCK, recommendations: [] }
    let releaseOld!: () => void
    let calls = 0
    const getRecommendations = vi.fn(() => {
      calls += 1
      // the first (mount) answer is slow and stale; the second (refresh) is quick and new
      if (calls === 1) return new Promise((resolve) => { releaseOld = () => resolve(empty) })
      return Promise.resolve(BLOCK)
    })
    const getStudySummary = vi.fn(baseDesktopApi.getStudySummary)
    mount({ getRecommendations, getStudySummary, getLearningPathStatus: async () => PATH })

    await waitFor(() => expect(getStudySummary).toHaveBeenCalledTimes(1))
    await palette('Refresh Data')
    await waitFor(() => expect(document.querySelector('.sh-fig b')?.textContent).toBe('5'))

    releaseOld()
    await settle()
    expect(document.querySelector('.sh-fig b')?.textContent).toBe('5')
  })
})

describe('the tutor warmup (audit 11, F3)', () => {
  it('is asked for once after startup-ready while the chat is on', async () => {
    const preloadAssistantChatRuntime = vi.fn(async () => ({ ok: true, reason: '', coldStart: false, loaded: true }))
    const notifyStartupReady = vi.fn(async () => ({ ok: true }))
    mount({ preloadAssistantChatRuntime, notifyStartupReady })

    expect(preloadAssistantChatRuntime).not.toHaveBeenCalled()
    await waitFor(() => expect(notifyStartupReady).toHaveBeenCalledTimes(1), { timeout: 3000 })
    await waitFor(() => expect(preloadAssistantChatRuntime).toHaveBeenCalledTimes(1))
    await settle()
    expect(preloadAssistantChatRuntime).toHaveBeenCalledTimes(1)
  })

  it('is never asked for while the chat is off', async () => {
    window.localStorage.setItem('jplearn-desktop-settings-v1', JSON.stringify({ assistantChatEnabled: false }))
    const preloadAssistantChatRuntime = vi.fn(async () => ({ ok: true, reason: '', coldStart: false, loaded: true }))
    const notifyStartupReady = vi.fn(async () => ({ ok: true }))
    mount({ preloadAssistantChatRuntime, notifyStartupReady })

    await waitFor(() => expect(notifyStartupReady).toHaveBeenCalledTimes(1), { timeout: 3000 })
    await settle()
    expect(preloadAssistantChatRuntime).not.toHaveBeenCalled()
  })

  it('is asked for once more when the chat is switched from off to on', () => {
    const preloadAssistantChatRuntime = vi.fn(async () => ({ ok: true, reason: '', coldStart: false, loaded: true }))
    const unloadAssistantChatRuntime = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = {
      preloadAssistantChatRuntime,
      unloadAssistantChatRuntime,
      getAssistantSnapshot: vi.fn(async () => ({ ok: true })),
    } as unknown as Window['jplearnDesktop']

    const settings = (assistantChatEnabled: boolean): TutorSettingsFields => ({
      assistantToastLimit: 0, assistantChatEnabled, assistantChatAudioEnabled: false,
      assistantChatOcrMinConfidence: 0.5, scenarioAiEvaluationEnabled: true, romajiConversionEnabled: true,
    })
    const deps: TutorDeps = {
      voice: {
        playVoiceRuntimeAudio: vi.fn(async () => true),
        cancelAssistantSpeech: vi.fn(),
        assistantSpeechRunIdRef: { current: 0 },
        splitSpeechSegments: () => [],
      },
      isInMinigameSession: false, activeSessionId: null, activeScript: 'hiragana',
      ocrInstalled: false, onToastNavigate: vi.fn(),
    }

    const { result, rerender } = renderHook(
      ({ enabled }) => useTutor(settings(enabled), deps),
      { initialProps: { enabled: false } },
    )
    act(() => { result.current.notifyTutorStartupReady() })
    expect(preloadAssistantChatRuntime).not.toHaveBeenCalled()

    rerender({ enabled: true })
    rerender({ enabled: true })
    expect(preloadAssistantChatRuntime).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    expect(unloadAssistantChatRuntime).toHaveBeenCalled()
    rerender({ enabled: true })
    expect(preloadAssistantChatRuntime).toHaveBeenCalledTimes(2)
  })

  it('is not asked for before startup-ready, even with the chat on', () => {
    const preloadAssistantChatRuntime = vi.fn(async () => ({ ok: true, reason: '', coldStart: false, loaded: true }))
    window.jplearnDesktop = {
      preloadAssistantChatRuntime,
      getAssistantSnapshot: vi.fn(async () => ({ ok: true })),
    } as unknown as Window['jplearnDesktop']
    const deps: TutorDeps = {
      voice: {
        playVoiceRuntimeAudio: vi.fn(async () => true),
        cancelAssistantSpeech: vi.fn(),
        assistantSpeechRunIdRef: { current: 0 },
        splitSpeechSegments: () => [],
      },
      isInMinigameSession: false, activeSessionId: null, activeScript: 'hiragana',
      ocrInstalled: false, onToastNavigate: vi.fn(),
    }
    const { result } = renderHook(() => useTutor({
      assistantToastLimit: 0, assistantChatEnabled: true, assistantChatAudioEnabled: false,
      assistantChatOcrMinConfidence: 0.5, scenarioAiEvaluationEnabled: true, romajiConversionEnabled: true,
    }, deps))
    expect(preloadAssistantChatRuntime).not.toHaveBeenCalled()
    act(() => { result.current.notifyTutorStartupReady() })
    act(() => { result.current.notifyTutorStartupReady() })
    expect(preloadAssistantChatRuntime).toHaveBeenCalledTimes(1)
  })
})
