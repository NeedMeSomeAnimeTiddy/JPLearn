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

  /* THE TUTOR POP-UP IS RETIRED: its chat and image translation are Look it up's two model routes,
     and its scenarios are the conversation screen. Each surface it had is checked where it lives
     now. Look it up is portalled to the body, so it is checked there rather than in `container`. */
  const runAxeOn = async (root: Element, label: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(root)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in ${label}:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  }

  const palette = async (label: string) => {
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: label } })
    fireEvent.click(await screen.findByRole('option', { name: label }))
  }

  it('Look it up, opened from the titlebar tutor button, has no violations on either model route', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    render(<App />)
    await act(async () => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Open the tutor (Look it up)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Look it up' })
    await runAxeOn(dialog, 'Look it up')

    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'What to look up' }), { key: 'Escape' })
    await palette('Chat with Tutor')
    await runAxeOn(await screen.findByRole('dialog', { name: 'Look it up' }), 'Look it up on A QUESTION')

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What to look up' }), { key: 'Escape' })
    await palette('Image Translation')
    await runAxeOn(await screen.findByRole('dialog', { name: 'Look it up' }), 'Look it up on A SCREENSHOT')
  })

  it('the conversation screen before it starts, while asking, and its past sessions have no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    await screen.findByRole('button', { name: /open shortcuts/i })
    await palette('Scenario Practice')
    const scenes = await screen.findByRole('group', { name: 'Conversations' })
    fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
    await screen.findByRole('button', { name: 'Start scenario' })
    await runAxeOn(container, 'the conversation, before it starts')

    fireEvent.click(screen.getByRole('button', { name: 'Past sessions' }))
    await screen.findByText('PAST SESSIONS', { selector: '.rd-kick span' })
    await runAxeOn(container, 'the past sessions')
    fireEvent.keyDown(document.body, { key: 'Escape' })

    fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start scenario' }))
    await screen.findByRole('textbox', { name: 'Your response' })
    await runAxeOn(container, 'the conversation, asking')
  })

  it('the conversation with voice controls, an answer held on the sheet, and the finished cards have no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = {
      ...baseDesktopApi,
      // With the speech runtime available the reply rule also has its mic
      // and the live status line.
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
    await screen.findByRole('button', { name: /open shortcuts/i })

    await palette('Scenario Practice')
    const scenes = await screen.findByRole('group', { name: 'Conversations' })
    fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start scenario' }))
    await screen.findByRole('button', { name: 'Start recording your response' })
    await runAxeOn(container, 'the conversation with voice controls')

    const respond = async (text: string, check?: string) => {
      fireEvent.input(screen.getByRole('textbox', { name: 'Your response' }), { target: { value: text } })
      fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
      await screen.findByText('YOU SAID')
      if (check) await runAxeOn(container, check)
      fireEvent.keyDown(document.body, { key: 'Enter' })
    }
    await respond('こんにちは', 'an answer held on the sheet')
    await respond('コーヒーをください')
    await respond('レギュラーでお願いします')
    await respond('ここで食べます')
    await respond('はい、お願いします')
    await respond('ありがとうございます')

    await screen.findByText('SESSION COMPLETE')
    await screen.findByRole('button', { name: /^Accept card: / })
    await runAxeOn(container, 'the finished conversation and its cards')
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
    /* the overlay opens on the first set it has, and its first block's characters are already
       beside it -- there is no panel to expand and no tile to press first */
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^日, nichi, sun/ }))
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
    fireEvent.click(document.querySelector('.kx-open .lk-scrim') as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kanji details: 本' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Dictionary lookup panel' })).toBeTruthy()
  })
})
