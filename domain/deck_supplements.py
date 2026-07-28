"""Words that exist only in a thematic category deck, appended to their parent.

Blocks became filters over a parent deck rather than separate decks (issue #78),
so a category deck's cards are now addressed by the *parent's* card id. That works
only for words the parent corpus actually contains.

These rows are the measured remainder: every card in a category deck that has no
counterpart in its parent level deck, by surface form or — for vocabulary only —
by reading plus overlapping meaning. Without them, collapsing the category decks
would silently drop content the app already showed the learner. Most of the kanji
entries are basic numerals (一, 二, 三, 百 …) that the imported N5 corpus simply
never carried, so appending them fixes a real content gap as well.

Deliberately a small, closed, hand-reviewable list rather than a generated file:
it is content authoring, and it should stay visible in review. It is not a place
to add new vocabulary — anything that is not recovering a category-deck word
belongs in the imported corpora under ``data/external_sources``.

Readings and meanings are copied verbatim from the category deck the word came
from, so the recovered card matches what the learner saw before.
"""

from __future__ import annotations

# ``(character, reading, meaning)`` — the row shape both ``_build_vocab_deck``
# and ``_build_kanji_deck`` consume.
_Row = tuple[str, str, str]

# Vocabulary words present in a category deck but not in the parent level corpus.
# Source category noted per row.
VOCAB_SUPPLEMENT: dict[str, tuple[_Row, ...]] = {
    "n5": (
        ("かみ", "kami", "hair"),  # vocab_body
        ("やさい", "yasai", "vegetables"),  # vocab_food_drink
        ("おはよう", "ohayou", "good morning (casual)"),  # vocab_greetings
        ("こんにちは", "konnichiwa", "hello / good afternoon"),  # vocab_greetings
        ("こんばんは", "konbanwa", "good evening"),  # vocab_greetings
        ("さようなら", "sayounara", "goodbye"),  # vocab_greetings
        ("ありがとう", "arigatou", "thank you (casual)"),  # vocab_greetings
        ("ごめんなさい", "gomen nasai", "I'm sorry"),  # vocab_greetings
        ("はじめまして", "hajimemashite", "nice to meet you"),  # vocab_greetings
        ("いってきます", "ittekimasu", "I'm off (leaving the house)"),  # vocab_greetings
        ("ただいま", "tadaima", "I'm home"),  # vocab_greetings
        ("おはようございます", "ohayou gozaimasu", "good morning (polite)"),  # vocab_greetings
        ("おやすみなさい", "oyasumi nasai", "good night"),  # vocab_greetings
        ("ありがとうございます", "arigatou gozaimasu", "thank you (polite)"),  # vocab_greetings
        ("すみません", "sumimasen", "excuse me / I'm sorry"),  # vocab_greetings
        ("よろしくおねがいします", "yoroshiku onegaishimasu", "please treat me well"),  # vocab_greetings
        ("どういたしまして", "dou itashimashite", "you're welcome"),  # vocab_greetings
        ("おとこのひと", "otoko no hito", "man"),  # vocab_nouns
        ("おんなのひと", "onna no hito", "woman"),  # vocab_nouns
        ("にほんご", "nihongo", "Japanese language"),  # vocab_nouns
        ("とき", "toki", "time, moment"),  # vocab_nouns
        ("こと", "koto", "thing (abstract)"),  # vocab_nouns
        ("えんぴつ", "enpitsu", "pencil"),  # vocab_school_study
        ("べんきょうする", "benkyou suru", "to study"),  # vocab_school_study
        ("いく", "iku", "to go"),  # vocab_verbs
        ("ある", "aru", "to be, to exist (inanimate)"),  # vocab_verbs
    ),
}

# Kanji present in a category deck but not in the parent level deck. Matched by
# surface only — kanji readings are homophone-dense (三/賛/算/傘 are all "san"),
# so reading-based matching would map distinct characters onto one card.
KANJI_SUPPLEMENT: dict[str, tuple[_Row, ...]] = {
    "n5": (
        ("左", "hidari", "left"),  # kanji_nature_world
        ("右", "migi", "right"),  # kanji_nature_world
        ("一", "ichi", "one"),  # kanji_numbers_time
        ("二", "ni", "two"),  # kanji_numbers_time
        ("三", "san", "three"),  # kanji_numbers_time
        ("五", "go", "five"),  # kanji_numbers_time
        ("六", "roku", "six"),  # kanji_numbers_time
        ("八", "hachi", "eight"),  # kanji_numbers_time
        ("十", "juu", "ten"),  # kanji_numbers_time
        ("百", "hyaku", "hundred"),  # kanji_numbers_time
        ("千", "sen", "thousand"),  # kanji_numbers_time
        ("万", "man", "ten thousand"),  # kanji_numbers_time
        ("半", "han", "half"),  # kanji_numbers_time
    ),
    "n4": (
        ("意", "i", "meaning, intention"),  # kanji_n4_mind_thought
        ("対", "tai", "opposite, versus"),  # kanji_n4_mind_thought
    ),
    "n2": (
        ("資", "shi", "resource, capital"),  # kanji_n2_economics
        ("密", "mitsu", "dense, secret"),  # kanji_n2_professionalism
        ("率", "ritsu", "ratio, rate"),  # kanji_n2_professionalism
        ("責", "seki", "responsibility"),  # kanji_n2_professionalism
        ("座", "za", "seat, sit"),  # kanji_n2_professionalism
    ),
    "n1": (
        ("賛", "san", "approve, praise"),  # kanji_n1_law_order
        ("罰", "batsu", "punishment"),  # kanji_n1_law_order
    ),
}


def with_supplement(rows: list[_Row], supplement: tuple[_Row, ...]) -> list[_Row]:
    """Append supplement rows the corpus does not already carry.

    Deck builders assign ids by position, so supplements go on the end and the
    ids of existing cards never move.

    Skipping surfaces already present matters because the vocabulary decks fall
    back to the small hand-written ``_VOCAB_N5_DATA`` when the imported corpus is
    unavailable, and that fallback does contain a few of these words. Appending
    blindly would put the same word in one deck twice under two ids — exactly the
    duplication this change exists to remove.

    Args:
        rows: The parent corpus rows, in deck order.
        supplement: Candidate rows to append.

    Returns:
        A new list; ``rows`` is not mutated.
    """
    present = {row[0] for row in rows}
    return [*rows, *(row for row in supplement if row[0] not in present)]
