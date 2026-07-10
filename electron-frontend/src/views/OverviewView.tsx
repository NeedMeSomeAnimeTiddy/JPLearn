import type { CSSProperties } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Download,
  Flame,
  Languages,
  ListChecks,
  PlayCircle,
  RefreshCw,
  Target,
  X,
} from 'lucide-react'
import type { CardScores, JlptLevel, JlptLevelProgress } from '../types'
import { KANJI_OVERVIEW_PAGE_SIZE } from '../constants'
import { jlptTagFromCard } from '../utils'
import { formatTagLabel } from '../utils'
import { useHeatmap } from '../features/heatmap'
import { ActivityCalendar } from 'react-activity-calendar'

const CARD_MASTERY_MAX = 4

export type OverviewSectionKey = 'studyActivity' | 'mistakeBreakdown' | 'minigamePerformance' | 'deckSnapshot'

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

interface MinigamePerfRow {
  minigame: string
  attempts: number
  correct: number
  accuracy: number
}

interface SelectedChar {
  character: string
  romaji: string
  meaning: string
  label: string
  score: number
}

interface OverviewViewProps {
  loading: boolean
  error: string | null
  lastUpdated: string | null
  streak: { current_days: number; best_days: number }
  decks: DeckSummary[]
  activity: ActivityData
  overviewBlocks: Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>
  overviewCategoryBlocks: Record<'vocab_n5' | 'grammar_patterns', BlockInfo[]>
  overviewKanjiDeck: KanjiCard[]
  overviewKanjiLevelProgress: JlptLevelProgress[]
  overviewBlocksLoading: boolean
  mistakes: MistakeRow[]
  minigamePerf: MinigamePerfRow[]
  hasAnyActivity: boolean
  hasMistakeData: boolean
  hasMinigamePerfData: boolean
  charMasteryExpanded: boolean
  expandedBlocks: string | null
  overviewSectionExpanded: Record<OverviewSectionKey, boolean>
  cardScores: CardScores
  kanjiOverviewPage: Partial<Record<JlptLevel, number>>
  onClose: () => void
  onRefresh: () => void
  onToggleCharMastery: () => void
  onSetExpandedBlocks: (key: string | null) => void
  onToggleSection: (section: OverviewSectionKey) => void
  onSetKanjiOverviewPage: (
    updater: (prev: Partial<Record<JlptLevel, number>>) => Partial<Record<JlptLevel, number>>,
  ) => void
  onSetSelectedChar: (char: SelectedChar) => void
}

