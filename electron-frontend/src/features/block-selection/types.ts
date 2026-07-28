/**
 * Which blocks of a deck the learner is currently studying.
 *
 * Before issue #78 this was a single `activeBlockIndex`, so a session drew from
 * exactly one block. Kana blocks are five cards, which is too thin for most
 * minigames, and vocabulary/kanji had no blocks at all.
 */

/** Block indices selected for one deck, ascending and free of duplicates. */
export type BlockIndices = readonly number[]

/**
 * Selections keyed by the deck slug the blocks belong to.
 *
 * Keyed by slug rather than by `ScriptKey` because the vocabulary and kanji
 * sections each span five level decks — `vocab_n4` and `vocab_n5` are both the
 * `vocab_n5` section but have entirely different blocks, and a selection made in
 * one must not leak into the other.
 */
export type BlockSelectionBySlug = Readonly<Record<string, BlockIndices>>
