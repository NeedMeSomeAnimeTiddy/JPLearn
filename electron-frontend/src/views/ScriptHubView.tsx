import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Flame,
  Heart,
  Settings,
  Grid3x3,
  Target,
  X,
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
  MinigameStats,
  MinigameStatsByScript,
} from '../types'
import {
  DEFAULT_LIVES,
  SCRIPT_LABELS,
  SESSION_LENGTH_PRESETS,
  MINIGAMES,
  MINIGAME_DIFFICULTY,
  MINIGAME_SKILL_GROUP,
  buildBalancedRanking,
} from '../constants'
import type {
  RankedMinigameCard,
  MinigameSkillGroupKey,
} from '../constants'
import { useSession } from '../context/SessionContext'
import { MinigameCard } from '../components/MinigameCard'
import type { MinigameCardData } from '../components/MinigameCard'
import { MinigameDetailPanel } from '../components/MinigameDetailPanel'
import { MinigameGrid } from '../components/MinigameGrid'
import { FilterSortBar } from '../components/FilterSortBar'
import type { DifficultyFilterValue, SortMode } from '../components/FilterSortBar'

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
  // new minigame grid props
  availableMinigames: MinigameKey[]
  minigameStats: MinigameStatsByScript
  minigameLockReasons: Partial<Record<MinigameKey, string>>
  // callbacks
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
}

