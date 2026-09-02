import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { FeatureStatusPayload } from '../../generated/types'
import type { ProgressionNodeView } from '../progression'
import { Unlock } from './components/Unlock'
import { useMenuL1 } from './useMenuL1'
import {
  UNLOCK_SEEN_KEY, highWater, newlyUnlocked, stampNode, statusWord, unlockMoment,
} from './unlock'

const T1 = '2026-08-01T10:00:00+00:00'
const T2 = '2026-09-01T12:00:00+00:00'
const T3 = '2026-09-01T12:00:00.512044+00:00'

const feature = (over: Partial<FeatureStatusPayload> = {}): FeatureStatusPayload => ({
  feature_id: 'conversation_mode',
  name: 'Conversation Mode',
  category: 'learning_mode',
  is_unlocked: true,
  badges: ['conversation_mode_unlocked'],
  just_unlocked: false,
  unlocked_at: T2,
  requires: [{ node_id: 'grammar_n5', status: 'mastered' }],
  ...over,
})

const node = (id: string, name: string): ProgressionNodeView => ({
  node_id: id, name, status: 'mastered', mastered_ratio: 1, is_reachable: true,
  mastered_count: 1, total_count: 1, is_tracked: true,
  isOpen: true, isOverridden: false, destination: { kind: 'none' }, progressLabel: '',
} as unknown as ProgressionNodeView)

const NODES = [node('grammar_n5', 'Grammar N5'), node('vocabulary_n5', 'Vocabulary N5')]

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('what counts as new', () => {
  it('announces nothing at all when this surface has never looked', () => {
    /* a fresh install unlocks `themes` and `achievements` at once and an existing account is
       already full of them; a missing mark read as the beginning of time would open the app on a
       moment congratulating you for things you did not just do */
    expect(newlyUnlocked([feature()], null)).toEqual([])
  })

  it('takes only what landed after the mark', () => {
    const old = feature({ feature_id: 'listening_mode', unlocked_at: T1 })
    const fresh = feature()
    expect(newlyUnlocked([old, fresh], T1).map((f) => f.feature_id)).toEqual(['conversation_mode'])
  })

  it('ignores a feature that is still shut, whatever timestamp it carries', () => {
    /* `unlocked_at` is written once and never cleared, so a re-locked feature keeps its stamp */
    const shut = feature({ is_unlocked: false })
    expect(newlyUnlocked([shut], T1)).toEqual([])
  })

  it('orders a whole second before the same second with microseconds', () => {
    /* MEASURED AGAINST THE FORMAT, not assumed: `isoformat()` drops `.ffffff` on an exact second,
       and '+' sorts below '.', which is the right order for 12:00:00.000000 before 12:00:00.512044 */
    expect(T2 < T3).toBe(true)
    expect(newlyUnlocked([feature({ unlocked_at: T3 })], T2).length).toBe(1)
    expect(newlyUnlocked([feature({ unlocked_at: T2 })], T3).length).toBe(0)
  })

  it('reads the high-water mark past locked features and missing stamps', () => {
    expect(highWater([
      feature({ unlocked_at: T1 }),
      feature({ unlocked_at: T3 }),
      feature({ unlocked_at: null }),
      feature({ is_unlocked: false, unlocked_at: '2099-01-01T00:00:00+00:00' }),
    ])).toBe(T3)
  })
})

describe('what the stamp names', () => {
  it('names the one milestone every feature in the moment waited on', () => {
    /* clearing GRAMMAR N5 opens Conversation Mode, Tutor Chat through the chain, and Kanji Mode
       if vocabulary was already done -- three different requirement lists, one shared node */
    const moment = [
      feature(),
      feature({ feature_id: 'tutor_chat' }),
      feature({
        feature_id: 'kanji_mode',
        requires: [
          { node_id: 'vocabulary_n5', status: 'mastered' },
          { node_id: 'grammar_n5', status: 'mastered' },
        ],
      }),
    ]
    expect(stampNode(moment)).toEqual({ node: 'grammar_n5', status: 'mastered' })
  })

  it('names nothing when two unrelated things opened in the same read', () => {
    /* naming one of their milestones would be picking a winner and naming both would be two
       stamps, which is a shape this moment does not have */
    expect(stampNode([
      feature(),
      feature({ feature_id: 'reading_mode', requires: [{ node_id: 'reading', status: 'mastered' }] }),
    ])).toBeNull()
  })

  it('names nothing for the features that were never gated', () => {
    expect(stampNode([feature({ feature_id: 'themes', requires: [] })])).toBeNull()
  })

  it('says REACHED where the catalog asks for reached, not MASTERED', () => {
    /* eight features want a node mastered; `jlpt_dashboard` wants vocabulary_n5 merely unlocked,
       and saying MASTERED on that one would be a lie about when it fired */
    expect(statusWord('mastered')).toBe('MASTERED')
    expect(statusWord('unlocked')).toBe('REACHED')
  })
})

