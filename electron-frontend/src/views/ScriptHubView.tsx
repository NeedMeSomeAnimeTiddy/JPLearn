import {
  AlertTriangle,
  ArrowLeft,
  Flame,
  Heart,
  Settings,
  Grid3x3,
  Target,
} from 'lucide-react'
import type {
  CategoryProgress,
  JlptLevel,
  JlptLevelProgress,
  KanjiCategory,
  MinigameKey,
  NavDirection,
  ScriptKey,
  StudyPlanCoverageRow,
  VocabCategory,
} from '../types'
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_SCORES,
  DEFAULT_LIVES,
  DEFAULT_SESSION_LENGTH_PRESET,
  JLPT_LEVEL_LABELS,
  SCRIPT_LABELS,
  SESSION_LENGTH_PRESETS,
} from '../constants'
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
  kanjiCategoryProgress: CategoryProgress[]
  vocabCategoryProgress: CategoryProgress[]
  activeKanjiCategory: KanjiCategory
  activeVocabCategory: VocabCategory
  learningPathExpanded: boolean
  learningPathTrackRows: StudyPlanCoverageRow[]
  leechCardsLength: number
  activeScriptStats: { bestStreak: number }
  activeSectionName: string | null
  isSheet?: boolean
  // callbacks (navigation / deck selection only)
  onBack: () => void
  onOpenSettings: () => void
  onSelectBlock: (index: number) => void
  onSelectKanjiLevel: (level: JlptLevel) => void
  onSelectVocabLevel: (level: JlptLevel) => void
  onSelectKanjiCategory: (cat: KanjiCategory) => void
  onSelectVocabCategory: (cat: VocabCategory) => void
  onToggleLearningPath: () => void
  onSelectGame: (game: MinigameKey) => void
  onPlayGame: (game: MinigameKey) => void
  onOpenGameSelect?: () => void
}

// Suppress unused-import warnings for constants included per spec
void CONFIDENCE_LEVEL_LABELS
void CONFIDENCE_SCORES
void DEFAULT_SESSION_LENGTH_PRESET
void JLPT_LEVEL_LABELS

