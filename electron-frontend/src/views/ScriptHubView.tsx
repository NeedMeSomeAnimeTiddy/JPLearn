import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Flame,
  Heart,
  Lock,
  Settings,
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
  SCRIPT_LABELS,
  SESSION_LENGTH_PRESETS,
} from '../constants'
import { MinigameCassetteCarousel } from '../components/MinigameCassetteCarousel'
import type { CassetteItem } from '../components/MinigameCassetteCarousel'
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
  minigameStats: MinigameStatsByScript
  availableMinigames: MinigameKey[]
  activeScriptStats: { bestStreak: number }
  activeSectionName: string | null
  minigameLockReasons: Partial<Record<MinigameKey, string>>
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
  typed_recall: { level: 'medium', label: 'Medium' },
  speech_recall: { level: 'hard', label: 'Hard' },
  sentence_assembly: { level: 'hard', label: 'Hard' },
  particle_cloze: { level: 'hard', label: 'Hard' },
  vibe_check: { level: 'hard', label: 'Hard' },
  imposter: { level: 'hard', label: 'Hard' },
  listening_audio_first: { level: 'medium', label: 'Medium' },
  listening_prompt_first: { level: 'medium', label: 'Medium' },
  interleave_mix: { level: 'hard', label: 'Hard' },
}

interface RankedMinigameCard {
  key: MinigameKey
  title: string
  description: string
  accuracy: number
  difficulty: (typeof MINIGAME_DIFFICULTY)[MinigameKey]
  lockReason: string | null
  minigameLocked: boolean
  stats: MinigameStatsByScript[ScriptKey][MinigameKey]
  recommendationScore: number
}

