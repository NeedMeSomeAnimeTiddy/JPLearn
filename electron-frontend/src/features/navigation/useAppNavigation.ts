/**
 * Owns App's top-level routing state (issue #69 phase 4c): the active `view`,
 * the animation-direction hint, and the order-of-visit history stack that backs
 * the titlebar back/forward buttons.
 *
 * `view -> parent` (Escape) and `view -> component` (which screen renders) are
 * *not* here: the parent map is the `VIEW_PARENT` constant, and rendering stays
 * in App because each screen needs App-owned props. This hook is purely the
 * navigation state machine.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppView, NavDirection } from '../../types'
import type { AppNavigationApi } from './types'

export function useAppNavigation(): AppNavigationApi {
  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')

  const viewHistoryRef = useRef<AppView[]>(['home'])
  const viewHistoryIndexRef = useRef(0)
  // Set before a history-driven `setView` so the maintenance effect below knows
  // not to treat the resulting view change as a brand-new navigation.
  const isHistoryNavigationRef = useRef(false)

  const navigate = useCallback((next: AppView, direction?: NavDirection) => {
    if (direction) setNavDirection(direction)
    setView(next)
  }, [])

  // Maintain the history stack as the view changes. A history-driven change
  // (back/forward) is skipped; a fresh navigation truncates any forward trail
  // and appends.
  useEffect(() => {
    if (isHistoryNavigationRef.current) {
      isHistoryNavigationRef.current = false
      return
    }

    const currentHistory = viewHistoryRef.current
    const currentIndex = viewHistoryIndexRef.current
    if (currentHistory[currentIndex] === view) return

    const nextHistory = currentHistory.slice(0, currentIndex + 1)
    nextHistory.push(view)
    viewHistoryRef.current = nextHistory
    viewHistoryIndexRef.current = nextHistory.length - 1
  }, [view])

  const historyBack = useCallback(() => {
    const currentIndex = viewHistoryIndexRef.current
    if (currentIndex <= 0) return

    const nextIndex = currentIndex - 1
    viewHistoryIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    setNavDirection('back')
    setView(viewHistoryRef.current[nextIndex])
  }, [])

  const historyForward = useCallback(() => {
    const currentIndex = viewHistoryIndexRef.current
    const nextIndex = currentIndex + 1
    if (nextIndex >= viewHistoryRef.current.length) return

    viewHistoryIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    setNavDirection('forward')
    setView(viewHistoryRef.current[nextIndex])
  }, [])

  // Read from the refs during render, exactly as App did. This works because a
  // `view` change re-renders alongside the ref update; it is deliberately not a
  // reactive `useState`, and turning it into one would change the timing the
  // routing tests pin.
  const canHistoryBack = viewHistoryIndexRef.current > 0
  const canHistoryForward = viewHistoryIndexRef.current < viewHistoryRef.current.length - 1

  return {
    view,
    navDirection,
    navigate,
    historyBack,
    historyForward,
    canHistoryBack,
    canHistoryForward,
  }
}
