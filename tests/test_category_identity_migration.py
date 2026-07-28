"""The one-shot collapse of category-deck progress onto parent cards (issue #78).

Every test builds a real database through the normal schema path and drives the
migration end to end, because the thing being asserted is what happens to stored
learner progress.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from data import database
from data.category_identity_migration import (
    build_card_remap,
    category_deck_names,
    format_report,
    run_migration,
)
from data.text_normalization import normalize_storage_text
from domain.block_mapping import resolve_category_card_map
from domain.decks import ALL_DECKS, CATEGORY_SOURCE_DECKS

_CATEGORY_SLUG = "vocab_verbs"


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "jplearn.db"
    monkeypatch.setattr(database, "DB_PATH", path)
    database.init_db()
    return path


def _names() -> tuple[str, str]:
    """Return the stored (category, parent) deck names."""
    return (
        normalize_storage_text(CATEGORY_SOURCE_DECKS[_CATEGORY_SLUG]().name),
        normalize_storage_text(ALL_DECKS["vocab_n5"]().name),
    )


def _a_mapped_pair() -> tuple[int, int]:
    """Return a (category card id, parent card id) that really resolves."""
    mapping = resolve_category_card_map(_CATEGORY_SLUG)
    return next(iter(sorted(mapping.items())))


def _insert_review_state(
    path: Path, deck: str, card_id: int, *, repetitions: int, interval: int
) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO review_states (deck, card_id, ease_factor, interval, "
            "repetitions, next_review) VALUES (?,?,?,?,?,?)",
            (deck, card_id, 2.5, interval, repetitions, "2026-01-01"),
        )


def _review_states(path: Path) -> dict[tuple[str, int], tuple[int, int]]:
    with sqlite3.connect(path) as conn:
        return {
            (row[0], row[1]): (row[2], row[3])
            for row in conn.execute(
                "SELECT deck, card_id, repetitions, interval FROM review_states"
            )
        }


class TestRemap:
    def test_deck_names_come_from_the_decks_themselves(self) -> None:
        """Not from literals — a rename must not silently desync the mapping."""
        category_name, parent_name = _names()
        assert category_name in category_deck_names()
        assert parent_name not in category_deck_names()

    def test_the_headline_duplicate_is_remapped(self) -> None:
        """``みる``/1104 in Vocabulary: Verbs is ``見る``/647 in Vocabulary N5."""
        category_name, parent_name = _names()
        assert build_card_remap()[(category_name, 1104)] == (parent_name, 647)

    def test_every_remap_target_is_a_real_parent_card(self) -> None:
        parent_ids = {
            normalize_storage_text(ALL_DECKS[slug]().name): {c.id for c in ALL_DECKS[slug]().cards}
            for slug in ("vocab_n5", "vocab_n4", "vocab_n3", "vocab_n2", "vocab_n1",
                         "kanji_n5", "kanji_n4", "kanji_n3", "kanji_n2", "kanji_n1")
        }
        for (_deck, _card), (target_deck, target_card) in build_card_remap().items():
            assert target_card in parent_ids[target_deck]


class TestMigration:
    def test_a_lone_category_row_is_rekeyed_onto_the_parent(self, db_path: Path) -> None:
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=4, interval=30)

        plan, _backup = run_migration(apply=True, db_path=db_path, backup=False)

        assert plan.rekeyed == 1
        assert plan.merged == 0
        assert _review_states(db_path) == {(parent_name, target_id): (4, 30)}

    def test_a_merge_keeps_the_further_along_row(self, db_path: Path) -> None:
        """The chosen policy: the learner never moves backwards."""
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=9, interval=90)
        _insert_review_state(db_path, parent_name, target_id, repetitions=2, interval=5)

        plan, _backup = run_migration(apply=True, db_path=db_path, backup=False)

        assert plan.merged == 1
        assert plan.superseded == 0
        assert _review_states(db_path) == {(parent_name, target_id): (9, 90)}

    def test_a_merge_leaves_a_further_along_parent_alone(self, db_path: Path) -> None:
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=1, interval=1)
        _insert_review_state(db_path, parent_name, target_id, repetitions=7, interval=60)

        plan, _backup = run_migration(apply=True, db_path=db_path, backup=False)

        assert plan.merged == 1
        assert plan.superseded == 1
        assert _review_states(db_path) == {(parent_name, target_id): (7, 60)}

    def test_interval_only_breaks_a_tie_on_repetitions(self, db_path: Path) -> None:
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=3, interval=45)
        _insert_review_state(db_path, parent_name, target_id, repetitions=3, interval=10)

        run_migration(apply=True, db_path=db_path, backup=False)

        assert _review_states(db_path) == {(parent_name, target_id): (3, 45)}

    def test_an_unresolvable_row_is_reported_and_left_in_place(self, db_path: Path) -> None:
        """The only case the live database actually exercises.

        Its six category rows carry card ids from before the issue-#63 offset
        move, so they resolve to nothing. Deleting them would destroy progress on
        a guess; they stay put and get reported.
        """
        category_name, _parent_name = _names()
        _insert_review_state(db_path, category_name, 999_999, repetitions=5, interval=20)

        plan, _backup = run_migration(apply=True, db_path=db_path, backup=False)

        assert plan.is_empty
        assert [(o.deck, o.card_id) for o in plan.orphans] == [(category_name, 999_999)]
        assert _review_states(db_path) == {(category_name, 999_999): (5, 20)}

    def test_running_twice_changes_nothing_the_second_time(self, db_path: Path) -> None:
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=6, interval=40)
        _insert_review_state(db_path, parent_name, target_id, repetitions=2, interval=4)

        run_migration(apply=True, db_path=db_path, backup=False)
        after_first = _review_states(db_path)

        second, _backup = run_migration(apply=True, db_path=db_path, backup=False)

        assert second.is_empty
        assert _review_states(db_path) == after_first

    def test_a_dry_run_writes_nothing(self, db_path: Path) -> None:
        category_name, _parent_name = _names()
        source_id, _target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=4, interval=30)
        before = _review_states(db_path)

        plan, backup = run_migration(apply=False, db_path=db_path)

        assert plan.moves
        assert backup is None
        assert _review_states(db_path) == before

    def test_mastery_scores_merge_on_the_higher_score(self, db_path: Path) -> None:
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "INSERT INTO card_mastery_scores (deck, card_id, score) VALUES (?,?,?)",
                (category_name, source_id, 4),
            )
            conn.execute(
                "INSERT INTO card_mastery_scores (deck, card_id, score) VALUES (?,?,?)",
                (parent_name, target_id, 1),
            )

        run_migration(apply=True, db_path=db_path, backup=False)

        with sqlite3.connect(db_path) as conn:
            rows = conn.execute("SELECT deck, card_id, score FROM card_mastery_scores").fetchall()
        assert rows == [(parent_name, target_id, 4)]

    def test_review_events_are_left_under_their_original_deck(self, db_path: Path) -> None:
        """History is an append-only record of what happened at the time."""
        category_name, _parent_name = _names()
        source_id, _target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=2, interval=3)
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "INSERT INTO review_events (deck, card_id, quality, reviewed_on) VALUES (?,?,?,?)",
                (category_name, source_id, 4, "2026-01-01"),
            )

        plan, _backup = run_migration(apply=True, db_path=db_path, backup=False)

        assert plan.untouched_rows["review_events"] == 1
        with sqlite3.connect(db_path) as conn:
            decks = [r[0] for r in conn.execute("SELECT deck FROM review_events")]
        assert decks == [category_name]


class TestBackupAndReport:
    def test_apply_takes_a_backup_first(self, db_path: Path) -> None:
        category_name, _parent_name = _names()
        source_id, _target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=4, interval=30)

        _plan, backup = run_migration(apply=True, db_path=db_path)

        assert backup is not None and backup.exists()
        assert "backup-pre-issue78-" in backup.name
        with sqlite3.connect(backup) as conn:
            preserved = conn.execute(
                "SELECT deck, card_id FROM review_states"
            ).fetchall()
        assert preserved == [(category_name, source_id)]

    def test_report_states_the_no_op_case_plainly(self, db_path: Path) -> None:
        plan, _backup = run_migration(apply=False, db_path=db_path)
        assert "Nothing to migrate" in format_report(plan)

    def test_report_counts_every_outcome(self, db_path: Path) -> None:
        category_name, parent_name = _names()
        source_id, target_id = _a_mapped_pair()
        _insert_review_state(db_path, category_name, source_id, repetitions=4, interval=30)
        _insert_review_state(db_path, parent_name, target_id, repetitions=1, interval=1)
        _insert_review_state(db_path, category_name, 999_999, repetitions=2, interval=2)

        plan, _backup = run_migration(apply=False, db_path=db_path)
        report = format_report(plan)

        assert "Rows to move:      1" in report
        assert "Orphans left:      1" in report
        assert "review_states: 1" in report
