"""Prefix search over the offline dictionary must stay indexed.

`_search_dictionary_japanese` used one `OR` chain of `=`/`LIKE` across two
columns. SQLite cannot use either column's index for that, so it fell back to
the two-valued `idx_dictionary_entries_common`, scanned about half of 217k rows
and sorted through a temp B-tree — ~12ms per lookup.

Nothing noticed while the app only ever asked for 15–25 card category decks.
Issue #78 made the vocabulary section load its whole 744-card level deck at
once, and 744 lookups at 12ms is 40 seconds against a 30-second bridge timeout
(`BRIDGE_REQUEST_TIMEOUT_MS`), so the section stopped loading entirely.

These tests pin the two properties that fix depends on: the query plan uses the
per-column indexes, and the rewrite returns what the `OR` chain returned.
"""

from __future__ import annotations

import sqlite3

import pytest

from data.dictionary_repository import (
    _DICTIONARY_PREFIX_SQL,
    _DICTIONARY_RESULT_LIMIT,
    _PREFIX_RANGE_SENTINEL,
    _dictionary_db_path,
    _search_dictionary_japanese,
)

# The query this replaced, kept verbatim as the oracle.
_LEGACY_SQL = (
    "SELECT entry_id, source_id, japanese, reading, gloss "
    "FROM dictionary_entries "
    "WHERE (japanese = ? OR japanese LIKE ? OR reading = ? OR reading LIKE ?) AND is_common = ? "
    "ORDER BY LENGTH(japanese), entry_id "
    "LIMIT ?"
)

_SCHEMA = """
CREATE TABLE dictionary_entries (
  entry_id INTEGER PRIMARY KEY,
  source_id TEXT,
  japanese TEXT NOT NULL,
  reading TEXT NOT NULL,
  gloss TEXT NOT NULL,
  is_common INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_dictionary_entries_japanese ON dictionary_entries(japanese);
CREATE INDEX idx_dictionary_entries_reading ON dictionary_entries(reading);
CREATE INDEX idx_dictionary_entries_common ON dictionary_entries(is_common);
"""

_ROWS = [
    (1, "jm1", "見る", "みる", "to see", 1),
    (2, "jm2", "見る", "みる", "to watch", 0),
    (3, "jm3", "見せる", "みせる", "to show", 1),
    (4, "jm4", "見物", "けんぶつ", "sightseeing", 1),
    (5, "jm5", "花", "はな", "flower", 1),
    (6, "jm6", "鼻", "はな", "nose", 1),
    (7, "jm7", "話す", "はなす", "to speak", 1),
    (8, "jm8", "犬", "いぬ", "dog", 0),
]


@pytest.fixture
def dictionary() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.executescript(_SCHEMA)
    conn.executemany("INSERT INTO dictionary_entries VALUES (?,?,?,?,?,?)", _ROWS)
    return conn


def _legacy(conn: sqlite3.Connection, query: str, is_common: int) -> list[tuple]:
    return conn.execute(
        _LEGACY_SQL,
        [query, f"{query}%", query, f"{query}%", is_common, _DICTIONARY_RESULT_LIMIT],
    ).fetchall()


def _current(conn: sqlite3.Connection, query: str, is_common: int) -> list[tuple]:
    upper = f"{query}{_PREFIX_RANGE_SENTINEL}"
    return conn.execute(
        _DICTIONARY_PREFIX_SQL,
        [query, upper, is_common, query, upper, is_common, _DICTIONARY_RESULT_LIMIT],
    ).fetchall()


@pytest.mark.parametrize(
    "query",
    ["見る", "見", "み", "花", "はな", "話", "犬", "い", "存在しない"],
)
@pytest.mark.parametrize("is_common", [0, 1])
def test_rewrite_returns_what_the_or_chain_returned(
    dictionary: sqlite3.Connection, query: str, is_common: int
) -> None:
    assert _current(dictionary, query, is_common) == _legacy(dictionary, query, is_common)


def test_prefix_range_subsumes_the_exact_match(dictionary: sqlite3.Connection) -> None:
    """Why the rewrite drops the `=` branches: the range already covers them."""
    exact = [row for row in _current(dictionary, "見る", 1) if row[2] == "見る"]
    assert exact, "an exact headword must still be found by the prefix range"


def test_prefix_matches_by_reading_as_well_as_surface(dictionary: sqlite3.Connection) -> None:
    # Kana-only queries reach the corpus through `reading`, which is the whole
    # reason the second UNION branch exists.
    assert {row[2] for row in _current(dictionary, "はな", 1)} == {"花", "鼻", "話す"}


def test_the_sentinel_bounds_the_range_without_excluding_real_rows(
    dictionary: sqlite3.Connection,
) -> None:
    """U+FFFF is a noncharacter, so nothing sorts between a prefix and it."""
    dictionary.execute(
        "INSERT INTO dictionary_entries VALUES (?,?,?,?,?,?)",
        (9, "jm9", "見" + chr(0xFFFE), "みぜ", "edge case", 1),
    )
    assert any(row[0] == 9 for row in _current(dictionary, "見", 1))


def test_query_plan_uses_the_per_column_indexes(dictionary: sqlite3.Connection) -> None:
    """The regression guard: an `OR` chain silently reverts to a near-full scan.

    Correctness alone would not catch it — the old query returned the right
    rows, just 68x slower than the app could afford.
    """
    plan = dictionary.execute(
        "EXPLAIN QUERY PLAN " + _DICTIONARY_PREFIX_SQL,
        ["見", "見" + _PREFIX_RANGE_SENTINEL, 1, "見", "見" + _PREFIX_RANGE_SENTINEL, 1, 20],
    ).fetchall()
    detail = " ".join(str(row[3]) for row in plan)

    assert "idx_dictionary_entries_japanese" in detail
    assert "idx_dictionary_entries_reading" in detail
    assert "SCAN dictionary_entries" not in detail, (
        f"prefix search fell back to a table scan: {detail}"
    )
    assert "idx_dictionary_entries_common" not in detail, (
        f"planner chose the two-valued is_common index: {detail}"
    )


@pytest.mark.skipif(_dictionary_db_path() is None, reason="offline dictionary not installed")
def test_search_stays_fast_against_the_real_dictionary() -> None:
    """End-to-end budget check against the 217k-row corpus.

    The bridge is strictly serial with a 30s request timeout, and a vocabulary
    level deck is ~744 cards, so a per-lookup cost above a millisecond or two
    puts the whole section back over the limit.
    """
    import time

    db_path = _dictionary_db_path()
    assert db_path is not None  # guarded by the skipif above
    conn = sqlite3.connect(db_path)
    words = ["見る", "食べる", "学校", "はな", "いく", "会う", "電車", "先生",
             "本", "水", "時間", "友達", "新しい", "行く", "話す", "国"]

    # Warm up outside the measurement. The first call initialises the fugashi
    # tagger, and the first touch of each index page reads it off disk — both
    # are paid once, not once per card. Measuring them would make this assert
    # the machine's cold-cache behaviour rather than the query's cost.
    for word in words:
        _search_dictionary_japanese(conn, word)

    start = time.perf_counter()
    for word in words:
        _search_dictionary_japanese(conn, word)
    per_lookup_ms = (time.perf_counter() - start) / len(words) * 1000

    # The pre-fix query measured ~12ms here. Anything in that region puts a
    # 744-card deck back over the 30s bridge timeout; steady state is ~0.2ms,
    # so this threshold catches a regression without being flaky.
    assert per_lookup_ms < 3.0, f"{per_lookup_ms:.2f}ms per lookup is too slow for a full deck load"
