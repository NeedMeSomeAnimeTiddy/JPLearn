"""Pin the card ids of the supplement cards in the level decks (audit 2, F3).

``domain/deck_supplements.py`` cards are appended after each level's imported
rows by ``with_supplement``, so their ids are *positional*: they equal the
level's id offset plus the length of the imported list. Adding or removing one
imported row moves every supplement id by one.

Mastery and review state are keyed by card id, so a moved id hands one card's
learning history to a different card. That breaks the project's hard line 1
(never lose or corrupt learner progress), and nothing else would notice.

Decks are built with ``domain.decks._RAW_LEVEL_BUILDERS[(family, level)]()`` -
the unfiltered level decks that ids are assigned in, before #80 hides repeats
(the running app filters those afterwards and never renumbers).

If this fails because the corpus legitimately changed, do not just edit the
numbers: the learner's existing history is keyed to the old ids. Pin the
supplement to its old ids (or migrate the stored state) first.
"""

from __future__ import annotations

import pytest

from domain.decks import _RAW_LEVEL_BUILDERS

_POSITIONAL_WARNING = (
    "Supplement card ids are positional (they follow the level's imported row "
    "count), and mastery/review state is keyed by card id: moving one moves a "
    "learner's history onto a different card (hard line 1). Do not renumber; "
    "keep the existing ids stable or migrate stored progress first."
)

# Pinned as they are at d23ac88: {(family, level): (total cards, [(id, character), ...])}.
_PINNED: dict[tuple[str, str], tuple[int, list[tuple[int, str]]]] = {
    ("kanji", "n5"): (
        99,
        [
            (86, "左"), (87, "右"), (88, "一"), (89, "二"), (90, "三"), (91, "五"),
            (92, "六"), (93, "八"), (94, "十"), (95, "百"), (96, "千"), (97, "万"),
            (98, "半"),
        ],
    ),
    ("kanji", "n4"): (177, [(1175, "意"), (1176, "対")]),
    ("kanji", "n2"): (
        384,
        [(3379, "資"), (3380, "密"), (3381, "率"), (3382, "責"), (3383, "座")],
    ),
    ("kanji", "n1"): (1192, [(5190, "賛"), (5191, "罰")]),
    ("vocab", "n5"): (
        744,
        [
            (718, "かみ"), (719, "やさい"), (720, "おはよう"), (721, "こんにちは"),
            (722, "こんばんは"), (723, "さようなら"), (724, "ありがとう"),
            (725, "ごめんなさい"), (726, "はじめまして"), (727, "いってきます"),
            (728, "ただいま"), (729, "おはようございます"), (730, "おやすみなさい"),
            (731, "ありがとうございます"), (732, "すみません"),
            (733, "よろしくおねがいします"), (734, "どういたしまして"),
            (735, "おとこのひと"), (736, "おんなのひと"), (737, "にほんご"),
            (738, "とき"), (739, "こと"), (740, "えんぴつ"), (741, "べんきょうする"),
            (742, "いく"), (743, "ある"),
        ],
    ),
}


@pytest.mark.parametrize(("family", "level"), list(_PINNED))
def test_supplement_cards_keep_their_ids(family: str, level: str) -> None:
    total, pinned = _PINNED[(family, level)]
    cards = _RAW_LEVEL_BUILDERS[(family, level)]().cards
    by_id = {card.id: card.character for card in cards}

    moved = [
        f"id {card_id}: expected {character!r}, found {by_id.get(card_id)!r}"
        for card_id, character in pinned
        if by_id.get(card_id) != character
    ]
    assert not moved, (
        f"{family}_{level} supplement cards moved: {moved}. {_POSITIONAL_WARNING}"
    )
    assert len(cards) == total, (
        f"{family}_{level} has {len(cards)} cards, expected {total}. {_POSITIONAL_WARNING}"
    )