export function ScriptHubView({
  navDirection,
  activeScript,
  activeGame,
  activeBlockIndex,
  gameLoading,
  gameError,
  blockProgressWithMastery,
  activeBlockCards,
  kanjiCategoryProgress,
  vocabCategoryProgress,
  activeKanjiCategory,
  activeVocabCategory,
  leechCardsLength,
  activeScriptStats,
  activeSectionName,
  isSheet = false,
  availableMinigames,
  minigameStats,
  minigameLockReasons,
  onBack,
  onOpenSettings,
  onSelectBlock,
  onSelectKanjiCategory,
  onSelectVocabCategory,
  onSelectGame,
  onPlayGame,
}: ScriptHubViewProps) {
  const {
    livesEnabled,
    leechFocusEnabled,
    confidenceCaptureEnabled,
    activeSessionLengthPreset,
    setSessionLength,
    toggleLives,
    toggleLeechFocus,
    toggleConfidence,
  } = useSession()
  const activeBlock = blockProgressWithMastery.find((block) => block.index === activeBlockIndex)

  const [showGrid, setShowGrid] = useState(false)
  const [skillGroupFilter, setSkillGroupFilter] = useState<MinigameSkillGroupKey | null>(null)
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilterValue>('all')
  const [sortMode, setSortMode] = useState<SortMode>('recommended')

  function emptyStats(): MinigameStats {
    return { attempted: 0, correct: 0, currentStreak: 0, bestStreak: 0, points: 0 }
  }

  const rankedCards: RankedMinigameCard[] = useMemo(() => {
    const perScriptStats = minigameStats[activeScript] ?? ({} as Record<MinigameKey, MinigameStats>)
    return availableMinigames.map((key) => {
      const diff = MINIGAME_DIFFICULTY[key] ?? { level: 'medium' as const, label: 'Medium' as const }
      const stats = perScriptStats[key] ?? emptyStats()
      const accuracy = stats.attempted > 0
        ? Math.round((stats.correct / stats.attempted) * 100)
        : 0
      const unmetNeed = stats.attempted === 0 ? 100 : Math.max(0, 85 - accuracy)
      const recommendationScore = unmetNeed + Math.max(0, 6 - Math.min(stats.bestStreak, 6))

      return {
        key,
        title: MINIGAMES.find((m) => m.key === key)?.title ?? key,
        description: MINIGAMES.find((m) => m.key === key)?.description ?? '',
        accuracy,
        difficulty: diff,
        lockReason: minigameLockReasons[key] ?? null,
        minigameLocked: Boolean(minigameLockReasons[key]),
        stats,
        recommendationScore,
      } satisfies RankedMinigameCard
    })
  }, [availableMinigames, minigameStats, activeScript, minigameLockReasons])

  const filteredCards = useMemo(() => {
    let cards = rankedCards

    if (skillGroupFilter) {
      cards = cards.filter((c) => MINIGAME_SKILL_GROUP[c.key] === skillGroupFilter)
    }

    if (difficultyFilter !== 'all') {
      cards = cards.filter((c) => c.difficulty.label.toLowerCase() === difficultyFilter)
    }

    switch (sortMode) {
      case 'recommended':
        cards = buildBalancedRanking(cards)
        break
      case 'difficulty':
        cards = [...cards].sort((a, b) => {
          const order = { easy: 0, medium: 1, hard: 2 }
          return order[a.difficulty.level] - order[b.difficulty.level]
        })
        break
      case 'recent':
      default:
        cards = [...cards].sort((a, b) => b.recommendationScore - a.recommendationScore)
        break
    }

    return cards
  }, [rankedCards, skillGroupFilter, difficultyFilter, sortMode])

  const hasActiveFilters = skillGroupFilter !== null || difficultyFilter !== 'all'
  const resetFilters = () => {
    setSkillGroupFilter(null)
    setDifficultyFilter('all')
    setSortMode('recommended')
  }

  const selectedCard = activeGame ? rankedCards.find((c) => c.key === activeGame) : null

  const handleSelectGame = (game: MinigameKey) => {
    onSelectGame(game)
  }

  const handlePlayGame = (game: MinigameKey) => {
    onPlayGame(game)
  }

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
              {/* ── Player header (hero-kicker) ── */}
              <div className="hub-player-header">
                <p className="hero-kicker">
                  <span className="hub-rec-dot" aria-hidden="true" />{' '}
                  {showGrid
                    ? 'Pick a minigame'
                    : blockProgressWithMastery.length > 0
                      ? `${activeBlock?.name ?? ''} · ${activeBlockCards.length} cards`
                      : activeScript === 'kanji_n5' || activeScript === 'vocab_n5'
                        ? `${activeSectionName ?? 'Category'} · ${activeBlockCards.length} cards`
                        : 'Pick a minigame'}
                </p>
              </div>

              {/* ── Compact mode: EQ bars, deck badges, browse button ── */}
              {!showGrid ? (
                <>
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
                      onClick={() => setShowGrid(true)}
                      aria-label="Browse all minigames"
                    >
                      <Grid3x3 size={14} strokeWidth={2.2} aria-hidden="true" />
                      <span>Browse All Minigames</span>
                    </button>
                  </div>
                  <div className="hub-deck-badge hub-deck-badge--right" aria-hidden="true">
                    <span>TYPE II · HIGH BIAS</span>
                  </div>
                </>
              ) : (
                /* ── Expanded mode: full minigame grid ── */
                <div className="minigame-select-area">
                  {/* Collapse button */}
                  <div className="minigame-select-header" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button
                      type="button"
                      className="hub-chip-button"
                      onClick={() => setShowGrid(false)}
                      aria-label="Collapse minigame grid"
                    >
                      <X size={14} strokeWidth={2.2} aria-hidden="true" />
                      <span>Collapse</span>
                    </button>
                  </div>

                  {/* Filter / Sort */}
                  <FilterSortBar
                    items={availableMinigames}
                    activeSkillGroup={skillGroupFilter}
                    activeDifficulty={difficultyFilter}
                    sortMode={sortMode}
                    onSkillGroupChange={setSkillGroupFilter}
                    onDifficultyChange={setDifficultyFilter}
                    onSortChange={setSortMode}
                  />

                  {/* Body: grid + detail panel */}
                  <div className="minigame-select-body">
                    <div className="minigame-select-grid-area">
                      {filteredCards.length > 0 ? (
                        <MinigameGrid>
                          {filteredCards.map((card) => {
                            const isSelected = activeGame === card.key
                            const cardData: MinigameCardData = {
                              key: card.key,
                              title: card.title,
                              description: card.description,
                              skillGroupKey: MINIGAME_SKILL_GROUP[card.key],
                              difficultyLevel: card.difficulty.level,
                              locked: card.minigameLocked,
                              lockReason: card.lockReason,
                            }
                            return (
                              <MinigameCard
                                key={card.key}
                                card={cardData}
                                isSelected={isSelected}
                                onSelect={handleSelectGame}
                                onPlay={handlePlayGame}
                              />
                            )
                          })}
                        </MinigameGrid>
                      ) : (
                        <div className="hub-empty-state" style={{ padding: 40, textAlign: 'center' }}>
                          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                            {hasActiveFilters
                              ? 'No minigames match the current filters.'
                              : 'No minigames available for this script.'}
                          </p>
                          {hasActiveFilters ? (
                            <button
                              type="button"
                              className="hub-chip-button"
                              onClick={resetFilters}
                              aria-label="Reset filters"
                            >
                              Reset Filters
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Detail panel */}
                    <div className="minigame-select-detail-area">
                      {selectedCard ? (
                        <MinigameDetailPanel
                          gameKey={selectedCard.key}
                          title={selectedCard.title}
                          description={selectedCard.description}
                          stats={selectedCard.stats}
                          locked={selectedCard.minigameLocked}
                          lockReason={selectedCard.lockReason}
                          difficultyLevel={selectedCard.difficulty.level}
                          accuracy={selectedCard.accuracy}
                          onPlay={handlePlayGame}
                        />
                      ) : (
                        <div className="hub-empty-state" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                          <p style={{ fontSize: '0.85rem' }}>Select a minigame to see details</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Session controls (always visible) ── */}
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

              {/* ── Tracklist strip (always visible) ── */}
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