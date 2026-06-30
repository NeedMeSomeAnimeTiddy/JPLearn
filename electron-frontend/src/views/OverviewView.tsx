import type { CSSProperties } from 'react'
import { Fragment } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookText,
  CalendarDays,
  Flame,
  History,
  Languages,
  ListChecks,
  RefreshCw,
  Settings,
  Target,
} from 'lucide-react'
import type {
  CardScores,
  JlptLevel,
  JlptLevelProgress,
  NavDirection,
  ScriptKey,
} from '../types'
import {
  ALL_SCRIPT_KEYS,
  JLPT_LEVEL_LABELS,
  KANJI_OVERVIEW_PAGE_SIZE,
  SCRIPT_LABELS,
} from '../constants'
import { formatTimelineDeckName, formatTimelineScriptTag, jlptTagFromCard } from '../utils'

const CARD_MASTERY_MAX = 4

type OverviewSectionKey =
  | 'studyActivity'
  | 'contextClozeCurriculum'
  | 'storyProgress'
  | 'mistakeBreakdown'
  | 'itemTimeline'
  | 'deckSnapshot'

interface DeckSummary {
  slug: string
  name: string
  total: number
  mastered: number
  due_today: number
  completed_today: number
}

interface ActivityWindow {
  days: number
  reviewed: number
  correct: number
  incorrect: number
  accuracy: number
  points_earned: number
  active_days: number
}

interface ActivityData {
  week: ActivityWindow
  month: ActivityWindow
}

interface SummaryTile {
  label: string
  value: string
  tone: string
  icon: LucideIcon
  accent: string
  note?: string
}

interface CurriculumMode {
  attempts: number
  accuracy: number
  accuracy_7d: number
  stage_distribution: Record<1 | 2 | 3, number>
}

interface ChapterStats {
  attempts: number
  accuracy: number
  completion_rate: number
}

interface NarrativeMode {
  attempts: number
  accuracy: number
  chapters: Record<'1' | '2' | '3', ChapterStats>
}

interface StoryReadiness {
  script: ScriptKey
}

interface BlockInfo {
  index: number
  name: string
  sample_chars: string[]
  unlocked: boolean
  mastery: number
  card_ids: number[]
  characters?: string[]
  meanings?: string[]
  romajis?: string[]
}

interface KanjiCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
}

interface MistakeRow {
  key: string
  attempts: number
  mistakes: number
  error_rate: number
}

interface ItemHistoryEntry {
  key: string
  prompt: string
  trend: string
  script_tag: string
  deck: string
  events: Array<{ outcome: string; points_delta: number }>
}

interface SelectedChar {
  character: string
  romaji: string
  meaning: string
  label: string
  score: number
}

interface OverviewViewProps {
  navDirection: NavDirection
  loading: boolean
  error: string | null
  lastUpdated: string | null
  decks: DeckSummary[]
  streak: { current_days: number; best_days: number }
  activity: ActivityData
  summaryTiles: SummaryTile[]
  curriculumSummary: CurriculumMode
  curriculumByScript: Record<ScriptKey, CurriculumMode>
  narrativeSummary: NarrativeMode
  narrativeByScript: Record<ScriptKey, NarrativeMode>
  storyReadiness: StoryReadiness[]
  overviewBlocks: Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>
  overviewKanjiDeck: KanjiCard[]
  overviewKanjiLevelProgress: JlptLevelProgress[]
  overviewBlocksLoading: boolean
  mistakes: MistakeRow[]
  itemHistory: ItemHistoryEntry[]
  pagedHistory: ItemHistoryEntry[]
  clampedHistoryPage: number
  historyPageCount: number
  hasAnyActivity: boolean
  hasMistakeData: boolean
  charMasteryExpanded: boolean
  expandedBlocks: string | null
  overviewSectionExpanded: Record<OverviewSectionKey, boolean>
  resetConfirmStep: 0 | 1 | 2
  resettingDb: boolean
  cardScores: CardScores
  kanjiOverviewPage: Partial<Record<JlptLevel, number>>
  totals: { completedToday: number }
  isOverlay?: boolean
  // callbacks
  onBack: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  onToggleCharMastery: () => void
  onSetExpandedBlocks: (key: string | null) => void
  onToggleSection: (section: OverviewSectionKey) => void
  onResetConfirmStep: (step: 0 | 1 | 2) => void
  onResetDb: () => void
  onSetHistoryPage: (updater: (prev: number) => number) => void
  onSetKanjiOverviewPage: (
    updater: (prev: Partial<Record<JlptLevel, number>>) => Partial<Record<JlptLevel, number>>,
  ) => void
  onSetSelectedChar: (char: SelectedChar) => void
}

