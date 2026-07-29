"""Block-based progressive learning definitions for script decks.

Each deck is split into ordered blocks of related characters.  The first block
is always unlocked.  Subsequent blocks unlock once the previous block reaches
the mastery threshold (80% of cards answered correctly at least once).

Blocks are a *filter over one deck*: a block holds card ids belonging to a single
deck, never ids from elsewhere.  The hiragana, katakana, grammar and conjugation
sequences below are hand-authored ranges.  Vocabulary and kanji are generated
instead (issue #78) — their thematic "categories" used to be separate decks with
their own ``id_offset``, which gave one word two ids and two SRS schedules.  They
are now views over the parent level deck, resolved by :mod:`domain.block_mapping`,
followed by generated blocks covering whatever the categories do not reach.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from domain.block_mapping import category_slugs_for_parent, resolve_category_card_ids
from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS
from domain.kanji_components import KANJI_COMPONENTS
from domain.kanji_ordering import order_by_components
from domain.kanji_themes import KANJI_THEMES

# Fraction of a block's cards that must have repetitions >= 1 before the
# following block becomes available.
UNLOCK_THRESHOLD = 0.8

# Lower threshold used for thematic category blocks (vocab/kanji/grammar
# categories) so users can progress without mastering every card first.
CATEGORY_UNLOCK_THRESHOLD = 0.7

# Cards per generated block, for the part of a vocabulary or kanji deck that no
# thematic category covers. The authored categories run 6–29 cards; 20 keeps a
# generated block a comparable study unit without turning a 2,700-word level deck
# into hundreds of entries.
GENERATED_BLOCK_SIZE = 20

# The "N5" in "Kanji: N5 · Numbers & Time" — a level marker, not part of the name.
_LEVEL_LABEL = re.compile(r"[Nn][1-5]")

# Decks whose blocks are generated from the parent deck rather than hand-listed.
_GENERATED_BLOCK_SLUGS: tuple[str, ...] = (
    "vocab_n5", "vocab_n4", "vocab_n3", "vocab_n2", "vocab_n1",
    "kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1",
)


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

# ---------------------------------------------------------------------------
# Grammar Patterns blocks  (card IDs match _GRAMMAR_PATTERNS_DATA indices in
# domain/decks.py).  Uses CATEGORY_UNLOCK_THRESHOLD (0.70) instead of the
# standard 0.80 so learners advance after completing most of each group.
# ---------------------------------------------------------------------------
_GRAMMAR_PATTERNS_BLOCKS: list[Block] = [
    Block(0, "Copula & Existence",      list(range(0,  6)),  ["〜は〜です", "〜があります", "〜がいます"]),
    Block(1, "Core Particles",          list(range(6,  19)), ["〜は", "〜が", "〜を"]),
    Block(2, "Verb Forms",              list(range(19, 31)), ["〜ます", "〜ません", "〜ました"]),
    Block(3, "Descriptions & Questions",list(range(31, 49)), ["〜い", "〜な", "なに/なん"]),
    Block(4, "Connectives",             list(range(49, 54)), ["〜から", "〜が (contrast)", "〜けど"]),
    Block(5, "Key Expressions",         list(range(54, 64)), ["〜をください", "〜がほしい", "どうぞよろしく"]),
]


def _display_name(deck_name: str) -> str:
    """Strip the family and level prefix from a category deck's display name.

    ``"Vocabulary: Greetings"`` → ``"Greetings"``;
    ``"Kanji: N5 · Numbers & Time"`` → ``"Numbers & Time"``. The block already
    sits under its parent section, so repeating the family in every label is
    noise.
    """
    name = deck_name.split(":", 1)[-1].strip() if ":" in deck_name else deck_name
    # Level-marked category names carry an extra "N5 · " segment. Matched on the
    # level itself rather than on "a short leading word", so a name that simply
    # contains the separator keeps all of itself.
    head, separator, tail = name.partition("·")
    if separator and _LEVEL_LABEL.fullmatch(head.strip()):
        return tail.strip()
    return name


def _component_ordered(card_ids: list[int], characters: dict[int, str]) -> list[int]:
    """Sort kanji card ids so a character follows the components it is built from.

    Ordering runs over characters, not ids, because a level deck can carry the
    same character twice; the ids are re-expanded afterwards so nothing is lost.
    """
    ids_by_char: dict[str, list[int]] = {}
    for card_id in card_ids:
        ids_by_char.setdefault(characters[card_id], []).append(card_id)

    ordered: list[int] = []
    for char in order_by_components(list(ids_by_char), KANJI_COMPONENTS):
        ordered.extend(ids_by_char[char])
    return ordered


@lru_cache(maxsize=None)
def _generated_blocks(slug: str) -> tuple[Block, ...]:
    """Build the block sequence for a vocabulary or kanji level deck.

    Authored thematic categories come first, in registration order, each as a
    view over the parent's card ids. Kanji levels then draw their authored themes
    (:mod:`domain.kanji_themes`) from what is left. Whatever neither covers
    follows in fixed-size generated blocks, so every card in the deck belongs to
    exactly one block and none is unreachable.

    Within a kanji block the cards keep component order, so a character still
    follows the parts it is built from among its own block-mates.
    """
    deck = ALL_DECKS[slug]()
    by_id = {card.id: card for card in deck.cards}
    label = "Kanji" if slug.startswith("kanji") else "Words"

    blocks: list[Block] = []
    claimed: set[int] = set()
    for category_slug in category_slugs_for_parent(slug):
        card_ids = [cid for cid in resolve_category_card_ids(category_slug) if cid not in claimed]
        if not card_ids:
            continue
        claimed.update(card_ids)
        blocks.append(
            Block(
                index=len(blocks),
                # The registered deck is a view carrying the *parent's* name, so
                # the authored label has to come from the source builder.
                name=_display_name(CATEGORY_SOURCE_DECKS[category_slug]().name),
                card_ids=card_ids,
                sample_chars=[by_id[cid].character for cid in card_ids[:3]],
            )
        )

    remaining = [card.id for card in deck.cards if card.id not in claimed]
    is_kanji = slug.startswith("kanji")
    characters = {card.id: card.character for card in deck.cards}
    if is_kanji:
        # Components only describe kanji, so vocabulary keeps its deck order.
        remaining = _component_ordered(remaining, characters)

    for name, theme_chars in KANJI_THEMES.get(slug, ()):
        wanted = set(theme_chars)
        card_ids = [cid for cid in remaining if characters[cid] in wanted]
        if not card_ids:
            continue
        claimed.update(card_ids)
        remaining = [cid for cid in remaining if cid not in claimed]
        blocks.append(
            Block(
                index=len(blocks),
                name=name,
                card_ids=card_ids,
                sample_chars=[characters[cid] for cid in card_ids[:3]],
            )
        )

    for offset in range(0, len(remaining), GENERATED_BLOCK_SIZE):
        card_ids = remaining[offset : offset + GENERATED_BLOCK_SIZE]
        blocks.append(
            Block(
                index=len(blocks),
                name=f"{label} {offset // GENERATED_BLOCK_SIZE + 1}",
                card_ids=card_ids,
                sample_chars=[by_id[cid].character for cid in card_ids[:3]],
            )
        )
    return tuple(blocks)


def blocks_for_slug(slug: str) -> list[Block]:
    """Return the ordered block sequence for a deck slug.

    Returns an empty list for decks that do not use block progression — the
    thematic category decks themselves, which are now views over a parent rather
    than block-bearing decks of their own.
    """
    if slug == "hiragana":
        return _HIRAGANA_BLOCKS
    if slug == "katakana":
        return _KATAKANA_BLOCKS
    if slug == "grammar_patterns":
        return _GRAMMAR_PATTERNS_BLOCKS
    if slug == "sentence_examples":
        return _SENTENCE_EXAMPLES_BLOCKS
    if slug == "conjugation_training":
        return _CONJUGATION_TRAINING_BLOCKS
    if slug in _GENERATED_BLOCK_SLUGS:
        return list(_generated_blocks(slug))
    return []


def unlock_threshold_for_slug(slug: str) -> float:
    """Return the mastery threshold required to unlock the next block.

    Grammar patterns and other category-based sections use a lower threshold
    so learners can progress after mastering 70 % instead of 80 %.

    Vocabulary and kanji levels are included: their blocks are the thematic
    categories that already used this threshold when they were separate decks,
    and a 0.80 gate over a 2,000-word level deck would stall almost everyone.
    """
    if slug in ("grammar_patterns", "sentence_examples", "conjugation_training"):
        return CATEGORY_UNLOCK_THRESHOLD
    if slug in _GENERATED_BLOCK_SLUGS:
        return CATEGORY_UNLOCK_THRESHOLD
    return UNLOCK_THRESHOLD


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


def compute_unlocked_count(blocks: list[Block], repetitions_map: dict[int, int], threshold: float = UNLOCK_THRESHOLD) -> int:
    """Return how many blocks are currently accessible (always at least 1).

    Blocks unlock sequentially: block *i* is unlocked once block *i − 1*
    reaches *threshold*.

    Anything the learner has already studied stays reachable, even when the
    sequential rule alone would not reach it. Under steady state that floor never
    binds — you can only study an unlocked block. It matters when a deck's blocks
    change shape underneath existing review history: vocabulary and kanji had no
    blocks at all before issue #78, so their whole deck was one pool, and without
    this a learner would come back to find studied cards locked away.
    """
    unlocked = 1
    for i in range(1, len(blocks)):
        prev_mastery = compute_block_mastery(blocks[i - 1], repetitions_map)
        if prev_mastery >= threshold:
            unlocked = i + 1
        else:
            break

    for block in reversed(blocks):
        if any(repetitions_map.get(cid, 0) >= 1 for cid in block.card_ids):
            return max(unlocked, block.index + 1)
    return unlocked
