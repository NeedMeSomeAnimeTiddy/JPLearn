/**
 * Automated accessibility checks using axe-core.
 * Covers the app in onboarding state and post-onboarding home state.
 * Zero violations is the pass threshold.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
// axe-core ships as a CJS export = module; Vite handles interop at runtime.
import axe from 'axe-core'
import App from './App'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence, style, className }: { sequence: (string | number)[]; style?: React.CSSProperties; className?: string }) => {
    const text = typeof sequence[0] === 'string' ? sequence[0] : ''
    return <span className={className} style={style}>{text}</span>
  },
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

const originalCSS = (globalThis as any).CSS
;(globalThis as any).CSS = { ...originalCSS, supports: () => true }
const getComputedStyleWithoutPseudo = window.getComputedStyle.bind(window)
window.getComputedStyle = (element: Element) => getComputedStyleWithoutPseudo(element)
import { baseDesktopApi } from './test-fixtures/desktopApi'


function formatViolations(violations: Array<{ id: string; description: string; nodes: unknown[] }>): string {
  return violations
    .map((v) => `  [${v.id}] ${v.description} (${v.nodes.length} node(s))`)
    .join('\n')
}

describe('Accessibility — zero axe violations', () => {
  it('onboarding view has no violations', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in onboarding view:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })

  it('home view has no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in home view:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })

  it('the Tutor menu has no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Open Tutor' }))
    await screen.findByRole('dialog', { name: 'Tutor menu' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in Tutor menu:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })

  it('the Scenario Practice intro and player screens have no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Open Tutor' }))
    const menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    let results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in Scenario Practice intro:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))
    await within(dialog).findByRole('textbox', { name: 'Your response' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in Scenario Practice player:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })

  it('every other shared-popup activity has no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Open Tutor' }))

    const runAxe = async (label: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
      if (results.violations.length > 0) {
        throw new Error(`axe violations in ${label}:\n${formatViolations(results.violations)}`)
      }
      expect(results.violations).toHaveLength(0)
    }

    let menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Chat with Tutor' }))
    await screen.findByRole('dialog', { name: 'Tutor chat panel' })
    await runAxe('the Tutor chat panel')

    fireEvent.click(screen.getByRole('button', { name: 'Back to Tutor menu' }))
    menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Image Translation' }))
    await screen.findByRole('dialog', { name: 'OCR translator panel' })
    await runAxe('the Image Translation panel')

    fireEvent.click(screen.getByRole('button', { name: 'Back to Tutor menu' }))
    menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Past sessions' }))
    await within(dialog).findByRole('button', { name: 'Back to scenario list' })
    await runAxe('the Scenario Practice history screen')
  })

  it('the Scenario Practice summary, SRS review, and voice controls have no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = {
      ...baseDesktopApi,
      // With the speech runtime available the player also renders its mic
      // control and live status region.
      getSpeechStatus: async () => ({ available: true, running: true, lastError: null }),
      transcribeSpeech: async () => ({ text: '', confidence: 0, durationMs: 0 }),
      saveScenarioSession: async (payload: { sessionId: string; scenarioId: string; scenarioVersion: number; learnerLevel: string; startedAtUtc: string; transcript: unknown[]; summary: Record<string, unknown> }) => ({
        id: payload.sessionId,
        scenario_id: payload.scenarioId,
        scenario_version: payload.scenarioVersion,
        learner_level: payload.learnerLevel,
        started_at_utc: payload.startedAtUtc,
        completed_at_utc: '2026-07-21T00:05:00.000Z',
        transcript: payload.transcript,
        summary: payload.summary,
      }),
      saveScenarioSrsCard: async (payload: { id: string }) => ({
        id: payload.id, session_id: 's', scenario_id: 'cafe-order', front: 'f', back: 'b', reading: '', notes: '', created_at_utc: '2026-07-21T00:06:00.000Z',
      }),
    } as unknown as typeof window.jplearnDesktop
    const { container } = render(<App />)
    await act(async () => {})

    const runAxe = async (label: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
      if (results.violations.length > 0) {
        throw new Error(`axe violations in ${label}:\n${formatViolations(results.violations)}`)
      }
      expect(results.violations).toHaveLength(0)
    }

    fireEvent.click(await screen.findByRole('button', { name: 'Open Tutor' }))
    const menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))
    await within(dialog).findByRole('button', { name: 'Start recording your response' })
    await runAxe('the Scenario Practice player with voice controls')

    const respond = (text: string) => {
      fireEvent.input(within(dialog).getByRole('textbox', { name: 'Your response' }), { target: { value: text } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Submit response' }))
    }
    respond('こんにちは')
    respond('コーヒーをください')
    respond('レギュラーでお願いします')
    respond('ここで食べます')
    respond('はい、お願いします')
    respond('ありがとうございます')

    await within(dialog).findByText('Session complete!')
    await runAxe('the Scenario Practice summary')

    fireEvent.click(await within(dialog).findByRole('button', { name: /review \d+ suggested card/i }))
    await within(dialog).findByText('Review suggested SRS cards')
    await runAxe('the SRS draft review screen')
  })

  it('kanji detail panel opened from Study Overview has no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getKanjiDetail: async () => { throw new Error('detail data is intentionally unavailable in this accessibility test') },
      getOverviewCharacterMastery: async () => ({
        blocks: { hiragana: [], katakana: [] },
        category_blocks: { vocab_n5: [], grammar_patterns: [] },
        kanji_cards: [
          {
            id: 1,
            note_key: `note:v1:builtin:${'a'.repeat(64)}`,
            character: '日',
            romaji: 'nichi',
            meaning: 'sun',
            tags: ['kanji', 'jlpt_n5'],
            example_sentence: null,
            theme: 'Numbers & Time',
          },
        ],
      }),
    }
    const { container } = render(<App />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
    const masteryToggle = document.querySelector('.char-mastery-toggle') as HTMLButtonElement | null
    if (!masteryToggle) throw new Error('Expected mastery toggle button to be present')
    fireEvent.click(masteryToggle)
    fireEvent.click(await screen.findByRole('button', { name: 'JLPT N5: 0% mastered' }))
    fireEvent.click(screen.getByRole('button', { name: '日, nichi, sun: 0/4' }))
    await screen.findByRole('dialog', { name: 'Kanji details: 日' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in kanji detail panel:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })

  it('Dictionary keeps its state and restores multi-kanji chooser focus when the accessible panel closes', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = {
      ...baseDesktopApi,
      searchDictionary: async (query: string) => ({
        query,
        source: 'offline_dictionary' as const,
        results: [
          {
            id: 1,
            source_id: 'test-entry',
            note_key: 'note:v1:offline_dictionary:jmdict:test-entry',
            character: '日本',
            romaji: 'にほん',
            meaning: 'Japan',
            tags: ['offline_dictionary'],
            example_sentence: null,
            pitch_accents: [],
          },
        ],
      }),
      getKanjiDetail: async () => { throw new Error('detail data is intentionally unavailable in this accessibility test') },
    }
    const { container } = render(<App />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Open dictionary' }))
    const searchInput = await screen.findByRole('searchbox', { name: 'Dictionary search' })
    fireEvent.change(searchInput, { target: { value: '日本' } })
    const chooserButton = await screen.findByRole('button', { name: 'Choose a kanji from 日本 to view details' })
    fireEvent.click(chooserButton)
    fireEvent.click(screen.getByRole('button', { name: 'View details for 本' }))
    await screen.findByRole('dialog', { name: 'Kanji details: 本' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in Dictionary kanji detail panel:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kanji details: 本' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Dictionary lookup panel' })).toBeTruthy()
    expect((searchInput as HTMLInputElement).value).toBe('日本')
    await waitFor(() => expect(document.activeElement).toBe(chooserButton))

    fireEvent.click(chooserButton)
    fireEvent.click(screen.getByRole('button', { name: 'View details for 本' }))
    fireEvent.pointerDown(screen.getByTestId('kanji-detail-backdrop'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kanji details: 本' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Dictionary lookup panel' })).toBeTruthy()
  })
})
