import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  Lock,
  Target,
} from 'lucide-react'
import type {
  CategoryProgress,
  JlptLevel,
  JlptLevelProgress,
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
  CATEGORY_LEVEL_ORDER,
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
  /** Blocks currently selected; empty means the whole deck. */
  selectedBlockIndices: number[]
  /** Pre-rendered "n/m selected · k cards" label for the strip. */
  blockSelectionSummary: string
  gameLoading: boolean
  gameError: string | null
  blockProgressWithMastery: BlockInfo[]
  activeBlockCards: BasicCard[]
  kanjiLevelProgress: JlptLevelProgress[]
  vocabLevelProgress: JlptLevelProgress[]
  activeKanjiLevel: JlptLevel
  activeVocabLevel: JlptLevel
  /** Empty for kanji: its themes are block definitions, not category decks. */
  kanjiCategoryProgress: CategoryProgress[]
  vocabCategoryProgress: CategoryProgress[]
  activeVocabCategory: VocabCategory
  learningPathExpanded: boolean
  learningPathTrackRows: StudyPlanCoverageRow[]
  minigameStats: MinigameStatsByScript
  availableMinigames: MinigameKey[]
  activeSectionName: string | null
  minigameLockReasons: Partial<Record<MinigameKey, string>>
  // callbacks (navigation / deck selection only)
  onBack: () => void
  onToggleBlock: (index: number) => void
  onSelectAllBlocks: () => void
  onClearBlocks: () => void
  onSelectKanjiLevel: (level: JlptLevel) => void
  onSelectVocabLevel: (level: JlptLevel) => void
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
  selectedBlockIndices,
  blockSelectionSummary,
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
  activeVocabCategory,
  learningPathExpanded: _learningPathExpanded,
  learningPathTrackRows: _learningPathTrackRows,
  minigameStats,
  availableMinigames,
  activeSectionName,
  minigameLockReasons,
  onBack,
  onToggleBlock,
  onSelectAllBlocks,
  onClearBlocks,
  onSelectKanjiLevel,
  onSelectVocabLevel,
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
  // Multi-select (issue #78): the pool is the union of the selected blocks, so
  // there is no single "active block". The selection only ever holds unlocked
  // indices — useBlockSelection filters it — so the console opens whenever the
  // deck has anything unlocked at all.
  const selectedBlocks = blockProgressWithMastery.filter(
    (block) => selectedBlockIndices.includes(block.index),
  )
  const hasUnlockedBlock = blockProgressWithMastery.some((block) => block.unlocked)
  const selectedBlockLabel = selectedBlocks.length === 1
    ? selectedBlocks[0].name
    : selectedBlocks.length === 0
      ? 'Whole deck'
      : `${selectedBlocks.length} blocks`

  // The tracklist is always open. It was collapsed behind a "Change" button when
  // blocks were a wrapped chip cloud that grew unboundedly; as a scrolling list
  // it costs a fixed amount of room however many blocks a deck has.

  // Tracklist strip: blocks take precedence, categories otherwise. Categories
  // are split by JLPT level so a 28-entry list never renders as one long row.
  const isKanjiTrack = activeScript === 'kanji_n5'
  const showsBlocks = blockProgressWithMastery.length > 0
  // The two levelled sections span five JLPT decks. Since issue #78 they render
  // blocks rather than categories, so the level row can no longer hang off
  // `showsCategories` — losing it would strand a learner on N5 with no way to
  // reach N4–N1.
  const isLevelledTrack = isKanjiTrack || activeScript === 'vocab_n5'
  const showsCategories = !showsBlocks && isLevelledTrack
  const categoryRows = isKanjiTrack ? kanjiCategoryProgress : vocabCategoryProgress
  // Kanji has no category decks — its themes became block definitions — so its
  // level row is the fixed JLPT ladder rather than whatever categories exist.
  const categoryLevels = isKanjiTrack ? CATEGORY_LEVEL_ORDER : levelsPresentIn(categoryRows)
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
    <div className={`view-shell view-${navDirection}`}>
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

        <span className="hub-nameplate">
          <span className="hub-nameplate-mark" aria-hidden="true">
            JPL-{activeScript === 'kanji_n5' ? 'KNJ' : activeScript === 'vocab_n5' ? 'VCB' : 'SCR'}-A
          </span>
          <strong className="hub-topbar-title"><span className="hub-glitch-text">{SCRIPT_LABELS[activeScript]}</span></strong>
        </span>

        <span className="hub-topbar-sub">CASSETTE TAPE · カセット · SIDE A</span>
      </header>

      {/* ── Cassette console: study pool rail, then the deck ───── */}
      <div className="hub-studio hub-studio--rail">

        {/* Study pool rail. The live pool gates which minigames unlock, so it
            sits upstream of the deck: left to right is cause to effect. A full
            column shows about 24 rows, so only N1's 69 blocks scroll. */}
        <aside className="hub-rail" aria-label="Study pool">
          <div className="hub-rail-head">
            <span className="hub-tracklist-label">
              {showsBlocks
                ? blockSelectionSummary
                : showsCategories
                  ? `${visibleCategories.filter((c) => c.mastery >= 0.7 && c.total > 0).length}/${visibleCategories.filter((c) => c.total > 0).length}`
                  : ''}
            </span>
            {isLevelledTrack && categoryLevels.length > 1 ? (
              <div className="hub-level-row" role="group" aria-label="JLPT level">
                {categoryLevels.map((level) => {
                  const levelName = level.toUpperCase()
                  // Only meaningful for tracks with category rows. Kanji knows
                  // its blocks for the *active* level only, so it cannot count
                  // another level's unlocks and does not pretend to.
                  const levelRows = rowsForLevel(categoryRows, level)
                  const unlockedCount = levelRows.filter((row) => row.unlocked && row.total > 0).length
                  const countSuffix = levelRows.length > 0 ? ` (${unlockedCount} unlocked)` : ''
                  return (
                    <button
                      key={level}
                      type="button"
                      className={`hub-level-chip${level === visibleLevel ? ' is-active' : ''}`}
                      aria-pressed={level === visibleLevel}
                      aria-label={`Show ${levelName} kanji${countSuffix}`}
                      title={levelName + (countSuffix || '')}
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
          </div>

          {gameLoading ? null : showsBlocks ? (
            <div
              className="hub-tracklist"
              role="group"
              aria-label="Blocks to study"
            >
              <div className="hub-tracklist-actions">
                <button
                  type="button"
                  className="hub-block-chip hub-block-chip--action"
                  onClick={onSelectAllBlocks}
                  title="Study every unlocked block"
                >
                  All
                </button>
                <button
                  type="button"
                  className="hub-block-chip hub-block-chip--action"
                  onClick={onClearBlocks}
                  disabled={selectedBlockIndices.length === 0}
                  title="Clear the selection and study the whole deck"
                >
                  None
                </button>
              </div>
              <div className="hub-tracklist-rows">
                  {blockProgressWithMastery.map((block, position) => {
                    const isSelected = selectedBlockIndices.includes(block.index)
                    const masteryPct = Math.round(block.mastery * 100)
                    return (
                      <button
                        key={block.index}
                        type="button"
                        className={`hub-track${isSelected ? ' is-active' : ''}${!block.unlocked ? ' is-locked' : ''}`}
                        disabled={!block.unlocked}
                        aria-pressed={isSelected}
                        onClick={() => { if (block.unlocked) onToggleBlock(block.index) }}
                        title={!block.unlocked ? 'Locked' : `${block.name} — ${masteryPct}% of ${block.card_ids.length} cards`}
                      >
                        <span className="hub-track-no" aria-hidden="true">
                          {String(position + 1).padStart(2, '0')}
                        </span>
                        <span className="hub-track-name">{block.name}</span>
                        {/* Mastery is on the row itself rather than in a
                            tooltip, which a keyboard user never sees. */}
                        <span className="hub-track-bar" aria-hidden="true">
                          <span
                            className={`hub-track-fill${block.mastery >= 0.7 ? ' is-high' : ''}`}
                            style={{ '--track-pct': `${masteryPct}%` } as CSSProperties}
                          />
                        </span>
                        {/* The bar already carries the percentage, so
                            the column shows the card count instead. */}
                        <span className="hub-track-meta" aria-hidden="true">
                          {block.unlocked
                            ? block.card_ids.length
                            : <Lock size={11} strokeWidth={2.2} />}
                        </span>
                        <span className="sr-only">
                          {block.unlocked
                            ? `${masteryPct}% mastered, ${block.card_ids.length} cards`
                            : 'Locked'}
                        </span>
                      </button>
                    )
                  })}
              </div>
            </div>
          ) : showsCategories ? (
            <div className="hub-block-row-strip">
              {visibleCategories.map((cat) => {
                const isActive = activeVocabCategory === cat.key
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
                    onClick={() => onSelectVocabCategory(cat.key as VocabCategory)}
                  >
                    {categoryShortLabel(cat.label)}
                  </button>
                )
              })}
            </div>
          ) : null}
        </aside>

        <div className="hub-player">
          {/* Animated atmospheric elements */}
          <div className="hub-sweep" aria-hidden="true" />
          <div className="hub-particle hub-particle--1" aria-hidden="true" />
          <div className="hub-particle hub-particle--2" aria-hidden="true" />
          <div className="hub-particle hub-particle--3" aria-hidden="true" />
          <div className="hub-particle hub-particle--4" aria-hidden="true" />

          {!gameLoading && (blockProgressWithMastery.length === 0 || hasUnlockedBlock) ? (
            <>
              <div className="hub-player-header">
                <p className="hero-kicker">
                  <span className="hub-rec-dot" aria-hidden="true" />{' '}
                  {blockProgressWithMastery.length > 0
                    ? `${selectedBlockLabel} · ${activeBlockCards.length} cards`
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
