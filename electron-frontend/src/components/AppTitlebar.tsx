// Extracted verbatim from App.tsx (issue #69). Presentational only -- every piece of
// state it renders stays owned by App; this component receives it as props.
import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, BookText, Bug, Clock, Code2, Copy, Flame, Gamepad2,
  House, Languages, ListChecks, Menu, Minus, PlayCircle, RotateCcw, Search,
  Settings, Snowflake, Square, Trash2, X } from 'lucide-react'
import type {
  AppSettings, MinigameKey, ScriptKey, ShortcutSubmenuKey, StudySummaryPayload, XPProgress,
} from '../types'
import type { WindowDragHandlers } from '../features/window-drag/useWindowDrag'
import type { usePomodoro } from '../features/pomodoro'
import type { useTutor } from '../features/tutor'
import { TutorTitlebarButton } from '../features/tutor'
import { MinigameIcon } from './MinigameIcon'
import { DAILY_GAMES_COPY } from '../features/daily-games/constants'
import { ALL_SCRIPT_KEYS, SCRIPT_LABELS, SCRIPT_MINIGAMES, SECTION_META, MINIGAMES } from '../constants'

export interface AppTitlebarProps {
  windowDrag: WindowDragHandlers
  shortcutMenuRef: RefObject<HTMLDivElement | null>
  shortcutMenuOpen: boolean
  toggleShortcutMenu: () => void
  activeShortcutFlyout: ShortcutSubmenuKey | null
  setActiveShortcutFlyout: Dispatch<SetStateAction<ShortcutSubmenuKey | null>>
  jumpToMainMenu: () => void
  jumpToOverview: () => void
  jumpToJlptPrep: () => void
  jumpToPassageHub: () => void
  openDailyGames: () => void
  toggleAllMapsFlyout: () => void
  jumpToScriptHub: (script: ScriptKey) => void
  jumpToScriptHubMinigame: (script: ScriptKey, minigame: MinigameKey) => void
  toggleDevToolsFlyout: () => void
  toggleDevChecksFlyout: () => void
  openSettingsFromMenu: () => void
  refreshDataFromMenu: () => void
  inspectElementFromMenu: () => void | Promise<void>
  openDevDashboard: () => void
  runCheckFromMenu: (checkName: string) => void
  restartBridgeFromMenu: () => void | Promise<void>
  clearCachesFromMenu: () => void | Promise<void>
  openDictionaryForCurrentRound: () => void
  canTitlebarBack: boolean
  canTitlebarForward: boolean
  /* PHASE 2 SCAFFOLDING, AND IT COMES OUT AT PHASE 6. The valley menu and the old home screen
     coexist while the tree is ported, so every phase can ship on its own and a regression is a
     switch away rather than a blocked release. */
  titlebarHistoryBack: () => void
  titlebarHistoryForward: () => void
  settings: AppSettings
  pomodoro: ReturnType<typeof usePomodoro>
  tutor: ReturnType<typeof useTutor>
  tutorTitlebarButtonRef: RefObject<HTMLButtonElement | null>
  toggleTutorPanelFromTitlebar: () => void
  streak: NonNullable<StudySummaryPayload>['streak']
  streakDetailsOpen: boolean
  streakDetailsRef: RefObject<HTMLDivElement | null>
  toggleStreakDetails: () => void
  xpProgress: XPProgress | null
  xpDetailsOpen: boolean
  xpDetailsRef: RefObject<HTMLDivElement | null>
  toggleXpDetails: () => void
  xpInLevel: number
  xpLevelCap: number
  xpPercent: number
  isWindowMaximized: boolean
  minimizeWindow: () => void
  toggleMaximizeWindow: () => void
  handleCloseRequest: () => void
}

