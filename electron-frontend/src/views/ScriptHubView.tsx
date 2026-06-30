import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Flame,
  Heart,
  Lock,
  Settings,
  Target,
  Trophy,
} from 'lucide-react'
import type {
  JlptLevel,
  JlptLevelProgress,
  MinigameKey,
  MinigameStatsByScript,
  NavDirection,
  ScriptKey,
  StudyPlanCoverageRow,
} from '../types'
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_SCORES,
  DEFAULT_LIVES,
  DEFAULT_SESSION_LENGTH_PRESET,
  JLPT_LEVEL_LABELS,
  MINIGAMES,
  SCRIPT_LABELS,
  SESSION_LENGTH_PRESETS,
} from '../constants'
import { MinigameIcon } from '../components/MinigameIcon'
import { useSession } from '../context/SessionContext'

interface BlockInfo {
  index: number
  name: string
  sample_chars: string[]
  unlocked: boolean
  mastery: number
  card_ids: number[]
}

interface BasicCard {
  id: number
  is_leech: boolean
}

interface ScriptHubViewProps {
  navDirection: NavDirection
  activeScript: ScriptKey
  activeGame: MinigameKey
  activeBlockIndex: number
  gameLoading: boolean
  gameError: string | null
  blockProgressWithMastery: BlockInfo[]
  activeBlockCards: BasicCard[]
  kanjiLevelProgress: JlptLevelProgress[]
  vocabLevelProgress: JlptLevelProgress[]
  activeKanjiLevel: JlptLevel
  activeVocabLevel: JlptLevel
  learningPathExpanded: boolean
  learningPathTrackRows: StudyPlanCoverageRow[]
  leechCardsLength: number
  minigameStats: MinigameStatsByScript
  availableMinigames: MinigameKey[]
  activeScriptStats: { bestStreak: number }
  activeSectionName: string | null
  isSheet?: boolean
  // callbacks (navigation / deck selection only)
  onBack: () => void
  onOpenSettings: () => void
  onSelectBlock: (index: number) => void
  onSelectKanjiLevel: (level: JlptLevel) => void
  onSelectVocabLevel: (level: JlptLevel) => void
  onToggleLearningPath: () => void
  onSelectGame: (game: MinigameKey) => void
  onPlayGame: (game: MinigameKey) => void
}

// Suppress unused-import warnings for constants included per spec
void CONFIDENCE_LEVEL_LABELS
void CONFIDENCE_SCORES
void DEFAULT_SESSION_LENGTH_PRESET
void JLPT_LEVEL_LABELS

