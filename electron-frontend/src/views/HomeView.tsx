import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { LearningPathStatus, MinigameKey, NavDirection, ScriptKey, SectionReadiness, StudyPlanSnapshot } from '../types'
import {
  SCRIPT_DIFFICULTY_META,
  SCRIPT_LABELS,
  SCRIPT_MENU_LINES,
  SECTION_META,
} from '../constants'
import { AlertTriangle, Languages, Play, Zap } from 'lucide-react'
import { TutorBanner } from '../components/TutorBanner'
import { RecommendationCard } from '../components/RecommendationCard'
import { LearningPathPanel } from '../components/LearningPathPanel'

// Readiness badge meta — label and icon for each state shown on section cards
const READINESS_BADGE: Record<SectionReadiness, { label: string; className: string }> = {
  completed: { label: 'Complete', className: 'badge-completed' },
  suggested_next: { label: 'Start Here', className: 'badge-suggested' },
  recommended: { label: 'Recommended', className: 'badge-recommended' },
  challenging: { label: 'Challenging', className: 'badge-challenging' },
  advanced: { label: 'Advanced', className: 'badge-advanced' },
}

interface TutorBannerData {
  dedupKey: string
  headline: string
  body: string
  cta: string
  messageType: 'congratulation' | 'encouragement' | 'guidance' | 'acknowledgement'
}

interface RecommendationData {
  nodeId: string
  displayLabel: string
  reviewCount: number
  difficulty: string
  reason: string
}

interface HomeViewProps {
  navDirection: NavDirection
  studyPlan: StudyPlanSnapshot
  homeStudyPlanExpanded: boolean
  tutorBanner?: TutorBannerData | null
  recommendations?: RecommendationData[]
  learningPathStatus?: LearningPathStatus | null
  onSelectScript: (script: ScriptKey) => void
  onOpenJlptPrep: () => void
  onToggleStudyPlan: () => void
  onJumpToSetup: (script: ScriptKey, minigame: MinigameKey) => void
  onDismissTutorBanner?: (dedupKey: string) => void
  onStartRecommendation?: (nodeId: string) => void
  onContinuePath?: (sectionId: string) => void
  onChangePath?: () => void
}

