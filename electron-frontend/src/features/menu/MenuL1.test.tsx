import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { StudyBlockPayload, XPProgressPayload } from '../../generated/types'
import { MenuL1 } from './components/MenuL1'
import { useMenuL1 } from './useMenuL1'
import { crownFrom, heroFromStudyBlock, reasonSentence, rowsFrom } from './utils'
import type { ProgressionNodeView } from '../progression'

const onOpenSection = vi.fn()
const onRunHero = vi.fn()

/* two steps of a curriculum, which is all the rows need to derive a place on the path */
const NODES = [
  { node_id: 'hiragana', name: 'Hiragana', status: 'mastered', progressLabel: '46/46' },
  { node_id: 'katakana', name: 'Katakana', status: 'active', progressLabel: '23/46' },
] as unknown as ProgressionNodeView[]

function Harness({ block }: { block?: StudyBlockPayload | null }) {
  const controller = useMenuL1(true)
  return (
    <MenuL1
      controller={controller}
      hero={heroFromStudyBlock(block ?? null)}
      crown={crownFrom(4, { level: 2, total_xp: 300, xp_to_next_level: 50, xp_for_current_level: 150 })}
      rows={rowsFrom({ nodes: NODES, block: block ?? null, streakDays: 4 })}
      onOpenSection={onOpenSection}
      onRunHero={onRunHero}
    />
  )
}

function installApi(unlocked: string[]) {
  window.jplearnDesktop = {
    getFeatureState: vi.fn(async () => ({
      features: [
        { feature_id: 'conversation_mode', name: 'Conversation', category: 'world', is_unlocked: unlocked.includes('conversation_mode'), badges: [], just_unlocked: false, unlocked_at: null, requires: [{ node_id: 'grammar_n5', status: 'mastered' }] },
        { feature_id: 'jlpt_dashboard', name: 'JLPT', category: 'exam', is_unlocked: unlocked.includes('jlpt_dashboard'), badges: [], just_unlocked: false, unlocked_at: null, requires: [{ node_id: 'vocabulary_n5', status: 'unlocked' }] },
      ],
    })),
  } as unknown as Window['jplearnDesktop']
}

const block = (over: Partial<StudyBlockPayload> = {}): StudyBlockPayload => ({
  recommendations: [{
    node_id: 'hiragana', display_label: 'Warm up with Hiragana', review_count: 5,
    difficulty: 'easy', reason: 'streak_recovery', priority: 1, section: 'study',
    minigame: 'recognition', section_label: 'Hiragana', leech_focus_enabled: null,
  }],
  learner_stage: 'starter', stage_label: 'Starter', session_minutes: 10, session_note: '',
  ...over,
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
  onOpenSection.mockReset()
  onRunHero.mockReset()
})

