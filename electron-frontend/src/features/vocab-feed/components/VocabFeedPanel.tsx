import { VOCAB_BUDGET_STEPS } from '../constants'
import type { VocabFeed } from '../types'

interface VocabFeedPanelProps {
  feed: VocabFeed
}

/**
 * Today's words, where a vocabulary level's block list used to be.
 *
 * The counts are not decoration. "Here are ten words" is a card trick without a
 * denominator, so the strip says how much of the level the learner's kanji already
 * unlock and how many characters that is — the number the ordering turns on, so clearing
 * a kanji block is visibly what moved the feed.
 */
export function VocabFeedPanel({ feed }: VocabFeedPanelProps) {
  const { words, budget, total, readable, knownKanji, started, loading, error } = feed

  if (error) {
    return (
      <div className="hub-tracklist hub-tracklist--feed" role="status">
        <p className="hub-feed-empty">{error}</p>
      </div>
    )
  }

  return (
    <div className="hub-tracklist hub-tracklist--feed">
      <div className="hub-feed-head">
        <span className="hub-feed-count">
          {readable.toLocaleString()} of {total.toLocaleString()} readable
        </span>
        <span className="hub-feed-known">{knownKanji.toLocaleString()} kanji known</span>
      </div>

      <div className="hub-feed-budget" role="group" aria-label="New words a day">
        {VOCAB_BUDGET_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            className={`hub-level-chip${step === budget ? ' is-active' : ''}`}
            aria-pressed={step === budget}
            aria-label={step === 0 ? 'No new words a day' : `${step} new words a day`}
            disabled={loading}
            onClick={() => feed.setBudget(step)}
          >
            {step === 0 ? 'none' : step}
          </button>
        ))}
      </div>

      {/* A budget of zero is a choice, not an empty state — say which it is. */}
      {words.length === 0 && !loading ? (
        <p className="hub-feed-empty">
          {budget === 0
            ? 'No new words today — reviews only.'
            : started >= total
              ? 'Every word in this level has been started.'
              : 'Nothing new to add right now.'}
        </p>
      ) : (
        <ol className="hub-feed-list">
          {words.map((word) => (
            <li key={word.card_id} className="hub-feed-row">
              <span className="hub-feed-word" lang="ja">{word.word}</span>
              <span className="hub-feed-reading">{word.reading}</span>
              <span className="hub-feed-meaning">{word.meaning}</span>
              {word.theme ? <span className="hub-feed-theme">{word.theme}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
