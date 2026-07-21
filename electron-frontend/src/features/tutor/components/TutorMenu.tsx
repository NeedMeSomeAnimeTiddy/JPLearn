import { TUTOR_MENU_ITEMS } from '../constants'
import type { TutorPanelMode } from '../types'

interface TutorMenuProps {
  assistantChatEnabled: boolean
  /** The mode last navigated into from this menu — used only to restore
   * keyboard focus to the item that opened it when returning via Back. */
  returnFocusMode: TutorPanelMode | null
  onSelect: (mode: Exclude<TutorPanelMode, 'menu'>) => void
}

export function TutorMenu({ assistantChatEnabled, returnFocusMode, onSelect }: TutorMenuProps) {
  const items = TUTOR_MENU_ITEMS.filter((item) => item.mode !== 'chat' || assistantChatEnabled)

  return (
    <div className="tutor-menu-body cassette-panel-body">
      <ul className="tutor-menu-list" role="list">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.mode}>
              <button
                type="button"
                className="tutor-menu-item"
                data-autofocus={returnFocusMode === item.mode ? 'true' : undefined}
                onClick={() => onSelect(item.mode)}
                aria-label={item.label}
              >
                <span className="tutor-menu-item-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={2.1} aria-hidden="true" />
                </span>
                <span className="tutor-menu-item-copy">
                  <span className="tutor-menu-item-label">{item.label}</span>
                  <span className="tutor-menu-item-description">{item.description}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
