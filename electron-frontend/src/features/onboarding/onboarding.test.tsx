import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { OnboardingWizard } from './OnboardingWizard'
import { useOnboarding } from './useOnboarding'
import { FAMILIARITY_ITEMS } from './constants'
import { knownItemsFromChecked, onboardingFailureSentence, saveOnboarding } from './utils'
import type { OnboardingFailure, OnboardingWizardProps } from './types'

type Submit = (...args: unknown[]) => Promise<OnboardingFailure | null>

function makeProps(overrides: Partial<OnboardingWizardProps> = {}): OnboardingWizardProps {
  return {
    showChatbotSection: false,
    assistantChatEnabled: false,
    onAssistantChatToggle: vi.fn(),
    showVoiceSection: false,
    voiceOptions: [],
    voiceEnabled: false,
    voiceSpeaker: '',
    voiceBusy: false,
    onVoiceToggle: vi.fn(),
    onVoiceSelect: vi.fn(),
    showFontSection: false,
    appFont: 'system_ui',
    fontOptions: [],
    onAppFontSelect: vi.fn(),
    fontSize: 'medium',
    fontSizeOptions: [],
    onFontSizeSelect: vi.fn(),
    onComplete: vi.fn(async () => null),
    onSkip: vi.fn(async () => null),
    ...overrides,
  }
}

const IPC = (reason: string) => new Error(`Error invoking remote method 'study:apply-known-items': Error: ${reason}`)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the checklist', () => {
  it('offers the eight decks the bridge can seed, N3 split in two', () => {
    expect(FAMILIARITY_ITEMS.map((i) => [i.key, i.label, i.description])).toEqual([
      ['hiragana', 'Hiragana', 'All 46 basic phonetic characters'],
      ['katakana', 'Katakana', 'The script for foreign words'],
      ['kanji_n5', 'N5 Kanji', '~100 basic Chinese-origin characters'],
      ['vocab_n5', 'N5 Vocabulary', '~750 essential beginner words'],
      ['kanji_n4', 'N4 Kanji', '~150 more everyday kanji'],
      ['vocab_n4', 'N4 Vocabulary', '~650 everyday conversation words'],
      ['kanji_n3', 'N3 Kanji', '~350 intermediate kanji'],
      ['vocab_n3', 'N3 Vocabulary', '~2,100 intermediate words'],
    ])
  })

  it('sends only checklist keys, in checklist order', () => {
    expect(knownItemsFromChecked(new Set(['vocab_n3', 'kanji_n1', 'hiragana']))).toEqual(['hiragana', 'vocab_n3'])
  })
})

/* audit 12: a tick seeds only its own deck, nothing ticked seeds nothing, and a failed seed is not
   followed by recording onboarding as finished */
