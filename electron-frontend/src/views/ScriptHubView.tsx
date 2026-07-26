import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  Target,
} from 'lucide-react'
import type {
  CategoryProgress,
  JlptLevel,
  JlptLevelProgress,
  KanjiCategory,
  MinigameKey,
  MinigameStatsByScript,
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
  MINIGAMES,
  MINIGAME_SKILL_GROUP,
  MINIGAME_SKILL_GROUP_META,
  SCRIPT_LABELS,
  SESSION_LENGTH_PRESETS,
} from '../constants'
import { MinigameCassetteCarousel } from '../components/MinigameCassetteCarousel'
import type { GroupedSlide } from '../components/MinigameCassetteCarousel'
import type { MinigameSkillGroupKey } from '../constants'
import { useSession } from '../context/SessionContext'
import {
  categoryShortLabel,
  levelsPresentIn,
  resolveVisibleLevel,
  rowsForLevel,
} from '../lib/categoryLevels'

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
  tags?: string[]
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
  minigameStats: MinigameStatsByScript
  availableMinigames: MinigameKey[]
  activeSectionName: string | null
  minigameLockReasons: Partial<Record<MinigameKey, string>>
  isSheet?: boolean
  // callbacks (navigation / deck selection only)
  onBack: () => void
  onSelectBlock: (index: number) => void
  onSelectKanjiLevel: (level: JlptLevel) => void
  onSelectVocabLevel: (level: JlptLevel) => void
  onSelectKanjiCategory: (cat: KanjiCategory) => void
  onSelectVocabCategory: (cat: VocabCategory) => void
  onToggleLearningPath: () => void
  onSelectGame: (game: MinigameKey) => void
  onPlayGame: (game: MinigameKey) => void
}

// Suppress unused-import warnings for constants included per spec
void CONFIDENCE_LEVEL_LABELS
void CONFIDENCE_SCORES
void DEFAULT_SESSION_LENGTH_PRESET
void JLPT_LEVEL_LABELS

const MINIGAME_DIFFICULTY: Record<MinigameKey, {
  level: 'easy' | 'medium' | 'hard'
  label: 'Easy' | 'Medium' | 'Hard'
}> = {
  romaji_sprint: { level: 'easy', label: 'Easy' },
  meaning_match: { level: 'easy', label: 'Easy' },
  character_match: { level: 'easy', label: 'Easy' },
  stroke_order: { level: 'medium', label: 'Medium' },
  handwriting: { level: 'medium', label: 'Medium' },
  typed_recall: { level: 'medium', label: 'Medium' },
  speech_recall: { level: 'hard', label: 'Hard' },
  sentence_assembly: { level: 'hard', label: 'Hard' },
  particle_cloze: { level: 'hard', label: 'Hard' },
  vibe_check: { level: 'hard', label: 'Hard' },
  imposter: { level: 'hard', label: 'Hard' },
  listening_audio_first: { level: 'medium', label: 'Medium' },
  dictation: { level: 'medium', label: 'Medium' },
  kanji_compound_builder: { level: 'medium', label: 'Medium' },
  context_cloze: { level: 'hard', label: 'Hard' },
  conjugation_drill: { level: 'hard', label: 'Hard' },
  interleave_mix: { level: 'hard', label: 'Hard' },
}



// Legacy lane-based minigame browser removed — replaced by MinigameCassetteCarousel.

