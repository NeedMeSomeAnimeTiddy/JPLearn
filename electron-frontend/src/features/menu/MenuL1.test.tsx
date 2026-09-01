import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { StudyBlockPayload, XPProgressPayload } from '../../generated/types'
import { MenuL1 } from './components/MenuL1'
import { useMenuL1 } from './useMenuL1'
import { crownFrom, heroFromStudyBlock, reasonSentence } from './utils'

const onOpenSection = vi.fn()
const onRunHero = vi.fn()

function Harness({ block }: { block?: StudyBlockPayload | null }) {
  const controller = useMenuL1(true)
  return (
    <MenuL1
      controller={controller}
      hero={heroFromStudyBlock(block ?? null)}
      crown={crownFrom(4, { level: 2, total_xp: 300, xp_to_next_level: 50, xp_for_current_level: 150 })}
      onOpenSection={onOpenSection}
      onRunHero={onRunHero}
    />
  )
}

function installApi(unlocked: string[]) {
  window.jplearnDesktop = {
    getFeatureState: vi.fn(async () => ({
      features: [
        { feature_id: 'conversation_mode', name: 'Conversation', category: 'world', is_unlocked: unlocked.includes('conversation_mode'), badges: [], just_unlocked: false, unlocked_at: null, requires: [] },
        { feature_id: 'jlpt_dashboard', name: 'JLPT', category: 'exam', is_unlocked: unlocked.includes('jlpt_dashboard'), badges: [], just_unlocked: false, unlocked_at: null, requires: [] },
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
    await waitFor(() => expect(document.querySelectorAll('.mn-row').length).toBe(5))

    const labels = [...document.querySelectorAll('.mn-en')].map((n) => n.textContent)
    expect(labels).toEqual(['THE PATH', 'PRACTICE', 'THE WORLD', 'THE EXAM', 'YOU'])
  })

  it('locks a section the account has not unlocked, and names what opens it', async () => {
    installApi([])
    render(<Harness block={block()} />)

    await waitFor(() => expect(document.querySelectorAll('.mn-row.locked').length).toBe(2))
    expect(screen.getByText(/reach GRAMMAR on the path/i)).toBeTruthy()
    expect(screen.getByText(/reach JLPT N5 on the path/i)).toBeTruthy()
    /* the two that are always open must never be locked, whatever the catalog says */
    expect(screen.getByText('THE PATH').closest('.mn-row')?.className).not.toContain('locked')
    expect(screen.getByText('YOU').closest('.mn-row')?.className).not.toContain('locked')
  })

  it('a locked row does not go anywhere', async () => {
    installApi([])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.mn-row.locked').length).toBe(2))

    const locked = document.querySelector('.mn-row.locked .mn-card') as HTMLButtonElement
    fireEvent.click(locked)
    expect(onOpenSection).not.toHaveBeenCalled()
  })

  it('an open row dispatches its own section key', async () => {
    installApi(['conversation_mode', 'jlpt_dashboard'])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.mn-row').length).toBe(5))

    fireEvent.click(screen.getByText('THE WORLD').closest('button') as HTMLButtonElement)
    expect(onOpenSection).toHaveBeenCalledWith('READING')
  })

  it('nothing is locked until the catalog has answered', () => {
    /* a menu that draws five locked rows for a second and then opens four reads as a bug */
    window.jplearnDesktop = { getFeatureState: undefined } as unknown as Window['jplearnDesktop']
    render(<Harness block={block()} />)
    expect(document.querySelectorAll('.mn-row.locked').length).toBe(0)
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
    expect(screen.getByText(/nothing due/i)).toBeTruthy()
    expect(screen.getByText(/OPEN THE PATH/)).toBeTruthy()
  })

  it('the arrows walk the rows', async () => {
    installApi(['conversation_mode', 'jlpt_dashboard'])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.mn-row').length).toBe(5))

    const root = document.querySelector('.mn-open') as HTMLElement
    expect(document.querySelector('.mn-hero')?.className).toContain('on')
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    await waitFor(() => expect(document.querySelectorAll('.mn-row.on').length).toBe(1))
    expect(document.querySelector('.mn-row.on .mn-en')?.textContent).toBe('THE PATH')
  })

  it('has no accessibility violations', async () => {
    installApi([])
    render(<Harness block={block()} />)
    await waitFor(() => expect(document.querySelectorAll('.mn-row').length).toBe(5))

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
