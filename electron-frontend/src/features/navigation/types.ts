import type { AppView, NavDirection } from '../../types'

export interface AppNavigationApi {
  /** The active top-level screen. */
  view: AppView
  /** Enter/exit animation hint for the current transition — no accessible output. */
  navDirection: NavDirection

  /**
   * Go to `next`. When `direction` is omitted the current `navDirection` is left
   * unchanged — a couple of titlebar jumps rely on that (they set the view
   * without disturbing the animation direction), so it is not defaulted.
   */
  navigate: (next: AppView, direction?: NavDirection) => void

  // ── Order-of-visit history (titlebar back/forward) ─────────────────────────
  historyBack: () => void
  historyForward: () => void
  canHistoryBack: boolean
  canHistoryForward: boolean
}