export function OverviewView({
  loading,
  error,
  decks,
  activity,
  overviewBlocks,
  overviewCategoryBlocks,
  overviewKanjiDeck,
  overviewKanjiLevelProgress,
  overviewBlocksLoading,
  mistakes,
  minigamePerf,
  hasAnyActivity,
  hasMistakeData,
  hasMinigamePerfData,
  charMasteryExpanded,
  expandedBlocks,
  overviewSectionExpanded,
  cardScores,
  kanjiOverviewPage,
  onClose,
  onRefresh,
  onToggleCharMastery,
  onSetExpandedBlocks,
  onToggleSection,
  onSetKanjiOverviewPage,
  onSetSelectedChar,
}: OverviewViewProps) {
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  const handleExport = async (type: 'review_history' | 'accuracy_trends' | 'mastery_snapshot') => {
    if (!window.jplearnDesktop.exportAnalyticsCSV) return
    setExportLoading(true)
    setExportMessage(null)
    try {
      const result = await window.jplearnDesktop.exportAnalyticsCSV(type)
      if (result.cancelled) {
        setExportMessage(null)
      } else if (result.ok) {
        setExportMessage(`Saved: ${result.path ?? 'file'}`)
      } else {
        setExportMessage('Export failed.')
      }
    } catch {
      setExportMessage('Export failed.')
    } finally {
      setExportLoading(false)
    }
  }

  const heatmap = useHeatmap()

  const calendarRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [activeCell, setActiveCell] = useState<{
    count: number
    accuracy: number | undefined
    date: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    const wrap = calendarRef.current
    if (!wrap) return

    function handlePointerOver(e: PointerEvent) {
      const rect = (e.target as Element).closest('rect[data-date]') as SVGRectElement | null
      if (!rect) return
      wrap!.querySelectorAll('rect[data-date]').forEach((r) => {
        ;(r as SVGRectElement).style.strokeWidth = ''
        ;(r as SVGRectElement).style.stroke = ''
      })
      rect.style.stroke = 'var(--tone-amber)'
      rect.style.strokeWidth = '2'
    }

    function handlePointerOut(e: PointerEvent) {
      const rect = (e.target as Element).closest('rect[data-date]') as SVGRectElement | null
      if (!rect) return
      rect.style.strokeWidth = ''
      rect.style.stroke = ''
    }

    function handleClick(e: MouseEvent) {
      const rect = (e.target as Element).closest('rect[data-date]') as SVGRectElement | null
      if (!rect) return
      const date = rect.getAttribute('data-date')
      if (!date) return
      const hit = heatmap.data.find((d) => d.date === date)
      if (!hit) return
      const bounds = rect.getBoundingClientRect()
      setActiveCell({
        count: hit.count,
        accuracy: heatmap.accuracyByDate.get(date),
        date,
        x: bounds.left + bounds.width / 2,
        y: bounds.bottom + 8,
      })
    }

    wrap.addEventListener('pointerover', handlePointerOver)
    wrap.addEventListener('pointerout', handlePointerOut)
    wrap.addEventListener('click', handleClick)
    return () => {
      wrap.removeEventListener('pointerover', handlePointerOver)
      wrap.removeEventListener('pointerout', handlePointerOut)
      wrap.removeEventListener('click', handleClick)
    }
  }, [heatmap.data, heatmap.accuracyByDate])

  useEffect(() => {
    if (!activeCell) return

    function handleDismiss(e: MouseEvent) {
      const target = e.target as Element
      if (target.closest('rect[data-date]')) return
      if (target.closest('.heatmap-tooltip')) return
      setActiveCell(null)
    }

    document.addEventListener('mousedown', handleDismiss)
    return () => document.removeEventListener('mousedown', handleDismiss)
  }, [activeCell])

  return (
    <div className="overview-popup-content">
      <header className="overview-popup-header cassette-panel-header">
        <div />
        <div className="cassette-panel-header-center">
          <span className="cassette-panel-header-catalog">DECK STATUS</span>
          <h2 className="cassette-panel-header-title">Study Overview</h2>
        </div>
        <div className="overview-popup-actions">
          <button
            type="button"
            className="panel-action-button"
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? 'Refreshing data' : 'Refresh data'}
            title={loading ? 'Refreshing' : 'Refresh (R)'}
          >
            <RefreshCw aria-hidden="true" className={`inline-button-icon ${loading ? 'spin-icon' : ''}`} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="panel-close-button"
            onClick={onClose}
            aria-label="Close overview"
            title="Close (Escape)"
          >
            <X aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {error ? <p className="status-line status-error overview-popup-error">Unable to load summary: {error}</p> : null}

      {/* ── Mastery grid ──────────────────────────────────────────── */}
      <section className="panel-glass char-mastery-panel">
        <button
          type="button"
          className="char-mastery-toggle"
          onClick={onToggleCharMastery}
          aria-expanded={charMasteryExpanded}
        >
          <div className="panel-head char-mastery-panel-head">
            <h2 className="panel-title-with-icon"><Languages aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Mastery</h2>
            <div className="panel-actions">
              <span>{overviewBlocksLoading ? 'Loading…' : 'Color-coded progress for every section'}</span>
            </div>
            <span className={`char-mastery-chevron ${charMasteryExpanded ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div className={`char-mastery-body ${charMasteryExpanded ? 'is-open' : ''}`}>
          <div className="char-mastery-body-inner">
            {(['hiragana', 'katakana'] as const).map((script) => {
              const blocks = overviewBlocks[script]
              if (!blocks || blocks.length === 0) return null
              const scores = cardScores[script]
              return (
                <div key={script} className="char-mastery-script is-category-script">
                  <h3 className="char-mastery-script-name">
                    {script === 'hiragana' ? 'Hiragana' : 'Katakana'}
                  </h3>
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

                          {isActive ? (
                            <div className="char-mastery-detail-inline">
                              <div className="char-mastery-chips char-mastery-chips-kanji">
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
                                      className="char-mastery-chip char-mastery-chip-kanji"
                                      data-level={level}
                                      aria-label={`${char} (${romaji}): ${level}/${CARD_MASTERY_MAX}`}
                                      onClick={() => onSetSelectedChar({ character: char, romaji, meaning, label: 'Reading / English meaning', score: level })}
                                    >
                                      <span className="char-mastery-chip-glyph" lang="ja">{char}</span>
                                      <span className="char-mastery-chip-copy is-kana-chip">
                                        <span className="char-mastery-chip-reading">{romaji}</span>
                                      </span>
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
                                      {card.tags.length > 0 ? (
                                        <span className="char-mastery-chip-tag">{formatTagLabel(card.tags[0])}</span>
                                      ) : null}
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

            {([
              ['vocab_n5', 'Vocabulary'],
              ['grammar_patterns', 'Grammar'],
            ] as const).map(([script, label]) => {
              const blocks = overviewCategoryBlocks[script]
              if (!blocks || blocks.length === 0) return null
              const scores = cardScores[script]
              return (
                <div key={script} className="char-mastery-script">
                  <h3 className="char-mastery-script-name">{label}</h3>
                  <div className="char-mastery-tiles-grid">
                    {blocks.map((block) => {
                      const blockKey = `${script}-${block.index}`
                      const isActive = expandedBlocks === blockKey
                      // Derive mastery from the same cardScores the chips use so they are always in sync.
                      const totalScore = block.card_ids.reduce((sum, id) => sum + (scores[id] ?? 0), 0)
                      const pct = block.card_ids.length > 0
                        ? Math.round(totalScore / (CARD_MASTERY_MAX * block.card_ids.length) * 100)
                        : 0
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

                          {isActive ? (
                            <div className="char-mastery-detail-inline">
                              <div className="char-mastery-chips char-mastery-chips-kanji char-mastery-chips-category">
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
                                      className="char-mastery-chip char-mastery-chip-kanji is-category-chip"
                                      data-level={level}
                                      aria-label={`${char} (${romaji}): ${level}/${CARD_MASTERY_MAX}`}
                                      onClick={() => onSetSelectedChar({ character: char, romaji, meaning, label: 'Reading / English meaning', score: level })}
                                    >
                                      <span className="char-mastery-chip-glyph" lang="ja">{char}</span>
                                      <span className="char-mastery-chip-copy">
                                        <span className="char-mastery-chip-reading">{romaji}</span>
                                        <span className="char-mastery-chip-meaning">{meaning}</span>
                                      </span>
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
          </div>
        </div>
      </section>

      {/* ── Study Activity ───────────────────────────────────────────── */}
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
          <div ref={calendarRef} style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
            {heatmap.data.length > 0 ? (
              <ActivityCalendar
                data={heatmap.data}
                theme={heatmap.theme}
                loading={heatmap.loading}
                weekStart={1}
                blockSize={12}
                blockMargin={3}
                fontSize={13}
                labels={{ totalCount: '{{count}} reviews' }}
              />
            ) : (
              <p className="status-line">Loading activity data...</p>
            )}
            {activeCell &&
              createPortal(
                <div
                  ref={tooltipRef}
                  className="heatmap-tooltip"
                  style={{
                    position: 'fixed',
                    left: activeCell.x,
                    top: activeCell.y,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <strong>{activeCell.count} review{activeCell.count !== 1 ? 's' : ''}</strong>
                  {activeCell.accuracy !== undefined && (
                    <span> · {activeCell.accuracy}% correct</span>
                  )}
                  <span className="heatmap-tooltip-date">{activeCell.date}</span>
                </div>,
                document.body,
              )}
          </div>
          {heatmap.error && <p className="heatmap-error">{heatmap.error}</p>}
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

      {/* ── Mistake Breakdown ─────────────────────────────────────────── */}
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

      {/* ── Minigame Performance ─────────────────────────────────────────── */}
      <section className="panel-glass mistakes-summary-panel overview-collapsible-panel">
        <button
          type="button"
          className="overview-panel-toggle"
          onClick={() => onToggleSection('minigamePerformance')}
          aria-expanded={overviewSectionExpanded.minigamePerformance}
          aria-controls="overview-minigame-performance-body"
        >
          <div className="panel-head">
            <h2 className="panel-title-with-icon"><PlayCircle aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Minigame Performance</h2>
            <div className="panel-actions">
              <span>Accuracy and attempts per game type</span>
            </div>
            <span className={`overview-panel-chevron ${overviewSectionExpanded.minigamePerformance ? 'is-open' : ''}`} aria-hidden="true">▾</span>
          </div>
        </button>

        <div id="overview-minigame-performance-body" className={`overview-panel-body ${overviewSectionExpanded.minigamePerformance ? 'is-open' : ''}`}>
          {!hasMinigamePerfData ? (
            <p className="status-line">No minigame data yet. Play some minigames to see performance breakdowns here.</p>
          ) : (
            <div className="mistake-grid">
              {minigamePerf.map((row, index) => (
                <article
                  key={row.minigame}
                  className="mistake-card"
                  style={{ animationDelay: `${140 + index * 60}ms` }}
                >
                  <h3>{row.minigame.replace(/_/g, ' ')}</h3>
                  <div className="mistake-card-metrics">
                    <span className="metric-accent-danger"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`acc-${row.minigame}-${row.accuracy}`} className="live-value">{row.accuracy}%</strong> accuracy</span>
                    <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`att-${row.minigame}-${row.attempts}`} className="live-value">{row.attempts}</strong> attempts</span>
                    <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`cor-${row.minigame}-${row.correct}`} className="live-value">{row.correct}</strong> correct</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Deck Snapshot ─────────────────────────────────────────── */}
      {decks.length > 0 ? (
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
                <span>Mastery and daily completion per deck</span>
              </div>
              <span className={`overview-panel-chevron ${overviewSectionExpanded.deckSnapshot ? 'is-open' : ''}`} aria-hidden="true">▾</span>
            </div>
          </button>

          <div id="overview-deck-snapshot-body" className={`overview-panel-body ${overviewSectionExpanded.deckSnapshot ? 'is-open' : ''}`}>
            <div className="deck-grid">
              {decks.map((deck, index) => {
                const mastery = deck.total > 0 ? Math.round((deck.mastered / deck.total) * 100) : 0
                const todayProgress = deck.due_today > 0
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
                        <strong>{deck.completed_today}/{deck.due_today}</strong>
                      </div>
                      <div className="meter-track">
                        <div className="meter-fill meter-fill-alt" style={{ width: `${todayProgress}%` }} />
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {window.jplearnDesktop.exportAnalyticsCSV ? (
        <section className="panel-glass activity-summary-panel" aria-label="Export data">
          <div className="panel-head">
            <h2 className="panel-title-with-icon">
              <Download aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />
              Export Data
            </h2>
            <div className="panel-actions">
              <span>Download study data as CSV</span>
            </div>
          </div>
          <div className="jlpt-results-actions" style={{ marginTop: '14px' }}>
            {(
              [
                { type: 'review_history', label: 'Review History' },
                { type: 'accuracy_trends', label: 'Accuracy Trends' },
                { type: 'mastery_snapshot', label: 'Mastery Snapshot' },
              ] as const
            ).map(({ type, label }) => (
              <button
                key={type}
                type="button"
                className="jlpt-action-btn"
                onClick={() => { void handleExport(type) }}
                disabled={exportLoading}
                aria-label={`Export ${label} as CSV`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="jlpt-action-btn"
              onClick={async () => {
                if (!window.jplearnDesktop.exportAnalyticsJSON) return
                setExportLoading(true)
                setExportMessage(null)
                try {
                  const result = await window.jplearnDesktop.exportAnalyticsJSON()
                  if (result.cancelled) {
                    setExportMessage(null)
                  } else if (result.ok) {
                    setExportMessage(`Saved: ${result.path ?? 'file'}`)
                  } else {
                    setExportMessage('Export failed.')
                  }
                } catch {
                  setExportMessage('Export failed.')
                } finally {
                  setExportLoading(false)
                }
              }}
              disabled={exportLoading}
              aria-label="Export full backup as JSON"
            >
              Full Backup (JSON)
            </button>
            {window.jplearnDesktop.importAnalyticsJSON ? (
              <button
                type="button"
                className="jlpt-action-btn"
                onClick={async () => {
                  setExportLoading(true)
                  setExportMessage(null)
                  try {
                    const result = await window.jplearnDesktop.importAnalyticsJSON!()
                    if (result.cancelled) {
                      setExportMessage(null)
                    } else if (result.ok) {
                      const counts = result.imported ?? {}
                      const parts = Object.entries(counts)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => `${v} ${k}`)
                      setExportMessage(`Imported: ${parts.join(', ') || 'no changes'}`)
                      if (typeof onRefresh === 'function') onRefresh()
                    } else {
                      setExportMessage('Import failed.')
                    }
                  } catch {
                    setExportMessage('Import failed.')
                  } finally {
                    setExportLoading(false)
                  }
                }}
                disabled={exportLoading}
                aria-label="Import backup from JSON file"
              >
                Import Backup
              </button>
            ) : null}
          </div>
          {exportMessage ? (
            <p className="status-line" style={{ marginTop: '10px' }}>{exportMessage}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