export function ScriptHubView({
  navDirection,
  activeScript,
  activeGame: _activeGame,
  activeBlockIndex,
  gameLoading,
  gameError,
  blockProgressWithMastery,
  activeBlockCards,
  kanjiLevelProgress: _kanjiLevelProgress,
  vocabLevelProgress: _vocabLevelProgress,
  activeKanjiLevel: _activeKanjiLevel,
  activeVocabLevel: _activeVocabLevel,
  kanjiCategoryProgress,
  vocabCategoryProgress,
  activeKanjiCategory,
  activeVocabCategory,
  learningPathExpanded: _learningPathExpanded,
  learningPathTrackRows: _learningPathTrackRows,
  leechCardsLength,
  activeScriptStats,
  activeSectionName,
  isSheet = false,
  onBack,
  onOpenSettings,
  onSelectBlock,
  onSelectKanjiLevel: _onSelectKanjiLevel,
  onSelectVocabLevel: _onSelectVocabLevel,
  onSelectKanjiCategory,
  onSelectVocabCategory,
  onToggleLearningPath: _onToggleLearningPath,
  onSelectGame: _onSelectGame,
  onPlayGame: _onPlayGame,
  onOpenGameSelect,
}: ScriptHubViewProps) {
  const {
    sessionRunReport: _sessionRunReport,
    sessionStartPending: _sessionStartPending,
    sessionSummaryLoading: _sessionSummaryLoading,
    sessionGoalError: _sessionGoalError,
    lastSessionSummary: _lastSessionSummary,
    livesEnabled,
    leechFocusEnabled,
    confidenceCaptureEnabled,
    activeSessionLengthPreset,
    continueLastSession: _continueLastSession,
    setSessionLength,
    toggleLives,
    toggleLeechFocus,
    toggleConfidence,
  } = useSession()
  const activeBlock = blockProgressWithMastery.find((block) => block.index === activeBlockIndex)

  return (
    <div className={isSheet ? 'script-hub-sheet-content' : `view-shell view-${navDirection}`}>
      {!isSheet ? (
        <>
          <div className="hub-crt-surface" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
          <div className="hub-vhs-line" aria-hidden="true" />
          {/* Floating crystalline accents */}
          <div className="hub-crystal hub-crystal--a" aria-hidden="true" />
          <div className="hub-crystal hub-crystal--b" aria-hidden="true" />
          <div className="hub-crystal hub-crystal--c" aria-hidden="true" />
        </>
      ) : null}

      {/* ── Bold lofi header ──────────────────────────────────── */}
      <header className="hub-topbar">
        <h1 className="sr-only">Mini Game Map</h1>
        <button
          type="button"
          className="back-button back-button-icon-only"
          onClick={onBack}
          aria-label="Back to main menu"
          title="Back to main menu"
        >
          <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>

        <div className="hub-topbar-center">
          <span className="hub-topbar-catalog">JPL-{activeScript === 'kanji_n5' ? 'KNJ' : activeScript === 'vocab_n5' ? 'VCB' : 'SCR'}-A</span>
          <strong className="hub-topbar-title"><span className="hub-glitch-text">{SCRIPT_LABELS[activeScript]}</span></strong>
          <span className="hub-topbar-catalog hub-topbar-catalog--sub">CASSETTE TAPE · カセット · SIDE A</span>
          <span className="hub-topbar-stripe" aria-hidden="true" />
        </div>

        <div className="hub-topbar-end">
          <span className="hub-stat">
            <Flame size={13} strokeWidth={2.3} aria-hidden="true" />
            <span>{activeScriptStats.bestStreak}</span>
          </span>
          <span className="hub-stat hub-stat--warn">
            <AlertTriangle size={13} strokeWidth={2.3} aria-hidden="true" />
            <span>{leechCardsLength}</span>
          </span>
          <button
            type="button"
            className="topbar-settings-button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* ── Script hub studio ────────────────────────── */}
      <div className="hub-studio">

        <div className="hub-player">
          {/* Animated atmospheric elements */}
          <div className="hub-sweep" aria-hidden="true" />
          <div className="hub-particle hub-particle--1" aria-hidden="true" />
          <div className="hub-particle hub-particle--2" aria-hidden="true" />
          <div className="hub-particle hub-particle--3" aria-hidden="true" />
          <div className="hub-particle hub-particle--4" aria-hidden="true" />

          {!gameLoading && (blockProgressWithMastery.length === 0 || activeBlock?.unlocked) ? (
            <>
              <div className="hub-player-header">
                <p className="hero-kicker">
                  <span className="hub-rec-dot" aria-hidden="true" />{' '}
                  {blockProgressWithMastery.length > 0
                    ? `${activeBlock?.name ?? ''} · ${activeBlockCards.length} cards`
                    : activeScript === 'kanji_n5' || activeScript === 'vocab_n5'
                      ? `${activeSectionName ?? 'Category'} · ${activeBlockCards.length} cards`
                      : 'Pick a minigame'}
                </p>
              </div>

              {/* Cassette carousel replaced by browse button */}
              <div className="hub-eq" aria-hidden="true">
                <span className="hub-eq-bar" style={{ animationDelay: '0s' }} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.1s' }} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.2s' }} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.05s' }} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.15s' }} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.25s' }} />
              </div>
              <div className="hub-deck-badge" aria-hidden="true">
                <span>DOLBY NR</span>
                <span className="hub-deck-dot" />
              </div>
              <div className="minigame-select-launcher">
                <button
                  type="button"
                  className="hub-chip-button browse-minigames-button"
                  onClick={onOpenGameSelect}
                  aria-label="Browse all minigames"
                >
                  <Grid3x3 size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>Browse All Minigames</span>
                </button>
              </div>
              <div className="hub-deck-badge hub-deck-badge--right" aria-hidden="true">
                <span>TYPE II · HIGH BIAS</span>
              </div>

              {/* Session controls */}
              <div className="hub-controls" aria-label="Session setup">
                <div className="hub-control-group" role="group" aria-label="Session length">
                  {SESSION_LENGTH_PRESETS.map((preset) => {
                    const Icon = preset.icon
                    const isActive = activeSessionLengthPreset?.key === preset.key
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        className={`hub-chip-button${isActive ? ' is-active' : ''}`}
                        aria-pressed={isActive}
                        aria-label={`${preset.label} (${preset.items} items)`}
                        title={`${preset.label} — ${preset.items} items`}
                        onClick={() => setSessionLength(preset.items)}
                      >
                        <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>{preset.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="hub-control-divider" aria-hidden="true" />
                <div className="hub-control-group" role="group" aria-label="Toggles">
                  <button
                    type="button"
                    className={`hub-chip-button${livesEnabled ? ' is-active' : ''}`}
                    aria-pressed={livesEnabled}
                    aria-label={`Lives mode ${livesEnabled ? 'on' : 'off'}`}
                    title={`Lives mode (${DEFAULT_LIVES} lives)`}
                    onClick={toggleLives}
                  >
                    <Heart size={13} strokeWidth={2.1} aria-hidden="true" />
                    <span>Lives</span>
                  </button>
                  <button
                    type="button"
                    className={`hub-chip-button leech-focus-toggle${leechFocusEnabled ? ' is-active' : ''}`}
                    aria-pressed={leechFocusEnabled}
                    aria-label={`Focused review ${leechFocusEnabled ? 'on' : 'off'}`}
                    title="Focused review (leech cards first)"
                    onClick={toggleLeechFocus}
                  >
                    <AlertTriangle size={13} strokeWidth={2.1} aria-hidden="true" />
                    <span>Focus</span>
                  </button>
                  <button
                    type="button"
                    className={`hub-chip-button${confidenceCaptureEnabled ? ' is-active' : ''}`}
                    aria-pressed={confidenceCaptureEnabled}
                    aria-label={`Toggle answer confidence capture (${confidenceCaptureEnabled ? 'on' : 'off'})`}
                    title="Confidence capture"
                    onClick={toggleConfidence}
                  >
                    <Target size={13} strokeWidth={2.1} aria-hidden="true" />
                    <span>Confidence</span>
                  </button>
                </div>
              </div>

              {/* Horizontal tracklist strip */}
              {!gameLoading ? (
                <div className="hub-tracklist-strip">
                  <span className="hub-tracklist-label">
                    {blockProgressWithMastery.length > 0
                      ? `${blockProgressWithMastery.filter((b) => b.mastery >= 0.8).length}/${blockProgressWithMastery.length} mastered`
                      : activeScript === 'kanji_n5'
                        ? `${kanjiCategoryProgress.filter((c) => c.mastery >= 0.7 && c.total > 0).length}/${kanjiCategoryProgress.filter((c) => c.total > 0).length}`
                        : activeScript === 'vocab_n5'
                          ? `${vocabCategoryProgress.filter((c) => c.mastery >= 0.7 && c.total > 0).length}/${vocabCategoryProgress.filter((c) => c.total > 0).length}`
                          : ''}
                  </span>
                  {blockProgressWithMastery.length > 0 ? (
                    <div className="hub-block-row-strip">
                      {blockProgressWithMastery.map((block) => {
                        const isActive = activeBlockIndex === block.index
                        const masteryPct = Math.round(block.mastery * 100)
                        return (
                          <button
                            key={block.index}
                            type="button"
                            className={`hub-block-chip${isActive ? ' is-active' : ''}${!block.unlocked ? ' is-locked' : ''}`}
                            disabled={!block.unlocked}
                            onClick={() => { if (block.unlocked) onSelectBlock(block.index) }}
                            title={!block.unlocked ? 'Locked' : `${block.name} ${masteryPct}%`}
                          >
                            {block.name}
                          </button>
                        )
                      })}
                    </div>
                  ) : activeScript === 'kanji_n5' || activeScript === 'vocab_n5' ? (
                    <div className="hub-block-row-strip">
                      {(activeScript === 'kanji_n5' ? kanjiCategoryProgress : vocabCategoryProgress).map((cat) => {
                        const isActive = activeScript === 'kanji_n5' ? activeKanjiCategory === cat.key : activeVocabCategory === cat.key
                        const unavailable = cat.total === 0
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            className={`hub-block-chip${isActive ? ' is-active' : ''}${(!cat.unlocked || unavailable) ? ' is-locked' : ''}`}
                            disabled={!cat.unlocked || unavailable}
                            onClick={() => {
                              if (activeScript === 'kanji_n5') onSelectKanjiCategory(cat.key as KanjiCategory)
                              else onSelectVocabCategory(cat.key as VocabCategory)
                            }}
                          >
                            {cat.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

            </>
          ) : gameLoading ? (
            <p className="status-line">Loading deck…</p>
          ) : null}

          {gameError ? <p className="status-line status-error">{gameError}</p> : null}
        </div>
      </div>
    </div>
  )
}