import type { CSSProperties } from 'react'
import type { MinigameKey, NavDirection, ScriptKey, StudyPlanSnapshot } from '../types'
import {
  SCRIPT_DIFFICULTY_META,
  SCRIPT_LABELS,
  SCRIPT_MENU_LINES,
  SECTION_META,
} from '../constants'
import { Lock } from 'lucide-react'
import { TutorBanner } from '../components/TutorBanner'
import { RecommendationCard } from '../components/RecommendationCard'

const LOCK_HINTS: Partial<Record<ScriptKey, string>> = {
  katakana: 'Unlocks after Hiragana reaches 35% mastery.',
  kanji_n5: 'Unlocks after Hiragana reaches 70% and Katakana reaches 45%.',
  vocab_n5: 'Unlocks after Hiragana reaches 70% and Katakana reaches 55%.',
  grammar_patterns: 'Unlocks after Words (Vocabulary N5) reaches 45% mastery.',
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
  onSelectScript: (script: ScriptKey) => void
  onToggleStudyPlan: () => void
  onJumpToSetup: (script: ScriptKey, minigame: MinigameKey) => void
  onDismissTutorBanner?: (dedupKey: string) => void
  onStartRecommendation?: (nodeId: string) => void
}

export function HomeView({
  navDirection,
  studyPlan,
  homeStudyPlanExpanded,
  tutorBanner,
  recommendations,
  onSelectScript,
  onToggleStudyPlan,
  onJumpToSetup,
  onDismissTutorBanner,
  onStartRecommendation,
}: HomeViewProps) {
  return (
    <div className={`view-shell view-${navDirection}`}>
      {tutorBanner && onDismissTutorBanner && (
        <TutorBanner
          headline={tutorBanner.headline}
          body={tutorBanner.body}
          cta={tutorBanner.cta}
          messageType={tutorBanner.messageType}
          onDismiss={() => onDismissTutorBanner(tutorBanner.dedupKey)}
        />
      )}
      <section className="home-menu panel-glass">
        <h1 className="home-logo">JPLearn</h1>
        <p className="home-copy">
          Main Menu. Choose a learning track, then pick a minigame and start your run.
        </p>

        <div className="menu-grid">
          {(['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns'] as const).map((script, index) => {
            const glyph = SECTION_META[script].glyph
            const difficulty = SCRIPT_DIFFICULTY_META[script]
            const DifficultyIcon = difficulty.icon
            const coverageRow = studyPlan.coverageRows.find((r) => r.key === script)
            const isLocked = coverageRow ? !coverageRow.unlocked : false
            const lockHint = LOCK_HINTS[script] ?? 'Keep progressing your earlier tracks.'

            return (
              <button
                key={script}
                type="button"
                className={`menu-card${isLocked ? ' is-locked' : ''}`}
                aria-keyshortcuts={isLocked ? undefined : String(index + 1)}
                aria-label={isLocked ? `${SCRIPT_LABELS[script]} — locked. ${lockHint}` : undefined}
                title={isLocked ? lockHint : undefined}
                disabled={isLocked}
                onClick={() => onSelectScript(script)}
              >
                <span
                  className={`menu-card-difficulty menu-card-difficulty-${difficulty.tier}`}
                  aria-label={`Difficulty: ${difficulty.label}`}
                  title={`Difficulty: ${difficulty.label}`}
                >
                  <DifficultyIcon className="menu-card-difficulty-icon" aria-hidden="true" strokeWidth={2.05} />
                  <span>{difficulty.label}</span>
                </span>
                <span className="menu-script-glyph" aria-hidden="true" lang="ja">{glyph}</span>
                <strong>{SCRIPT_LABELS[script]}</strong>
                <p>{SCRIPT_MENU_LINES[script]}</p>
                {isLocked && (
                  <span className="menu-card-lock-overlay" aria-hidden="true">
                    <Lock className="menu-card-lock-icon" strokeWidth={2.1} />
                    <span className="menu-card-lock-label">Locked</span>
                    <span className="menu-card-lock-hint">{lockHint}</span>
                  </span>
                )}
              </button>
            )
          })}
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

        {recommendations && recommendations.length > 0 && onStartRecommendation ? (
          <section className="home-recommendations" aria-label="Study recommendations">
            <p className="home-recommendations-heading hero-kicker">Recommended</p>
            <div className="home-recommendations-list">
              {recommendations.slice(0, 3).map((rec) => (
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
      </section>
    </div>
  )
}
