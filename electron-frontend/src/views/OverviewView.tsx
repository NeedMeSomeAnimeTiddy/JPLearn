import type { CSSProperties } from 'react'
import { Fragment, useMemo, useState } from 'react'
import { Languages, RefreshCw, Search, X } from 'lucide-react'
import type { CardScores, JlptLevel, JlptLevelProgress } from '../types'
import { CARD_MASTERY_MAX, KANJI_OVERVIEW_PAGE_SIZE } from '../constants'
import { jlptTagFromCard } from '../utils'
import {
  ALL_THEMES,
  countByBucket,
  filterKanjiCards,
  themesIn,
  type MasteryFilter,
  type ScoreMap,
} from '../lib/kanjiBrowse'

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
  /** The block this card sits in, as the hub labels it. */
  theme: string
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
  overviewBlocks: Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>
  overviewCategoryBlocks: Record<'vocab_n5' | 'grammar_patterns', BlockInfo[]>
  overviewKanjiDeck: KanjiCard[]
  overviewKanjiLevelProgress: JlptLevelProgress[]
  overviewBlocksLoading: boolean
  charMasteryExpanded: boolean
  expandedBlocks: string | null
  cardScores: CardScores
  kanjiOverviewPage: Partial<Record<JlptLevel, number>>
  onClose: () => void
  onRefresh: () => void
  onToggleCharMastery: () => void
  onSetExpandedBlocks: (key: string | null) => void
  onSetKanjiOverviewPage: (
    updater: (prev: Partial<Record<JlptLevel, number>>) => Partial<Record<JlptLevel, number>>,
  ) => void
  onOpenKanjiDetail: (character: string, trigger: HTMLElement) => void
  onSetSelectedChar: (char: SelectedChar) => void
}

const MASTERY_FILTER_ORDER = ['all', 'new', 'learning', 'mastered'] as const

const MASTERY_FILTER_LABELS: Record<MasteryFilter, string> = {
  all: 'All',
  new: 'Not started',
  learning: 'Learning',
  mastered: 'Mastered',
}

interface KanjiLevelBrowserProps {
  levelLabel: string
  cards: KanjiCard[]
  scores: ScoreMap
  query: string
  masteryFilter: MasteryFilter
  theme: string
  page: number
  onQueryChange: (value: string) => void
  onMasteryFilterChange: (value: MasteryFilter) => void
  onThemeChange: (value: string) => void
  onSetPage: (page: number) => void
  onOpenKanjiDetail: (character: string, trigger: HTMLElement) => void
}

/**
 * The expanded contents of one JLPT level tile: search, mastery filters, chips.
 *
 * Paging runs over the *filtered* set, so narrowing the level is what collapses
 * N1's 27 pages rather than the paginator being the only way through them.
 */
