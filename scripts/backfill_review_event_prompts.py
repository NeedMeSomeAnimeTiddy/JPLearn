from __future__ import annotations

import sqlite3
import sys
import unicodedata
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data import database
from domain.decks import ALL_DECKS
from domain.decks import (
    VOCAB_N1_EXTERNAL_DATA,
    VOCAB_N2_EXTERNAL_DATA,
    VOCAB_N3_EXTERNAL_DATA,
    VOCAB_N4_EXTERNAL_DATA,
    VOCAB_N5_EXTERNAL_DATA,
)


def _normalize_deck_key(value: str) -> str:
    return value.strip().lower().replace("_", " ")


def _normalize_japanese_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip()


def _build_prompt_lookup() -> dict[tuple[str, int], str]:
    lookup: dict[tuple[str, int], str] = {}

    for slug, factory in ALL_DECKS.items():
        deck = factory()
        deck_key = _normalize_deck_key(deck.name)
        slug_key = _normalize_deck_key(slug)
        for card in deck.cards:
            prompt = _normalize_japanese_text(card.character)
            if not prompt:
                continue
            lookup[(deck_key, card.id)] = prompt
            lookup[(slug_key, card.id)] = prompt

    vocab_specs = [
        ("Vocabulary N5", "vocab_n5", 0, VOCAB_N5_EXTERNAL_DATA),
        ("Vocabulary N4", "vocab_n4", 10000, VOCAB_N4_EXTERNAL_DATA),
        ("Vocabulary N3", "vocab_n3", 20000, VOCAB_N3_EXTERNAL_DATA),
        ("Vocabulary N2", "vocab_n2", 30000, VOCAB_N2_EXTERNAL_DATA),
        ("Vocabulary N1", "vocab_n1", 40000, VOCAB_N1_EXTERNAL_DATA),
    ]
    for deck_name, slug, id_offset, rows in vocab_specs:
        deck_key = _normalize_deck_key(deck_name)
        slug_key = _normalize_deck_key(slug)
        for index, row in enumerate(rows):
            prompt = _normalize_japanese_text(row[0])
            if not prompt:
                continue
            card_id = id_offset + index
            lookup[(deck_key, card_id)] = prompt
            lookup[(slug_key, card_id)] = prompt

    return lookup


def _load_missing_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT id, deck, card_id
        FROM review_events
        WHERE TRIM(COALESCE(prompt_text, '')) = ''
        ORDER BY id ASC
        """
    ).fetchall()


def backfill_review_event_prompts() -> tuple[int, int, int]:
    database.init_db()
    lookup = _build_prompt_lookup()

    with database._connect() as conn:  # type: ignore[attr-defined]
        missing_rows = _load_missing_rows(conn)
        attempted = len(missing_rows)
        updates: list[tuple[str, int]] = []

        for row in missing_rows:
            deck_key = _normalize_deck_key(str(row["deck"]))
            card_id = int(row["card_id"])
            prompt = lookup.get((deck_key, card_id))
            if not prompt:
                continue
            updates.append((prompt, int(row["id"])))

        if updates:
            conn.executemany(
                """
                UPDATE review_events
                SET prompt_text = ?
                WHERE id = ?
                """,
                updates,
            )

    return attempted, len(updates), attempted - len(updates)


def main() -> int:
    attempted, updated, unresolved = backfill_review_event_prompts()
    print(
        f"review_events prompt backfill complete: attempted={attempted} updated={updated} unresolved={unresolved}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())