// Suppress unused-import warning for JLPT_LEVEL_LABELS (available for consumers/future use)
void JLPT_LEVEL_LABELS

export function OverviewView({
  navDirection,
  loading,
  error,
  lastUpdated,
  decks,
  streak,
  activity,
  summaryTiles,
  curriculumSummary,
  curriculumByScript,
  narrativeSummary,
  narrativeByScript,
  storyReadiness,
  overviewBlocks,
  overviewKanjiDeck,
  overviewKanjiLevelProgress,
  overviewBlocksLoading,
  mistakes,
  itemHistory,
  pagedHistory,
  clampedHistoryPage,
  historyPageCount,
  hasAnyActivity,
  hasMistakeData,
  charMasteryExpanded,
  expandedBlocks,
  overviewSectionExpanded,
  resetConfirmStep,
  resettingDb,
  cardScores,
  kanjiOverviewPage,
  totals,
  onBack,
  onOpenSettings,
  onRefresh,
  onToggleCharMastery,
  onSetExpandedBlocks,
  onToggleSection,
  onResetConfirmStep,
  onResetDb,
  onSetHistoryPage,
  onSetKanjiOverviewPage,
  onSetSelectedChar,
  isOverlay = false,
}: OverviewViewProps) {
  return (
    <div className={isOverlay ? 'overview-overlay-content' : `view-shell view-${navDirection}`}>
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
          <span className="brand-kicker">JPLearn</span>
          <h1>Study Overview</h1>
        </div>
        <div className="topbar-end">
          <div className="focus-chip">
            <span>Progress Board</span>
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

      <section className="panel-glass overview-hero">
        <div className="overview-hero-copy">
          <p className="hero-kicker">Session Snapshot</p>
          <h2 className="overview-hero-title">Your Learning Pulse</h2>
          <p className="hero-copy">See how much you have mastered and what to tackle in your next focused run.</p>
          <div className="overview-snapshot-grid" aria-label="Session snapshot metrics">
            {summaryTiles.map((tile, index) => (
              <article
                key={`${tile.label}-${tile.value}`}
                className={`overview-snapshot-tile tone-${tile.tone}`}
                style={{ animationDelay: `${120 + index * 80}ms` }}
                title={'note' in tile ? tile.note : undefined}
              >
                <p><tile.icon aria-hidden="true" className={`metric-icon icon-${tile.accent}`} strokeWidth={2.2} />{tile.label}</p>
                <strong className="live-value">{tile.value}</strong>
              </article>
            ))}
          </div>
        </div>
        <div className="overview-hero-actions">
          <button
            type="button"
            className="icon-action-button"
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? 'Refreshing data' : 'Refresh data'}
            title={loading ? 'Refreshing data' : 'Refresh data'}
          >
            <RefreshCw aria-hidden="true" className={`inline-button-icon ${loading ? 'spin-icon' : ''}`} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="danger-button icon-action-button"
            onClick={() => onResetConfirmStep(1)}
            disabled={resettingDb}
            aria-label={resettingDb ? 'Resetting database' : 'Reset database'}
            title={resettingDb ? 'Resetting database' : 'Reset database'}
          >
            <AlertTriangle aria-hidden="true" className={`inline-button-icon ${resettingDb ? 'spin-icon' : ''}`} strokeWidth={2.2} />
          </button>
          <span>{lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for first sync'}</span>
        </div>
      </section>

      {resetConfirmStep > 0 ? (
        <section className="panel-glass reset-confirm-panel" role="alertdialog" aria-modal="true">
          {resetConfirmStep === 1 ? (
            <>
              <h3>Reset all progress?</h3>
              <p>
                This will permanently delete all review history, streaks, leech data,
                and locally-tracked character scores. There is no undo.
              </p>
              <div className="reset-confirm-actions">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => onResetConfirmStep(2)}
                  disabled={resettingDb}
                >
                  I understand — continue
                </button>
                <button type="button" onClick={() => onResetConfirmStep(0)} disabled={resettingDb}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>Final confirmation</h3>
              <p>
                <strong>All your progress will be erased.</strong>{' '}
                Click the button below to permanently delete everything.
              </p>
              <div className="reset-confirm-actions">
                <button
                  type="button"
                  className="danger-button danger-button-final"
                  onClick={onResetDb}
                  disabled={resettingDb}
                >
                  {resettingDb ? 'Resetting…' : '⚠ Yes, delete everything'}
                </button>
                <button type="button" onClick={() => onResetConfirmStep(0)} disabled={resettingDb}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* ── Character mastery grid ────────────────────────────────── */}
      <section className="panel-glass char-mastery-panel">
        <button
          type="button"
          className="char-mastery-toggle"
          onClick={onToggleCharMastery}
          aria-expanded={charMasteryExpanded}
        >
          <div className="panel-head char-mastery-panel-head">
            <h2 className="panel-title-with-icon"><Languages aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Character Mastery</h2>
            <div className="panel-actions">
              <span>{overviewBlocksLoading ? 'Loading…' : 'Color-coded progress for every symbol'}</span>
            </div>
            <span className={`char-mastery-chevron ${charMasteryExpanded ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        {/* max-height wrapper — inner div carries padding so wrapper can collapse to 0 cleanly */}
        <div className={`char-mastery-body ${charMasteryExpanded ? 'is-open' : ''}`}>
          <div className="char-mastery-body-inner">
            {(['hiragana', 'katakana'] as const).map((script) => {
              const blocks = overviewBlocks[script]
              if (!blocks || blocks.length === 0) return null
              const scores = cardScores[script]

              return (
                <div key={script} className="char-mastery-script">
                  <h3 className="char-mastery-script-name">
                    {script === 'hiragana' ? 'Hiragana' : 'Katakana'}
                  </h3>

                  {/*
                    CSS-Grid inline-expand pattern (css-tricks.com/expandable-sections-within-a-css-grid):
                    Tiles sit in an auto-fill grid. The active block's detail panel is injected
                    directly after its tile with grid-column: 1 / -1 so it spans the full row.
                    grid-auto-flow: dense fills any gaps in the tile row before the detail panel,
                    keeping the visual tile order stable.
                  */}
                  <div className="char-mastery-tiles-grid">
                    {blocks.map((block) => {
                      const blockKey = `${script}-${block.index}`
                      const isActive = expandedBlocks === blockKey
                      const pct = Math.round(block.mastery * 100)
                      return (
                        <Fragment key={block.index}>
                          <button
                            type="button"
                            className={`cmb-tile ${isActive ? 'is-active' : ''}`}
                            onClick={() => onSetExpandedBlocks(isActive ? null : blockKey)}
                            aria-expanded={isActive}
                            aria-label={`${block.name}: ${block.unlocked ? `${pct}% mastered` : 'locked'}`}
                          >
                            <div className="cmb-tile-chars" lang="ja" aria-hidden="true">
                              {block.sample_chars.join(' ')}
                            </div>
                            <strong className="cmb-tile-name">{block.name}</strong>
                            <div className="cmb-bar-wrap">
                              <div className="cmb-bar" style={{ '--cmb-pct': `${pct}%` } as CSSProperties} />
                            </div>
                            <div className="cmb-tile-pct">{pct}%</div>
                          </button>

                          {/* Detail panel: grid-column 1/-1 makes it span the full row right below this tile */}
                          {isActive ? (
                            <div className="char-mastery-detail-inline">
                              <div className="char-mastery-chips">
                                {block.card_ids.map((id, charIdx) => {
                                  const score = scores[id] ?? 0
                                  const level = Math.min(score, CARD_MASTERY_MAX)
                                  const char = block.characters?.[charIdx] ?? ''
                                  const meaning = block.meanings?.[charIdx] ?? ''
                                  const romaji = block.romajis?.[charIdx] ?? ''
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      className="char-mastery-chip"
                                      data-level={level}
                                      aria-label={`${char} (${romaji}): ${level}/${CARD_MASTERY_MAX}`}
                                      lang="ja"
                                      onClick={() => onSetSelectedChar({ character: char, romaji, meaning, label: 'Reading / English meaning', score: level })}
                                    >
                                      {char}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {overviewKanjiLevelProgress.some((level) => level.total > 0) ? (
              <div className="char-mastery-script">
                <h3 className="char-mastery-script-name">Kanji by JLPT Level</h3>
                <div className="char-mastery-tiles-grid">
                  {overviewKanjiLevelProgress.filter((level) => level.total > 0).map((level) => {
                    const blockKey = `kanji-${level.key}`
                    const isActive = expandedBlocks === blockKey
                    const pct = Math.round(level.mastery * 100)
                    const page = Math.max(1, kanjiOverviewPage[level.key] ?? 1)
                    const pageCount = Math.max(1, Math.ceil(level.cardIds.length / KANJI_OVERVIEW_PAGE_SIZE))
                    const clampedPage = Math.min(page, pageCount)
                    const start = (clampedPage - 1) * KANJI_OVERVIEW_PAGE_SIZE
                    const visibleCards = overviewKanjiDeck
                      .filter((card) => jlptTagFromCard(card) === level.key)
                      .slice(start, start + KANJI_OVERVIEW_PAGE_SIZE)
                    return (
                      <Fragment key={level.key}>
                        <button
                          type="button"
                          className={`cmb-tile ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            onSetExpandedBlocks(isActive ? null : blockKey)
                            if (!isActive) {
                              onSetKanjiOverviewPage((previous) => ({ ...previous, [level.key]: 1 }))
                            }
                          }}
                          aria-expanded={isActive}
                          aria-label={`${level.label}: ${pct}% mastered`}
                        >
                          <div className="cmb-tile-chars" lang="ja" aria-hidden="true">
                            {level.sampleChars.join(' ')}
                          </div>
                          <strong className="cmb-tile-name">{level.label}</strong>
                          <div className="cmb-bar-wrap">
                            <div className="cmb-bar" style={{ '--cmb-pct': `${pct}%` } as CSSProperties} />
                          </div>
                          <div className="cmb-tile-pct">{level.total} cards • {pct}%</div>
                        </button>

                        {isActive ? (
                          <div className="char-mastery-detail-inline">
                            <div className="char-mastery-chips char-mastery-chips-kanji">
                              {visibleCards.map((card) => {
                                const score = cardScores.kanji_n5[card.id] ?? 0
                                const levelScore = Math.min(score, CARD_MASTERY_MAX)
                                return (
                                  <button
                                    key={card.id}
                                    type="button"
                                    className="char-mastery-chip char-mastery-chip-kanji"
                                    data-level={levelScore}
                                    aria-label={`${card.character}, ${card.romaji}, ${card.meaning}: ${levelScore}/${CARD_MASTERY_MAX}`}
                                    onClick={() => onSetSelectedChar({ character: card.character, romaji: card.romaji, meaning: card.meaning, label: 'Reading / English meaning', score: levelScore })}
                                  >
                                    <span className="char-mastery-chip-glyph" lang="ja">{card.character}</span>
                                    <span className="char-mastery-chip-copy">
                                      <span className="char-mastery-chip-reading">{card.romaji}</span>
                                      <span className="char-mastery-chip-meaning">{card.meaning}</span>
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                            {pageCount > 1 ? (
                              <div className="kanji-chip-pagination">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSetKanjiOverviewPage((previous) => ({
                                      ...previous,
                                      [level.key]: Math.max(1, clampedPage - 1),
                                    }))
                                  }}
                                  disabled={clampedPage <= 1}
                                >
                                  Previous
                                </button>
                                <span>Page {clampedPage} / {pageCount}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSetKanjiOverviewPage((previous) => ({
                                      ...previous,
                                      [level.key]: Math.min(pageCount, clampedPage + 1),
                                    }))
                                  }}
                                  disabled={clampedPage >= pageCount}
                                >
                                  Next
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </section>

      <section className="panel-glass activity-summary-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('studyActivity')}
          aria-expanded={overviewSectionExpanded.studyActivity}
          aria-controls="overview-study-activity-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><CalendarDays aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Study Activity</h2>
            <div className="panel-actions">
              <span>Rolling windows for consistency and momentum</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.studyActivity ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-study-activity-body" className={`overview-panel-body ${overviewSectionExpanded.studyActivity ? 'is-open' : ''}`}>
          {!hasAnyActivity ? (
            <p className="status-line">No recent activity yet. Complete a round to populate weekly and monthly summaries.</p>
          ) : (
            <div className="activity-window-grid">
              {[activity.week, activity.month].map((windowData, index) => (
                <article
                  key={windowData.days}
                  className="activity-window-card"
                  style={{ animationDelay: `${140 + index * 80}ms` }}
                >
                  <h3>Last {windowData.days} Days</h3>
                  <div className="activity-window-metrics">
                    <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`reviewed-${windowData.days}-${windowData.reviewed}`} className="live-value">{windowData.reviewed}</strong> reviewed</span>
                    <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`correct-${windowData.days}-${windowData.correct}`} className="live-value">{windowData.correct}</strong> correct</span>
                    <span className="metric-accent-danger"><AlertTriangle aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`incorrect-${windowData.days}-${windowData.incorrect}`} className="live-value">{windowData.incorrect}</strong> incorrect</span>
                    <span className="metric-accent-ocean"><Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`accuracy-${windowData.days}-${windowData.accuracy}`} className="live-value">{windowData.accuracy}%</strong> accuracy</span>
                    <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`earned-${windowData.days}-${windowData.points_earned}`} className="live-value">{windowData.points_earned}</strong> points</span>
                    <span className="metric-accent-warning"><CalendarDays aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`days-${windowData.days}-${windowData.active_days}`} className="live-value">{windowData.active_days}</strong> active days</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel-glass activity-summary-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('contextClozeCurriculum')}
          aria-expanded={overviewSectionExpanded.contextClozeCurriculum}
          aria-controls="overview-context-cloze-curriculum-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><BookText aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Context Cloze Curriculum</h2>
            <div className="panel-actions">
              <span>Persisted stage progression and mode accuracy</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.contextClozeCurriculum ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-context-cloze-curriculum-body" className={`overview-panel-body ${overviewSectionExpanded.contextClozeCurriculum ? 'is-open' : ''}`}>
          <div className="activity-window-grid">
            <article className="activity-window-card">
              <h3>Mode Performance</h3>
              <div className="activity-window-metrics">
                <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong className="live-value">{curriculumSummary.attempts}</strong> attempts</span>
                <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong className="live-value">{curriculumSummary.accuracy}%</strong> accuracy</span>
                <span className="metric-accent-ocean"><Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong className="live-value">{curriculumSummary.accuracy_7d}%</strong> 7-day accuracy</span>
              </div>
            </article>
            <article className="activity-window-card">
              <h3>Stage Distribution</h3>
              <div className="activity-window-metrics">
                <span className="metric-accent-warning"><strong className="live-value">{curriculumSummary.stage_distribution[1]}</strong> stage 1</span>
                <span className="metric-accent-ocean"><strong className="live-value">{curriculumSummary.stage_distribution[2]}</strong> stage 2</span>
                <span className="metric-accent-streak"><strong className="live-value">{curriculumSummary.stage_distribution[3]}</strong> stage 3</span>
              </div>
            </article>
          </div>

          <div className="activity-window-grid" style={{ marginTop: '10px' }}>
            {ALL_SCRIPT_KEYS.map((script) => {
              const metric = curriculumByScript[script]
              return (
                <article key={script} className="activity-window-card">
                  <h3>{SCRIPT_LABELS[script]}</h3>
                  <div className="activity-window-metrics">
                    <span className="metric-accent-insight"><strong className="live-value">{metric.attempts}</strong> attempts</span>
                    <span className="metric-accent-skill"><strong className="live-value">{metric.accuracy}%</strong> accuracy</span>
                    <span className="metric-accent-ocean"><strong className="live-value">{metric.accuracy_7d}%</strong> 7-day</span>
                    <span className="metric-accent-warning"><strong className="live-value">{metric.stage_distribution[1]}/{metric.stage_distribution[2]}/{metric.stage_distribution[3]}</strong> stage 1/2/3</span>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="panel-glass activity-summary-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('storyProgress')}
          aria-expanded={overviewSectionExpanded.storyProgress}
          aria-controls="overview-story-progress-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><History aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Story Progress</h2>
            <div className="panel-actions">
              <span>Narrative attempts, chapter accuracy, and completion readiness</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.storyProgress ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-story-progress-body" className={`overview-panel-body ${overviewSectionExpanded.storyProgress ? 'is-open' : ''}`}>
          <div className="activity-window-grid">
            <article className="activity-window-card">
              <h3>Narrative Mode Performance</h3>
              <div className="activity-window-metrics">
                <span className="metric-accent-insight"><strong className="live-value">{narrativeSummary.attempts}</strong> attempts</span>
                <span className="metric-accent-skill"><strong className="live-value">{narrativeSummary.accuracy}%</strong> accuracy</span>
                <span className="metric-accent-ocean"><strong className="live-value">{narrativeSummary.chapters['3'].completion_rate}%</strong> Chapter 3 completion</span>
              </div>
            </article>
            {(['1', '2', '3'] as const).map((chapterKey) => (
              <article key={chapterKey} className="activity-window-card">
                <h3>Chapter {chapterKey}</h3>
                <div className="activity-window-metrics">
                  <span className="metric-accent-insight"><strong className="live-value">{narrativeSummary.chapters[chapterKey].attempts}</strong> attempts</span>
                  <span className="metric-accent-skill"><strong className="live-value">{narrativeSummary.chapters[chapterKey].accuracy}%</strong> accuracy</span>
                  <span className="metric-accent-streak"><strong className="live-value">{narrativeSummary.chapters[chapterKey].completion_rate}%</strong> completion</span>
                </div>
              </article>
            ))}
          </div>

          <div className="activity-window-grid">
            {storyReadiness.map((story, index) => (
              <article
                key={story.script}
                className="activity-window-card"
                style={{ animationDelay: `${140 + index * 70}ms` }}
              >
                <h3>{SCRIPT_LABELS[story.script]}</h3>
                <div className="activity-window-metrics">
                  <span className="metric-accent-insight"><strong className="live-value">{narrativeByScript[story.script].attempts}</strong> attempts</span>
                  <span className="metric-accent-skill"><strong className="live-value">{narrativeByScript[story.script].accuracy}%</strong> accuracy</span>
                  <span className="metric-accent-ocean"><strong className="live-value">{narrativeByScript[story.script].chapters['2'].completion_rate}%</strong> Chapter 2 ready</span>
                  <span className="metric-accent-streak"><strong className="live-value">{narrativeByScript[story.script].chapters['3'].completion_rate}%</strong> Chapter 3 ready</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel-glass mistakes-summary-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('mistakeBreakdown')}
          aria-expanded={overviewSectionExpanded.mistakeBreakdown}
          aria-controls="overview-mistake-breakdown-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><AlertTriangle aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Mistake Breakdown</h2>
            <div className="panel-actions">
              <span>Top weak areas by error rate</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.mistakeBreakdown ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-mistake-breakdown-body" className={`overview-panel-body ${overviewSectionExpanded.mistakeBreakdown ? 'is-open' : ''}`}>
          {!hasMistakeData ? (
            <p className="status-line">No mistake data yet. Incorrect answers will populate script/tag breakdowns here.</p>
          ) : (
            <div className="mistake-grid">
              {mistakes.map((row, index) => (
                <article
                  key={row.key}
                  className="mistake-card"
                  style={{ animationDelay: `${140 + index * 60}ms` }}
                >
                  <h3>{row.key}</h3>
                  <div className="mistake-card-metrics">
                    <span className="metric-accent-danger"><AlertTriangle aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`rate-${row.key}-${row.error_rate}`} className="live-value">{row.error_rate}%</strong> error rate</span>
                    <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`mistakes-${row.key}-${row.mistakes}`} className="live-value">{row.mistakes}</strong> mistakes</span>
                    <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`attempts-${row.key}-${row.attempts}`} className="live-value">{row.attempts}</strong> attempts</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel-glass timeline-summary-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('itemTimeline')}
          aria-expanded={overviewSectionExpanded.itemTimeline}
          aria-controls="overview-item-timeline-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><History aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Item Timeline</h2>
            <div className="panel-actions">
              <span>Recent review events and trend per item</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.itemTimeline ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-item-timeline-body" className={`overview-panel-body ${overviewSectionExpanded.itemTimeline ? 'is-open' : ''}`}>
          {itemHistory.length === 0 ? (
            <p className="status-line">No item history yet. Complete review rounds to build timelines.</p>
          ) : (
            <>
              <div className="timeline-grid">
                {pagedHistory.map((item, index) => (
                  <article
                    key={item.key}
                    className="timeline-card"
                    style={{ animationDelay: `${140 + index * 60}ms` }}
                  >
                    <div className="timeline-card-head">
                      <h3>{item.prompt}</h3>
                      <span className={`timeline-trend timeline-trend-${item.trend}`}>{item.trend}</span>
                    </div>
                    <p className="timeline-card-subhead">{formatTimelineScriptTag(item.script_tag)} • {formatTimelineDeckName(item.deck)}</p>
                    <div className="timeline-events">
                      {item.events.map((event, eventIndex) => (
                        <span key={`${item.key}-${eventIndex}`} className={`timeline-event timeline-event-${event.outcome}`}>
                          <strong>{event.outcome === 'correct' ? '✓' : '✕'}</strong>
                          {event.points_delta} pts
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="timeline-pagination">
                <button
                  type="button"
                  disabled={clampedHistoryPage <= 1}
                  onClick={() => onSetHistoryPage((prev) => Math.max(1, prev - 1))}
                >
                  Previous
                </button>
                <span>Page {clampedHistoryPage} / {historyPageCount}</span>
                <button
                  type="button"
                  disabled={clampedHistoryPage >= historyPageCount}
                  onClick={() => onSetHistoryPage((prev) => Math.min(historyPageCount, prev + 1))}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel-glass deck-panel overview-deck-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('deckSnapshot')}
          aria-expanded={overviewSectionExpanded.deckSnapshot}
          aria-controls="overview-deck-snapshot-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><ListChecks aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Deck Snapshot</h2>
            <div className="panel-actions">
              <span>Mastery and daily completion by deck</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.deckSnapshot ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-deck-snapshot-body" className={`overview-panel-body ${overviewSectionExpanded.deckSnapshot ? 'is-open' : ''}`}>
          {loading && <p className="status-line">Loading deck metrics...</p>}
          {error && <p className="status-line status-error">Unable to load summary: {error}</p>}
          {!loading && !error && decks.length === 0 ? <p className="status-line">No decks found.</p> : null}

          {!loading && !error && decks.length > 0 ? (
            <div className="deck-grid">
              {decks.map((deck, index) => {
                const mastery = deck.total > 0 ? Math.round((deck.mastered / deck.total) * 100) : 0
                const todayProgress =
                  deck.due_today > 0
                    ? Math.min(100, Math.round((deck.completed_today / deck.due_today) * 100))
                    : 0

                return (
                  <article
                    key={deck.slug}
                    className="deck-card"
                    style={{ animationDelay: `${180 + index * 70}ms` }}
                  >
                    <div className="deck-card-head">
                      <h3>{deck.name}</h3>
                      <span>{deck.total} cards</span>
                    </div>

                    <div className="meter">
                      <div className="meter-label">
                        <span>Mastery</span>
                        <strong>{mastery}%</strong>
                      </div>
                      <div className="meter-track">
                        <div className="meter-fill" style={{ width: `${mastery}%` }} />
                      </div>
                    </div>

                    <div className="meter">
                      <div className="meter-label">
                        <span>Today</span>
                        <strong>
                          {deck.completed_today}/{deck.due_today}
                        </strong>
                      </div>
                      <div className="meter-track">
                        <div className="meter-fill meter-fill-alt" style={{ width: `${todayProgress}%` }} />
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}

          <footer className="panel-foot">
            <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`completed-${totals.completedToday}`} className="live-value">{totals.completedToday}</strong> cards completed today</span>
            <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`best-day-${streak.best_days}`} className="live-value">{streak.best_days}</strong> day best streak</span>
          </footer>
        </div>
      </section>
    </div>
  )
}
