import { useMemo, useState, type ReactNode } from 'react'
import { TypeAnimation } from 'react-type-animation'
import {
  AlertTriangle,
  ArrowRight,
  BookText,
  Gamepad2,
  Languages,
  Zap,
} from 'lucide-react'
import type {
  LearningPathStatus, MinigameKey, NavDirection, ScriptKey, SectionReadiness,
  SessionPrefOverrides, StudyPlanSnapshot,
} from '../types'
import type { StudyBlockPayload } from '../generated/types'
import {
  DIFFICULTY_DOTS,
  MINIGAMES,
  RECOMMENDATION_REASON_LABELS,
  SCRIPT_DIFFICULTY_META,
  SCRIPT_LABELS,
  SCRIPT_MENU_LINES,
  SECTION_META,
} from '../constants'
import { ScriptCassetteCarousel } from '../components/ScriptCassetteCarousel'
import { DailyGoalWidget } from '../components/DailyGoalWidget'
import type { ScriptCassetteItem } from '../components/ScriptCassetteCarousel'
import { DAILY_GAMES_COPY } from '../features/daily-games/constants'

const READINESS_BADGE: Record<SectionReadiness, { label: string; className: string }> = {
  completed: { label: 'Complete', className: 'badge-completed' },
  suggested_next: { label: 'Start Here', className: 'badge-suggested' },
  recommended: { label: 'Recommended', className: 'badge-recommended' },
  challenging: { label: 'Challenging', className: 'badge-challenging' },
  advanced: { label: 'Advanced', className: 'badge-advanced' },
}

interface HomeViewProps {
  navDirection: NavDirection
  studyPlan: StudyPlanSnapshot
  /** The "Up next" block, from the `recommendations` bridge command. */
  studyBlock?: StudyBlockPayload | null
  learningPathStatus?: LearningPathStatus | null
  onSelectScript: (script: ScriptKey) => void
  onOpenJlptPrep: () => void
  onOpenPassages?: () => void
  onOpenDailyGames: () => void
  onJumpToSetup: (script: ScriptKey, minigame: MinigameKey, overrides?: SessionPrefOverrides) => void
  /** The curriculum map (issue #78 Phase 4). Omitted while it is loading. */
  progressionMap?: ReactNode
}

const SCRIPT_ORDER: readonly ScriptKey[] = [
  'hiragana',
  'katakana',
  'kanji_n5',
  'vocab_n5',
  'grammar_patterns',
  'sentence_examples',
]

