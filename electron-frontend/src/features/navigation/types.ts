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

// ── The menu tree (phase 3) ──────────────────────────────────────────────────
// A second, smaller model sitting above the flat `AppView`: L1 → L2 → L3 is the
// menu, and L4 is the flat views the app already has. The two coexist on
// purpose while the tree is ported.

import type { MenuSectionKey } from '../menu'

export type MenuPath =
  | { level: 1 }
  | { level: 2; section: MenuSectionKey }
  | { level: 3; section: MenuSectionKey; screen: string }

export interface MenuPathApi {
  path: MenuPath
  level: 1 | 2 | 3
  /** null at the root */
  section: MenuSectionKey | null
  /** null above L3 */
  screen: string | null
  /** L1 → L2, or straight through to the flat view if that section has no L2 screen yet */
  enterSection: (section: MenuSectionKey) => void
  /** L2 → L3; a no-op anywhere else, because there is nothing to be inside of */
  enterScreen: (screen: string) => void
  /** one level up. False when already at the root, so the caller can fall through. */
  up: () => boolean
  reset: () => void
}