describe('the moment', () => {
  it('is built from the curriculum name, not a second copy of it', () => {
    const moment = unlockMoment([feature()], NODES)
    expect(moment?.stamp).toEqual({ en: 'GRAMMAR N5', jp: '文法', word: 'MASTERED' })
    expect(moment?.cards).toEqual([{
      featureId: 'conversation_mode', name: 'Conversation Mode',
      category: 'learning_mode', badge: 'conversation_mode_unlocked',
    }])
    expect(moment?.mark).toBe(T2)
  })

  it('carries no badge for the features the catalog does not award one for', () => {
    const moment = unlockMoment([feature({ feature_id: 'themes', badges: [] })], NODES)
    expect(moment?.cards[0].badge).toBeNull()
  })

  it('is nothing at all when nothing opened', () => {
    expect(unlockMoment([], NODES)).toBeNull()
  })
})

describe('the unlock screen', () => {
  const moment = unlockMoment(
    [feature(), feature({ feature_id: 'tutor_chat', name: 'Tutor Chat', badges: [] })],
    NODES,
  )!

  it('draws one card per thing that opened, all the same height', () => {
    /* the weight of a moment is the NUMBER of cards; flexed to share the band, one unlock renders
       as a line of type in a blank sheet, which reads as a load failure rather than emphasis */
    const { container } = render(<Unlock moment={moment} onContinue={vi.fn()} />)
    const cards = container.querySelectorAll('.un-card')
    expect(cards).toHaveLength(2)
    expect(container.textContent).toContain('GRAMMAR N5')
    expect(container.textContent).toContain('MASTERED')
    expect(container.textContent).toContain('2 NEW THINGS')
  })

  it('draws the badge chip only where there is a badge', () => {
    const { container } = container_of(moment)
    expect(container.querySelectorAll('.un-card .b')).toHaveLength(1)
  })

  it('says so rather than picking a milestone when none is shared', () => {
    const mixed = unlockMoment([
      feature(),
      feature({ feature_id: 'reading_mode', requires: [{ node_id: 'reading', status: 'mastered' }] }),
    ], NODES)!
    const { container } = render(<Unlock moment={mixed} onContinue={vi.fn()} />)
    expect(container.querySelector('.un-nostamp')).not.toBeNull()
    expect(container.textContent).toContain('NO ONE STEP OPENED ALL OF THESE')
  })

  it('hands back the mark rather than a boolean, so dismissal is what advances it', () => {
    const onContinue = vi.fn()
    const { container } = render(<Unlock moment={moment} onContinue={onContinue} />)
    fireEvent.click(container.querySelector('.un-slab') as Element)
    expect(onContinue).toHaveBeenCalledWith(T2)
  })

  it('swallows Escape instead of letting it walk out of a menu you did not enter', () => {
    const onContinue = vi.fn()
    const { container } = render(<Unlock moment={moment} onContinue={onContinue} />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const reachedWindow = vi.fn()
    window.addEventListener('keydown', reachedWindow)
    ;(container.querySelector('.mn-open') as Element).dispatchEvent(event)
    window.removeEventListener('keydown', reachedWindow)
    expect(onContinue).toHaveBeenCalledWith(T2)
    expect(reachedWindow).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Unlock moment={moment} onContinue={vi.fn()} />)
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

function container_of(m: NonNullable<ReturnType<typeof unlockMoment>>) {
  return render(<Unlock moment={m} onContinue={vi.fn()} />)
}

describe('the mark, through the hook that owns it', () => {
  const install = (features: FeatureStatusPayload[]) => {
    const getFeatureState = vi.fn(async () => ({ features }))
    window.jplearnDesktop = { getFeatureState } as unknown as Window['jplearnDesktop']
    return getFeatureState
  }

  it('stores the mark on the first look and announces none of it', async () => {
    install([feature({ unlocked_at: T1 }), feature({ feature_id: 'themes', unlocked_at: T2 })])
    const { result } = renderHook(() => useMenuL1(true))
    await waitFor(() => expect(window.localStorage.getItem(UNLOCK_SEEN_KEY)).toBe(T2))
    expect(result.current.pendingUnlocks).toEqual([])
  })

  it('announces what arrived after a mark it had already stored', async () => {
    window.localStorage.setItem(UNLOCK_SEEN_KEY, T1)
    install([feature({ unlocked_at: T1 }), feature({ feature_id: 'tutor_chat', unlocked_at: T2 })])
    const { result } = renderHook(() => useMenuL1(true))
    await waitFor(() => expect(result.current.pendingUnlocks).toHaveLength(1))
    expect(result.current.pendingUnlocks[0].feature_id).toBe('tutor_chat')
  })

  it('advances the mark on dismissal and not on display', async () => {
    /* a moment drawn and never seen -- the app closed, the window lost -- is still waiting */
    window.localStorage.setItem(UNLOCK_SEEN_KEY, T1)
    install([feature({ unlocked_at: T2 })])
    const { result } = renderHook(() => useMenuL1(true))
    await waitFor(() => expect(result.current.pendingUnlocks).toHaveLength(1))
    expect(window.localStorage.getItem(UNLOCK_SEEN_KEY)).toBe(T1)

    act(() => result.current.dismissUnlocks(T2))
    expect(window.localStorage.getItem(UNLOCK_SEEN_KEY)).toBe(T2)
    await waitFor(() => expect(result.current.pendingUnlocks).toEqual([]))
  })

  it('asks again when the progression has just been re-synced', async () => {
    /* the features are EVALUATED AGAINST the progression, and only the progression's own two
       commands write those node rows -- so a feature read that lands first in the serial bridge is
       judged against last cycle's nodes. Measured live before this dependency existed: mastering a
       deck mid-session and returning drew nothing, and the moment arrived on the trip after. */
    const getFeatureState = install([feature()])
    const { rerender } = renderHook(
      ({ token }) => useMenuL1(true, token),
      { initialProps: { token: [] as ProgressionNodeView[] } },
    )
    await waitFor(() => expect(getFeatureState).toHaveBeenCalledTimes(1))
    rerender({ token: NODES })
    await waitFor(() => expect(getFeatureState).toHaveBeenCalledTimes(2))
  })

  it('asks again when the menu comes back, which is the only reason it can ever fire', async () => {
    /* asking once per App mount meant the only fetch happened BEFORE the study session that
       caused the unlock -- and left a section unlocked mid-session drawn shut until relaunch */
    const getFeatureState = install([feature()])
    const { rerender } = renderHook(({ on }) => useMenuL1(on), { initialProps: { on: true } })
    await waitFor(() => expect(getFeatureState).toHaveBeenCalledTimes(1))
    rerender({ on: false })
    rerender({ on: true })
    await waitFor(() => expect(getFeatureState).toHaveBeenCalledTimes(2))
  })
})

describe('a card that names a place can go there', () => {
  it('takes you to the section and the screen its feature lives on', () => {
    /* every card has named its destination since this screen landed and none of them could reach
       it: the only way out was CONTINUE, back to the front door, and then a walk down the tree by
       hand to the place the card had just told you about */
    const onGo = vi.fn()
    const onContinue = vi.fn()
    const moment = unlockMoment([feature()], NODES)!
    render(<Unlock moment={moment} onContinue={onContinue} onGo={onGo} />)
    const door = document.querySelector('.un-card.is-door') as HTMLElement
    expect(door.tagName).toBe('BUTTON')
    fireEvent.click(door)
    expect(onGo).toHaveBeenCalledWith('READING', 'scenes')
  })

  it('marks the moment seen before it navigates', () => {
    /* the moment is an EVENT: `menuLevel` goes to a level nothing matches while it is up, so
       navigating without marking it would put the section behind a screen that never comes down */
    const calls: string[] = []
    const moment = unlockMoment([feature()], NODES)!
    render(
      <Unlock
        moment={moment}
        onContinue={() => calls.push('continue')}
        onGo={() => calls.push('go')}
      />,
    )
    fireEvent.click(document.querySelector('.un-card.is-door') as HTMLElement)
    expect(calls).toEqual(['continue', 'go'])
  })

  it('stays a plain card where the menu has no route, rather than a door to nowhere', () => {
    /* `themes` lives in Settings; the label is honest and the route would not be */
    const moment = unlockMoment([feature({ feature_id: 'themes', name: 'Themes' })], NODES)!
    render(<Unlock moment={moment} onContinue={vi.fn()} onGo={vi.fn()} />)
    expect(document.querySelector('.un-card.is-door')).toBeNull()
    expect(document.querySelector('.un-card')).not.toBeNull()
  })

  it('is a card again when nobody is listening for a destination', () => {
    /* rendered without `onGo` -- in a test, or anywhere the navigation is not mounted */
    const moment = unlockMoment([feature()], NODES)!
    render(<Unlock moment={moment} onContinue={vi.fn()} />)
    expect(document.querySelector('.un-card.is-door')).toBeNull()
  })
})
