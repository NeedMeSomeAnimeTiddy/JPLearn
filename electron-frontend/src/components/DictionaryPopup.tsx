import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BookText, Check, ClipboardCopy, History, Search, TriangleAlert, Volume2, X } from 'lucide-react'
import { toHiragana } from 'wanakana'

export interface DictionaryCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags?: string[]
  example_sentence?: string | null
}

interface DictionaryPopupProps {
  open: boolean
  openSignal: number
  seedQuery: string
  cards: DictionaryCard[]
  onClose: () => void
  onPlayAudio?: (text: string) => void
  voiceBusy?: boolean
  voiceUnavailable?: boolean
}

interface DictionaryResult extends DictionaryCard {
  score: number
  matchReason: string
}

type DictionaryLookupPayload = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.searchDictionary>>>

const HISTORY_STORAGE_KEY = 'jplearn-dictionary-history-v1'
const MAX_HISTORY = 8
const INITIAL_VISIBLE_RESULTS = 12
const RESULTS_PAGE_SIZE = 12

function normalizeQuery(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function compactQuery(value: string): string {
  return normalizeQuery(value).replace(/[\s\-_.!?/\\'",:;()[\]{}]+/g, '')
}

function hasJapaneseText(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(value)
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

function saveHistory(history: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {
    // Local history is convenience only.
  }
}

function scoreCard(card: DictionaryCard, query: string): DictionaryResult | null {
  const normalized = normalizeQuery(query)
  if (!normalized) return null
  const compact = compactQuery(query)
  const character = normalizeQuery(card.character)
  const romaji = normalizeQuery(card.romaji)
  const meaning = normalizeQuery(card.meaning)
  const tagText = normalizeQuery((card.tags ?? []).join(' '))
  const exampleText = normalizeQuery(card.example_sentence ?? '')
  const searchable = `${character} ${romaji} ${meaning} ${tagText} ${exampleText}`.trim()

  if (!searchable) return null

  const exactCharacter = hasJapaneseText(query) && character === compact
  const exactRomaji = romaji === normalized
  const exactMeaning = meaning === normalized

  if (exactCharacter) {
    return { ...card, score: 0, matchReason: 'exact character' }
  }
  if (exactRomaji) {
    return { ...card, score: 1, matchReason: 'exact reading' }
  }
  if (exactMeaning) {
    return { ...card, score: 2, matchReason: 'exact meaning' }
  }

  if (hasJapaneseText(query)) {
    if (character.startsWith(compact)) return { ...card, score: 3, matchReason: 'character prefix' }
    if (character.includes(compact)) return { ...card, score: 4, matchReason: 'character match' }
    if (romaji.includes(normalized)) return { ...card, score: 5, matchReason: 'reading match' }
    if (meaning.includes(normalized)) return { ...card, score: 6, matchReason: 'meaning match' }
  } else {
    if (meaning.startsWith(normalized)) return { ...card, score: 3, matchReason: 'meaning prefix' }
    if (romaji.startsWith(normalized)) return { ...card, score: 4, matchReason: 'reading prefix' }
    if (meaning.includes(normalized)) return { ...card, score: 5, matchReason: 'meaning match' }
    if (romaji.includes(normalized)) return { ...card, score: 6, matchReason: 'reading match' }
    if (character.includes(compact)) return { ...card, score: 7, matchReason: 'character match' }
  }

  if (searchable.includes(normalized) || searchable.includes(compact)) {
    return { ...card, score: 8, matchReason: 'text match' }
  }

  return null
}

function updateHistory(history: string[], query: string): string[] {
  const normalized = query.trim()
  if (!normalized) return history
  return [normalized, ...history.filter((entry) => entry !== normalized)].slice(0, MAX_HISTORY)
}

function dedupeResults(results: DictionaryResult[]): DictionaryResult[] {
  const seen = new Set<string>()
  const deduped: DictionaryResult[] = []
  for (const result of results) {
    const key = `${result.character}::${result.romaji}::${result.meaning}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(result)
  }
  return deduped
}

function mapLookupResult(
  item: DictionaryLookupPayload['results'][number],
  index: number,
  baseScore = 0,
  matchReason = 'offline dictionary',
): DictionaryResult {
  return {
    ...item,
    score: baseScore + index,
    matchReason,
  }
}

// If the query looks like romaji (plain latin letters, no kana/kanji already),
// try converting it to hiragana so it can also be matched against the offline
// dictionary's kana readings - JMdict readings are stored in kana, not romaji.
function guessKanaFromRomaji(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed || hasJapaneseText(trimmed)) return null
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) return null
  const converted = toHiragana(trimmed, { passRomaji: false })
  if (!converted || !hasJapaneseText(converted)) return null
  if (converted.toLowerCase() === trimmed.toLowerCase()) return null
  // Reject partial/garbled conversions (e.g. "hello" -> "へlぉ") - only trust
  // conversions where every romaji character mapped cleanly to kana.
  if (/[a-zA-Z]/.test(converted)) return null
  return converted
}

async function copyText(value: string): Promise<void> {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return
  await navigator.clipboard.writeText(value)
}

export function DictionaryPopup({ open, openSignal, seedQuery, cards, onClose, onPlayAudio, voiceBusy, voiceUnavailable }: DictionaryPopupProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultsPaneRef = useRef<HTMLElement | null>(null)
  const searchRequestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>(() => loadHistory())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [remoteResults, setRemoteResults] = useState<DictionaryResult[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'ready' | 'unavailable' | 'error'>('idle')
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_VISIBLE_RESULTS)
  const [openCopyMenu, setOpenCopyMenu] = useState<string | null>(null)
  const openCopyMenuRef = useRef<string | null>(null)
  const [playFailedFor, setPlayFailedFor] = useState<string | null>(null)
  const wasVoiceBusyRef = useRef(false)
  const pendingPlayCharacterRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    const nextQuery = seedQuery.trim().length > 0 ? seedQuery.trim() : history[0] ?? ''
    setQuery(nextQuery)
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [history, open, openSignal, seedQuery])

  useEffect(() => {
    if (!open) {
      setCopiedKey(null)
      setRemoteResults([])
      setSearchStatus('idle')
      setVisibleCount(INITIAL_VISIBLE_RESULTS)
      setOpenCopyMenu(null)
      setPlayFailedFor(null)
      pendingPlayCharacterRef.current = null
    }
  }, [open])

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_RESULTS)
  }, [query])

  useEffect(() => {
    const wasBusy = wasVoiceBusyRef.current
    wasVoiceBusyRef.current = Boolean(voiceBusy)
    if (!wasBusy || voiceBusy) return
    // A playback attempt just finished (voiceBusy: true -> false).
    if (voiceUnavailable && pendingPlayCharacterRef.current) {
      setPlayFailedFor(pendingPlayCharacterRef.current)
    } else {
      setPlayFailedFor(null)
    }
    pendingPlayCharacterRef.current = null
  }, [voiceBusy, voiceUnavailable])

  useEffect(() => {
    openCopyMenuRef.current = openCopyMenu
  }, [openCopyMenu])

  useEffect(() => {
    if (!open) return
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!openCopyMenuRef.current) return
      const target = event.target as HTMLElement | null
      if (target && target.closest('.dictionary-copy-menu-wrap')) return
      setOpenCopyMenu(null)
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return

    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      setRemoteResults([])
      setSearchStatus('idle')
      return
    }

    const currentRequestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = currentRequestId
    setSearchStatus('searching')

    const timer = window.setTimeout(() => {
      const searchDictionary = window.jplearnDesktop?.searchDictionary
      if (!searchDictionary) {
        if (searchRequestIdRef.current === currentRequestId) {
          setSearchStatus('unavailable')
        }
        return
      }

      const kanaGuess = guessKanaFromRomaji(normalizedQuery)

      const runSearch = async () => {
        try {
          const primaryPayload = await searchDictionary(normalizedQuery)
          if (searchRequestIdRef.current !== currentRequestId) return

          const primaryResults = primaryPayload.results.map((item, index) =>
            mapLookupResult(item, index, 0),
          )

          // Only fall back to kana-converted romaji when the direct query is
          // sparse; this prevents phonetic matches (e.g. home -> ほめ) from
          // outranking intended English meaning matches.
          if (!kanaGuess || primaryResults.length >= 3) {
            setRemoteResults(primaryResults)
            setSearchStatus('ready')
            return
          }

          const kanaPayload = await searchDictionary(kanaGuess)
          if (searchRequestIdRef.current !== currentRequestId) return
          const fallbackResults = kanaPayload.results.map((item, index) =>
            mapLookupResult(item, index, 1000, 'phonetic fallback'),
          )
          setRemoteResults([...primaryResults, ...fallbackResults])
          setSearchStatus('ready')
        } catch {
          if (searchRequestIdRef.current !== currentRequestId) return
          setRemoteResults([])
          setSearchStatus('error')
        }
      }

      void runSearch()
    }, 90)

    return () => {
      window.clearTimeout(timer)
    }
  }, [open, query])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const localResults = cards
      .map((card) => scoreCard(card, query))
      .filter((item): item is DictionaryResult => item !== null)
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score
        if (left.character !== right.character) return left.character.localeCompare(right.character)
        return left.romaji.localeCompare(right.romaji)
      })
    const mergedResults = remoteResults.length > 0 ? [...remoteResults, ...localResults] : localResults
    return dedupeResults(mergedResults)
  }, [cards, query, remoteResults])

  const visibleResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount],
  )
  const hasMoreResults = visibleResults.length < results.length

  const loadMoreResults = () => {
    setVisibleCount((previous) => Math.min(results.length, previous + RESULTS_PAGE_SIZE))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextHistory = updateHistory(history, query)
    setHistory(nextHistory)
    saveHistory(nextHistory)
  }

  const handleCopy = async (key: string, value: string) => {
    try {
      await copyText(value)
      setCopiedKey(key)
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current))
      }, 1000)
    } catch {
      // Clipboard copy is convenience only.
    }
  }

  if (!open) return null

  return (
    <div
      className="modal-backdrop dictionary-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="dictionary-panel" role="dialog" aria-modal="true" aria-label="Dictionary lookup panel" onClick={(event) => event.stopPropagation()}>
        <header className="dictionary-header">
          <div className="dictionary-header-copy">
            <span className="dictionary-kicker">
              <Search className="dictionary-kicker-icon" strokeWidth={2.2} aria-hidden="true" />
              Quick lookup
            </span>
            <h2>Dictionary</h2>
            <p>Search Japanese text, romaji, or English meanings from the offline dictionary or the loaded cards.</p>
          </div>
          <button type="button" className="dictionary-close-button" onClick={onClose} aria-label="Close dictionary" title="Close">
            <X aria-hidden="true" strokeWidth={2.2} />
          </button>
        </header>

        <form className="dictionary-search-bar" onSubmit={handleSubmit}>
          <div className="dictionary-search-input-wrap">
            <BookText className="dictionary-search-icon" strokeWidth={2.2} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search Japanese, romaji, or English meaning"
              aria-label="Dictionary search"
            />
          </div>
          <button type="submit" className="dictionary-search-button" disabled={query.trim().length <= 0}>
            Search
          </button>
        </form>

        {history.length > 0 ? (
          <div className="dictionary-recent-row">
            <span className="dictionary-recent-label">
              <History aria-hidden="true" strokeWidth={2.2} />
              Recent
            </span>
            <div className="dictionary-history-list">
              {history.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className="dictionary-history-chip"
                  onClick={() => setQuery(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="dictionary-text-button dictionary-recent-clear"
              onClick={() => {
                setHistory([])
                saveHistory([])
              }}
            >
              Clear
            </button>
          </div>
        ) : null}

        {playFailedFor ? (
          <p className="dictionary-voice-error" role="status">
            <TriangleAlert aria-hidden="true" strokeWidth={2.2} />
            Couldn't play "{playFailedFor}" — it may not be valid Japanese text, or the voice engine isn't available right now.
          </p>
        ) : null}

        <div className="dictionary-body">
          <section
            ref={resultsPaneRef}
            className="dictionary-results-pane"
            onScroll={(event) => {
              if (!hasMoreResults) {
                return
              }
              const target = event.currentTarget
              const remaining = target.scrollHeight - target.scrollTop - target.clientHeight
              if (remaining <= 120) {
                loadMoreResults()
              }
            }}
          >
            <div className="dictionary-section-title-row">
              <h3>Results</h3>
              <span>
                {query.trim()
                  ? searchStatus === 'searching'
                    ? 'Searching…'
                    : `${results.length} match${results.length === 1 ? '' : 'es'}`
                  : 'Start typing to search'}
              </span>
            </div>
            {query.trim().length <= 0 ? (
              <div className="dictionary-empty-state">
                <p>Open a minigame to prefill the active term, then refine the search from there.</p>
              </div>
            ) : results.length > 0 ? (
              <div className="dictionary-result-list">
                {visibleResults.map((result) => {
                  const copyPrefix = `${result.id}-${result.character}`
                  const visibleTags = (result.tags ?? []).filter((tag) => tag !== 'offline_dictionary')
                  const isCopyMenuOpen = openCopyMenu === copyPrefix
                  return (
                    <article key={copyPrefix} className="dictionary-result-card">
                      <div className="dictionary-result-main">
                        <div className="dictionary-result-headline">
                          <span className="dictionary-result-character" lang="ja">{result.character}</span>
                          <span className="dictionary-result-reading">{result.romaji}</span>
                          {result.matchReason === 'phonetic fallback' ? (
                            <span className="dictionary-fallback-badge" title="Shown from romaji-to-kana fallback search">
                              Phonetic fallback
                            </span>
                          ) : null}
                        </div>
                        <p className="dictionary-result-meaning">{result.meaning}</p>
                        {result.example_sentence ? <p className="dictionary-result-example">{result.example_sentence}</p> : null}
                        {visibleTags.length > 0 ? (
                          <div className="dictionary-tag-row" aria-label="Dictionary tags">
                            {visibleTags.slice(0, 4).map((tag) => (
                              <span key={`${copyPrefix}-${tag}`} className="dictionary-tag">{tag}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="dictionary-result-actions">
                        {onPlayAudio ? (
                          <button
                            type="button"
                            className="dictionary-icon-action dictionary-voice-button"
                            onClick={() => {
                              pendingPlayCharacterRef.current = result.character
                              setPlayFailedFor(null)
                              onPlayAudio(result.character)
                            }}
                            disabled={voiceBusy}
                            aria-label={`Play pronunciation for ${result.character}`}
                            title="Play pronunciation"
                          >
                            <Volume2 aria-hidden="true" strokeWidth={2.2} />
                          </button>
                        ) : null}
                        <div className="dictionary-copy-menu-wrap">
                          <button
                            type="button"
                            className={`dictionary-icon-action dictionary-copy-trigger ${isCopyMenuOpen ? 'is-open' : ''}`}
                            onClick={() => setOpenCopyMenu((current) => (current === copyPrefix ? null : copyPrefix))}
                            aria-haspopup="menu"
                            aria-expanded={isCopyMenuOpen}
                            aria-label="Copy options"
                            title="Copy options"
                          >
                            <ClipboardCopy aria-hidden="true" strokeWidth={2.2} />
                          </button>
                          {isCopyMenuOpen ? (
                            <div className="dictionary-copy-menu" role="menu" aria-label="Copy options">
                              <button
                                type="button"
                                role="menuitem"
                                className={copiedKey === `${copyPrefix}-character` ? 'is-copied' : ''}
                                onClick={() => void handleCopy(`${copyPrefix}-character`, result.character)}
                              >
                                {copiedKey === `${copyPrefix}-character` ? <Check aria-hidden="true" strokeWidth={2.4} /> : <ClipboardCopy aria-hidden="true" strokeWidth={2.2} />}
                                {copiedKey === `${copyPrefix}-character` ? 'Copied character' : 'Copy character'}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={copiedKey === `${copyPrefix}-reading` ? 'is-copied' : ''}
                                onClick={() => void handleCopy(`${copyPrefix}-reading`, result.romaji)}
                              >
                                {copiedKey === `${copyPrefix}-reading` ? <Check aria-hidden="true" strokeWidth={2.4} /> : <ClipboardCopy aria-hidden="true" strokeWidth={2.2} />}
                                {copiedKey === `${copyPrefix}-reading` ? 'Copied reading' : 'Copy reading'}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className={copiedKey === `${copyPrefix}-meaning` ? 'is-copied' : ''}
                                onClick={() => void handleCopy(`${copyPrefix}-meaning`, result.meaning)}
                              >
                                {copiedKey === `${copyPrefix}-meaning` ? <Check aria-hidden="true" strokeWidth={2.4} /> : <ClipboardCopy aria-hidden="true" strokeWidth={2.2} />}
                                {copiedKey === `${copyPrefix}-meaning` ? 'Copied meaning' : 'Copy meaning'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })}
                {hasMoreResults ? (
                  <div className="dictionary-empty-state" style={{ paddingTop: 4 }}>
                    <p>Scroll for more results…</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="dictionary-empty-state">
                <p>{searchStatus === 'error' ? 'Dictionary lookup failed.' : 'No matching entries yet.'}</p>
                <p>Try a different spelling, a romaji reading, or an English meaning.</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}