export function AppTitlebar({
  windowDrag,
  shortcutMenuRef,
  shortcutMenuOpen,
  toggleShortcutMenu,
  activeShortcutFlyout,
  setActiveShortcutFlyout,
  jumpToMainMenu,
  jumpToOverview,
  jumpToJlptPrep,
  jumpToPassageHub,
  openDailyGames,
  toggleAllMapsFlyout,
  jumpToScriptHub,
  jumpToScriptHubMinigame,
  toggleDevToolsFlyout,
  toggleDevChecksFlyout,
  openSettingsFromMenu,
  refreshDataFromMenu,
  inspectElementFromMenu,
  openDevDashboard,
  runCheckFromMenu,
  restartBridgeFromMenu,
  clearCachesFromMenu,
  openDictionaryForCurrentRound,
  canTitlebarBack,
  canTitlebarForward,
  titlebarHistoryBack,
  titlebarHistoryForward,
  settings,
  pomodoro,
  tutor,
  tutorTitlebarButtonRef,
  toggleTutorPanelFromTitlebar,
  streak,
  streakDetailsOpen,
  streakDetailsRef,
  toggleStreakDetails,
  xpProgress,
  xpDetailsOpen,
  xpDetailsRef,
  toggleXpDetails,
  xpInLevel,
  xpLevelCap,
  xpPercent,
  isWindowMaximized,
  minimizeWindow,
  toggleMaximizeWindow,
  handleCloseRequest,
}: AppTitlebarProps) {
  return (
    <header className="window-titlebar" aria-label="Window controls">
      <div className="window-titlebar-drag" {...windowDrag}>
        <div className="window-titlebar-nav" role="group" aria-label="App navigation">
          <div className="titlebar-shortcut-wrap" ref={shortcutMenuRef}>
            <button
              type="button"
              className="window-nav-button"
              aria-label="Open shortcuts"
              title="Shortcuts"
              aria-haspopup="menu"
              aria-expanded={shortcutMenuOpen}
              onClick={toggleShortcutMenu}
            >
              <Menu className="window-nav-icon" strokeWidth={2.2} />
            </button>
            {shortcutMenuOpen ? (
              <div className="titlebar-shortcut-menu" role="menu" aria-label="Quick locations">
                <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={jumpToMainMenu}>
                  <House className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  Main Menu
                </button>

                <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={jumpToOverview}>
                  <BarChart3 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  Study Overview
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="titlebar-shortcut-item"
                  onClick={jumpToJlptPrep}
                  title="JLPT Prep"
                >
                  <Languages className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  JLPT Prep
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="titlebar-shortcut-item"
                  onClick={openDailyGames}
                  title={DAILY_GAMES_COPY.title}
                >
                  <Gamepad2 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  {DAILY_GAMES_COPY.title}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="titlebar-shortcut-item"
                  onClick={jumpToPassageHub}
                  title="Passages"
                >
                  <BookText className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  Passages
                </button>

                <div className="titlebar-shortcut-tree-anchor">
                  <button
                    type="button"
                    role="menuitem"
                    className="titlebar-shortcut-item titlebar-shortcut-parent"
                    aria-haspopup="true"
                    aria-expanded={activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' && activeShortcutFlyout !== 'dev_checks'}
                    onClick={toggleAllMapsFlyout}
                  >
                    <ListChecks className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    All Maps
                    <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' ? '▾' : '▸'}</span>
                  </button>

                  {activeShortcutFlyout !== null && activeShortcutFlyout !== 'dev_tools' && activeShortcutFlyout !== 'dev_checks' ? (
                    <div className="titlebar-shortcut-righttree" role="group" aria-label="Maps and minigames">
                      {ALL_SCRIPT_KEYS.map((script) => {
                        const isScriptExpanded = activeShortcutFlyout === script
                        return (
                          <div key={script} className="titlebar-shortcut-map-group">
                            <button
                              type="button"
                              role="menuitem"
                              className="titlebar-shortcut-item titlebar-shortcut-child"
                              aria-haspopup="true"
                              aria-expanded={isScriptExpanded}
                              onClick={() => {
                                setActiveShortcutFlyout((current) => (current === script ? 'all_maps' : script))
                              }}
                            >
                              <span className="titlebar-shortcut-glyph" aria-hidden="true">{SECTION_META[script].glyph}</span>
                              {SCRIPT_LABELS[script]} Map
                              <span className="titlebar-shortcut-caret" aria-hidden="true">{isScriptExpanded ? '▾' : '▸'}</span>
                            </button>
                            {isScriptExpanded ? (
                              <div className="titlebar-shortcut-childmenu" role="group" aria-label={`${SCRIPT_LABELS[script]} minigames`}>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                  onClick={() => jumpToScriptHub(script)}
                                >
                                  <span className="titlebar-shortcut-glyph" aria-hidden="true">↗</span>
                                  Open Map
                                </button>
                                {SCRIPT_MINIGAMES[script].map((gameKey) => {
                                  const gameTitle = MINIGAMES.find((entry) => entry.key === gameKey)?.title ?? gameKey
                                  return (
                                    <button
                                      key={gameKey}
                                      type="button"
                                      role="menuitem"
                                      className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                      onClick={() => jumpToScriptHubMinigame(script, gameKey)}
                                    >
                                      <MinigameIcon game={gameKey} />
                                      {gameTitle}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>

                <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={openSettingsFromMenu}>
                  <Settings className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="titlebar-shortcut-item"
                  onClick={refreshDataFromMenu}
                >
                  <Activity className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                  Refresh Data
                </button>

                <div className="titlebar-shortcut-tree-anchor">
                  <button
                    type="button"
                    role="menuitem"
                    className="titlebar-shortcut-item titlebar-shortcut-parent"
                    aria-haspopup="true"
                    aria-expanded={activeShortcutFlyout === 'dev_tools' || activeShortcutFlyout === 'dev_checks'}
                    onClick={toggleDevToolsFlyout}
                  >
                    <Code2 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Developer Tools
                    <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout === 'dev_tools' || activeShortcutFlyout === 'dev_checks' ? '▾' : '▸'}</span>
                  </button>

                  {(activeShortcutFlyout === 'dev_tools' || activeShortcutFlyout === 'dev_checks') ? (
                    <div className="titlebar-shortcut-righttree" role="group" aria-label="Developer tools">
                      <button
                        type="button"
                        role="menuitem"
                        className="titlebar-shortcut-item titlebar-shortcut-leaf"
                        onClick={openDevDashboard}
                      >
                        <Bug className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                        Developer Dashboard
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        className="titlebar-shortcut-item titlebar-shortcut-leaf"
                        onClick={() => { void inspectElementFromMenu() }}
                      >
                        <span className="titlebar-shortcut-glyph" aria-hidden="true">&lt;/&gt;</span>
                        Inspect Element
                      </button>

                      <div className="titlebar-shortcut-tree-anchor">
                        <button
                          type="button"
                          role="menuitem"
                          className="titlebar-shortcut-item titlebar-shortcut-parent"
                          aria-haspopup="true"
                          aria-expanded={activeShortcutFlyout === 'dev_checks'}
                          onClick={toggleDevChecksFlyout}
                        >
                          <PlayCircle className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                          Run Checks
                          <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout === 'dev_checks' ? '▾' : '▸'}</span>
                        </button>

                        {activeShortcutFlyout === 'dev_checks' ? (
                          <div className="titlebar-shortcut-childmenu" role="group" aria-label="Run checks">
                            <button
                              type="button"
                              role="menuitem"
                              className="titlebar-shortcut-item titlebar-shortcut-leaf"
                              onClick={() => runCheckFromMenu('arch')}
                            >
                              Architecture Check
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="titlebar-shortcut-item titlebar-shortcut-leaf"
                              onClick={() => runCheckFromMenu('db')}
                            >
                              DB Schema Check
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="titlebar-shortcut-item titlebar-shortcut-leaf"
                              onClick={() => runCheckFromMenu('srs')}
                            >
                              SRS Integrity Check
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        role="menuitem"
                        className="titlebar-shortcut-item titlebar-shortcut-leaf"
                        onClick={() => { void restartBridgeFromMenu() }}
                      >
                        <RotateCcw className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                        Restart Bridge
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        className="titlebar-shortcut-item titlebar-shortcut-leaf"
                        onClick={() => { void clearCachesFromMenu() }}
                      >
                        <Trash2 className="titlebar-shortcut-icon" strokeWidth={2} aria-hidden="true" />
                        Clear Caches
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="window-nav-button"
            onClick={titlebarHistoryBack}
            aria-label="Back"
            title="Back"
            disabled={!canTitlebarBack}
          >
            <ArrowLeft className="window-nav-icon" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="window-nav-button"
            onClick={titlebarHistoryForward}
            aria-label="Forward"
            title="Forward"
            disabled={!canTitlebarForward}
          >
            <ArrowRight className="window-nav-icon" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="window-nav-button"
            onClick={jumpToOverview}
            aria-label="Open study overview"
            title="Study Overview"
          >
            <BookText className="window-nav-icon" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="window-nav-button"
            onClick={openDictionaryForCurrentRound}
            aria-label="Open dictionary"
            title="Dictionary"
          >
            <Search className="window-nav-icon" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="window-nav-button"
            onClick={openSettingsFromMenu}
            aria-label="Open settings"
            title="Settings"
          >
            <Settings className="window-nav-icon" strokeWidth={2.2} />
          </button>
          <TutorTitlebarButton
            ref={tutorTitlebarButtonRef}
            tutorPanelOpen={tutor.tutorPanelOpen}
            onClick={toggleTutorPanelFromTitlebar}
          />
        </div>
      </div>
      <div className="titlebar-progress-cluster">
        {settings.pomodoroEnabled ? (
          <button
            type="button"
            className={`titlebar-streak-chip ${pomodoro.display && (pomodoro.display.phase === 'break' || pomodoro.display.phase === 'long-break') ? 'titlebar-pomodoro--break' : ''}`}
            onClick={pomodoro.toggle}
            aria-label={pomodoro.display ? `${pomodoro.display.isRunning ? 'Pause' : 'Resume'} timer (${pomodoro.display.formatted})` : 'Start timer'}
            title={pomodoro.display ? `${pomodoro.display.phase} — ${pomodoro.display.formatted}` : 'Start timer'}
          >
            <Clock className="titlebar-streak-icon" strokeWidth={2.1} aria-hidden="true" />
            <span className="titlebar-streak-value titlebar-pomodoro-value">
              {pomodoro.display ? pomodoro.display.formatted : 'Start'}
            </span>
          </button>
        ) : null}
        <div className="titlebar-streak" ref={streakDetailsRef}>
          <button
            type="button"
            className="titlebar-streak-chip"
            onClick={toggleStreakDetails}
            title="View streak details"
            aria-label={`${streak.current_days} day streak`}
            aria-expanded={streakDetailsOpen}
            aria-controls="titlebar-streak-details"
          >
            <Flame className="titlebar-streak-icon" strokeWidth={2.1} aria-hidden="true" />
            <span className="titlebar-streak-value">{streak.current_days}</span>
          </button>
          <button
            type="button"
            className="titlebar-streak-chip titlebar-streak-freeze-chip"
            onClick={toggleStreakDetails}
            title={`${streak.freezes_available} streak freeze${streak.freezes_available === 1 ? '' : 's'}`}
            aria-label={`${streak.freezes_available} streak freeze${streak.freezes_available === 1 ? '' : 's'}`}
            aria-expanded={streakDetailsOpen}
            aria-controls="titlebar-streak-details"
          >
            <Snowflake className="titlebar-streak-icon" strokeWidth={1.8} aria-hidden="true" />
            <span className="titlebar-streak-value">{streak.freezes_available}</span>
          </button>
          <div
            id="titlebar-streak-details"
            className={`titlebar-streak-details ${streakDetailsOpen ? 'is-open' : ''}`}
            role="dialog"
            aria-label="Streak details"
          >
            <p className="titlebar-streak-details-title">
              {streak.current_days > 0 ? `${streak.current_days}-day streak 🔥` : 'No active streak'}
            </p>
            <p className="titlebar-streak-details-row">Best: {streak.best_days} days</p>
            <p className="titlebar-streak-details-tip">
              {streak.current_days > 0
                ? 'Keep it up — review something today!'
                : 'Complete a session to start your streak.'}
            </p>
            <div className="titlebar-streak-details-divider" />
            <p className="titlebar-streak-details-row">
              <Snowflake className="titlebar-streak-details-freeze-icon" strokeWidth={1.8} aria-hidden="true" />
              {streak.freezes_available > 0
                ? `${streak.freezes_available} freeze${streak.freezes_available === 1 ? '' : 's'} available`
                : 'No freezes — study this week to earn one!'}
            </p>
            <p className="titlebar-streak-details-tip">
              Earn 1 freeze per week (max 3). Each missed day costs 1 freeze. If you have enough freezes, your streak stays alive.
            </p>
          </div>
        </div>

        {xpProgress ? (
          <div className="titlebar-xp" ref={xpDetailsRef}>
            <button
              type="button"
              className="titlebar-xp-button"
              title={`Level ${xpProgress.level} — ${xpInLevel} / ${xpLevelCap} XP`}
              aria-label={`Level ${xpProgress.level}. ${xpPercent}% to next level.`}
              aria-expanded={xpDetailsOpen}
              aria-controls="titlebar-xp-details"
              onClick={toggleXpDetails}
            >
              <span className="titlebar-xp-badge" aria-hidden="true">{xpProgress.level}</span>
              <div
                className="titlebar-xp-track"
                role="progressbar"
                aria-valuenow={xpPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="titlebar-xp-fill"
                  style={{ '--xp-pct': `${xpPercent}%` } as CSSProperties}
                />
              </div>

            </button>
            <div
              id="titlebar-xp-details"
              className={`titlebar-xp-details ${xpDetailsOpen ? 'is-open' : ''}`}
              role="dialog"
              aria-label="XP details"
            >
              <p className="titlebar-xp-details-title">Level {xpProgress.level}</p>
              <p className="titlebar-xp-details-row">Progress: {xpInLevel} / {xpLevelCap} XP</p>
              <p className="titlebar-xp-details-row">To next level: {Math.max(0, xpProgress.xp_to_next_level)} XP</p>
              <p className="titlebar-xp-details-row">Completion: {xpPercent}%</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="window-controls" role="group" aria-label="Window actions">
        <button type="button" className="window-control-button" onClick={minimizeWindow} aria-label="Minimize window">
          <Minus className="window-control-icon" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="window-control-button window-control-button-maximize"
          onClick={toggleMaximizeWindow}
          aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'}
        >
          <span className={`window-control-icon-stack ${isWindowMaximized ? 'is-maximized' : ''}`} aria-hidden="true">
            <Square className="window-control-icon window-control-icon-maximize" strokeWidth={2} />
            <Copy className="window-control-icon window-control-icon-restore" strokeWidth={1.9} />
          </span>
        </button>
        <button type="button" className="window-control-button window-control-close" onClick={handleCloseRequest} aria-label="Close window">
          <X className="window-control-icon" strokeWidth={2.2} />
        </button>
      </div>
    </header>
  )
}