describe('the L1 menu', () => {
  it('draws the five sections in curriculum order', async () => {
    installApi(['conversation_mode', 'jlpt_dashboard'])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.st-row').length).toBe(5))

    const labels = [...document.querySelectorAll('.st-en')].map((n) => n.textContent)
    expect(labels).toEqual(['THE PATH', 'PRACTICE', 'THE WORLD', 'THE EXAM', 'YOU'])
  })

  it('locks a section the account has not unlocked, and names what opens it', async () => {
    installApi([])
    render(<Harness block={block()} />)

    await waitFor(() => expect(document.querySelectorAll('.st-row.is-locked').length).toBe(2))
    /* READ OFF THE CATALOG, not restated here: the milestone comes from the curriculum and the
       trigger word from the requirement, so "reach GRAMMAR on the path" -- which named a step the
       path draws as GRAMMAR N5, and called a mastered gate a reached one -- cannot come back. */
    expect(screen.getByText(/GRAMMAR N5 · MASTERED/i)).toBeTruthy()
    expect(screen.getByText(/VOCABULARY N5 · REACHED/i)).toBeTruthy()
    /* the two that are always open must never be locked, whatever the catalog says */
    expect(screen.getByText('THE PATH').closest('.st-row')?.className).not.toContain('is-locked')
    expect(screen.getByText('YOU').closest('.st-row')?.className).not.toContain('is-locked')
  })

  it('a locked row does not go anywhere', async () => {
    installApi([])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.st-row.is-locked').length).toBe(2))

    const locked = document.querySelector('.st-row.is-locked .st-card') as HTMLButtonElement
    /* twice, because pointing is not choosing: the first press only selects, and it is the SECOND
       that would open a row that was allowed to open */
    fireEvent.click(locked)
    fireEvent.click(locked)
    expect(onOpenSection).not.toHaveBeenCalled()
  })

  it('an open row dispatches its own section key', async () => {
    installApi(['conversation_mode', 'jlpt_dashboard'])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.st-row').length).toBe(5))

    /* HOVER OPENS, A CLICK ON THE OPEN ONE GOES -- the mockup's two-step, so a mouse never enters
       a section it only crossed. The first press selects the row; the second is the one that acts. */
    const world = screen.getByText('THE WORLD').closest('button') as HTMLButtonElement
    fireEvent.click(world)
    expect(onOpenSection).not.toHaveBeenCalled()
    fireEvent.click(world)
    expect(onOpenSection).toHaveBeenCalledWith('READING')
  })

  it('nothing is locked until the catalog has answered', () => {
    /* a menu that draws five locked rows for a second and then opens four reads as a bug */
    window.jplearnDesktop = { getFeatureState: undefined } as unknown as Window['jplearnDesktop']
    render(<Harness block={block()} />)
    expect(document.querySelectorAll('.st-row.is-locked').length).toBe(0)
  })

  it('the hero says why, in words rather than in the enum', async () => {
    installApi([])
    render(<Harness block={block()} />)

    expect(screen.getByText(/gentle way back in/i)).toBeTruthy()
    expect(screen.queryByText('streak_recovery')).toBeNull()
    /* scoped to the hero: the row ordinals are also single digits, and YOU is 5 */
    expect(document.querySelector('.sh-fig b')?.textContent).toBe('5')
    expect(document.querySelector('.sh-fig i')?.textContent).toBe('CARDS DUE')
  })

  it('the hero admits when the app has no opinion, instead of inventing one', () => {
    installApi([])
    render(<Harness block={block({ recommendations: [] })} />)

    expect(document.querySelector('.sh-fig b')?.textContent).toBe('—')
    /* scoped to the hero: PRACTICE's own row also says NOTHING DUE when the queue is empty, and
       that is two different true statements rather than one duplicated one */
    expect(document.querySelector('.sh-fig em')?.textContent).toMatch(/nothing due/i)
    expect(screen.getByText(/OPEN THE PATH/)).toBeTruthy()
  })

  it('the arrows walk the rows', async () => {
    installApi(['conversation_mode', 'jlpt_dashboard'])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.st-row').length).toBe(5))

    const root = document.querySelector('.mn-open') as HTMLElement
    expect(document.querySelector('.st-hero')?.className).toContain('on')
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    await waitFor(() => expect(document.querySelectorAll('.st-row.is-open').length).toBe(1))
    expect(document.querySelector('.st-row.is-open .st-en')?.textContent).toBe('THE PATH')
  })

  it('has no accessibility violations', async () => {
    installApi([])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.st-row').length).toBe(5))

    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})

describe('what the crown and the hero are derived from', () => {
  it('reads XP as size-and-remainder, which is what the bridge sends', () => {
    const xp: XPProgressPayload = {
      level: 2, total_xp: 300, xp_to_next_level: 50, xp_for_current_level: 150,
    }
    /* `xp_for_current_level` is the SIZE of the level and `xp_to_next_level` what remains of it.
       Read as two absolute thresholds this showed "0 / 1 XP" on a real account. */
    expect(crownFrom(4, xp)).toEqual({
      streakDays: 4, level: 2, xpInLevel: 100, xpForLevel: 150,
    })
  })

  it('draws a streak nobody has as an absence, not a zero', () => {
    expect(crownFrom(null, null).streakDays).toBeNull()
  })

  it('turns every reason the domain defines into a sentence', () => {
    const reasons = [
      'high_error_rate', 'leeches_detected', 'new_content_ready', 'overdue_reviews',
      'streak_recovery', 'progression_milestone', 'weak_retention', 'balanced_review',
    ]
    for (const reason of reasons) {
      const sentence = reasonSentence(reason)
      expect(sentence).not.toContain('_')
      expect(sentence.endsWith('.')).toBe(true)
    }
    /* a ninth reason the domain adds later still has to read as English */
    expect(reasonSentence('some_new_reason')).toBe('Some new reason.')
  })
})
