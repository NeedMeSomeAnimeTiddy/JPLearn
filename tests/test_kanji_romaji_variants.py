"""Every kanji card must be answerable in Romaji Sprint (audit 9, F3).

Romaji Sprint accepts an answer only when it equals one of the card's ``/``-separated
readings, and the learner's input is cut to ASCII letters and spaces. A reading stored
in katakana, or in dictionary notation like ``ko.me``, can therefore never be matched,
and every appearance of the card is saved as a wrong review.
"""

from __future__ import annotations

import re

import pytest

from domain.decks import ALL_DECKS

PLAIN_ROMAJI = re.compile(r"[a-z]+( [a-z]+)*")
KANJI_DECKS = ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1")


def _has_plain_variant(romaji: str) -> bool:
    return any(PLAIN_ROMAJI.fullmatch(variant.strip()) for variant in romaji.split("/"))


@pytest.mark.parametrize("slug", KANJI_DECKS)
def test_every_kanji_card_has_a_plain_romaji_reading(slug: str) -> None:
    unanswerable = [card.character for card in ALL_DECKS[slug]().cards if not _has_plain_variant(card.romaji)]
    assert unanswerable == []
