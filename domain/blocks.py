"""Block-based progressive learning definitions for script decks.

Each deck is split into ordered blocks of related characters.  The first block
is always unlocked.  Subsequent blocks unlock once the previous block reaches
the mastery threshold (80% of cards answered correctly at least once).
"""

from __future__ import annotations

from dataclasses import dataclass

# Fraction of a block's cards that must have repetitions >= 1 before the
# following block becomes available.
UNLOCK_THRESHOLD = 0.8


@dataclass(frozen=True)
class Block:
    """A named group of card IDs forming one learning unit."""

    index: int
    name: str
    card_ids: list[int]
    sample_chars: list[str]  # Up to three characters shown as a visual preview.


# ---------------------------------------------------------------------------
# Hiragana blocks  (card IDs match _HIRAGANA_DATA indices in domain/decks.py)
# ---------------------------------------------------------------------------
_HIRAGANA_BLOCKS: list[Block] = [
    Block(0,  "Vowels",         list(range(0,  5)),   ["あ", "い", "う"]),
    Block(1,  "K-row",          list(range(5,  10)),  ["か", "き", "く"]),
    Block(2,  "S-row",          list(range(10, 15)),  ["さ", "し", "す"]),
    Block(3,  "T-row",          list(range(15, 20)),  ["た", "ち", "つ"]),
    Block(4,  "N-row",          list(range(20, 25)),  ["な", "に", "ぬ"]),
    Block(5,  "H-row",          list(range(25, 30)),  ["は", "ひ", "ふ"]),
    Block(6,  "M-row",          list(range(30, 35)),  ["ま", "み", "む"]),
    Block(7,  "Y / R / W + N",  list(range(35, 46)),  ["や", "ら", "わ"]),
    Block(8,  "Voiced G + Z",   list(range(46, 56)),  ["が", "ぎ", "ざ"]),
    Block(9,  "Voiced D + B",   list(range(56, 66)),  ["だ", "ば", "び"]),
    Block(10, "Semi-voiced P",  list(range(66, 71)),  ["ぱ", "ぴ", "ぷ"]),
    Block(11, "Digraphs",       list(range(71, 104)), ["きゃ", "しゃ", "ちゃ"]),
]

# ---------------------------------------------------------------------------
# Katakana blocks  (card IDs mirror _KATAKANA_DATA indices in domain/decks.py)
# ---------------------------------------------------------------------------
_KATAKANA_BLOCKS: list[Block] = [
    Block(0,  "Vowels",         list(range(0,  5)),   ["ア", "イ", "ウ"]),
    Block(1,  "K-row",          list(range(5,  10)),  ["カ", "キ", "ク"]),
    Block(2,  "S-row",          list(range(10, 15)),  ["サ", "シ", "ス"]),
    Block(3,  "T-row",          list(range(15, 20)),  ["タ", "チ", "ツ"]),
    Block(4,  "N-row",          list(range(20, 25)),  ["ナ", "ニ", "ヌ"]),
    Block(5,  "H-row",          list(range(25, 30)),  ["ハ", "ヒ", "フ"]),
    Block(6,  "M-row",          list(range(30, 35)),  ["マ", "ミ", "ム"]),
    Block(7,  "Y / R / W + N",  list(range(35, 46)),  ["ヤ", "ラ", "ワ"]),
    Block(8,  "Voiced G + Z",   list(range(46, 56)),  ["ガ", "ギ", "ザ"]),
    Block(9,  "Voiced D + B",   list(range(56, 66)),  ["ダ", "バ", "ビ"]),
    Block(10, "Semi-voiced P",  list(range(66, 71)),  ["パ", "ピ", "プ"]),
    Block(11, "Digraphs",       list(range(71, 104)), ["キャ", "シャ", "チャ"]),
]

# ---------------------------------------------------------------------------
# Sentence Examples blocks  (card IDs match _GRAMMAR_PATTERNS_DATA indices in
# domain/decks.py)
# ---------------------------------------------------------------------------
_SENTENCE_EXAMPLES_BLOCKS: list[Block] = [
    Block(0, "Copula / Existence", list(range(0, 6)), ["〜は〜です", "〜があります", "〜がいます"]),
    Block(1, "Core Particles", list(range(6, 19)), ["〜は", "〜が", "〜を"]),
    Block(2, "Verb Forms", list(range(19, 31)), ["〜ます", "〜ません", "〜てください"]),
    Block(3, "i-Adjectives", list(range(31, 35)), ["〜い (present)", "〜くない", "〜かった"]),
    Block(4, "na-Adjectives", list(range(35, 38)), ["〜な (before noun)", "〜です (na-adj)", "〜ではありません (na-adj)"]),
    Block(5, "Question Words", list(range(38, 49)), ["なに/なん", "どこ", "だれ"]),
    Block(6, "Connectives", list(range(49, 54)), ["〜から (reason)", "〜が (contrast)", "〜けど/けれど"]),
    Block(7, "Common Patterns", list(range(54, 64)), ["〜をください", "〜がほしい", "〜たい"]),
]

# ---------------------------------------------------------------------------
# Conjugation Training blocks  (card IDs match the deck order in domain/decks.py)
# ---------------------------------------------------------------------------
_CONJUGATION_TRAINING_BLOCKS: list[Block] = [
    Block(0, "Verb Forms", list(range(0, 12)), ["〜ます", "〜ません", "〜ました"]),
    Block(1, "i-Adjectives", list(range(12, 16)), ["〜い (present)", "〜くない", "〜かった"]),
    Block(2, "na-Adjectives", list(range(16, 19)), ["〜な (before noun)", "〜です (na-adj)", "〜ではありません (na-adj)"]),
    Block(3, "Practical Patterns", list(range(19, 24)), ["〜をください", "〜がほしい", "〜たい"]),
]


def blocks_for_slug(slug: str) -> list[Block]:
    """Return the ordered block sequence for a deck slug.

    Returns an empty list for decks that do not use block progression
    (e.g. ``"kanji_n5"``).
    """
    if slug == "hiragana":
        return _HIRAGANA_BLOCKS
    if slug == "katakana":
        return _KATAKANA_BLOCKS
    if slug == "sentence_examples":
        return _SENTENCE_EXAMPLES_BLOCKS
    if slug == "conjugation_training":
        return _CONJUGATION_TRAINING_BLOCKS
    return []


def compute_block_mastery(block: Block, repetitions_map: dict[int, int]) -> float:
    """Return the fraction of block cards answered correctly at least once.

    Args:
        block: The block to evaluate.
        repetitions_map: Mapping of card_id → repetitions count from SRS state.
    """
    if not block.card_ids:
        return 0.0
    passed = sum(1 for cid in block.card_ids if repetitions_map.get(cid, 0) >= 1)
    return passed / len(block.card_ids)


def compute_unlocked_count(blocks: list[Block], repetitions_map: dict[int, int]) -> int:
    """Return how many blocks are currently accessible (always at least 1).

    Blocks unlock sequentially: block *i* is unlocked once block *i − 1*
    reaches :data:`UNLOCK_THRESHOLD`.
    """
    unlocked = 1
    for i in range(1, len(blocks)):
        prev_mastery = compute_block_mastery(blocks[i - 1], repetitions_map)
        if prev_mastery >= UNLOCK_THRESHOLD:
            unlocked = i + 1
        else:
            break
    return unlocked
