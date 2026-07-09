import { useMemo, useState } from 'react'
import { TypeAnimation } from 'react-type-animation'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Languages,
  Zap,
} from 'lucide-react'
import type { LearningPathStatus, MinigameKey, NavDirection, ScriptKey, SectionReadiness, StudyPlanSnapshot } from '../types'
import {
  SCRIPT_DIFFICULTY_META,
  SCRIPT_LABELS,
  SCRIPT_MENU_LINES,
  SECTION_META,
} from '../constants'
import { RecommendationCard } from '../components/RecommendationCard'
import { LearningPathPanel } from '../components/LearningPathPanel'
import { ScriptCassetteCarousel } from '../components/ScriptCassetteCarousel'
import { XPBar } from '../components/XPBar'
import type { ScriptCassetteItem } from '../components/ScriptCassetteCarousel'

const READINESS_BADGE: Record<SectionReadiness, { label: string; className: string }> = {
  completed: { label: 'Complete', className: 'badge-completed' },
  suggested_next: { label: 'Start Here', className: 'badge-suggested' },
  recommended: { label: 'Recommended', className: 'badge-recommended' },
  challenging: { label: 'Challenging', className: 'badge-challenging' },
  advanced: { label: 'Advanced', className: 'badge-advanced' },
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
  recommendations?: RecommendationData[]
  learningPathStatus?: LearningPathStatus | null
  xpProgress?: { level: number; xp_for_current_level: number; xp_to_next_level: number } | null
  onSelectScript: (script: ScriptKey) => void
  onOpenJlptPrep: () => void
  onJumpToSetup: (script: ScriptKey, minigame: MinigameKey) => void
  onStartRecommendation?: (nodeId: string) => void
  onContinuePath?: (sectionId: string) => void
  onChangePath?: () => void
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
  recommendations,
  learningPathStatus,
  xpProgress,
  onSelectScript,
  onOpenJlptPrep,
  onJumpToSetup,
  onStartRecommendation,
  onContinuePath,
  onChangePath,
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

  const stageLabel =
    studyPlan.learnerStage === 'starter' ? 'Starter'
      : studyPlan.learnerStage === 'building' ? 'Building'
        : 'Advanced'

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

        <span aria-hidden="true" />

        <div className="hub-topbar-center">
          <span className="hub-topbar-catalog">JPL-EARN</span>
          <strong className="hub-topbar-title">
            <TypeAnimation
              sequence={['JPLearn', 1000]}
              speed={20}
              cursor={false}
              className="hub-glitch-text"
              style={{ display: 'inline-block' }}
            />
          </strong>
          <span className="hub-topbar-catalog hub-topbar-catalog--sub">{greeting} · 日本語学習</span>
          <span className="hub-topbar-stripe" aria-hidden="true" />
        </div>

        <span aria-hidden="true" />
      </header>

      {xpProgress ? (
        <div style={{ padding: '0 1.5rem 0.6rem' }}>
          <XPBar
            level={xpProgress.level}
            xpToNextLevel={xpProgress.xp_to_next_level}
            xpForCurrentLevel={xpProgress.xp_for_current_level}
          />
        </div>
      ) : null}

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
            </div>
          )}

          {learningPathStatus && onContinuePath && onChangePath && learningPathStatus.path_id && (
            <LearningPathPanel
              status={learningPathStatus}
              onContinue={onContinuePath}
              onChangePath={onChangePath}
            />
          )}

          {recommendations && recommendations.length > 0 && onStartRecommendation ? (
            <section className="home-recommendations" aria-label="Study recommendations">
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

          {studyPlan.coverageRows.length > 0 ? (
            <section className="home-study-plan-strip panel-glass" aria-label="Study plan">
              <div className="home-study-plan-row">
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

                <div className="home-study-plan-shortcuts" aria-label="Study plan shortcuts">
                  {studyPlan.shortcutRows.map((shortcut) => (
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
              </div>
            </section>
          ) : null}

        </div>
      </div>
    </div>
  )
}
