import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Collapsible from '@radix-ui/react-collapsible'
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  Flame,
  Heart,
  Info,
  Lock,
  Play,
  Settings,
  Target,
  Trophy,
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
  type MinigameSkillGroupKey,
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

type ExpandedPanelKind = 'preview' | 'details' | null

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

interface MinigameLane {
  key: MinigameSkillGroupKey
  title: string
  helper: string
  cards: RankedMinigameCard[]
}

const LANE_FIRST_FOLD = 4

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

interface MinigameLaneRowProps {
  lane: MinigameLane
  activeGame: MinigameKey
  expanded: boolean
  expandedPanels: Partial<Record<MinigameKey, ExpandedPanelKind>>
  onToggleLane: (laneKey: MinigameSkillGroupKey) => void
  onSetExpandedPanel: (key: MinigameKey, kind: ExpandedPanelKind) => void
  onSelectGame: (game: MinigameKey) => void
  onPlayGame: (game: MinigameKey) => void
}

function MinigameLaneRow({
  lane,
  activeGame,
  expanded,
  expandedPanels,
  onToggleLane,
  onSetExpandedPanel,
  onSelectGame,
  onPlayGame,
}: MinigameLaneRowProps) {
  const [emblaRef] = useEmblaCarousel({ align: 'start', dragFree: true, containScroll: 'trimSnaps' })
  const reduceMotion = useReducedMotion()
  const visibleCards = expanded ? lane.cards : lane.cards.slice(0, LANE_FIRST_FOLD)
  const hasOverflow = lane.cards.length > LANE_FIRST_FOLD
  const laneBodyId = `minigame-lane-body-${lane.key}`

  return (
    <section className="minigame-lane" aria-label={`${lane.title} minigames`}>
      <header className="minigame-lane-head">
        <div>
          <h4 className="minigame-lane-title">{lane.title}</h4>
          <p className="minigame-lane-helper">{lane.helper}</p>
        </div>
        {hasOverflow ? (
          <button
            type="button"
            className="minigame-lane-toggle"
            onClick={() => onToggleLane(lane.key)}
            aria-expanded={expanded}
            aria-controls={laneBodyId}
          >
            {expanded ? 'Show less' : `Show all (${lane.cards.length})`}
          </button>
        ) : null}
      </header>

      <div id={laneBodyId} className="minigame-lane-viewport" ref={emblaRef}>
        <div className="minigame-lane-track">
          {visibleCards.map((card, index) => {
            const panel = expandedPanels[card.key] ?? null
            const slideDelay = `${120 + index * 45}ms`
            const inlinePanelId = `game-inline-panel-${card.key}`

            return (
              <article
                key={card.key}
                className={clsx('game-tile', activeGame === card.key && 'is-active', card.minigameLocked && 'is-locked')}
                onClick={() => {
                  if (card.minigameLocked) return
                  onSelectGame(card.key)
                }}
                style={{ animationDelay: slideDelay }}
              >
                <div className={clsx('game-tile-main', card.minigameLocked && 'is-blurred')}>
                  <div className="game-tile-head">
                    <span className="game-icon" aria-hidden="true">
                      <MinigameIcon game={card.key} />
                    </span>
                    <div className="game-tile-copy">
                      <strong className="game-tile-title">{card.title}</strong>
                      <span className={`game-tile-difficulty-badge is-${card.difficulty.level}`} title={`Difficulty: ${card.difficulty.label}`}>
                        {card.difficulty.level === 'hard' ? (
                          <AlertTriangle className="game-tile-difficulty-icon" strokeWidth={2.1} aria-hidden="true" />
                        ) : card.difficulty.level === 'medium' ? (
                          <Flame className="game-tile-difficulty-icon" strokeWidth={2.1} aria-hidden="true" />
                        ) : (
                          <Target className="game-tile-difficulty-icon" strokeWidth={2.1} aria-hidden="true" />
                        )}
                        <span className="game-tile-difficulty-label">{card.difficulty.label}</span>
                      </span>
                      <p className="game-tile-description">{card.description}</p>
                    </div>
                  </div>

                  <div className="game-tile-stats" aria-label="Minigame stats">
                    <span className="game-tile-stat" aria-label="Accuracy" title="Accuracy">
                      <span className="game-tile-stat-label" aria-hidden="true">
                        <Target className="game-tile-stat-icon" strokeWidth={2.1} />
                      </span>
                      <strong>{card.accuracy}%</strong>
                    </span>
                    <span className="game-tile-stat" aria-label="Best streak" title="Best streak">
                      <span className="game-tile-stat-label" aria-hidden="true">
                        <Flame className="game-tile-stat-icon" strokeWidth={2.1} />
                      </span>
                      <strong>{card.stats.bestStreak}</strong>
                    </span>
                    <span className="game-tile-stat" aria-label="Points" title="Points">
                      <span className="game-tile-stat-label" aria-hidden="true">
                        <Trophy className="game-tile-stat-icon" strokeWidth={2.1} />
                      </span>
                      <strong>{card.stats.points}</strong>
                    </span>
                  </div>

                  <Tooltip.Provider delayDuration={180}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <motion.button
                          type="button"
                          className="game-launch-pill"
                          disabled={card.minigameLocked}
                          aria-label={card.minigameLocked ? `${card.title} is locked` : `Launch ${card.title}`}
                          onClick={(event: MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation()
                            if (card.minigameLocked) {
                              return
                            }
                            onPlayGame(card.key)
                          }}
                          whileHover={reduceMotion ? undefined : { scale: 1.015, y: -1 }}
                          whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                        >
                          <motion.span
                            className="game-launch-pill-icon"
                            animate={reduceMotion
                              ? undefined
                              : {
                                  rotate: [0, -8, 8, 0],
                                  scale: [1, 1.05, 1],
                                }}
                            transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
                            aria-hidden="true"
                          >
                            <Play size={16} strokeWidth={2.3} />
                          </motion.span>
                          <span className="game-launch-pill-label">Launch</span>
                        </motion.button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content sideOffset={8} className="game-launch-tooltip">
                          Launch {card.title}
                          <Tooltip.Arrow className="game-launch-tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>

                  <div className="game-tile-subactions" role="group" aria-label={`${card.title} additional actions`}>
                    <button
                      type="button"
                      className={clsx('game-subaction-pill', panel === 'preview' && 'is-active')}
                      disabled={card.minigameLocked}
                      aria-expanded={panel === 'preview'}
                      aria-controls={inlinePanelId}
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation()
                        onSetExpandedPanel(card.key, panel === 'preview' ? null : 'preview')
                      }}
                    >
                      <Eye size={14} aria-hidden="true" /> Preview
                    </button>
                    <button
                      type="button"
                      className={clsx('game-subaction-pill', panel === 'details' && 'is-active')}
                      disabled={card.minigameLocked}
                      aria-expanded={panel === 'details'}
                      aria-controls={inlinePanelId}
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation()
                        onSetExpandedPanel(card.key, panel === 'details' ? null : 'details')
                      }}
                    >
                      <Info size={14} aria-hidden="true" /> Details
                    </button>
                  </div>

                  <Collapsible.Root open={panel !== null}>
                    <Collapsible.Content id={inlinePanelId} className="game-inline-panel" forceMount>
                      {panel === 'preview' ? (
                        <p>
                          Preview a short sample round of {card.title} before launching.
                        </p>
                      ) : panel === 'details' ? (
                        <p>
                          {card.title} focuses on {lane.title.toLowerCase()} skills and currently sits in the {card.difficulty.label.toLowerCase()} difficulty tier.
                        </p>
                      ) : null}
                    </Collapsible.Content>
                  </Collapsible.Root>
                </div>

                {card.lockReason ? (
                  <div className="game-tile-lock-overlay" aria-hidden="true">
                    <div className="game-tile-lock-overlay-card">
                      <Lock className="game-tile-lock-icon" strokeWidth={2} />
                      <p className="game-tile-lock-title">{card.title}</p>
                      <p className="game-tile-lock-copy">{card.lockReason}</p>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
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
  kanjiLevelProgress: _kanjiLevelProgress,
  vocabLevelProgress: _vocabLevelProgress,
  activeKanjiLevel: _activeKanjiLevel,
  activeVocabLevel: _activeVocabLevel,
  kanjiCategoryProgress,
  vocabCategoryProgress,
  activeKanjiCategory,
  activeVocabCategory,
  learningPathExpanded,
  learningPathTrackRows,
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
  const [expandedLanes, setExpandedLanes] = useState<Partial<Record<MinigameSkillGroupKey, boolean>>>({})
  const [expandedPanels, setExpandedPanels] = useState<Partial<Record<MinigameKey, ExpandedPanelKind>>>({})

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

  const minigameLanes = useMemo<MinigameLane[]>(() => {
    const grouped = new Map<MinigameSkillGroupKey, RankedMinigameCard[]>()
    for (const card of rankedCards) {
      const groupKey = MINIGAME_SKILL_GROUP[card.key]
      const existing = grouped.get(groupKey) ?? []
      existing.push(card)
      grouped.set(groupKey, existing)
    }

    return Array.from(grouped.entries())
      .map(([key, cards]) => ({
        key,
        title: MINIGAME_SKILL_GROUP_META[key].title,
        helper: MINIGAME_SKILL_GROUP_META[key].helper,
        cards,
      }))
      .sort((left, right) => MINIGAME_SKILL_GROUP_META[left.key].order - MINIGAME_SKILL_GROUP_META[right.key].order)
  }, [rankedCards])

  const toggleLane = useCallback((laneKey: MinigameSkillGroupKey) => {
    setExpandedLanes((previous) => ({
      ...previous,
      [laneKey]: !previous[laneKey],
    }))
  }, [])

  const setExpandedPanel = useCallback((key: MinigameKey, kind: ExpandedPanelKind) => {
    setExpandedPanels((previous) => {
      if (!kind) {
        const next = { ...previous }
        delete next[key]
        return next
      }
      return { ...previous, [key]: kind }
    })
  }, [])

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
                    ? `${kanjiCategoryProgress.filter((cat) => cat.mastery >= 0.7 && cat.total > 0).length} / ${kanjiCategoryProgress.filter((cat) => cat.total > 0).length} categories mastered`
                    : activeScript === 'vocab_n5'
                      ? `${vocabCategoryProgress.filter((cat) => cat.mastery >= 0.7 && cat.total > 0).length} / ${vocabCategoryProgress.filter((cat) => cat.total > 0).length} categories mastered`
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
                    const previousBlock = index > 0 ? blockProgressWithMastery[index - 1] : null
                    const lockReason = !block.unlocked
                      ? previousBlock
                        ? `Complete 70% of ${previousBlock.name} to unlock.`
                        : 'Complete the previous foundation block first.'
                      : null
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
                          aria-label={block.unlocked
                            ? `${block.name}, ${masteryPct}% mastered`
                            : `${block.name}, locked. ${lockReason}`}
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
                          {!block.unlocked && lockReason ? (
                            <span className="block-node-lock-reason">{lockReason}</span>
                          ) : null}
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
                  aria-label={`${activeScript === 'kanji_n5' ? 'Kanji' : 'Vocabulary'} categories`}
                >
                  {(activeScript === 'kanji_n5' ? kanjiCategoryProgress : vocabCategoryProgress).map((cat, index, cats) => {
                    const isActive = activeScript === 'kanji_n5' ? activeKanjiCategory === cat.key : activeVocabCategory === cat.key
                    const masteryPct = Math.round(cat.mastery * 100)
                    const unavailable = cat.total === 0
                    const previousCat = cats
                      .slice(0, index)
                      .reverse()
                      .find((candidate) => candidate.total > 0)
                    const lockReason = unavailable
                      ? 'No cards available in this category yet.'
                      : !cat.unlocked
                        ? previousCat
                          ? `Complete 70% of ${previousCat.label} to unlock.`
                          : 'Complete the previous category first.'
                        : null
                    return (
                      <article
                        key={cat.key}
                        className={`jlpt-level-node ${isActive ? 'is-active' : ''} ${(!cat.unlocked || unavailable) ? 'is-locked' : ''}`}
                        style={{ animationDelay: `${80 + index * 45}ms` }}
                      >
                        <button
                          type="button"
                          className="jlpt-level-button"
                          disabled={!cat.unlocked || unavailable}
                          onClick={() => {
                            if (activeScript === 'kanji_n5') {
                              onSelectKanjiCategory(cat.key as KanjiCategory)
                            } else {
                              onSelectVocabCategory(cat.key as VocabCategory)
                            }
                          }}
                          aria-pressed={isActive}
                          aria-label={(!cat.unlocked || unavailable)
                            ? `${cat.label}, locked. ${lockReason}`
                            : `${cat.label}, ${masteryPct}% mastered`}
                        >
                          <div className="jlpt-level-header">
                            <strong className="jlpt-level-title">{cat.label}</strong>
                            {!cat.unlocked || unavailable ? (
                              <Lock className="block-lock-icon" strokeWidth={2} aria-hidden="true" />
                            ) : null}
                          </div>
                          <span className="jlpt-level-preview" lang="ja" aria-hidden="true">
                            {cat.sampleChars.length > 0 ? cat.sampleChars.join(' ') : '—'}
                          </span>
                          {!cat.unlocked || unavailable ? (
                            <span className="jlpt-level-lock-reason">{lockReason}</span>
                          ) : null}
                          <div className="block-node-bar-wrap" aria-label={`Mastery: ${masteryPct}%`}>
                            <div
                              className="block-node-bar"
                              style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties}
                            />
                          </div>
                          <span className="jlpt-level-meta">
                            {cat.total} cards • {masteryPct}%
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
                      ? `Choose a minigame — ${activeSectionName ?? 'Category'} (${activeBlockCards.length} cards)`
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

            <div className="minigame-lane-stack">
              {minigameLanes.map((lane) => (
                <MinigameLaneRow
                  key={lane.key}
                  lane={lane}
                  activeGame={activeGame}
                  expanded={Boolean(expandedLanes[lane.key])}
                  expandedPanels={expandedPanels}
                  onToggleLane={toggleLane}
                  onSetExpandedPanel={setExpandedPanel}
                  onSelectGame={onSelectGame}
                  onPlayGame={onPlayGame}
                />
              ))}
            </div>
          </>
        ) : null}

        {gameError ? <p className="status-line status-error">{gameError}</p> : null}
      </section>
    </div>
  )
}
