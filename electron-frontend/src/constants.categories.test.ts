import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import {
  CARD_MASTERY_MAX,
  VOCAB_CATEGORY_LABELS,
  VOCAB_CATEGORY_ORDER,
  VOCAB_CATEGORY_TO_DECK_SLUG,
} from './constants'
import { buildCategoryProgress } from './lib/progressAggregation'
import type { ScriptDeck, VocabCategory } from './types'

// A category has to be declared in five places that TypeScript only partly
// ties together: the `VocabCategory`/`KanjiCategory` unions, the ORDER array,
// the LABELS and TO_DECK_SLUG records, the `DeckSlug` union, and the main
// process's plain-JS allowlist. `Record<Category, …>` covers LABELS and
// TO_DECK_SLUG; nothing covers the other three. Adding the N4-N1 vocabulary
// categories (issue #68) made that gap wide enough to be worth a test — a
// category missing from ORDER is invisible in the UI, and one missing from
// the IPC allowlist throws at runtime when its deck is requested.

const require = createRequire(import.meta.url)
const { validateDeckSlug } = require('../electron/ipc_security.cjs') as {
  validateDeckSlug: (slug: string) => string
}

describe('vocabulary category maps', () => {
  it('orders every declared category exactly once', () => {
    const labelled = Object.keys(VOCAB_CATEGORY_LABELS).sort()
    expect([...VOCAB_CATEGORY_ORDER].sort()).toEqual(labelled)
    expect(new Set(VOCAB_CATEGORY_ORDER).size).toBe(VOCAB_CATEGORY_ORDER.length)
  })

  it('maps every category to a distinct deck slug', () => {
    const slugs = VOCAB_CATEGORY_ORDER.map((key) => VOCAB_CATEGORY_TO_DECK_SLUG[key])
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug.startsWith('vocab_')).toBe(true)
    }
  })

  it('has a non-empty label for every category', () => {
    for (const key of VOCAB_CATEGORY_ORDER) {
      expect(VOCAB_CATEGORY_LABELS[key]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('covers all five JLPT levels', () => {
    const slugs = VOCAB_CATEGORY_ORDER.map((key) => VOCAB_CATEGORY_TO_DECK_SLUG[key])
    for (const level of ['n4', 'n3', 'n2', 'n1']) {
      expect(slugs.some((slug) => slug.startsWith(`vocab_${level}_`))).toBe(true)
    }
    // N5 categories predate the level prefix convention and stay unprefixed.
    expect(slugs).toContain('vocab_greetings')
  })
})

describe('N4-N1 vocabulary categories are reachable', () => {
  // buildCategoryProgress unlocks sequentially and stops at the first category
  // below CATEGORY_UNLOCK_THRESHOLD, so the N4-N1 categories added in #68 sit
  // behind all 12 N5 ones. These tests pin that they are gated -- not stranded.

  const deckFor = (key: VocabCategory, ids: number[]): ScriptDeck['cards'] =>
    ids.map((id) => ({ id, character: key, romaji: key, meaning: key })) as ScriptDeck['cards']

  /** One card per category, id === its index in VOCAB_CATEGORY_ORDER. */
  const decks = Object.fromEntries(
    VOCAB_CATEGORY_ORDER.map((key, index) => [key, deckFor(key, [index])]),
  ) as Record<VocabCategory, ScriptDeck['cards']>

  const progressWith = (scores: Record<number, number>) =>
    buildCategoryProgress(
      VOCAB_CATEGORY_ORDER, VOCAB_CATEGORY_LABELS, VOCAB_CATEGORY_TO_DECK_SLUG, decks, scores,
    )

  const N5_COUNT = 12

  it('locks the N4 categories until the N5 ones are mastered', () => {
    const progress = progressWith({})
    const firstN4 = progress.find((row) => row.slug === 'vocab_n4_school_work')
    expect(firstN4?.unlocked).toBe(false)
  })

  it('unlocks the first N4 category once every N5 category is mastered', () => {
    const scores = Object.fromEntries(
      Array.from({ length: N5_COUNT }, (_unused, index) => [index, CARD_MASTERY_MAX]),
    )
    const progress = progressWith(scores)
    const firstN4 = progress.find((row) => row.slug === 'vocab_n4_school_work')
    expect(firstN4?.unlocked).toBe(true)
  })

  it('reaches the last N1 category when everything before it is mastered', () => {
    const scores = Object.fromEntries(
      VOCAB_CATEGORY_ORDER.slice(0, -1).map((_unused, index) => [index, CARD_MASTERY_MAX]),
    )
    const progress = progressWith(scores)
    const last = progress[progress.length - 1]
    expect(last.slug).toBe('vocab_n1_arts_expression')
    expect(last.unlocked).toBe(true)
  })

  it('carries the deck slug the hub uses to request each category', () => {
    const progress = progressWith({})
    expect(progress.map((row) => row.slug)).toEqual(
      VOCAB_CATEGORY_ORDER.map((key) => VOCAB_CATEGORY_TO_DECK_SLUG[key]),
    )
  })
})

describe('main-process deck slug allowlist', () => {
  it('accepts every category deck the renderer can ask for', () => {
    // Kanji categories are gone — its themes are block definitions that name no
    // deck, so vocabulary is the only family with category slugs left.
    const slugs = VOCAB_CATEGORY_ORDER.map((key) => VOCAB_CATEGORY_TO_DECK_SLUG[key])
    for (const slug of slugs) {
      expect(() => validateDeckSlug(slug), `${slug} rejected by ipc_security`).not.toThrow()
    }
  })
})