describe('saveOnboarding', () => {
  const steps = () => ({
    applyKnownItems: vi.fn(async () => undefined),
    afterSeeded: vi.fn(async () => undefined),
    completeOnboarding: vi.fn(async () => undefined),
  })

  it('does not call applyKnownItems when nothing is ticked', async () => {
    const s = steps()
    expect(await saveOnboarding(new Set(), {}, s)).toBeNull()
    expect(s.applyKnownItems).not.toHaveBeenCalled()
    expect(s.afterSeeded).not.toHaveBeenCalled()
    expect(s.completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('sends the ticked keys, then records onboarding', async () => {
    const s = steps()
    const answers = { goal: 'jlpt' }
    expect(await saveOnboarding(new Set(['kanji_n3', 'katakana']), answers, s)).toBeNull()
    expect(s.applyKnownItems).toHaveBeenCalledWith(['katakana', 'kanji_n3'])
    expect(s.afterSeeded).toHaveBeenCalledTimes(1)
    expect(s.completeOnboarding).toHaveBeenCalledWith(answers)
  })

  it('stops at a failed seed and names that stage, with the IPC wrapper peeled off', async () => {
    const s = steps()
    s.applyKnownItems.mockRejectedValueOnce(IPC('Python bridge exited'))
    expect(await saveOnboarding(new Set(['hiragana']), {}, s))
      .toEqual({ stage: 'known_items', message: 'Python bridge exited' })
    expect(s.completeOnboarding).not.toHaveBeenCalled()
  })

  it('names the finishing stage when recording onboarding fails', async () => {
    const s = steps()
    s.completeOnboarding.mockRejectedValueOnce(IPC('database is locked'))
    expect(await saveOnboarding(new Set(), {}, s))
      .toEqual({ stage: 'complete', message: 'database is locked' })
  })
})

describe('useOnboarding: a failed save', () => {
  it("says \"Couldn't save what you already know\" when the seed failed", async () => {
    const onSkip = vi.fn(async () => ({ stage: 'known_items', message: 'Python bridge exited' }) as OnboardingFailure)
    const { result } = renderHook(() => useOnboarding(makeProps({ onSkip })))
    await act(() => result.current.handleSkip())
    expect(result.current.submitError).toBe("Couldn't save what you already know: Python bridge exited")
    expect(result.current.submitting).toBe(false)
  })

  it("says \"Couldn't finish onboarding\" when recording it failed", async () => {
    const onComplete = vi.fn(async () => ({ stage: 'complete', message: 'database is locked' }) as OnboardingFailure)
    const { result } = renderHook(() => useOnboarding(makeProps({ onComplete })))
    await act(() => result.current.handleStart())
    expect(result.current.submitError).toBe("Couldn't finish onboarding: database is locked")
  })

  it('treats a handler that throws as onboarding not finished', async () => {
    const onComplete = vi.fn(async () => { throw IPC('bridge gone') })
    const { result } = renderHook(() => useOnboarding(makeProps({ onComplete })))
    await act(() => result.current.handleStart())
    expect(result.current.submitError).toBe("Couldn't finish onboarding: bridge gone")
  })

  it('passes the ticked items to the handler', async () => {
    const onComplete = vi.fn<Submit>(async () => null)
    const { result } = renderHook(() => useOnboarding(makeProps({ onComplete })))
    act(() => { result.current.toggleItem('kanji_n3'); result.current.toggleItem('vocab_n3') })
    await act(() => result.current.handleStart())
    expect(onComplete.mock.calls[0][1]).toEqual(new Set(['kanji_n3', 'vocab_n3']))
    expect(result.current.submitError).toBeNull()
  })
})

/* The wizard's pages type their titles out first; until then StepLayout draws only the title and
   Skip. Fake timers run the typewriters to the end. */
async function finishTyping() {
  await act(async () => { vi.advanceTimersByTime(15_000) })
}

async function flush() {
  await act(async () => { await Promise.resolve() })
}

async function goToReadyPage() {
  await finishTyping()
  while (!screen.queryByRole('button', { name: /Start Complete Beginner Path|Starting…/ })) {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await finishTyping()
  }
}

describe('OnboardingWizard: leaving says why it could not', () => {
  it('shows the alert after Skip pressed while a page is still typing its title', async () => {
    vi.useFakeTimers()
    const onSkip = vi.fn(async () => ({ stage: 'known_items', message: 'Python bridge exited' }) as OnboardingFailure)
    render(<OnboardingWizard {...makeProps({ onSkip })} />)
    await finishTyping()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    /* page two is mid-typewriter: only its title and Skip are drawn */
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
    await flush()
    expect(screen.getByRole('alert').textContent).toBe("Couldn't save what you already know: Python bridge exited")
    expect(screen.getByRole('button', { name: 'Skip setup' })).toHaveProperty('disabled', false)
  })

  it('sends one request however many times Start is pressed while it is out', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const onComplete = vi.fn(() => new Promise<OnboardingFailure | null>((resolve) => { release = () => resolve(null) }))
    const onSkip = vi.fn(async () => null)
    render(<OnboardingWizard {...makeProps({ onComplete, onSkip })} />)
    await goToReadyPage()

    const start = screen.getByRole('button', { name: /Start Complete Beginner Path/ })
    fireEvent.click(start)
    fireEvent.click(start)
    await flush()
    expect(screen.getByRole('button', { name: 'Starting…' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onSkip).not.toHaveBeenCalled()

    release()
    await flush()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retries the whole save when Start is pressed again after a failure', async () => {
    vi.useFakeTimers()
    const onComplete = vi.fn<Submit>()
      .mockResolvedValueOnce({ stage: 'complete', message: 'database is locked' })
      .mockResolvedValueOnce(null)
    render(<OnboardingWizard {...makeProps({ onComplete })} />)
    await goToReadyPage()

    fireEvent.click(screen.getByRole('button', { name: /Start Complete Beginner Path/ }))
    await flush()
    expect(screen.getByRole('alert').textContent).toBe("Couldn't finish onboarding: database is locked")

    const again = screen.getByRole('button', { name: /Start Complete Beginner Path/ })
    expect(again).toHaveProperty('disabled', false)
    fireEvent.click(again)
    await flush()
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('onboardingFailureSentence', () => {
  it('shows only the first line of a multi-line reason', () => {
    expect(onboardingFailureSentence({ stage: 'complete', message: 'Python bridge failed\ncommand: python\nstderr: ...' }))
      .toBe("Couldn't finish onboarding: Python bridge failed")
  })
})
