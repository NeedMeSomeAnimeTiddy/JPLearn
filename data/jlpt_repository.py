"""Persistence layer for JLPT exam results and per-card accuracy queries."""

from __future__ import annotations

from datetime import datetime, timezone

from data.database import _connect, init_db


def save_jlpt_exam_result(
    level: str,
    mode: str,
    questions_answered: int,
    correct: int,
    accuracy: float,
    projected_score: int | None,
) -> int:
    """Persist a completed exam result. Returns the new row id."""
    init_db()
    completed_at_utc = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO jlpt_exam_results
                (level, mode, questions_answered, correct, accuracy, projected_score, completed_at_utc)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (level, mode, questions_answered, correct, accuracy, projected_score, completed_at_utc),
        )
        return cursor.lastrowid or 0


def load_jlpt_exam_history(
    level: str | None = None,
    mode: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Return recent exam results, newest first."""
    init_db()
    query = "SELECT * FROM jlpt_exam_results"
    params: list[object] = []
    conditions: list[str] = []
    if level is not None:
        conditions.append("level = ?")
        params.append(level)
    if mode is not None:
        conditions.append("mode = ?")
        params.append(mode)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def load_card_accuracy_map(
    deck_names: list[str],
) -> dict[tuple[str, int], float]:
    """Return per-card correct-answer ratios from review_events.

    Only cards with at least one review event are included.
    Keys are (deck, card_id) tuples; values are correct_count / total_count.
    """
    if not deck_names:
        return {}
    init_db()
    placeholders = ",".join("?" * len(deck_names))
    query = f"""
        SELECT deck, card_id,
               SUM(CASE WHEN quality >= 3 THEN 1 ELSE 0 END) AS correct_count,
               COUNT(*)                                        AS total_count
        FROM review_events
        WHERE deck IN ({placeholders})
        GROUP BY deck, card_id
    """
    with _connect() as conn:
        rows = conn.execute(query, deck_names).fetchall()
    return {
        (row["deck"], row["card_id"]): row["correct_count"] / row["total_count"]
        for row in rows
        if row["total_count"] > 0
    }