function KanjiLevelBrowser({
  levelLabel,
  cards,
  scores,
  query,
  masteryFilter,
  theme,
  page,
  onQueryChange,
  onMasteryFilterChange,
  onThemeChange,
  onSetPage,
  onOpenKanjiDetail,
}: KanjiLevelBrowserProps) {
  const counts = useMemo(() => countByBucket(cards, scores), [cards, scores])
  const themes = useMemo(() => themesIn(cards), [cards])
  const matching = useMemo(
    () => filterKanjiCards(cards, scores, query, masteryFilter, theme),
    [cards, scores, query, masteryFilter, theme],
  )

  const pageCount = Math.max(1, Math.ceil(matching.length / KANJI_OVERVIEW_PAGE_SIZE))
  const clampedPage = Math.min(Math.max(1, page), pageCount)
  const start = (clampedPage - 1) * KANJI_OVERVIEW_PAGE_SIZE
  const visibleCards = matching.slice(start, start + KANJI_OVERVIEW_PAGE_SIZE)

  const bucketTotals: Record<MasteryFilter, number> = {
    all: cards.length,
    new: counts.new,
    learning: counts.learning,
    mastered: counts.mastered,
  }

  return (
    <div className="char-mastery-detail-inline">
      <div className="kanji-browse-controls">
        <label className="kanji-browse-search">
          <Search aria-hidden="true" className="kanji-browse-search-icon" strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            placeholder="Search kanji, reading or meaning"
            aria-label={`Search ${levelLabel} kanji`}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        {themes.length > 1 ? (
          <select
            className="kanji-browse-theme"
            value={theme}
            aria-label={`Filter ${levelLabel} by theme`}
            onChange={(event) => onThemeChange(event.target.value)}
          >
            <option value={ALL_THEMES}>All themes</option>
            {themes.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : null}
        <div className="kanji-browse-filters" role="group" aria-label="Filter by mastery">
          {MASTERY_FILTER_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`kanji-browse-filter ${masteryFilter === key ? 'is-active' : ''}`}
              aria-pressed={masteryFilter === key}
              onClick={() => onMasteryFilterChange(key)}
            >
              {MASTERY_FILTER_LABELS[key]}
              <span className="kanji-browse-filter-count">{bucketTotals[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {matching.length === 0 ? (
        <p className="kanji-browse-empty" role="status">
          No {levelLabel} kanji match that search.
        </p>
      ) : (
        <div className="char-mastery-chips char-mastery-chips-kanji">
          {visibleCards.map((card) => {
            const levelScore = Math.min(scores[card.id] ?? 0, CARD_MASTERY_MAX)
            return (
              <button
                key={card.id}
                type="button"
                className="char-mastery-chip char-mastery-chip-kanji"
                data-level={levelScore}
                aria-label={`${card.character}, ${card.romaji}, ${card.meaning}: ${levelScore}/${CARD_MASTERY_MAX}`}
                onClick={(event) => onOpenKanjiDetail(card.character, event.currentTarget)}
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
      )}

      {matching.length > 0 ? (
        <div className="kanji-chip-pagination">
          <span className="kanji-browse-count">
            {matching.length === cards.length
              ? `${cards.length} kanji`
              : `${matching.length} of ${cards.length} kanji`}
          </span>
          {pageCount > 1 ? (
            <>
              <button
                type="button"
                onClick={() => onSetPage(Math.max(1, clampedPage - 1))}
                disabled={clampedPage <= 1}
              >
                Previous
              </button>
              <span>Page {clampedPage} / {pageCount}</span>
              <button
                type="button"
                onClick={() => onSetPage(Math.min(pageCount, clampedPage + 1))}
                disabled={clampedPage >= pageCount}
              >
                Next
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function OverviewView({
  loading,
  error,
  overviewBlocks,
  overviewCategoryBlocks,
  overviewKanjiDeck,
  overviewKanjiLevelProgress,
  overviewBlocksLoading,
  charMasteryExpanded,
  expandedBlocks,
  cardScores,
  kanjiOverviewPage,
  onClose,
  onRefresh,
  onToggleCharMastery,
  onSetExpandedBlocks,
  onSetKanjiOverviewPage,
  onOpenKanjiDetail,
  onSetSelectedChar,
}: OverviewViewProps) {
  const [kanjiQuery, setKanjiQuery] = useState('')
  const [kanjiMasteryFilter, setKanjiMasteryFilter] = useState<MasteryFilter>('all')
  const [kanjiTheme, setKanjiTheme] = useState<string>(ALL_THEMES)

  // Split once here rather than per tile: the browser needs a stable array to
  // memoize against, and re-filtering 2,218 cards on every render would undo it.
  const kanjiCardsByLevel = useMemo(() => {
    const byLevel: Record<JlptLevel, KanjiCard[]> = { n5: [], n4: [], n3: [], n2: [], n1: [] }
    for (const card of overviewKanjiDeck) byLevel[jlptTagFromCard(card)].push(card)
    return byLevel
  }, [overviewKanjiDeck])

  // Narrowing the set invalidates whichever page you were on, so both controls
  // send every level back to page 1 instead of stranding you past the last hit.
  const handleKanjiQueryChange = (value: string) => {
    setKanjiQuery(value)
    onSetKanjiOverviewPage(() => ({}))
  }

  const handleKanjiMasteryFilterChange = (value: MasteryFilter) => {
    setKanjiMasteryFilter(value)
    onSetKanjiOverviewPage(() => ({}))
  }

  const handleKanjiThemeChange = (value: string) => {
    setKanjiTheme(value)
    onSetKanjiOverviewPage(() => ({}))
  }

  return (
    <div className="overview-popup-content">
      <header className="overview-popup-header cassette-panel-header">
        <div />
        <div className="cassette-panel-header-center">
          <span className="cassette-panel-header-catalog">EVERY CHARACTER</span>
          <h2 className="cassette-panel-header-title">Character Mastery</h2>
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
                          <KanjiLevelBrowser
                            levelLabel={level.label}
                            cards={kanjiCardsByLevel[level.key]}
                            scores={cardScores.kanji_n5}
                            query={kanjiQuery}
                            masteryFilter={kanjiMasteryFilter}
                            theme={kanjiTheme}
                            page={Math.max(1, kanjiOverviewPage[level.key] ?? 1)}
                            onQueryChange={handleKanjiQueryChange}
                            onMasteryFilterChange={handleKanjiMasteryFilterChange}
                            onThemeChange={handleKanjiThemeChange}
                            onSetPage={(next) => {
                              onSetKanjiOverviewPage((previous) => ({ ...previous, [level.key]: next }))
                            }}
                            onOpenKanjiDetail={onOpenKanjiDetail}
                          />
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

    </div>
  )
}