export function ScriptHubView({
  navDirection,
  activeScript,
  activeGame,
  activeBlockIndex,
  gameLoading,
  gameError,
  blockProgressWithMastery,
  activeBlockCards,
  kanjiLevelProgress: _kanjiLevelProgress,
  vocabLevelProgress: _vocabLevelProgress,
  activeKanjiLevel,
  activeVocabLevel,
  kanjiCategoryProgress,
  vocabCategoryProgress,
  activeKanjiCategory,
  activeVocabCategory,
  learningPathExpanded: _learningPathExpanded,
  learningPathTrackRows: _learningPathTrackRows,
  minigameStats,
  availableMinigames,
  activeSectionName,
  minigameLockReasons,
  isSheet = false,
  onBack,
  onSelectBlock,
  onSelectKanjiLevel,
  onSelectVocabLevel,
  onSelectKanjiCategory,
  onSelectVocabCategory,
  onToggleLearningPath: _onToggleLearningPath,
  onSelectGame,
  onPlayGame,
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

  // Tracklist strip: blocks take precedence, categories otherwise. Categories
  // are split by JLPT level so a 28-entry list never renders as one long row.
  const isKanjiTrack = activeScript === 'kanji_n5'
  const showsBlocks = blockProgressWithMastery.length > 0
  const showsCategories = !showsBlocks && (isKanjiTrack || activeScript === 'vocab_n5')
  const categoryRows = isKanjiTrack ? kanjiCategoryProgress : vocabCategoryProgress
  const categoryLevels = levelsPresentIn(categoryRows)
  const visibleLevel = resolveVisibleLevel(categoryRows, isKanjiTrack ? activeKanjiLevel : activeVocabLevel)
  const visibleCategories = rowsForLevel(categoryRows, visibleLevel)

  const groupedSlides = useMemo<GroupedSlide[]>(() => {
    // Group available minigames by skill group
    const groups = new Map<MinigameSkillGroupKey, MinigameKey[]>()
    for (const gameKey of availableMinigames) {
      const groupKey = MINIGAME_SKILL_GROUP[gameKey]
      if (!groupKey) continue
      if (!groups.has(groupKey)) groups.set(groupKey, [])
      groups.get(groupKey)!.push(gameKey)
    }

    // Sort groups by order, filter out empty ones
    const sortedGroups = Array.from(groups.entries())
      .filter(([, keys]) => keys.length > 0)
      .sort((a, b) => MINIGAME_SKILL_GROUP_META[a[0]].order - MINIGAME_SKILL_GROUP_META[b[0]].order)

    // Build slides array with headers, ranked cassettes, and dividers
    const slides: GroupedSlide[] = []
    sortedGroups.forEach(([groupKey, gameKeys], groupIdx) => {
      const meta = MINIGAME_SKILL_GROUP_META[groupKey]

      slides.push({ kind: 'header', label: meta.title, helper: meta.helper, groupKey })

      const cards = gameKeys
        .map((gameKey) => {
          const game = MINIGAMES.find((entry) => entry.key === gameKey)
          if (!game) return null
          const stats = minigameStats[activeScript][game.key]
          const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0
          const lockReason = minigameLockReasons[game.key] ?? null
          return {
            key: game.key,
            title: game.title,
            description: game.description,
            accuracy,
            difficulty: MINIGAME_DIFFICULTY[game.key],
            lockReason,
            minigameLocked: Boolean(lockReason),
            stats,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

      for (const card of cards) {
        slides.push({
          kind: 'cassette',
          item: {
            key: card.key,
            title: card.title,
            description: card.description,
            difficultyLabel: card.difficulty.label,
            difficultyLevel: card.difficulty.level,
            accuracy: card.accuracy,
            bestStreak: card.stats.bestStreak,
            locked: card.minigameLocked,
            lockReason: card.lockReason,
          },
        })
      }

      if (groupIdx < sortedGroups.length - 1) {
        slides.push({ kind: 'divider' })
      }
    })

    return slides
  }, [availableMinigames, minigameStats, activeScript, minigameLockReasons])

  const selectedCassette = useMemo(() => {
    for (const slide of groupedSlides) {
      if (slide.kind === 'cassette' && slide.item.key === activeGame) return slide.item
    }
    return undefined
  }, [groupedSlides, activeGame])

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

        <span aria-hidden="true" />
      </header>

      {/* ── Single-zone cassette console ────────────────────────── */}
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
                <span className="home-section-hint">◀◀  scroll  ▶▶</span>
              </div>

              <div className="hub-eq" aria-hidden="true">
                <span className="hub-eq-bar" style={{ animationDelay: '0s' } as CSSProperties} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.1s' } as CSSProperties} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.2s' } as CSSProperties} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.05s' } as CSSProperties} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.15s' } as CSSProperties} />
                <span className="hub-eq-bar" style={{ animationDelay: '0.25s' } as CSSProperties} />
              </div>
              <div className="hub-deck-badge" aria-hidden="true">
                <span>DOLBY NR</span>
                <span className="hub-deck-dot" />
              </div>

              <div className="hub-deck-shelf">
              <MinigameCassetteCarousel
                slides={groupedSlides}
                activeGame={activeGame}
                onSelectGame={onSelectGame}
                onPlayGame={onPlayGame}
              />
              <div className="hub-cassette-bay">
                <div className="hub-deck-badge hub-deck-badge--right" aria-hidden="true">
                  <span>TYPE II · HIGH BIAS</span>
                </div>

                {selectedCassette ? (
                  <div className="cassette-info">
                    <span className="cassette-info-text">{selectedCassette.description}</span>
                  </div>
                ) : null}

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
              </div>
              </div>

              {/* Tracklist strip — level tabs above a wrapped chip grid, so no
                  track's sections can run off-screen (vocab has 28 categories,
                  kanji 19). Blocks have no JLPT levels, so they just wrap. */}
              {!gameLoading ? (
                <div className="hub-tracklist-strip">
                  <span className="hub-tracklist-label">
                    {showsBlocks
                      ? `${blockProgressWithMastery.filter((b) => b.mastery >= 0.8).length}/${blockProgressWithMastery.length} mastered`
                      : showsCategories
                        ? `${visibleCategories.filter((c) => c.mastery >= 0.7 && c.total > 0).length}/${visibleCategories.filter((c) => c.total > 0).length}`
                        : ''}
                  </span>
                  <div className="hub-tracklist-groups">
                    {showsCategories && categoryLevels.length > 1 ? (
                      <div className="hub-level-row" role="group" aria-label="JLPT level">
                        {categoryLevels.map((level) => {
                          const levelName = level.toUpperCase()
                          const unlockedCount = rowsForLevel(categoryRows, level)
                            .filter((row) => row.unlocked && row.total > 0).length
                          return (
                            <button
                              key={level}
                              type="button"
                              className={`hub-level-chip${level === visibleLevel ? ' is-active' : ''}`}
                              aria-pressed={level === visibleLevel}
                              aria-label={`Show ${levelName} sections (${unlockedCount} unlocked)`}
                              title={`${levelName} — ${unlockedCount} unlocked`}
                              onClick={() => {
                                if (isKanjiTrack) onSelectKanjiLevel(level)
                                else onSelectVocabLevel(level)
                              }}
                            >
                              {levelName}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}

                    {showsBlocks ? (
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
                              aria-pressed={isActive}
                              onClick={() => { if (block.unlocked) onSelectBlock(block.index) }}
                              title={!block.unlocked ? 'Locked' : `${block.name} ${masteryPct}%`}
                            >
                              {block.name}
                            </button>
                          )
                        })}
                      </div>
                    ) : showsCategories ? (
                      <div className="hub-block-row-strip">
                        {visibleCategories.map((cat) => {
                          const isActive = isKanjiTrack ? activeKanjiCategory === cat.key : activeVocabCategory === cat.key
                          const unavailable = cat.total === 0
                          const masteryPct = Math.round(cat.mastery * 100)
                          return (
                            <button
                              key={cat.key}
                              type="button"
                              className={`hub-block-chip${isActive ? ' is-active' : ''}${(!cat.unlocked || unavailable) ? ' is-locked' : ''}`}
                              disabled={!cat.unlocked || unavailable}
                              aria-pressed={isActive}
                              title={unavailable ? 'No cards' : !cat.unlocked ? 'Locked' : `${cat.label} ${masteryPct}%`}
                              onClick={() => {
                                if (isKanjiTrack) onSelectKanjiCategory(cat.key as KanjiCategory)
                                else onSelectVocabCategory(cat.key as VocabCategory)
                              }}
                            >
                              {categoryShortLabel(cat.label)}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
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
