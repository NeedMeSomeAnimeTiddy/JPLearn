"""The teaching order that replaced vocabulary blocks.

Every case here is a claim about what a learner meets next, not about sorting.
"""
from __future__ import annotations

import pytest

from domain.blocks import blocks_for_slug, themes_for_slug
from domain.decks import ALL_DECKS
from domain.vocab_order import (
    DEFAULT_NEW_PER_DAY,
    MAX_NEW_PER_DAY,
    clamp_budget,
    kanji_in,
    next_words,
    order_by_known_kanji,
    unknown_count,
)


class TestClampBudget:
    """A stored setting is user input that has sat in a database across upgrades."""

    @pytest.mark.parametrize("raw", [None, "", "   ", "ten", "7.5", [], {}])
    def test_anything_unreadable_falls_back_rather_than_raising(self, raw: object) -> None:
        assert clamp_budget(raw) == DEFAULT_NEW_PER_DAY

    @pytest.mark.parametrize(("raw", "expected"), [("0", 0), ("1", 1), (" 25 ", 25), (25, 25)])
    def test_a_readable_number_is_taken_as_written(self, raw: object, expected: int) -> None:
        assert clamp_budget(raw) == expected

    def test_zero_is_a_real_setting_not_a_disabled_one(self) -> None:
        """"No new words today, just my reviews" is deliberate."""
        assert clamp_budget("0") == 0
        assert next_words([(1, "水")], {"水"}, seen=(), budget=clamp_budget("0")) == []

    def test_a_negative_becomes_the_floor_and_a_typo_becomes_the_ceiling(self) -> None:
        assert clamp_budget("-5") == 0
        assert clamp_budget("99999") == MAX_NEW_PER_DAY


class TestKanjiIn:
    def test_picks_out_only_kanji(self) -> None:
        assert kanji_in("友達") == {"友", "達"}

    @pytest.mark.parametrize("text", ["ともだち", "コーヒー", "~だけ", "", "ああ"])
    def test_kana_and_punctuation_carry_no_prerequisite(self, text: str) -> None:
        """A word you can already read has nothing to wait for."""
        assert kanji_in(text) == frozenset()

    def test_a_repeated_character_is_one_prerequisite(self) -> None:
        assert kanji_in("人人") == {"人"}
        assert unknown_count("人人", set()) == 1


class TestOrderByKnownKanji:
    def test_readable_words_come_first(self) -> None:
        entries = [(1, "銀行"), (2, "水"), (3, "食堂")]
        assert order_by_known_kanji(entries, {"水"})[0] == 2

    def test_fewer_unknown_beats_more_unknown(self) -> None:
        """One lesson away sorts ahead of two."""
        entries = [(1, "図書館"), (2, "山川")]
        assert order_by_known_kanji(entries, {"山"}) == [2, 1]

    def test_a_word_that_exercises_known_kanji_beats_one_with_none(self) -> None:
        """The feed reinforces the kanji curriculum rather than dodging it.

        This is the key that was wrong first time round: ranking readable words by
        FEWEST kanji put every kana word in front, and the gojuon tiebreak then opened
        N5 on two hundred alphabetical kana.
        """
        entries = [(1, "友達"), (2, "ともだち")]
        assert order_by_known_kanji(entries, {"友", "達"}) == [1, 2]

    def test_deck_order_is_the_tiebreak_and_it_is_stable(self) -> None:
        entries = [(7, "水"), (3, "火"), (9, "山")]
        known = {"水", "火", "山"}
        assert order_by_known_kanji(entries, known) == [7, 3, 9]
        assert order_by_known_kanji(entries, known) == order_by_known_kanji(entries, known)

    def test_nothing_is_dropped_or_hidden(self) -> None:
        """A running order, not a gate. Knowing nothing still returns everything."""
        entries = [(1, "銀行"), (2, "水"), (3, "食堂")]
        assert sorted(order_by_known_kanji(entries, set())) == [1, 2, 3]

    def test_learning_a_kanji_moves_its_words_forward(self) -> None:
        """The point of the whole design: the two halves cooperate."""
        entries = [(1, "銀行"), (2, "食堂"), (3, "水曜日")]
        before = order_by_known_kanji(entries, set())
        after = order_by_known_kanji(entries, {"銀", "行"})
        assert after[0] == 1
        assert before[0] != 1 or before == after  # only the knowledge changed


class TestNextWords:
    def test_budget_caps_the_feed(self) -> None:
        entries = [(i, "水") for i in range(1, 11)]
        assert len(next_words(entries, {"水"}, seen=(), budget=3)) == 3

    def test_words_already_started_are_not_offered_again(self) -> None:
        entries = [(1, "水"), (2, "火"), (3, "山")]
        assert next_words(entries, {"水", "火", "山"}, seen={1, 2}, budget=5) == [3]

    @pytest.mark.parametrize("budget", [0, -1])
    def test_no_budget_means_no_new_words_rather_than_all_of_them(self, budget: int) -> None:
        entries = [(1, "水"), (2, "火")]
        assert next_words(entries, set(), seen=(), budget=budget) == []


class TestAgainstTheRealDecks:
    """The decks this was written for, not fixtures."""

    @pytest.mark.parametrize(
        "slug", ["vocab_n5", "vocab_n4", "vocab_n3", "vocab_n2", "vocab_n1"]
    )
    def test_every_card_survives_the_ordering(self, slug: str) -> None:
        cards = ALL_DECKS[slug]().cards
        entries = [(c.id, c.character) for c in cards]
        assert sorted(order_by_known_kanji(entries, set())) == sorted(c.id for c in cards)

    def test_the_feed_opens_on_something_readable_today(self) -> None:
        """Whatever the learner knows, the first word must need nothing they do not."""
        cards = ALL_DECKS["vocab_n5"]().cards
        entries = [(c.id, c.character) for c in cards]
        by_id = {c.id: c.character for c in cards}
        for known in (set(), {"日", "一", "二", "十"}):
            first = by_id[order_by_known_kanji(entries, known)[0]]
            assert not (kanji_in(first) - known), f"opened on {first}, which is unreadable"

    def test_the_feed_does_not_open_on_a_run_of_kana(self) -> None:
        """The measured failure of the first attempt, kept as a test.

        With three kanji blocks behind the learner it opened ああ・あそこ・あちら・
        あっち・あなた — the deck's own alphabetical order wearing a new name.
        """
        kb = blocks_for_slug("kanji_n5")
        kanji_by_id = {c.id: c.character for c in ALL_DECKS["kanji_n5"]().cards}
        known = {kanji_by_id[cid] for b in kb[:3] for cid in b.card_ids}
        cards = ALL_DECKS["vocab_n5"]().cards
        by_id = {c.id: c.character for c in cards}
        order = order_by_known_kanji([(c.id, c.character) for c in cards], known)
        opening = [by_id[cid] for cid in order[:10]]
        assert all(kanji_in(w) for w in opening), f"opened on kana: {opening}"

    def test_the_themes_still_cover_every_card(self) -> None:
        """Dropping the blocks must not have dropped the labels with them."""
        for slug in ("vocab_n5", "vocab_n1"):
            covered = {cid for t in themes_for_slug(slug) for cid in t.card_ids}
            assert covered == {c.id for c in ALL_DECKS[slug]().cards}
            assert blocks_for_slug(slug) == []