export function ScriptHubView({
  navDirection,
  activeScript,
  activeGame,
  activeBlockIndex,
  gameLoading,
  gameError,
  blockProgressWithMastery,
  activeBlockCards,
  kanjiLevelProgress,
  vocabLevelProgress,
  activeKanjiLevel,
  activeVocabLevel,
  learningPathExpanded,
  learningPathTrackRows,
  leechCardsLength,
  minigameStats,
  availableMinigames,
  activeScriptStats,
  activeSectionName,
  isSheet = false,
  onBack,
  onOpenSettings,
  onSelectBlock,
  onSelectKanjiLevel,
  onSelectVocabLevel,
  onToggleLearningPath,
  onSelectGame,
  onPlayGame,
}: ScriptHubViewProps) {
  const {
    sessionRunReport,
    sessionStartPending,
    sessionSummaryLoading,
    sessionGoalError,
    lastSessionSummary,
    livesEnabled,
    leechFocusEnabled,
    confidenceCaptureEnabled,
    activeSessionLengthPreset,
    continueLastSession,
    setSessionLength,
    toggleLives,
    toggleLeechFocus,
    toggleConfidence,
  } = useSession()
  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const activeBlock = blockProgressWithMastery.find((block) => block.index === activeBlockIndex)

  return (
    <div className={isSheet ? 'script-hub-sheet-content' : `view-shell view-${navDirection}`}>
      <header className="topbar panel-glass">
        <button
          type="button"
          className="back-button back-button-icon-only"
          onClick={onBack}
          aria-label="Back to main menu"
          title="Back to main menu"
        >
          <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
        <div className="brand-block">
          <span className="brand-kicker">{SCRIPT_LABELS[activeScript]}</span>
          <h1>Mini Game Map</h1>
        </div>
        <div className="topbar-end">
          <div className="focus-chip">
            <span className="metric-accent-streak">
              <Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} />
              <strong key={`best-${activeScriptStats.bestStreak}`} className="live-value">
                {activeScriptStats.bestStreak}
              </strong>{' '}
              Best Streak
            </span>
            <span className="metric-accent-danger">
              <AlertTriangle aria-hidden="true" className="chip-icon" strokeWidth={2.2} />
              <strong key={`leech-${leechCardsLength}`} className="live-value">
                {leechCardsLength}
              </strong>{' '}
              Leeches
            </span>
          </div>
          <button
            type="button"
            className="topbar-settings-button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings (Ctrl+,)"
          >
            <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <section className="panel-glass game-panel">
        <div className="learning-path-shell">
          <button
            type="button"
            className={`learning-path-toggle ${learningPathExpanded ? 'is-expanded' : ''}`}
            onClick={onToggleLearningPath}
            aria-expanded={learningPathExpanded}
            aria-controls="learning-path-body"
          >
            <div className="panel-head learning-path-head">
              <h2>Learning Path</h2>
              <span className="game-stats">
                {blockProgressWithMastery.length > 0
                  ? `${blockProgressWithMastery.filter((b) => b.mastery >= 0.8).length} / ${blockProgressWithMastery.length} blocks mastered`
                  : activeScript === 'kanji_n5'
                    ? `${kanjiLevelProgress.filter((level) => level.mastery >= 0.8 && level.total > 0).length} / ${kanjiLevelProgress.filter((level) => level.total > 0).length} JLPT levels mastered`
                    : activeScript === 'vocab_n5'
                      ? `${vocabLevelProgress.filter((level) => level.mastery >= 0.8 && level.total > 0).length} / ${vocabLevelProgress.filter((level) => level.total > 0).length} JLPT levels mastered`
                      : 'Choose a minigame to start'}
              </span>
            </div>

            {!learningPathExpanded ? (
              <div className="learning-path-compact" role="group" aria-label="Learning path compact summary">
                {learningPathTrackRows.map((row) => {
                  const masteryPct = Math.round(row.mastery * 100)
                  return (
                    <div key={row.key} className="learning-path-compact-row">
                      <div className="learning-path-compact-head">
                        <strong>{row.label}</strong>
                        <span>{masteryPct}%</span>
                      </div>
                      <div className="study-plan-coverage-bar" aria-hidden="true">
                        <div
                          className="study-plan-coverage-fill"
                          style={{ '--study-plan-pct': `${masteryPct}%` } as CSSProperties}
                        />
                      </div>
                      <p className="learning-path-compact-meta">
                        {row.total > 0 ? `${row.total} cards tracked` : 'No cards tracked yet'}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </button>

          <div id="learning-path-body" className={`learning-path-body ${learningPathExpanded ? 'is-open' : ''}`}>
            <div className="learning-path-body-inner">
              {gameLoading ? (
                <p className="status-line">Loading deck cards...</p>
              ) : blockProgressWithMastery.length > 0 ? (
                <div className="block-path">
                  {blockProgressWithMastery.map((block, index) => {
                    const isActive = activeBlockIndex === block.index
                    const masteryPct = Math.round(block.mastery * 100)
                    return (
                      <article
                        key={block.index}
                        className={`block-node ${isActive ? 'is-active' : ''} ${!block.unlocked ? 'is-locked' : ''}`}
                        style={{ animationDelay: `${80 + index * 50}ms` }}
                      >
                        <button
                          type="button"
                          className="block-node-button"
                          disabled={!block.unlocked}
                          onClick={() => {
                            if (!block.unlocked) return
                            onSelectBlock(block.index)
                          }}
                          aria-pressed={isActive}
                          aria-label={`${block.name}, ${block.unlocked ? `${masteryPct}% mastered` : 'locked'}`}
                        >
                          <div className="block-node-header">
                            <div className="block-node-chars" lang="ja" aria-hidden="true">
                              {block.sample_chars.join(' ')}
                            </div>
                            {!block.unlocked ? (
                              <Lock className="block-lock-icon" strokeWidth={2} aria-hidden="true" />
                            ) : null}
                          </div>
                          <strong className="block-node-name">{block.name}</strong>
                          <div className="block-node-bar-wrap" aria-label={`Mastery: ${masteryPct}%`}>
                            <div
                              className="block-node-bar"
                              style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties}
                            />
                          </div>
                          <span className="block-node-pct">{masteryPct}%</span>
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : activeScript === 'kanji_n5' || activeScript === 'vocab_n5' ? (
                <div
                  className="jlpt-level-path"
                  role="group"
                  aria-label={`${activeScript === 'kanji_n5' ? 'Kanji' : 'Vocabulary'} JLPT progression`}
                >
                  {(activeScript === 'kanji_n5' ? kanjiLevelProgress : vocabLevelProgress).map((level, index) => {
                    const isActive = activeScript === 'kanji_n5' ? activeKanjiLevel === level.key : activeVocabLevel === level.key
                    const masteryPct = Math.round(level.mastery * 100)
                    const unavailable = level.total === 0
                    return (
                      <article
                        key={level.key}
                        className={`jlpt-level-node ${isActive ? 'is-active' : ''} ${(!level.unlocked || unavailable) ? 'is-locked' : ''}`}
                        style={{ animationDelay: `${80 + index * 45}ms` }}
                      >
                        <button
                          type="button"
                          className="jlpt-level-button"
                          disabled={!level.unlocked || unavailable}
                          onClick={() => {
                            if (activeScript === 'kanji_n5') {
                              onSelectKanjiLevel(level.key)
                            } else {
                              onSelectVocabLevel(level.key)
                            }
                          }}
                          aria-pressed={isActive}
                          aria-label={`${level.label}, ${unavailable ? 'no cards yet' : `${masteryPct}% mastered`}`}
                        >
                          <div className="jlpt-level-header">
                            <strong>{level.label}</strong>
                            {!level.unlocked || unavailable ? (
                              <Lock className="block-lock-icon" strokeWidth={2} aria-hidden="true" />
                            ) : null}
                          </div>
                          <span className="jlpt-level-preview" lang="ja" aria-hidden="true">
                            {level.sampleChars.length > 0 ? level.sampleChars.join(' ') : '—'}
                          </span>
                          <div className="block-node-bar-wrap" aria-label={`Mastery: ${masteryPct}%`}>
                            <div
                              className="block-node-bar"
                              style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties}
                            />
                          </div>
                          <span className="jlpt-level-meta">
                            {level.total} cards • {masteryPct}%
                          </span>
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Minigame selector – shown below block path once a block is active */}
        {!gameLoading && (blockProgressWithMastery.length === 0 || activeBlock?.unlocked) ? (
          <>
            <div className="panel-head block-minigame-head">
              <h3>
                {blockProgressWithMastery.length > 0
                  ? `Choose a minigame — ${activeBlock?.name ?? ''} (${activeBlockCards.length} cards)`
                  : activeScript === 'kanji_n5' || activeScript === 'vocab_n5'
                    ? `Choose a minigame — ${activeSectionName ?? 'JLPT Level'} (${activeBlockCards.length} cards)`
                    : 'Choose a minigame'}
              </h3>
            </div>

            <div className="minigame-setup-toolbar" aria-label="Minigame quick setup">
              <div className="session-length-row" role="group" aria-label="Session length">
                {SESSION_LENGTH_PRESETS.map((preset) => {
                  const Icon = preset.icon
                  const isActive = activeSessionLengthPreset?.key === preset.key
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`setup-option-button session-length-button session-length-${preset.key} ${isActive ? 'is-active' : ''}`}
                      aria-pressed={isActive}
                      aria-label={`Set ${preset.label.toLowerCase()} session length (${preset.items} items)`}
                      title={`${preset.label} length (${preset.items} items)`}
                      onClick={() => setSessionLength(preset.items)}
                    >
                      <span className="setup-option-icon" aria-hidden="true">
                        <Icon className="toggle-icon" strokeWidth={2.2} />
                      </span>
                      <span className="setup-option-copy">
                        <span className="setup-option-label">{preset.label}</span>
                        <span className="setup-option-meta">{preset.items} items</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="intro-toggle-row" role="group" aria-label="Minigame setup toggles">
                <button
                  type="button"
                  className={`setup-option-button setup-toggle-button ${livesEnabled ? 'is-active' : ''}`}
                  aria-pressed={livesEnabled}
                  aria-label={`Toggle lives mode (${DEFAULT_LIVES} lives per run)`}
                  title={`Lives mode (${DEFAULT_LIVES} lives): ${livesEnabled ? 'On' : 'Off'}`}
                  onClick={toggleLives}
                >
                  <span className="setup-option-icon" aria-hidden="true">
                    <Heart className="toggle-icon" strokeWidth={2.1} />
                  </span>
                  <span className="setup-option-copy">
                    <span className="setup-option-label">Lives mode</span>
                    <span className="setup-option-meta">{livesEnabled ? `${DEFAULT_LIVES} lives active` : 'Off'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`setup-option-button setup-toggle-button leech-focus-toggle ${leechFocusEnabled ? 'is-active' : ''}`}
                  aria-pressed={leechFocusEnabled}
                  aria-label="Toggle focused review mode (leech cards first)"
                  title={`Focused review mode (leech first): ${leechFocusEnabled ? 'On' : 'Off'}`}
                  onClick={toggleLeechFocus}
                >
                  <span className="setup-option-icon" aria-hidden="true">
                    <AlertTriangle className="toggle-icon" strokeWidth={2.1} />
                  </span>
                  <span className="setup-option-copy">
                    <span className="setup-option-label">Focused review</span>
                    <span className="setup-option-meta">{leechFocusEnabled ? 'Leech cards first' : 'Mixed queue'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`setup-option-button setup-toggle-button ${confidenceCaptureEnabled ? 'is-active' : ''}`}
                  aria-pressed={confidenceCaptureEnabled}
                  aria-label="Toggle answer confidence capture"
                  title={`Confidence capture: ${confidenceCaptureEnabled ? 'On' : 'Off'}`}
                  onClick={toggleConfidence}
                >
                  <span className="setup-option-icon" aria-hidden="true">
                    <Target className="toggle-icon" strokeWidth={2.1} />
                  </span>
                  <span className="setup-option-copy">
                    <span className="setup-option-label">Answer confidence</span>
                    <span className="setup-option-meta">{confidenceCaptureEnabled ? 'Rate each answer' : 'Tracking off'}</span>
                  </span>
                </button>
              </div>
            </div>

            {sessionSummaryLoading ? <p className="status-line">Loading session summary...</p> : null}
            {sessionGoalError ? <p className="status-line status-error">{sessionGoalError}</p> : null}
            {lastSessionSummary ? (
              <section className="session-summary-card" aria-live="polite">
                <div className="session-summary-head">
                  <p className="session-summary-kicker">Last Session</p>
                  <span className={`session-summary-pill ${lastSessionSummary.goal_met ? 'is-success' : 'is-warn'}`}>
                    {lastSessionSummary.goal_met ? 'Goal Met' : 'In Progress'}
                  </span>
                </div>
                <p className="session-summary-main">
                  {lastSessionSummary.completed_items}/{lastSessionSummary.target_items} items · {lastSessionSummary.accuracy}% accuracy · {Math.max(0, lastSessionSummary.reviewed - lastSessionSummary.correct)} misses
                </p>
                <div className="session-summary-actions">
                  <span className="session-summary-context">
                    {sessionRunReport
                      ? `${SCRIPT_LABELS[sessionRunReport.script]} · ${MINIGAMES.find((game) => game.key === sessionRunReport.minigame)?.title ?? sessionRunReport.minigame}`
                      : `${SCRIPT_LABELS[activeScript]} · ${selectedGameMeta?.title ?? 'Minigame'}`}
                  </span>
                  <button
                    type="button"
                    className="session-summary-continue"
                    onClick={continueLastSession}
                    disabled={!sessionRunReport || sessionStartPending}
                  >
                    Continue
                  </button>
                </div>
              </section>
            ) : null}

            <div className="minigame-grid">
              {availableMinigames.map((gameKey, index) => {
                const game = MINIGAMES.find((entry) => entry.key === gameKey)
                if (!game) return null
                const gameStats = minigameStats[activeScript][game.key]
                const accuracy =
                  gameStats.attempted > 0
                    ? Math.round((gameStats.correct / gameStats.attempted) * 100)
                    : 0

                return (
                  <article
                    key={game.key}
                    role="button"
                    tabIndex={0}
                    className={`game-tile ${activeGame === game.key ? 'is-active' : ''}`}
                    onClick={() => onSelectGame(game.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectGame(game.key)
                      }
                    }}
                    style={{ animationDelay: `${120 + index * 70}ms` }}
                  >
                    <div className="game-tile-head">
                      <span className="game-icon" aria-hidden="true">
                        <MinigameIcon game={game.key} />
                      </span>
                      <div className="game-tile-copy">
                        <strong className="game-tile-title">{game.title}</strong>
                        <p className="game-tile-description">{game.description}</p>
                      </div>
                    </div>
                    <div className="game-tile-stats" aria-label="Minigame stats">
                      <span className="game-tile-stat" aria-label="Accuracy" title="Accuracy">
                        <span className="game-tile-stat-label" aria-hidden="true">
                          <Target className="game-tile-stat-icon" strokeWidth={2.1} />
                        </span>
                        <strong>{accuracy}%</strong>
                      </span>
                      <span className="game-tile-stat" aria-label="Best streak" title="Best streak">
                        <span className="game-tile-stat-label" aria-hidden="true">
                          <Flame className="game-tile-stat-icon" strokeWidth={2.1} />
                        </span>
                        <strong>{gameStats.bestStreak}</strong>
                      </span>
                      <span className="game-tile-stat" aria-label="Points" title="Points">
                        <span className="game-tile-stat-label" aria-hidden="true">
                          <Trophy className="game-tile-stat-icon" strokeWidth={2.1} />
                        </span>
                        <strong>{gameStats.points}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="play-cta-button game-tile-play"
                      onClick={(event) => {
                        event.stopPropagation()
                        onPlayGame(game.key)
                      }}
                    >
                      Play
                    </button>
                  </article>
                )
              })}
            </div>
          </>
        ) : null}

        {gameError ? <p className="status-line status-error">{gameError}</p> : null}
      </section>
    </div>
  )
}
