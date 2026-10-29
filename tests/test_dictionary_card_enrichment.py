"""Audit 14, F1: a card takes only its own dictionary entry, or none.

The entry supplies furigana, clues and extra typed-recall answers, so a wrong one teaches and grades
the wrong thing. Fixtures use the real index schema (scripts/build_offline_dictionary_sqlite.py)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from data.dictionary_card_match import card_forms, card_readings, romaji_key, romaji_to_hiragana
from data.dictionary_repository import (
    OFFLINE_DICTIONARY_DB_CANDIDATES,
    _lookup_card_dictionary_summary,
    open_enrichment_session,
)
from data.kana_romaji import kana_to_romaji

# entry_id, japanese, reading, gloss, is_common
_ENTRIES = [
    (1, "駄目", "だめ", "no good; useless; hopeless", 1),
    (2, "だめんず", "だめんず", "good-for-nothing man (as a partner)", 0),
    (3, "家", "いえ", "house; residence; dwelling", 1),
    (4, "家", "か", "-ist; -er (person who is an expert in)", 1),
    (5, "お金", "おかね", "money", 1),
    (6, "金", "かね", "money; metal", 1),
    (7, "良い", "よい", "good; excellent; fine", 1),
    (8, "いい", "いい", "good; excellent; fine", 1),
    (9, "行く", "いく", "to go; to move", 1),
    (10, "結婚", "けっこん", "marriage", 1),
    (11, "パート", "パート", "part-time job; part", 1),
    (12, "侍医", "じい", "court physician", 0),
    (13, "お祖父さん", "おじいさん", "grandfather", 1),
    (14, "語呂", "ごろ", "sound (of a sentence); euphony", 0),
    (15, "頃", "ころ", "(approximate) time; around; about; toward", 1),
    (16, "彼", "あれ", "that; that thing", 1),
    (17, "あれ", "あれ", "huh?; eh?", 0),
    (18, "５日", "いつか", "5th day of the month; five days", 1),
    (19, "新聞", "しんぶん", "newspaper", 1),
    (20, "パーティー", "パーティー", "party (social gathering)", 1),
    (21, "勉強", "べんきょう", "study", 1),
    (22, "橋", "はし", "bridge", 1),
    (23, "箸", "はし", "chopsticks", 1),
    (24, "端", "はし", "end; edge", 1),
]


@pytest.fixture()
def conn(tmp_path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(tmp_path / "jmdict_lookup.sqlite")
    db.executescript(
        """
        CREATE TABLE dictionary_entries (
          entry_id INTEGER PRIMARY KEY, source_id TEXT, japanese TEXT NOT NULL,
          reading TEXT NOT NULL, gloss TEXT NOT NULL, is_common INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX idx_dictionary_entries_japanese ON dictionary_entries(japanese);
        CREATE INDEX idx_dictionary_entries_reading ON dictionary_entries(reading);
        """
    )
    db.executemany(
        "INSERT INTO dictionary_entries (entry_id, source_id, japanese, reading, gloss, is_common) VALUES (?, ?, ?, ?, ?, ?)",
        [(eid, f"jmdict:{eid}", jp, rd, gl, common) for eid, jp, rd, gl, common in _ENTRIES],
    )
    return db


def _entry(conn: sqlite3.Connection, character: str, romaji: str, meaning: str) -> tuple[str, str] | None:
    summary = _lookup_card_dictionary_summary(
        conn, character=character, meaning=meaning, tags=[], romaji=romaji, pitch_accent_available=False
    )
    return None if summary is None else (summary.character, summary.reading)


def test_kana_card_finds_its_kanji_entry_not_a_longer_word(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "だめ", "dame", "useless, no good, hopeless") == ("駄目", "だめ")


def test_kana_card_never_takes_a_kana_homograph(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "あれ", "are", "that one (over there)") == ("彼", "あれ")


def test_homophone_without_shared_meaning_is_not_attached(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "おじいさん", "ojiisan", "grandfather, male senior citizen") == ("お祖父さん", "おじいさん")
    assert _entry(conn, "~ころ; ~ごろ", "~koro ~goro", "about, toward, approximately (time)") == ("頃", "ころ")


def test_affix_card_takes_the_reading_its_romaji_gives(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "~家", "~ka", "person who is specialized in ~") == ("家", "か")


def test_honorific_card_keeps_its_own_entry_and_reading(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "お金", "okane", "money") == ("お金", "おかね")


def test_two_forms_and_two_readings(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "いい; よい", "ii yoi", "good") is not None
    assert _entry(conn, "行く", "iku yuku", "to go") == ("行く", "いく")


def test_optional_tails_on_forms_and_romaji(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "結婚", "kekkon (suru)", "marriage") == ("結婚", "けっこん")
    assert _entry(conn, "パート (タイム)", "paato (taimu)", "part time") == ("パート", "パート")


def test_suru_verb_card_takes_the_noun_entry(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "べんきょうする", "benkyou suru", "to study") == ("勉強", "べんきょう")


def test_word_filed_under_another_spelling_is_found_by_reading(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "五日", "itsuka", "five days; fifth day of the month") == ("５日", "いつか")


def test_historical_romaji_quirks_still_match(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "新聞", "shimbun", "newspaper") == ("新聞", "しんぶん")
    assert _entry(conn, "パーティー", "paateii", "party") == ("パーティー", "パーティー")


def test_equal_scores_with_different_meanings_attach_nothing(conn: sqlite3.Connection) -> None:
    # read はし, spelled in no form the index has, and "bridge; chopsticks" shares one word with each
    assert _entry(conn, "はし", "hashi", "bridge; chopsticks") is None


def test_no_entry_and_malformed_romaji(conn: sqlite3.Connection) -> None:
    assert _entry(conn, "存在しない語", "sonzaishinaigo", "nothing") is None
    assert _entry(conn, "家", "!!", "house") is None  # romaji present but unusable: the check fails


def test_wrong_gloss_is_no_longer_an_accepted_answer(conn: sqlite3.Connection) -> None:
    summary = _lookup_card_dictionary_summary(
        conn, character="だめ", meaning="useless, no good, hopeless", tags=[], romaji="dame", pitch_accent_available=False
    )
    assert summary is not None
    assert not any("good-for-nothing" in gloss for gloss in summary.glosses)


def test_reading_helpers() -> None:
    assert card_forms("~(て) しまう") == ["しまう", "てしまう"]
    assert card_forms("パート (タイム)") == ["パート", "パートタイム"]
    assert card_readings("") is None
    assert card_readings("!!") == set()
    assert {"kekkon", "kekkonsuru"} <= (card_readings("kekkon (suru)") or set())
    assert romaji_key("shimbun") == romaji_key("shinbun")
    assert romaji_key("ōkii") == romaji_key("ookii") == romaji_key(kana_to_romaji("おおきい"))
    assert romaji_key("sensē") == romaji_key("sensee") == romaji_key("sensei")
    assert romaji_key(kana_to_romaji("しんぶん")) == romaji_key("shinbun")
    assert romaji_to_hiragana("itsuka") == "いつか"
    assert romaji_to_hiragana("kitte") == "きって"
    assert romaji_to_hiragana("xq") is None


def _real_index() -> Path | None:
    return next((path for path in OFFLINE_DICTIONARY_DB_CANDIDATES if path.exists()), None)


@pytest.mark.skipif(_real_index() is None, reason="offline dictionary index not present")
def test_real_beginner_decks_only_attach_the_cards_own_word() -> None:
    """Every attached entry over vocab N5/N4 is the card's word: spelled as a form, or read as the
    card's romaji or kana spelling says (the full review lives in the audit 14 measurement)."""
    from domain.decks import ALL_DECKS

    with open_enrichment_session() as look:
        assert look is not None
        for slug in ("vocab_n5", "vocab_n4"):
            for card in ALL_DECKS[slug]().cards:
                summary = look(character=card.character, meaning=card.meaning, tags=card.tags, romaji=card.romaji)
                if summary is None:
                    continue
                readings = card_readings(card.romaji) or set()
                kana = {form for form in card_forms(card.character)}
                assert (
                    romaji_key(kana_to_romaji(summary.reading)) in readings
                    or summary.reading in kana
                    or summary.character in kana
                ), (slug, card.character, card.romaji, summary.character, summary.reading)
