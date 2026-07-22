import type { AppView } from '../../types'

/**
 * Where Escape (and any "up one level" gesture) goes from each view.
 *
 * `home` is absent — it is the root and has no parent. `minigame`'s parent is
 * `script_hub`, not `home`; every other view returns to `home`. This is the map
 * that used to be a five-branch `if (view === …)` chain in App's key handler.
 *
 * Note this is *parent*, not *history*: it is where you go up to, independent of
 * how you arrived. History back/forward (order-of-visit) is a separate mechanism
 * owned by `useAppNavigation`.
 */
export const VIEW_PARENT: Partial<Record<AppView, AppView>> = {
  minigame: 'script_hub',
  script_hub: 'home',
  jlpt_prep: 'home',
  passage_hub: 'home',
  daily_games: 'home',
}