function buildBalancedRanking(cards: RankedMinigameCard[]): RankedMinigameCard[] {
  if (cards.length <= 1) {
    return cards
  }

  const needsWork = [...cards].sort((left, right) => right.recommendationScore - left.recommendationScore)
  const momentum = [...cards].sort((left, right) => {
    const leftMomentum = left.accuracy + left.stats.bestStreak * 4 + Math.min(left.stats.attempted, 12)
    const rightMomentum = right.accuracy + right.stats.bestStreak * 4 + Math.min(right.stats.attempted, 12)
    return rightMomentum - leftMomentum
  })

  const seen = new Set<MinigameKey>()
  const balanced: RankedMinigameCard[] = []

  for (const card of needsWork) {
    if (balanced.length >= 2) break
    if (seen.has(card.key)) continue
    balanced.push(card)
    seen.add(card.key)
  }

  for (const card of momentum) {
    if (balanced.length >= 4) break
    if (seen.has(card.key)) continue
    balanced.push(card)
    seen.add(card.key)
  }

  for (const card of cards) {
    if (seen.has(card.key)) continue
    balanced.push(card)
    seen.add(card.key)
  }

  return balanced
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
  activeKanjiLevel: _activeKanjiLevel,
  activeVocabLevel: _activeVocabLevel,
  kanjiCategoryProgress,
  vocabCategoryProgress,
  activeKanjiCategory,
  activeVocabCategory,
  learningPathExpanded: _learningPathExpanded,
  learningPathTrackRows: _learningPathTrackRows,
  leechCardsLength,
  minigameStats,
  availableMinigames,
  activeScriptStats,
  activeSectionName,
  minigameLockReasons,
  isSheet = false,
  onBack,
  onOpenSettings,
  onSelectBlock,
  onSelectKanjiLevel: _onSelectKanjiLevel,
  onSelectVocabLevel: _onSelectVocabLevel,
  onSelectKanjiCategory,
  onSelectVocabCategory,
  onToggleLearningPath: _onToggleLearningPath,
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
  const activeBlock = blockProgressWithMastery.find((block) => block.index === activeBlockIndex)

  const rankedCards = useMemo(() => {
    const mapped = availableMinigames
      .map((gameKey) => {
        const game = MINIGAMES.find((entry) => entry.key === gameKey)
        if (!game) {
          return null
        }
        const stats = minigameStats[activeScript][game.key]
        const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0
        const lockReason = minigameLockReasons[game.key] ?? null
        const unmetNeed = stats.attempted === 0 ? 100 : Math.max(0, 85 - accuracy)
        const recommendationScore = unmetNeed + Math.max(0, 6 - Math.min(stats.bestStreak, 6))

        return {
          key: game.key,
          title: game.title,
          description: game.description,
          accuracy,
          difficulty: MINIGAME_DIFFICULTY[game.key],
          lockReason,
          minigameLocked: Boolean(lockReason),
          stats,
          recommendationScore,
        } satisfies RankedMinigameCard
      })
      .filter((entry): entry is RankedMinigameCard => entry !== null)

    return buildBalancedRanking(mapped)
  }, [availableMinigames, minigameStats, activeScript, minigameLockReasons])

  const cassetteItems = useMemo<CassetteItem[]>(() => (
    rankedCards.map((card) => ({
      key: card.key,
      title: card.title,
      difficultyLabel: card.difficulty.label,
      difficultyLevel: card.difficulty.level,
      accuracy: card.accuracy,
      bestStreak: card.stats.bestStreak,
      locked: card.minigameLocked,
      lockReason: card.lockReason,
    }))
  ), [rankedCards])

  return (
    <div className={isSheet ? 'script-hub-sheet-content' : `view-shell view-${navDirection}`}>

      {/* ── Record-label topbar ────────────────────────────────── */}
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
          <strong className="hub-topbar-title">{SCRIPT_LABELS[activeScript]}</strong>
          <span className="hub-topbar-catalog hub-topbar-catalog--sub">cassette tape · カセット</span>
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

      {/* ── Tape deck: two-zone layout ──────────────────────────── */}
      <div className="hub-studio">

        {/* Left rail: j-card tracklist */}
        <aside className="hub-rail">
          <div className="hub-rail-head">
            <p className="hero-kicker">tracklist</p>
            <span className="home-section-hint">
              {blockProgressWithMastery.length > 0
                ? `${blockProgressWithMastery.filter((b) => b.mastery >= 0.8).length}/${blockProgressWithMastery.length} mastered`
                : activeScript === 'kanji_n5'
                  ? `${kanjiCategoryProgress.filter((c) => c.mastery >= 0.7 && c.total > 0).length}/${kanjiCategoryProgress.filter((c) => c.total > 0).length} categories`
                  : activeScript === 'vocab_n5'
                    ? `${vocabCategoryProgress.filter((c) => c.mastery >= 0.7 && c.total > 0).length}/${vocabCategoryProgress.filter((c) => c.total > 0).length} categories`
                    : ''}
            </span>
          </div>

          <div className="hub-rail-body">
            {gameLoading ? (
              <p className="status-line">Loading deck…</p>
            ) : blockProgressWithMastery.length > 0 ? (
              <div className="hub-block-list">
                {blockProgressWithMastery.map((block, index) => {
                  const isActive = activeBlockIndex === block.index
                  const masteryPct = Math.round(block.mastery * 100)
                  const previousBlock = index > 0 ? blockProgressWithMastery[index - 1] : null
                  const lockReason = !block.unlocked
                    ? previousBlock
                      ? `Complete 70% of ${previousBlock.name} first.`
                      : 'Complete the previous block first.'
                    : null
                  return (
                    <button
                      key={block.index}
                      type="button"
                      className={`hub-block-row${isActive ? ' is-active' : ''}${!block.unlocked ? ' is-locked' : ''}`}
                      disabled={!block.unlocked}
                      onClick={() => { if (block.unlocked) onSelectBlock(block.index) }}
                      aria-pressed={isActive}
                      aria-label={block.unlocked ? `${block.name}, ${masteryPct}% mastered` : `${block.name} locked`}
                      title={lockReason ?? undefined}
                    >
                      <span className="hub-block-track">{String(index + 1).padStart(2, '0')}</span>
                      <span className="hub-block-copy">
                        <strong>{block.name}</strong>
                        <span className="hub-block-bar-wrap" aria-hidden="true">
                          <span className="hub-block-bar" style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties} />
                        </span>
                      </span>
                      <span className="hub-block-pct">{masteryPct}%</span>
                      {!block.unlocked ? <Lock size={12} strokeWidth={2} aria-hidden="true" className="hub-block-lock" /> : null}
                    </button>
                  )
                })}
              </div>
            ) : activeScript === 'kanji_n5' || activeScript === 'vocab_n5' ? (
              <div className="hub-block-list">
                {(activeScript === 'kanji_n5' ? kanjiCategoryProgress : vocabCategoryProgress).map((cat, i) => {
                  const isActive = activeScript === 'kanji_n5' ? activeKanjiCategory === cat.key : activeVocabCategory === cat.key
                  const masteryPct = Math.round(cat.mastery * 100)
                  const unavailable = cat.total === 0
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      className={`hub-block-row${isActive ? ' is-active' : ''}${(!cat.unlocked || unavailable) ? ' is-locked' : ''}`}
                      disabled={!cat.unlocked || unavailable}
                      onClick={() => {
                        if (activeScript === 'kanji_n5') onSelectKanjiCategory(cat.key as KanjiCategory)
                        else onSelectVocabCategory(cat.key as VocabCategory)
                      }}
                      aria-pressed={isActive}
                      aria-label={(!cat.unlocked || unavailable) ? `${cat.label} locked` : `${cat.label}, ${masteryPct}%`}
                    >
                      <span className="hub-block-track">{String(i + 1).padStart(2, '0')}</span>
                      <span className="hub-block-copy">
                        <strong>{cat.label}</strong>
                        <span className="hub-block-bar-wrap" aria-hidden="true">
                          <span className="hub-block-bar" style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties} />
                        </span>
                      </span>
                      <span className="hub-block-pct">{masteryPct}%</span>
                      {!cat.unlocked || unavailable ? <Lock size={12} strokeWidth={2} aria-hidden="true" className="hub-block-lock" /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </aside>

        {/* Right zone: cassette player + session controls */}
        <div className="hub-player">

          {!gameLoading && (blockProgressWithMastery.length === 0 || activeBlock?.unlocked) ? (
            <>
              <div className="hub-player-header">
                <p className="hero-kicker">
                  {blockProgressWithMastery.length > 0
                    ? `${activeBlock?.name ?? ''} · ${activeBlockCards.length} cards`
                    : activeScript === 'kanji_n5' || activeScript === 'vocab_n5'
                      ? `${activeSectionName ?? 'Category'} · ${activeBlockCards.length} cards`
                      : 'Pick a minigame'}
                </p>
                <span className="home-section-hint">← drag or use arrows →</span>
              </div>

              {/* Cassette carousel — inside a tape deck frame */}
              <div className="hub-deck">
                <div className="hub-deck-badge" aria-hidden="true">
                  <span>DOLBY NR</span>
                  <span className="hub-deck-dot" />
                </div>
                <div className="minigame-cassette-shelf">
                  <MinigameCassetteCarousel
                    items={cassetteItems}
                    activeGame={activeGame}
                    onSelectGame={onSelectGame}
                    onPlayGame={onPlayGame}
                  />
                </div>
                <div className="hub-deck-badge hub-deck-badge--right" aria-hidden="true">
                  <span>TYPE II · HIGH BIAS</span>
                </div>
              </div>

              {/* Studio controls: session length + toggles as inline chips */}
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

              {sessionSummaryLoading ? <p className="status-line">Loading…</p> : null}
              {sessionGoalError ? <p className="status-line status-error">{sessionGoalError}</p> : null}
              {lastSessionSummary ? (
                <section className="hub-last-session" aria-live="polite">
                  <span className="hub-last-session-label">Last session</span>
                  <span className="hub-last-session-stats">
                    {lastSessionSummary.completed_items}/{lastSessionSummary.target_items} · {lastSessionSummary.accuracy}%
                  </span>
                  <button
                    type="button"
                    className="hub-chip-button is-active"
                    onClick={continueLastSession}
                    disabled={!sessionRunReport || sessionStartPending}
                    aria-label="Continue last session"
                  >
                    Continue
                  </button>
                </section>
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