import type { CardScores, ScriptKey } from '../types'

export const EMPTY_CARD_SCORES: CardScores = {
  hiragana: {},
  katakana: {},
  kanji_n5: {},
  vocab_n5: {},
  grammar_patterns: {},
  sentence_examples: {},
}

/** Return a fresh empty score map. Callers mutate their copy, so never share one. */
export function emptyCardScores(): CardScores {
  return {
    hiragana: {},
    katakana: {},
    kanji_n5: {},
    vocab_n5: {},
    grammar_patterns: {},
    sentence_examples: {},
  }
}

/**
 * Map a deck slug onto the `ScriptKey` section that displays it.
 *
 * SQLite stores mastery per `(deck_slug, card_id)` since issue #66, but the
 * renderer's six sections each span many decks — the vocabulary section reaches
 * `vocab_n1_law_justice`. Mirrors `_LEGACY_SECTION_PREFIXES` in
 * `scripts/desktop_bridge.py` and `_family_for` in `tests/test_deck_id_uniqueness.py`.
 */
export function sectionForDeckSlug(slug: string): ScriptKey | null {
  if (slug === 'hiragana' || slug === 'katakana') return slug
  if (slug === 'grammar_patterns' || slug === 'sentence_examples') return slug
  if (slug.startsWith('kanji')) return 'kanji_n5'
  if (slug.startsWith('vocab')) return 'vocab_n5'
  return null
}

/**
 * Collapse deck-keyed stored scores into the renderer's six sections.
 *
 * Merging many decks into one bucket keyed by raw card id is safe because card
 * ids are disjoint within an id-sharing family, and that is enforced rather than
 * assumed — `tests/test_deck_id_uniqueness.py` fails loudly if two decks in a
 * family ever emit the same id for different cards. Storage stays deck-keyed, so
 * the underlying data is unambiguous even though this view is not.
 */
export function toSectionScores(stored: Record<string, Record<number, number>>): CardScores {
  const sectioned = emptyCardScores()
  for (const [slug, cards] of Object.entries(stored ?? {})) {
    const section = sectionForDeckSlug(slug)
    if (section === null) continue
    for (const [cardId, score] of Object.entries(cards ?? {})) {
      const numericId = Number(cardId)
      if (!Number.isFinite(numericId)) continue
      sectioned[section][numericId] = score
    }
  }
  return sectioned
}

/** Return whether any section holds a score, i.e. whether there is anything to migrate. */
export function hasAnyCardScore(scores: CardScores): boolean {
  return Object.values(scores).some((section) => Object.keys(section).length > 0)
}