export function HomeView({
  navDirection,
  studyPlan,
  homeStudyPlanExpanded,
  tutorBanner,
  recommendations,
  learningPathStatus,
  onSelectScript,
  onOpenJlptPrep,
  onToggleStudyPlan,
  onJumpToSetup,
  onDismissTutorBanner,
  onStartRecommendation,
  onContinuePath,
  onChangePath,
}: HomeViewProps) {
  useEffect(() => {
    // Pre-warm JLPT readiness/history so opening JLPT Prep feels instant.
    void Promise.allSettled([
      window.jplearnDesktop.getJLPTReadiness?.(),
      window.jplearnDesktop.getJLPTExamHistory?.(),
    ])
  }, [])

  const jlptCoverageRows = studyPlan.coverageRows.filter((row) => (
    row.key === 'kanji_n5' || row.key === 'vocab_n5' || row.key === 'grammar_patterns'
  ))
  const jlptTrackedCards = jlptCoverageRows.reduce((sum, row) => sum + row.total, 0)
  const jlptMasteredCardsApprox = jlptCoverageRows.reduce((sum, row) => sum + (row.mastery * row.total), 0)
  const jlptPrepProgressPct = jlptTrackedCards > 0
    ? Math.round((jlptMasteredCardsApprox / jlptTrackedCards) * 100)
    : 0

  // Build a readiness lookup from the learning path steps
  const readinessBySection: Partial<Record<string, SectionReadiness>> = {}
  if (learningPathStatus?.steps) {
    for (const step of learningPathStatus.steps) {
      readinessBySection[step.section_id] = step.readiness
    }
  }
  const hourOfDay = new Date().getHours()
  const greeting =
    hourOfDay < 5 ? 'Late night study'
      : hourOfDay < 12 ? 'Good morning'
        : hourOfDay < 17 ? 'Good afternoon'
          : hourOfDay < 21 ? 'Good evening'
            : 'Winding down'
  const overallCoveragePct = Math.round(studyPlan.overallMastery * 100)
  const stageLabel =
    studyPlan.learnerStage === 'starter' ? 'Starter'
      : studyPlan.learnerStage === 'building' ? 'Building'
        : 'Advanced'

  return (
    <div className={`view-shell home-view view-${navDirection}`}>
      {tutorBanner && onDismissTutorBanner && (
        <TutorBanner
          headline={tutorBanner.headline}
          body={tutorBanner.body}
          cta={tutorBanner.cta}
          messageType={tutorBanner.messageType}
          onDismiss={() => onDismissTutorBanner(tutorBanner.dedupKey)}
        />
      )}

      <div className="home-desk">
        <aside className="home-desk-feature panel-glass">
          <div className="home-feature-scene" aria-hidden="true">
            <div className="home-hero-window">
              <span className="home-hero-moon" />
              <span className="home-hero-star home-hero-star-1" />
              <span className="home-hero-star home-hero-star-2" />
              <span className="home-hero-star home-hero-star-3" />
              <span className="home-hero-hill" />
            </div>
            <span className="home-hero-plant" />
            <span className="home-hero-mug">
              <span className="home-hero-steam" />
            </span>
          </div>

          <p className="home-feature-kicker">{greeting} · lofi study room</p>
          <h1 className="home-feature-title"><span lang="ja">日本語</span></h1>
          <p className="home-feature-sub">Pick a tape off the shelf and settle in.</p>

          <div className="home-feature-stats">
            <span className="home-feature-stat">
              <strong>{overallCoveragePct}%</strong>
              <span>coverage</span>
            </span>
            <span className="home-feature-stat">
              <strong>{studyPlan.recommendedMinutes}m</strong>
              <span>session</span>
            </span>
            <span className="home-feature-stat">
              <strong>{stageLabel}</strong>
              <span>stage</span>
            </span>
          </div>

          {learningPathStatus && onContinuePath && onChangePath && learningPathStatus.path_id && (
            <LearningPathPanel
              status={learningPathStatus}
              onContinue={onContinuePath}
              onChangePath={onChangePath}
            />
          )}

          {recommendations && recommendations.length > 0 && onStartRecommendation ? (
            <section className="home-recommendations" aria-label="Study recommendations">
              <p className="home-recommendations-heading hero-kicker">Recommended</p>
              <div className="home-recommendations-list">
                {recommendations.slice(0, 2).map((rec) => (
                  <RecommendationCard
                    key={rec.nodeId}
                    displayLabel={rec.displayLabel}
                    reviewCount={rec.reviewCount}
                    difficulty={rec.difficulty}
                    reason={rec.reason}
                    onStart={() => onStartRecommendation(rec.nodeId)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <div className="home-desk-shelf">
          <div className="home-section-head">
            <p className="hero-kicker">Your decks</p>
            <span className="home-section-hint">Tap a tape to start a session</span>
          </div>

          <div className="home-tape-stack">
            {(['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns', 'sentence_examples'] as const).map((script, index) => {
              const glyph = SECTION_META[script].glyph
              const difficulty = SCRIPT_DIFFICULTY_META[script]
              const DifficultyIcon = difficulty.icon
              const coverageRow = studyPlan.coverageRows.find((r) => r.key === script)
              const readiness = readinessBySection[script]
              const badgeMeta = readiness ? READINESS_BADGE[readiness] : null
              const isNeedsWarning = readiness === 'challenging' || readiness === 'advanced'
              const pct = coverageRow ? Math.round(coverageRow.mastery * 100) : 0

              return (
                <button
                  key={script}
                  type="button"
                  className={`home-tape home-tape--diff-${difficulty.tier}${readiness ? ` home-tape--${readiness}` : ''}`}
                  aria-keyshortcuts={String(index + 1)}
                  onClick={() => onSelectScript(script)}
                >
                  <span className="home-tape-spine" aria-hidden="true">
                    <span className="home-tape-glyph" lang="ja">{glyph}</span>
                    <span className="home-tape-reel home-tape-reel-1" />
                    <span className="home-tape-reel home-tape-reel-2" />
                  </span>
                  <span className="home-tape-body">
                    <span className="home-tape-titlerow">
                      <strong>{SCRIPT_LABELS[script]}</strong>
                      {badgeMeta && (
                        <span className={`menu-card-readiness-badge ${badgeMeta.className}`}>
                          {isNeedsWarning && <AlertTriangle size={10} strokeWidth={2.2} aria-hidden="true" />}
                          {readiness === 'suggested_next' && <Zap size={10} strokeWidth={2.2} aria-hidden="true" />}
                          {badgeMeta.label}
                        </span>
                      )}
                    </span>
                    <span className="home-tape-line">{SCRIPT_MENU_LINES[script]}</span>
                    {coverageRow && coverageRow.total > 0 ? (
                      <span className="home-tape-progress">
                        <span className="home-tape-track" aria-hidden="true">
                          <span className="home-tape-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="home-tape-pct" aria-label={`${pct}% mastered`}>{pct}%</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="home-tape-side">
                    <span
                      className={`menu-card-difficulty menu-card-difficulty-${difficulty.tier}`}
                      title={`Difficulty: ${difficulty.label}`}
                    >
                      <DifficultyIcon className="menu-card-difficulty-icon" aria-hidden="true" strokeWidth={2.05} />
                      <span>{difficulty.label}</span>
                    </span>
                    <span className="home-tape-play" aria-hidden="true">
                      <Play size={15} strokeWidth={2.4} />
                    </span>
                  </span>
                </button>
              )
            })}

            <button
              type="button"
              className="home-tape home-tape--advanced"
              aria-label="Open JLPT preparation"
              onClick={onOpenJlptPrep}
            >
              <span className="home-tape-spine" aria-hidden="true">
                <span className="home-tape-glyph" lang="ja">級</span>
                <span className="home-tape-reel home-tape-reel-1" />
                <span className="home-tape-reel home-tape-reel-2" />
              </span>
              <span className="home-tape-body">
                <span className="home-tape-titlerow">
                  <strong>JLPT Prep</strong>
                  <span className="menu-card-readiness-badge badge-advanced">
                    <AlertTriangle size={10} strokeWidth={2.2} aria-hidden="true" />
                    Advanced
                  </span>
                </span>
                <span className="home-tape-line">Timed exam sets, projected score tracking, and weak-area drills.</span>
                <span className="home-tape-progress">
                  <span className="home-tape-track" aria-hidden="true">
                    <span className="home-tape-fill" style={{ width: `${jlptPrepProgressPct}%` }} />
                  </span>
                  <span className="home-tape-pct" aria-label={`${jlptPrepProgressPct}% JLPT prep progress`}>{jlptPrepProgressPct}%</span>
                </span>
              </span>
              <span className="home-tape-side">
                <span className="menu-card-difficulty menu-card-difficulty-5" title="Difficulty: Exam">
                  <Languages className="menu-card-difficulty-icon" aria-hidden="true" strokeWidth={2.05} />
                  <span>N5-N1</span>
                </span>
                <span className="home-tape-play" aria-hidden="true">
                  <Play size={15} strokeWidth={2.4} />
                </span>
              </span>
            </button>
          </div>

          {studyPlan.coverageRows.length > 0 ? (
            <section className="home-study-plan-strip panel-glass" aria-label="Study plan">
              <button
                type="button"
                className="home-study-plan-toggle"
                onClick={onToggleStudyPlan}
                aria-expanded={homeStudyPlanExpanded}
                aria-controls="home-study-plan-body"
              >
                <div className="home-study-plan-heading">
                  <p className="hero-kicker">Study Plan</p>
                  <strong>
                    {studyPlan.recommendedMinutes}-minute{' '}
                    {studyPlan.learnerStage === 'starter'
                      ? 'starter-safe'
                      : studyPlan.learnerStage === 'building'
                        ? 'build-up'
                        : 'advanced'}{' '}
                    session
                  </strong>
                  <span>{studyPlan.sessionNote}</span>
                </div>
                <div className="home-study-plan-summary">
                  <span>{Math.round(studyPlan.overallMastery * 100)}% coverage</span>
                  <span>{studyPlan.focusRows[0]?.label ?? 'Keep reviewing'}</span>
                  <span
                    aria-hidden="true"
                    className={`home-study-plan-chevron ${homeStudyPlanExpanded ? 'is-open' : ''}`}
                  >
                    ▾
                  </span>
                </div>
              </button>

              <div
                id="home-study-plan-body"
                className={`home-study-plan-body ${homeStudyPlanExpanded ? 'is-open' : ''}`}
              >
                <div className="home-study-plan-strip-grid">
                  <div className="home-study-plan-shortcuts" aria-label="Study plan shortcuts">
                    {studyPlan.shortcutRows.slice(0, 2).map((shortcut) => (
                      <button
                        key={shortcut.key}
                        type="button"
                        className="study-plan-shortcut-button study-plan-shortcut-button-inline"
                        onClick={() => onJumpToSetup(shortcut.script, shortcut.minigame)}
                      >
                        <span className="study-plan-shortcut-kicker">Quick shortcut</span>
                        <strong>{shortcut.label}</strong>
                        <p>{shortcut.note}</p>
                      </button>
                    ))}
                  </div>

                  <div className="home-study-plan-metrics">
                    {studyPlan.coverageRows.slice(0, 3).map((row) => {
                      const pct = Math.round(row.mastery * 100)
                      return (
                        <div key={row.key} className="home-study-plan-metric-row">
                          <div className="home-study-plan-metric-head">
                            <strong>{row.label}</strong>
                            <span>{pct}%</span>
                          </div>
                          <div className="study-plan-coverage-bar" aria-hidden="true">
                            <div
                              className="study-plan-coverage-fill"
                              style={{ '--study-plan-pct': `${pct}%` } as CSSProperties}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
