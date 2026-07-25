"""Tests for the historical repetitions correction (domain replay + data layer)."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from data import database
from data.repetitions_backfill import plan_backfill, run_backfill
from domain.repetitions_replay import ReplayedReview, recount_repetitions
from domain.scheduler import ReviewState


def _use_temp_db(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "jplearn-test-backfill.db")
    database.init_db()


DAY = date(2026, 3, 1)


class TestRecountRepetitions:
    def test_same_day_drilling_collapses_to_one(self) -> None:
        recount = recount_repetitions([ReplayedReview(DAY, 4) for _ in range(8)])

        assert recount.under_old_rule == 8
        assert recount.under_new_rule == 1
        assert recount.reviews == 8

    def test_distinct_days_count_once_each(self) -> None:
        reviews = [
            ReplayedReview(DAY + timedelta(days=offset), 4)
            for offset in range(3)
            for _ in range(2)  # two answers per day
        ]
        recount = recount_repetitions(reviews)

        assert recount.under_old_rule == 6
        assert recount.under_new_rule == 3

    def test_lapse_resets_both_rules(self) -> None:
        recount = recount_repetitions([
            ReplayedReview(DAY, 4),
            ReplayedReview(DAY + timedelta(days=1), 4),
            ReplayedReview(DAY + timedelta(days=2), 0),
        ])

        assert recount.under_old_rule == 0
        assert recount.under_new_rule == 0

    def test_same_day_recovery_after_lapse_still_counts_once(self) -> None:
        recount = recount_repetitions([
            ReplayedReview(DAY, 4),
            ReplayedReview(DAY, 0),
            ReplayedReview(DAY, 4),
        ])

        assert recount.under_new_rule == 1

    def test_confidence_is_blended_like_the_live_scheduler(self) -> None:
        """quality=4 with confidence=1 blends to 3, which is Hard, not Again."""
        blended = recount_repetitions([ReplayedReview(DAY, 4, confidence=1)])
        assert blended.under_new_rule == 1

        # Low quality with low confidence stays a lapse.
        lapsed = recount_repetitions([ReplayedReview(DAY, 1, confidence=1)])
        assert lapsed.under_new_rule == 0

    def test_empty_log_counts_zero(self) -> None:
        assert recount_repetitions([]).under_new_rule == 0


class TestPlanBackfill:
    def test_corrects_a_row_the_log_explains(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        for _ in range(5):
            database.log_review("Hiragana", 1, 4, reviewed_on=DAY)
        database.save_state("Hiragana", ReviewState(card_id=1, repetitions=5, interval=6))

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_backfill(conn)

        assert len(plan.corrections) == 1
        correction = plan.corrections[0]
        assert (correction.card_id, correction.stored, correction.corrected) == (1, 5, 1)
        assert plan.total_reduction == 4

    def test_leaves_seeded_rows_alone(self, tmp_path: Path, monkeypatch) -> None:
        """A row written without logging reviews (onboarding seeds a mastered
        state) must not be reset from a history that never happened."""
        _use_temp_db(tmp_path, monkeypatch)
        database.save_state("Hiragana", ReviewState(card_id=2, repetitions=4, interval=58))

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_backfill(conn)

        assert plan.corrections == []
        assert plan.skipped_no_events == 1

    def test_leaves_partially_logged_rows_alone(self, tmp_path: Path, monkeypatch) -> None:
        """Seeded and then reviewed: the log accounts for only part of the
        stored total, so the checksum fails and the row is skipped."""
        _use_temp_db(tmp_path, monkeypatch)
        database.log_review("Hiragana", 3, 4, reviewed_on=DAY)
        database.save_state("Hiragana", ReviewState(card_id=3, repetitions=5, interval=58))

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_backfill(conn)

        assert plan.corrections == []
        assert plan.skipped_unexplained == 1

    def test_row_already_matching_is_not_a_correction(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        database.log_review("Hiragana", 4, 4, reviewed_on=DAY)
        database.save_state("Hiragana", ReviewState(card_id=4, repetitions=1, interval=2))

        with database._connect() as conn:  # type: ignore[attr-defined]
            plan = plan_backfill(conn)

        assert plan.corrections == []
        assert plan.already_correct == 1


class TestRunBackfill:
    def test_dry_run_writes_nothing(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        for _ in range(4):
            database.log_review("Hiragana", 5, 4, reviewed_on=DAY)
        database.save_state("Hiragana", ReviewState(card_id=5, repetitions=4, interval=6))

        plan = run_backfill(apply=False)

        assert len(plan.corrections) == 1
        assert database.load_states("Hiragana", [5])[5].repetitions == 4

    def test_apply_writes_and_is_idempotent(self, tmp_path: Path, monkeypatch) -> None:
        _use_temp_db(tmp_path, monkeypatch)
        for _ in range(4):
            database.log_review("Hiragana", 6, 4, reviewed_on=DAY)
        database.save_state("Hiragana", ReviewState(card_id=6, repetitions=4, interval=6))

        run_backfill(apply=True)
        assert database.load_states("Hiragana", [6])[6].repetitions == 1

        # Second pass: the row no longer matches the old-rule checksum, so it is
        # skipped rather than corrected again — and reports as already correct
        # rather than as a row the log cannot explain.
        second = run_backfill(apply=True)
        assert second.corrections == []
        assert second.already_correct == 1
        assert second.skipped_unexplained == 0
        assert database.load_states("Hiragana", [6])[6].repetitions == 1

    def test_db_path_override_targets_that_database_and_restores(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        """The --db override is how this runs against another checkout's data,
        so it must write to the target and leave the module path as it found it."""
        default_db = tmp_path / "default.db"
        target_db = tmp_path / "target.db"

        monkeypatch.setattr(database, "DB_PATH", target_db)
        database.init_db()
        for _ in range(4):
            database.log_review("Hiragana", 9, 4, reviewed_on=DAY)
        database.save_state("Hiragana", ReviewState(card_id=9, repetitions=4, interval=6))

        # Point the module elsewhere; only the explicit db_path should be hit.
        monkeypatch.setattr(database, "DB_PATH", default_db)
        database.init_db()

        plan = run_backfill(apply=True, db_path=target_db)

        assert len(plan.corrections) == 1
        assert database.DB_PATH == default_db, "module path must be restored"

        monkeypatch.setattr(database, "DB_PATH", target_db)
        assert database.load_states("Hiragana", [9])[9].repetitions == 1

        monkeypatch.setattr(database, "DB_PATH", default_db)
        with database._connect() as conn:  # type: ignore[attr-defined]
            untouched = conn.execute("SELECT COUNT(*) n FROM review_states").fetchone()
        assert untouched["n"] == 0, "the default database must not be written"

    def test_other_state_columns_are_untouched(self, tmp_path: Path, monkeypatch) -> None:
        """The correction is repetitions-only; intervals must not move under
        the learner, since replaying FSRS would reschedule every card."""
        _use_temp_db(tmp_path, monkeypatch)
        for _ in range(3):
            database.log_review("Hiragana", 7, 4, reviewed_on=DAY)
        original = ReviewState(
            card_id=7, repetitions=3, interval=58, stability=42.0,
            difficulty=5.5, next_review=DAY + timedelta(days=58), last_review=DAY,
        )
        database.save_state("Hiragana", original)

        run_backfill(apply=True)

        after = database.load_states("Hiragana", [7])[7]
        assert after.repetitions == 1
        assert after.interval == 58
        assert after.stability == 42.0
        assert after.difficulty == 5.5
        assert after.next_review == original.next_review
        assert after.last_review == original.last_review
