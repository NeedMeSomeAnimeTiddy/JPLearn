import type { CSSProperties } from 'react'
import { Fragment } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Flame,
  Languages,
  ListChecks,
  RefreshCw,
  Target,
  X,
} from 'lucide-react'
import type { CardScores, JlptLevel, JlptLevelProgress } from '../types'
import { KANJI_OVERVIEW_PAGE_SIZE } from '../constants'
import { jlptTagFromCard } from '../utils'

const CARD_MASTERY_MAX = 4

export type OverviewSectionKey = 'studyActivity' | 'mistakeBreakdown' | 'deckSnapshot'

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
  hasAnyActivity: boolean
  hasMistakeData: boolean
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
  lastUpdated,
  streak,
  decks,
  activity,
  overviewBlocks,
  overviewCategoryBlocks,
  overviewKanjiDeck,
  overviewKanjiLevelProgress,
  overviewBlocksLoading,
  mistakes,
  hasAnyActivity,
  hasMistakeData,
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
  return (
    <div className="overview-popup-content">
      <header className="overview-popup-header">
        <h2 className="overview-popup-title">Study Overview</h2>
        <div className="overview-popup-actions">
          {lastUpdated ? <span className="overview-popup-updated">{lastUpdated}</span> : null}
          <button
            type="button"
            className="topbar-settings-button"
            onClick={onRefresh}
            disabled={loading}
            aria-label={loading ? 'Refreshing data' : 'Refresh data'}
            title={loading ? 'Refreshing' : 'Refresh (R)'}
          >
            <RefreshCw aria-hidden="true" className={`inline-button-icon ${loading ? 'spin-icon' : ''}`} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="topbar-settings-button"
            onClick={onClose}
            aria-label="Close overview"
            title="Close (Escape)"
          >
            <X aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {error ? <p className="status-line status-error overview-popup-error">Unable to load summary: {error}</p> : null}

      {/* ── Snap metrics strip ─────────────────────────────────────── */}
      {decks.length > 0 ? (() => {
        const masteredCards = decks.reduce((acc, d) => acc + d.mastered, 0)
        const totalCards = decks.reduce((acc, d) => acc + d.total, 0)
        const masteryRate = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0
        const completedToday = decks.reduce((acc, d) => acc + d.completed_today, 0)
        const dueToday = decks.reduce((acc, d) => acc + d.due_today, 0)
        return (
          <div className="overview-snap-strip" aria-label="Quick stats">
            <span className="overview-snap-tile">
              <Flame aria-hidden="true" className="chip-icon metric-accent-streak" strokeWidth={2.2} />
              <strong className="live-value">{streak.current_days}</strong>
              <span>day streak</span>
            </span>
            <span className="overview-snap-tile">
              <Target aria-hidden="true" className="chip-icon metric-accent-skill" strokeWidth={2.2} />
              <strong className="live-value">{masteryRate}%</strong>
              <span>mastered</span>
            </span>
            <span className="overview-snap-tile">
              <BarChart3 aria-hidden="true" className="chip-icon metric-accent-insight" strokeWidth={2.2} />
              <strong className="live-value">{completedToday}/{dueToday}</strong>
              <span>done today</span>
            </span>
          </div>
        )
      })() : null}

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
              ['grammar_patterns', 'Conversational'],
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
    </div>
  )
}
