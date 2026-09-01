// Navigation feature module (issue #69 phase 4c).
//
// Owns App's top-level routing state — the active view, the animation-direction
// hint, and the order-of-visit history stack behind the titlebar back/forward
// buttons. The `view -> parent` map (Escape) is the separate `VIEW_PARENT`
// constant; `view -> component` rendering stays in App because each screen needs
// App-owned props.

export { useAppNavigation } from './useAppNavigation'
export { VIEW_PARENT } from './constants'
export { useMenuPath, L2_READY, ROOT } from './useMenuPath'
export type { AppNavigationApi, MenuPath, MenuPathApi } from './types'