export function HomeView({
  navDirection,
  studyPlan,
  studyBlock,
  learningPathStatus,
  onSelectScript,
  onOpenJlptPrep,
  onOpenPassages,
  onOpenDailyGames,
  onJumpToSetup,
  progressionMap,
}: HomeViewProps) {
  const [selectedScript, setSelectedScript] = useState<ScriptKey>('hiragana')

  const readinessBySection = useMemo(() => {
    const map: Partial<Record<string, SectionReadiness>> = {}
    if (learningPathStatus?.steps) {
      for (const step of learningPathStatus.steps) {
        map[step.section_id] = step.readiness
      }
    }
    return map
  }, [learningPathStatus])

  const hourOfDay = new Date().getHours()
  const greeting =
    hourOfDay < 5 ? 'Late night study'
      : hourOfDay < 12 ? 'Good morning'
        : hourOfDay < 17 ? 'Good afternoon'
          : hourOfDay < 21 ? 'Good evening'
            : 'Winding down'

  // Stage is decided by the Python engine and displayed here. The deck badge
  // wants the bare noun where the block heading wants the adjectival form
  // ("Build-up session"), so only this one is derived locally.
  const stageLabel =
    studyBlock?.learner_stage === 'building' ? 'Building'
      : studyBlock?.learner_stage === 'advanced' ? 'Advanced'
        : 'Starter'

  const jlptCoverageRows = studyPlan.coverageRows.filter((row) => (
    row.key === 'kanji_n5' || row.key === 'vocab_n5' || row.key === 'grammar_patterns'
  ))
  const jlptTrackedCards = jlptCoverageRows.reduce((sum, row) => sum + row.total, 0)
  const jlptMasteredCardsApprox = jlptCoverageRows.reduce((sum, row) => sum + (row.mastery * row.total), 0)
  const jlptPrepProgressPct = jlptTrackedCards > 0
    ? Math.round((jlptMasteredCardsApprox / jlptTrackedCards) * 100)
    : 0

  const cassetteItems = useMemo<ScriptCassetteItem[]>(() => (
    SCRIPT_ORDER.map((script) => {
      const difficulty = SCRIPT_DIFFICULTY_META[script]
      const coverageRow = studyPlan.coverageRows.find((r) => r.key === script)
      const pct = coverageRow ? Math.round(coverageRow.mastery * 100) : 0
      return {
        key: script,
        title: SCRIPT_LABELS[script],
        description: SCRIPT_MENU_LINES[script],
        glyph: SECTION_META[script].glyph,
        difficultyLabel: difficulty.label,
        difficultyLevel: (difficulty.tier <= 2 ? 'easy' : difficulty.tier === 3 ? 'medium' : 'hard') as ScriptCassetteItem['difficultyLevel'],
        coveragePct: pct,
        locked: false,
        lockReason: null,
      }
    })
  ), [studyPlan.coverageRows])

  const selectedCassette = cassetteItems.find((c) => c.key === selectedScript)
  const selectedReadiness = readinessBySection[selectedScript]
  const selectedBadge = selectedReadiness ? READINESS_BADGE[selectedReadiness] : null
  const selectedIsNeedsWarning = selectedReadiness === 'challenging' || selectedReadiness === 'advanced'

  return (
    <div className={`view-shell home-view view-${navDirection}`}>

      <div className="hub-crt-surface" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
      <div className="hub-vhs-line" aria-hidden="true" />
      <div className="hub-crystal hub-crystal--a" aria-hidden="true" />
      <div className="hub-crystal hub-crystal--b" aria-hidden="true" />
      <div className="hub-crystal hub-crystal--c" aria-hidden="true" />

      <header className="hub-topbar">
        <h1 className="sr-only">Main Menu</h1>

        {/* A nameplate at the left edge instead of a centred four-line stack.
            The old kicker read "JP-LEARN" directly beside "JPLearn" — the same
            word twice at two sizes on one baseline — so the plate's segment is
            just "JP" and the wordmark stands alone. */}
        <span className="hub-nameplate">
          <span className="hub-nameplate-mark" aria-hidden="true">JP</span>
          <strong className="hub-topbar-title">
            <TypeAnimation
              sequence={['JPLearn', 1000]}
              speed={20}
              cursor={false}
              className="hub-glitch-text"
              style={{ display: 'inline-block' }}
            />
          </strong>
        </span>

        <span className="hub-topbar-sub">{greeting} · 日本語学習</span>
      </header>

      <div className="hub-studio">
        <div className="hub-player">

          <div className="hub-sweep" aria-hidden="true" />
          <div className="hub-particle hub-particle--1" aria-hidden="true" />
          <div className="hub-particle hub-particle--2" aria-hidden="true" />
          <div className="hub-particle hub-particle--3" aria-hidden="true" />
          <div className="hub-particle hub-particle--4" aria-hidden="true" />

          <div className="hub-player-header">
            <p className="hero-kicker">
              <span className="hub-rec-dot" aria-hidden="true" />{' '}
              Your decks · {stageLabel} stage
            </p>
            <span className="home-section-hint">◀◀  scroll  ▶▶</span>
          </div>

          <div className="hub-deck-badge" aria-hidden="true">
            <span>DOLBY NR</span>
            <span className="hub-deck-dot" />
          </div>

          <ScriptCassetteCarousel
            items={cassetteItems}
            activeScript={selectedScript}
            onSelectScript={setSelectedScript}
            onPlayScript={onSelectScript}
          />

          <div className="hub-deck-badge hub-deck-badge--right" aria-hidden="true">
            <span>TYPE II · HIGH BIAS</span>
          </div>

          {selectedCassette && (
            <div className="home-deck-info">
              <div className="home-deck-info-head">
                <div className="home-deck-info-title-row">
                  <span className="home-deck-info-glyph" lang="ja">{selectedCassette.glyph}</span>
                  <strong>{selectedCassette.title}</strong>
                  {selectedBadge && (
                    <span className={`menu-card-readiness-badge ${selectedBadge.className}`}>
                      {selectedIsNeedsWarning && <AlertTriangle size={10} strokeWidth={2.2} aria-hidden="true" />}
                      {selectedReadiness === 'suggested_next' && <Zap size={10} strokeWidth={2.2} aria-hidden="true" />}
                      {selectedReadiness === 'completed' && <span className="badge-check" aria-hidden="true" />}
                      {selectedBadge.label}
                    </span>
                  )}
                </div>
                <span className="home-deck-info-meta">
                  {selectedCassette.difficultyLabel} · {selectedCassette.coveragePct}% coverage · {stageLabel}
                </span>
              </div>

              {/* Grouped rather than spread by `justify-content: space-between`
                  — three destinations spaced across the full width read as
                  three unrelated things. */}
              <div className="home-deck-info-actions">
              <button
                type="button"
                className="home-jlpt-button"
                aria-label="Open JLPT preparation"
                onClick={onOpenJlptPrep}
              >
                <Languages size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>JLPT Prep</span>
                <span className="home-jlpt-pct">{jlptPrepProgressPct}%</span>
                <ArrowRight size={13} strokeWidth={2.2} aria-hidden="true" />
              </button>

              {onOpenPassages ? (
                <button
                  type="button"
                  className="home-jlpt-button"
                  aria-label="Open reading passages"
                  onClick={onOpenPassages}
                >
                  <BookText size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>Passages</span>
                  <ArrowRight size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : null}

              <button
                type="button"
                className="home-jlpt-button"
                aria-label={DAILY_GAMES_COPY.title}
                onClick={onOpenDailyGames}
              >
                <Gamepad2 size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>{DAILY_GAMES_COPY.title}</span>
                <ArrowRight size={13} strokeWidth={2.2} aria-hidden="true" />
              </button>
              </div>
            </div>
          )}

          {/* The curriculum, rendered from JPLEARN_GRAPH. Replaced the
              learning-path panel, which showed a second, flatter model of the
              same course (issue #78 Phase 5). */}
          {progressionMap}

          {/* One block, replacing the study-plan strip and the separate
              recommendation cards. Those were two independent engines ranking
              the same six sections from different inputs, rendered one above the
              other with buttons that behaved differently — one landed on the
              script hub, the other launched a configured round. */}
          {studyBlock && studyBlock.recommendations.length > 0 ? (
            <section className="up-next" aria-labelledby="up-next-title">
              <div className="up-next-head">
                <h2 id="up-next-title" className="up-next-title">Up next</h2>
                <span className="up-next-session">
                  {studyBlock.session_minutes} min · {studyBlock.stage_label}
                </span>
                {/* Today's count belongs to the same question this block asks —
                    how much am I doing now — so it rides in the heading rather
                    than occupying a row of its own. The target picker still
                    opens on click. */}
                <DailyGoalWidget />
              </div>

              <p className="up-next-note">{studyBlock.session_note}</p>

              <ol className="up-next-list">
                {studyBlock.recommendations.map((row, index) => {
                  const badge = RECOMMENDATION_REASON_LABELS[row.reason] ?? row.reason
                  const drill = MINIGAMES.find((game) => game.key === row.minigame)?.title ?? row.minigame
                  return (
                    <li key={row.node_id}>
                      <button
                        type="button"
                        className={`up-next-row${index === 0 ? ' is-top' : ''}`}
                        onClick={() => onJumpToSetup(
                          row.section as ScriptKey,
                          row.minigame as MinigameKey,
                          row.leech_focus_enabled === null
                            ? undefined
                            : { leechFocusEnabled: row.leech_focus_enabled },
                        )}
                      >
                        <span className="up-next-row-main">
                          <strong className="up-next-row-name">
                            {row.section_label} · {drill}
                          </strong>
                          <span className="up-next-row-meta">
                            {row.review_count} {row.review_count === 1 ? 'item' : 'items'}
                            {' · '}
                            {DIFFICULTY_DOTS[row.difficulty] ?? row.difficulty}
                          </span>
                        </span>
                        <span className={`up-next-row-reason reason-${row.reason}`}>{badge}</span>
                        <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" className="up-next-row-arrow" />
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ) : null}

        </div>
      </div>
    </div>
  )
}
