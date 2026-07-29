"""The kanji detail payload when the offline dictionary is missing or outdated.

``build_kanji_detail_payload`` used to raise ``FileNotFoundError`` in both cases,
which blanked the whole panel for anyone who had not fetched the optional ~170 MB
dictionary — including anyone whose index predated the kanji detail tables. The
components, tags, categories and JLPT level all come from committed data, so the
panel can say something useful either way.
"""

from __future__ import annotations

import sqlite3

import pytest

from data import dictionary_repository
from data.dictionary_repository import build_kanji_detail_payload
from domain.kanji_components import KANJI_COMPONENTS


@pytest.fixture
def no_dictionary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dictionary_repository, "_dictionary_db_path", lambda: None)


class TestWithoutDictionary:
    def test_returns_a_payload_instead_of_raising(self, no_dictionary: None) -> None:
        payload = build_kanji_detail_payload("明")
        assert payload["source"] == "deck_only"

    def test_carries_the_components_that_ship_with_the_app(self, no_dictionary: None) -> None:
        payload = build_kanji_detail_payload("明")
        assert payload["components"] == list(KANJI_COMPONENTS["明"])
        assert payload["components"], "明 is built from 日 and 月; an empty list defeats the point"

    def test_still_reports_deck_metadata(self, no_dictionary: None) -> None:
        payload = build_kanji_detail_payload("明")
        assert payload["jlpt_level"] is not None
        assert payload["jlpt_level_source"] == "deck"
        tags = payload["tags"]
        assert isinstance(tags, list) and "kanji" in tags

    def test_leaves_dictionary_only_fields_empty(self, no_dictionary: None) -> None:
        payload = build_kanji_detail_payload("明")
        assert payload["on_readings"] == []
        assert payload["kun_readings"] == []
        assert payload["compounds"] == []
        assert payload["radicals"] == []
        assert payload["stroke_count"] is None

    def test_rejects_a_non_kanji_argument_before_degrading(self, no_dictionary: None) -> None:
        # Validation must still run — degrading is not a reason to accept junk.
        with pytest.raises(ValueError):
            build_kanji_detail_payload("abc")


class TestWithOutdatedIndex:
    def test_degrades_rather_than_demanding_a_re_download(
        self, tmp_path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An index predating the kanji tables reads the same as no index at all."""
        stale = tmp_path / "jmdict_lookup.sqlite"
        conn = sqlite3.connect(stale)
        conn.execute("CREATE TABLE dictionary_entries (id INTEGER PRIMARY KEY)")
        conn.commit()
        conn.close()
        monkeypatch.setattr(dictionary_repository, "_dictionary_db_path", lambda: stale)

        payload = build_kanji_detail_payload("語")

        assert payload["source"] == "deck_only"
        assert payload["components"] == list(KANJI_COMPONENTS["語"])


class TestGeneratedComponentsCoverAllKanji:
    def test_every_taught_kanji_yields_components(self) -> None:
        """A kanji missing from the map would silently show an empty section."""
        from domain.decks import ALL_DECKS

        for slug in ("kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1"):
            for card in ALL_DECKS[slug]().cards:
                assert card.character in KANJI_COMPONENTS
