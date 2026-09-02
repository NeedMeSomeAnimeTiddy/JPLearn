import type { AppView } from '../../types'

/**
 * Where Escape (and any "up one level" gesture) goes from each view.
 *
 * `home` is absent — it is the root and has no parent; every other view returns
 * to it. `minigame`'s parent was `script_hub` while that screen existed, which
 * made the map four entries long; the hub is gone and the menu is the only place
 * a round is chosen from, so every leaf goes home.
 *
 * Note this is *parent*, not *history*: it is where you go up to, independent of
 * how you arrived. History back/forward (order-of-visit) is a separate mechanism
 * owned by `useAppNavigation`.
 */
export const VIEW_PARENT: Partial<Record<AppView, AppView>> = {
  minigame: 'home',
  jlpt_prep: 'home',
  passage_hub: 'home',
  daily_games: 'home',
}
