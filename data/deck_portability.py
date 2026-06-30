"""Import/export helpers for deck progress portability."""

from __future__ import annotations

import csv
import io
import sqlite3
from datetime import datetime, timezone
from typing import Any

from data import database
from data.text_normalization import normalize_japanese_text, normalize_storage_text

FORMAT_VERSION = 1


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(database.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _normalize_deck_name(value: str) -> str:
    return normalize_storage_text(value)


def _normalize_script_tag(value: str) -> str:
    return normalize_storage_text(value).lower()


def _normalize_row_list(snapshot: dict[str, Any], key: str) -> list[dict[str, Any]]:
    raw = snapshot.get(key, [])
    if not isinstance(raw, list):
        raise ValueError(f"snapshot field '{key}' must be a list")
    rows: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError(f"snapshot field '{key}' must contain objects")
        rows.append(entry)
    return rows


def _event_key(row: sqlite3.Row | dict[str, Any]) -> tuple[Any, ...]:
    return (
        str(row["deck"]),
        int(row["card_id"]),
        int(row["quality"]),
        str(row["reviewed_on"]),
        str(row["reviewed_at_utc"]),
        str(row["script_tag"]),
        None if row["curriculum_stage"] is None else int(row["curriculum_stage"]),
        str(row["prompt_text"]),
        str(row["tags_csv"]),
        str(row["session_id"]),
        None if row["confidence_score"] is None else int(row["confidence_score"]),
    )


def export_progress_snapshot() -> dict[str, Any]:
    """Export persisted progress and custom deck payload placeholders as JSON-ready data."""
    database.init_db()
    exported_at_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with _connect() as conn:
        review_states = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, ease_factor, interval, repetitions, next_review
                FROM review_states
                ORDER BY deck ASC, card_id ASC
                """
            ).fetchall()
        ]
        review_events = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, quality, reviewed_on, reviewed_at_utc,
                       script_tag, curriculum_stage, prompt_text, tags_csv,
                       session_id, confidence_score
                FROM review_events
                ORDER BY id ASC
                """
            ).fetchall()
        ]
        curriculum_stages = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, mode, stage, updated_at_utc
                FROM curriculum_stages
                ORDER BY deck ASC, card_id ASC, mode ASC
                """
            ).fetchall()
        ]
        leech_items = [
            dict(row)
            for row in conn.execute(
                """
                SELECT deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc
                FROM leech_items
                ORDER BY deck ASC, card_id ASC
                """
            ).fetchall()
        ]
        session_goals = [
            dict(row)
            for row in conn.execute(
                """
                SELECT session_id, target_items, target_minutes, target_accuracy, started_at_utc
                FROM session_goals
                ORDER BY session_id ASC
                """
            ).fetchall()
        ]

    return {
        "format_version": FORMAT_VERSION,
        "exported_at_utc": exported_at_utc,
        "progress": {
            "review_states": review_states,
            "review_events": review_events,
            "curriculum_stages": curriculum_stages,
            "leech_items": leech_items,
            "session_goals": session_goals,
        },
        "custom_decks": [],
    }


def import_progress_snapshot(snapshot: dict[str, Any], conflict_mode: str = "merge") -> dict[str, int]:
    """Import progress snapshot with merge or overwrite conflict handling."""
    if conflict_mode not in {"merge", "overwrite"}:
        raise ValueError("conflict_mode must be 'merge' or 'overwrite'")

    if int(snapshot.get("format_version", 0)) != FORMAT_VERSION:
        raise ValueError(
            f"unsupported snapshot format_version {snapshot.get('format_version')}; expected {FORMAT_VERSION}"
        )

    progress = snapshot.get("progress")
    if not isinstance(progress, dict):
        raise ValueError("snapshot field 'progress' must be an object")

    review_states = _normalize_row_list(progress, "review_states")
    review_events = _normalize_row_list(progress, "review_events")
    curriculum_stages = _normalize_row_list(progress, "curriculum_stages")
    leech_items = _normalize_row_list(progress, "leech_items")
    session_goals = _normalize_row_list(progress, "session_goals")
    custom_decks = _normalize_row_list(snapshot, "custom_decks")

    database.init_db()

    imported_events = 0
    with _connect() as conn:
        if conflict_mode == "overwrite":
            conn.execute("DELETE FROM review_events")
            conn.execute("DELETE FROM review_states")
            conn.execute("DELETE FROM leech_items")
            conn.execute("DELETE FROM curriculum_stages")
            conn.execute("DELETE FROM session_goals")

        conn.executemany(
            """
            INSERT INTO review_states (deck, card_id, ease_factor, interval, repetitions, next_review)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id) DO UPDATE SET
                ease_factor=excluded.ease_factor,
                interval=excluded.interval,
                repetitions=excluded.repetitions,
                next_review=excluded.next_review
            """,
            [
                (
                    _normalize_deck_name(str(row["deck"])),
                    int(row["card_id"]),
                    float(row["ease_factor"]),
                    int(row["interval"]),
                    int(row["repetitions"]),
                    normalize_storage_text(str(row["next_review"])),
                )
                for row in review_states
            ],
        )

        conn.executemany(
            """
            INSERT INTO curriculum_stages (deck, card_id, mode, stage, updated_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id, mode) DO UPDATE SET
                stage=excluded.stage,
                updated_at_utc=excluded.updated_at_utc
            """,
            [
                (
                    _normalize_deck_name(str(row["deck"])),
                    int(row["card_id"]),
                    normalize_storage_text(str(row["mode"])).lower(),
                    max(1, min(3, int(row["stage"]))),
                    normalize_storage_text(str(row["updated_at_utc"])),
                )
                for row in curriculum_stages
            ],
        )

        conn.executemany(
            """
            INSERT INTO leech_items (deck, card_id, is_active, attempts_recent, failures_recent, last_evaluated_utc)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(deck, card_id) DO UPDATE SET
                is_active=excluded.is_active,
                attempts_recent=excluded.attempts_recent,
                failures_recent=excluded.failures_recent,
                last_evaluated_utc=excluded.last_evaluated_utc
            """,
            [
                (
                    _normalize_deck_name(str(row["deck"])),
                    int(row["card_id"]),
                    1 if int(row["is_active"]) else 0,
                    int(row["attempts_recent"]),
                    int(row["failures_recent"]),
                    normalize_storage_text(str(row["last_evaluated_utc"])),
                )
                for row in leech_items
            ],
        )

        conn.executemany(
            """
            INSERT INTO session_goals (session_id, target_items, target_minutes, target_accuracy, started_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                target_items=excluded.target_items,
                target_minutes=excluded.target_minutes,
                target_accuracy=excluded.target_accuracy,
                started_at_utc=excluded.started_at_utc
            """,
            [
                (
                    normalize_storage_text(str(row["session_id"])),
                    int(row["target_items"]),
                    None if row["target_minutes"] is None else int(row["target_minutes"]),
                    None if row["target_accuracy"] is None else int(row["target_accuracy"]),
                    normalize_storage_text(str(row["started_at_utc"])),
                )
                for row in session_goals
            ],
        )

        existing_event_keys: set[tuple[Any, ...]] = set()
        if conflict_mode == "merge":
            existing_rows = conn.execute(
                """
                SELECT deck, card_id, quality, reviewed_on, reviewed_at_utc, script_tag,
                       curriculum_stage, prompt_text, tags_csv, session_id, confidence_score
                FROM review_events
                """
            ).fetchall()
            existing_event_keys = {_event_key(row) for row in existing_rows}

        event_params: list[tuple[Any, ...]] = []
        for row in review_events:
            record = {
                "deck": _normalize_deck_name(str(row["deck"])),
                "card_id": int(row["card_id"]),
                "quality": int(row["quality"]),
                "reviewed_on": normalize_storage_text(str(row["reviewed_on"])),
                "reviewed_at_utc": normalize_storage_text(str(row["reviewed_at_utc"])),
                "script_tag": _normalize_script_tag(str(row["script_tag"])),
                "curriculum_stage": None if row["curriculum_stage"] is None else int(row["curriculum_stage"]),
                "prompt_text": normalize_japanese_text(str(row["prompt_text"])),
                "tags_csv": normalize_storage_text(str(row["tags_csv"])),
                "session_id": normalize_storage_text(str(row["session_id"])),
                "confidence_score": None if row["confidence_score"] is None else int(row["confidence_score"]),
            }
            signature = _event_key(record)
            if conflict_mode == "merge" and signature in existing_event_keys:
                continue
            event_params.append(
                (
                    record["deck"],
                    record["card_id"],
                    record["quality"],
                    record["reviewed_on"],
                    record["reviewed_at_utc"],
                    record["script_tag"],
                    record["curriculum_stage"],
                    record["prompt_text"],
                    record["tags_csv"],
                    record["session_id"],
                    record["confidence_score"],
                )
            )
            if conflict_mode == "merge":
                existing_event_keys.add(signature)

        if event_params:
            conn.executemany(
                """
                INSERT INTO review_events (
                    deck, card_id, quality, reviewed_on, reviewed_at_utc,
                    script_tag, curriculum_stage, prompt_text, tags_csv,
                    session_id, confidence_score
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                event_params,
            )
            imported_events = len(event_params)

    return {
        "review_states": len(review_states),
        "review_events": imported_events,
        "curriculum_stages": len(curriculum_stages),
        "leech_items": len(leech_items),
        "session_goals": len(session_goals),
        "custom_decks": len(custom_decks),
    }


# ---------------------------------------------------------------------------
# CSV analytics exports
# ---------------------------------------------------------------------------

def export_review_history_csv() -> str:
    """Return all review events as a CSV string."""
    database.init_db()
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, deck, card_id, quality, confidence_score, reviewed_on,"
            " reviewed_at_utc, session_id, tags_csv"
            " FROM review_events ORDER BY reviewed_at_utc"
        ).fetchall()
    finally:
        conn.close()
    fieldnames = ["id", "deck", "card_id", "quality", "confidence_score",
                  "reviewed_on", "reviewed_at_utc", "session_id", "tags_csv"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))
    return buf.getvalue()


def export_accuracy_trends_csv() -> str:
    """Return per-day accuracy aggregate as a CSV string."""
    database.init_db()
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT reviewed_on AS date,
                   COUNT(*) AS total_reviews,
                   SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct_count,
                   ROUND(100.0 * SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) / COUNT(*), 1)
                       AS accuracy_pct
            FROM review_events
            GROUP BY reviewed_on
            ORDER BY reviewed_on
            """
        ).fetchall()
    finally:
        conn.close()
    fieldnames = ["date", "total_reviews", "correct_count", "accuracy_pct"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))
    return buf.getvalue()


def export_mastery_snapshot_csv() -> str:
    """Return current card mastery state as a CSV string.

    Mastered threshold: repetitions >= 3 and interval >= 21.
    """
    database.init_db()
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT deck, card_id, interval, repetitions, ease_factor, next_review,
                   CASE WHEN repetitions >= 3 AND interval >= 21 THEN 1 ELSE 0 END AS is_mastered
            FROM review_states
            ORDER BY deck, card_id
            """
        ).fetchall()
    finally:
        conn.close()
    fieldnames = ["deck", "card_id", "interval", "repetitions",
                  "ease_factor", "next_review", "is_mastered"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))
    return buf.getvalue()
